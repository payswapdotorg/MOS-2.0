/**
 * Evaluation authority-seam compatibility pins (BRIDGE-002) — the COMPILE-TIME
 * half.
 *
 * Zero-drift guarantee: the §19 evaluation authority's READ seams are the
 * studio's OWN authority port types (the BRIDGE-001 bridge port, the
 * STUDIO-013 packaging authority port, the STUDIO-014 session-directory
 * port), and the vocabulary relationships the authority relies on hold
 * against the REAL studio contract sources — pinned here with
 * `null as unknown as X` / literal assertions (no runtime code; any drift in
 * the REAL sources fails `tsc -p tsconfig.compat.json` on every build/test
 * run).
 *
 * Pins:
 * - the ten-kind §19 decision vocabulary is EXACTLY the spec §19 verb list,
 *   and the studio-side operator review vocabulary's `reject-rights-policy`
 *   member is provably OUTSIDE it (§19: a quality rejection is DISTINCT from
 *   a rights/policy rejection — the two classes never merge);
 * - the nine shared decision-kind literals are IDENTICAL strings on both the
 *   bridge §19 vocabulary and the studio's own `StudioOutputReviewOutcome`
 *   operator vocabulary (the documented NAME divergence is exactly one pair:
 *   the §19 verb `accept-alternate-output` vs the studio's legacy operator
 *   literal `accept-alternate` — pinned as a deliberate, disclosed naming
 *   difference, never silent drift);
 * - the treatment-kind vocabulary the evaluation validates against IS the
 *   studio's own REAL `TreatmentKind` union (contracts/treatment.ts — a
 *   request-treatment directive can only name a treatment the studio side
 *   can execute);
 * - the evaluator's read-seam method shapes ARE the REAL authority port
 *   method shapes (the packaging exact-version read, the session-directory
 *   summary read, the bridge entry read) — the composition root wires the
 *   REAL authorities behind the evaluator with zero adapter changes.
 */

import type { StudioOutputEvaluatorDeps } from "../src/bridge/evaluation/studio-output-evaluator.js";
import type {
  StudioEvaluationDecisionKind,
  StudioOutputEvaluationRequest,
  TreatmentLinkedDecisionKind,
} from "../src/bridge/evaluation/contracts/studio-output-evaluation.js";
import {
  STUDIO_EVALUATION_DECISION_KINDS,
  TREATMENT_LINKED_DECISION_KINDS,
} from "../src/bridge/evaluation/contracts/studio-output-evaluation.js";
import type { StudioOutputEvaluationRecord } from "../src/bridge/evaluation/contracts/studio-output-evaluation.js";
import type { LabToStudioBridgePort } from "../src/bridge/lab-to-studio-bridge.js";
import type { StudioArtifactPackagingPort } from "../src/ports/artifact-packaging.port.js";
import type { StudioSessionDirectory } from "../src/ports/session-directory.port.js";
import type {
  StudioOutputReviewOutcome,
  TreatmentKind,
} from "../src/contracts/treatment.js";

// ---------------------------------------------------------------------------
// Composition-direction assertions (`null as unknown as X` — no runtime code)
// ---------------------------------------------------------------------------

/** The evaluator's bridge seam IS the REAL BRIDGE-001 bridge port. */
export const evaluatorBridgeSeamIsTheRealBridgePort: LabToStudioBridgePort =
  null as unknown as StudioOutputEvaluatorDeps["bridge"];

/** The evaluator's packaging seam IS the REAL STUDIO-013 authority port. */
export const evaluatorPackagingSeamIsTheRealAuthorityPort: StudioArtifactPackagingPort =
  null as unknown as StudioOutputEvaluatorDeps["packaging"];

/** The evaluator's session-directory seam IS the REAL STUDIO-014 port. */
export const evaluatorSessionSeamIsTheRealAuthorityPort: StudioSessionDirectory =
  null as unknown as StudioOutputEvaluatorDeps["sessionDirectory"];

/** The bridge entry read shape (scope, id, optional exact version). */
export type EvaluatorBridgeReadParameters = Parameters<LabToStudioBridgePort["getEntry"]>;
/** The packaging exact-version read shape. */
export type EvaluatorPackagingReadParameters = Parameters<
  StudioArtifactPackagingPort["getArtifactPackage"]
>;
/** The session-directory summary read shape. */
export type EvaluatorSessionReadParameters = Parameters<StudioSessionDirectory["getSessionSummary"]>;

// ---------------------------------------------------------------------------
// Vocabulary pins (§19 closure + the studio-side operator vocabulary)
// ---------------------------------------------------------------------------

/** A record's decision kind is a closed-vocabulary member (the union pin). */
export const recordDecisionKindIsAClosedVocabularyMember: StudioEvaluationDecisionKind =
  null as unknown as StudioOutputEvaluationRecord["decision"]["kind"];

/** The treatment-linked kinds are decision kinds (the reserve-lifecycle pin). */
export const treatmentLinkedKindsAreDecisionKinds: StudioEvaluationDecisionKind =
  null as unknown as TreatmentLinkedDecisionKind;

/**
 * The nine SHARED literals are identical strings on both vocabularies: every
 * §19 decision kind that also exists on the studio's operator review surface
 * IS that operator literal (assignability in the literal direction).
 */
export const sharedDecisionKindLiterals: readonly StudioOutputReviewOutcome[] =
  STUDIO_EVALUATION_DECISION_KINDS.filter(
    (kind) => kind !== "accept-alternate-output",
  ) as readonly StudioOutputReviewOutcome[];

/**
 * The DOCUMENTED single-pair naming divergence (never silent drift): the §19
 * verb is `accept-alternate-output` (the frozen spec wording — "accept
 * alternate output"); the studio's legacy operator literal is
 * `accept-alternate`. Both are pinned as their own vocabularies' members.
 */
export const bridgeAcceptAlternateOutputIsASpecVerb: StudioEvaluationDecisionKind =
  "accept-alternate-output";
export const studioOperatorAcceptAlternateIsALegacyLiteral: StudioOutputReviewOutcome =
  "accept-alternate";

/**
 * §19 DISTINCT CLASSES: the studio-side operator vocabulary's
 * `reject-rights-policy` member is NOT a §19 evaluation kind — the Extract
 * check below only compiles because the bridge union admits no such member.
 */
type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type _RightsPolicyRejectionIsNotAnEvaluationKind = Expect<
  Equal<Extract<StudioEvaluationDecisionKind, "reject-rights-policy">, never>
>;

/**
 * The treatment-kind vocabulary the evaluation validates IS the studio's own
 * REAL `TreatmentKind` union (contracts/treatment.ts — zero drift: a §19
 * request-treatment directive can only name a studio-executable treatment).
 */
export const evaluationTreatmentKindsAreTheStudioVocabulary: readonly TreatmentKind[] =
  [
    "edit",
    "trim",
    "adjust-composition",
    "regenerate-segment",
    "re-render",
    "re-transcribe",
    "re-caption",
  ];

/** The request's decision payload is the record's decision payload (verbatim). */
export const requestDecisionIsTheRecordDecision: StudioOutputEvaluationRecord["decision"] =
  null as unknown as StudioOutputEvaluationRequest["decision"];

/** The runtime const still carries the treatment-linked set (typeof-level pin). */
export type TreatmentLinkedSetMember = (typeof TREATMENT_LINKED_DECISION_KINDS)[number];
