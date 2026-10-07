/**
 * PolicyRegistryPort (POLICY-001) — the policy-rule registry.
 *
 * The standard MOS registry discipline (mirroring the W5-A
 * TransformDefinitionRegistry and the W6-A human-task store):
 * - TENANT-SCOPED: rules never cross tenants (§31). Cross-tenant reads
 *   are indistinguishable from unknown ids — NO EXISTENCE LEAKS (a
 *   getRule for another tenant's rule returns `null`, exactly like an
 *   unknown id; list methods return empty).
 * - APPEND-ONLY VERSIONING with SEPARATE register/revise paths:
 *   `register` with a NEW in-tenant id mints v1 and FAILS CLOSED with
 *   `duplicate-policy-rule` when the id already exists (an accidental
 *   re-registration must never silently append a version); `revise`
 *   appends v+1 to a KNOWN in-tenant id and FAILS CLOSED with
 *   `policy-rule-not-found` when the id does not resolve in the tenant
 *   (unknown ≡ cross-tenant, §31). Prior versions stay BIT-FOR-BIT
 *   immutable and resolvable (getRule pins exact versions; supersession
 *   is recorded on the NEW version's provenance only — the prior record
 *   is never touched).
 * - The stored record is DEEP-FROZEN; caller input is cloned before
 *   freezing (ownership discipline — the caller's input object is never
 *   frozen in place or mutated).
 *
 * Method budget: 5 (≤ 12).
 */

import type { TenantScope, Version } from "@mos/contracts";

import type { PolicyRuleId } from "../contracts/ids.js";
import type { RegisterPolicyRuleInput, PolicyRule } from "../contracts/policy-rule.js";
import type { PolicyRuleListFilter } from "../contracts/policy-evaluation.js";

/** The policy-rule registry port. 5 public methods (budget: 12). */
export interface PolicyRegistryPort {
  /**
   * Registers one policy rule — mints version 1. The input is validated
   * fail-closed (closed vocabularies, structured constraints, non-blank
   * rationale, approverRole iff require-approval); FAILS CLOSED with
   * `duplicate-policy-rule` when the id already exists in this tenant
   * scope (revising an existing rule is the explicit `revise` path). The
   * returned record is immutable and deep-frozen, and the caller's input
   * object is never mutated or frozen in place.
   */
  register(input: RegisterPolicyRuleInput): PolicyRule;

  /**
   * Revises one policy rule — APPENDS the next version (v+1) with the
   * full declaration re-validated fail-closed; the prior version stays
   * bit-for-bit immutable and resolvable, and the new version's
   * provenance records the supersession. FAILS CLOSED with
   * `policy-rule-not-found` when the id does not resolve in this tenant
   * scope (unknown and cross-tenant are indistinguishable — §31).
   */
  revise(input: RegisterPolicyRuleInput): PolicyRule;

  /**
   * Gets ONE rule at an EXACT version. Returns `null` when the id, the
   * version or the tenant does not match — cross-tenant reads are
   * indistinguishable from unknown (no existence leaks).
   */
  getRule(scope: TenantScope, id: PolicyRuleId, version: Version): PolicyRule | null;

  /**
   * Lists the LATEST version of every rule in the tenant's registry,
   * optionally narrowed by declared scope (which action kind / subject
   * the rules govern), in REGISTRATION ORDER. Cross-tenant/unknown
   * scopes list empty (no existence leaks).
   */
  listLatestRules(scope: TenantScope, filter?: PolicyRuleListFilter): readonly PolicyRule[];

  /**
   * Lists the FULL version history of one rule (ascending v1..vN) — the
   * append-only chain, every version bit-for-bit as registered. Unknown
   * id or cross-tenant scope lists empty (no existence leaks).
   */
  listRuleVersions(scope: TenantScope, id: PolicyRuleId): readonly PolicyRule[];
}
