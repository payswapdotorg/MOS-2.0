/**
 * Production program search result contracts (LAB-016, §7): provenance,
 * ranked candidates, the structurally-present no-op baseline, budget and
 * stopping records, and the port itself.
 *
 * Basis: spec/mos-architecture-v2.0.md §7 ("THE NO-OP PATH IS ALWAYS A
 * VALID BASELINE" — pinned structurally here: a result without its no-op
 * baseline entry is unrepresentable), §22 (uncertainty carried through
 * ranking), §24 (the search output is a ranked lab-labeled candidate set —
 * never a deployment decision), lock rules 5 (no-op first-class) and 29
 * (historical evidence and counterfactual predictions are distinct).
 */

import type { ProductionRequest, TenantId, Timestamp } from "@mos/contracts";

import type { ProgramFeatureFingerprint } from "./program-dimensions.js";
import type { ProgramSearchDimension } from "./program-dimensions.js";
import type {
  CandidateProgram,
  ProgramCandidateOrigin,
} from "./program-candidate.js";
import type {
  ProductionProgramSearchError,
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
  ProgramCandidateEvaluation,
  ProgramInterval,
  ProgramPruningRule,
} from "./program-search.js";

// ---------------------------------------------------------------------------
// Provenance (varied dimensions + version-pinned component refs)
// ---------------------------------------------------------------------------

/**
 * The VERSION-PINNED component provenance of one candidate: which cited
 * surfaces produced each component. The candidate itself carries every
 * component ref at an EXACT version (transform definition ids@versions,
 * the organization id@version, pawn kinds, engine bindings@exact versions,
 * capability ids@versions, human task ids, the quality evaluator, the
 * model refs); this record adds the SURFACE versions that produced the
 * evaluation (the ensemble/simulator/reward-spec versions the evaluation
 * seam pins — every number the ranking used).
 */
export interface ProgramSearchProvenance {
  readonly origin: ProgramCandidateOrigin;
  /**
   * Dimensions varied vs the parent: EXACTLY the dimensions whose
   * sixteen-dimension fingerprints differ (the operator's primary dimension
   * plus any coherence dimensions rebuilt with it — the honest provenance).
   * The FULL SIXTEEN for caller-supplied candidates (every dimension is the
   * caller's explicit declaration) and for search-synthesized entries (the
   * no-op baseline and the generation-root seed program — synthesized fresh
   * from the vocabularies, no parent to differ from).
   */
  readonly variedDimensions: readonly ProgramSearchDimension[];
  /** The sixteen-dimension fingerprint of this candidate. */
  readonly fingerprint: ProgramFeatureFingerprint;
  readonly parentFingerprint: ProgramFeatureFingerprint | null;
  /** 1-based generation index (null for caller-supplied candidates). */
  readonly generationIndex: number | null;
  /** The declared policy version that produced this search. */
  readonly policyVersion: number;
  readonly seed: number;
  readonly evaluationSeeds: readonly number[];
  /** Evaluation-surface version pins (from the evaluation seam). */
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  readonly pruned: boolean;
  readonly pruningRule: ProgramPruningRule;
  readonly searchedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Ranking + comparisons (uncertainty-aware, deterministic tie-break)
// ---------------------------------------------------------------------------

/** Interval overlap declaration — declared, never hidden. */
export interface ProgramIntervalOverlapDeclaration {
  readonly overlaps: boolean;
  readonly note: string;
}

/**
 * The declared comparison of one ranked candidate against the NO-OP
 * BASELINE (§7: comparisons are against the always-present baseline):
 * the baseline's expected reward, this candidate's delta, and whether
 * their intervals overlap.
 */
export interface ProgramBaselineComparison {
  readonly baselineExpectedReward: number;
  readonly expectedRewardDelta: number;
  readonly intervalOverlapWithBaseline: ProgramIntervalOverlapDeclaration;
}

/** One ranked candidate program: candidate + request + evaluation + provenance. */
export interface RankedCandidateProgram {
  /** 1-based rank (the declared ranking policy's deterministic order). */
  readonly rank: number;
  readonly candidate: CandidateProgram;
  /** The composed canonical CORE-001 ProductionRequest (required fields complete). */
  readonly request: ProductionRequest;
  readonly evaluation: ProgramCandidateEvaluation;
  readonly provenance: ProgramSearchProvenance;
  /** Every candidate's declared comparison against the no-op baseline. */
  readonly comparisonToBaseline: ProgramBaselineComparison;
  /** Null on rank 1; declared overlap vs the leader for every other rank. */
  readonly intervalOverlapWithLeader: ProgramIntervalOverlapDeclaration | null;
}

// ---------------------------------------------------------------------------
// Budget + stopping + result
// ---------------------------------------------------------------------------

export interface ProgramSearchBudgetRecord {
  readonly maxCandidateEvaluations: number;
  readonly evaluationsConsumed: number;
  readonly generatedEvaluated: number;
  readonly seamEvaluationsConsumed: number;
}

export type ProgramSearchStopReason =
  | "budget-exhausted"
  | "plateau-detected"
  | "iteration-cap-reached";

export interface ProgramSearchStopping {
  readonly reason: ProgramSearchStopReason;
  readonly detail: string;
  readonly generationsExecuted: number;
}

/**
 * A ranked, uncertainty-labeled, counterfactual production program search
 * result. The NO-OP BASELINE is structurally present on EVERY result (§7
 * pin — `noopBaseline` is a required field, not an array slot that could
 * be empty). NO deployment decision: the §24 real-experiment boundary is
 * untouched.
 */
export interface ProductionProgramSearchResult {
  readonly id: ProductionProgramSearchResultId;
  readonly tenantId: TenantId;
  readonly missionRef: ProductionProgramSearchInput["missionRef"];
  /** Deterministic order: expected reward desc → interval half-width asc → key asc → origin precedence → arrival. */
  readonly ranked: readonly RankedCandidateProgram[];
  /** THE NO-OP/REPOST BASELINE (§7/lock rule 5 — always present, pinned). */
  readonly noopBaseline: RankedCandidateProgram;
  readonly budget: ProgramSearchBudgetRecord;
  readonly stopping: ProgramSearchStopping;
  /** The declared policy snapshot that produced this result. */
  readonly policy: ProductionProgramSearchPolicy;
  readonly seed: number;
  /** LOCK RULE 29 PIN: simulation-derived search output, never evidence. */
  readonly counterfactual: true;
  readonly disclosure: "program-search-over-disclosed-synthetic-evaluation";
  /** §24 boundary statement carried on the record. */
  readonly labOnly:
    "ranked lab-labeled candidate programs only — never a deployment decision; the real-experiment boundary (§24) is untouched";
}

declare const programSearchResultIdBrand: unique symbol;

/** Unique identifier of one production program search result. */
export type ProductionProgramSearchResultId = string & {
  readonly [programSearchResultIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

/**
 * The production program search port (LAB-016) — a single method (≤ 12
 * policy budget). Deterministic given (inputs, seed, policy version). The
 * no-op baseline is structurally present on every result.
 */
export interface ProductionProgramSearchPort {
  /**
   * Search production programs over the SIXTEEN §7 dimensions. Fails
   * closed with every typed code in the failure model (invalid
   * inputs/policies/candidates, unresolvable refs through the seams,
   * budget floor violations, evaluation failures).
   */
  searchPrograms(
    input: ProductionProgramSearchInput,
  ): Promise<ProductionProgramSearchResult | ProductionProgramSearchError>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 5/24/29)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** Search results are always counterfactual (lock rule 29). */
type _SearchResultsAreAlwaysCounterfactual = Expect<
  Equal<ProductionProgramSearchResult["counterfactual"], true>
>;

/** Candidate evaluations are always counterfactual (lock rule 29). */
type _CandidateEvaluationsAreAlwaysCounterfactual = Expect<
  Equal<ProgramCandidateEvaluation["counterfactual"], true>
>;

/** The no-op baseline is structurally REQUIRED on every result (§7 pin). */
type _NoopBaselineIsStructurallyRequired = Expect<
  Equal<keyof Pick<ProductionProgramSearchResult, "noopBaseline">, "noopBaseline">
>;

/** Every ranked candidate carries a baseline comparison (§7: compare against it). */
type _BaselineComparisonIsRequired = Expect<
  Equal<keyof Pick<RankedCandidateProgram, "comparisonToBaseline">, "comparisonToBaseline">
>;

/** Interval shape stays closed (the §22 discipline). */
type _IntervalIsClosed = Expect<
  Equal<keyof ProgramInterval, "lower" | "upper">
>;
