import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RobustBenchmarkRecord } from '../contracts/robust-benchmark-port.js';
import type { MarketingBenchmarkPort } from '../contracts/robust-benchmark-port.js';
import type { HistoricalObservation } from '../contracts/evidence.js';
import type { RealityObservationReaderPort } from '../contracts/online-calibration.js';
import type { OnlineCalibrationPort } from '../contracts/online-calibration-port.js';
import { CALIBRATION_ERROR_FUNCTIONAL_V1 } from '../contracts/online-calibration.js';
import { createInMemoryOnlineCalibration } from './in-memory-online-calibration.js';
import {
  calibrationId,
  calibrationInput,
  calibrationLoop,
  observationIdOf,
  realityObservation,
  runFixtureBenchmark,
} from '../testing/w10a-calibration-fixtures.js';
import { FIXED_NOW } from '../testing/w10a-calibration-fixtures.js';
import { reachRewardSpec, scopeOf } from '../testing/w4a-lab-fixtures.js';

type RecordResult = Awaited<ReturnType<OnlineCalibrationPort['recordCalibrationError']>>;
type ContextResult = Awaited<ReturnType<OnlineCalibrationPort['deriveCalibrationContext']>>;

const expectFailure = (
  result: RecordResult,
  code: string,
): void => {
  if (!('error' in result)) {
    assert.fail(`expected typed failure ${code}, got a record (version ${result.version})`);
  }
  assert.equal(result.error, code);
  assert.ok(result.message.length > 0);
};

const expectContextFailure = (
  result: ContextResult,
  code: string,
): void => {
  if (!('error' in result)) {
    assert.fail(`expected typed failure ${code}, got a context (version ${result.version})`);
  }
  assert.equal(result.error, code);
  assert.ok(result.message.length > 0);
};

const asBenchmarkRecord = async (
  loop: Awaited<ReturnType<typeof calibrationLoop>>,
): Promise<RobustBenchmarkRecord> => {
  const result = await runFixtureBenchmark(loop.benchmark);
  if ('error' in result) {
    assert.fail(`unexpected benchmark error: ${result.error} — ${result.message}`);
  }
  return result;
};

/** A rigged benchmark reader: mutate the served record (double-cast smuggle). */
const riggedBenchmark = (
  port: MarketingBenchmarkPort,
  mutate: (record: RobustBenchmarkRecord) => RobustBenchmarkRecord,
): Pick<MarketingBenchmarkPort, 'getBenchmarkRecord' | 'resolveLatestBenchmarkRecord'> => ({
  getBenchmarkRecord: async (scope, id, version) => {
    const record = await port.getBenchmarkRecord(scope, id, version);
    return record === null ? null : mutate(record);
  },
  resolveLatestBenchmarkRecord: (scope, id) => port.resolveLatestBenchmarkRecord(scope, id),
});

/** A rigged reality reader: mutate the served observation (double-cast smuggle). */
const riggedReality = (
  port: RealityObservationReaderPort,
  mutate: (observation: HistoricalObservation) => HistoricalObservation,
): RealityObservationReaderPort => ({
  getObservation: async (scope, id) => {
    const observation = await port.getObservation(scope, id);
    return observation === null ? null : mutate(observation);
  },
});

// ---------------------------------------------------------------------------
// Structural request validation (fail closed, named codes)
// ---------------------------------------------------------------------------

test('validation: null/blank request fields fail closed invalid-input', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const base = calibrationInput();

  expectFailure(
    await loop.calibration.recordCalibrationError(null as never),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({ ...base, scope: null as never }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({ ...base, calibrationId: '   ' as never }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({ ...base, calibrationId: 7 as never }),
    'invalid-input',
  );
});

test('validation: malformed prediction refs fail closed invalid-input', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const base = calibrationInput();

  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: null as never,
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: { ...base.prediction, benchmarkId: '' as never },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: { ...base.prediction, benchmarkVersion: 0 },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: { ...base.prediction, benchmarkVersion: -1 },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: { ...base.prediction, benchmarkVersion: 1.5 },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: { ...base.prediction, benchmarkVersion: Number.NaN },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      prediction: { ...base.prediction, candidateKey: ' \t' },
    }),
    'invalid-input',
  );
});

test('validation: malformed observation refs fail closed (non-array/empty/blank/duplicate)', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const base = calibrationInput();

  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      observationRefs: 'obs-reality-a' as never,
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({ ...base, observationRefs: [] }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      observationRefs: [observationIdOf('reality-a'), '  ' as never],
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      observationRefs: [
        observationIdOf('reality-a'),
        observationIdOf('reality-b'),
        observationIdOf('reality-a'),
      ],
    }),
    'duplicate-observation-ref',
  );
});

test('validation: a malformed reward spec and note fail closed invalid-input', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const base = calibrationInput();

  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      rewardSpec: { ...reachRewardSpec(), terms: [] },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({ ...base, note: 12 as never }),
    'invalid-input',
  );
});

test('validation: only the frozen v1 error functional is accepted (blank note included)', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const base = calibrationInput();

  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      functional: { ...base.functional, id: 'calib-squared-v2' as never },
    }),
    'unsupported-error-functional',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      functional: { ...base.functional, version: 2 as never },
    }),
    'unsupported-error-functional',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      functional: { ...base.functional, note: '' },
    }),
    'invalid-input',
  );
  expectFailure(
    await loop.calibration.recordCalibrationError({
      ...base,
      functional: null as never,
    }),
    'unsupported-error-functional',
  );
  // The frozen constant itself satisfies the validator (no drift between the
  // contract constant and the declared input vocabulary).
  assert.equal(CALIBRATION_ERROR_FUNCTIONAL_V1.id, 'calib-signed-error-v1');
  assert.equal(CALIBRATION_ERROR_FUNCTIONAL_V1.version, 1);
});

// ---------------------------------------------------------------------------
// The consumed LAB-017 seam resolution (fail closed)
// ---------------------------------------------------------------------------

test('prediction resolution: unknown benchmark / missing version / unknown candidate / reward mismatch', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const base = calibrationInput();

  // Unknown chain in this tenant scope (foreign scope sees nothing).
  expectFailure(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ scope: scopeOf('tenant-void') }),
    ),
    'unknown-benchmark',
  );
  // Known chain, missing EXACT version.
  expectFailure(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ prediction: { ...base.prediction, benchmarkVersion: 99 } }),
    ),
    'benchmark-version-not-found',
  );
  // Known record, unknown candidate key.
  expectFailure(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ prediction: { ...base.prediction, candidateKey: 'ghost' } }),
    ),
    'unknown-candidate',
  );
  // Both sides must be valued under the SAME declared objective version.
  expectFailure(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ rewardSpec: reachRewardSpec({ version: 2 }) }),
    ),
    'reward-version-mismatch',
  );
});

test('prediction resolution: a double-cast non-counterfactual benchmark record fails closed (lock rule 29)', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);

  const smuggled = createInMemoryOnlineCalibration({
    benchmark: riggedBenchmark(loop.benchmark, (record) => ({
      ...record,
      counterfactual: false as never,
    })),
    reality: loop.reality,
    now: FIXED_NOW,
  });

  expectFailure(
    await smuggled.recordCalibrationError(calibrationInput()),
    'prediction-not-counterfactual',
  );
});

// ---------------------------------------------------------------------------
// The reality side resolution (fail closed — reality is NEVER simulated)
// ---------------------------------------------------------------------------

test('observation resolution: unknown refs fail closed unknown-observation', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);

  expectFailure(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ observationRefs: [observationIdOf('void')] }),
    ),
    'unknown-observation',
  );
});

test('observation resolution: a double-cast counterfactual record fails closed observation-not-historical', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);

  const smuggled = createInMemoryOnlineCalibration({
    benchmark: loop.benchmark,
    reality: riggedReality(loop.reality, (observation) => ({
      ...observation,
      counterfactual: true as never,
    })),
    now: FIXED_NOW,
  });

  // A SimulationPrediction can never occupy the reality slot — the runtime
  // label re-validation catches even a double-cast smuggle (lock rule 29).
  expectFailure(
    await smuggled.recordCalibrationError(calibrationInput()),
    'observation-not-historical',
  );
});

test('observation consistency: missing/mixed regimes and mismatched contexts fail closed', async () => {
  const noRegimeLoop = await calibrationLoop([
    { ...realityObservation('reality-a', 100), regime: undefined },
    { ...realityObservation('reality-b', 200), regime: undefined },
  ]);
  await asBenchmarkRecord(noRegimeLoop);
  expectFailure(
    await noRegimeLoop.calibration.recordCalibrationError(calibrationInput()),
    'observation-regime-missing',
  );

  const mixedRegimeLoop = await calibrationLoop([
    realityObservation('reality-a', 100),
    { ...realityObservation('reality-b', 200), regime: 'holiday-peak' },
  ]);
  await asBenchmarkRecord(mixedRegimeLoop);
  expectFailure(
    await mixedRegimeLoop.calibration.recordCalibrationError(calibrationInput()),
    'observation-regime-mismatch',
  );

  const mixedContextLoop = await calibrationLoop([
    realityObservation('reality-a', 100),
    { ...realityObservation('reality-b', 200), niche: 'espresso-education' },
  ]);
  await asBenchmarkRecord(mixedContextLoop);
  expectFailure(
    await mixedContextLoop.calibration.recordCalibrationError(calibrationInput()),
    'observation-context-mismatch',
  );
});

test('observation metrics: non-finite values and inconsistent units fail closed (W9-B D5)', async () => {
  const nanLoop = await calibrationLoop([
    realityObservation('reality-a', Number.NaN),
    realityObservation('reality-b', 200),
  ]);
  await asBenchmarkRecord(nanLoop);
  expectFailure(
    await nanLoop.calibration.recordCalibrationError(calibrationInput()),
    'invalid-observation-metric',
  );

  const unitLoop = await calibrationLoop([
    realityObservation('reality-a', 100),
    {
      ...realityObservation('reality-b', 200),
      metrics: [{ metric: 'qualified-reach', value: 200, unit: 'impressions' }],
    },
  ]);
  await asBenchmarkRecord(unitLoop);
  expectFailure(
    await unitLoop.calibration.recordCalibrationError(calibrationInput()),
    'observation-unit-mismatch',
  );
});

test('observed outcome: non-derivable reward terms fail closed (LAB-008 observed-domain discipline)', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);

  // A spec whose term source has no observed metric domain — reality-side
  // values come from the declared observations only, never invented.
  expectFailure(
    await loop.calibration.recordCalibrationError(
      calibrationInput({
        rewardSpec: {
          ...reachRewardSpec(),
          terms: [
            {
              metric: 'qualified-reach' as never,
              weight: 1,
              direction: 'maximize',
              definition: 'engagement-rate observed on the platform',
              metricSource: 'engagement-rate',
            },
          ],
        },
      }),
    ),
    'reward-term-not-derivable',
  );
});

// ---------------------------------------------------------------------------
// Context derivation validation + the no-evidence guard
// ---------------------------------------------------------------------------

test('context derivation: malformed requests and empty evidence fail closed', async () => {
  const loop = await calibrationLoop();
  const scope = calibrationInput().scope;

  expectContextFailure(
    await loop.calibration.deriveCalibrationContext(null as never),
    'invalid-input',
  );
  expectContextFailure(
    await loop.calibration.deriveCalibrationContext({
      scope: null as never,
      benchmarkId: 'x' as never,
    }),
    'invalid-input',
  );
  expectContextFailure(
    await loop.calibration.deriveCalibrationContext({ scope, benchmarkId: '' as never }),
    'invalid-input',
  );

  // No error records cite this chain yet — an empty context would be a
  // fabricated calibration basis.
  await asBenchmarkRecord(loop);
  expectContextFailure(
    await loop.calibration.deriveCalibrationContext({
      scope,
      benchmarkId: calibrationInput().prediction.benchmarkId,
    }),
    'no-calibration-evidence',
  );
});

// ---------------------------------------------------------------------------
// Failed calls append NOTHING
// ---------------------------------------------------------------------------

test('fail-closed: a failed record appends no record; a failed derivation appends no context', async () => {
  const loop = await calibrationLoop();
  await asBenchmarkRecord(loop);
  const scope = calibrationInput().scope;

  const failures: RecordResult[] = [
    await loop.calibration.recordCalibrationError(
      calibrationInput({ prediction: { ...calibrationInput().prediction, candidateKey: 'ghost' } }),
    ),
    await loop.calibration.recordCalibrationError(
      calibrationInput({ observationRefs: [observationIdOf('void')] }),
    ),
  ];
  for (const failure of failures) {
    assert.ok('error' in failure);
  }

  assert.deepEqual(
    await loop.calibration.listCalibrationErrorVersions(scope, calibrationId()),
    [],
  );
  assert.equal(
    await loop.calibration.resolveLatestCalibrationErrorRecord(scope, calibrationId()),
    null,
  );
  assert.equal(await loop.calibration.getCalibrationErrorRecord(scope, calibrationId(), 1), null);
  assert.deepEqual(
    await loop.calibration.listCalibrationErrorsForBenchmark(
      scope,
      calibrationInput().prediction.benchmarkId,
    ),
    [],
  );
  assert.equal(
    await loop.calibration.resolveLatestCalibrationContext(
      scope,
      calibrationInput().prediction.benchmarkId,
    ),
    null,
  );
});
