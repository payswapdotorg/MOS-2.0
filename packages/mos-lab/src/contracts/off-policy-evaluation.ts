import type {
  LabScenario,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
} from '@mos/contracts';
import type {
  HistoricalObservation,
  HistoricalObservationId,
  ObservedMetric,
  PredictionInterval,
} from './evidence.js';
import type { WorldModelEnsembleId } from './ensemble.js';
import type {
  CandidateProgramDescriptor,
  LabRewardMetricId,
  LabRewardDirection,
} from './reward.js';

/**
 * Offline / Off-Policy Evaluation contracts (LAB-008): evaluate a candidate
 * program against RECORDED history WITHOUT live deployment.
 *
 * Basis: spec/mos-architecture-v2.0.md §20 (offline/off-policy evaluation),
 * §21 (mission-specific versioned reward), §22 (expected value + interval +
 * model disagreement + seed robustness), §24 (real-world boundary — the ONLY
 * path to deployment-grade evidence), lock rules 29/30/31.
 *
 * HISTORICAL DATA DISCIPLINE (lock rule 30): the evaluation may see ONLY
 * Time Machine-issued observations — the evaluator pulls its basis through
 * `TimeMachinePort.replayDelayedInformation` (mode 2), so at cutoff T under
 * the scenario's lag L only records with `observedAt <= T - L` are visible.
 * Future/unlagged information CANNOT reach the estimate (adversarially
 * test-pinned).
 *
 * VALIDITY DISCLOSURE (§24 boundary): an off-policy estimate is a SIMULATED
 * estimate — never experimental proof. Every score carries an explicit
 * {@link OffPolicyValidityDisclosure}; the real-experiment boundary remains
 * the only path to deployment-grade evidence, and this module never crosses
 * it (no publication, no provider calls, no experiment writes).
 *
 * The finite-sample uncertainty is a DOCUMENTED simple bound (a per-term
 * Hoeffding bound on the observed-baseline means, summed conservatively,
 * combined additively with the ensemble disagreement half-spread and the
 * seed robustness half-spread) — no invented sophistication; the exact
 * formula is documented on the in-memory adapter.
 */

declare const offPolicyEvaluationIdBrand: unique symbol;

/** Unique identifier of one off-policy evaluation score record. */
export type OffPolicyEvaluationId = string & {
  readonly [offPolicyEvaluationIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * One off-policy evaluation request. `asOf` is the Time Machine cutoff T;
 * the information lag L comes from `scenario.informationLag` (the caller
 * cannot shrink it — the lag discipline is not negotiable). `seeds` is the
 * deterministic seed set the ensemble rollout uses; `minObservations` is
 * the declared insufficiency threshold (default 1 — an EMPTY basis always
 * yields the explicit `insufficient-history` verdict, never a silent zero);
 * `confidence` is the miscoverage probability δ of the finite-sample bound
 * (default 0.05).
 */
export interface OffPolicyEvaluationInput {
  readonly scope: TenantScope;
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly scenario: LabScenario;
  readonly program: CandidateProgramDescriptor;
  /** Reward spec whose `version` MUST equal `scenario.rewardVersion`. */
  readonly rewardSpec: import('./reward.js').LabRewardSpec;
  /** Deterministic seed set for the ensemble rollout (non-empty). */
  readonly seeds: readonly number[];
  /** Time Machine cutoff T. */
  readonly asOf: Timestamp;
  /** Declared minimum basis size (>= 1; default 1). */
  readonly minObservations?: number;
  /** Miscoverage probability δ for the finite-sample bound (0 < δ < 1; default 0.05). */
  readonly confidence?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Mean of one observed metric across the lagged evaluation basis. */
export interface ObservedMetricMean {
  readonly metric: string;
  readonly mean: number;
  readonly unit: string;
}

/** Summary of the Time Machine-issued (lagged) basis the estimate used. */
export interface EvaluationBasis {
  /** Cutoff T the evaluation was run at. */
  readonly asOf: Timestamp;
  /** Information lag L (milliseconds) actually enforced (scenario-pinned). */
  readonly lagMs: number;
  /** ids of the observations visible at T−L (ALL have `observedAt <= T−L`). */
  readonly observationIds: readonly HistoricalObservationId[];
  readonly observationCount: number;
  readonly observedMetricMeans: readonly ObservedMetricMean[];
}

/** One reward term's resolved contribution to the estimated reward. */
export interface RewardTermContribution {
  readonly metric: LabRewardMetricId;
  readonly direction: LabRewardDirection;
  /** The concrete metric source the term resolved to. */
  readonly metricSource: string;
  readonly source: 'predicted-metric' | 'predicted-delta' | 'observed';
  readonly weight: number;
  /** Mean signed contribution over the rollout (weight × direction × value). */
  readonly meanContribution: number;
}

/**
 * The decomposition of the finite-sample uncertainty interval. Every term is
 * a disclosed, separately-computed half-width; the interval is the estimate
 * ± their SUM. `formula` names the documented formula (see the in-memory
 * adapter docblock for the exact derivation).
 */
export interface OffPolicyUncertaintyBreakdown {
  /** Hoeffding-style bound on the observed-baseline means (0 with no observed terms). */
  readonly statisticalHalfWidth: number;
  /** Half the member spread of expected reward (ensemble disagreement). */
  readonly ensembleDisagreementHalfWidth: number;
  /** Half the (max − min) spread of per-seed expected rewards. */
  readonly seedRobustnessHalfWidth: number;
  /** Basis size n feeding the statistical bound. */
  readonly effectiveSampleSize: number;
  /** The δ actually used. */
  readonly confidence: number;
  readonly formula: 'ope-hoeffding-additive-v1';
}

/** The §24 validity disclosure carried on every off-policy score. */
export interface OffPolicyValidityDisclosure {
  readonly simulatedEstimate: true;
  readonly statement:
    'off-policy estimate from a disclosed synthetic ensemble over recorded history — a SIMULATED estimate, never experimental proof; the real-experiment boundary (§24) is the only path to deployment-grade evidence';
}

/**
 * An off-policy evaluation SCORE: the estimated reward with its
 * finite-sample uncertainty interval and full provenance. COUNTERFACTUAL by
 * literal type (never a `HistoricalObservation` — the basis lists historical
 * observation IDS; the estimate itself is a simulated model output).
 */
export interface OffPolicyEvaluationScore {
  readonly id: OffPolicyEvaluationId;
  readonly tenantId: TenantId;
  readonly verdict: 'estimated';
  /** Estimated reward R̂ (documented formula on the adapter). */
  readonly estimatedReward: number;
  /** [R̂ − totalHalfWidth, R̂ + totalHalfWidth]. */
  readonly interval: PredictionInterval;
  readonly uncertainty: UncertaintySummary;
  readonly uncertaintyBreakdown: OffPolicyUncertaintyBreakdown;
  readonly rewardSpecVersion: number;
  readonly ensemble: {
    readonly id: WorldModelEnsembleId;
    readonly version: number;
    readonly memberCount: number;
  };
  readonly program: CandidateProgramDescriptor;
  readonly basis: EvaluationBasis;
  readonly perTerm: readonly RewardTermContribution[];
  /** OOD signal carried from the ensemble evaluations (§22). */
  readonly oodCarried: boolean;
  /** LOCK RULE 29 PIN: simulated estimate — never historical evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'off-policy-simulated-estimate';
  readonly validity: OffPolicyValidityDisclosure;
}

/**
 * The explicit insufficiency verdict: the lagged basis is smaller than the
 * declared minimum. NEVER a silent zero — the evaluation refuses to produce
 * an estimate it cannot support.
 */
export interface OffPolicyInsufficientHistory {
  readonly verdict: 'insufficient-history';
  readonly requiredMinimum: number;
  readonly observed: number;
  readonly asOf: Timestamp;
  readonly lagMs: number;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Failure model + port
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for off-policy evaluation. */
export type OffPolicyErrorCode =
  | 'invalid-input'
  | 'unknown-ensemble'
  | 'ensemble-version-not-found'
  | 'reward-version-mismatch'
  | 'reward-term-not-derivable'
  | 'reward-term-ambiguous'
  | 'history-unavailable'
  | 'ensemble-evaluation-failed';

/** Typed failure value (result union, the MOS domain convention). */
export interface OffPolicyError {
  readonly error: OffPolicyErrorCode;
  readonly message: string;
}

/** The result of one off-policy evaluation: score, insufficiency verdict, or typed failure. */
export type OffPolicyEvaluationResult =
  | OffPolicyEvaluationScore
  | OffPolicyInsufficientHistory
  | OffPolicyError;

/**
 * The offline/off-policy evaluation port (LAB-008) — a single method (≤ 12
 * policy budget). The evaluator composes the LAB-007 ensemble (simulated
 * counterfactual lift) with the LAB-006 Time Machine delayed-information
 * replay (recorded history, ≤ T−L) under a versioned mission-compatible
 * reward spec, WITHOUT live deployment.
 */
export interface OffPolicyEvaluationPort {
  /**
   * Evaluate one candidate program against recorded history. Fails closed
   * with `invalid-input`, `unknown-ensemble`,
   * `ensemble-version-not-found`, `reward-version-mismatch` (spec version ≠
   * scenario.rewardVersion), `reward-term-not-derivable` /
   * `reward-term-ambiguous`, `history-unavailable` (Time Machine failure) or
   * `ensemble-evaluation-failed` (underlying ensemble failure). An empty or
   * sub-minimum basis yields the explicit `insufficient-history` verdict.
   */
  evaluateCandidate(
    input: OffPolicyEvaluationInput,
  ): Promise<OffPolicyEvaluationResult>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rule 29)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _ScoresAreAlwaysCounterfactual = Expect<
  Equal<OffPolicyEvaluationScore['counterfactual'], true>
>;
type _ScoresNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<OffPolicyEvaluationScore, HistoricalObservation>, false>
>;
type _HistoricalObservationsNeverOccupyAScoreSlot = Expect<
  Equal<IsAssignable<HistoricalObservation, OffPolicyEvaluationScore>, false>
>;
type _ScoresAreNotRawStepPredictions = Expect<
  Equal<
    IsAssignable<OffPolicyEvaluationScore, import('./evidence.js').SimulationPrediction>,
    false
  >
>;
type _InsufficiencyIsNeverASilentZero = Expect<
  Equal<OffPolicyInsufficientHistory['verdict'], 'insufficient-history'>
>;
type _ObservedMetricMeansAreRealEvidence = Expect<
  Equal<IsAssignable<ObservedMetricMean, ObservedMetric>, false>
>;
