import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RobustBenchmarkRecord } from '../contracts/robust-benchmark-port.js';
import type { MarketingBenchmarkPort } from '../contracts/robust-benchmark-port.js';
import { createInMemoryMarketingBenchmark } from './in-memory-marketing-benchmark.js';
import {
  benchmarkScope,
  calibrationInput,
  calibrationLoop,
  runFixtureBenchmark,
} from '../testing/w10a-calibration-fixtures.js';
import { FIXED_NOW } from '../testing/w10a-calibration-fixtures.js';
import {
  benchmarkEnsembleStack,
  benchmarkId,
  benchmarkInput,
} from '../testing/w9a-benchmark-fixtures.js';
import { scopeOf } from '../testing/w4a-lab-fixtures.js';

type RunResult = Awaited<ReturnType<MarketingBenchmarkPort['runBenchmark']>>;

const asRecord = (result: RunResult): RobustBenchmarkRecord => {
  if ('error' in result) {
    assert.fail(`unexpected benchmark error: ${result.error} — ${result.message}`);
  }
  return result;
};

// ---------------------------------------------------------------------------
// The closed loop: measure → calibrate → next run (the LAB-018 feedback half)
// ---------------------------------------------------------------------------

test('the first run of a loop cites NOTHING (citedCalibrationContext normalizes to null)', async () => {
  const loop = await calibrationLoop();
  const record = asRecord(await runFixtureBenchmark(loop.benchmark));
  assert.equal(record.citedCalibrationContext, null);
});

test('the loop: record error → derive context → the next run cites the exact context version', async () => {
  const loop = await calibrationLoop();
  const first = asRecord(await runFixtureBenchmark(loop.benchmark));

  // Calibrate the no-op prediction against reality, then derive the context.
  const error = await loop.calibration.recordCalibrationError(calibrationInput());
  if ('error' in error) {
    assert.fail(`unexpected calibration error: ${error.error} — ${error.message}`);
  }
  const context = await loop.calibration.deriveCalibrationContext({
    scope: calibrationInput().scope,
    benchmarkId: calibrationInput().prediction.benchmarkId,
  });
  if ('error' in context) {
    assert.fail(`unexpected context error: ${context.error} — ${context.message}`);
  }
  assert.equal(context.version, 1);

  // The NEXT run cites the derived context version.
  const second = asRecord(
    await runFixtureBenchmark(loop.benchmark, { citedCalibrationContext: { version: 1 } }),
  );
  assert.equal(second.version, 2);
  assert.notEqual(second.citedCalibrationContext, null);
  assert.equal(second.citedCalibrationContext?.version, 1);
  assert.equal(
    second.citedCalibrationContext?.statement,
    'this benchmark run cites the DECLARED versioned LAB-018 calibration context derived from prior simulation-to-reality error records; the citation is provenance — it never rewrites any calibration or benchmark record and never implies calibrated output',
  );

  // The FIRST record is never rewritten by the citing second run.
  const storedFirst = await loop.benchmark.getBenchmarkRecord(
    benchmarkScope(),
    first.id,
    first.version,
  );
  assert.deepEqual(storedFirst, first);
  const integrity = await loop.benchmark.verifyBenchmarkRecordIntegrity(
    benchmarkScope(),
    first.id,
    first.version,
  );
  assert.equal(integrity?.status, 'intact');

  // The error record and context are never rewritten by the citing run either.
  const storedError = await loop.calibration.getCalibrationErrorRecord(
    benchmarkScope(),
    error.id,
    error.version,
  );
  assert.deepEqual(storedError, error);
  const storedContext = await loop.calibration.getCalibrationContext(
    calibrationInput().scope,
    context.benchmarkId,
    context.version,
  );
  assert.deepEqual(storedContext, context);
});

test('the citation never alters the evaluation grid (the fairness pin is unchanged by citing)', async () => {
  const loop = await calibrationLoop();
  const uncited = asRecord(await runFixtureBenchmark(loop.benchmark));

  const error = await loop.calibration.recordCalibrationError(calibrationInput());
  assert.ok(!('error' in error));
  const context = await loop.calibration.deriveCalibrationContext({
    scope: calibrationInput().scope,
    benchmarkId: calibrationInput().prediction.benchmarkId,
  });
  assert.ok(!('error' in context));

  const cited = asRecord(
    await runFixtureBenchmark(loop.benchmark, { citedCalibrationContext: { version: 1 } }),
  );

  // Identical ranked numbers, fairness pin, provenance and digest — the ONLY
  // differences are the chain bookkeeping (version, recordedAt) and the
  // citation field itself.
  assert.deepEqual(cited.ranked, uncited.ranked);
  assert.deepEqual(cited.fairness, uncited.fairness);
  assert.deepEqual(cited.provenance, uncited.provenance);
  assert.deepEqual(cited.comparison, uncited.comparison);
  assert.deepEqual(cited.policy, uncited.policy);
  assert.deepEqual(cited.seeds, uncited.seeds);
  assert.deepEqual(cited.calibration, uncited.calibration);
  assert.equal(cited.citedCalibrationContext?.version, 1);
  assert.equal(uncited.citedCalibrationContext, null);
});

// ---------------------------------------------------------------------------
// Citation fail-closed discipline (no fabricated calibration provenance)
// ---------------------------------------------------------------------------

test('citing an unresolvable context version fails closed calibration-context-not-found', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  await loop.calibration.recordCalibrationError(calibrationInput());

  const result = await runFixtureBenchmark(loop.benchmark, {
    citedCalibrationContext: { version: 99 },
  });
  assert.ok('error' in result);
  assert.equal(result.error, 'calibration-context-not-found');
  // No record was appended by the failed run.
  const versions = await loop.benchmark.listBenchmarkRecordVersions(
    calibrationInput().scope,
    calibrationInput().prediction.benchmarkId,
  );
  assert.equal(versions.length, 1);
});

test('citing before ANY derivation exists fails closed (no fabricated basis)', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);

  const result = await runFixtureBenchmark(loop.benchmark, {
    citedCalibrationContext: { version: 1 },
  });
  assert.ok('error' in result);
  assert.equal(result.error, 'calibration-context-not-found');
});

test('a declared citation without the wired reader seam fails closed calibration-context-reader-required', async () => {
  const stack = await benchmarkEnsembleStack();
  const unwired = createInMemoryMarketingBenchmark({ ensemble: stack.ensemble, now: FIXED_NOW });
  const result = await unwired.runBenchmark({
    ...benchmarkInput(),
    citedCalibrationContext: { version: 1 },
  });
  assert.ok('error' in result);
  assert.equal(result.error, 'calibration-context-reader-required');
});

test('structurally invalid citation versions fail closed invalid-input', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  await loop.calibration.recordCalibrationError(calibrationInput());
  await loop.calibration.deriveCalibrationContext({
    scope: calibrationInput().scope,
    benchmarkId: calibrationInput().prediction.benchmarkId,
  });

  for (const badVersion of [0, -1, 1.5, Number.NaN]) {
    const result = await runFixtureBenchmark(loop.benchmark, {
      citedCalibrationContext: { version: badVersion },
    });
    assert.ok('error' in result);
    assert.equal(result.error, 'invalid-input');
  }
});

test('contexts are tenant-scoped: a foreign tenant citing another tenant context fails closed', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  await loop.calibration.recordCalibrationError(calibrationInput());
  await loop.calibration.deriveCalibrationContext({
    scope: calibrationInput().scope,
    benchmarkId: calibrationInput().prediction.benchmarkId,
  });

  const result = await runFixtureBenchmark(loop.benchmark, {
    scope: scopeOf('tenant-b'),
    citedCalibrationContext: { version: 1 },
  });
  // The foreign tenant has no benchmark chain here either — the earliest
  // fail-closed code wins, but the run never silently fabricates provenance.
  assert.ok('error' in result);
});

test('a context derived for one benchmark chain is not citable by another chain', async () => {
  const loop = await calibrationLoop();
  await runFixtureBenchmark(loop.benchmark);
  await loop.calibration.recordCalibrationError(calibrationInput());
  await loop.calibration.deriveCalibrationContext({
    scope: calibrationInput().scope,
    benchmarkId: calibrationInput().prediction.benchmarkId,
  });

  // A DIFFERENT benchmark id citing version 1: the context identity is the
  // (tenant, benchmark chain) pair, so this citation does not resolve.
  const result = await runFixtureBenchmark(loop.benchmark, {
    benchmarkId: benchmarkId('bench-reach-v2'),
    citedCalibrationContext: { version: 1 },
  });
  assert.ok('error' in result);
  assert.equal(result.error, 'calibration-context-not-found');
});
