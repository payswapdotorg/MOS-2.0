/**
 * Composition tests for the PRODUCTION composition root
 * (composition/compose-production-mos-web.ts) — the node-side battery:
 *
 *  - the composition implements every port of `MosWebComposition`;
 *  - a fresh composition starts with ZERO missions (no demo seeds), EMPTY
 *    tenant-scoped lab listings, and the honest calibration-pending
 *    context state (`null`, never a fabricated context);
 *  - the availability verdicts are HONEST: Home/Missions/Lab/Console/Social
 *    available,
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
import type { MosWebComposition } from '@mos/web';
import type { TenantScope } from '@mos/contracts';
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
  assert.equal(typeof composition.social.loadSocialWorkspace, 'function');
  assert.equal(typeof composition.notifications.getNotificationsViewData, 'function');
});

test('a fresh composition starts with ZERO missions — no demo seeds', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  assert.equal(composition.missionRepository.listMissions(scope).length, 0);
  const summaries = await composition.missionCatalog.listMissionSummaries(scope);
  assert.deepEqual(summaries, []);
  const detail = await composition.missionCatalog.loadMissionDetail('mission-x' as never, scope);
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

test('the availability verdicts are honest for this release (the wave-24 target-design rail)', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const shell = await composition.appShell.loadAppShell();
  assert.ok(!('error' in shell));
  const sections = shell.sections.map((section) => section.id);
  assert.deepEqual(sections, ['home', 'missions', 'lab', 'console', 'social', 'studio', 'measurement']);
  const byId = new Map(shell.sections.map((section) => [section.id, section]));
  for (const id of ['home', 'missions', 'lab', 'console', 'social'] as const) {
    assert.deepEqual(byId.get(id)?.availability, { kind: 'available' }, `${id} is available`);
  }
  assert.equal(byId.get('lab')?.label, 'Research Lab', 'the target design\'s rail label');
  assert.equal(byId.get('social')?.label, 'Social Media', 'the UXR social wave\'s rail label');
  assert.equal(byId.get('social')?.route, '/social');
  for (const id of ['studio', 'measurement'] as const) {
    const availability = byId.get(id)?.availability;
    assert.equal(availability?.kind, 'not-yet-available', `${id} is honestly not-yet-available`);
    if (availability?.kind === 'not-yet-available') {
      assert.match(availability.dependsOn, /production MOS service transport/);
    }
  }
});

test('the Social workspace binds the five REAL frozen provider profiles with verdicts verbatim', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const workspace = await composition.social.loadSocialWorkspace();
  assert.ok(!('error' in workspace), 'the workspace read model loads');
  const platforms = workspace.platforms;
  assert.deepEqual(
    platforms.map((platform) => platform.slug),
    ['youtube', 'instagram', 'facebook-pages', 'tiktok', 'x'],
  );
  const youtube = platforms[0];
  assert.equal(youtube.providerId, 'provider:youtube');
  assert.equal(youtube.displayName, 'YouTube');
  assert.equal(youtube.selected, true, 'YouTube is the composition\'s default selection');
  assert.deepEqual(
    youtube.capabilityVerdicts,
    [
      {
        operation: 'publish',
        support: 'supported',
        note: 'publicly-documented video upload API surface (video uploads)',
      },
      {
        operation: 'schedule',
        support: 'supported',
        note: 'publicly-documented scheduled-publish parameter on video uploads',
      },
      {
        operation: 'read-observations',
        support: 'supported',
        note: 'publicly-documented analytics/reporting API surface (video metrics)',
      },
      {
        operation: 'delete',
        support: 'supported',
        note: 'publicly-documented video deletion API surface',
      },
      {
        operation: 'list-restrictions',
        support: 'unknown',
        note: 'no publicly-known per-channel restriction-listing surface — observation-pending',
      },
    ],
    'the YouTube verdicts render the frozen profile VERBATIM (unknown stays unknown)',
  );
  assert.deepEqual(youtube.authFlows, ['authorization-code', 'device']);
  assert.equal(youtube.authModelKind, 'oauth2');
  // every platform's list-restrictions verdict is the profile's own unknown
  for (const platform of platforms) {
    const restrictions = platform.capabilityVerdicts.find(
      (verdict) => verdict.operation === 'list-restrictions',
    );
    assert.equal(restrictions?.support, 'unknown', `${platform.slug} list-restrictions stays unknown`);
    assert.equal(
      platform.connectVerdict.kind,
      'unavailable',
      `${platform.slug} honestly reports no live connect action`,
    );
    if (platform.connectVerdict.kind === 'unavailable') {
      assert.match(platform.connectVerdict.reason, /no credentials exist anywhere/);
    }
  }
  // a fresh composition reports every guided step not-started, honestly
  for (const platform of platforms) {
    for (const step of platform.guidedSetup.guidedSteps) {
      assert.equal(step.state, 'not-started', `${platform.slug} step ${step.position} is not-started`);
    }
    assert.equal(platform.guidedSetup.missionContext, null, 'no mission context on a fresh composition');
    assert.equal(
      platform.guidedSetup.simulationSandbox.boundary,
      'No live publish • no invented analytics • no account changes',
    );
  }
});

test('a mission existing in the tenant scope advances guided step 1 with a real mission context', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  const created = composition.missionRepository.createMission({
    scope,
    id: 'mission_social_1' as never,
    objective: {
      statement: 'Qualified leads for the spring line.',
      targetMetrics: [],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: 'qualified-reach',
          weight: 1,
          direction: 'maximize',
          definition: 'Reach among the declared audience.',
        },
      ],
    },
  });
  assert.ok(!('error' in created));
  const workspace = await composition.social.loadSocialWorkspace();
  assert.ok(!('error' in workspace));
  const youtube = workspace.platforms[0];
  const steps = youtube.guidedSetup.guidedSteps;
  assert.equal(steps[0]?.state, 'complete', 'step 1 completes on the REAL mission record');
  assert.equal(steps[1]?.state, 'not-started', 'step 2 stays not-started (connect unavailable)');
  assert.equal(steps[2]?.state, 'in-progress', 'step 3 is in-progress (the declared objective exists)');
  assert.ok(youtube.guidedSetup.missionContext !== null);
  assert.equal(
    youtube.guidedSetup.missionContext?.route,
    '/console?mission=mission_social_1',
  );
});

test('the mission badge and recent-missions rail read the REAL missions repository honestly', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const fresh = await composition.appShell.loadAppShell();
  assert.ok(!('error' in fresh));
  assert.deepEqual(fresh.missionStatus, { active: false }, 'a fresh composition holds no active mission');
  assert.deepEqual(fresh.recentMissions, [], 'a fresh composition has no recent missions');

  const seeded = composition.missionRepository.createMission({
    scope: { tenantId: 'tenant-local' as never },
    id: 'mission-wave-24' as never,
    objective: {
      statement: 'Launch the target-design conversion.',
      targetMetrics: [{ metric: 'qualified-reach', target: '10000', unit: 'count', horizon: null }],
      constraints: [],
    } as never,
    rewardSpec: {
      version: 1,
      terms: [
        { metric: 'qualified-reach', weight: 1, direction: 'maximize', definition: 'Reach.' },
      ],
    } as never,
  });
  assert.ok(!('error' in seeded));
  const activated = composition.missionRepository.activateMission(
    { tenantId: 'tenant-local' as never },
    'mission-wave-24' as never,
  );
  assert.ok(!('error' in activated));
  const after = await composition.appShell.loadAppShell();
  assert.ok(!('error' in after));
  assert.deepEqual(after.missionStatus, { active: true }, 'one active mission flips the badge');
  assert.equal(after.recentMissions.length, 1);
  assert.equal(after.recentMissions[0]?.title, 'Launch the target-design conversion.');
  assert.equal(after.recentMissions[0]?.route, '/console?mission=mission-wave-24');
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
  const detail = await composition.studioDirectory.loadStudioSessionDetail('s-x' as never, scope);
  assert.ok('error' in detail && detail.error === 'studio-directory-unavailable');
  const packages = await composition.studioPackages.listStudioPackages(scope);
  assert.ok('error' in packages && packages.error === 'studio-package-library-unavailable');
  const chain = await composition.studioPackages.loadStudioPackageChain('p-x' as never, scope);
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
      { metric: 'qualified-reach' as never, direction: 'maximize' as never, weight: 1, definition: 'Reach among local accounts.' },
    ],
  } as Parameters<typeof composition.missionCatalog.declareCreateMissionIntent>[0];
  const receiptResult = await composition.missionCatalog.declareCreateMissionIntent(declaration);
  assert.ok(!('error' in receiptResult), 'expected a receipt');
  if ('error' in receiptResult) {
    throw new Error('expected a receipt');
  }
  const receipt = receiptResult;
  assert.equal(receipt.routedTo, 'missions-authority');
  assert.equal(receipt.declaredAt, NOW());

  const loadedResult = await composition.missionCatalog.loadCreateMissionIntentReceipt(
    receipt.intentId,
    scope,
  );
  assert.ok(loadedResult !== null && !('error' in loadedResult), 'the receipt loads back');
  if (loadedResult === null || 'error' in loadedResult) {
    throw new Error('expected the receipt to load back');
  }
  const loaded = loadedResult;
  assert.equal(loaded.intentId, receipt.intentId);

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
  const vocabularyResult = await composition.missionCatalog.loadRewardMetricVocabulary();
  assert.ok(!('error' in vocabularyResult));
  if ('error' in vocabularyResult) {
    assert.fail('expected the vocabulary');
  }
  const vocabulary = vocabularyResult;
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
