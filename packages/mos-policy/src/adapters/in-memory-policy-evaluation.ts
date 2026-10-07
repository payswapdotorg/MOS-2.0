/**
 * In-memory PolicyEvaluationPort adapter (POLICY-001 — DISCLOSED DOUBLE).
 *
 * Working adapter (not a skeleton): fail-closed request validation,
 * EXACT-VERSION resolution of every cited policy ref against the wired
 * registry (unknown / cross-tenant ≡ unknown → typed caller error, NO
 * audit record — the W6-A caller-error discipline), the pure
 * deterministic evaluation engine, and the immutable append-only
 * evaluation audit log with §30-style fields. Tenant-scoped reads with
 * no existence leaks. OWNERSHIP: the stored record references ONLY
 * cloned data (scope/action/policy refs cloned up front) — the caller's
 * request objects are never frozen in place or mutated (the W4-B
 * clone-then-freeze discipline).
 *
 * DISCLOSED LIMIT: ephemeral process-local audit log (no durability
 * claim); durable persistence is TL-owned later work behind the same
 * port.
 */

import type { TenantScope, Timestamp } from "@mos/contracts";

import { PolicyError } from "../errors.js";
import type { PolicyEvaluationId } from "../contracts/ids.js";
import type {
  PolicyEvaluationRecord,
  PolicyEvaluationRecordFilter,
  PolicyEvaluationRequest,
  PolicyRuleVersionRef,
} from "../contracts/policy-evaluation.js";
import type { PolicyRule } from "../contracts/policy-rule.js";
import type { PolicyRegistryPort } from "../ports/policy-registry.port.js";
import type { PolicyEvaluationPort } from "../ports/policy-evaluation.port.js";
import { validatePolicyEvaluationRequest } from "../domain/policy-validation.js";
import { computePolicyEvaluation } from "../domain/policy-evaluation-engine.js";
import { deepFreeze, defaultNow, freezeClone } from "./adapter-support.js";

/** Options for the in-memory policy evaluation adapter. */
export interface InMemoryPolicyEvaluationOptions {
  /** The rule registry the cited refs resolve against (exact versions). */
  readonly registry: PolicyRegistryPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Injectable §30 request-id factory (deterministic tests). */
  readonly nextId?: () => PolicyEvaluationId;
}

/** Creates the in-memory {@link PolicyEvaluationPort} adapter. */
export function createInMemoryPolicyEvaluation(
  options: InMemoryPolicyEvaluationOptions,
): PolicyEvaluationPort {
  const now = options.now ?? defaultNow;
  const nextId =
    options.nextId ?? (() => `policy-evaluation:${crypto.randomUUID()}` as PolicyEvaluationId);

  /** tenantKey → append-only evaluation records (insertion order). */
  const log = new Map<string, PolicyEvaluationRecord[]>();

  function records(tenantId: string): PolicyEvaluationRecord[] {
    let entries = log.get(tenantId);
    if (entries === undefined) {
      entries = [];
      log.set(tenantId, entries);
    }
    return entries;
  }

  /** Resolves every cited ref at its EXACT version (caller errors → typed, no record). */
  function resolveRules(request: PolicyEvaluationRequest): readonly PolicyRule[] {
    return request.policy.map((ref: PolicyRuleVersionRef) => {
      const rule = options.registry.getRule(request.scope, ref.id, ref.version);
      if (rule === null) {
        throw new PolicyError(
          "unknown-policy-rule",
          `cited policy rule ${ref.id}@v${ref.version} cannot be resolved in the request's tenant (unknown id/version, or another tenant's rule — §31 no-existence-leaks)`,
          { ruleId: ref.id, version: ref.version },
        );
      }
      return rule;
    });
  }

  const evaluation: PolicyEvaluationPort = {
    evaluate(request: PolicyEvaluationRequest): PolicyEvaluationRecord {
      validatePolicyEvaluationRequest(request);
      const requestedAt = now();

      // OWNERSHIP (the W4-B clone-then-freeze discipline): the stored
      // record references ONLY cloned data. The caller's `scope`,
      // `action` (deeply), and `policy` ref objects are cloned up front,
      // so deep-freezing the record can never freeze the caller's input
      // objects in place — and later caller-side mutation can never
      // corrupt the audit log.
      const action: PolicyEvaluationRecord["action"] = structuredClone(request.action);
      const policy: PolicyEvaluationRecord["policy"] = request.policy.map((ref) => ({
        ...ref,
      }));
      const clonedRequest: PolicyEvaluationRequest = {
        scope: { ...request.scope },
        actor: request.actor,
        policy,
        action,
      };

      const rules = resolveRules(request);
      const { consultations, verdict } = computePolicyEvaluation(clonedRequest, rules, requestedAt);
      const evaluatedAt = now();

      const record: PolicyEvaluationRecord = deepFreeze({
        id: nextId(),
        scope: clonedRequest.scope,
        actor: clonedRequest.actor,
        requestedAt: requestedAt as Timestamp,
        action: clonedRequest.action,
        policy: clonedRequest.policy,
        consultations,
        verdict,
        evaluatedAt: evaluatedAt as Timestamp,
        durationMs: Math.max(0, Date.parse(evaluatedAt) - Date.parse(requestedAt)),
      });

      records(request.scope.tenantId as string).push(record);
      return freezeClone(record);
    },

    getEvaluationRecord(scope: TenantScope, id: PolicyEvaluationId): PolicyEvaluationRecord | null {
      const entry = records(scope.tenantId as string).find((record) => record.id === id);
      return entry === undefined ? null : freezeClone(entry);
    },

    listEvaluationRecords(
      scope: TenantScope,
      filter?: PolicyEvaluationRecordFilter,
    ): readonly PolicyEvaluationRecord[] {
      const key = scope.tenantId as string;
      const entries = log.get(key);
      if (entries === undefined) {
        return [];
      }
      let out = [...entries];
      if (filter?.actionKind !== undefined) {
        out = out.filter((record) => record.action.actionKind === filter.actionKind);
      }
      if (filter?.subjectRef !== undefined) {
        out = out.filter((record) => record.action.subjectRef === filter.subjectRef);
      }
      if (filter?.actor !== undefined) {
        out = out.filter((record) => record.actor === filter.actor);
      }
      if (filter?.ruleId !== undefined) {
        out = out.filter((record) =>
          record.policy.some((ref) => ref.id === filter.ruleId),
        );
      }
      if (filter?.limit !== undefined) {
        out = out.slice(0, Math.max(0, filter.limit));
      }
      return deepFreeze(out);
    },
  };

  return evaluation;
}
