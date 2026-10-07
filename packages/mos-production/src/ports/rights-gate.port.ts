/**
 * Rights gate seam (LAB-013) — the rights evaluation that PRECEDES every
 * pawn execution.
 *
 * The frozen module registry makes `rights` a production dependency: rights
 * are evaluated by the REAL `@mos/rights` rule (`evaluateRights` — §27:
 * rights are evaluated ONLY from explicit grant records; there is no second
 * rights authority — the evaluation rule is INJECTED, never re-implemented
 * here). This package imports @mos/rights TYPE-ONLY; the composition seam
 * injects the real rule (testing/compose-pawn-stack.ts wires the REAL
 * `evaluateRights` via the relative dist path, W5-C/W6-C precedent).
 *
 * The verdict vocabulary is @mos/rights' own: denial reasons surface
 * VERBATIM (`no-explicit-grant`, `subject-not-covered`,
 * `grantee-not-covered`, `action-not-covered`, `grant-revoked`,
 * `grant-expired`) and are recorded on the execution record. The frozen
 * operation mapping for executing a transform application is the
 * `transform` action over the input artifact subjects.
 */

import type { TenantScope } from "@mos/contracts";
import type { RightsAction, RightsDenialReason } from "@mos/rights";

/** One rights evaluation requested before a pawn execution. */
export interface PawnRightsCheckRequest {
  /** Tenant scope of the execution (the evaluation is tenant-scoped). */
  readonly scope: TenantScope;
  /** §30 actor — the rights GRANTEE (only grants naming THIS principal count). */
  readonly grantee: string;
  /** The rights subjects: one per input artifact (artifact ids). */
  readonly subjectRefs: readonly string[];
  /** The @mos/rights action the execution exercises (frozen: `transform`). */
  readonly action: RightsAction;
}

/** The fail-closed verdict of one pawn rights check. */
export interface PawnRightsGateVerdict {
  readonly allowed: boolean;
  /** The verbatim denial reason of the first denied subject, or `null`. */
  readonly denialReason: RightsDenialReason | null;
  /** The explicit grant that authorized the execution, or `null`. */
  readonly grantRef: string | null;
  /** Number of subjects evaluated (one per input artifact). */
  readonly subjectsEvaluated: number;
}

/** The rights-gate seam. One public method. */
export interface PawnRightsGatePort {
  /**
   * Evaluates one pawn rights request — FAIL CLOSED: every subject must be
   * covered by an active explicit grant for the grantee; the first verbatim
   * denial reason is cited on a denial.
   */
  check(request: PawnRightsCheckRequest): PawnRightsGateVerdict;
}
