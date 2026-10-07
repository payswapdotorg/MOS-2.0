/**
 * The candidate program composition (LAB-016, §7) — every one of the
 * SIXTEEN search dimensions as an explicit typed field. No silent defaults:
 * a candidate program that cannot express a dimension is rejected.
 *
 * Basis: spec/mos-architecture-v2.0.md §7 (the sixteen candidate
 * dimensions; the no-op path is ALWAYS a valid baseline), §5 (the thirteen
 * frozen transform kinds), §9 (the ten transform pawn kinds — a pawn may
 * invoke deterministic engines and need not be an LLM; deterministic pawns
 * NEVER bind a model), §17 (human production tasks), §18 (the Expected
 * Value of Delay is a first-class production strategy variable), §21
 * (human/engine acquisition cost are reward dimensions), lock rules 5
 * (no-op/repost first-class) and 9 (model selection remains behind the
 * single model-runtime boundary — model assignments here are DATA refs,
 * declared, never resolved).
 *
 * The lab-side surfaces feed the dimensions through DECLARED PORT SEAMS
 * (the W7-B pattern — the frozen module registry does not make `lab`,
 * `agents`, `agent-runtime` or `engines` production dependencies):
 * transform chain from the LAB-011/012 promoted-transform vocabulary
 * (transform-catalog seam), organization from LAB-010-style descriptors
 * (organization-source seam), pawn agents from this package's own ten §9
 * pawn bodies, human participation as LAB-014 task refs (BY REFERENCE
 * ONLY), engine portfolio from the registry vocabulary (exact versions),
 * and the delay expectations carried from the LAB-015 analysis (provenance
 * required — never invented).
 */

import type {
  AcceptableSubstitution,
  Budget,
  DelayPolicy,
  EvaluatorRef,
  HumanProductionTaskId,
  JsonObject,
  StudioFormatId,
  TransformGraphRef,
  TenantId,
  Timestamp,
  TransformId,
  Version,
} from "@mos/contracts";

import type { PawnEngineToolBinding, TransformPawnKind } from "./pawn-role.js";
import type { CapabilityRequirement, ModelRef } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Dimension 3 + 4: transform chain + transform parameters
// ---------------------------------------------------------------------------

/**
 * One step of the candidate's transform chain: a promoted transform
 * definition pinned to an EXACT version (never a silent latest) plus its
 * declared parameterization. The NO-OP BASELINE's chain is EMPTY — a pure
 * repost applies no transforms (§7/lock rule 5).
 */
export interface ProgramTransformStep {
  readonly definitionId: TransformId;
  readonly definitionVersion: Version;
  /**
   * The declared parameter preset key (dimension 4) — a key into the
   * search policy's preset vocabulary.
   */
  readonly parameterPreset: string;
  /** The declared parameterization payload (carried verbatim). */
  readonly parameters: JsonObject;
}

// ---------------------------------------------------------------------------
// Dimension 5: production modality
// ---------------------------------------------------------------------------

/**
 * How the candidate program is actuated (§7 production modality):
 * - `automated` — pawn engines only, no Studio session, no human tasks;
 * - `studio` — the Content Studio actuates the request (studioFormat);
 * - `human-arena` — human production tasks actuate it (§17);
 * - `hybrid` — Studio + automated + human contributions combined.
 */
export type ProgramProductionModality =
  | "automated"
  | "studio"
  | "human-arena"
  | "hybrid";

// ---------------------------------------------------------------------------
// Dimension 6: organization (LAB-010-style descriptor, by citation)
// ---------------------------------------------------------------------------

/**
 * The organization citation of one candidate: which LAB-010-style
 * organization descriptor produces the program, pinned to an EXACT version.
 * The NO-OP baseline carries NO producing organization (`null` — the
 * composed request cites the frozen synthesized no-op organization ref).
 */
export interface ProgramOrganizationCitation {
  readonly organizationId: string;
  readonly organizationVersion: Version;
}

// ---------------------------------------------------------------------------
// Dimension 8: model assignment (single-boundary vocabulary, DATA only)
// ---------------------------------------------------------------------------

/**
 * One declared model assignment: the model an LLM-FLAVORED pawn kind will
 * bind at execution time. This is DATA on the candidate (lock rule 9 —
 * model selection remains behind THE single model-runtime boundary; this
 * package never resolves it). A DETERMINISTIC pawn kind here is a typed
 * rejection (`model-assignment-for-deterministic-pawn`).
 */
export interface ProgramModelAssignment {
  readonly pawnKind: TransformPawnKind;
  readonly modelRef: ModelRef;
}

// ---------------------------------------------------------------------------
// Dimension 11: capability acquisition (§21 human/engine acquisition)
// ---------------------------------------------------------------------------

/**
 * How one required capability is acquired (§21: human/engine acquisition
 * cost are reward dimensions):
 * - `existing` — the registered capability is used as-is (no acquisition);
 * - `engine` — acquired through an engine binding (engine acquisition
 *   cost; a matching engine-portfolio entry is REQUIRED);
 * - `human` — acquired through human production (human acquisition cost;
 *   at least one human task is REQUIRED).
 */
export type ProgramAcquisitionMode = "existing" | "engine" | "human";

/** One capability requirement plus its declared acquisition mode. */
export interface ProgramCapabilityAcquisition {
  readonly requirement: CapabilityRequirement;
  readonly mode: ProgramAcquisitionMode;
}

// ---------------------------------------------------------------------------
// Dimension 12: quality thresholds
// ---------------------------------------------------------------------------

/**
 * The program's declared quality thresholds: the minimum quality score its
 * outputs must meet (the acceptance-criteria floor) and the evaluator that
 * measures it (ref only — evaluation is not this surface's business).
 */
export interface ProgramQualityThresholds {
  /** Minimum acceptable quality score, in [0, 1]. */
  readonly floor: number;
  readonly evaluatorRef: EvaluatorRef;
}

// ---------------------------------------------------------------------------
// Dimension 15: expected value of delay (the §2 first-class variable)
// ---------------------------------------------------------------------------

/**
 * Where a candidate's declared delay expectations come from — estimates
 * are never invented (the W7-A LAB-015 discipline carried into program
 * search): either an explicit declared assumption, or a citation of the
 * LAB-015 delay decision analysis the composition root carried in.
 */
export type ProgramDelayExpectationProvenance =
  | { readonly kind: "declared-assumption"; readonly note: string }
  | {
      readonly kind: "delay-analysis";
      readonly analysisId: string;
      readonly analysisVersion: number;
    };

/**
 * The declared §18 delay terms of one candidate — the EV-of-delay inputs
 * (LAB-015 carried as a first-class dimension; the EV itself is computed
 * by the evaluation seam under its declared versioned formula):
 * expected incremental value of waiting, estimated wait, total delay cost
 * over the wait, acquisition cost, success probability, and the signed
 * quality impact (CARRIED, never monetized).
 */
export interface ProgramDelayTerms {
  /** Expected incremental value of waiting (reward-spec-denominated). */
  readonly expectedIncrementalValue: number;
  /** Estimated wait duration in milliseconds. */
  readonly estimatedWaitMs: number;
  /** Total delay cost over the estimated wait (same denomination). */
  readonly delayCost: number;
  /** Acquisition cost of the acquisition path (same denomination). */
  readonly acquisitionCost: number;
  /** Probability the waited-for dependency resolves successfully, [0, 1]. */
  readonly successProbability: number;
  /** Signed quality impact — carried on the record, never monetized. */
  readonly qualityImpact: number;
}

/** The declared delay expectations: the §18 terms + their provenance. */
export interface ProgramDelayExpectation extends ProgramDelayTerms {
  readonly provenance: ProgramDelayExpectationProvenance;
}

// ---------------------------------------------------------------------------
// Dimension 16: stopping/substitution policy
// ---------------------------------------------------------------------------

/**
 * The program's own stopping/substitution policy (§2
 * accept/treat/retry/substitute/abandon; §18 escape options): the retry
 * budget per failed step and the ordered substitution preference over the
 * FROZEN `AcceptableSubstitution` vocabulary. Carried on the candidate —
 * the canonical `ProductionRequest` has no field for it (documented
 * canonical-drop, the W6-A/W7-A precedent).
 */
export interface ProgramStoppingSubstitutionPolicy {
  /** Retry budget per failed step (>= 0). */
  readonly maxRetries: number;
  /** Ordered substitution preference (non-empty, no duplicates). */
  readonly substitutionPreference: readonly AcceptableSubstitution[];
}

// ---------------------------------------------------------------------------
// The candidate program (all sixteen dimensions explicit)
// ---------------------------------------------------------------------------

/** Where a searched candidate program came from. */
export type ProgramCandidateOrigin =
  | "no-op-baseline"
  | "hand-designed"
  | "generated";

/**
 * One candidate program: the SIXTEEN §7 dimensions as explicit data.
 * Dimension 1 (source/reference) is GIVEN by the search input (every
 * candidate composes the same source artifacts onto its request); the
 * other fifteen are declared here. The NO-OP BASELINE
 * (`isNoopBaseline: true`) is ALWAYS synthesized by the search itself —
 * a caller-supplied candidate may never claim it (typed rejection).
 */
export interface CandidateProgram {
  /** Dimension 2: the no-op/repost state (true only for the synthesized baseline). */
  readonly isNoopBaseline: boolean;
  /** Dimension 3: the transform chain (EMPTY for the no-op repost). */
  readonly transformChain: readonly ProgramTransformStep[];
  /** Dimension 5: production modality. */
  readonly modality: ProgramProductionModality;
  /** Dimension 5: the studio format the composed request cites. */
  readonly studioFormat: StudioFormatId;
  /** Dimension 6: the producing organization citation (null on the no-op). */
  readonly organization: ProgramOrganizationCitation | null;
  /** Dimension 7: the pawn agents staffing the program (the ten §9 kinds). */
  readonly pawnAgents: readonly TransformPawnKind[];
  /** Dimension 8: model assignments — LLM-flavored pawns ONLY, DATA refs. */
  readonly modelAssignments: readonly ProgramModelAssignment[];
  /** Dimension 9: the engine portfolio (registry vocabulary, exact versions). */
  readonly enginePortfolio: readonly PawnEngineToolBinding[];
  /** Dimension 10: human participation (LAB-014 task refs, by reference). */
  readonly humanTasks: readonly HumanProductionTaskId[];
  /**
   * Dimension 11: the capability acquisition plan — must cover EXACTLY the
   * chain's capability requirements (resolved through the catalog seam).
   */
  readonly capabilityAcquisition: readonly ProgramCapabilityAcquisition[];
  /** Dimension 12: quality thresholds. */
  readonly qualityThresholds: ProgramQualityThresholds;
  /** Dimension 13: cost (the program budget). */
  readonly budget: Budget;
  /** Dimension 14: latency — the deadline and the declared expected duration. */
  readonly deadline: Timestamp;
  readonly expectedDurationMs: number;
  /** Dimension 15: the delay posture (maxWaitMs + on-delay-exceeded action). */
  readonly delayPolicy: DelayPolicy;
  /** Dimension 15: the declared delay expectations (EV inputs, provenance-cited). */
  readonly delayExpectation: ProgramDelayExpectation;
  /** Dimension 16: stopping/substitution policy. */
  readonly stoppingPolicy: ProgramStoppingSubstitutionPolicy;
}

// ---------------------------------------------------------------------------
// The frozen synthesized no-op citation refs (disclosed composition refs)
// ---------------------------------------------------------------------------

/**
 * The synthesized no-op citation refs the composed no-op baseline request
 * carries (§7: the no-op path is always a valid baseline). These are
 * DECLARED SYNTHETIC refs — the composition root rebinds them when a real
 * execution is requested (the W5-A TransformGraphRef→lab-graph binding
 * follow-up); the search output itself is a ranked candidate set, never an
 * execution.
 */
export const NO_OP_PROGRAM_REFS = Object.freeze({
  /** The empty (repost) transform graph citation. */
  transformGraphRef: "program-graph:no-op-repost" as TransformGraphRef,
  /** The no producing organization citation (pure repost). */
  organizationRef: "organization:program-no-op-repost",
  /** The repost "format" citation (the source artifacts unchanged). */
  studioFormat: "studio-format:no-op-repost" as StudioFormatId,
} as const);

/** Tenant id carried on every search result record (§31 discipline). */
export type { TenantId };
export type { ModelRef };
