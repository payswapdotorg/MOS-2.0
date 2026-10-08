import type {
  LabScenarioId,
  TenantId,
  Timestamp,
  UncertaintySummary,
} from '@mos/contracts';
import type { WorldModelEnsembleId } from './ensemble.js';
import type { HistoricalObservation, PredictionInterval } from './evidence.js';
import type {
  BenchmarkAggregationRule,
  BenchmarkCandidate,
  BenchmarkCandidateOrigin,
  BenchmarkCandidateSource,
  BenchmarkSweepDimension,
  BenchmarkWorldModelRef,
  RobustBenchmarkId,
  RobustnessPolicy,
} from './robust-benchmark.js';

/**
 * Robust Marketing Benchmark RESULT contracts (LAB-017): the §22-labeled
 * per-candidate evaluation, the uncertainty-aware ranking with the
 * declared deterministic tie-break, the structurally-present no-op
 * baseline + declared comparison set, the cross-candidate fairness pin,
 * full provenance, and the frozen result itself. The append-only RECORD,
 * the integrity report and the PORT live in `robust-benchmark-port.ts`
 * (split to respect the contract file line budget — the W3-A/W5-A
 * delay-decision-port precedent).
 *
 * Basis: spec/mos-architecture-v2.0.md §22 (the full uncertainty set),
 * §7/lock rule 5 (no-op baseline always present), §24 (benchmark output
 * informs selection — NEVER deployment evidence), lock rules 29/32.
 *
 * THE NO-OP BASELINE IS STRUCTURAL (the W8-B pin carried here): a result
 * without its `comparison.noopBaseline` entry is unrepresentable — the
 * field is required, never an array slot that could be empty.
 *
 * CALIBRATION IS DECLARED PENDING REALITY (LAB-018 seam): every result and
 * every per-candidate evaluation carries a
 * {@link BenchmarkCalibrationDeclaration} — a status + provenance
 * statement, NEVER a number. LAB-018 later appends simulation-to-reality
 * error records pointing at (benchmark id, version, candidate key); this
 * frozen record is never rewritten.
 */

// ---------------------------------------------------------------------------
// Per-candidate §22 evaluation pieces
// ---------------------------------------------------------------------------

/**
 * The decomposition of the per-candidate uncertainty interval
 * (`bench-additive-v1`, documented on the in-memory adapter): every term
 * is a disclosed separately-computed half-width; the interval is the
 * reported expected value ± their SUM (additive, conservative — the same
 * discipline as LAB-008's OPE bound, minus the observed-basis Hoeffding
 * term which does not exist in a pure-simulation benchmark).
 */
export interface BenchmarkUncertaintyBreakdown {
  /** Worst per-world member-reward half-spread (ensemble disagreement). */
  readonly memberDisagreementHalfWidth: number;
  /** Half the (max − min) of per-seed mean rewards. */
  readonly seedRobustnessHalfWidth: number;
  /** Half the (max − min) of per-world mean rewards (0 for a single world). */
  readonly worldModelSpreadHalfWidth: number;
  readonly totalHalfWidth: number;
  readonly formula: 'bench-additive-v1';
  readonly aggregation: BenchmarkAggregationRule;
}

/** §22 seed robustness of one candidate: how its reward moves across seeds. */
export interface BenchmarkSeedRobustness {
  readonly seeds: readonly number[];
  /** Mean reward per seed (aligned with `seeds`). */
  readonly perSeedExpected: readonly number[];
  /** max − min over per-seed means. */
  readonly spread: number;
  readonly halfSpread: number;
  /** spread / |mean of per-seed means| (0 when both are 0). */
  readonly relativeSpread: number;
}

/** One world-model's expected reward for the candidate. */
export interface BenchmarkWorldModelEvaluation {
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly label: string;
  readonly expectedReward: number;
}

/**
 * Cross-world-model robustness (the multi-world axis): per-world expected
 * rewards, the spread, and the worst/best world means.
 */
export interface BenchmarkWorldRobustness {
  readonly perWorld: readonly BenchmarkWorldModelEvaluation[];
  readonly spread: number;
  readonly halfSpread: number;
  readonly worstExpectedReward: number;
  readonly bestExpectedReward: number;
}

/**
 * Model disagreement per world (the member expected-reward spread inside
 * each ensemble — never hidden by aggregation), with the worst per-world
 * half-spread as the aggregate.
 */
export interface BenchmarkDisagreement {
  readonly perWorld: readonly {
    readonly ensembleId: WorldModelEnsembleId;
    readonly ensembleVersion: number;
    readonly label: string;
    /** Per-member mean rewards (aligned with the ensemble's member order). */
    readonly memberExpected: readonly number[];
    readonly spread: number;
    readonly halfSpread: number;
  }[];
  /** Worst per-world member half-spread (§22 — never hidden). */
  readonly worstHalfWidth: number;
}

/**
 * OOD/novelty-regime signal vs the members' DECLARED coverage (the LAB-007
 * declared-coverage seam, aggregated across the world-model set).
 */
export interface BenchmarkOodSignal {
  readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
  readonly flagged: boolean;
  readonly perWorld: readonly {
    readonly ensembleId: WorldModelEnsembleId;
    readonly ensembleVersion: number;
    readonly label: string;
    readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
    readonly flagged: boolean;
    /** Max normalized out-of-box distance over the world's members (0 = inside). */
    readonly maxDistance: number;
  }[];
}

/**
 * The §22 calibration surface carried as DECLARED PENDING REALITY — never
 * a number. LAB-018 (online calibration) later records the
 * simulation-to-reality prediction error for this benchmark's per-candidate
 * expected rewards + intervals by APPENDING records; historical evidence
 * is never rewritten.
 */
export interface BenchmarkCalibrationDeclaration {
  readonly status: 'pending-reality';
  readonly provenance:
    'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten';
  /** What LAB-018 calibrates against this record. */
  readonly predictionSurface: 'per-candidate expected reward + interval';
}

/** The §22-labeled evaluation of one candidate (all counterfactual). */
export interface BenchmarkCandidateEvaluation {
  /** Expected reward under the declared aggregation rule. */
  readonly expectedReward: number;
  readonly interval: PredictionInterval;
  readonly uncertainty: UncertaintySummary;
  readonly breakdown: BenchmarkUncertaintyBreakdown;
  readonly seedRobustness: BenchmarkSeedRobustness;
  readonly worldRobustness: BenchmarkWorldRobustness;
  readonly disagreement: BenchmarkDisagreement;
  readonly ood: BenchmarkOodSignal;
  readonly calibration: BenchmarkCalibrationDeclaration;
  /** LOCK RULE 29 PIN: ensemble-evaluated simulation estimate, never evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles';
}

// ---------------------------------------------------------------------------
// Provenance (which versions produced every number)
// ---------------------------------------------------------------------------

/**
 * The full version pin of one world-model set entry: the ensemble version,
 * its weighting policy pin, and every member's world-model version.
 */
export interface BenchmarkWorldModelPin {
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly weightingPolicyId: string;
  readonly weightingPolicyVersion: number;
  readonly weightingKind: 'uniform' | 'declared-member-weights';
  /** Member world-model versions (aligned with the ensemble's member order). */
  readonly memberWorldModelVersions: readonly number[];
}

/** Provenance of one ranked candidate: the versions that produced its numbers. */
export interface BenchmarkCandidateProvenance {
  readonly origin: BenchmarkCandidateOrigin;
  readonly candidateSource: BenchmarkCandidateSource;
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly seeds: readonly number[];
  readonly horizonSteps: number;
  readonly worldModels: readonly BenchmarkWorldModelPin[];
}

// ---------------------------------------------------------------------------
// Ranking + comparisons (uncertainty-aware, deterministic tie-break)
// ---------------------------------------------------------------------------

/** Interval overlap declaration — declared, never hidden. */
export interface BenchmarkIntervalOverlapDeclaration {
  readonly overlaps: boolean;
  readonly note: string;
}

/**
 * The declared comparison of one ranked candidate against the NO-OP
 * BASELINE (§7: comparisons are against the always-present baseline):
 * the baseline's expected reward, this candidate's delta, the interval
 * overlap, and whether this candidate's interval lower bound is strictly
 * above the baseline's upper bound (certainly-better UNDER SIMULATION —
 * never a deployment claim).
 */
export interface BenchmarkBaselineComparison {
  readonly baselineExpectedReward: number;
  readonly expectedRewardDelta: number;
  readonly intervalOverlapWithBaseline: BenchmarkIntervalOverlapDeclaration;
  readonly certainlyBetterThanBaseline: boolean;
}

/** One ranked benchmark candidate: frozen input + evaluation + provenance. */
export interface RankedBenchmarkCandidate {
  /** 1-based rank (the declared policy's deterministic order). */
  readonly rank: number;
  readonly key: string;
  readonly label: string | null;
  readonly origin: BenchmarkCandidateOrigin;
  /** The frozen benchmark-candidate INPUT (action + horizon + source). */
  readonly candidate: BenchmarkCandidate;
  readonly evaluation: BenchmarkCandidateEvaluation;
  readonly provenance: BenchmarkCandidateProvenance;
  readonly comparisonToBaseline: BenchmarkBaselineComparison;
  /** Null on rank 1; declared overlap vs the leader for every other rank. */
  readonly intervalOverlapWithLeader: BenchmarkIntervalOverlapDeclaration | null;
}

/**
 * THE COMPARISON SET (structurally required on every result): the
 * benchmark's synthesized NO-OP BASELINE plus the declared candidate set —
 * all ranked under the SAME policy. `noopBaseline` is a required field,
 * never an array slot (the W8-B pin).
 */
export interface BenchmarkComparisonSet {
  readonly noopBaseline: RankedBenchmarkCandidate;
  readonly declared: readonly RankedBenchmarkCandidate[];
}

/**
 * The cross-candidate FAIRNESS PIN: every candidate in the record was
 * evaluated under EXACTLY these seeds / world-model set / policy version /
 * reward spec version — per-candidate condition cherry-picking is not
 * expressible on this surface (test-pinned by an evaluation-call spy).
 */
export interface BenchmarkFairnessPin {
  readonly seeds: readonly number[];
  readonly worldModelSet: readonly BenchmarkWorldModelRef[];
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardSpecVersion: number;
  readonly statement:
    'every candidate in this benchmark was evaluated under the same seeds, world-model set, policy version and reward spec version — no per-candidate condition cherry-picking';
}

/** Run-level provenance: the versions that produced every number in the record. */
export interface BenchmarkProvenance {
  readonly simulatorVersion: number;
  readonly corpusVersion: number;
  readonly rewardSpecVersion: number;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly seeds: readonly number[];
  readonly sweepDimensions: readonly BenchmarkSweepDimension[];
  readonly worldModels: readonly BenchmarkWorldModelPin[];
}

// ---------------------------------------------------------------------------
// The frozen result
// ---------------------------------------------------------------------------

/**
 * A robust benchmark result: the ranked candidate set (including the
 * no-op baseline), the comparison set, the policy snapshot, the fairness
 * pin, full provenance — COUNTERFACTUAL (lock rule 29) and carrying the
 * §24 boundary statement. Benchmark output INFORMS SELECTION; it is NOT
 * deployment evidence.
 */
export interface RobustBenchmarkResult {
  readonly id: RobustBenchmarkId;
  readonly tenantId: TenantId;
  readonly scenarioRef: LabScenarioId;
  /** Deterministic order: expected reward desc → half-width asc → key asc. */
  readonly ranked: readonly RankedBenchmarkCandidate[];
  readonly comparison: BenchmarkComparisonSet;
  /** The declared policy snapshot that produced this result. */
  readonly policy: RobustnessPolicy;
  readonly seeds: readonly number[];
  readonly fairness: BenchmarkFairnessPin;
  readonly provenance: BenchmarkProvenance;
  readonly benchmarkedAt: Timestamp;
  /** LOCK RULE 29 PIN: simulation-derived benchmark output, never evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles';
  /** §24 boundary statement carried on EVERY record. */
  readonly labOnly:
    'robust benchmark output informs selection only — it is NOT deployment evidence; the real-experiment boundary (§24) is the only path to reality-grade proof';
  readonly calibration: BenchmarkCalibrationDeclaration;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 5/29/32)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _ResultsAreAlwaysCounterfactual = Expect<
  Equal<RobustBenchmarkResult['counterfactual'], true>
>;
type _ResultsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<RobustBenchmarkResult, HistoricalObservation>, false>
>;
type _CandidateEvaluationsAreAlwaysCounterfactual = Expect<
  Equal<BenchmarkCandidateEvaluation['counterfactual'], true>
>;
/** The no-op baseline is structurally REQUIRED on every result (§7 pin). */
type _NoopBaselineIsStructurallyRequired = Expect<
  Equal<keyof Pick<BenchmarkComparisonSet, 'noopBaseline'>, 'noopBaseline'>
>;
/** Every ranked candidate carries a baseline comparison (§7: compare against it). */
type _BaselineComparisonIsRequired = Expect<
  Equal<keyof Pick<RankedBenchmarkCandidate, 'comparisonToBaseline'>, 'comparisonToBaseline'>
>;
/** Calibration is DECLARED PENDING REALITY — never a number (LAB-018 seam). */
type _CalibrationIsNeverANumber = Expect<
  Equal<BenchmarkCalibrationDeclaration['status'], 'pending-reality'>
>;
/** The fairness statement is the frozen literal pin. */
type _FairnessStatementIsFrozen = Expect<
  Equal<BenchmarkFairnessPin['statement'], RobustBenchmarkResult['fairness']['statement']>
>;
