/**
 * Distribution PolicyGatePort seam compatibility pin (POLICY-001) — the
 * COMPILE-TIME half.
 *
 * Zero-drift guarantee: the mirrored W6-C seam shape of this package
 * (src/testing/distribution-policy-gate.ts) and the REAL distribution
 * port shape (packages/mos-distribution/src/ports/social-policy-gate.port.ts)
 * are MUTUALLY ASSIGNABLE — pinned here with `null as unknown as X`
 * assertions (no runtime code; any drift in either direction fails
 * `tsc -p tsconfig.compat.json` on every build/test run).
 *
 * Distribution is NOT a registry dependency of policy (registry deps are
 * exactly [contracts, identity]) — the imports below are TYPE-ONLY
 * relative-path references (the W7-B compat precedent: no runtime
 * dependency edge is created; the boundary harness allows relative
 * imports within packages/mos-*). The RUNTIME half
 * (compat/distribution-policy-gate.test.ts) wires this package's REAL
 * gate adapter into the REAL distribution pipeline.
 */

import type {
  SocialPolicyCheckRequest as RealCheckRequest,
  SocialPolicyGatePort as RealGatePort,
  SocialPolicyVerdict as RealVerdict,
} from "../../mos-distribution/src/ports/social-policy-gate.port.js";
import type { SocialOperation as RealOperation } from "../../mos-distribution/src/contracts/social-operation.js";
import type {
  DeclaredSocialPresentation as RealPresentation,
  SOCIAL_OPERATIONS as RealOperationsConst,
  SOCIAL_PRESENTATION_KINDS as RealPresentationKindsConst,
} from "../../mos-distribution/src/contracts/social-operation.js";

import type {
  DistributionPolicyCheckRequest,
  DistributionPolicyGate,
  DistributionPolicyGatePort,
  DistributionPolicyVerdict,
  DistributionSeamOperation,
  DistributionSeamPresentation,
} from "../src/testing/distribution-policy-gate.js";
import type { DISTRIBUTION_SEAM_OPERATIONS, DISTRIBUTION_SEAM_PRESENTATION_KINDS } from "../src/testing/distribution-policy-gate.js";

// ---------------------------------------------------------------------------
// Mutual-assignability assertions (`null as unknown as X` — no runtime code)
// ---------------------------------------------------------------------------

/** The REAL W6-C request satisfies the mirrored request shape. */
export const realRequestSatisfiesMirror: DistributionPolicyCheckRequest =
  null as unknown as RealCheckRequest;
/** The mirrored request satisfies the REAL W6-C request shape. */
export const mirrorRequestSatisfiesReal: RealCheckRequest =
  null as unknown as DistributionPolicyCheckRequest;

/** The REAL W6-C verdict ⇔ the mirrored verdict. */
export const realVerdictSatisfiesMirror: DistributionPolicyVerdict =
  null as unknown as RealVerdict;
export const mirrorVerdictSatisfiesReal: RealVerdict =
  null as unknown as DistributionPolicyVerdict;

/** THIS package's gate adapter satisfies the REAL W6-C port. */
export const gateSatisfiesRealPort: RealGatePort = null as unknown as DistributionPolicyGate;
/** The REAL port's method set satisfies the mirrored port. */
export const realPortSatisfiesMirror: DistributionPolicyGatePort = null as unknown as RealGatePort;

/** The operation vocabularies are the same literals (both directions). */
export const realOperationSatisfiesMirror: DistributionSeamOperation =
  null as unknown as RealOperation;
export const mirrorOperationSatisfiesReal: RealOperation =
  null as unknown as DistributionSeamOperation;

/** The presentation shapes are mutually assignable (both directions). */
export const realPresentationSatisfiesMirror: DistributionSeamPresentation =
  null as unknown as RealPresentation;
export const mirrorPresentationSatisfiesReal: RealPresentation =
  null as unknown as DistributionSeamPresentation;

// ---------------------------------------------------------------------------
// Const-mirror pins (the frozen vocabularies carry the same members)
// ---------------------------------------------------------------------------

/** The mirrored operation const has the REAL const's literal union type. */
export type MirrorOperations = (typeof DISTRIBUTION_SEAM_OPERATIONS)[number];
export type RealOperations = (typeof RealOperationsConst)[number];
export const operationsUnionMatches: RealOperations = null as unknown as MirrorOperations;
export const mirrorOperationsUnionMatches: MirrorOperations = null as unknown as RealOperations;

/** The mirrored presentation-kind const has the REAL const's literal union type. */
export type MirrorPresentationKinds = (typeof DISTRIBUTION_SEAM_PRESENTATION_KINDS)[number];
export type RealPresentationKinds = (typeof RealPresentationKindsConst)[number];
export const presentationKindsUnionMatches: RealPresentationKinds =
  null as unknown as MirrorPresentationKinds;
export const mirrorPresentationKindsUnionMatches: MirrorPresentationKinds =
  null as unknown as RealPresentationKinds;

/**
 * The check-method parameter/return types are mutually assignable — the
 * executable form of "the gate adapter's call shape IS the seam's call
 * shape" (any field drift fails this file's compilation).
 */
export type MirrorCheckParameters = Parameters<DistributionPolicyGatePort["check"]>;
export type RealCheckParameters = Parameters<RealGatePort["check"]>;
export const realCheckParametersSatisfyMirror: MirrorCheckParameters =
  null as unknown as RealCheckParameters;
export const mirrorCheckParametersSatisfyReal: RealCheckParameters =
  null as unknown as MirrorCheckParameters;
export type MirrorCheckReturn = ReturnType<DistributionPolicyGatePort["check"]>;
export type RealCheckReturn = ReturnType<RealGatePort["check"]>;
export const realCheckReturnSatisfiesMirror: MirrorCheckReturn = null as unknown as RealCheckReturn;
export const mirrorCheckReturnSatisfiesReal: RealCheckReturn = null as unknown as MirrorCheckReturn;
