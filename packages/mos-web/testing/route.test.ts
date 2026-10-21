/**
 * Route model tests (WEB-001) — the hand-rolled route dispatch (the audited
 * pattern: no router dependency, one route per load) and the per-route
 * document titles.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mosRouteTitle, parseMosRoute } from '../dist/src/routes/route.js';

test('root path parses to the home route', () => {
  assert.deepEqual(parseMosRoute('/', ''), { kind: 'home' });
  assert.deepEqual(parseMosRoute('', ''), { kind: 'home' });
  assert.deepEqual(parseMosRoute('/', '?x=1'), { kind: 'home' });
});

test('trailing slashes normalize without changing the route', () => {
  assert.deepEqual(parseMosRoute('/missions/', ''), { kind: 'missions', missionId: null, intentId: null, intentError: null });
  assert.deepEqual(parseMosRoute('/', ''), { kind: 'home' });
});

test('/missions parses with mission, intent and intent-error params', () => {
  assert.deepEqual(parseMosRoute('/missions', '?mission=mission_m1'), {
    kind: 'missions',
    missionId: 'mission_m1',
    intentId: null,
    intentError: null,
  });
  assert.deepEqual(parseMosRoute('/missions', '?intent=intent-3'), {
    kind: 'missions',
    missionId: null,
    intentId: 'intent-3',
    intentError: null,
  });
  assert.deepEqual(parseMosRoute('/missions', '?intent-error=mission-catalog-unavailable'), {
    kind: 'missions',
    missionId: null,
    intentId: null,
    intentError: 'mission-catalog-unavailable',
  });
  assert.deepEqual(parseMosRoute('/missions', ''), {
    kind: 'missions',
    missionId: null,
    intentId: null,
    intentError: null,
  });
});

test('empty query values are treated as absent', () => {
  assert.deepEqual(parseMosRoute('/missions', '?mission='), {
    kind: 'missions',
    missionId: null,
    intentId: null,
    intentError: null,
  });
});

test('/studio parses with session and package params (UX-002)', () => {
  assert.deepEqual(parseMosRoute('/studio', ''), {
    kind: 'studio',
    sessionId: null,
    packageId: null,
  });
  assert.deepEqual(parseMosRoute('/studio', '?session=session-reaction-1'), {
    kind: 'studio',
    sessionId: 'session-reaction-1',
    packageId: null,
  });
  assert.deepEqual(parseMosRoute('/studio', '?package=pkg-reaction-1'), {
    kind: 'studio',
    sessionId: null,
    packageId: 'pkg-reaction-1',
  });
  assert.deepEqual(
    parseMosRoute('/studio', '?session=session-reaction-1&package=pkg-reaction-1'),
    {
      kind: 'studio',
      sessionId: 'session-reaction-1',
      packageId: 'pkg-reaction-1',
    },
  );
  assert.deepEqual(parseMosRoute('/studio', '?session='), {
    kind: 'studio',
    sessionId: null,
    packageId: null,
  });
  assert.deepEqual(parseMosRoute('/studio/', ''), {
    kind: 'studio',
    sessionId: null,
    packageId: null,
  });
});

test('/lab parses with benchmark, version and calibration params (UX-003)', () => {
  assert.deepEqual(parseMosRoute('/lab', ''), {
    kind: 'lab',
    section: 'overview',
    benchmarkId: null,
    benchmarkVersion: null,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1'), {
    kind: 'lab',
    section: 'benchmarks',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=1'), {
    kind: 'lab',
    section: 'benchmarks',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: 1,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?calibration=calib-reach-1'), {
    kind: 'lab',
    section: 'calibration',
    benchmarkId: null,
    benchmarkVersion: null,
    calibrationId: 'calib-reach-1',
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(
    parseMosRoute('/lab', '?benchmark=bench-reach-v1&calibration=calib-reach-1'),
    {
    kind: 'lab',
    section: 'benchmarks',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: 'calib-reach-1',
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  },
  );
});

test('non-numeric, zero and padded version params parse as absent (never guessed)', () => {
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=abc'), {
    kind: 'lab',
    section: 'benchmarks',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=0'), {
    kind: 'lab',
    section: 'benchmarks',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=01'), {
    kind: 'lab',
    section: 'benchmarks',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
  assert.deepEqual(parseMosRoute('/lab/', '?benchmark='), {
    kind: 'lab',
    section: 'overview',
    benchmarkId: null,
    benchmarkVersion: null,
    calibrationId: null,
    corpusId: null,
    ideaNodeId: null,
    simulationRunId: null,
    branchId: null,
    strategyCandidateId: null,
    transformCandidateId: null,
    handoffId: null,
    intentReceiptId: null,
  });
});

test('the Connections surface parses to its dedicated route kind (UX-004)', () => {
  assert.deepEqual(parseMosRoute('/connections', ''), {
    kind: 'connections',
    providerId: null,
    bindingId: null,
  });
  assert.deepEqual(parseMosRoute('/connections', '?provider=prov-a'), {
    kind: 'connections',
    providerId: 'prov-a',
    bindingId: null,
  });
});

test('/console parses with mission, mode, selections and the receipt marker (the CONSOLE wave)', () => {
  const route = parseMosRoute('/console', '?mission=mission-1&mode=plan&plan=plan-1&receipt=console-intent-0001');
  assert.deepEqual(route, {
    kind: 'console',
    missionId: 'mission-1',
    mode: 'plan',
    planId: 'plan-1',
    strategyId: null,
    runId: null,
    experimentId: null,
    intentReceiptId: 'console-intent-0001',
  });
});

test('/console defaults to the direct mode and rejects unknown modes without guessing', () => {
  const bare = parseMosRoute('/console', '');
  assert.equal(bare.kind, 'console');
  if (bare.kind === 'console') {
    assert.equal(bare.mode, 'direct');
    assert.equal(bare.missionId, null);
    assert.equal(bare.intentReceiptId, null);
  }
  const unknownMode = parseMosRoute('/console', '?mode=chat');
  assert.equal(unknownMode.kind, 'console');
  if (unknownMode.kind === 'console') {
    assert.equal(unknownMode.mode, 'direct', 'an unknown mode resolves to the declared default, never a guessed surface');
  }
});

test('/console route titles name the workspace and the working mode', () => {
  assert.equal(mosRouteTitle({ kind: 'console', missionId: null, mode: 'direct', planId: null, strategyId: null, runId: null, experimentId: null, intentReceiptId: null }), 'MOS — Agent Console');
  assert.equal(mosRouteTitle({ kind: 'console', missionId: 'mission-1', mode: 'control', planId: null, strategyId: null, runId: null, experimentId: null, intentReceiptId: null }), 'MOS — Agent Console · mission workspace · control');
});

test('unknown paths parse to the explicit unknown route, never a silent fallback', () => {
  assert.deepEqual(parseMosRoute('/admin', ''), { kind: 'unknown', path: '/admin' });
  assert.deepEqual(parseMosRoute('/missions/detail/x', ''), {
    kind: 'unknown',
    path: '/missions/detail/x',
  });
});

const labTitleRoute = (query: {
  readonly benchmark?: string;
  readonly calibration?: string;
}) => ({
  kind: 'lab' as const,
  section: 'benchmarks' as never,
  benchmarkId: query.benchmark ?? null,
  benchmarkVersion: null,
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

test('route titles name the surface per route', () => {
  assert.equal(mosRouteTitle({ kind: 'home' }), 'MOS — Home');
  assert.equal(
    mosRouteTitle({ kind: 'missions', missionId: null, intentId: null, intentError: null }),
    'MOS — Missions',
  );
  assert.equal(
    mosRouteTitle({ kind: 'missions', missionId: 'm1', intentId: null, intentError: null }),
    'MOS — Missions · mission detail',
  );
  assert.equal(mosRouteTitle({ kind: 'studio', sessionId: null, packageId: null }), 'MOS — Studio');
  assert.equal(
    mosRouteTitle({ kind: 'studio', sessionId: 'session-reaction-1', packageId: null }),
    'MOS — Studio · session detail',
  );
  assert.equal(
    mosRouteTitle({ kind: 'studio', sessionId: null, packageId: 'pkg-reaction-1' }),
    'MOS — Studio · package chain',
  );
  assert.equal(
    mosRouteTitle({ kind: 'studio', sessionId: 'session-reaction-1', packageId: 'pkg-reaction-1' }),
    'MOS — Studio · session + package chain',
  );
  assert.equal(
    mosRouteTitle(labTitleRoute({})),
    'MOS — Lab · benchmarks',
  );
  assert.equal(mosRouteTitle({ ...labTitleRoute({}), section: 'overview' as never }), 'MOS — Lab');
  assert.equal(mosRouteTitle({ ...labTitleRoute({}), section: 'simulator' as never }), 'MOS — Lab · simulator');
  assert.equal(
    mosRouteTitle(labTitleRoute({ benchmark: 'bench-reach-v1' })),
    'MOS — Lab · benchmark digest',
  );
  assert.equal(
    mosRouteTitle(labTitleRoute({ calibration: 'calib-reach-1' })),
    'MOS — Lab · calibration records',
  );
  assert.equal(
    mosRouteTitle(labTitleRoute({ benchmark: 'bench-reach-v1', calibration: 'calib-reach-1' })),
    'MOS — Lab · benchmark digest',
  );
  assert.equal(mosRouteTitle({ kind: 'section', sectionId: 'connections' }), 'MOS — connections');
  assert.equal(mosRouteTitle({ kind: 'unknown', path: '/x' }), 'MOS — page not found');
});
