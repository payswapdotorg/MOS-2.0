/**
 * Studio route page-model loading tests (UX-002) — `loadMosRouteView` over
 * the `/studio` route: the one-pass controller pass decides WHICH studio view
 * ports the route needs and degrades honestly (route-error for a failed
 * directory listing, named markers for session/package selection misses, the
 * explicit library-unavailable marker when only the library fails). Never
 * placeholders.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AppShellView } from '../dist/src/ports/app-shell.js';
import { loadMosRouteView } from '../dist/src/routes/route-loading.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';

const SHELL_VIEW: AppShellView = {
  sections: [
    { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
    { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
    { id: 'studio', label: 'Studio', route: '/studio', availability: { kind: 'available' } },
  ],
  tenant: {
    tenantId: 'tenant-demo' as never,
    tenantDisplayName: 'Demo Tenant',
    workspaceId: 'ws_demo' as never,
    workspaceDisplayName: 'Demo Workspace',
  },
};

const TENANTLESS_SHELL_VIEW: AppShellView = { sections: SHELL_VIEW.sections, tenant: null };

const studioRoute = (query: { readonly session?: string; readonly package?: string }) => ({
  kind: 'studio' as const,
  sessionId: query.session ?? null,
  packageId: query.package ?? null,
});

test('the studio route loads the directory and the library in the tenant scope', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(composition, studioRoute({}), SHELL_VIEW);
  assert.equal(routeView.kind, 'studio');
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.deepEqual(routeView.data.scope, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  assert.equal(routeView.data.sessions.length, 11);
  assert.equal(routeView.data.packages.length, 2);
  assert.equal(routeView.data.selected, null);
  assert.equal(routeView.data.selectedChain, null);
  assert.equal(routeView.data.selectionError, null);
  assert.equal(routeView.data.chainError, null);
  assert.equal(routeView.data.libraryError, null);
});

test('studio without a tenant context loads the explicit no-scope page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    studioRoute({}),
    TENANTLESS_SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.scope, null);
  assert.deepEqual(routeView.data.sessions, []);
  assert.deepEqual(routeView.data.packages, []);
  assert.equal(routeView.data.selected, null);
});

test('a selected session resolves its detail into the page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    studioRoute({ session: 'session-reaction-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(String(routeView.data.selected?.summary.sessionId), 'session-reaction-1');
  assert.equal(routeView.data.selected?.summary.lifecycleState, 'packaged');
  assert.equal(routeView.data.selectionError, null);
});

test('an unknown session id degrades to the named studio-session-not-found marker', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    studioRoute({ session: 'session-ghost' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.selected, null);
  assert.equal(routeView.data.selectionError, 'studio-session-not-found');
});

test('a cross-tenant session id degrades to the SAME not-found marker (§31)', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    studioRoute({ session: 'session-other-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.selected, null);
  assert.equal(routeView.data.selectionError, 'studio-session-not-found');
});

test('a selected package resolves its version chain into the page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    studioRoute({ session: 'session-reaction-1', package: 'pkg-reaction-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(String(routeView.data.selectedChain?.packageId), 'pkg-reaction-1');
  assert.deepEqual(
    routeView.data.selectedChain?.versions.map((version) => version.version),
    [1, 2],
  );
  assert.equal(routeView.data.chainError, null);
});

test('an unknown package id degrades to the named studio-package-not-found marker', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    studioRoute({ package: 'pkg-ghost' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.selectedChain, null);
  assert.equal(routeView.data.chainError, 'studio-package-not-found');
});

test('a failing directory listing degrades the WHOLE page to the route-error view', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    {
      appShell: composition.appShell,
      missionCatalog: composition.missionCatalog,
      studioDirectory: {
        async listStudioSessions() {
          return {
            error: 'studio-directory-unavailable',
            message: 'directory service failed',
          } as never;
        },
        async loadStudioSessionDetail() {
          return { error: 'studio-session-not-found', message: 'miss' } as never;
        },
      },
      studioPackages: composition.studioPackages,
      labBenchmark: composition.labBenchmark,
      labCalibration: composition.labCalibration,
    },
    studioRoute({}),
    SHELL_VIEW,
  );
  assert.equal(routeView.kind, 'route-error');
  if (routeView.kind === 'route-error') {
    assert.equal(routeView.code, 'studio-directory-unavailable');
    assert.equal(routeView.message, 'directory service failed');
    assert.equal(routeView.retryHref, '/studio');
  }
});

test('a failing library listing is secondary — the page loads with the explicit marker', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    {
      appShell: composition.appShell,
      missionCatalog: composition.missionCatalog,
      studioDirectory: composition.studioDirectory,
      studioPackages: {
        async listStudioPackages() {
          return {
            error: 'studio-package-library-unavailable',
            message: 'library service failed',
          } as never;
        },
        async loadStudioPackageChain() {
          return { error: 'studio-package-not-found', message: 'miss' } as never;
        },
      },
      labBenchmark: composition.labBenchmark,
      labCalibration: composition.labCalibration,
    },
    studioRoute({}),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.libraryError, 'load-failed');
  assert.deepEqual(routeView.data.packages, []);
  assert.equal(routeView.data.sessions.length, 11, 'the directory still loaded');
});

test('a failing detail load degrades to the load-failed marker (not not-found)', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    {
      appShell: composition.appShell,
      missionCatalog: composition.missionCatalog,
      studioDirectory: {
        ...composition.studioDirectory,
        async loadStudioSessionDetail() {
          return {
            error: 'studio-directory-unavailable',
            message: 'detail service failed',
          } as never;
        },
      },
      studioPackages: composition.studioPackages,
      labBenchmark: composition.labBenchmark,
      labCalibration: composition.labCalibration,
    },
    studioRoute({ session: 'session-reaction-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.selected, null);
  assert.equal(routeView.data.selectionError, 'load-failed');
});

test('a failing chain load degrades to the load-failed marker', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    {
      appShell: composition.appShell,
      missionCatalog: composition.missionCatalog,
      studioDirectory: composition.studioDirectory,
      studioPackages: {
        ...composition.studioPackages,
        async loadStudioPackageChain() {
          return {
            error: 'studio-package-library-unavailable',
            message: 'chain service failed',
          } as never;
        },
      },
      labBenchmark: composition.labBenchmark,
      labCalibration: composition.labCalibration,
    },
    studioRoute({ package: 'pkg-reaction-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'studio') {
    assert.fail('expected the studio page model');
  }
  assert.equal(routeView.data.selectedChain, null);
  assert.equal(routeView.data.chainError, 'load-failed');
});
