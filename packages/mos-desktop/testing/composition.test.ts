/**
 * Composition tests for the PRODUCTION composition root
 * (composition/compose-production-mos-web.ts) — the node-side battery:
 *
 *  - the composition implements ALL EIGHT ports of `MosWebComposition`;
 *  - a fresh composition starts with ZERO missions (no demo seeds), EMPTY
 *    tenant-scoped lab listings, and the honest calibration-pending
 *    context state (`null`, never a fabricated context);
 *  - the availability verdicts are HONEST: Home/Missions/Lab available,
 *    Studio/Connections/Notifications explicitly not-yet-available naming
 *    the production MOS service transport they wait on;
 *  - the create-mission intent declaration flows through the real
 *    repository-backed catalog: a receipt is recorded (routed nominally to
 *    the missions authority), loadable afterwards, tenant-scoped — and it
 *    creates NO mission (executing intents is the authority's job);
 *  - the shell presents the MOS product identity.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MosWebComposition, TenantScope } from '@mos/web';
import { createProductionMosWebComposition } from '../out/compose-production-mos-web.js';
import { entrySource } from './pin-scan.js';

const NOW = () => '2026-10-17T00:00:00.000Z';

function scopeOf(tenantId: string): TenantScope {
  return { tenantId: tenantId as never };
}

test('the production composition implements all eight ports of MosWebComposition', async () => {
  const composition: MosWebComposition = createProductionMosWebComposition({ now: NOW });
  assert.equal(typeof composition.appShell.loadAppShell, 'function');
  assert.equal(typeof composition.missionCatalog.listMissionSummaries, 'function');
  assert.equal(typeof composition.missionCatalog.loadMissionDetail, 'function');
  assert.equal(typeof composition.missionCatalog.loadRewardMetricVocabulary, 'function');
  assert.equal(typeof composition.missionCatalog.declareCreateMissionIntent, 'function');
  assert.equal(typeof composition.missionCatalog.loadCreateMissionIntentReceipt, 'function');
  assert.equal(typeof composition.studioDirectory.listStudioSessions, 'function');
  assert.equal(typeof composition.studioDirectory.loadStudioSessionDetail, 'function');
  assert.equal(typeof composition.studioPackages.listStudioPackages, 'function');
  assert.equal(typeof composition.studioPackages.loadStudioPackageChain, 'function');
  assert.equal(typeof composition.labBenchmark.listBenchmarkSummaries, 'function');
  assert.equal(typeof composition.labBenchmark.loadBenchmarkDigest, 'function');
  assert.equal(typeof composition.labCalibration.listCalibrationChains, 'function');
  assert.equal(typeof composition.labCalibration.loadCalibrationRecords, 'function');
  assert.equal(typeof composition.labCalibration.loadCalibrationContext, 'function');
  assert.equal(typeof composition.connections.getConnectionsViewData, 'function');
  assert.equal(typeof composition.notifications.getNotificationsViewData, 'function');
});

test('a fresh composition starts with ZERO missions — no demo seeds', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  assert.equal(composition.missionRepository.listMissions(scope).length, 0);
  const summaries = await composition.missionCatalog.listMissionSummaries(scope);
  assert.deepEqual(summaries, []);
  const detail = await composition.missionCatalog.loadMissionDetail('mission-x', scope);
  assert.ok('error' in detail && detail.error === 'mission-not-found');
});

test('a fresh composition starts with EMPTY tenant-scoped lab listings and no derived context', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  const benchmarks = await composition.labBenchmark.listBenchmarkSummaries(scope);
  assert.deepEqual(benchmarks, []);
  const chains = await composition.labCalibration.listCalibrationChains(scope);
  assert.deepEqual(chains, []);
  // Absence of a derived context is the FIRST-CLASS honest pending state.
  const context = await composition.labCalibration.loadCalibrationContext('bench-x', scope);
  assert.equal(context, null);
  const digest = await composition.labBenchmark.loadBenchmarkDigest('bench-x', null, scope);
  assert.ok('error' in digest && digest.error === 'lab-benchmark-not-found');
  const records = await composition.labCalibration.loadCalibrationRecords('cal-x', scope);
  assert.ok('error' in records && records.error === 'lab-calibration-not-found');
});

test('the availability verdicts are honest for this release', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const shell = await composition.appShell.loadAppShell();
  assert.ok(!('error' in shell));
  const sections = shell.sections.map((section) => section.id);
  assert.deepEqual(sections, [
    'home',
    'missions',
    'studio',
    'lab',
    'connections',
    'notifications',
  ]);
  const byId = new Map(shell.sections.map((section) => [section.id, section]));
  for (const id of ['home', 'missions', 'lab'] as const) {
    assert.deepEqual(byId.get(id)?.availability, { kind: 'available' }, `${id} is available`);
  }
  for (const id of ['studio', 'connections', 'notifications'] as const) {
    const availability = byId.get(id)?.availability;
    assert.equal(availability?.kind, 'not-yet-available', `${id} is honestly not-yet-available`);
    if (availability?.kind === 'not-yet-available') {
      assert.match(availability.dependsOn, /production MOS service transport/);
    }
  }
});

test('the composition resolves a real tenant context from the real identity repository', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const shell = await composition.appShell.loadAppShell();
  assert.ok(!('error' in shell));
  assert.ok(shell.tenant !== null, 'the desktop composition resolves the device-local tenant');
  assert.equal(shell.tenant?.tenantId, 'tenant-local');
  assert.equal(shell.tenant?.tenantDisplayName, 'MOS Desktop (local context)');
  assert.equal(shell.tenant?.workspaceDisplayName, null, 'no workspace — an honest empty state');
});

test('studio, connections and notifications answer through their own unavailable vocabularies', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);

  const sessions = await composition.studioDirectory.listStudioSessions(scope);
  assert.ok('error' in sessions && sessions.error === 'studio-directory-unavailable');
  const detail = await composition.studioDirectory.loadStudioSessionDetail('s-x', scope);
  assert.ok('error' in detail && detail.error === 'studio-directory-unavailable');
  const packages = await composition.studioPackages.listStudioPackages(scope);
  assert.ok('error' in packages && packages.error === 'studio-package-library-unavailable');
  const chain = await composition.studioPackages.loadStudioPackageChain('p-x', scope);
  assert.ok('error' in chain && chain.error === 'studio-package-library-unavailable');

  const connections = await composition.connections.getConnectionsViewData();
  assert.equal(connections.directory.authority, 'provider-integrations');
  assert.deepEqual(connections.directory.providers, []);
  assert.equal(connections.directory.availability.kind, 'unavailable');
  assert.equal(connections.bindings.authority, 'social-distribution');
  assert.deepEqual(connections.bindings.bindings, []);
  assert.equal(connections.bindings.availability.kind, 'unavailable');

  const notifications = await composition.notifications.getNotificationsViewData();
  assert.equal(notifications.availability.kind, 'unavailable');
  assert.deepEqual(notifications.inbox, []);
  assert.deepEqual(notifications.recipientSuppressions, []);
  assert.equal(notifications.selected, null);
  // §31: the tenant context is REAL even where the plane is not bound.
  assert.equal(notifications.tenant.tenantId, 'tenant-local');
});

test('the create-mission intent declaration records a receipt and creates NO mission', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  const declaration = {
    scope,
    objectiveStatement: 'Grow qualified reach in the device-local tenant.',
    rewardTerms: [
      { metric: 'qualified-reach', direction: 'maximize', weight: 1, definition: 'Reach among local accounts.' },
    ],
  };
  const receipt = await composition.missionCatalog.declareCreateMissionIntent(declaration);
  assert.ok(!('error' in receipt));
  assert.equal(receipt.routedTo, 'missions-authority');
  assert.equal(receipt.declaredAt, NOW());

  const loaded = await composition.missionCatalog.loadCreateMissionIntentReceipt(
    receipt.intentId,
    scope,
  );
  assert.ok(loaded !== null && loaded.intentId === receipt.intentId);

  // Cross-tenant receipt reads never leak (§31).
  const otherScope = scopeOf('tenant-other');
  const cross = await composition.missionCatalog.loadCreateMissionIntentReceipt(
    receipt.intentId,
    otherScope,
  );
  assert.equal(cross, null);

  // The declaration is INTENT: the real repository still holds ZERO missions.
  assert.equal(composition.missionRepository.listMissions(scope).length, 0);
  assert.equal(composition.recordedIntents().length, 1);
});

test('the reward-metric vocabulary mirrors the real RewardMetricId union (17 metrics)', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const vocabulary = await composition.missionCatalog.loadRewardMetricVocabulary();
  assert.equal(vocabulary.length, 17);
  assert.equal(vocabulary[0]?.id, 'business-outcome');
  assert.equal(vocabulary[16]?.id, 'operational-risk');
});

test('tenant isolation: another tenant sees no missions and no lab chains', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const otherScope = scopeOf('tenant-other');
  const summaries = await composition.missionCatalog.listMissionSummaries(otherScope);
  assert.deepEqual(summaries, []);
  const benchmarks = await composition.labBenchmark.listBenchmarkSummaries(otherScope);
  assert.deepEqual(benchmarks, []);
  const chains = await composition.labCalibration.listCalibrationChains(otherScope);
  assert.deepEqual(chains, []);
});

test('the shell presents the MOS product identity', () => {
  // The mount entry (the disclosed .jsx) sets the product document title.
  assert.match(entrySource, /MOS — Marketing Operating System/);
  assert.doesNotMatch(entrySource, /@zcode\//);
});
