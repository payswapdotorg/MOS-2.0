import type {
  LabScenario,
  ModelRef,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
} from '@mos/contracts';
import type { HistoricalObservation, PredictionInterval } from './evidence.js';
import type { CalibrationPlaceholder, WorldModelEnsembleId } from './ensemble.js';
import type { LabRewardSpec } from './reward.js';
import type {
  OrganizationCandidateOrigin,
  OrganizationFeatureFingerprint,
  OrganizationSearchDimension,
  SearchedOrganizationCandidate,
} from './organization-features.js';

/**
 * Agent Organization Search contracts (LAB-010, architecture §23).
 *
 * THE COMPARISON MANDATE (lock rule 33, test-pinned): every search result
 * set includes ALL THREE — the generalist single-agent baseline, the
 * caller-supplied hand-designed organization, and search-generated
 * organizations. The input REQUIRES baseline + hand-designed structurally,
 * validates the baseline is single-agent fail-closed, and the result
 * structurally requires all three ({@link OrganizationSearchComparison});
 * a search that cannot produce at least one generated candidate under its
 * declared budget fails closed (`budget-below-mandated-floor` /
 * `comparison-mandate-violated`) — a result containing only generated
 * candidates is unrepresentable.
 *
 * Evaluation runs through the Lab simulator stack: the LAB-007
 * `EnsemblePort` (whose members execute through the LAB-004
 * `SimulatorEnginePort` — deterministic, seed-required) yields the §22
 * uncertainty set per candidate: expected reward, interval, member
 * disagreement, seed robustness and the OOD signal. Outputs are
 * COUNTERFACTUAL-labeled (lock rule 29) and carry the §24 lab-only
 * statement — the search makes NO deployment decision.
 */

declare const organizationSearchIdBrand: unique symbol;

/** Unique identifier of one organization search result. */
export type OrganizationSearchResultId = string & {
  readonly [organizationSearchIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Search policy (declared: budget, pruning, stopping, vocabularies)
// ---------------------------------------------------------------------------

/**
 * The declared pruning rule. `none`: no dominance claims. `interval-dominance`:
 * an evaluated candidate whose interval UPPER bound is strictly below the
 * incumbent's interval LOWER bound is certainly worse than the incumbent's
 * worst case under current evidence — it stays RANKED (§23 comparison
 * transparency) but is marked `pruned` in its provenance and is never
 * eligible as a generation parent.
 */
export type OrganizationPruningRule = 'none' | 'interval-dominance';

/** Normalization references for the documented synthetic mapping (adapter). */
export interface OrganizationEvaluationReferences {
  /** Cadence one fully-resourced agent sustains per week (> 0). */
  readonly cadencePerAgentPerWeek: number;
  /** Organization budget amount treated as full resourcing (> 0). */
  readonly fullBudgetAmount: number;
  /** Tools per node treated as full tool coverage (> 0). */
  readonly fullToolsPerNode: number;
  /** maxIterations treated as fully-generous stopping (> 0). */
  readonly referenceIterations: number;
}

/** The declared search policy — budget, pruning, stopping, vocabularies. */
export interface OrganizationSearchPolicy {
  /** Total member-step budget for the whole search (>= mandated floor). */
  readonly maxMemberSteps: number;
  readonly pruning: OrganizationPruningRule;
  /** Hard cap on generation iterations (>= 1). */
  readonly maxGenerations: number;
  /** Consecutive non-improving generations tolerated (>= 1). */
  readonly plateauWindow: number;
  /** Minimum reward improvement that counts as progress (>= 0). */
  readonly improvementTolerance: number;
  /** Evaluation horizon in simulated steps per seed (>= 1). */
  readonly horizonSteps: number;
  /** Evaluation seeds per candidate (>= 2 — seed robustness requires two). */
  readonly seedCount: number;
  /** Role vocabulary role mutations cycle through (non-empty). */
  readonly roleVocabulary: readonly string[];
  /** Model vocabulary model-assignment mutations cycle through (non-empty). */
  readonly modelVocabulary: readonly ModelRef[];
  /** Tool vocabulary tool-allocation mutations draw from (may be empty). */
  readonly toolVocabulary: readonly string[];
  /** Budget mutation scale factor (> 1). */
  readonly budgetScaleFactor: number;
  /** Stopping mutation maxIterations delta (>= 1). */
  readonly stoppingIterationDelta: number;
  readonly evaluationReferences: OrganizationEvaluationReferences;
}

// ---------------------------------------------------------------------------
// Input (the §23 comparison mandate is structural here)
// ---------------------------------------------------------------------------

/** The caller-supplied candidate set — baseline + hand-designed REQUIRED. */
export interface OrganizationSearchCandidates {
  /**
   * §23/lock rule 33: the generalist single-agent baseline. Validated
   * fail-closed: exactly ONE node (`baseline-not-single-agent` otherwise).
   */
  readonly baseline: SearchedOrganizationCandidate;
  /** §23/lock rule 33: the caller's hand-designed organization. */
  readonly handDesigned: SearchedOrganizationCandidate;
  /** Additional composed candidates the search also evaluates/mutates. */
  readonly additional?: readonly SearchedOrganizationCandidate[];
}

/** One organization search request. `seed` is REQUIRED. */
export interface OrganizationSearchInput {
  readonly scope: TenantScope;
  readonly scenario: LabScenario;
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  /** Reward spec whose `version` MUST equal `scenario.rewardVersion`. */
  readonly rewardSpec: LabRewardSpec;
  readonly candidates: OrganizationSearchCandidates;
  readonly seed: number;
  readonly policy: OrganizationSearchPolicy;
}

// ---------------------------------------------------------------------------
// Per-candidate evaluation (§22 uncertainty set through the ensemble)
// ---------------------------------------------------------------------------

/** §22 seed robustness of one candidate: how its estimate moves across seeds. */
export interface OrganizationSeedRobustness {
  readonly seeds: readonly number[];
  /** Mean reward per evaluation seed (aligned with `seeds`). */
  readonly perSeedExpected: readonly number[];
  /** max − min over per-seed estimates. */
  readonly spread: number;
  readonly halfSpread: number;
}

/** Aggregated OOD verdict across the rollout's ensemble predictions. */
export interface OrganizationOodSummary {
  readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
  readonly flagged: boolean;
}

/** The §22-labeled evaluation of one candidate (all counterfactual). */
export interface OrganizationCandidateEvaluation {
  readonly expectedReward: number;
  readonly interval: PredictionInterval;
  readonly uncertainty: UncertaintySummary;
  /** Half the member-reward spread (ensemble disagreement — never hidden). */
  readonly disagreementHalfWidth: number;
  readonly seedRobustness: OrganizationSeedRobustness;
  readonly ood: OrganizationOodSummary;
  /** Carried to LAB-018 — provenance-declared, never a number. */
  readonly calibration: CalibrationPlaceholder;
  /** Member steps this evaluation actually consumed (budget accounting). */
  readonly simulatedMemberSteps: number;
  /** Horizon actually simulated (min of policy horizon and the org's own stopping cap). */
  readonly effectiveHorizonSteps: number;
  /** LOCK RULE 29 PIN: ensemble-evaluated simulation estimate, never evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'ensemble-evaluated-simulation-estimate';
}

// ---------------------------------------------------------------------------
// Provenance (which versions evaluated the candidate; varied dimensions)
// ---------------------------------------------------------------------------

export interface OrganizationSearchProvenance {
  readonly origin: OrganizationCandidateOrigin;
  /** Simulator version the scenario pins (every member executed under it). */
  readonly simulatorVersion: number;
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly memberWorldModelVersions: readonly number[];
  readonly rewardSpecVersion: number;
  readonly seed: number;
  readonly evaluationSeeds: readonly number[];
  readonly horizonSteps: number;
  /** ALL TWELVE dimension signatures (no silent defaults). */
  readonly fingerprint: OrganizationFeatureFingerprint;
  /**
   * Dimensions varied vs the parent (generated candidates); the full twelve
   * for caller-supplied candidates (every dimension is the caller's
   * explicit declaration).
   */
  readonly variedDimensions: readonly OrganizationSearchDimension[];
  readonly parentFingerprint: OrganizationFeatureFingerprint | null;
  /** 1-based generation index (null for caller-supplied candidates). */
  readonly generationIndex: number | null;
  readonly pruned: boolean;
  readonly pruningRule: OrganizationPruningRule;
  readonly searchedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Ranking (uncertainty-aware, deterministic tie-break, overlap declared)
// ---------------------------------------------------------------------------

/** Interval overlap with the rank-1 candidate — declared, never hidden. */
export interface IntervalOverlapDeclaration {
  readonly overlaps: boolean;
  readonly note: string;
}

/** One ranked candidate: the full candidate + evaluation + provenance. */
export interface RankedOrganizationCandidate {
  readonly rank: number;
  readonly candidate: SearchedOrganizationCandidate;
  readonly evaluation: OrganizationCandidateEvaluation;
  readonly provenance: OrganizationSearchProvenance;
  /** Null on rank 1; declared overlap vs the leader for every other rank. */
  readonly intervalOverlapWithLeader: IntervalOverlapDeclaration | null;
}

/** THE §23 COMPARISON MANDATE, structurally required on every result. */
export interface OrganizationSearchComparison {
  readonly baseline: RankedOrganizationCandidate;
  readonly handDesigned: RankedOrganizationCandidate;
  /** Search-produced organizations — ALWAYS >= 1 (fail-closed otherwise). */
  readonly generated: readonly RankedOrganizationCandidate[];
}

// ---------------------------------------------------------------------------
// Budget + stopping + result
// ---------------------------------------------------------------------------

export interface OrganizationSearchBudget {
  readonly maxMemberSteps: number;
  readonly consumedMemberSteps: number;
  readonly evaluationsExecuted: number;
  readonly generatedEvaluated: number;
}

export type OrganizationSearchStopReason =
  | 'budget-exhausted'
  | 'plateau-detected'
  | 'generation-cap-reached';

export interface OrganizationSearchStopping {
  readonly reason: OrganizationSearchStopReason;
  readonly detail: string;
  readonly generationsExecuted: number;
}

/**
 * A ranked, uncertainty-labeled, counterfactual organization search result.
 * NO deployment decision: the §24 real-experiment boundary is untouched.
 */
export interface OrganizationSearchResult {
  readonly id: OrganizationSearchResultId;
  readonly tenantId: TenantId;
  /** Deterministic order: expected reward desc → interval width asc → key asc. */
  readonly ranked: readonly RankedOrganizationCandidate[];
  readonly comparison: OrganizationSearchComparison;
  readonly budget: OrganizationSearchBudget;
  readonly stopping: OrganizationSearchStopping;
  /** LOCK RULE 29 PIN: simulation-derived search output, never evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'organization-search-over-disclosed-synthetic-simulation';
  /** §24 boundary statement carried on the record. */
  readonly labOnly:
    'ranked lab candidates only — never a deployment decision; the real-experiment boundary (§24) is untouched';
}

// ---------------------------------------------------------------------------
// Failure model + port
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for organization search. */
export type OrganizationSearchErrorCode =
  | 'invalid-input'
  | 'missing-required-candidate'
  | 'baseline-not-single-agent'
  | 'invalid-candidate-organization'
  | 'tenant-scope-mismatch'
  | 'budget-below-mandated-floor'
  | 'comparison-mandate-violated'
  | 'unknown-ensemble'
  | 'ensemble-version-not-found'
  | 'scenario-ensemble-mismatch'
  | 'reward-version-mismatch'
  | 'reward-term-not-derivable'
  | 'ensemble-evaluation-failed';

/** Typed failure value (result union, the MOS domain convention). */
export interface OrganizationSearchError {
  readonly error: OrganizationSearchErrorCode;
  readonly message: string;
}

/**
 * The agent organization search port (LAB-010) — a single method (≤ 12
 * policy budget). Deterministic given (candidates, seed, policy, world-model
 * versions). The §23 three-way comparison is structurally mandatory.
 */
export interface OrganizationSearchPort {
  /**
   * Search organizations over the twelve §23 dimensions. Fails closed with
   * every code above (mandate violations, budget floor, ensemble/reward
   * version pins, evaluation failures).
   */
  searchOrganizations(
    input: OrganizationSearchInput,
  ): Promise<OrganizationSearchResult | OrganizationSearchError>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 29/33)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _SearchResultsAreAlwaysCounterfactual = Expect<
  Equal<OrganizationSearchResult['counterfactual'], true>
>;
type _SearchResultsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<OrganizationSearchResult, HistoricalObservation>, false>
>;
type _HistoricalObservationsNeverOccupyASearchResultSlot = Expect<
  Equal<IsAssignable<HistoricalObservation, OrganizationSearchResult>, false>
>;
type _RankedCandidatesNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<RankedOrganizationCandidate, HistoricalObservation>, false>
>;
type _CandidateEvaluationsAreAlwaysCounterfactual = Expect<
  Equal<OrganizationCandidateEvaluation['counterfactual'], true>
>;
type _CandidateEvaluationsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<OrganizationCandidateEvaluation, HistoricalObservation>, false>
>;
/** The three-way comparison is structurally mandatory on every result. */
type _ComparisonRequiresBothBaselines = Expect<
  Equal<keyof OrganizationSearchComparison, 'baseline' | 'handDesigned' | 'generated'>
>;
