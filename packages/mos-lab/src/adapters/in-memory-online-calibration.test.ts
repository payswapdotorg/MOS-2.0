import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Version } from '@mos/contracts';
import type { RobustBenchmarkRecord } from '../contracts/robust-benchmark-port.js';
import type {
  CalibrationContextRecord,
  OnlineCalibrationPort,
} from '../contracts/online-calibration-port.js';
import type { OnlineCalibrationRecord } from '../contracts/online-calibration.js';
import { canonicalCalibrationView } from '../contracts/online-calibration.js';
import {
  benchmarkScope,
  calibrationId,
  calibrationInput,
  calibrationLoop,
  observationIdOf,
  realityObservation,
  runFixtureBenchmark,
} from '../testing/w10a-calibration-fixtures.js';
import { FIXED_NOW } from '../testing/w10a-calibration-fixtures.js';

type ErrorResult = Awaited<ReturnType<OnlineCalibrationPort['recordCalibrationError']>>;
type ContextResult = Awaited<ReturnType<OnlineCalibrationPort['deriveCalibrationContext']>>;

const asErrorRecord = (result: ErrorResult): OnlineCalibrationRecord => {
  if ('error' in result) {
    assert.fail(`unexpected calibration error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asContext = (result: ContextResult): CalibrationContextRecord => {
  if ('error' in result) {
    assert.fail(`unexpected context error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asBenchmarkRecord = (
  result: Awaited<ReturnType<Awaited<ReturnType<typeof calibrationLoop>>['benchmark']['runBenchmark']>>,
): RobustBenchmarkRecord => {
  if ('error' in result) {
    assert.fail(`unexpected benchmark error: ${result.error} — ${result.message}`);
  }
  return result;
};

// ---------------------------------------------------------------------------
// The round trip: every field of one recorded prediction error
// ---------------------------------------------------------------------------

test('round trip: recording one error returns every field (all-fields + provenance)', async () => {
  const loop = await calibrationLoop();
  const benchmarkRecord = asBenchmarkRecord(await runFixtureBenchmark(loop.benchmark));
  const noopRanked = benchmarkRecord.ranked.find(
    (entry) => entry.key === 'no-op-baseline',
  ) ?? assert.fail('no-op baseline missing from the fixture benchmark record');

  const input = calibrationInput();
  const record = asErrorRecord(await loop.calibration.recordCalibrationError(input));

  // Identity + chain bookkeeping.
  assert.equal(record.id, input.calibrationId);
  assert.equal(record.version, 1 as Version);
  assert.equal(record.tenantId, input.scope.tenantId);
  assert.equal(record.recordedAt, FIXED_NOW());

  // The consumed LAB-017 seam reference, verbatim.
  assert.deepEqual(record.prediction, input.prediction);

  // The frozen prediction statement copied VERBATIM from the cited record's
  // ranked entry (the LAB-017 seam — never reinterpreted).
  assert.equal(record.predicted.expectedReward, noopRanked.evaluation.expectedReward);
  assert.deepEqual(record.predicted.interval, noopRanked.evaluation.interval);
  assert.deepEqual(record.predicted.uncertainty, noopRanked.evaluation.uncertainty);
  assert.deepEqual(record.predicted.provenance, noopRanked.provenance);

  // The resolved reality observation citations, verbatim fields.
  assert.equal(record.observations.length, 2);
  assert.deepEqual(record.observations, [
    {
      observationId: observationIdOf('reality-a'),
      niche: 'sourdough-baking',
      platform: 'short-video',
      observedAt: '2026-06-20T12:00:00.000Z',
      sourceRefs: ['src://platform/analytics/reality-a'],
      regime: 'baseline',
    },
    {
      observationId: observationIdOf('reality-b'),
      niche: 'sourdough-baking',
      platform: 'short-video',
      observedAt: '2026-06-20T12:00:00.000Z',
      sourceRefs: ['src://platform/analytics/reality-b'],
      regime: 'baseline',
    },
  ]);

  // The observed means (LAB-008 discipline: 100 + 200 → 150).
  assert.deepEqual(record.observedMetricMeans, [
    { metric: 'qualified-reach', mean: 150, unit: 'people' },
  ]);
  assert.equal(record.observedOutcome, 150);
  assert.equal(record.rewardSpecVersion, input.rewardSpec.version);

  // The DECLARED error functional, verbatim.
  assert.deepEqual(record.functional, input.functional);

  // The documented error functional math (hand-checkable: the no-op baseline
  // predicts exactly 0 with the [0, 0] interval).
  assert.equal(record.predicted.expectedReward, 0);
  assert.deepEqual(record.predicted.interval, { lower: 0, upper: 0 });
  assert.equal(record.signedError, 150);
  assert.equal(record.absoluteError, 150);
  assert.equal(record.relativeError, 1);
  assert.equal(record.intervalContainment, false);

  assert.equal(record.regime, 'baseline');
  assert.equal(record.note, null);
  assert.notEqual(record.errorDigest, '');
  assert.equal(record.recordKind, 'lab-calibration-analysis');
  assert.equal(
    record.disclosure,
    'calibration-analysis-over-frozen-benchmark-and-declared-reality-observations',
  );
  assert.equal(
    record.labOnly,
    'calibration analysis records simulation-to-reality prediction error for the frozen benchmark prediction it cites — it never becomes an experiment or measurement authority (§19/§20), never rewrites the benchmark record or the historical observations, and feeds back only as DECLARED versioned context the benchmark may cite (§24)',
  );
});

test('the declared error functional is self-consistent on a nonzero prediction (beta)', async () => {
  const loop = await calibrationLoop();
  const benchmarkRecord = asBenchmarkRecord(await runFixtureBenchmark(loop.benchmark));
  const betaRanked = benchmarkRecord.ranked.find(
    (entry) => entry.key === 'beta',
  ) ?? assert.fail('beta candidate missing from the fixture benchmark record');

  const record = asErrorRecord(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ prediction: { ...calibrationInput().prediction, candidateKey: 'beta' } }),
    ),
  );

  // The documented formulas, verified against the record (reality − prediction).
  assert.equal(record.signedError, record.observedOutcome - record.predicted.expectedReward);
  assert.equal(record.absoluteError, Math.abs(record.signedError));
  assert.equal(
    record.relativeError,
    Math.abs(record.signedError) / Math.abs(record.predicted.expectedReward),
  );
  assert.equal(record.observedOutcome, 150);
  assert.ok(record.predicted.expectedReward > 0);
  assert.equal(record.signedError, 150 - betaRanked.evaluation.expectedReward);
  // 150 is far below beta's simulated interval lower bound — not contained.
  assert.equal(
    record.intervalContainment,
    record.observedOutcome >= record.predicted.interval.lower &&
      record.observedOutcome <= record.predicted.interval.upper,
  );
  assert.equal(record.intervalContainment, false);
});

// ---------------------------------------------------------------------------
// Append-only chains + integrity (the acceptance's second clause)
// ---------------------------------------------------------------------------

test('append-only: later calibrations APPEND, earlier error records stay bit-for-bit', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);

  const first = asErrorRecord(await loop.calibration.recordCalibrationError(calibrationInput()));
  const firstSnapshot = structuredClone(first);
  const second = asErrorRecord(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ note: 'second calibration — appended, never a rewrite' }),
    ),
  );
  const third = asErrorRecord(
    await loop.calibration.recordCalibrationError(
      calibrationInput({
        observationRefs: [observationIdOf('reality-a')],
        note: 'third calibration over a narrower reality basis',
      }),
    ),
  );

  // The chain: three versions, oldest first.
  assert.equal(second.version, 2 as Version);
  assert.equal(third.version, 3 as Version);
  const versions = await loop.calibration.listCalibrationErrorVersions(
    benchmarkScope(),
    calibrationId(),
  );
  assert.equal(versions.length, 3);
  assert.deepEqual(versions.map((entry) => entry.version), [1, 2, 3]);

  // The FIRST record is bit-for-bit unchanged after two later appends.
  assert.deepEqual(versions[0], firstSnapshot);
  assert.deepEqual(versions[0], first);

  // Point reads + latest resolution.
  const fetched = await loop.calibration.getCalibrationErrorRecord(benchmarkScope(), calibrationId(), 2);
  assert.deepEqual(fetched, second);
  const latest = await loop.calibration.resolveLatestCalibrationErrorRecord(
    benchmarkScope(),
    calibrationId(),
  );
  assert.deepEqual(latest, third);

  // Distinct digests per version (the digest discriminates the chain).
  assert.notEqual(versions[0]?.errorDigest, versions[1]?.errorDigest);
  assert.notEqual(versions[1]?.errorDigest, versions[2]?.errorDigest);
});

test('integrity: recomputing the digest reports every stored error record intact', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  const record = asErrorRecord(await loop.calibration.recordCalibrationError(calibrationInput()));

  const report = await loop.calibration.verifyCalibrationErrorRecordIntegrity(
    benchmarkScope(),
    calibrationId(),
    1,
  );
  assert.notEqual(report, null);
  assert.equal(report?.status, 'intact');
  assert.equal(report?.recordedDigest, record.errorDigest);
  assert.equal(report?.recomputedDigest, record.errorDigest);

  // Unknown version in this tenant scope → null (no existence leak).
  const unknown = await loop.calibration.verifyCalibrationErrorRecordIntegrity(
    benchmarkScope(),
    calibrationId(),
    99,
  );
  assert.equal(unknown, null);
});

test('determinism: fresh adapters over the same declared inputs produce the identical digest', async () => {
  const firstLoop = await calibrationLoop();
  await runFixtureBenchmark(firstLoop.benchmark);
  const first = asErrorRecord(
    await firstLoop.calibration.recordCalibrationError(calibrationInput()),
  );

  const secondLoop = await calibrationLoop();
  await runFixtureBenchmark(secondLoop.benchmark);
  const second = asErrorRecord(
    await secondLoop.calibration.recordCalibrationError(calibrationInput()),
  );

  assert.equal(first.errorDigest, second.errorDigest);
  assert.deepEqual(first, second);

  // Digest sensitivity: a different declared reality basis (a different
  // observed MEAN) changes the digest. W10-A triage (test-defect fix): the
  // stored record carries the observed MEANS and value-free citations
  // only, and the digest is recomputable from the stored record alone
  // (verifyCalibrationErrorRecordIntegrity) — so two bases with the SAME
  // mean are bit-for-bit identical records and MUST share a digest; the
  // original probe used a same-mean basis and demanded inequality, which
  // is impossible under the recomputable-digest discipline.
  const otherLoop = await calibrationLoop([
    realityObservation('reality-a', 120),
    realityObservation('reality-b', 220),
  ]);
  await runFixtureBenchmark(otherLoop.benchmark);
  const other = asErrorRecord(
    await otherLoop.calibration.recordCalibrationError(calibrationInput()),
  );
  assert.notEqual(first.errorDigest, other.errorDigest);
  assert.equal(other.observedOutcome, 170); // different mean → different digest

  // The mean-level artifact pin (the corrected expectation, pinned): a
  // different basis with the SAME mean produces the bit-for-bit identical
  // record — and therefore the identical digest.
  const sameMeanLoop = await calibrationLoop([
    realityObservation('reality-a', 120),
    realityObservation('reality-b', 180),
  ]);
  await runFixtureBenchmark(sameMeanLoop.benchmark);
  const sameMean = asErrorRecord(
    await sameMeanLoop.calibration.recordCalibrationError(calibrationInput()),
  );
  assert.deepEqual(sameMean, first);
  assert.equal(sameMean.errorDigest, first.errorDigest);
});

// ---------------------------------------------------------------------------
// The derived calibration context (the feedback half of the loop)
// ---------------------------------------------------------------------------

test('deriveCalibrationContext: the summary is recomputable from the folded error records', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);

  const first = asErrorRecord(
    await loop.calibration.recordCalibrationError(
      calibrationInput({ calibrationId: calibrationId('calib-a') }),
    ),
  );
  const second = asErrorRecord(
    await loop.calibration.recordCalibrationError(
      calibrationInput({
        calibrationId: calibrationId('calib-b'),
        observationRefs: [observationIdOf('reality-a')],
      }),
    ),
  );

  const context = asContext(
    await loop.calibration.deriveCalibrationContext({
      scope: benchmarkScope(),
      benchmarkId: first.prediction.benchmarkId,
    }),
  );

  // Identity + chain bookkeeping.
  assert.equal(context.benchmarkId, first.prediction.benchmarkId);
  assert.equal(context.version, 1 as Version);
  assert.equal(context.tenantId, first.tenantId);
  assert.equal(context.derivedAt, FIXED_NOW());
  assert.notEqual(context.contextDigest, '');
  assert.equal(context.recordKind, 'lab-calibration-context');
  assert.equal(context.disclosure, 'derived-calibration-context-for-benchmark-citation');
  assert.equal(
    context.labOnly,
    'the calibration context is DECLARED versioned analysis feedback a later benchmark run may cite — it never implies calibrated simulator output, never becomes an experiment/measurement authority, and never rewrites the error records or benchmark records it summarizes',
  );

  // The folded record citations in deterministic (id, version) order.
  assert.deepEqual(context.errorRecords, [
    { calibrationId: calibrationId('calib-a'), version: 1 },
    { calibrationId: calibrationId('calib-b'), version: 1 },
  ]);

  // The summary, recomputed from the folded records by hand.
  const folded = [first, second];
  const meanSigned = (first.signedError + second.signedError) / 2;
  const meanAbsolute = (first.absoluteError + second.absoluteError) / 2;
  assert.equal(context.summary.errorRecordCount, 2);
  assert.equal(context.summary.meanSignedError, meanSigned);
  assert.equal(context.summary.meanAbsoluteError, meanAbsolute);
  assert.equal(context.summary.worstAbsoluteError, Math.max(...folded.map((r) => r.absoluteError)));
  assert.equal(context.summary.intervalCoverage, 0); // both outside [0, 0]
  assert.deepEqual(context.summary.calibratedBenchmarkVersions, [1]);
  assert.deepEqual(context.summary.regimes, ['baseline']);
  void second;

  // Every number in the summary IS recomputable from errorRecords citations.
  const cited = await Promise.all(
    context.errorRecords.map(
      (citation) =>
        loop.calibration.getCalibrationErrorRecord(
          benchmarkScope(),
          citation.calibrationId,
          citation.version,
        ),
    ),
  );
  const recomputedSigned =
    cited.reduce((sum, entry) => sum + (entry?.signedError ?? 0), 0) / cited.length;
  assert.equal(context.summary.meanSignedError, recomputedSigned);
});

test('context chains are append-only: a later derivation never rewrites the earlier context', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  const scope = calibrationInput().scope;
  const benchmarkId = calibrationInput().prediction.benchmarkId;

  // W10-A triage (test-defect fix): the context basis needs ONE recorded
  // error before the first derivation — deriving over ZERO error records
  // correctly fails closed no-calibration-evidence ("an empty context would
  // be a fabricated calibration basis", pinned in the validation battery);
  // the original setup derived the first context before any record existed.
  const seeded = await loop.calibration.recordCalibrationError(calibrationInput());
  if ('error' in seeded) {
    assert.fail(`unexpected calibration error: ${seeded.error} — ${seeded.message}`);
  }

  const first = asContext(await loop.calibration.deriveCalibrationContext({ scope, benchmarkId }));
  const firstSnapshot = structuredClone(first);

  // One more error record, then a second derivation.
  await loop.calibration.recordCalibrationError(
    calibrationInput({
      calibrationId: calibrationId('calib-b'),
      observationRefs: [observationIdOf('reality-a')],
    }),
  );
  const second = asContext(await loop.calibration.deriveCalibrationContext({ scope, benchmarkId }));

  assert.equal(second.version, 2 as Version);
  assert.notEqual(second.contextDigest, first.contextDigest);
  assert.equal(second.summary.errorRecordCount, first.summary.errorRecordCount + 1);

  const versions = await loop.calibration.listCalibrationContextVersions(benchmarkScope(), benchmarkId);
  assert.deepEqual(versions.map((entry) => entry.version), [1, 2]);
  assert.deepEqual(versions[0], firstSnapshot);
  assert.deepEqual(versions[0], first);

  const fetched = await loop.calibration.getCalibrationContext(scope, benchmarkId, 1);
  assert.deepEqual(fetched, first);
  const latest = await loop.calibration.resolveLatestCalibrationContext(scope, benchmarkId);
  assert.deepEqual(latest, second);

  const report = await loop.calibration.verifyCalibrationContextIntegrity(scope, benchmarkId, 2);
  assert.notEqual(report, null);
  assert.equal(report?.status, 'intact');
  assert.equal(report?.recordedDigest, second.contextDigest);

  // Unknown benchmark chain in this tenant scope → null everywhere.
  assert.equal(await loop.calibration.getCalibrationContext(scope, benchmarkId, 99), null);
  assert.equal(await loop.calibration.resolveLatestCalibrationContext(scope, benchmarkId), second);
});

test('listCalibrationErrorsForBenchmark folds every citing record in deterministic (id, version) order', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  const scope = calibrationInput().scope;
  const benchmarkId = calibrationInput().prediction.benchmarkId;

  await loop.calibration.recordCalibrationError(
    calibrationInput({ calibrationId: calibrationId('calib-z') }),
  );
  await loop.calibration.recordCalibrationError(
    calibrationInput({ calibrationId: calibrationId('calib-a') }),
  );
  await loop.calibration.recordCalibrationError(
    calibrationInput({ calibrationId: calibrationId('calib-a'), note: 'second version' }),
  );

  const listing = await loop.calibration.listCalibrationErrorsForBenchmark(scope, benchmarkId);
  assert.deepEqual(
    listing.map((entry) => [entry.id as string, entry.version]),
    [
      ['calib-a', 1],
      ['calib-a', 2],
      ['calib-z', 1],
    ],
  );
});

// ---------------------------------------------------------------------------
// The canonical CORE-001 CalibrationRecord projection
// ---------------------------------------------------------------------------

test('canonicalCalibrationView projects the error record onto the CORE-001 shape', async () => {
  const loop = await calibrationLoop();
  const benchmarkRecord = asBenchmarkRecord(await runFixtureBenchmark(loop.benchmark));
  const record = asErrorRecord(await loop.calibration.recordCalibrationError(calibrationInput()));

  const view = canonicalCalibrationView(record, 5 as Version);
  assert.equal(view.id, record.id as never);
  assert.equal(view.version, record.version);
  assert.equal(view.labRunRef, 'benchmark:bench-reach-v1:v1');
  assert.equal(
    view.worldModelVersion,
    record.predicted.provenance.worldModels[0]?.memberWorldModelVersions[0],
  );
  assert.equal(view.simulatedPrediction, record.predicted.expectedReward);
  assert.deepEqual(view.uncertainty, record.predicted.uncertainty);
  assert.equal(view.observedOutcome, record.observedOutcome);
  assert.equal(view.predictionError, record.signedError);
  assert.equal(view.regime, record.regime);
  assert.equal(view.updateVersion, 5 as Version);

  // The projection cites the run whose prediction was calibrated: the
  // benchmark record chain + version (the LAB-017 identity, not a lab-run id).
  assert.equal(view.labRunRef.includes(benchmarkRecord.id as string), true);
});
