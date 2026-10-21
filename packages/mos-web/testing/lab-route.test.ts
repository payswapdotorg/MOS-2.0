/**
 * Lab route page-model loading tests (UX-003) — `loadMosRouteView` over the
 * `/lab` route: the one-pass controller pass decides WHICH lab view ports
 * the route needs and degrades honestly (route-error for a failed benchmark
 * listing, the named calibration-unavailable marker when only the
 * calibration service fails, named markers for selection misses). Never
 * placeholders.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AppShellView, ShellSectionView } from '../dist/src/ports/app-shell.js';
import { loadMosRouteView } from '../dist/src/routes/route-loading.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';

const SHELL_SECTIONS: readonly ShellSectionView[] = [
  { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
  { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  { id: 'studio', label: 'Studio', route: '/studio', availability: { kind: 'available' } },
  { id: 'lab', label: 'Lab', route: '/lab', availability: { kind: 'available' } },
  {
    id: 'connections',
    label: 'Connections',
    route: '/connections',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-004' },
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

const TENANTLESS_SHELL_VIEW: AppShellView = { sections: SHELL_SECTIONS, tenant: null };

const labRoute = (query: {
  readonly benchmark?: string;
  readonly version?: number | null;
  readonly calibration?: string;
  readonly section?: string;
}) => ({
  kind: 'lab' as const,
  section: (query.section ?? 'benchmarks') as never,
  benchmarkId: query.benchmark ?? null,
  benchmarkVersion: query.version === undefined ? null : query.version,
  calibrationId: query.calibration ?? null,
  corpusId: null,
  ideaNodeId: null,
  simulationRunId: null,
  branchId: null,
  strategyCandidateId: null,
  transformCandidateId: null,
  handoffId: null,
  intentReceiptId: null,
});

test('the benchmarks section loads the benchmark listing in the tenant scope', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(composition, labRoute({ section: 'benchmarks' }), SHELL_VIEW);
  assert.equal(routeView.kind, 'lab');
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.deepEqual(routeView.data.scope, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  assert.ok(routeView.data.benchmarks !== null); assert.equal(routeView.data.benchmarks.length, 2);
  assert.equal(routeView.data.selectedDigest, null);
  assert.equal(routeView.data.benchmarkSelectionError, null);
});

test('the calibration section loads the calibration listing in the tenant scope', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ section: 'calibration' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.ok(routeView.data.calibrationChains !== null);
  assert.equal(routeView.data.calibrationChains.length, 2);
  assert.equal(routeView.data.selectedCalibrationRecords, null);
  assert.equal(routeView.data.calibrationSelectionError, null);
  assert.equal(routeView.data.calibrationError, null);
});

test('lab without a tenant context loads the explicit no-scope page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(composition, labRoute({}), TENANTLESS_SHELL_VIEW);
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.scope, null);
  assert.equal(routeView.data.benchmarks, null, 'the neutral no-scope model loads no section data');
  assert.equal(routeView.data.calibrationChains, null);
  assert.equal(routeView.data.selectedDigest, null);
});

test('a selected benchmark resolves its LATEST digest into the page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ benchmark: 'bench-reach-v1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.selectedDigest?.version, 2);
  assert.equal(routeView.data.selectedDigest?.summary.benchmarkId, 'bench-reach-v1');
  assert.equal(routeView.data.benchmarkSelectionError, null);
});

test('an exact benchmark version resolves that record version into the page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ benchmark: 'bench-reach-v1', version: 1 }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.selectedDigest?.version, 1);
  assert.equal(routeView.data.selectedDigest?.citedCalibrationContext, null);
});

test('an unknown benchmark id degrades to the named lab-benchmark-not-found marker', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ benchmark: 'bench-ghost' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.selectedDigest, null);
  assert.equal(routeView.data.benchmarkSelectionError, 'lab-benchmark-not-found');
});

test('a cross-tenant benchmark id degrades to the SAME not-found marker (§31)', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ benchmark: 'bench-other-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.selectedDigest, null);
  assert.equal(routeView.data.benchmarkSelectionError, 'lab-benchmark-not-found');
});

test('a selected calibration chain resolves its records into the page model', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ section: 'calibration', calibration: 'calib-reach-1' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.selectedCalibrationRecords?.length, 2);
  assert.equal(routeView.data.calibrationSelectionError, null);
});

test('an unknown calibration id degrades to the named lab-calibration-not-found marker', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    labRoute({ section: 'calibration', calibration: 'calib-ghost' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.selectedCalibrationRecords, null);
  assert.equal(routeView.data.calibrationSelectionError, 'lab-calibration-not-found');
});

test('benchmark and calibration selections resolve on their own section page models', async () => {
  const composition = createInMemoryMosWebComposition();
  const benchmarkView = await loadMosRouteView(
    composition,
    labRoute({ section: 'benchmarks', benchmark: 'bench-reach-v1' }),
    SHELL_VIEW,
  );
  if (benchmarkView.kind !== 'lab') {
    assert.fail('expected the lab benchmarks page model');
  }
  assert.equal(benchmarkView.data.selectedDigest?.summary.benchmarkId, 'bench-reach-v1');

  const calibrationView = await loadMosRouteView(
    composition,
    labRoute({ section: 'calibration', calibration: 'calib-reach-1' }),
    SHELL_VIEW,
  );
  if (calibrationView.kind !== 'lab') {
    assert.fail('expected the lab calibration page model');
  }
  assert.equal(calibrationView.data.selectedCalibrationRecords?.length, 2);
});

test('a failing benchmark listing degrades the WHOLE page to the route-error view', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    {
      ...composition,
      labBenchmark: {
        async listBenchmarkSummaries() {
          return {
            error: 'lab-benchmark-unavailable',
            message: 'benchmark service failed',
          } as never;
        },
        async loadBenchmarkDigest() {
          return { error: 'lab-benchmark-not-found', message: 'miss' } as never;
        },
      },
      labCalibration: composition.labCalibration,
    },
    labRoute({}),
    SHELL_VIEW,
  );
  assert.equal(routeView.kind, 'route-error');
  if (routeView.kind === 'route-error') {
    assert.equal(routeView.code, 'lab-benchmark-unavailable');
    assert.equal(routeView.message, 'benchmark service failed');
    assert.equal(routeView.retryHref, '/lab');
  }
});

test('a failing calibration listing degrades the calibration SECTION to the route-error view', async () => {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    {
      ...composition,
      labCalibration: {
        async listCalibrationChains() {
          return {
            error: 'lab-calibration-unavailable',
            message: 'calibration service failed',
          } as never;
        },
        async loadCalibrationRecords() {
          return { error: 'lab-calibration-not-found', message: 'miss' } as never;
        },
        async loadCalibrationContext() {
          return null;
        },
      },
    },
    labRoute({ section: 'calibration' }),
    SHELL_VIEW,
  );
  assert.equal(routeView.kind, 'route-error');
  if (routeView.kind === 'route-error') {
    assert.equal(routeView.code, 'lab-calibration-unavailable');
    assert.equal(routeView.message, 'calibration service failed');
    assert.equal(routeView.retryHref, '/lab');
  }
});

test('the benchmarks section loads without touching the calibration port (one section per load)', async () => {
  const composition = createInMemoryMosWebComposition();
  let calibrationCalls = 0;
  const routeView = await loadMosRouteView(
    {
      ...composition,
      labCalibration: {
        async listCalibrationChains() {
          calibrationCalls += 1;
          return { error: 'lab-calibration-unavailable', message: 'unreachable' } as never;
        },
        async loadCalibrationRecords() {
          return { error: 'lab-calibration-not-found', message: 'miss' } as never;
        },
        async loadCalibrationContext() {
          return null;
        },
      },
    },
    labRoute({ section: 'benchmarks' }),
    SHELL_VIEW,
  );
  if (routeView.kind !== 'lab') {
    assert.fail('expected the lab page model');
  }
  assert.equal(routeView.data.section, 'benchmarks');
  assert.ok(routeView.data.benchmarks !== null);
  assert.equal(routeView.data.benchmarks.length, 2, 'the benchmark surface still loaded');
  assert.equal(calibrationCalls, 0, 'the benchmarks section never calls the calibration port');
  assert.equal(routeView.data.calibrationChains, null, 'not loaded on this pass — the explicit loading state');
});
