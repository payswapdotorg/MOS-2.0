/**
 * In-memory PolicyRegistryPort adapter (POLICY-001 — DISCLOSED DOUBLE).
 *
 * Working adapter (not a skeleton): fail-closed registration validation,
 * immutable deep-frozen versioned records keyed per (tenant, id),
 * APPEND-ONLY versioning with SEPARATE register/revise paths (register
 * mints v1 and fails `duplicate-policy-rule` on a known in-tenant id;
 * revise appends v+1 and fails `policy-rule-not-found` on an id that
 * does not resolve in the tenant — the W5-A/W6-A registry discipline;
 * prior versions stay bit-for-bit and resolvable), and
 * tenant-scoped reads where cross-tenant ≡ unknown (no existence leaks).
 * Ownership: caller input is cloned then frozen — never mutated, never
 * frozen in place (including the caller's `scope` object — the W4-B
 * clone-then-freeze discipline).
 *
 * DISCLOSED LIMIT: ephemeral process-local scaffold (no durability
 * claim); durable persistence is TL-owned later work behind the same
 * port.
 */

import type { TenantScope, Timestamp, Version } from "@mos/contracts";

import { PolicyError } from "../errors.js";
import type { PolicyRuleId } from "../contracts/ids.js";
import type { PolicyRule, RegisterPolicyRuleInput } from "../contracts/policy-rule.js";
import type { PolicyRuleListFilter } from "../contracts/policy-evaluation.js";
import type { PolicyRegistryPort } from "../ports/policy-registry.port.js";
import { validateRegisterPolicyRuleInput } from "../domain/policy-validation.js";
import { deepFreeze, defaultNow, freezeClone } from "./adapter-support.js";

/** Options for the in-memory policy registry. */
export interface InMemoryPolicyRegistryOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

/** Creates the in-memory {@link PolicyRegistryPort} adapter. */
export function createInMemoryPolicyRegistry(
  options: InMemoryPolicyRegistryOptions = {},
): PolicyRegistryPort {
  const now = options.now ?? defaultNow;

  /** tenantKey → ruleId → version → frozen rule. */
  const byTenant = new Map<string, Map<string, Map<number, PolicyRule>>>();
  /** tenantKey → insertion-ordered rule ids. */
  const order = new Map<string, PolicyRuleId[]>();

  /**
   * Appends the next version of one validated rule declaration (shared
   * by register → v1 and revise → v+1). The stored record references ONLY
   * cloned/fresh data — the caller's `scope` object is cloned (never
   * frozen in place) and the validated declaredScope/constraints are the
   * fresh objects the validator built.
   */
  function appendVersion(
    tenantId: string,
    validated: ReturnType<typeof validateRegisterPolicyRuleInput>,
    supersedes: { readonly id: PolicyRuleId; readonly version: Version } | null,
  ): PolicyRule {
    const rules = layer(tenantId);
    const existing = rules.get(validated.id as string);
    const version = (existing === undefined ? 0 : Math.max(...existing.keys())) + 1;

    const record: PolicyRule = deepFreeze({
      id: validated.id,
      version: version as Version,
      scope: freezeClone(validated.scope),
      declaredScope: validated.declaredScope,
      constraints: validated.constraints,
      effect: validated.effect,
      approverRole: validated.approverRole,
      rationale: validated.rationale,
      provenance: {
        createdByAuthority: validated.createdByAuthority,
        createdBy: validated.createdBy,
        registeredAt: now() as Timestamp,
        supersedes,
      },
    });

    const versions = existing ?? new Map<number, PolicyRule>();
    versions.set(version, record);
    rules.set(validated.id as string, versions);
    const ids = registrationOrder(tenantId);
    if (!ids.some((id) => (id as string) === (validated.id as string))) {
      ids.push(validated.id);
    }
    return freezeClone(record);
  }

  function layer(tenantId: string): Map<string, Map<number, PolicyRule>> {
    let rules = byTenant.get(tenantId);
    if (rules === undefined) {
      rules = new Map<string, Map<number, PolicyRule>>();
      byTenant.set(tenantId, rules);
    }
    return rules;
  }

  function registrationOrder(tenantId: string): PolicyRuleId[] {
    let ids = order.get(tenantId);
    if (ids === undefined) {
      ids = [];
      order.set(tenantId, ids);
    }
    return ids;
  }

  const registry: PolicyRegistryPort = {
    register(input: RegisterPolicyRuleInput): PolicyRule {
      const validated = validateRegisterPolicyRuleInput(input);
      const key = validated.scope.tenantId as string;
      const rules = layer(key);
      if (rules.has(validated.id as string)) {
        throw new PolicyError(
          "duplicate-policy-rule",
          `a rule with id ${validated.id} already exists in this tenant scope — registration mints v1 only; use revise to append the next version`,
          { ruleId: validated.id },
        );
      }
      return appendVersion(key, validated, null);
    },

    revise(input: RegisterPolicyRuleInput): PolicyRule {
      const validated = validateRegisterPolicyRuleInput(input);
      const key = validated.scope.tenantId as string;
      const rules = layer(key);
      const existing = rules.get(validated.id as string);
      if (existing === undefined) {
        // Unknown ≡ cross-tenant (§31): the message never reveals
        // whether the id exists in another tenant.
        throw new PolicyError(
          "policy-rule-not-found",
          `rule ${validated.id} cannot be resolved in this tenant scope — revise appends to a known in-tenant rule only`,
          { ruleId: validated.id },
        );
      }
      const priorVersion = Math.max(...existing.keys()) as Version;
      return appendVersion(
        key,
        validated,
        deepFreeze({ id: validated.id, version: priorVersion }),
      );
    },

    getRule(scope: TenantScope, id: PolicyRuleId, version: Version): PolicyRule | null {
      const versions = byTenant.get(scope.tenantId as string)?.get(id as string);
      const record = versions?.get(version as number);
      return record === undefined ? null : freezeClone(record);
    },

    listLatestRules(scope: TenantScope, filter?: PolicyRuleListFilter): readonly PolicyRule[] {
      const key = scope.tenantId as string;
      const rules = byTenant.get(key);
      const ids = order.get(key);
      if (rules === undefined || ids === undefined) {
        return [];
      }
      const out: PolicyRule[] = [];
      for (const id of ids) {
        const versions = rules.get(id as string);
        if (versions === undefined) {
          continue;
        }
        const latestVersion = Math.max(...versions.keys());
        const record = versions.get(latestVersion);
        if (record === undefined) {
          continue;
        }
        if (filter?.actionKind !== undefined) {
          if (!record.declaredScope.actionKinds.includes(filter.actionKind)) {
            continue;
          }
        }
        if (filter?.subjectRef !== undefined) {
          if (
            record.declaredScope.subjectRefs.length > 0 &&
            !record.declaredScope.subjectRefs.includes(filter.subjectRef)
          ) {
            continue;
          }
        }
        out.push(record);
      }
      return deepFreeze(out);
    },

    listRuleVersions(scope: TenantScope, id: PolicyRuleId): readonly PolicyRule[] {
      const versions = byTenant.get(scope.tenantId as string)?.get(id as string);
      if (versions === undefined) {
        return [];
      }
      const out = [...versions.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, record]) => record);
      return deepFreeze(out);
    },
  };

  return registry;
}
