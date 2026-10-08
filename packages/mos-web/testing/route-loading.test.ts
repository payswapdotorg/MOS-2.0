/**
 * Route page-model loading tests (UX-001) — `loadMosRouteView` is the
 * one-pass controller pass: it decides WHICH view ports a route needs and
 * degrades honestly (route-error views for required data, named markers for
 * secondary data). Never placeholders.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AppShellView, ShellSectionView } from '../dist/src/ports/app-shell.js';
import type { MosWebComposition } from '../dist/src/ports/composition.js';
import type { MissionCatalogFailure, MissionCatalogPort } from '../dist/src/ports/mission-catalog.js';
import { loadMosRouteView } from '../dist/src/routes/route-loading.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';

const SHELL_SECTIONS: readonly ShellSectionView[] = [
  { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
  { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  {
    id: 'studio',
    label: 'Studio',
    route: '/studio',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-002' },
  },
];

const SHELL_VIEW: AppShellView = {
  sections: SHELL_SECTIONS,
  tenant: {
    tenantId: 'tenant-demo' as never,
    tenantDisplayName: 'Demo Tenant',
    workspaceId: 'ws_demo' as never,
    workspaceDisplayName: 'Demo Workspace',
  },
};

const TENANTLESS_SHELL_VIEW: AppShellView = {
  sections: SHELL_SECTIONS,
  tenant: null,
};

const missionsRoute = (query: {
  mission?: string;
  intent?: string;
  intentError?: string;
}) => ({
  kind: 'missions' as const,
  missionId: query.mission ?? null,
  intentId: query.intent ?? null,
  intentError: query.intentError ?? null,
});

const seededComposition = (): ReturnType<typeof createInMemoryMosWebComposition> => {
  const composition = createInMemoryMosWebComposition({ now: () => '2026-06-01T00:00:00.000Z' });
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
  return composition;
};

test('the home route resolves to the home view with no port calls', async () => {
  let calls = 0;
  const composition: MosWebComposition = {
    appShell: {
      async loadAppShell() {
        calls += 1;
        return SHELL_VIEW;
      },
    },
    missionCatalog: null as never,
  };
  const routeView = await loadMosRouteView(composition, { kind: 'home' }, SHELL_VIEW);
  assert.deepEqual(routeView, { kind: 'home' });
  assert.equal(calls, 0, 'the home narration is presentation data, not a service read');
});

test('section routes resolve their section view from the shell chrome', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(composition, { kind: 'section', sectionId: 'studio' }, SHELL_VIEW);
  assert.equal(routeView.kind, 'section');
  if (routeView.kind === 'section') {
    assert.equal(routeView.section.id, 'studio');
    assert.equal(routeView.section.availability.kind, 'not-yet-available');
  }
});

test('a section id absent from the chrome is an unknown route, never a guess', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(composition, { kind: 'section', sectionId: 'lab' }, SHELL_VIEW);
  assert.deepEqual(routeView, { kind: 'unknown-route', path: '/lab' });
});

test('unknown paths resolve to the explicit unknown-route view', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(composition, { kind: 'unknown', path: '/admin' }, SHELL_VIEW);
  assert.deepEqual(routeView, { kind: 'unknown-route', path: '/admin' });
});

test('missions without a tenant context loads the explicit no-scope page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    missionsRoute({}),
    TENANTLESS_SHELL_VIEW,
  );
  assert.equal(routeView.kind, 'missions');
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.equal(routeView.data.scope, null);
  assert.deepEqual(routeView.data.summaries, []);
  assert.equal(routeView.data.selected, null);
});

test('missions loads summaries and vocabulary in the tenant scope', async () => {
  const composition = seededComposition();
  const routeView = await loadMosRouteView(composition, missionsRoute({}), SHELL_VIEW);
  assert.equal(routeView.kind, 'missions');
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.deepEqual(routeView.data.scope, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  assert.equal(routeView.data.summaries.length, 1);
  assert.equal(routeView.data.summaries[0]?.missionId, 'mission_demo_1');
  assert.equal(routeView.data.metricVocabulary.length >= 10, true);
  assert.equal(routeView.data.selected, null);
  assert.equal(routeView.data.selectionError, null);
});

test('a selected mission resolves its detail into the page model', async () => {
  const composition = seededComposition();
  const routeView = await loadMosRouteView(
    composition,
    missionsRoute({ mission: 'mission_demo_1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.equal(routeView.data.selected?.summary.missionId, 'mission_demo_1');
  assert.equal(routeView.data.selectionError, null);
  assert.equal(routeView.data.selected?.transitions.length, 1);
});

test('an unknown mission id degrades to the named mission-not-found marker', async () => {
  const composition = seededComposition();
  const routeView = await loadMosRouteView(
    composition,
    missionsRoute({ mission: 'mission_ghost' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.equal(routeView.data.selected, null);
  assert.equal(routeView.data.selectionError, 'mission-not-found');
});

test('a failing detail load degrades to the load-failed marker', async () => {
  const composition = seededComposition();
  const failingCatalog: MissionCatalogPort = {
    ...composition.missionCatalog,
    async loadMissionDetail() {
      const failure: MissionCatalogFailure = {
        error: 'mission-catalog-unavailable',
        message: 'catalog service failed',
      };
      return failure;
    },
  };
  const routeView = await loadMosRouteView(
    { appShell: composition.appShell, missionCatalog: failingCatalog },
    missionsRoute({ mission: 'mission_demo_1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.equal(routeView.data.selectionError, 'load-failed');
});

test('a failing catalog list degrades the WHOLE page to the route-error view', async () => {
  const composition = seededComposition();
  const failingCatalog: MissionCatalogPort = {
    ...composition.missionCatalog,
    async listMissionSummaries() {
      const failure: MissionCatalogFailure = {
        error: 'mission-catalog-unavailable',
        message: 'catalog service failed',
      };
      return failure;
    },
  };
  const routeView = await loadMosRouteView(
    { appShell: composition.appShell, missionCatalog: failingCatalog },
    missionsRoute({}),
    SHELL_VIEW,
  );
  assert.equal(routeView.kind, 'route-error');
  if (routeView.kind === 'route-error') {
    assert.equal(routeView.code, 'mission-catalog-unavailable');
    assert.equal(routeView.message, 'catalog service failed');
    assert.equal(routeView.retryHref, '/missions');
  }
});

test('a failing vocabulary load is secondary data — the page still loads', async () => {
  const composition = seededComposition();
  const degradedCatalog: MissionCatalogPort = {
    ...composition.missionCatalog,
    async loadRewardMetricVocabulary() {
      const failure: MissionCatalogFailure = {
        error: 'mission-catalog-unavailable',
        message: 'vocabulary service failed',
      };
      return failure;
    },
  };
  const routeView = await loadMosRouteView(
    { appShell: composition.appShell, missionCatalog: degradedCatalog },
    missionsRoute({}),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.deepEqual(routeView.data.metricVocabulary, []);
  assert.equal(routeView.data.summaries.length, 1);
});

test('an intent id resolves its receipt into the page model', async () => {
  const composition = seededComposition();
  const receipt = await composition.missionCatalog.declareCreateMissionIntent({
    scope: { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never },
    objectiveStatement: 'Declare the demo intent.',
    rewardTerms: [
      { metric: 'revenue', direction: 'maximize', weight: 1, definition: 'Revenue.' },
    ],
  });
  if ('error' in receipt) {
    assert.fail('unexpected declaration failure');
  }

  const routeView = await loadMosRouteView(
    composition,
    missionsRoute({ intent: 'intent-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  const loaded = routeView.data.intentReceipt;
  assert.ok(loaded !== null);
  assert.equal(loaded.intentId, 'intent-1');
  assert.equal(routeView.data.intentError, null);
});

test('an unfound intent receipt becomes the named intent-receipt-not-found marker', async () => {
  const composition = seededComposition();
  const routeView = await loadMosRouteView(
    composition,
    missionsRoute({ intent: 'intent-404' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.equal(routeView.data.intentReceipt, null);
  assert.equal(routeView.data.intentError, 'intent-receipt-not-found');
});

test('an intent-error query marker is carried into the page model', async () => {
  const composition = seededComposition();
  const routeView = await loadMosRouteView(
    composition,
    missionsRoute({ intentError: 'mission-catalog-unavailable' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'missions') {
    assert.fail('expected the missions page model');
  }
  assert.equal(routeView.data.intentError, 'mission-catalog-unavailable');
  assert.equal(routeView.data.intentReceipt, null);
});
