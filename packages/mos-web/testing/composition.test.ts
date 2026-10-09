/**
 * In-memory composition tests (WEB-001 / UX-001 / UX-002) — the DISCLOSED
 * composition seam the shell boots on: REAL `@mos/identity` + `@mos/missions`
 * repositories behind the declared view ports, seeded with the demo
 * tenant/workspace, plus the disclosed Studio surface double (UX-002) over
 * REAL-shaped STUDIO-014 fixture records. NOT the production composition
 * root (TL-owned, over the MOS service transport later — same ports,
 * untouched views).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';

const DEMO_SCOPE: TenantScope = { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never };

test('the composition wires both declared view ports over real repositories', () => {
  const composition = createInMemoryMosWebComposition();
  assert.equal(typeof composition.appShell.loadAppShell, 'function');
  assert.equal(typeof composition.missionCatalog.listMissionSummaries, 'function');
  assert.equal(typeof composition.missionCatalog.loadMissionDetail, 'function');
  assert.equal(typeof composition.missionCatalog.loadRewardMetricVocabulary, 'function');
  assert.equal(typeof composition.missionCatalog.declareCreateMissionIntent, 'function');
  assert.equal(typeof composition.missionCatalog.loadCreateMissionIntentReceipt, 'function');
});

test('the composition wires the Studio view ports (UX-002) and turns the section on', async () => {
  const composition = createInMemoryMosWebComposition();
  assert.equal(typeof composition.studioDirectory.listStudioSessions, 'function');
  assert.equal(typeof composition.studioDirectory.loadStudioSessionDetail, 'function');
  assert.equal(typeof composition.studioPackages.listStudioPackages, 'function');
  assert.equal(typeof composition.studioPackages.loadStudioPackageChain, 'function');

  const shellView = await composition.appShell.loadAppShell();
  if ('error' in shellView) {
    assert.fail(`unexpected app-shell failure: ${shellView.error}`);
  }
  const studio = shellView.sections.find((section) => section.id === 'studio');
  assert.deepEqual(studio?.availability, { kind: 'available' });

  const sessions = await composition.studioDirectory.listStudioSessions(DEMO_SCOPE);
  if ('error' in sessions) {
    assert.fail(`unexpected studio directory failure: ${sessions.error}`);
  }
  assert.equal(sessions.length > 0, true, 'the demo scope sees fixture sessions');
});

test('the demo tenant and workspace are seeded and presented by the shell chrome', async () => {
  const composition = createInMemoryMosWebComposition();
  const shellView = await composition.appShell.loadAppShell();
  if ('error' in shellView) {
    assert.fail(`unexpected app-shell failure: ${shellView.error}`);
  }
  assert.deepEqual(shellView.tenant, {
    tenantId: 'tenant-demo' as never,
    tenantDisplayName: 'Demo Tenant',
    workspaceId: 'ws_demo' as never,
    workspaceDisplayName: 'Demo Workspace',
  });
});

test('the composition exposes the tenant scope the Missions surface reads through', () => {
  const composition = createInMemoryMosWebComposition();
  assert.deepEqual(composition.scope, { tenantId: 'tenant-demo', workspaceId: 'ws_demo' });
});

test('tenant/workspace are configurable (the composition decides, the shell renders)', async () => {
  const custom = createInMemoryMosWebComposition({
    tenantId: 'tenant-custom',
    workspaceId: null,
  });
  const shellView = await custom.appShell.loadAppShell();
  if ('error' in shellView) {
    assert.fail('unexpected app-shell failure');
  }
  assert.deepEqual(shellView.tenant, {
    tenantId: 'tenant-custom' as never,
    tenantDisplayName: 'Demo Tenant',
    workspaceId: null,
    workspaceDisplayName: null,
  });
  assert.deepEqual(custom.scope, { tenantId: 'tenant-custom', workspaceId: null });

  const summaries = await custom.missionCatalog.listMissionSummaries({
    tenantId: 'tenant-custom' as never,
  });
  if ('error' in summaries) {
    assert.fail('unexpected catalog failure');
  }
  assert.deepEqual(summaries, []);
});

test('missions seeded into the REAL repository surface through the catalog port', async () => {
  const composition = createInMemoryMosWebComposition();
  const created = composition.missionRepository.createMission({
    scope: { tenantId: 'tenant-demo' as never },
    id: 'mission_demo_1' as never,
    objective: {
      statement: 'Run the MOS demo mission end to end.',
      targetMetrics: [
        { metric: 'qualified-reach', target: '10000', unit: 'count', horizon: null },
      ],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: 'qualified-reach',
          weight: 1,
          direction: 'maximize',
          definition: 'Reach among demo accounts.',
        },
      ],
    },
  });
  if ('error' in created) {
    assert.fail(`seed failed: ${created.error}`);
  }

  const summaries = await composition.missionCatalog.listMissionSummaries(DEMO_SCOPE);
  if ('error' in summaries) {
    assert.fail('unexpected catalog failure');
  }
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.missionId, 'mission_demo_1');
  assert.equal(summaries[0]?.title, 'Run the MOS demo mission end to end');
});

test('an intent declared through the composition is recorded with a receipt', async () => {
  const composition = createInMemoryMosWebComposition({ now: () => '2026-06-01T00:00:00.000Z' });
  const receipt = await composition.missionCatalog.declareCreateMissionIntent({
    scope: DEMO_SCOPE,
    objectiveStatement: 'Declare the demo mission intent.',
    rewardTerms: [
      { metric: 'revenue', direction: 'maximize', weight: 1, definition: 'Attributed revenue.' },
    ],
  });
  if ('error' in receipt) {
    assert.fail('unexpected declaration failure');
  }
  assert.equal(receipt.intentId, 'intent-1');
  assert.equal(receipt.declaredAt, '2026-06-01T00:00:00.000Z');

  const ledger = composition.recordedIntents();
  assert.equal(ledger.length, 1);

  const loaded = await composition.missionCatalog.loadCreateMissionIntentReceipt(
    'intent-1',
    DEMO_SCOPE,
  );
  assert.equal(loaded !== null && !('error' in loaded) ? loaded.intentId : null, 'intent-1');
});

test('each composition is isolated (fresh repositories, fresh intent ledger)', async () => {
  const first = createInMemoryMosWebComposition();
  await first.missionCatalog.declareCreateMissionIntent({
    scope: DEMO_SCOPE,
    objectiveStatement: 'First.',
    rewardTerms: [
      { metric: 'revenue', direction: 'maximize', weight: 1, definition: 'Revenue.' },
    ],
  });
  const second = createInMemoryMosWebComposition();
  assert.deepEqual(second.recordedIntents(), []);
  const summaries = await second.missionCatalog.listMissionSummaries(DEMO_SCOPE);
  if ('error' in summaries) {
    assert.fail('unexpected catalog failure');
  }
  assert.deepEqual(summaries, []);
});
