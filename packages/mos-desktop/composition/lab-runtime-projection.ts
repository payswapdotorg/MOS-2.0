import type {
  BenchmarkIntegrityReport,
  CalibrationContextRecord,
  OnlineCalibrationRecord,
  RobustBenchmarkRecord,
} from '@mos/lab';
import type {
  LabBenchmarkCandidateView,
  LabBenchmarkDigestView,
  LabBenchmarkSummaryView,
  LabCalibrationChainView,
  LabCalibrationContextView,
  LabCalibrationRecordView,
} from '@mos/web';

/**
 * REAL-record → view-model projection for the Lab surface (MOS v2.0
 * desktop shell, UX-003 over LAB-017 + LAB-018).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline): projects the
 * REAL `@mos/lab` runtime records (`RobustBenchmarkRecord`,
 * `OnlineCalibrationRecord`, `CalibrationContextRecord` — imported as
 * TYPES ONLY here; the runtime factories are wired in
 * production-lab-surface.ts) into the web package's presentation view
 * models. The projection is DERIVED, never creative: every view-model
 * field is a projection, count or verbatim relay of a real record field.
 * The §20/§24 counterfactual flags, the §22 intervals and the
 * pending-reality calibration declarations relay VERBATIM — this code will
 * never invent, soften or launder them.
 *
 * Fail-closed discipline (production difference from the testing seam):
 * the digest views carry the integrity state from the REAL runtime's
 * digest verification (never an assumed `intact`), and unknown record
 * shapes throw {@link labProjectionImpossible} — the port wrappers in
 * production-lab-surface.ts convert those throws into the surfaces' typed
 * `unavailable` failures, so the shell renders an explicit failure instead
 * of guessed data.
 */

/**
 * The scenario lookup the benchmark summaries need (niche/platform
 * display). The REAL lab scenario registry (the corpus/feature surfaces
 * that carry niche + platform) is a lab-authority read model this release
 * does not bind — the lookup below is therefore EMPTY, which makes every
 * non-empty benchmark listing fail closed with a named message instead of
 * guessing a scenario the record does not carry. Fresh tenant-scoped state
 * has zero benchmark chains, so the honest fresh listing is `[]`.
 */
export const EMPTY_LAB_SCENARIO_LOOKUP = {
  scenarioOf: (_scenarioRef: string): null => null,
} as const;

/** The scenario lookup contract the projections consume. */
export interface LabScenarioLookup {
  readonly scenarioOf: (
    scenarioRef: string,
  ) => { readonly niche: string; readonly platform: string } | null;
}

/** Fail-loud helper for impossible record shapes (never silently defaulted). */
export function labProjectionImpossible(shape: string): never {
  throw new Error(
    `lab-runtime-projection: the lab runtime reported a record shape this projection cannot project: ${shape}`,
  );
}

/** One ranked candidate → the candidate view model (counterfactual flag relayed). */
export function benchmarkCandidateViewOf(
  candidate: RobustBenchmarkRecord['ranked'][number],
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
    comparisonToBaseline: {
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
  latest: RobustBenchmarkRecord,
  versionCount: number,
  scenarios: LabScenarioLookup,
): LabBenchmarkSummaryView {
  const scenario = scenarios.scenarioOf(String(latest.scenarioRef));
  if (scenario === null) {
    labProjectionImpossible(
      `benchmark ${String(latest.id)} cites scenario ${String(latest.scenarioRef)} whose niche/platform this release cannot resolve (the lab scenario registry read model is not bound)`,
    );
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

/**
 * One frozen record version → the full digest view model. The integrity
 * state comes from the REAL runtime's digest verification report — never
 * assumed.
 */
export function benchmarkDigestViewOf(
  record: RobustBenchmarkRecord,
  chainSummary: LabBenchmarkSummaryView,
  integrity: BenchmarkIntegrityReport,
): LabBenchmarkDigestView {
  return {
    summary: chainSummary,
    version: record.version,
    recordedAt: String(record.recordedAt),
    integrity: {
      status: integrity.status,
      digest: integrity.recordedDigest,
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

/**
 * One prediction-error record → the calibration record view model. The
 * counterfactual prediction side relays the disclosure of the CITED frozen
 * benchmark record (resolved by the caller from the REAL runtime — never
 * hardcoded), and the integrity STATUS comes from the REAL runtime's
 * digest verification (the digest itself is the record's own sealed
 * digest) — so the two sides stay visibly distinct (§20, lock rule 29).
 */
export function calibrationRecordViewOf(
  record: OnlineCalibrationRecord,
  benchmarkDisclosure: string,
  integrityStatus: 'intact' | 'tampered',
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
      disclosure: benchmarkDisclosure,
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
      status: integrityStatus,
      digest: record.errorDigest,
    },
    labOnly: record.labOnly,
  };
}

/** One derived context record → the context view model. */
export function calibrationContextViewOf(
  context: CalibrationContextRecord,
  integrityStatus: 'intact' | 'tampered',
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
      status: integrityStatus,
      digest: context.contextDigest,
    },
    labOnly: context.labOnly,
  };
}

/** The chain inputs the calibration listing folds into a status view. */
export interface CalibrationChainInputs {
  readonly records: readonly OnlineCalibrationRecord[];
  /** The REAL digest-verification report of the latest error record. */
  readonly latestIntegrity: { readonly status: 'intact' | 'tampered' };
  /**
   * The latest derived context with its REAL digest-verification status,
   * or `null` (calibration pending — the FIRST-CLASS honest state).
   */
  readonly context:
    | { readonly record: CalibrationContextRecord; readonly integrityStatus: 'intact' | 'tampered' }
    | null;
}

/**
 * One calibration chain's status view model: record counts, the latest
 * record's integrity, the distinct regimes folded and the derived context
 * (or `null` — the FIRST-CLASS calibration-pending state).
 */
export function calibrationChainViewOf(inputs: CalibrationChainInputs): LabCalibrationChainView {
  const records = inputs.records;
  if (records.length === 0) {
    labProjectionImpossible('a calibration chain with zero records cannot produce a status view');
  }
  const latest = records[records.length - 1] as OnlineCalibrationRecord;
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
    latestIntegrity: inputs.latestIntegrity.status,
    context:
      inputs.context === null
        ? null
        : calibrationContextViewOf(inputs.context.record, inputs.context.integrityStatus),
    regimes: [...regimes].sort(),
  };
}
