/**
 * Output treatment contracts for the MOS Content Studio.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Basis: spec/mos-architecture-v2.0.md §19 (Studio output evaluation):
 * - every treatment creates a NEW immutable linked artifact/output version —
 *   predecessors are never mutated in place;
 * - a QUALITY rejection is DISTINCT from a Rights/Policy rejection.
 *
 * Also §17 (raw human output returns through the organization as an
 * intermediate artifact — treatment never bypasses the loaded
 * organization), §6 (lineage immutability), architecture-lock #23 (Lab may
 * accept/reject/treat/retry/substitute/abandon Studio outputs).
 *
 * Backlog: Lab→Studio treatment loop and STUDIO-013 implement against these
 * types (Wave 2/3).
 */

import type { RightsPolicyViolationRef, StudioSessionId, Timestamp } from "./refs.js";
import type { StudioArtifactRef } from "./studio-artifact-package.js";

/** Who issued a review/treatment decision. */
export type StudioDecisionActor =
  | { readonly kind: "lab"; readonly labCandidateRef: string }
  | { readonly kind: "standalone-user"; readonly identityRef: string }
  | { readonly kind: "studio-operator"; readonly identityRef: string };

/**
 * Review outcomes the Studio must distinguish (§19 Lab actions + standalone
 * user decisions). Quality and rights/policy rejections are SEPARATE kinds —
 * they have different remedies and different audit semantics.
 */
export type StudioOutputReviewOutcome =
  | "accept"
  | "accept-alternate"
  | "reject-quality"
  | "reject-strategy"
  | "reject-rights-policy"
  | "request-treatment"
  | "require-human-action"
  | "switch-organization"
  | "switch-transform"
  | "switch-engine"
  | "abandon";

/**
 * A QUALITY rejection: the output failed acceptance/evaluation criteria.
 * Remedy path: treatment, retry, substitution or scope reduction — NOT a
 * rights problem.
 */
export interface QualityRejection {
  readonly kind: "quality-rejection";
  /** Acceptance/evaluation criteria that failed. */
  readonly failedCriteria: readonly string[];
  readonly notes?: string;
}

/**
 * A RIGHTS/POLICY rejection: the output (or its inputs/derivation) violated
 * rights or policy. Distinct from quality: remedy requires rights
 * resolution or policy change; treatment of the same bytes is not a remedy.
 */
export interface RightsPolicyRejection {
  readonly kind: "rights-policy-rejection";
  /** Violation records (rights circumvention, prohibited strategy, missing consent...). */
  readonly violations: readonly RightsPolicyViolationRef[];
  readonly notes?: string;
}

/** The two rejection kinds — never conflated (§19). */
export type StudioRejection = QualityRejection | RightsPolicyRejection;

/** A recorded review decision over a session's output candidate. */
export interface StudioOutputReview {
  readonly sessionId: StudioSessionId;
  readonly targetArtifact: StudioArtifactRef;
  readonly outcome: StudioOutputReviewOutcome;
  /** Structured rejection detail — present only for the three rejection outcomes. */
  readonly rejection?: StudioRejection;
  readonly decidedBy: StudioDecisionActor;
  readonly decidedAt: Timestamp;
}

/** Kinds of treatment that can be requested on an output version. */
export type TreatmentKind =
  | "edit"
  | "trim"
  | "adjust-composition"
  | "regenerate-segment"
  | "re-render"
  | "re-transcribe"
  | "re-caption";

/** A request to treat an existing output version. */
export interface OutputTreatmentRequest {
  readonly sessionId: StudioSessionId;
  /** The immutable version being treated (never modified in place). */
  readonly targetArtifact: StudioArtifactRef;
  readonly treatment: TreatmentKind;
  /** Treatment parameters reference (kept out-of-line; no media over control RPC). */
  readonly parametersRef?: string;
  readonly requestedBy: StudioDecisionActor;
  readonly requestedAt: Timestamp;
  /** Review that motivated the treatment, when one exists. */
  readonly motivatingReview?: StudioOutputReview;
}

/**
 * Result of applying a treatment. INVARIANT (§19): every treatment creates
 * NEW immutable artifact versions; each successor's `parentArtifactRefs`
 * MUST include the treated version, and the treated version itself remains
 * resolvable forever (historical reproducibility).
 */
export interface OutputTreatmentResult {
  readonly request: OutputTreatmentRequest;
  /** Newly created artifact versions (stage `intermediate` or `final`). */
  readonly successorArtifacts: readonly StudioArtifactRef[];
  /** The exact versions that were treated (predecessors — unmodified). */
  readonly predecessorArtifacts: readonly StudioArtifactRef[];
  readonly completedAt: Timestamp;
}

/** Terminal outcome of a treatment attempt. */
export type OutputTreatmentOutcome =
  | { readonly ok: true; readonly result: OutputTreatmentResult }
  | {
      readonly ok: false;
      /** Rights/policy rejections are distinct from execution failures. */
      readonly failure:
        | { readonly kind: "execution-failure"; readonly reason: string }
        | { readonly kind: "rights-policy-rejection"; readonly rejection: RightsPolicyRejection };
    };

/**
 * Treatment port consumed by the Studio runtime (types only). Treatments run
 * through the loaded organization — they are production-program executions,
 * not ad-hoc file edits (§16/§17: production variables belong to the
 * organization, not Studio hard-codes).
 */
export interface StudioOutputTreatmentPort {
  applyTreatment(request: OutputTreatmentRequest): Promise<OutputTreatmentOutcome>;
}
