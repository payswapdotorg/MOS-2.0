import type {
  LabScenario,
  LabScenarioId,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
  Version,
} from '@mos/contracts';

/**
 * REAL-shaped lab record mirrors for the UX-003 composition seam (OUTSIDE
 * `src/`).
 *
 * WHY RE-DECLARED, NOT IMPORTED (disclosed): the web package's frozen
 * registry dependency list is `[contracts]`, and this delivery's subtree is
 * `packages/mos-web/**` ONLY — adding `@mos/lab` as a devDependency (the
 * UX-002 `@mos/studio` pattern) would require a `pnpm-lock.yaml` importer
 * delta, a central-file touch this work item keeps at zero. These interfaces
 * therefore re-declare the LAB-017/LAB-018 record shapes FIELD-FOR-FIELD
 * from the authority sources, with the source path cited on every block.
 * The browser double feeds fixtures in these REAL shapes; the TL-owned
 * production composition binds the same view ports over the real
 * `@mos/lab` records (structurally identical to these mirrors) without
 * touching `src/`.
 *
 * Mirrored sources (all in packages/mos-lab/src/contracts/):
 * - robust-benchmark.ts       — candidates, robustness policy, run input
 * - robust-benchmark-result.ts — the §22 evaluation + frozen result
 * - robust-benchmark-port.ts  — the append-only record + integrity report
 * - online-calibration.ts     — the prediction-error record + functional
 * - online-calibration-port.ts — the derived context + integrity reports
 * - evidence.ts               — PredictionInterval + observation ids
 * - simulator.ts              — StrategyActionCandidate (the action seam)
 */

// ——— branded id mirrors (the authority's local brands, mirrored) ———

declare const robustBenchmarkIdBrand: unique symbol;
/** Mirror of LAB-017 `RobustBenchmarkId`. */
export type LabBenchmarkIdFixture = string & {
  readonly [robustBenchmarkIdBrand]: true;
};

declare const worldModelEnsembleIdBrand: unique symbol;
/** Mirror of LAB-007 `WorldModelEnsembleId`. */
export type WorldModelEnsembleIdFixture = string & {
  readonly [worldModelEnsembleIdBrand]: true;
};

declare const labCalibrationIdBrand: unique symbol;
/** Mirror of LAB-018 `LabCalibrationId`. */
export type LabCalibrationIdFixture = string & {
  readonly [labCalibrationIdBrand]: true;
};

declare const historicalObservationIdBrand: unique symbol;
/** Mirror of LAB-003 `HistoricalObservationId`. */
export type HistoricalObservationIdFixture = string & {
  readonly [historicalObservationIdBrand]: true;
};

// ——— evidence.ts mirrors ———

/** Mirror of LAB-003 `PredictionInterval`. */
export interface PredictionIntervalFixture {
  readonly lower: number;
  readonly upper: number;
}

// ——— simulator.ts mirrors (the declared action seam) ———

/** Mirror of LAB-004 `StrategyActionKind`. */
export type StrategyActionKindFixture = 'content' | 'repost' | 'no-op';

/** Mirror of LAB-004 `StrategyActionCandidate`. */
export interface StrategyActionCandidateFixture {
  readonly strategyRef: StrategyRef;
  readonly kind: StrategyActionKindFixture;
  readonly cadencePerWeek: number;
  readonly novelty: number;
  readonly engagementEffort: number;
}

// ——— robust-benchmark.ts mirrors ———

/** Mirror of LAB-017 `BenchmarkCandidateOrigin`. */
export type BenchmarkCandidateOriginFixture =
  | 'hand-designed'
  | 'learned-strategy'
  | 'organization-search'
  | 'production-search'
  | 'no-op-baseline';

/** Mirror of LAB-017 `BenchmarkProducerPin`. */
export interface BenchmarkProducerPinFixture {
  readonly surface: string;
  readonly version: number;
}

/** Mirror of LAB-017 `BenchmarkCandidateSource`. */
export interface BenchmarkCandidateSourceFixture {
  readonly origin: BenchmarkCandidateOriginFixture;
  readonly producerPins: readonly BenchmarkProducerPinFixture[];
  readonly note: string;
}

/** Mirror of LAB-017 `BenchmarkCandidate`. */
export interface BenchmarkCandidateFixture {
  readonly key: string;
  readonly action: StrategyActionCandidateFixture;
  readonly horizonSteps: number;
  readonly source: BenchmarkCandidateSourceFixture;
  readonly label?: string | null;
}

/** Mirror of LAB-017 `BenchmarkSweepDimension` + `BenchmarkAggregationRule`. */
export type BenchmarkSweepDimensionFixture = 'seed' | 'world-model';
export type BenchmarkAggregationRuleFixture = 'pooled-mean' | 'worst-world-mean';

/** Mirror of LAB-017 `BenchmarkWorldModelRef`. */
export interface BenchmarkWorldModelRefFixture {
  readonly ensembleId: WorldModelEnsembleIdFixture;
  readonly ensembleVersion: number;
  readonly label: string;
}

/** Mirror of LAB-017 `RobustnessPolicy`. */
export interface RobustnessPolicyFixture {
  readonly id: string;
  readonly version: number;
  readonly seedBudget: number;
  readonly worldModelSet: readonly BenchmarkWorldModelRefFixture[];
  readonly sweepDimensions: readonly BenchmarkSweepDimensionFixture[];
  readonly aggregation: BenchmarkAggregationRuleFixture;
  readonly tieBreak: 'expected-desc-halfwidth-asc-key-asc';
  readonly note: string;
}

/** Mirror of LAB-017 `BenchmarkCalibrationCitation`. */
export interface BenchmarkCalibrationCitationFixture {
  readonly version: number;
  readonly statement: string;
}

// ——— robust-benchmark-result.ts mirrors ———

/** Mirror of LAB-017 `BenchmarkUncertaintyBreakdown` (bench-additive-v1). */
export interface BenchmarkUncertaintyBreakdownFixture {
  readonly memberDisagreementHalfWidth: number;
  readonly seedRobustnessHalfWidth: number;
  readonly worldModelSpreadHalfWidth: number;
  readonly totalHalfWidth: number;
  readonly formula: 'bench-additive-v1';
  readonly aggregation: BenchmarkAggregationRuleFixture;
}

/** Mirror of LAB-017 `BenchmarkSeedRobustness`. */
export interface BenchmarkSeedRobustnessFixture {
  readonly seeds: readonly number[];
  readonly perSeedExpected: readonly number[];
  readonly spread: number;
  readonly halfSpread: number;
  readonly relativeSpread: number;
}

/** Mirror of LAB-017 `BenchmarkWorldModelEvaluation` + `BenchmarkWorldRobustness`. */
export interface BenchmarkWorldModelEvaluationFixture {
  readonly ensembleId: WorldModelEnsembleIdFixture;
  readonly ensembleVersion: number;
  readonly label: string;
  readonly expectedReward: number;
}

export interface BenchmarkWorldRobustnessFixture {
  readonly perWorld: readonly BenchmarkWorldModelEvaluationFixture[];
  readonly spread: number;
  readonly halfSpread: number;
  readonly worstExpectedReward: number;
  readonly bestExpectedReward: number;
}

/** Mirror of LAB-017 `BenchmarkDisagreement` (per-world member spread). */
export interface BenchmarkDisagreementFixture {
  readonly perWorld: readonly {
    readonly ensembleId: WorldModelEnsembleIdFixture;
    readonly ensembleVersion: number;
    readonly label: string;
    readonly memberExpected: readonly number[];
    readonly spread: number;
    readonly halfSpread: number;
  }[];
  readonly worstHalfWidth: number;
}

/** Mirror of LAB-017 `BenchmarkOodSignal` (vs DECLARED coverage). */
export interface BenchmarkOodSignalFixture {
  readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
  readonly flagged: boolean;
  readonly perWorld: readonly {
    readonly ensembleId: WorldModelEnsembleIdFixture;
    readonly ensembleVersion: number;
    readonly label: string;
    readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
    readonly flagged: boolean;
    readonly maxDistance: number;
  }[];
}

/** Mirror of LAB-017 `BenchmarkCalibrationDeclaration` (pending reality). */
export interface BenchmarkCalibrationDeclarationFixture {
  readonly status: 'pending-reality';
  readonly provenance: 'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten';
  readonly predictionSurface: 'per-candidate expected reward + interval';
}

/** Mirror of LAB-017 `BenchmarkCandidateEvaluation` (counterfactual PIN). */
export interface BenchmarkCandidateEvaluationFixture {
  readonly expectedReward: number;
  readonly interval: PredictionIntervalFixture;
  readonly uncertainty: UncertaintySummary;
  readonly breakdown: BenchmarkUncertaintyBreakdownFixture;
  readonly seedRobustness: BenchmarkSeedRobustnessFixture;
  readonly worldRobustness: BenchmarkWorldRobustnessFixture;
  readonly disagreement: BenchmarkDisagreementFixture;
  readonly ood: BenchmarkOodSignalFixture;
  readonly calibration: BenchmarkCalibrationDeclarationFixture;
  readonly counterfactual: true;
  readonly disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles';
}

/** Mirror of LAB-017 `BenchmarkWorldModelPin` + `BenchmarkCandidateProvenance`. */
export interface BenchmarkWorldModelPinFixture {
  readonly ensembleId: WorldModelEnsembleIdFixture;
  readonly ensembleVersion: number;
  readonly weightingPolicyId: string;
  readonly weightingPolicyVersion: number;
  readonly weightingKind: 'uniform' | 'declared-member-weights';
  readonly memberWorldModelVersions: readonly number[];
}

export interface BenchmarkCandidateProvenanceFixture {
  readonly origin: BenchmarkCandidateOriginFixture;
  readonly candidateSource: BenchmarkCandidateSourceFixture;
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly seeds: readonly number[];
  readonly horizonSteps: number;
  readonly worldModels: readonly BenchmarkWorldModelPinFixture[];
}

/** Mirror of LAB-017 `BenchmarkIntervalOverlapDeclaration` + baseline comparison. */
export interface BenchmarkIntervalOverlapDeclarationFixture {
  readonly overlaps: boolean;
  readonly note: string;
}

export interface BenchmarkBaselineComparisonFixture {
  readonly baselineExpectedReward: number;
  readonly expectedRewardDelta: number;
  readonly intervalOverlapWithBaseline: BenchmarkIntervalOverlapDeclarationFixture;
  readonly certainlyBetterThanBaseline: boolean;
}

/** Mirror of LAB-017 `RankedBenchmarkCandidate`. */
export interface RankedBenchmarkCandidateFixture {
  readonly rank: number;
  readonly key: string;
  readonly label: string | null;
  readonly origin: BenchmarkCandidateOriginFixture;
  readonly candidate: BenchmarkCandidateFixture;
  readonly evaluation: BenchmarkCandidateEvaluationFixture;
  readonly provenance: BenchmarkCandidateProvenanceFixture;
  readonly comparisonToBaseline: BenchmarkBaselineComparisonFixture;
  readonly intervalOverlapWithLeader: BenchmarkIntervalOverlapDeclarationFixture | null;
}

/** Mirror of LAB-017 `BenchmarkFairnessPin` + `BenchmarkProvenance`. */
export interface BenchmarkFairnessPinFixture {
  readonly seeds: readonly number[];
  readonly worldModelSet: readonly BenchmarkWorldModelRefFixture[];
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardSpecVersion: number;
  readonly statement: string;
}

export interface BenchmarkProvenanceFixture {
  readonly simulatorVersion: number;
  readonly corpusVersion: number;
  readonly rewardSpecVersion: number;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly seeds: readonly number[];
  readonly sweepDimensions: readonly BenchmarkSweepDimensionFixture[];
  readonly worldModels: readonly BenchmarkWorldModelPinFixture[];
}

/**
 * Mirror of LAB-017 `RobustBenchmarkResult` — the frozen, counterfactual,
 * §24-stamped result with the structurally-required no-op baseline.
 */
export interface RobustBenchmarkResultFixture {
  readonly id: LabBenchmarkIdFixture;
  readonly tenantId: TenantId;
  readonly scenarioRef: LabScenarioId;
  readonly ranked: readonly RankedBenchmarkCandidateFixture[];
  readonly comparison: {
    readonly noopBaseline: RankedBenchmarkCandidateFixture;
    readonly declared: readonly RankedBenchmarkCandidateFixture[];
  };
  readonly policy: RobustnessPolicyFixture;
  readonly seeds: readonly number[];
  readonly fairness: BenchmarkFairnessPinFixture;
  readonly provenance: BenchmarkProvenanceFixture;
  readonly benchmarkedAt: Timestamp;
  readonly counterfactual: true;
  readonly disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles';
  readonly labOnly: string;
  readonly calibration: BenchmarkCalibrationDeclarationFixture;
  readonly citedCalibrationContext: BenchmarkCalibrationCitationFixture | null;
}

/** Mirror of LAB-017 `RobustBenchmarkRecord` (append-only chain bookkeeping). */
export interface RobustBenchmarkRecordFixture extends RobustBenchmarkResultFixture {
  readonly version: Version;
  readonly resultDigest: string;
  readonly recordedAt: Timestamp;
}

/** Mirror of LAB-017 `BenchmarkIntegrityReport`. */
export interface BenchmarkIntegrityReportFixture {
  readonly benchmarkId: LabBenchmarkIdFixture;
  readonly version: number;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

// ——— online-calibration.ts mirrors ———

/** Mirror of LAB-018 `CalibrationPredictionRef` (the LAB-017 seam). */
export interface CalibrationPredictionRefFixture {
  readonly benchmarkId: LabBenchmarkIdFixture;
  readonly benchmarkVersion: number;
  readonly candidateKey: string;
}

/** Mirror of LAB-018 `CalibrationPredictedStatement` (copied verbatim). */
export interface CalibrationPredictedStatementFixture {
  readonly expectedReward: number;
  readonly interval: PredictionIntervalFixture;
  readonly uncertainty: UncertaintySummary;
  readonly provenance: BenchmarkCandidateProvenanceFixture;
}

/** Mirror of LAB-018 `CalibrationObservationCitation` (boundary chain). */
export interface CalibrationObservationCitationFixture {
  readonly observationId: HistoricalObservationIdFixture;
  readonly niche: string;
  readonly platform: string;
  readonly observedAt: Timestamp;
  readonly sourceRefs: readonly string[];
  readonly regime: string;
}

/** Mirror of LAB-018 `CalibrationErrorFunctional` (frozen v1). */
export interface CalibrationErrorFunctionalFixture {
  readonly id: 'calib-signed-error-v1';
  readonly version: 1;
  readonly note: string;
}

/** Mirror of LAB-008 `ObservedMetricMean`. */
export interface ObservedMetricMeanFixture {
  readonly metric: string;
  readonly mean: number;
  readonly unit: string;
}

/** Mirror of LAB-018 `OnlineCalibrationRecord` — the prediction-error record. */
export interface OnlineCalibrationRecordFixture {
  readonly id: LabCalibrationIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly prediction: CalibrationPredictionRefFixture;
  readonly predicted: CalibrationPredictedStatementFixture;
  readonly observations: readonly CalibrationObservationCitationFixture[];
  readonly observedMetricMeans: readonly ObservedMetricMeanFixture[];
  readonly observedOutcome: number;
  readonly rewardSpecVersion: number;
  readonly functional: CalibrationErrorFunctionalFixture;
  readonly signedError: number;
  readonly absoluteError: number;
  readonly relativeError: number;
  readonly intervalContainment: boolean;
  readonly regime: string;
  readonly note: string | null;
  readonly recordedAt: Timestamp;
  readonly errorDigest: string;
  readonly recordKind: 'lab-calibration-analysis';
  readonly disclosure: 'calibration-analysis-over-frozen-benchmark-and-declared-reality-observations';
  readonly labOnly: string;
}

// ——— online-calibration-port.ts mirrors ———

/** Mirror of LAB-018 `CalibrationContextSummary` + citations + context record. */
export interface CalibrationContextSummaryFixture {
  readonly errorRecordCount: number;
  readonly meanSignedError: number;
  readonly meanAbsoluteError: number;
  readonly worstAbsoluteError: number;
  readonly intervalCoverage: number;
  readonly calibratedBenchmarkVersions: readonly number[];
  readonly regimes: readonly string[];
}

export interface CalibrationErrorRecordCitationFixture {
  readonly calibrationId: LabCalibrationIdFixture;
  readonly version: number;
}

export interface CalibrationContextRecordFixture {
  readonly benchmarkId: LabBenchmarkIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly summary: CalibrationContextSummaryFixture;
  readonly errorRecords: readonly CalibrationErrorRecordCitationFixture[];
  readonly derivedAt: Timestamp;
  readonly contextDigest: string;
  readonly recordKind: 'lab-calibration-context';
  readonly disclosure: 'derived-calibration-context-for-benchmark-citation';
  readonly labOnly: string;
}

/** Mirror of LAB-018 `CalibrationIntegrityReport` + context integrity report. */
export interface CalibrationIntegrityReportFixture {
  readonly calibrationId: LabCalibrationIdFixture;
  readonly version: number;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

export interface CalibrationContextIntegrityReportFixture {
  readonly benchmarkId: LabBenchmarkIdFixture;
  readonly version: number;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

// ——— shared fixture context (the scenario the benchmarks cite) ———

/**
 * The scenario fixture the benchmark records cite (the `LabScenario`
 * contract is already a contracts type — used AS IS, not mirrored).
 */
export interface LabScenarioFixtureEntry {
  readonly scenario: LabScenario;
}

/** Exact-tenant scope check for the seam's read guards (§31, no existence leaks). */
export function sameLabTenant(scope: TenantScope, tenantId: string): boolean {
  return scope.tenantId === tenantId;
}
