import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@mos/contracts";
import type { EnsembleEvaluationInput, EnsemblePort } from "../contracts/ensemble.js";
import type { WorldModelEnsembleId } from "../contracts/ensemble.js";
import type {
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from "../contracts/robust-benchmark-port.js";
import type { MarketingBenchmarkInput, RobustnessPolicy } from "../contracts/robust-benchmark.js";
import { createInMemoryMarketingBenchmark } from "./in-memory-marketing-benchmark.js";
import {
  benchmarkCandidateAlpha,
  benchmarkCandidateBeta,
  benchmarkEnsembleStack,
  benchmarkId,
  benchmarkInput,
  benchmarkScenario,
  benchmarkScope,
  reachRewardSpec,
  robustnessPolicy,
  tenantOf,
} from "../testing/w9a-benchmark-fixtures.js";
import { FIXED_NOW } from "../testing/w9a-benchmark-fixtures.js";

// ---------------------------------------------------------------------------
// W10-B adversarial probes over the LAB-017 robust marketing benchmark (the
// W9-A surface, outside the W9-B audited tree): composite-key injectivity,
// freeze/immutability + digest stability under caller-aliased inputs, numeric
// integrity (the D5 class — NaN/±Infinity never reach the interval math),
// no-op baseline suppression attempts, the fairness grid identity, and the
// LAB-018 calibration-pending seam integrity.
// ---------------------------------------------------------------------------

type RunResult = Awaited<ReturnType<MarketingBenchmarkPort['runBenchmark']>>;

const asRecord = (result: RunResult): RobustBenchmarkRecord => {
  if ('error' in result) {
    assert.fail(`unexpected benchmark error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: RunResult): { readonly error: string; readonly message: string } => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

const portOver = (
  ensemble: Pick<EnsemblePort, 'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'>,
): MarketingBenchmarkPort => createInMemoryMarketingBenchmark({ ensemble, now: FIXED_NOW });

/** The W3-A hostile-id-factory shapes: delimiters every old lab key once used. */
const HOSTILE_TENANT_IDS: readonly string[] = [
  'tenant-a\u0000evil',
  'tenant-a::evil',
  'tenant-a:evil',
  'tenant-a|evil',
  'tenant-a"',
  "__proto__",
  'tenant-a extra',
];

test('W10-B D1 probe: hostile delimiter-laden tenant ids cannot alias another tenant\'s benchmark chains', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  // The honest tenant's chain.
  const honest = asRecord(
    await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-shared') })),
  );
  assert.equal(honest.tenantId, 'tenant-a' as never);
  assert.equal(honest.version, 1);

  for (const hostileId of HOSTILE_TENANT_IDS) {
    const hostileScope: TenantScope = { tenantId: tenantOf(hostileId) };
    // Reads through the hostile scope see NOTHING of the honest chain.
    assert.equal(await port.getBenchmarkRecord(hostileScope, benchmarkId('bench-shared'), 1), null, `no read aliasing for ${JSON.stringify(hostileId)}`);
    assert.equal(await port.resolveLatestBenchmarkRecord(hostileScope, benchmarkId('bench-shared')), null);
    assert.deepEqual(await port.listBenchmarkRecordVersions(hostileScope, benchmarkId('bench-shared')), []);
    assert.equal(await port.verifyBenchmarkRecordIntegrity(hostileScope, benchmarkId('bench-shared'), 1), null);
    // The hostile tenant cannot even RUN over the honest tenant's ensembles
    // (unknown-ensemble fail-closed) — so no hostile write can append into
    // the honest chain either.
    const hostileRun = asError(
      await port.runBenchmark(benchmarkInput({ scope: hostileScope, benchmarkId: benchmarkId('bench-shared') })),
    );
    assert.equal(hostileRun.error, 'unknown-ensemble', `hostile run must fail closed: ${JSON.stringify(hostileId)}`);
  }
  // The honest chain is untouched (exactly one version, bit-for-bit).
  const versions = await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId('bench-shared'));
  assert.equal(versions.length, 1);
  assert.deepEqual(versions[0], honest);
});

test('W10-B D1 probe: hostile delimiter-laden benchmark ids cannot alias another benchmark chain', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const honest = asRecord(
    await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-plain') })),
  );
  // A hostile benchmark id whose text embeds or prefixes the honest id.
  for (const hostileId of ['bench-plain\u0000evil', 'bench-plain:evil', 'bench-plainextra', '']) {
    assert.equal(await port.getBenchmarkRecord(benchmarkScope(), benchmarkId(hostileId), 1), null, `no id aliasing for ${JSON.stringify(hostileId)}`);
    assert.deepEqual(await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId(hostileId)), []);
    if (hostileId.length > 0) {
      const hostile = asRecord(
        await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId(hostileId) })),
      );
      assert.equal(hostile.version, 1, 'the hostile id gets its OWN chain at version 1');
      assert.notEqual(hostile.resultDigest, honest.resultDigest);
    }
  }
  const versions = await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId('bench-plain'));
  assert.equal(versions.length, 1, 'the honest chain stays exactly one version');
});

test('W10-B D4 probe: a caller-aliased TenantScope cannot move a stored record\'s tenant identity', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const scope: TenantScope = { tenantId: tenantOf('tenant-a') };
  const record = asRecord(
    await port.runBenchmark(benchmarkInput({ scope, benchmarkId: benchmarkId('bench-scope') })),
  );
  // The caller forges its scope object AFTER the run (post-hoc identity move).
  (scope as { tenantId: string }).tenantId = 'tenant-forged';
  // The stored record's tenant identity is the primitive captured at write time.
  assert.equal(record.tenantId, 'tenant-a' as never);
  const reread = await port.getBenchmarkRecord(
    { tenantId: tenantOf('tenant-a') },
    benchmarkId('bench-scope'),
    1,
  );
  assert.ok(reread);
  assert.equal(reread.tenantId, 'tenant-a' as never);
  const report = await port.verifyBenchmarkRecordIntegrity(
    { tenantId: tenantOf('tenant-a') },
    benchmarkId('bench-scope'),
    1,
  );
  assert.ok(report);
  assert.equal(report.status, 'intact');
  // The forged scope sees nothing (it never owned the chain).
  assert.equal(
    await port.resolveLatestBenchmarkRecord({ tenantId: tenantOf('tenant-forged') }, benchmarkId('bench-scope')),
    null,
  );
});

test('W10-B D5 probe: NaN/±Infinity/negative numeric shapes fail closed TYPED (never reach the interval math)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);

  // Seeds: non-finite or wrong count (the fairness-pin input).
  for (const seeds of [[11, 22, Number.NaN], [11, 22, Number.POSITIVE_INFINITY], [11, 22, Number.NEGATIVE_INFINITY]] as never[][]) {
    const failure = asError(await port.runBenchmark(benchmarkInput({ seeds })));
    assert.equal(failure.error, 'seed-budget-mismatch', `non-finite seeds must fail: ${JSON.stringify(seeds)}`);
  }
  // Policy numbers: NaN/Infinity/fractional seed budget, version, world refs.
  const hostilePolicies: readonly Partial<RobustnessPolicy>[] = [
    { seedBudget: Number.NaN },
    { seedBudget: Number.POSITIVE_INFINITY },
    { seedBudget: 2.5 },
    { seedBudget: -3 },
    { version: Number.NaN },
    { worldModelSet: [{ ensembleId: 'ensemble-reach' as never, ensembleVersion: Number.NaN, label: 'nan' }] },
  ];
  for (const overrides of hostilePolicies) {
    const failure = asError(await port.runBenchmark(benchmarkInput({ policy: robustnessPolicy(overrides) })));
    assert.equal(failure.error, 'invalid-input', `hostile policy numbers must fail closed: ${JSON.stringify(overrides)}`);
  }
  // Candidate numbers: NaN/Infinity knobs and horizons.
  const hostileCandidates = [
    benchmarkCandidateAlpha({ key: 'nan-cadence', action: { ...benchmarkCandidateAlpha().action, cadencePerWeek: Number.NaN } }),
    benchmarkCandidateAlpha({ key: 'inf-cadence', action: { ...benchmarkCandidateAlpha().action, cadencePerWeek: Number.POSITIVE_INFINITY } }),
    benchmarkCandidateAlpha({ key: 'neg-cadence', action: { ...benchmarkCandidateAlpha().action, cadencePerWeek: -1 } }),
    benchmarkCandidateAlpha({ key: 'nan-novelty', action: { ...benchmarkCandidateAlpha().action, novelty: Number.NaN } }),
    benchmarkCandidateAlpha({ key: 'nan-horizon', horizonSteps: Number.NaN }),
    benchmarkCandidateAlpha({ key: 'inf-horizon', horizonSteps: Number.POSITIVE_INFINITY }),
    benchmarkCandidateAlpha({ key: 'zero-horizon', horizonSteps: 0 }),
    benchmarkCandidateAlpha({ key: 'nan-pin', source: { origin: 'hand-designed', producerPins: [{ surface: 's', version: Number.NaN }], note: 'nan pin' } }),
  ];
  for (const candidate of hostileCandidates) {
    const failure = asError(await port.runBenchmark(benchmarkInput({ candidates: [candidate] })));
    assert.equal(failure.error, 'invalid-candidate', `hostile candidate numbers must fail closed: ${candidate.key}`);
  }
  // Scenario numbers: NaN/Infinity/negative information lag.
  for (const informationLag of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const failure = asError(
      await port.runBenchmark(benchmarkInput({ scenario: { ...benchmarkScenario(), informationLag } })),
    );
    assert.equal(failure.error, 'invalid-input', `hostile informationLag must fail closed: ${String(informationLag)}`);
  }
  // NOTHING was recorded by any hostile run.
  assert.deepEqual(await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId()), []);
});

test('W10-B D5 probe: successful records carry finite bench-additive-v1 interval math (no NaN poisoning)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const record = asRecord(await portOver(ensemble).runBenchmark(benchmarkInput()));
  for (const entry of record.ranked) {
    const { interval, breakdown, expectedReward } = entry.evaluation;
    assert.ok(Number.isFinite(expectedReward), `expected reward finite for ${entry.key}`);
    assert.ok(Number.isFinite(interval.lower) && Number.isFinite(interval.upper), `interval finite for ${entry.key}`);
    assert.ok(Number.isFinite(breakdown.totalHalfWidth), `total half-width finite for ${entry.key}`);
    assert.ok(
      Number.isFinite(breakdown.memberDisagreementHalfWidth) &&
        Number.isFinite(breakdown.seedRobustnessHalfWidth) &&
        Number.isFinite(breakdown.worldModelSpreadHalfWidth),
      `every additive term finite for ${entry.key}`,
    );
    for (const perSeed of entry.evaluation.seedRobustness.perSeedExpected) {
      assert.ok(Number.isFinite(perSeed), `per-seed mean finite for ${entry.key}`);
    }
    for (const world of entry.evaluation.worldRobustness.perWorld) {
      assert.ok(Number.isFinite(world.expectedReward), `per-world mean finite for ${entry.key}`);
    }
  }
});

test('W10-B D3 probe: digest-stable records under caller-aliased inputs mutated after submission', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const candidates = [benchmarkCandidateAlpha(), benchmarkCandidateBeta()];
  const policy = robustnessPolicy();
  const seeds = [11, 22, 33];
  const rewardSpec = reachRewardSpec();
  const worldModelSet = policy.worldModelSet;
  const record = asRecord(
    await port.runBenchmark(
      benchmarkInput({ benchmarkId: benchmarkId('bench-alias'), candidates, policy, seeds, rewardSpec }),
    ),
  );
  const digestBefore = record.resultDigest;
  const snapshot = JSON.stringify(record);

  // The caller mutates EVERY retained declaration after submission.
  (candidates[0] as unknown as Record<string, unknown>).key = 'mutated';
  (candidates[0]!.action as unknown as Record<string, unknown>).cadencePerWeek = 99;
  (policy as unknown as Record<string, unknown>).note = 'mutated';
  (policy as unknown as Record<string, unknown>).seedBudget = 999;
  (seeds as unknown as number[]).push(44);
  (rewardSpec as unknown as Record<string, unknown>).version = 99;
  ((worldModelSet[0] as unknown as Record<string, unknown>)).label = 'mutated-label';

  // The stored record is bit-for-bit + digest stable.
  const reread = await port.getBenchmarkRecord(benchmarkScope(), benchmarkId('bench-alias'), 1);
  assert.ok(reread);
  assert.equal(JSON.stringify(reread), snapshot);
  const report = await port.verifyBenchmarkRecordIntegrity(benchmarkScope(), benchmarkId('bench-alias'), 1);
  assert.ok(report);
  assert.equal(report.status, 'intact');
  assert.equal(report.recomputedDigest, digestBefore);
  // And the caller's objects were never frozen in place (ownership).
  assert.equal(Object.isFrozen(candidates[0]), false);
  assert.equal(Object.isFrozen(policy), false);
  assert.equal(Object.isFrozen(seeds), false);
});

test('W10-B no-op-baseline probe: hostile suppression attempts fail closed; the baseline stays structurally present', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  // An EMPTY declared set still runs the baseline alone.
  const empty = asRecord(await port.runBenchmark(benchmarkInput({ candidates: [], benchmarkId: benchmarkId('bench-empty') })));
  assert.equal(empty.ranked.length, 1);
  assert.equal(empty.comparison.noopBaseline.key, 'no-op-baseline');
  assert.equal(empty.comparison.declared.length, 0);
  // The baseline declaration is immutable and the record integrity holds.
  assert.throws(() => {
    (empty.comparison.noopBaseline as unknown as Record<string, unknown>).key = 'suppressed';
  }, TypeError);
  const report = await port.verifyBenchmarkRecordIntegrity(benchmarkScope(), benchmarkId('bench-empty'), 1);
  assert.ok(report);
  assert.equal(report.status, 'intact');
  // A hostile re-run with a caller claiming the baseline identity fails closed.
  const claim = asError(
    await port.runBenchmark(
      benchmarkInput({
        benchmarkId: benchmarkId('bench-empty'),
        candidates: [
          benchmarkCandidateAlpha({
            key: 'no-op-baseline',
            source: { origin: 'hand-designed', producerPins: [], note: 'hostile claim on the reserved key' },
          }),
        ],
      }),
    ),
  );
  assert.equal(claim.error, 'caller-claimed-noop-baseline');
  // The failed claim appended NOTHING (the chain stays one version).
  assert.equal((await port.listBenchmarkRecordVersions(benchmarkScope(), benchmarkId('bench-empty'))).length, 1);
});

test('W10-B fairness re-pin: hostile candidate-set variations still see the IDENTICAL evaluation grid', async () => {
  const stack = await benchmarkEnsembleStack();
  const calls: string[] = [];
  const spyEnsemble: Pick<EnsemblePort, 'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'> = {
    evaluateEnsemble: async (input: EnsembleEvaluationInput) => {
      calls.push([input.ensembleId, input.ensembleVersion, input.seed].join('|'));
      return stack.ensemble.evaluateEnsemble(input);
    },
    getEnsemble: (scope: TenantScope, id: WorldModelEnsembleId, version: number) =>
      stack.ensemble.getEnsemble(scope, id, version),
    resolveLatestEnsemble: (scope: TenantScope, id: WorldModelEnsembleId) =>
      stack.ensemble.resolveLatestEnsemble(scope, id),
  };
  const port = portOver(spyEnsemble);
  // Three hostile-varied candidate sets (empty, single, three candidates).
  const variedSets: readonly (readonly ReturnType<typeof benchmarkCandidateAlpha>[])[] = [
    [],
    [benchmarkCandidateAlpha()],
    [benchmarkCandidateAlpha({ key: 'one', action: { ...benchmarkCandidateAlpha().action, strategyRef: 'strategy-one' as never } }),
     benchmarkCandidateBeta(),
     benchmarkCandidateBeta({ key: 'three', action: { ...benchmarkCandidateBeta().action, strategyRef: 'strategy-three' as never } })],
  ];
  const grids: string[][] = [];
  for (const [index, candidates] of variedSets.entries()) {
    calls.length = 0;
    const record = asRecord(
      await port.runBenchmark(benchmarkInput({ candidates, benchmarkId: benchmarkId(`bench-grid-${index}`) })),
    );
    const grid = [...new Set(calls)].sort();
    grids.push(grid);
    // The declared-candidate count + baseline decide the CALL count, but the
    // (world, seed) CONDITIONS are the identical six-cell grid every time.
    assert.equal(grid.length, 2 * 3, 'the (world, seed) grid is exactly two ensembles × three seeds');
    for (const entry of record.ranked) {
      assert.deepEqual(entry.provenance.seeds, [11, 22, 33]);
    }
  }
  assert.deepEqual(grids[1], grids[0], 'the single-candidate grid equals the baseline-only grid');
  assert.deepEqual(grids[2], grids[0], 'the three-candidate grid equals the baseline-only grid');
});

test('W10-B calibration-seam probe: the LAB-018-bound pending-reality declaration is present, immutable and digest-sealed', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);
  const record = asRecord(await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-cal') })));
  // Record-level + per-candidate declarations present with the frozen literal.
  assert.equal(record.calibration.status, 'pending-reality');
  assert.equal(record.calibration.predictionSurface, 'per-candidate expected reward + interval');
  for (const entry of record.ranked) {
    assert.deepEqual(entry.evaluation.calibration, record.calibration);
  }
  // The seam fields are immutable (frozen) — a hostile edit throws.
  assert.throws(() => {
    (record.calibration as unknown as Record<string, unknown>).status = 'calibrated' as never;
  }, TypeError);
  assert.throws(() => {
    const entry = record.ranked[0] as (typeof record.ranked)[number];
    (entry.evaluation.calibration as unknown as Record<string, unknown>).status = 'calibrated' as never;
  }, TypeError);
  // The digest seal still verifies after the (throwing) attempts.
  const report = await port.verifyBenchmarkRecordIntegrity(benchmarkScope(), benchmarkId('bench-cal'), 1);
  assert.ok(report);
  assert.equal(report.status, 'intact');
});
