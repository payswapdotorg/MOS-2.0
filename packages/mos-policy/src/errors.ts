/**
 * Typed errors of the policy authority (POLICY-001).
 *
 * CALLER-ERROR DISCIPLINE (the W6-A registry precedent): malformed
 * registration/evaluation inputs and unresolvable exact-version citations
 * are CALLER errors thrown at the boundary — they append NO audit record
 * (nothing attributable happened). Production-action failures, by
 * contrast, are recorded verdicts (denied / insufficient-policy), never
 * exceptions.
 */

/** Closed error-code vocabulary of the policy authority. */
export type PolicyErrorCode =
  /** Registration input failed fail-closed validation. */
  | "invalid-policy-rule"
  /** Evaluation request failed fail-closed validation. */
  | "invalid-evaluation-request"
  /**
   * An evaluation cites a policy rule (exact version) that cannot be
   * resolved IN THE REQUEST'S TENANT — unknown version, unknown id or
   * cross-tenant (§31: no existence leaks, cross-tenant ≡ unknown).
   */
  | "unknown-policy-rule"
  /**
   * `register` was called with an id that ALREADY EXISTS in this tenant
   * scope — registration mints v1 only; revising an existing rule is the
   * EXPLICIT `revise` path (the W5-A `duplicate-definition` discipline:
   * an accidental re-registration must never silently append a version).
   */
  | "duplicate-policy-rule"
  /**
   * `revise` was called with an id that does not resolve in this tenant
   * scope — unknown or cross-tenant (§31: cross-tenant ≡ unknown, no
   * existence leaks; the message never reveals another tenant's rule).
   */
  | "policy-rule-not-found";

/** Typed error thrown by the policy authority's in-memory adapters. */
export class PolicyError extends Error {
  readonly code: PolicyErrorCode;
  /** Structured details (field names, allowed vocabularies — audit). */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: PolicyErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.name = "PolicyError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
