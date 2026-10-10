import type { TenantId, Timestamp } from '@mos/contracts';
import type {
  CalibrationContextRecordFixture,
  LabCalibrationIdFixture,
  OnlineCalibrationRecordFixture,
} from './lab-fixture-shapes.js';
import { digestOf } from './lab-fixture-support.js';

/**
 * REAL-shaped LAB-018 calibration fixture records (UX-003 composition seam).
 *
 * The data is DISCLOSED synthetic fixture material in the EXACT record
 * shapes the online-calibration authority appends
 * (`OnlineCalibrationRecordFixture` / `CalibrationContextRecordFixture` —
 * the field-for-field mirrors). The prediction side cites the frozen
 * benchmark fixture statements (LAB-017 seam); the observation side carries
 * boundary-chain `HistoricalObservation` citations with
 * `counterfactual: false` semantics (rendered as measured reality). Numbers
 * are hand-checkable: signed error = observed − predicted, the §22 interval
 * containment is consistent with the cited interval, and the derived
 * context summary matches its folded records.
 *
 * Chains (append-only, tenant-scoped):
 * - calib-reach-1 (tenant-demo) — 2 error records over bench-reach-v1, with
 *   a derived context v1 (the CALIBRATION-ACTIVE case);
 * - calib-launch-1 (tenant-demo) — 1 error record over bench-launch-v2,
 *   NO context derived (the honest CALIBRATION-PENDING case);
 * - calib-other-1 (tenant-other) — cross-tenant isolation (§31).
 */

const CALIBRATION_FUNCTIONAL = {
  id: 'calib-signed-error-v1',
  version: 1,
  note: 'declared v1 functional: signed reality-minus-prediction error with absolute/relative decomposition and §22 interval containment',
} as const;

const CALIBRATION_LAB_ONLY =
  'calibration analysis records simulation-to-reality prediction error for the frozen benchmark prediction it cites — it never becomes an experiment or measurement authority (§19/§20), never rewrites the benchmark record or the historical observations, and feeds back only as DECLARED versioned context the benchmark may cite (§24)';

const CONTEXT_LAB_ONLY =
  'the calibration context is DECLARED versioned analysis feedback a later benchmark run may cite — it never implies calibrated simulator output, never becomes an experiment/measurement authority, and never rewrites the error records or benchmark records it summarizes';

const reachV1Clip5Prediction = {
  benchmarkId: 'bench-reach-v1' as never,
  benchmarkVersion: 1,
  candidateKey: 'clip-5',
};

const reachV2Remix2Prediction = {
  benchmarkId: 'bench-reach-v1' as never,
  benchmarkVersion: 2,
  candidateKey: 'remix-2',
};

const launchTeaserPrediction = {
  benchmarkId: 'bench-launch-v2' as never,
  benchmarkVersion: 1,
  candidateKey: 'teaser-2',
};

/**
 * Build one prediction-error record. The predicted statement is copied
 * VERBATIM from the cited benchmark fixture evaluation (the authority's
 * discipline: never reinterpreted), and the error fields are derived
 * additively-consistently (signed = observed − predicted).
 */
const calibrationRecordOf = (input: {
  readonly id: LabCalibrationIdFixture;
  readonly tenantId: TenantId;
  readonly version: number;
  readonly prediction: OnlineCalibrationRecordFixture['prediction'];
  readonly predicted: OnlineCalibrationRecordFixture['predicted'];
  readonly observations: OnlineCalibrationRecordFixture['observations'];
  readonly observedOutcome: number;
  readonly regime: string;
  readonly recordedAt: Timestamp;
  readonly note: string | null;
}): OnlineCalibrationRecordFixture => {
  const signedError = Number((input.observedOutcome - input.predicted.expectedReward).toFixed(2));
  const absoluteError = Number(Math.abs(signedError).toFixed(2));
  const relativeError = Number(
    (Math.abs(signedError) / Math.max(Math.abs(input.predicted.expectedReward), 1e-9)).toFixed(3),
  );
  return {
    id: input.id,
    version: input.version as never,
    tenantId: input.tenantId,
    prediction: input.prediction,
    predicted: input.predicted,
    observations: input.observations,
    observedMetricMeans: [
      { metric: 'qualified-reach', mean: input.observedOutcome, unit: 'k-reach' },
    ],
    observedOutcome: input.observedOutcome,
    rewardSpecVersion: 2,
    functional: CALIBRATION_FUNCTIONAL,
    signedError,
    absoluteError,
    relativeError,
    intervalContainment:
      input.observedOutcome >= input.predicted.interval.lower &&
      input.observedOutcome <= input.predicted.interval.upper,
    regime: input.regime,
    note: input.note,
    recordedAt: input.recordedAt,
    errorDigest: digestOf(`${String(input.id)}-v${input.version}`),
    recordKind: 'lab-calibration-analysis',
    disclosure:
      'calibration-analysis-over-frozen-benchmark-and-declared-reality-observations',
    labOnly: CALIBRATION_LAB_ONLY,
  };
};

const observation = (
  id: string,
  observedAt: string,
  regime: string,
  sourceCount: number,
): OnlineCalibrationRecordFixture['observations'][number] => ({
  observationId: id as never,
  niche: 'sourdough-baking',
  platform: 'short-video',
  observedAt: observedAt as Timestamp,
  sourceRefs: Array.from({ length: sourceCount }, (_, index) => `source:${id}-${index + 1}`),
  regime,
});

/** calib-reach-1 v1 — reality fell OUTSIDE the predicted interval (over-estimated). */
export const FIXTURE_CALIB_REACH_V1: OnlineCalibrationRecordFixture = calibrationRecordOf({
  id: 'calib-reach-1' as LabCalibrationIdFixture,
  tenantId: 'tenant-demo' as TenantId,
  version: 1,
  prediction: reachV1Clip5Prediction,
  predicted: {
    // verbatim from the bench-reach-v1 v1 clip-5 evaluation
    expectedReward: 24.6,
    interval: { lower: 18.7, upper: 30.5 },
    uncertainty: { level: 'moderate', note: 'bench-additive-v1 over the declared world-model set and seed budget' },
    provenance: {
      origin: 'hand-designed',
      candidateSource: {
        origin: 'hand-designed',
        producerPins: [],
        note: 'hand-designed by the growth operator',
      },
      simulatorVersion: 4,
      rewardSpecVersion: 2,
      policyId: 'policy-robust-reach',
      policyVersion: 1,
      seeds: [11, 23, 37, 41],
      horizonSteps: 12,
      worldModels: [
        {
          ensembleId: 'ensemble-reach-primary' as never,
          ensembleVersion: 3,
          weightingPolicyId: 'weight-uniform-v1',
          weightingPolicyVersion: 1,
          weightingKind: 'uniform',
          memberWorldModelVersions: [4, 2],
        },
        {
          ensembleId: 'ensemble-reach-pessimistic' as never,
          ensembleVersion: 2,
          weightingPolicyId: 'weight-uniform-v1',
          weightingPolicyVersion: 1,
          weightingKind: 'uniform',
          memberWorldModelVersions: [3, 5],
        },
      ],
    },
  },
  observations: [
    observation('obs-reach-2026w28a', '2026-07-13T00:00:00.000Z', 'baseline', 2),
    observation('obs-reach-2026w28b', '2026-07-14T00:00:00.000Z', 'baseline', 1),
  ],
  observedOutcome: 17.2,
  regime: 'baseline',
  recordedAt: '2026-07-15T08:30:00.000Z' as Timestamp,
  note: 'first reality check of the reach loop — the daily cadence fatigued faster than the primary world predicted',
});

/** calib-reach-1 v2 — reality fell INSIDE the predicted interval (contained). */
export const FIXTURE_CALIB_REACH_V2: OnlineCalibrationRecordFixture = calibrationRecordOf({
  id: 'calib-reach-1' as LabCalibrationIdFixture,
  tenantId: 'tenant-demo' as TenantId,
  version: 2,
  prediction: reachV2Remix2Prediction,
  predicted: {
    // verbatim from the bench-reach-v1 v2 remix-2 evaluation
    expectedReward: 21.3,
    interval: { lower: 17.05, upper: 25.55 },
    uncertainty: { level: 'moderate', note: 'bench-additive-v1 over the declared world-model set and seed budget' },
    provenance: {
      origin: 'learned-strategy',
      candidateSource: {
        origin: 'learned-strategy',
        producerPins: [{ surface: 'strategy-learning', version: 3 }],
        note: 'learned from simulation experience under the declared stopping policy',
      },
      simulatorVersion: 4,
      rewardSpecVersion: 2,
      policyId: 'policy-robust-reach',
      policyVersion: 1,
      seeds: [11, 23, 37, 41],
      horizonSteps: 12,
      worldModels: [
        {
          ensembleId: 'ensemble-reach-primary' as never,
          ensembleVersion: 3,
          weightingPolicyId: 'weight-uniform-v1',
          weightingPolicyVersion: 1,
          weightingKind: 'uniform',
          memberWorldModelVersions: [4, 2],
        },
        {
          ensembleId: 'ensemble-reach-pessimistic' as never,
          ensembleVersion: 2,
          weightingPolicyId: 'weight-uniform-v1',
          weightingPolicyVersion: 1,
          weightingKind: 'uniform',
          memberWorldModelVersions: [3, 5],
        },
      ],
    },
  },
  observations: [
    observation('obs-reach-2026w30a', '2026-07-27T00:00:00.000Z', 'launch-promo', 3),
    observation('obs-reach-2026w30b', '2026-07-28T00:00:00.000Z', 'launch-promo', 2),
  ],
  observedOutcome: 22.9,
  regime: 'launch-promo',
  recordedAt: '2026-07-29T09:10:00.000Z' as Timestamp,
  note: 'the post-calibration run’s learned cadence landed inside its predicted interval',
});

/** calib-launch-1 v1 — one error record, NO context derived (calibration pending). */
export const FIXTURE_CALIB_LAUNCH_V1: OnlineCalibrationRecordFixture = calibrationRecordOf({
  id: 'calib-launch-1' as LabCalibrationIdFixture,
  tenantId: 'tenant-demo' as TenantId,
  version: 1,
  prediction: launchTeaserPrediction,
  predicted: {
    // verbatim from the bench-launch-v2 v1 teaser-2 evaluation
    expectedReward: 15.2,
    interval: { lower: 11.0, upper: 19.4 },
    uncertainty: { level: 'moderate', note: 'bench-additive-v1 over the declared world-model set and seed budget' },
    provenance: {
      origin: 'hand-designed',
      candidateSource: {
        origin: 'hand-designed',
        producerPins: [],
        note: 'two launch teasers ahead of the starter-kit offer',
      },
      simulatorVersion: 4,
      rewardSpecVersion: 2,
      policyId: 'policy-launch-conservative',
      policyVersion: 2,
      seeds: [7, 19],
      horizonSteps: 12,
      worldModels: [
        {
          ensembleId: 'ensemble-reach-primary' as never,
          ensembleVersion: 3,
          weightingPolicyId: 'weight-uniform-v1',
          weightingPolicyVersion: 1,
          weightingKind: 'uniform',
          memberWorldModelVersions: [4, 2],
        },
        {
          ensembleId: 'ensemble-reach-pessimistic' as never,
          ensembleVersion: 2,
          weightingPolicyId: 'weight-uniform-v1',
          weightingPolicyVersion: 1,
          weightingKind: 'uniform',
          memberWorldModelVersions: [3, 5],
        },
      ],
    },
  },
  observations: [observation('obs-launch-2026w29a', '2026-07-22T00:00:00.000Z', 'launch-promo', 2)],
  observedOutcome: 14.1,
  regime: 'launch-promo',
  recordedAt: '2026-07-23T11:45:00.000Z' as Timestamp,
  note: null,
});

/** calib-other-1 v1 — ANOTHER tenant’s chain (§31 isolation). */
export const FIXTURE_CALIB_OTHER_V1: OnlineCalibrationRecordFixture = {
  ...FIXTURE_CALIB_LAUNCH_V1,
  id: 'calib-other-1' as LabCalibrationIdFixture,
  tenantId: 'tenant-other' as TenantId,
  errorDigest: digestOf('calib-other-1-v1'),
};

/**
 * The derived calibration context v1 for bench-reach-v1 (the CALIBRATION-
 * ACTIVE case): folds calib-reach-1 v1+v2 — bias −2.90 (v1 −7.40, v2 +1.60),
 * MAE 4.50, worst 7.40, interval coverage 0.5 (v1 outside, v2 inside),
 * regimes [baseline, launch-promo].
 */
export const FIXTURE_CALIB_CONTEXT_REACH_V1: CalibrationContextRecordFixture = {
  benchmarkId: 'bench-reach-v1' as never,
  version: 1 as never,
  tenantId: 'tenant-demo' as TenantId,
  summary: {
    errorRecordCount: 2,
    meanSignedError: -2.9,
    meanAbsoluteError: 4.5,
    worstAbsoluteError: 7.4,
    intervalCoverage: 0.5,
    calibratedBenchmarkVersions: [1, 2],
    regimes: ['baseline', 'launch-promo'],
  },
  errorRecords: [
    { calibrationId: 'calib-reach-1' as LabCalibrationIdFixture, version: 1 },
    { calibrationId: 'calib-reach-1' as LabCalibrationIdFixture, version: 2 },
  ],
  derivedAt: '2026-07-30T07:55:00.000Z' as Timestamp,
  contextDigest: digestOf('calibration-context-bench-reach-v1-v1'),
  recordKind: 'lab-calibration-context',
  disclosure: 'derived-calibration-context-for-benchmark-citation',
  labOnly: CONTEXT_LAB_ONLY,
};

/** Every calibration error-record fixture, in chain order. */
export const FIXTURE_CALIBRATION_RECORDS: readonly OnlineCalibrationRecordFixture[] = [
  FIXTURE_CALIB_REACH_V1,
  FIXTURE_CALIB_REACH_V2,
  FIXTURE_CALIB_LAUNCH_V1,
  FIXTURE_CALIB_OTHER_V1,
];

/** Every derived context fixture. */
export const FIXTURE_CALIBRATION_CONTEXTS: readonly CalibrationContextRecordFixture[] = [
  FIXTURE_CALIB_CONTEXT_REACH_V1,
];
