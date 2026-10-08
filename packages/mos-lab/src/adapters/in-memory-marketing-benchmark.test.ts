import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EnsemblePort } from '../contracts/ensemble.js';
import type {
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from '../contracts/robust-benchmark-port.js';
import type { MarketingBenchmarkInput } from '../contracts/robust-benchmark.js';
import { BENCHMARK_NOOP_STRATEGY_REF } from '../contracts/robust-benchmark.js';
import { createInMemoryMarketingBenchmark } from './in-memory-marketing-benchmark.js';
import {
  BENCHMARK_SEEDS,
  benchmarkCandidateAlpha,
  benchmarkCandidateFromSearch,
  benchmarkEnsembleStack,
  benchmarkInput,
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

const portOver = (ensemble: EnsemblePort): MarketingBenchmarkPort =>
  createInMemoryMarketingBenchmark({ ensemble, now: FIXED_NOW });

const runOver = async (
  ensemble: EnsemblePort,
  overrides: Partial<MarketingBenchmarkInput> = {},
): Promise<RunResult> =>
  portOver(ensemble).runBenchmark(benchmarkInput(overrides));

// ---------------------------------------------------------------------------
// The §22 benchmark surface (multi-seed, multi-world, EV + interval, OOD)
// ---------------------------------------------------------------------------

test('benchmark runs the declared set + the synthesized no-op baseline and ranks uncertainty-aware', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  assert.equal(record.version, 1);
  assert.equal(record.id, 'bench-reach-v1' as never);
  assert.equal(record.tenantId, 'tenant-a' as never);
  // ranked = the two declared candidates + the no-op baseline.
  assert.equal(record.ranked.length, 3);
  const keys = record.ranked.map((entry) => entry.key);
  assert.ok(keys.includes('alpha'));
  assert.ok(keys.includes('beta'));
  assert.ok(keys.includes('no-op-baseline'));
  // ranks are 1..n in the declared deterministic order.
  assert.deepEqual(record.ranked.map((entry) => entry.rank), [1, 2, 3]);
  // expected reward DESC by construction of the ordering.
  for (let index = 1; index < record.ranked.length; index += 1) {
    const prior = record.ranked[index - 1] as (typeof record.ranked)[number];
    const current = record.ranked[index] as (typeof record.ranked)[number];
    assert.ok(
      prior.evaluation.expectedReward >= current.evaluation.expectedReward,
      'ranked expected rewards must be non-increasing',
    );
  }
  // the comparison set: the baseline is structurally present, the declared set listed.
  assert.equal(record.comparison.noopBaseline.key, 'no-op-baseline');
  assert.equal(record.comparison.noopBaseline.origin, 'no-op-baseline');
  assert.equal(record.comparison.declared.length, 2);
  assert.deepEqual(
    record.comparison.declared.map((entry) => entry.key).sort(),
    ['alpha', 'beta'],
  );
  // every comparison entry is one of the ranked entries.
  for (const entry of record.comparison.declared) {
    assert.ok(record.ranked.includes(entry));
  }
  assert.ok(record.ranked.includes(record.comparison.noopBaseline));
});

test('multi-seed sweep is recorded: per-seed expected rewards aligned with the declared seeds', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  for (const entry of record.ranked) {
    assert.deepEqual(entry.evaluation.seedRobustness.seeds, BENCHMARK_SEEDS);
    assert.equal(entry.evaluation.seedRobustness.perSeedExpected.length, BENCHMARK_SEEDS.length);
    // the sweep is REAL: seeded noise moves the content candidates' rewards.
    const distinct = new Set(entry.evaluation.seedRobustness.perSeedExpected).size;
    if (entry.key === 'alpha' || entry.key === 'beta') {
      assert.ok(distinct > 1, `candidate ${entry.key}: per-seed expected rewards must differ`);
      assert.ok(entry.evaluation.seedRobustness.spread > 0);
      assert.ok(entry.evaluation.seedRobustness.halfSpread > 0);
    }
    // the no-op's rewards are exactly zero on every seed (nothing happens).
    if (entry.key === 'no-op-baseline') {
      assert.deepEqual(entry.evaluation.seedRobustness.perSeedExpected, [0, 0, 0]);
    }
  }
  // the run-level seeds are pinned on the record (provenance + fairness).
  assert.deepEqual(record.seeds, BENCHMARK_SEEDS);
  assert.deepEqual(record.provenance.seeds, BENCHMARK_SEEDS);
  assert.deepEqual(record.fairness.seeds, BENCHMARK_SEEDS);
});

test('multi-world disagreement surfaces: per-world expected rewards, member spreads, cross-world spread', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  const alpha = record.ranked.find((entry) => entry.key === 'alpha');
  assert.ok(alpha, 'alpha must be ranked');
  const world = alpha.evaluation.worldRobustness;
  // two worlds, labeled, with their ensemble pins.
  assert.equal(world.perWorld.length, 2);
  assert.deepEqual(
    world.perWorld.map((entry) => entry.label).sort(),
    ['pessimistic', 'primary'],
  );
  // the alternative worlds (30k/12k) bracket the primary ones (12k/24k):
  // the cross-world spread is structural and positive.
  assert.ok(world.spread > 0, 'cross-world spread must be positive for a content candidate');
  assert.ok(world.worstExpectedReward < world.bestExpectedReward);
  // per-world member disagreement: two members per world with the audience
  // factor spread — never hidden by aggregation.
  assert.equal(alpha.evaluation.disagreement.perWorld.length, 2);
  for (const perWorld of alpha.evaluation.disagreement.perWorld) {
    assert.equal(perWorld.memberExpected.length, 2);
    assert.ok(perWorld.spread > 0, `world ${perWorld.label}: member spread must be positive`);
    assert.equal(perWorld.halfSpread, perWorld.spread / 2);
  }
  assert.equal(
    alpha.evaluation.disagreement.worstHalfWidth,
    Math.max(...alpha.evaluation.disagreement.perWorld.map((entry) => entry.halfSpread)),
  );
  // the no-op is model-independent: zero member disagreement on every world.
  const noop = record.comparison.noopBaseline;
  assert.equal(noop.evaluation.disagreement.worstHalfWidth, 0);
  for (const perWorld of noop.evaluation.disagreement.perWorld) {
    assert.deepEqual(perWorld.memberExpected, [0, 0]);
  }
});

test('expected value + uncertainty interval per candidate: closed interval covering the estimate, additive breakdown', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  for (const entry of record.ranked) {
    const { expectedReward, interval, breakdown } = entry.evaluation;
    assert.ok(Number.isFinite(expectedReward));
    // the interval is closed and covers the estimate (additive half-widths).
    assert.ok(interval.lower <= expectedReward, 'lower bound must cover the estimate');
    assert.ok(expectedReward <= interval.upper, 'upper bound must cover the estimate');
    // the documented bench-additive-v1 decomposition.
    assert.equal(breakdown.formula, 'bench-additive-v1');
    assert.equal(
      breakdown.totalHalfWidth,
      breakdown.memberDisagreementHalfWidth +
        breakdown.seedRobustnessHalfWidth +
        breakdown.worldModelSpreadHalfWidth,
    );
    const half = (interval.upper - interval.lower) / 2;
    assert.ok(Math.abs(half - breakdown.totalHalfWidth) < 1e-9);
    assert.ok((entry.evaluation.uncertainty.note ?? '').length > 0);
    // §22/§24 pins on every evaluation.
    assert.equal(entry.evaluation.counterfactual, true);
    assert.equal(entry.evaluation.disclosure, 'robust-benchmark-over-disclosed-synthetic-ensembles');
  }
});

test('OOD/novelty-regime signals vs declared coverage: flagged per world, aggregated worst', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  // alpha (cadence 5) is OUT of member-b's narrow [0,3] cadence coverage in
  // the PRIMARY world, in coverage everywhere in the alternative world.
  const alpha = record.ranked.find((entry) => entry.key === 'alpha');
  assert.ok(alpha);
  assert.equal(alpha.evaluation.ood.status, 'out-of-declared-coverage');
  assert.equal(alpha.evaluation.ood.flagged, true);
  const primaryOod = alpha.evaluation.ood.perWorld.find((entry) => entry.label === 'primary');
  const altOod = alpha.evaluation.ood.perWorld.find((entry) => entry.label === 'pessimistic');
  assert.ok(primaryOod && altOod);
  assert.equal(primaryOod.status, 'out-of-declared-coverage');
  assert.equal(primaryOod.flagged, true);
  assert.ok(primaryOod.maxDistance > 0);
  assert.equal(altOod.status, 'in-coverage');
  assert.equal(altOod.flagged, false);
  assert.equal(altOod.maxDistance, 0);

  // beta (cadence 2) is inside every declared coverage.
  const beta = record.ranked.find((entry) => entry.key === 'beta');
  assert.ok(beta);
  assert.equal(beta.evaluation.ood.status, 'in-coverage');
  assert.equal(beta.evaluation.ood.flagged, false);

  // the no-op (zero knobs) is always in coverage.
  assert.equal(record.comparison.noopBaseline.evaluation.ood.status, 'in-coverage');
});

test('no-op baseline is ALWAYS present — even when the declared candidate set is empty', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble, { candidates: [] }));

  assert.equal(record.ranked.length, 1);
  assert.equal(record.ranked[0]?.key, 'no-op-baseline');
  assert.equal(record.comparison.declared.length, 0);
  assert.equal(record.comparison.noopBaseline.key, 'no-op-baseline');
  // the synthesized baseline: first-class no-op action, zero knobs, horizon 1.
  const baseline = record.comparison.noopBaseline;
  assert.equal(baseline.candidate.action.kind, 'no-op');
  assert.equal(baseline.candidate.action.cadencePerWeek, 0);
  assert.equal(baseline.candidate.action.strategyRef, BENCHMARK_NOOP_STRATEGY_REF);
  assert.equal(baseline.candidate.horizonSteps, 1);
  // the reward spec maximizes qualified-reach: the no-op does nothing, so
  // its simulated reward is exactly zero with a degenerate interval.
  assert.equal(baseline.evaluation.expectedReward, 0);
  // every entry (the baseline included) carries a declared self-comparison.
  assert.equal(baseline.comparisonToBaseline.expectedRewardDelta, 0);
  assert.equal(baseline.comparisonToBaseline.baselineExpectedReward, 0);
  assert.equal(baseline.comparisonToBaseline.certainlyBetterThanBaseline, false);
});

test('declared aggregation rules: pooled mean vs worst-world mean (the conservative floor)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const pooled = asRecord(await runOver(ensemble, { benchmarkId: 'bench-pooled' as never }));
  const worst = asRecord(
    await runOver(ensemble, {
      benchmarkId: 'bench-worst' as never,
      policy: robustnessPolicy({ aggregation: 'worst-world-mean' }),
    }),
  );

  for (const entry of pooled.ranked) {
    const counterpart = worst.ranked.find((other) => other.key === entry.key);
    assert.ok(counterpart, `worst-world record must rank ${entry.key}`);
    assert.equal(counterpart.evaluation.breakdown.aggregation, 'worst-world-mean');
    // worst-world mean = min over worlds — never above the pooled mean.
    assert.ok(
      counterpart.evaluation.expectedReward <= entry.evaluation.expectedReward + 1e-9,
      'worst-world mean must not exceed the pooled mean',
    );
    // and it equals the declared worst world's mean reward.
    assert.ok(
      Math.abs(
        counterpart.evaluation.expectedReward -
          counterpart.evaluation.worldRobustness.worstExpectedReward,
      ) < 1e-9,
    );
  }
});

test('baseline comparisons + leader overlap are declared on every ranked entry', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  const baselineReward = record.comparison.noopBaseline.evaluation.expectedReward;
  for (const entry of record.ranked) {
    assert.equal(entry.comparisonToBaseline.baselineExpectedReward, baselineReward);
    assert.ok(
      Math.abs(
        entry.comparisonToBaseline.expectedRewardDelta -
          (entry.evaluation.expectedReward - baselineReward),
      ) < 1e-9,
    );
    // certainly-better = interval lower strictly above the baseline upper.
    assert.equal(
      entry.comparisonToBaseline.certainlyBetterThanBaseline,
      entry.evaluation.interval.lower >
        record.comparison.noopBaseline.evaluation.interval.upper,
    );
  }
  // rank 1 carries no leader overlap; every other rank declares one.
  assert.equal(record.ranked[0]?.intervalOverlapWithLeader, null);
  for (let index = 1; index < record.ranked.length; index += 1) {
    const entry = record.ranked[index] as (typeof record.ranked)[number];
    assert.ok(entry.intervalOverlapWithLeader);
    const leader = record.ranked[0] as (typeof record.ranked)[number];
    const expected =
      !(entry.evaluation.interval.upper < leader.evaluation.interval.lower ||
        leader.evaluation.interval.upper < entry.evaluation.interval.lower);
    assert.equal(entry.intervalOverlapWithLeader.overlaps, expected);
  }
});

test('deterministic tie-break: identical-knob candidates rank by key ascending', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const twinA = benchmarkCandidateAlpha({
    key: 'twin-b',
    action: { ...benchmarkCandidateAlpha().action, strategyRef: 'strategy-twin-b' as never },
    label: null,
  });
  const twinB = benchmarkCandidateAlpha({
    key: 'twin-a',
    action: { ...benchmarkCandidateAlpha().action, strategyRef: 'strategy-twin-a' as never },
    label: null,
  });
  const record = asRecord(
    await runOver(ensemble, {
      benchmarkId: 'bench-twins' as never,
      candidates: [twinA, twinB],
    }),
  );

  // identical knobs → identical evaluations (strategyRef does not enter the
  // response function) → the tie-break is key ASC.
  const twins = record.ranked.filter((entry) => entry.key === 'twin-a' || entry.key === 'twin-b');
  assert.equal(twins.length, 2);
  const first = twins[0];
  const second = twins[1];
  assert.ok(first && second, 'both twins must be ranked');
  assert.ok(first.rank < second.rank);
  assert.equal(first.key, 'twin-a');
  assert.equal(second.key, 'twin-b');
  assert.equal(
    first.evaluation.expectedReward,
    second.evaluation.expectedReward,
    'identical knobs must produce identical expected rewards',
  );
});

test('production-search-shaped candidates flow through the declared action seam', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(
    await runOver(ensemble, {
      benchmarkId: 'bench-searched' as never,
      candidates: [benchmarkCandidateFromSearch()],
    }),
  );
  const searched = record.ranked.find((entry) => entry.key === 'searched-1');
  assert.ok(searched, 'the production-search-shaped candidate must be ranked');
  assert.equal(searched.origin, 'production-search');
  assert.deepEqual(searched.provenance.candidateSource.producerPins, [
    { surface: 'production-program-search', version: 1 },
  ]);
  assert.ok(record.comparison.declared.length === 1);
});

// ---------------------------------------------------------------------------
// §24 + calibration labeling (never invented numbers)
// ---------------------------------------------------------------------------

test('§24 boundary statement + counterfactual + disclosure on the record and every evaluation', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  assert.equal(
    record.labOnly,
    'robust benchmark output informs selection only — it is NOT deployment evidence; the real-experiment boundary (§24) is the only path to reality-grade proof',
  );
  assert.equal(record.counterfactual, true);
  assert.equal(record.disclosure, 'robust-benchmark-over-disclosed-synthetic-ensembles');
  for (const entry of record.ranked) {
    assert.equal(entry.evaluation.counterfactual, true);
  }
});

test('calibration is DECLARED PENDING REALITY — never a number (LAB-018 seam)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await runOver(ensemble));

  const calibration = record.calibration;
  assert.equal(calibration.status, 'pending-reality');
  assert.equal(
    calibration.provenance,
    'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten',
  );
  assert.equal(calibration.predictionSurface, 'per-candidate expected reward + interval');
  // the declaration carries EXACTLY its three declared fields — no numbers.
  assert.deepEqual(Object.keys(calibration).sort(), [
    'predictionSurface',
    'provenance',
    'status',
  ]);
  // per-candidate declarations are identical and number-free.
  for (const entry of record.ranked) {
    assert.deepEqual(entry.evaluation.calibration, calibration);
  }
});
