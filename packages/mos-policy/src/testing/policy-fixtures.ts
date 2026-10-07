/**
 * Shared POLICY-001 test fixtures — FICTIONAL tenant/rule DATA.
 *
 * Every identity, tenant and rule id here is fictional test data
 * (tenant-alpha/tenant-beta, policy:alpha-*): no real tenant, authority
 * or rule is implied. Builders are deterministic and self-contained.
 */

import type { IdentityRef, TenantId, TenantScope, Timestamp, Version } from "@mos/contracts";
import assert from "node:assert/strict";

import type { PolicyRuleId } from "../contracts/ids.js";
import type {
  PolicyConstraint,
  RegisterPolicyRuleInput,
} from "../contracts/policy-rule.js";
import type { PolicyEvaluationId } from "../contracts/ids.js";
import type { PolicyVerdict } from "../contracts/policy-evaluation.js";

export const TENANT_ALPHA = "tenant-alpha" as TenantId;
export const TENANT_BETA = "tenant-beta" as TenantId;
export const SCOPE_ALPHA = { tenantId: TENANT_ALPHA } as TenantScope;
export const SCOPE_BETA = { tenantId: TENANT_BETA } as TenantScope;

export const ACTOR_ONE = "identity:actor-one" as IdentityRef;
export const ACTOR_TWO = "identity:actor-two" as IdentityRef;
export const POLICY_ADMIN = "identity:policy-admin" as never;

export const FIXTURE_NOW = "2026-06-01T00:00:00.000Z" as Timestamp;

/** Deterministic fixed clock. */
export const fixedNow = (): string => FIXTURE_NOW;

/** Deterministic sequenced evaluation ids (`policy-evaluation:test-<n>`). */
export function sequencedIds(): () => PolicyEvaluationId {
  let counter = 0;
  return () => {
    counter += 1;
    return `policy-evaluation:test-${counter}` as PolicyEvaluationId;
  };
}

/** A rule id helper (fictional data). */
export function ruleId(value: string): PolicyRuleId {
  return value as PolicyRuleId;
}

/** The standard distribution-scoped registration (overridable). */
export function distributionRule(
  overrides: Partial<RegisterPolicyRuleInput> & { readonly id: PolicyRuleId },
): RegisterPolicyRuleInput {
  return {
    scope: SCOPE_ALPHA,
    declaredScope: { actionKinds: ["distribution"], subjectRefs: [], actorRefs: [] },
    constraints: [],
    effect: "allow",
    rationale: "fixture distribution rule",
    createdByAuthority: "tenant-admin",
    createdBy: POLICY_ADMIN,
    ...overrides,
  };
}

/** A production-request-approval rule scoped to a specific request subject. */
export function productionApprovalRule(
  id: PolicyRuleId,
  subjectRef: string,
  constraints: readonly PolicyConstraint[] = [],
): RegisterPolicyRuleInput {
  return {
    id,
    scope: SCOPE_ALPHA,
    declaredScope: {
      actionKinds: ["production-request-approval"],
      subjectRefs: [subjectRef],
      actorRefs: [],
    },
    constraints,
    effect: "allow",
    rationale: `fixture approval rule for ${subjectRef}`,
    createdByAuthority: "mission-authority",
    createdBy: POLICY_ADMIN,
  };
}

/** A version ref helper. */
export function ref(id: PolicyRuleId, version: number): { id: PolicyRuleId; version: Version } {
  return { id, version: version as Version };
}

/** ISO-8601 literal → Timestamp brand (test data). */
export function ts(value: string): Timestamp {
  return value as Timestamp;
}

/**
 * Test helper: asserts the verdict's outcome and narrows it to that
 * variant (so variant fields are accessible without casts).
 */
export function expectVerdict<K extends PolicyVerdict["outcome"]>(
  verdict: PolicyVerdict,
  outcome: K,
): Extract<PolicyVerdict, { outcome: K }> {
  if (verdict.outcome !== outcome) {
    assert.fail(`expected verdict outcome "${outcome}", got "${verdict.outcome}"`);
  }
  return verdict as Extract<PolicyVerdict, { outcome: K }>;
}
