/**
 * SocialRightsGate port (SOCIAL-001) — the rights-gate seam of the
 * distribution call surface.
 *
 * RIGHTS/POLICY GATES PRECEDE PROVIDER CALLS (backlog acceptance,
 * test-pinned): the adapter runtime consults this gate BEFORE any
 * transport invocation. The gate resolves the presented
 * {@link RightsContextRef} and evaluates the request against the REAL
 * `evaluateRights` rule of @mos/rights (§27: rights are evaluated ONLY
 * from explicit grant records; there is no second rights authority — the
 * evaluation rule is INJECTED, never re-implemented here).
 *
 * The verdict vocabulary is @mos/rights' own: denial reasons surface
 * VERBATIM (`no-explicit-grant`, `subject-not-covered`,
 * `grantee-not-covered`, `action-not-covered`, `grant-revoked`,
 * `grant-expired`), extended with the seam's own
 * `rights-context-unresolved` for handles the gate cannot resolve
 * (unknown and foreign-tenant handles are INDISTINGUISHABLE — §31 no
 * existence leaks; both fail closed, never pass through).
 */

import type { IdentityRef, RightsRef, TenantScope } from "@mos/contracts";
import type { RightsAction, RightsDenialReason } from "@mos/rights";
import type { RightsContextRef } from "@mos/integrations";

/** One rights evaluation the adapter runtime requests before a provider call. */
export interface SocialRightsCheckRequest {
  /** Tenant scope of the operation (the rights evaluation is tenant-scoped). */
  readonly scope: TenantScope;
  /** The rights frame handle the caller presented. */
  readonly rightsContextRef: RightsContextRef;
  /** §30 actor — the rights GRANTEE (only grants naming THIS principal count). */
  readonly grantee: IdentityRef;
  /** The @mos/rights action the operation exercises (frozen operation mapping). */
  readonly action: RightsAction;
  /** The derived rights subject (artifact or channel — documented derivations). */
  readonly subjectRef: string;
}

/**
 * Why a social rights check was denied — the @mos/rights denial reasons
 * VERBATIM plus the seam's own unresolved-handle reason.
 */
export type SocialRightsDenialReason = RightsDenialReason | "rights-context-unresolved";

/** The fail-closed verdict of one social rights check. */
export interface SocialRightsGateVerdict {
  readonly allowed: boolean;
  /** The verbatim denial reason, or `null` when allowed. */
  readonly denialReason: SocialRightsDenialReason | null;
  /** The explicit grant that authorized the operation, or `null` when denied. */
  readonly grantRef: RightsRef | null;
}

/** The rights-gate seam. 1 public method (policy budget: 12). */
export interface SocialRightsGatePort {
  /**
   * Evaluates one social rights request — FAIL CLOSED: an unresolvable
   * rights context handle (including one registered in ANOTHER tenant)
   * is a denial, never a pass-through.
   */
  check(request: SocialRightsCheckRequest): SocialRightsGateVerdict;
}
