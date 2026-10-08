import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EnsembleEvaluationInput, EnsemblePort } from '../contracts/ensemble.js';
import type { WorldModelEnsembleId } from '../contracts/ensemble.js';
import type { TenantScope } from '@mos/contracts';
import type {
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from '../contracts/robust-benchmark-port.js';
import type { MarketingBenchmarkInput } from '../contracts/robust-benchmark.js';
import { createInMemoryMarketingBenchmark } from './in-memory-marketing-benchmark.js';
import {
  benchmarkCandidateAlpha,
  benchmarkCandidateBeta,
  benchmarkEnsembleStack,
  benchmarkId,
  benchmarkInput,
  benchmarkScope,
  robustnessPolicy,
} from '../testing/w9a-benchmark-fixtures.js';
import { FIXED_NOW } from '../testing/w9a-benchmark-fixtures.js';

type RunResult = Awaited<ReturnType<MarketingBenchmarkPort['runBenchmark']>>;

const asRecord = (result: RunResult): RobustBenchmarkRecord => {
  if ('error' in result) {
    assert.fail(`unexpected benchmark error: ${result.error} — ${result.message}`);
  }
  return result;
};

const portOver = (
  ensemble: Pick<EnsemblePort, 'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'>,
): MarketingBenchmarkPort =>
  createInMemoryMarketingBenchmark({ ensemble, now: FIXED_NOW });

/** A spy ensemble wrapper recording every evaluation call (fairness pin test). */
const recordingEnsemble = (ensemble: EnsemblePort): {
  readonly ensemble: Pick<EnsemblePort, 'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'>;
  readonly calls: readonly string[];
} => {
  const calls: string[] = [];
  return {
    calls,
    ensemble: {
      evaluateEnsemble: async (input: EnsembleEvaluationInput) => {
        calls.push(
          [
            input.candidate.strategyRef,
            input.ensembleId,
            input.ensembleVersion,
            input.seed,
            input.step,
          ].join('|'),
        );
        return ensemble.evaluateEnsemble(input);
      },
      getEnsemble: (scope: TenantScope, id: WorldModelEnsembleId, version: number) =>
        ensemble.getEnsemble(scope, id, version),
      resolveLatestEnsemble: (scope: TenantScope, id: WorldModelEnsembleId) =>
        ensemble.resolveLatestEnsemble(scope, id),
    },
  };
};

// ---------------------------------------------------------------------------
// Cross-candidate fairness (the SAME conditions for every candidate)
// ---------------------------------------------------------------------------

test('fairness pin: every candidate is evaluated under the IDENTICAL (world, seed, step) grid', async () => {
  const stack = await benchmarkEnsembleStack();
  const recorder = recordingEnsemble(stack.ensemble);
  const port = portOver(recorder.ensemble);
  const record = asRecord(await port.runBenchmark(benchmarkInput()));

  // The recorded statement + the pinned conditions on the record.
  assert.equal(
    record.fairness.statement,
    'every candidate in this benchmark was evaluated under the same seeds, world-model set, policy version and reward spec version — no per-candidate condition cherry-picking',
  );
  assert.deepEqual(record.fairness.seeds, [11, 22, 33]);
  assert.equal(record.fairness.policyId, 'policy-robust-reach');
  assert.equal(record.fairness.policyVersion, 1);
  assert.equal(record.fairness.rewardSpecVersion, 1);
  assert.deepEqual(
    record.fairness.worldModelSet.map((ref) => `${ref.ensembleId}@${ref.ensembleVersion}`),
    ['ensemble-reach@1', 'ensemble-reach-alt@1'],
  );

  // The SPY pin: the (world, seed) sweep conditions are IDENTICAL for every
  // candidate strategy ref, and the step axis covers exactly each
  // candidate's declared horizon — no per-candidate seed/world
  // cherry-picking is expressible (horizon is a DECLARED candidate
  // property, not an evaluation condition).
  const gridByCandidate = new Map<string, Set<string>>();
  const stepsByCandidate = new Map<string, Set<number>>();
  for (const call of recorder.calls) {
    const [ref, ensemble, version, seed, step] = call.split('|');
    const grid = gridByCandidate.get(ref as string) ?? new Set<string>();
    grid.add(`${ensemble}@${version}:${seed}`);
    gridByCandidate.set(ref as string, grid);
    const steps = stepsByCandidate.get(ref as string) ?? new Set<number>();
    steps.add(Number(step));
    stepsByCandidate.set(ref as string, steps);
  }
  assert.equal(gridByCandidate.size, 3, 'three candidates must have been swept');
  const grids = [...gridByCandidate.values()];
  const reference = grids[0];
  assert.ok(reference);
  for (const grid of grids.slice(1)) {
    assert.deepEqual([...grid], [...reference], 'every candidate sweep must cover the same (world, seed) conditions');
  }
  // the sweep covers BOTH ensembles × ALL three seeds for every candidate.
  assert.equal(reference.size, 2 * 3);
  // the step axis covers exactly the declared horizon of each candidate.
  assert.deepEqual([...(stepsByCandidate.get('strategy-alpha') ?? [])].sort(), [0, 1]);
  assert.deepEqual([...(stepsByCandidate.get('strategy:benchmark-no-op-baseline') ?? [])].sort(), [0]);

  // per-candidate provenance pins the SAME conditions.
  for (const entry of record.ranked) {
    assert.deepEqual(entry.provenance.seeds, [11, 22, 33]);
    assert.equal(entry.provenance.policyVersion, 1);
    assert.equal(entry.provenance.rewardSpecVersion, 1);
    assert.equal(entry.provenance.worldModels.length, 2);
  }
});

// ---------------------------------------------------------------------------
// Determinism (bit-identical results given the same inputs)
// ---------------------------------------------------------------------------

test('determinism: identical runs produce bit-identical results (same digest), fresh adapters included', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const first = asRecord(
    await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-det') })),
  );
  const second = asRecord(
    await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-det') })),
  );
  // the second run APPENDS version 2 with the identical result payload.
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(first.resultDigest, second.resultDigest);
  const { version: _v1, resultDigest: _d1, recordedAt: _t1, ...payload1 } = first;
  const { version: _v2, resultDigest: _d2, recordedAt: _t2, ...payload2 } = second;
  assert.deepEqual(payload1, payload2);

  // a FRESH adapter over the same wired ensembles reproduces the digest
  // (the fresh chain starts at version 1 again — same inputs, same result).
  const fresh = asRecord(
    await createInMemoryMarketingBenchmark({ ensemble, now: FIXED_NOW }).runBenchmark(
      benchmarkInput({ benchmarkId: benchmarkId('bench-det') }),
    ),
  );
  assert.equal(fresh.version, 1);
  assert.equal(fresh.resultDigest, first.resultDigest);
});

test('determinism: different seeds or policies change the result (the digest is sensitive)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const base = asRecord(
    await portOver(ensemble).runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-sens') })),
  );
  const otherSeeds = asRecord(
    await portOver(ensemble).runBenchmark(
      benchmarkInput({
        benchmarkId: benchmarkId('bench-sens'),
        seeds: [101, 202, 303],
      }),
    ),
  );
  const otherPolicy = asRecord(
    await portOver(ensemble).runBenchmark(
      benchmarkInput({
        benchmarkId: benchmarkId('bench-sens'),
        policy: robustnessPolicy({ aggregation: 'worst-world-mean' }),
      }),
    ),
  );
  assert.notEqual(base.resultDigest, otherSeeds.resultDigest);
  assert.notEqual(base.resultDigest, otherPolicy.resultDigest);
});

// ---------------------------------------------------------------------------
// Append-only record chains (versioned, bit-for-bit immutable)
// ---------------------------------------------------------------------------

test('append-only: re-running appends versions and prior records stay bit-for-bit identical', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const first = asRecord(await port.runBenchmark(benchmarkInput()));
  const second = asRecord(
    await port.runBenchmark(
      benchmarkInput({ candidates: [benchmarkCandidateAlpha()] }),
    ),
  );

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);

  // the prior version is retrievable and bit-for-bit unchanged.
  const reread = await port.getBenchmarkRecord(benchmarkScope(), benchmarkId(), 1);
  assert.ok(reread);
  assert.deepEqual(reread, first);
  assert.equal(reread.ranked.length, 3);

  // the chain lists versions oldest-first.
  const versions = await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId());
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.version, 1);
  assert.equal(versions[1]?.version, 2);
  const latest = await port.resolveLatestBenchmarkRecord(benchmarkScope(), benchmarkId());
  assert.ok(latest);
  assert.equal(latest.version, 2);

  // unknown versions are null (no existence leakage beyond null).
  assert.equal(await port.getBenchmarkRecord(benchmarkScope(), benchmarkId(), 99), null);
  assert.equal(await port.getBenchmarkRecord(benchmarkScope(), benchmarkId('never-run'), 1), null);
  assert.equal(await port.resolveLatestBenchmarkRecord(benchmarkScope(), benchmarkId('never-run')), null);
  assert.deepEqual(await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId('never-run')), []);
});

test('frozen results are bit-for-bit immutable: mutation attempts throw (nested included)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await portOver(ensemble).runBenchmark(benchmarkInput()));

  assert.throws(() => {
    (record as unknown as Record<string, unknown>).version = 99;
  }, TypeError);
  assert.throws(() => {
    (record as unknown as Record<string, unknown>).resultDigest = 'forged';
  }, TypeError);
  const ranked = record.ranked[0] as (typeof record.ranked)[number];
  assert.throws(() => {
    (ranked as unknown as Record<string, unknown>).rank = 0;
  }, TypeError);
  assert.throws(() => {
    (ranked.evaluation as unknown as Record<string, unknown>).expectedReward = 1e9;
  }, TypeError);
  assert.throws(() => {
    (ranked.candidate as unknown as Record<string, unknown>).action = { kind: 'no-op' };
  }, TypeError);
  assert.throws(() => {
    (record.provenance.worldModels as unknown as Record<string, unknown>[]).push({
      ensembleId: 'forged',
    });
  }, TypeError);
  assert.throws(() => {
    (record.seeds as unknown as number[]).push(44);
  }, TypeError);
});

test('clone-then-freeze ownership: mutating caller inputs after the run cannot corrupt the record', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const candidates = [benchmarkCandidateAlpha(), benchmarkCandidateBeta()];
  const policy = robustnessPolicy();
  const seeds = [11, 22, 33];
  const input: MarketingBenchmarkInput = {
    ...benchmarkInput({ candidates, policy, seeds }),
  };
  const record = asRecord(await port.runBenchmark(input));

  // the caller mutates its own objects after the fact.
  const first = candidates[0];
  assert.ok(first);
  (first as unknown as Record<string, unknown>).key = 'mutated';
  (first.action as unknown as Record<string, unknown>).cadencePerWeek = 99;
  ((first.source as unknown as Record<string, unknown>).producerPins as unknown[]).push({
    surface: 'forged',
    version: 1,
  });
  (policy as unknown as Record<string, unknown>).note = 'mutated';
  (seeds as unknown as number[]).push(44);

  // the stored record is unaffected (deep-cloned inputs, frozen).
  const alpha = record.ranked.find((entry) => entry.key === 'alpha');
  assert.ok(alpha);
  assert.equal(alpha.candidate.action.cadencePerWeek, 5);
  assert.equal(alpha.candidate.source.producerPins.length, 0);
  assert.deepEqual(record.seeds, [11, 22, 33]);
  assert.equal(record.policy.note, 'fixture policy: 3-seed sweep over the two-ensemble world set, pooled mean');
  const reread = await port.getBenchmarkRecord(benchmarkScope(), benchmarkId(), 1);
  assert.ok(reread);
  assert.deepEqual(reread, record);
});

// ---------------------------------------------------------------------------
// Bit-for-bit integrity verification
// ---------------------------------------------------------------------------

test('integrity verification: intact records verify, unknown records are null', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const record = asRecord(await port.runBenchmark(benchmarkInput()));

  const report = await port.verifyBenchmarkRecordIntegrity(
    benchmarkScope(),
    benchmarkId(),
    record.version,
  );
  assert.ok(report);
  assert.equal(report.status, 'intact');
  assert.equal(report.benchmarkId, benchmarkId());
  assert.equal(report.version, record.version);
  assert.equal(report.recordedDigest, record.resultDigest);
  assert.equal(report.recomputedDigest, record.resultDigest);

  assert.equal(
    await port.verifyBenchmarkRecordIntegrity(benchmarkScope(), benchmarkId(), 404),
    null,
  );
  assert.equal(
    await port.verifyBenchmarkRecordIntegrity(benchmarkScope(), benchmarkId('unknown'), 1),
    null,
  );
  // a failed run appends NO record — nothing to verify.
  const failure = await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('failed'), seeds: [1] }));
  assert.ok('error' in failure);
  assert.equal(failure.error, 'seed-budget-mismatch');
  assert.equal(
    await port.verifyBenchmarkRecordIntegrity(benchmarkScope(), benchmarkId('failed'), 1),
    null,
  );
  assert.deepEqual(
    await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId('failed')),
    [],
  );
});

// ---------------------------------------------------------------------------
// Port shape (the ≤ 12 method budget, the only write path)
// ---------------------------------------------------------------------------

test('the marketing benchmark port exposes exactly the five declared methods (≤ 12 budget)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  assert.deepEqual(Object.keys(port).sort(), [
    'getBenchmarkRecord',
    'listBenchmarkRecordVersions',
    'resolveLatestBenchmarkRecord',
    'runBenchmark',
    'verifyBenchmarkRecordIntegrity',
  ]);
  // runBenchmark is the ONLY method that appends (no update/delete surface).
  assert.equal(typeof port.runBenchmark, 'function');
  assert.equal(typeof (port as unknown as Record<string, unknown>).updateBenchmarkRecord, 'undefined');
  assert.equal(typeof (port as unknown as Record<string, unknown>).deleteBenchmarkRecord, 'undefined');
});
