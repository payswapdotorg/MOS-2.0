import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EnsemblePort } from '../contracts/ensemble.js';
import type {
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from '../contracts/robust-benchmark-port.js';
import { createInMemoryMarketingBenchmark } from './in-memory-marketing-benchmark.js';
import {
  ALT_ENSEMBLE_ID,
  benchmarkEnsembleStack,
  benchmarkId,
  benchmarkInput,
  benchmarkScope,
  foreignScope,
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

const asError = (result: RunResult): { readonly error: string; readonly message: string } => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

const portOver = (ensemble: EnsemblePort): MarketingBenchmarkPort =>
  createInMemoryMarketingBenchmark({ ensemble, now: FIXED_NOW });

// ---------------------------------------------------------------------------
// Tenant scoping (§31)
// ---------------------------------------------------------------------------

test('tenant scoping: records are invisible across tenants and chains are independent', async () => {
  const stack = await benchmarkEnsembleStack();
  const { ensemble, worldModels } = stack;
  const port = portOver(ensemble);

  // the fixture ensembles live in tenant-a; tenant-b cannot resolve them at all.
  const foreignRun = asError(
    await port.runBenchmark(benchmarkInput({ scope: foreignScope() })),
  );
  assert.equal(foreignRun.error, 'unknown-ensemble');

  // a tenant-a chain is invisible through tenant-b's scope.
  const tenantARun = asRecord(
    await port.runBenchmark(benchmarkInput({ benchmarkId: benchmarkId('bench-shared') })),
  );
  assert.equal(tenantARun.tenantId, 'tenant-a' as never);
  assert.equal(
    await port.getBenchmarkRecord(foreignScope(), benchmarkId('bench-shared'), 1),
    null,
  );
  assert.equal(await port.resolveLatestBenchmarkRecord(foreignScope(), benchmarkId('bench-shared')), null);
  assert.deepEqual(await port.listBenchmarkRecordVersions(foreignScope(), benchmarkId('bench-shared')), []);
  assert.equal(
    await port.verifyBenchmarkRecordIntegrity(foreignScope(), benchmarkId('bench-shared'), 1),
    null,
  );

  // tenant-b gets its OWN world models + ensemble through the same stores
  // (tenant-scoped registration) and runs the SAME benchmark id — an
  // independent chain at version 1.
  for (const draft of [
    {
      id: 'world-tenant-b-a' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 15_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'tenant-b fixture world A',
    },
    {
      id: 'world-tenant-b-b' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 25_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'tenant-b fixture world B',
    },
  ]) {
    const registered = await worldModels.registerWorldModel({
      scope: foreignScope(),
      worldModel: draft,
    });
    if ('error' in registered) {
      assert.fail(`tenant-b world registration failed: ${registered.error}`);
    }
  }
  const tenantBEnsembleId = 'ensemble-reach-tenant-b' as never;
  const tenantBEnsemble = await ensemble.registerEnsemble({
    scope: foreignScope(),
    ensemble: {
      id: tenantBEnsembleId,
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [
        {
          id: 'member-tenant-b-a',
          worldModelId: 'world-tenant-b-a' as never,
          worldModelVersion: 1,
          coverage: {
            cadencePerWeek: { min: 0, max: 14 },
            novelty: { min: 0, max: 1 },
            engagementEffort: { min: 0, max: 1 },
          },
          notes: null,
        },
        {
          id: 'member-tenant-b-b',
          worldModelId: 'world-tenant-b-b' as never,
          worldModelVersion: 1,
          coverage: {
            cadencePerWeek: { min: 0, max: 14 },
            novelty: { min: 0, max: 1 },
            engagementEffort: { min: 0, max: 1 },
          },
          notes: null,
        },
      ],
      weightingPolicy: {
        id: 'policy-tenant-b',
        version: 1,
        kind: 'uniform',
        note: 'tenant-b fixture uniform weighting',
      },
      notes: 'tenant-b fixture ensemble',
    },
  });
  if ('error' in tenantBEnsemble) {
    assert.fail(`tenant-b ensemble registration failed: ${tenantBEnsemble.error}`);
  }

  const otherTenantRun = asRecord(
    await port.runBenchmark(
      benchmarkInput({
        benchmarkId: benchmarkId('bench-shared'),
        scope: foreignScope(),
        policy: robustnessPolicy({
          id: 'policy-tenant-b',
          worldModelSet: [{ ensembleId: tenantBEnsembleId, ensembleVersion: 1, label: 'primary' }],
          sweepDimensions: ['seed'],
          note: 'tenant-b fixture policy over its own ensemble',
        }),
      }),
    ),
  );
  assert.equal(otherTenantRun.tenantId, 'tenant-b' as never);
  assert.equal(otherTenantRun.version, 1);
  // the same id resolves to the OWNING tenant's chain only, on both sides.
  const tenantBView = await port.resolveLatestBenchmarkRecord(
    foreignScope(),
    benchmarkId('bench-shared'),
  );
  assert.ok(tenantBView);
  assert.equal(tenantBView.tenantId, 'tenant-b' as never);
  assert.equal(tenantBView.version, 1);
  const tenantAView = await port.resolveLatestBenchmarkRecord(
    benchmarkScope(),
    benchmarkId('bench-shared'),
  );
  assert.ok(tenantAView);
  assert.equal(tenantAView.tenantId, 'tenant-a' as never);
  assert.equal(tenantAView.version, 1);
  assert.notDeepEqual(tenantAView.ranked, tenantBView.ranked);
});

// ---------------------------------------------------------------------------
// Provenance completeness (which versions produced every number)
// ---------------------------------------------------------------------------

test('provenance completeness: simulator/corpus/reward/policy/seeds/world-model pins on every record and candidate', async () => {
  const { ensemble, primary, alternative } = await benchmarkEnsembleStack();
  const record = asRecord(await portOver(ensemble).runBenchmark(benchmarkInput()));

  const provenance = record.provenance;
  assert.equal(provenance.simulatorVersion, 1);
  assert.equal(provenance.corpusVersion, 2);
  assert.equal(provenance.rewardSpecVersion, 1);
  assert.equal(provenance.policyId, 'policy-robust-reach');
  assert.equal(provenance.policyVersion, 1);
  assert.deepEqual(provenance.seeds, [11, 22, 33]);
  assert.deepEqual(provenance.sweepDimensions, ['seed', 'world-model']);
  assert.equal(provenance.worldModels.length, 2);

  const primaryPin = provenance.worldModels.find(
    (pin) => pin.ensembleId === primary.id,
  );
  const altPin = provenance.worldModels.find((pin) => pin.ensembleId === ALT_ENSEMBLE_ID);
  assert.ok(primaryPin && altPin);
  assert.equal(primaryPin.ensembleVersion, 1);
  assert.equal(primaryPin.weightingPolicyId, 'policy-uniform-reach');
  assert.equal(primaryPin.weightingPolicyVersion, 1);
  assert.equal(primaryPin.weightingKind, 'uniform');
  assert.deepEqual(primaryPin.memberWorldModelVersions, [1, 1]);
  assert.equal(altPin.ensembleVersion, (alternative as { version: number }).version);
  assert.deepEqual(altPin.memberWorldModelVersions, [1, 1]);

  // every ranked candidate carries the same pins + its own horizon + source.
  for (const entry of record.ranked) {
    assert.equal(entry.provenance.simulatorVersion, 1);
    assert.equal(entry.provenance.rewardSpecVersion, 1);
    assert.deepEqual(entry.provenance.worldModels, provenance.worldModels);
    assert.equal(entry.provenance.horizonSteps, entry.candidate.horizonSteps);
    assert.equal(entry.provenance.origin, entry.origin);
  }
});
