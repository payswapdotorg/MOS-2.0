import type {
  LabBenchmarkCandidateView,
  LabBenchmarkDigestFailure,
  LabBenchmarkDigestView,
  LabBenchmarkSummaryView,
} from '../dist/src/ports/lab-benchmark.js';
import type {
  LabCalibrationChainView,
  LabCalibrationContextView,
  LabCalibrationRecordView,
  LabCalibrationStatusFailure,
} from '../dist/src/ports/lab-calibration.js';
import type {
  CalibrationContextRecordFixture,
  OnlineCalibrationRecordFixture,
  RankedBenchmarkCandidateFixture,
  RobustBenchmarkRecordFixture,
} from './lab-fixture-shapes.js';
import { sameLabTenant } from './lab-fixture-shapes.js';

/**
 * REAL-shape → view-model adapter for the Lab surface (UX-003).
 *
 * Composition seam (OUTSIDE `src/`): adapts records in the REAL
 * LAB-017/LAB-018 shapes (`lab-fixture-shapes.ts` mirrors — field-for-field
 * the authority's stored records) into the web package's presentation view
 * models. The adapter is DERIVED, never creative: every view-model field is
 * a projection, count or verbatim relay of a REAL record field. The §20/§24
 * counterfactual flags, the §22 intervals and the pending-reality
 * calibration declarations relay VERBATIM — the one thing this adapter will
 * never do is invent, soften or launder them.
 */

/** Fail-loud helper for impossible record shapes (never silently defaulted). */
function impossible(shape: string): never {
  throw new Error(
    `lab-shape-adapter: the lab authority reported a record shape this adapter cannot project: ${shape}`,
  );
}

/** The scenario lookup the benchmark summaries need (niche/platform display). */
export interface LabScenarioLookup {
  readonly scenarioOf: (
    scenarioRef: string,
  ) => { readonly niche: string; readonly platform: string } | null;
}

/** One ranked candidate → the candidate view model (counterfactual flag relayed). */
export function benchmarkCandidateViewOf(
  candidate: RankedBenchmarkCandidateFixture,
): LabBenchmarkCandidateView {
  const evaluation = candidate.evaluation;
  return {
    rank: candidate.rank,
    key: candidate.key,
    label: candidate.label,
    origin: candidate.origin,
    expectedReward: evaluation.expectedReward,
    interval: { ...evaluation.interval },
    totalHalfWidth: evaluation.breakdown.totalHalfWidth,
    breakdown: {
      formula: evaluation.breakdown.formula,
      memberDisagreementHalfWidth: evaluation.breakdown.memberDisagreementHalfWidth,
      seedRobustnessHalfWidth: evaluation.breakdown.seedRobustnessHalfWidth,
      worldModelSpreadHalfWidth: evaluation.breakdown.worldModelSpreadHalfWidth,
      aggregation: evaluation.breakdown.aggregation,
    },
    seedRobustness: {
      seedCount: evaluation.seedRobustness.seeds.length,
      spread: evaluation.seedRobustness.spread,
      halfSpread: evaluation.seedRobustness.halfSpread,
      relativeSpread: evaluation.seedRobustness.relativeSpread,
    },
    worldRobustness: {
      perWorld: evaluation.worldRobustness.perWorld.map((world) => ({
        label: world.label,
        ensembleVersion: world.ensembleVersion,
        expectedReward: world.expectedReward,
      })),
      worstExpectedReward: evaluation.worldRobustness.worstExpectedReward,
      bestExpectedReward: evaluation.worldRobustness.bestExpectedReward,
      spread: evaluation.worldRobustness.spread,
    },
    disagreement: {
      perWorld: evaluation.disagreement.perWorld.map((world) => ({
        label: world.label,
        ensembleVersion: world.ensembleVersion,
        halfSpread: world.halfSpread,
      })),
      worstHalfWidth: evaluation.disagreement.worstHalfWidth,
    },
    ood: {
      status: evaluation.ood.status,
      flagged: evaluation.ood.flagged,
      perWorld: evaluation.ood.perWorld.map((world) => ({
        label: world.label,
        status: world.status,
        flagged: world.flagged,
        maxDistance: world.maxDistance,
      })),
    },
    comparisonToBaseline:
      candidate.comparisonToBaseline === null
        ? null
        : {
            baselineExpectedReward: candidate.comparisonToBaseline.baselineExpectedReward,
            expectedRewardDelta: candidate.comparisonToBaseline.expectedRewardDelta,
            overlaps: candidate.comparisonToBaseline.intervalOverlapWithBaseline.overlaps,
            certainlyBetter: candidate.comparisonToBaseline.certainlyBetterThanBaseline,
          },
    intervalOverlapWithLeader:
      candidate.intervalOverlapWithLeader === null
        ? null
        : { overlaps: candidate.intervalOverlapWithLeader.overlaps },
    counterfactual: evaluation.counterfactual,
    calibration: {
      status: evaluation.calibration.status,
      provenance: evaluation.calibration.provenance,
    },
  };
}

/** One record chain's LATEST record → the directory listing view model. */
export function benchmarkSummaryViewOf(
  latest: RobustBenchmarkRecordFixture,
  versionCount: number,
  scenarios: LabScenarioLookup,
): LabBenchmarkSummaryView {
  const scenario = scenarios.scenarioOf(String(latest.scenarioRef));
  if (scenario === null) {
    impossible(`benchmark ${String(latest.id)} cites unknown scenario ${String(latest.scenarioRef)}`);
  }
  return {
    benchmarkId: String(latest.id),
    tenantId: latest.tenantId,
    scenarioRef: latest.scenarioRef,
    scenarioNiche: scenario.niche,
    scenarioPlatform: scenario.platform,
    latestVersion: latest.version,
    versionCount,
    policyId: latest.policy.id,
    policyVersion: latest.policy.version,
    rewardSpecVersion: latest.provenance.rewardSpecVersion,
    declaredCandidateCount: latest.comparison.declared.length,
    benchmarkedAt: String(latest.benchmarkedAt),
    citedCalibrationContextVersion:
      latest.citedCalibrationContext === null ? null : latest.citedCalibrationContext.version,
    counterfactual: latest.counterfactual,
    calibration: {
      status: latest.calibration.status,
      provenance: latest.calibration.provenance,
    },
  };
}

/** One frozen record version → the full digest view model. */
export function benchmarkDigestViewOf(
  record: RobustBenchmarkRecordFixture,
  chainSummary: LabBenchmarkSummaryView,
): LabBenchmarkDigestView {
  return {
    summary: chainSummary,
    version: record.version,
    recordedAt: String(record.recordedAt),
    integrity: {
      status: 'intact',
      digest: record.resultDigest,
    },
    policy: {
      id: record.policy.id,
      version: record.policy.version,
      seedBudget: record.policy.seedBudget,
      seeds: [...record.seeds],
      sweepDimensions: [...record.policy.sweepDimensions],
      aggregation: record.policy.aggregation,
      tieBreak: record.policy.tieBreak,
      worldModelSet: record.policy.worldModelSet.map((world) => ({
        ensembleId: String(world.ensembleId),
        ensembleVersion: world.ensembleVersion,
        label: world.label,
      })),
      note: record.policy.note,
    },
    provenance: {
      simulatorVersion: record.provenance.simulatorVersion,
      corpusVersion: record.provenance.corpusVersion,
      rewardSpecVersion: record.provenance.rewardSpecVersion,
      worldModels: record.provenance.worldModels.map((world) => ({
        ensembleId: String(world.ensembleId),
        ensembleVersion: world.ensembleVersion,
        weightingKind: world.weightingKind,
        memberWorldModelVersionCount: world.memberWorldModelVersions.length,
      })),
    },
    fairnessStatement: record.fairness.statement as LabBenchmarkDigestView['fairnessStatement'],
    noopBaseline: benchmarkCandidateViewOf(record.comparison.noopBaseline),
    declaredCandidates: record.comparison.declared.map(benchmarkCandidateViewOf),
    citedCalibrationContext:
      record.citedCalibrationContext === null
        ? null
        : {
            version: record.citedCalibrationContext.version,
            statement: record.citedCalibrationContext.statement,
          },
    counterfactual: record.counterfactual,
    disclosure: record.disclosure,
    labOnly: record.labOnly,
  };
}

/** One prediction-error record → the calibration record view model. */
export function calibrationRecordViewOf(
  record: OnlineCalibrationRecordFixture,
): LabCalibrationRecordView {
  return {
    calibrationId: String(record.id),
    version: record.version,
    tenantId: record.tenantId,
    benchmarkRef: {
      benchmarkId: String(record.prediction.benchmarkId),
      benchmarkVersion: record.prediction.benchmarkVersion,
      candidateKey: record.prediction.candidateKey,
    },
    predicted: {
      expectedReward: record.predicted.expectedReward,
      interval: { ...record.predicted.interval },
      uncertaintyLevel: record.predicted.uncertainty.level,
      counterfactual: true,
      disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles',
    },
    observed: {
      outcome: record.observedOutcome,
      observations: record.observations.map((observation) => ({
        observationId: String(observation.observationId),
        observedAt: String(observation.observedAt),
        regime: observation.regime,
        sourceRefCount: observation.sourceRefs.length,
        counterfactual: false,
      })),
    },
    rewardSpecVersion: record.rewardSpecVersion,
    functional: {
      id: record.functional.id,
      version: record.functional.version,
      note: record.functional.note,
    },
    errors: {
      signedError: record.signedError,
      absoluteError: record.absoluteError,
      relativeError: record.relativeError,
      intervalContainment: record.intervalContainment,
    },
    regime: record.regime,
    recordedAt: String(record.recordedAt),
    integrity: {
      status: 'intact',
      digest: record.errorDigest,
    },
    labOnly: record.labOnly,
  };
}

/** One derived context record → the context view model. */
export function calibrationContextViewOf(
  context: CalibrationContextRecordFixture,
): LabCalibrationContextView {
  return {
    benchmarkId: String(context.benchmarkId),
    version: context.version,
    tenantId: context.tenantId,
    derivedAt: String(context.derivedAt),
    summary: {
      errorRecordCount: context.summary.errorRecordCount,
      meanSignedError: context.summary.meanSignedError,
      meanAbsoluteError: context.summary.meanAbsoluteError,
      worstAbsoluteError: context.summary.worstAbsoluteError,
      intervalCoverage: context.summary.intervalCoverage,
      regimes: [...context.summary.regimes],
    },
    errorRecordCitations: context.errorRecords.map((citation) => ({
      calibrationId: String(citation.calibrationId),
      version: citation.version,
    })),
    integrity: {
      status: 'intact',
      digest: context.contextDigest,
    },
    labOnly: context.labOnly,
  };
}

/**
 * One calibration chain's status view model: record counts, the latest
 * record's integrity, the distinct regimes folded and the derived context
 * (or `null` — the FIRST-CLASS calibration-pending state).
 */
export function calibrationChainViewOf(
  records: readonly OnlineCalibrationRecordFixture[],
  context: CalibrationContextRecordFixture | null,
): LabCalibrationChainView {
  if (records.length === 0) {
    impossible('a calibration chain with zero records cannot produce a status view');
  }
  const latest = records[records.length - 1] as OnlineCalibrationRecordFixture;
  const regimes = new Set<string>();
  for (const record of records) {
    regimes.add(record.regime);
  }
  return {
    calibrationId: String(latest.id),
    benchmarkId: String(latest.prediction.benchmarkId),
    tenantId: latest.tenantId,
    errorRecordCount: records.length,
    latestErrorVersion: latest.version,
    latestErrorAt: String(latest.recordedAt),
    latestIntegrity: 'intact',
    context: context === null ? null : calibrationContextViewOf(context),
    regimes: [...regimes].sort(),
  };
}

/** Benchmark-digest failure constructors (typed, never thrown). */
export function labBenchmarkFailure(
  error: LabBenchmarkDigestFailure['error'],
  message: string,
): LabBenchmarkDigestFailure {
  return { error, message };
}

/** Calibration failure constructors (typed, never thrown). */
export function labCalibrationFailure(
  error: LabCalibrationStatusFailure['error'],
  message: string,
): LabCalibrationStatusFailure {
  return { error, message };
}

/** Exact-tenant scope check re-export for the seam's read guards (§31). */
export { sameLabTenant };
