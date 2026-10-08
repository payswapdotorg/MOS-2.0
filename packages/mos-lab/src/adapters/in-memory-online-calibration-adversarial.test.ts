import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Version } from '@mos/contracts';
import type { OnlineCalibrationPort } from '../contracts/online-calibration-port.js';
import type { OnlineCalibrationRecord } from '../contracts/online-calibration.js';
import { createInMemoryOnlineCalibration } from './in-memory-online-calibration.js';
import { createInMemoryRealityObservationReader } from './in-memory-reality-observation-reader.js';
import {
  benchmarkScope,
  calibrationId,
  calibrationInput,
  calibrationLoop,
  observationIdOf,
  realityObservation,
  runFixtureBenchmark,
  runFixtureBenchmarkInScope,
} from '../testing/w10a-calibration-fixtures.js';
import { FIXED_NOW } from '../testing/w10a-calibration-fixtures.js';
import { scopeOf } from '../testing/w4a-lab-fixtures.js';

type RecordResult = Awaited<ReturnType<OnlineCalibrationPort['recordCalibrationError']>>;

const asRecord = (result: RecordResult): OnlineCalibrationRecord => {
  if ('error' in result) {
    assert.fail(`unexpected calibration error: ${result.error} — ${result.message}`);
  }
  return result;
};

const seededLoop = async (): Promise<{
  readonly calibration: OnlineCalibrationPort;
  readonly record: OnlineCalibrationRecord;
}> => {
  const loop = await calibrationLoop();
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }
  const record = asRecord(await loop.calibration.recordCalibrationError(calibrationInput()));
  return { calibration: loop.calibration, record };
};

// ---------------------------------------------------------------------------
// Frozen-record adversarial pins (the W5-A/W6-A/W8-A/W9-B D3 class)
// ---------------------------------------------------------------------------

test('nested mutation of a RETURNED error record throws (deep-frozen, every level)', async () => {
  const { record } = await seededLoop();

  const attempts: readonly (() => unknown)[] = [
    () => {
      (record as { signedError: number }).signedError = 0;
    },
    () => {
      (record.predicted as { expectedReward: number }).expectedReward = 999;
    },
    () => {
      (record.predicted.interval as { lower: number }).lower = -1;
    },
    () => {
      (record.predicted.provenance as unknown as { seeds: number[] }).seeds = [1, 2, 3];
    },
    () => {
      (record.observations[0] as { regime: string }).regime = 'forged';
    },
    () => {
      (record.observations as unknown as string[]).push('forged');
    },
    () => {
      (record.observedMetricMeans[0] as { mean: number }).mean = 0;
    },
    () => {
      (record.functional as { note: string }).note = 'forged';
    },
    () => {
      (record as { errorDigest: string }).errorDigest = '0'.repeat(64);
    },
  ];
  for (const attempt of attempts) {
    assert.throws(attempt, TypeError, 'mutating a frozen stored record must throw');
  }
});

test('attempted corruption leaves the STORED record bit-for-bit intact (digest intact)', async () => {
  const { calibration, record } = await seededLoop();
  const snapshot = structuredClone(record);

  // A hostile caller wraps every mutation in try/catch and re-reads.
  for (const attempt of [
    () => {
      (record.predicted as { expectedReward: number }).expectedReward = 999;
    },
    () => {
      (record.observations[0] as unknown as { sourceRefs: string[] }).sourceRefs.push('forged-src');
    },
    () => {
      (record as { version: number }).version = 42;
    },
  ]) {
    try {
      attempt();
    } catch {
      // frozen — expected
    }
  }

  const stored = await calibration.getCalibrationErrorRecord(
    benchmarkScope(),
    record.id,
    record.version,
  );
  assert.deepEqual(stored, snapshot);
  const report = await calibration.verifyCalibrationErrorRecordIntegrity(
    benchmarkScope(),
    record.id,
    record.version,
  );
  assert.equal(report?.status, 'intact');
});

test('caller-alias: mutating the REQUEST objects after recording never changes the stored record', async () => {
  const loop = await calibrationLoop();
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }

  const input = calibrationInput();
  const record = asRecord(await loop.calibration.recordCalibrationError(input));
  const snapshot = structuredClone(record);

  // The hostile caller rewrites every object they still own.
  (input.prediction as unknown as { candidateKey: string }).candidateKey = 'forged-candidate';
  (input.prediction as unknown as { benchmarkVersion: number }).benchmarkVersion = 99;
  (input.observationRefs as unknown as string[]).push('forged-obs');
  (input.rewardSpec as unknown as { version: number }).version = 2;
  (input.functional as unknown as { note: string }).note = 'forged note';

  const stored = await loop.calibration.getCalibrationErrorRecord(
    benchmarkScope(),
    record.id,
    record.version,
  );
  assert.deepEqual(stored, snapshot);
  assert.equal(stored?.prediction.candidateKey, 'no-op-baseline');
  assert.equal(stored?.prediction.benchmarkVersion, 1);
  assert.equal(stored?.observations.length, 2);
  assert.equal(stored?.rewardSpecVersion, 1);
  assert.notEqual(stored?.functional.note, 'forged note');
});

// ---------------------------------------------------------------------------
// Hostile tenant ids (the W9-B D1/D2 class — JSON-array keys must hold)
// ---------------------------------------------------------------------------

test('hostile tenant ids never alias another tenant chain (delimiter injection)', async () => {
  const loop = await calibrationLoop();
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }

  // The hostile tenant id embeds the JSON-array delimiter sequence `", "`
  // hoping to collide with (tenant-a, bench-reach-v1) key material.
  const hostileScope = scopeOf('tenant-a", "bench-reach-v1');
  const hostileTenant = hostileScope.tenantId;

  // W10-A triage (test-defect fix): the hostile tenant must operate their
  // OWN delimiter-laden chain (D1 non-aliasing BOTH directions), so their
  // scope needs its own registered benchmark chain first — the shared
  // stores are tenant-scoped, and a cross-scope declaration correctly
  // fails closed unknown-benchmark (the implementation's scoping is right;
  // the original setup never registered the hostile tenant's chain).
  const hostileRun = await runFixtureBenchmarkInScope(loop, hostileScope, 'hostile');
  if ('error' in hostileRun) {
    assert.fail(`unexpected hostile benchmark error: ${hostileRun.error}`);
  }

  // The hostile tenant records their own chain under the SAME calibration id.
  const hostileReality = createInMemoryRealityObservationReader({
    seeds: [
      { scope: hostileScope, observation: realityObservation('reality-a', 10) },
      { scope: hostileScope, observation: realityObservation('reality-b', 20) },
    ],
  });
  const hostileCalibration = createInMemoryOnlineCalibration({
    benchmark: loop.benchmark,
    reality: hostileReality,
    now: FIXED_NOW,
  });
  const hostileRecord = asRecord(
    await hostileCalibration.recordCalibrationError(
      calibrationInput({ scope: hostileScope }),
    ),
  );
  assert.equal(hostileRecord.tenantId, hostileTenant);
  assert.equal(hostileRecord.observedOutcome, 15);

  // The honest tenant's chain is untouched: no bleed, no version bump.
  const honest = asRecord(await loop.calibration.recordCalibrationError(calibrationInput()));
  assert.equal(honest.version, 1 as Version);
  assert.equal(honest.tenantId, benchmarkScope().tenantId);
  assert.equal(honest.observedOutcome, 150);

  // Cross-tenant reads observe nothing (no existence leak, exact equality).
  assert.deepEqual(
    await hostileCalibration.listCalibrationErrorVersions(benchmarkScope(), calibrationId()),
    [],
  );
  assert.equal(
    await loop.calibration.getCalibrationErrorRecord(hostileScope, calibrationId(), 1),
    null,
  );
  assert.deepEqual(
    await loop.calibration.listCalibrationErrorsForBenchmark(
      hostileScope,
      calibrationInput().prediction.benchmarkId,
    ),
    [],
  );
});

test('prefix-scan hostile tenant (tenant-a-evil) never widens tenant-a records (D2)', async () => {
  const loop = await calibrationLoop();
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }
  const honestRecord = asRecord(await loop.calibration.recordCalibrationError(calibrationInput()));

  // A tenant whose id is a strict PREFIX EXTENSION of the honest tenant.
  const evilScope = scopeOf('tenant-a-evil');
  assert.deepEqual(
    await loop.calibration.listCalibrationErrorVersions(evilScope, calibrationId()),
    [],
  );
  assert.deepEqual(
    await loop.calibration.listCalibrationErrorsForBenchmark(
      evilScope,
      honestRecord.prediction.benchmarkId,
    ),
    [],
  );
  assert.equal(
    await loop.calibration.resolveLatestCalibrationErrorRecord(evilScope, calibrationId()),
    null,
  );
});

test('two tenants sharing the calibration id and benchmark chain keep INDEPENDENT versions', async () => {
  const loop = await calibrationLoop();
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }

  const secondScope = scopeOf('tenant-c');
  const secondReality = createInMemoryRealityObservationReader({
    seeds: [
      { scope: secondScope, observation: realityObservation('reality-a', 300) },
      { scope: secondScope, observation: realityObservation('reality-b', 500) },
    ],
  });
  const secondCalibration = createInMemoryOnlineCalibration({
    benchmark: loop.benchmark,
    reality: secondReality,
    now: FIXED_NOW,
  });

  // The second tenant's own benchmark chain (same id, their scope). W10-A
  // triage (test-defect fix): the shared stores are tenant-scoped, so the
  // second scope must register its OWN two-world ensemble before running —
  // the original setup ran the benchmark bare in the foreign scope and
  // correctly failed closed unknown-ensemble (the scoping is right; the
  // setup was incomplete).
  const secondRun = await runFixtureBenchmarkInScope(loop, secondScope, 'tenant-c');
  if ('error' in secondRun) {
    assert.fail(`unexpected second benchmark error: ${secondRun.error}`);
  }

  const first = asRecord(await loop.calibration.recordCalibrationError(calibrationInput()));
  const second = asRecord(
    await secondCalibration.recordCalibrationError(
      calibrationInput({ scope: secondScope }),
    ),
  );
  assert.equal(first.tenantId, benchmarkScope().tenantId);
  assert.equal(second.tenantId, secondScope.tenantId);
  assert.equal(first.version, 1 as Version);
  assert.equal(second.version, 1 as Version); // independent chains, not 2
  assert.equal(first.observedOutcome, 150);
  assert.equal(second.observedOutcome, 400);
  assert.notEqual(first.errorDigest, second.errorDigest);
});

// ---------------------------------------------------------------------------
// The boundary statements (§24 pinned on EVERY record)
// ---------------------------------------------------------------------------

test('the §24 statement is pinned verbatim on every error record AND context record', async () => {
  const loop = await calibrationLoop();
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }
  const record = asRecord(await loop.calibration.recordCalibrationError(calibrationInput()));
  const context = await loop.calibration.deriveCalibrationContext({
    scope: benchmarkScope(),
    benchmarkId: record.prediction.benchmarkId,
  });
  if ('error' in context) {
    assert.fail(`unexpected context error: ${context.error}`);
  }

  assert.equal(
    record.labOnly,
    'calibration analysis records simulation-to-reality prediction error for the frozen benchmark prediction it cites — it never becomes an experiment or measurement authority (§19/§20), never rewrites the benchmark record or the historical observations, and feeds back only as DECLARED versioned context the benchmark may cite (§24)',
  );
  assert.equal(
    context.labOnly,
    'the calibration context is DECLARED versioned analysis feedback a later benchmark run may cite — it never implies calibrated simulator output, never becomes an experiment/measurement authority, and never rewrites the error records or benchmark records it summarizes',
  );
  // Every record names itself an ANALYSIS artifact, never an experiment.
  assert.equal(record.recordKind, 'lab-calibration-analysis');
  assert.equal(context.recordKind, 'lab-calibration-context');
});

test('the port surface carries NO update/delete/authority method (no second experiment authority)', async () => {
  const loop = await calibrationLoop();
  const methodNames = Object.keys(loop.calibration).sort();
  assert.deepEqual(methodNames, [
    'deriveCalibrationContext',
    'getCalibrationContext',
    'getCalibrationErrorRecord',
    'listCalibrationContextVersions',
    'listCalibrationErrorVersions',
    'listCalibrationErrorsForBenchmark',
    'recordCalibrationError',
    'resolveLatestCalibrationContext',
    'resolveLatestCalibrationErrorRecord',
    'verifyCalibrationContextIntegrity',
    'verifyCalibrationErrorRecordIntegrity',
  ]);
  // ELEVEN methods ≤ the 12 policy budget; the only write paths are the two
  // append paths (record + derive). No run/measure/experiment vocabulary.
  for (const name of methodNames) {
    assert.equal(/^(update|delete|remove|rewrite|run|measure|experiment)/.test(name), false);
  }
});

// ---------------------------------------------------------------------------
// The reality reader double's own ownership discipline (the W10-A fix pin)
// ---------------------------------------------------------------------------

test('reality reader seeds are clone-then-frozen: caller-owned arrays are never frozen', () => {
  const scope = scopeOf('tenant-a');
  const metrics = [{ metric: 'qualified-reach', value: 100, unit: 'people' }];
  const sourceRefs = ['src://platform/analytics/reality-a'];
  const draft = realityObservation('reality-a', 100, { metrics, sourceRefs });

  const reader = createInMemoryRealityObservationReader({
    seeds: [{ scope, observation: draft }],
  });

  // The caller's arrays are NOT frozen (clone-then-freeze, not freeze-in-place).
  assert.equal(Object.isFrozen(metrics), false);
  assert.equal(Object.isFrozen(sourceRefs), false);

  // Mutating the caller's arrays never changes the stored observation.
  metrics[0] = { metric: 'qualified-reach', value: 999, unit: 'people' };
  const served = reader.getObservation(scope, observationIdOf('reality-a'));
  return served.then((observation) => {
    assert.notEqual(observation, null);
    assert.deepEqual(observation?.metrics, [
      { metric: 'qualified-reach', value: 100, unit: 'people' },
    ]);
    // The served record IS frozen (bit-for-bit immutable).
    assert.equal(Object.isFrozen(observation), true);
    assert.throws(() => {
      (
        observation as unknown as {
          metrics: { metric: string; value: number; unit: string }[];
        }
      ).metrics.push({
        metric: 'forged',
        value: 1,
        unit: 'people',
      });
    }, TypeError);
  });
});

test('reality reader seeds fail loudly on duplicate ids and malformed drafts', () => {
  const scope = scopeOf('tenant-a');
  const reader = createInMemoryRealityObservationReader({
    seeds: [{ scope, observation: realityObservation('reality-a', 100) }],
  });
  assert.throws(() => {
    reader.seed({ scope, observation: realityObservation('reality-a', 200) });
  }, /duplicate observation id/u);
  assert.throws(() => {
    reader.seed({ scope, observation: null as never });
  }, /draft must be an object/u);
  // W10-A triage (test-defect fix): the blank-id probe must construct a
  // LITERALLY blank draft id — the observationIdOf fixture prefixes
  // `obs-`, so realityObservation('', 100) yields the non-blank id `obs-`
  // and never exercised the reader's blank-id rejection.
  assert.throws(() => {
    reader.seed({
      scope,
      observation: { ...realityObservation('blank', 100), id: '' as never },
    });
  }, /draft id must be a non-empty string/u);
});

test('an Infinity-valued metric fails closed before any error record is stored (D5)', async () => {
  const loop = await calibrationLoop([
    realityObservation('reality-a', Number.POSITIVE_INFINITY),
    realityObservation('reality-b', 200),
  ]);
  const run = await runFixtureBenchmark(loop.benchmark);
  if ('error' in run) {
    assert.fail(`unexpected benchmark error: ${run.error}`);
  }
  const result = await loop.calibration.recordCalibrationError(calibrationInput());
  assert.ok('error' in result);
  assert.equal(result.error, 'invalid-observation-metric');
  assert.deepEqual(
    await loop.calibration.listCalibrationErrorVersions(
      calibrationInput().scope,
      calibrationId(),
    ),
    [],
  );
});
