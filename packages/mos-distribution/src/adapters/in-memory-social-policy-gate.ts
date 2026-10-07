/**
 * In-memory SocialPolicyGate adapter (SOCIAL-001 — the DISCLOSED DOUBLE
 * of the declared policy-gate seam).
 *
 * TL TOPOLOGY DECISION (documented in MOS2-WAVE5-HARVEST): the policy
 * package does not exist yet, so this adapter is the DISCLOSED stand-in
 * at the testing/composition seams only — it is NOT a policy authority
 * and makes NO production policy claim. The seam's CONTRACT SHAPE IS
 * FROZEN in ports/social-policy-gate.port.ts; the future policy
 * authority (@mos/policy) implements the port and this double is retired.
 *
 * What is doubled: the policy evaluation itself. Rules are REGISTERED
 * DATA (permitted/denied verdicts with optional operation/actor/subject
 * filters and the canonical PolicyRef they cite) — no policy rule is
 * authored in code, exactly like the rights-gate double doubles only the
 * handle resolution.
 *
 * FAIL-CLOSED (test-pinned): a request matching NO registered rule is
 * DENIED with reason `no-matching-policy` — there is no permissive
 * default; permission must come from an explicit registered rule (the
 * explicit-grants discipline of the rights cascade, mirrored).
 */

import type { PolicyRef, TenantScope } from "@mos/contracts";

import type { SocialOperation } from "../contracts/social-operation.js";
import type {
  SocialPolicyCheckRequest,
  SocialPolicyGatePort,
  SocialPolicyVerdict,
} from "../ports/social-policy-gate.port.js";
import type { IdentityRef } from "@mos/contracts";

/** One registered policy rule of the double (DATA — a disclosed stand-in verdict). */
export interface InMemoryPolicyRule {
  /** The canonical policy ref the rule cites (data — the authority mints real ones later). */
  readonly policyRef: PolicyRef;
  /** Tenant the rule belongs to (rules never cross tenants — §31). */
  readonly scope: TenantScope;
  /** Restricts the rule to one operation (optional — any when omitted). */
  readonly operation?: SocialOperation;
  /** Restricts the rule to one actor (optional — any when omitted). */
  readonly actor?: IdentityRef;
  /** Restricts the rule to one subject reference (optional — any when omitted). */
  readonly subjectRef?: string;
  /** The verdict the rule carries. */
  readonly decision: "permitted" | "denied";
  /** Denial reason surfaced verbatim when the rule denies. */
  readonly denialReason?: string;
}

/** Options for the in-memory policy gate double. */
export interface InMemorySocialPolicyGateOptions {
  /** Rules the double starts with (data; more can be registered). */
  readonly rules?: readonly InMemoryPolicyRule[];
}

/** The in-memory policy gate: the SocialPolicyGatePort double + seeding. */
export interface InMemorySocialPolicyGate extends SocialPolicyGatePort {
  /** Registers one policy rule into the double (the composition seam's seeding path). */
  registerPolicyRule(rule: InMemoryPolicyRule): void;
}

function matches(rule: InMemoryPolicyRule, request: SocialPolicyCheckRequest): boolean {
  if ((rule.scope.tenantId as string) !== (request.scope.tenantId as string)) {
    return false;
  }
  if (rule.operation !== undefined && rule.operation !== request.operation) {
    return false;
  }
  if (rule.actor !== undefined && (rule.actor as string) !== (request.actor as string)) {
    return false;
  }
  if (rule.subjectRef !== undefined && rule.subjectRef !== request.subjectRef) {
    return false;
  }
  return true;
}

/**
 * Creates the in-memory {@link SocialPolicyGatePort} double.
 */
export function createInMemorySocialPolicyGate(
  options: InMemorySocialPolicyGateOptions = {},
): InMemorySocialPolicyGate {
  const rules: InMemoryPolicyRule[] = [...(options.rules ?? [])];

  return {
    registerPolicyRule(rule: InMemoryPolicyRule): void {
      rules.push(rule);
    },

    check(request: SocialPolicyCheckRequest): SocialPolicyVerdict {
      // First matching rule wins (registration order — deterministic).
      for (const rule of rules) {
        if (matches(rule, request)) {
          if (rule.decision === "permitted") {
            return { decision: "permitted", denialReason: null, policyRef: rule.policyRef };
          }
          return {
            decision: "denied",
            denialReason: rule.denialReason ?? "policy-rule-denied",
            policyRef: rule.policyRef,
          };
        }
      }
      // FAIL-CLOSED: no matching rule is a denial, NEVER a permissive
      // default (the explicit-grants discipline mirrored for policy).
      return {
        decision: "denied",
        denialReason: "no-matching-policy",
        policyRef: null,
      };
    },
  };
}
