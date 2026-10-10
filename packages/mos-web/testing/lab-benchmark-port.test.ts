/**
 * Lab benchmark-digest port tests (UX-003, over LAB-017) — the DISCLOSED
 * in-memory double behind the declared view port: tenant-scoped listing,
 * digest loading (latest + exact version), honest failures, the no-op
 * baseline ALWAYS structurally present, the counterfactual pin on every
 * view model, and the calibration-pending declaration relayed verbatim.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import { createInMemoryLabSurface } from './in-memory-lab-surface.js';

const DEMO_SCOPE: TenantScope = { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never };
const FOREIGN_SCOPE: TenantScope = { tenantId: 'tenant-other' as never };

test('the benchmark directory lists the demo tenant chains with scenario context', async () => {
  const surface = createInMemoryLabSurface();
  const summaries = await surface.labBenchmark.listBenchmarkSummaries(DEMO_SCOPE);
  if ('error' in summaries) {
    assert.fail(`unexpected listing failure: ${summaries.error}`);
  }
  assert.deepEqual(
    summaries.map((summary) => summary.benchmarkId),
    ['bench-launch-v2', 'bench-reach-v1'],
    'ascending by benchmark id, §31-scoped to the demo tenant',
  );
  const reach = summaries.find((summary) => summary.benchmarkId === 'bench-reach-v1');
  assert.ok(reach);
  assert.equal(reach.scenarioNiche, 'sourdough-baking');
  assert.equal(reach.scenarioPlatform, 'short-video');
  assert.equal(reach.latestVersion, 2);
  assert.equal(reach.versionCount, 2);
  assert.equal(reach.declaredCandidateCount, 4);
  assert.equal(String(reach.tenantId), 'tenant-demo');
});

test('the benchmark listing carries the counterfactual pin and pending calibration (§20/§24)', async () => {
  const surface = createInMemoryLabSurface();
  const summaries = await surface.labBenchmark.listBenchmarkSummaries(DEMO_SCOPE);
  if ('error' in summaries) {
    assert.fail('unexpected listing failure');
  }
  for (const summary of summaries) {
    assert.equal(summary.counterfactual, true, 'every chain summary is simulation-derived');
    assert.equal(summary.calibration.status, 'pending-reality');
    assert.equal(
      summary.calibration.provenance.includes('never rewritten'),
      true,
      'the authority’s pending-reality statement relays verbatim',
    );
  }
});

test('the no-op baseline is structurally present on every digest (§7)', async () => {
  const surface = createInMemoryLabSurface();
  const expectedDeclared: Readonly<Record<string, number>> = {
    'bench-reach-v1': 4,
    'bench-launch-v2': 2,
  };
  for (const [benchmarkId, declaredCount] of Object.entries(expectedDeclared)) {
    const digest = await surface.labBenchmark.loadBenchmarkDigest(benchmarkId, null, DEMO_SCOPE);
    if ('error' in digest) {
      assert.fail(`unexpected digest failure for ${benchmarkId}: ${digest.error}`);
    }
    assert.equal(digest.noopBaseline.origin, 'no-op-baseline');
    assert.equal(digest.noopBaseline.key, 'noop-baseline');
    assert.ok(
      digest.declaredCandidates.every((candidate) => candidate.origin !== 'no-op-baseline'),
      'the reserved baseline identity never appears among the declared candidates',
    );
    assert.equal(
      digest.declaredCandidates.length,
      declaredCount,
      'the declared set plus the always-present baseline is the full ranked set',
    );
    assert.equal(digest.summary.declaredCandidateCount, declaredCount);
  }
});

test('a digest loads the LATEST version when version is null, the exact version when given', async () => {
  const surface = createInMemoryLabSurface();
  const latest = await surface.labBenchmark.loadBenchmarkDigest('bench-reach-v1', null, DEMO_SCOPE);
  if ('error' in latest) {
    assert.fail('unexpected digest failure');
  }
  assert.equal(latest.version, 2);
  assert.notEqual(latest.citedCalibrationContext, null);
  assert.equal(latest.citedCalibrationContext?.version, 1);

  const v1 = await surface.labBenchmark.loadBenchmarkDigest('bench-reach-v1', 1, DEMO_SCOPE);
  if ('error' in v1) {
    assert.fail('unexpected digest failure');
  }
  assert.equal(v1.version, 1);
  assert.equal(v1.citedCalibrationContext, null, 'the first run of the loop cites nothing');
  assert.equal(
    v1.declaredCandidates.length,
    3,
    'v1 declared three candidates (v2 declares four)',
  );
  // The chain summary describes the CHAIN (latest), the digest header the browsed version.
  assert.equal(v1.summary.latestVersion, 2);
  assert.equal(v1.summary.versionCount, 2);
});

test('a digest relays the declared policy, fairness pin and provenance', async () => {
  const surface = createInMemoryLabSurface();
  const digest = await surface.labBenchmark.loadBenchmarkDigest('bench-launch-v2', null, DEMO_SCOPE);
  if ('error' in digest) {
    assert.fail('unexpected digest failure');
  }
  assert.equal(digest.policy.id, 'policy-launch-conservative');
  assert.equal(digest.policy.aggregation, 'worst-world-mean');
  assert.equal(digest.policy.seedBudget, 2);
  assert.deepEqual([...digest.policy.seeds], [7, 19]);
  assert.equal(digest.policy.worldModelSet.length, 2);
  assert.equal(digest.fairnessStatement.includes('no per-candidate condition cherry-picking'), true);
  assert.equal(digest.provenance.simulatorVersion, 4);
  assert.equal(digest.provenance.worldModels.length, 2);
  assert.equal(digest.counterfactual, true);
  assert.equal(digest.labOnly.includes('NOT deployment evidence'), true, '§24 statement verbatim');
});

test('every candidate evaluation carries the interval, disagreement, OOD and counterfactual pin (§22)', async () => {
  const surface = createInMemoryLabSurface();
  const digest = await surface.labBenchmark.loadBenchmarkDigest('bench-reach-v1', 1, DEMO_SCOPE);
  if ('error' in digest) {
    assert.fail('unexpected digest failure');
  }
  const all = [digest.noopBaseline, ...digest.declaredCandidates];
  for (const candidate of all) {
    assert.equal(candidate.counterfactual, true);
    assert.equal(candidate.interval.lower < candidate.interval.upper, true);
    assert.equal(
      candidate.interval.lower < candidate.expectedReward &&
        candidate.expectedReward < candidate.interval.upper,
      true,
      'the interval brackets the expected value (§22 never a bare point)',
    );
    assert.equal(candidate.breakdown.formula, 'bench-additive-v1');
    assert.equal(candidate.disagreement.perWorld.length, 2);
    assert.ok(candidate.disagreement.worstHalfWidth >= 0);
    assert.equal(candidate.ood.perWorld.length, 2);
    assert.equal(candidate.calibration.status, 'pending-reality');
    assert.ok(candidate.comparisonToBaseline !== null);
  }
  const clip5 = digest.declaredCandidates.find((candidate) => candidate.key === 'clip-5');
  assert.ok(clip5);
  assert.equal(clip5.ood.flagged, true, 'the cadence-5 candidate is OOD-flagged (§22)');
  assert.equal(clip5.ood.status, 'out-of-declared-coverage');
  assert.equal(clip5.comparisonToBaseline?.expectedRewardDelta, 16.4);
});

test('an unknown benchmark id fails closed with the named not-found failure', async () => {
  const surface = createInMemoryLabSurface();
  const failure = await surface.labBenchmark.loadBenchmarkDigest('bench-ghost', null, DEMO_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-benchmark-not-found');
});

test('a known benchmark id in a foreign tenant fails closed the SAME way (§31, no existence leak)', async () => {
  const surface = createInMemoryLabSurface();
  const failure = await surface.labBenchmark.loadBenchmarkDigest('bench-reach-v1', null, FOREIGN_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-benchmark-not-found');
  const foreignListing = await surface.labBenchmark.listBenchmarkSummaries(FOREIGN_SCOPE);
  if ('error' in foreignListing) {
    assert.fail('unexpected listing failure');
  }
  assert.deepEqual(
    foreignListing.map((summary) => summary.benchmarkId),
    ['bench-other-1'],
    'the foreign tenant sees ONLY its own chain',
  );
});

test('a known benchmark id with an unknown version fails closed (append-only chain)', async () => {
  const surface = createInMemoryLabSurface();
  const failure = await surface.labBenchmark.loadBenchmarkDigest('bench-reach-v1', 99, DEMO_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-benchmark-not-found');
});

test('the injected listing failure surfaces as the explicit unavailable failure', async () => {
  const surface = createInMemoryLabSurface({ failListings: true });
  const failure = await surface.labBenchmark.listBenchmarkSummaries(DEMO_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-benchmark-unavailable');
});
