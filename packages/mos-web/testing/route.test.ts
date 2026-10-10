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
    benchmarkId: null,
    benchmarkVersion: null,
    calibrationId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1'), {
    kind: 'lab',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=1'), {
    kind: 'lab',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: 1,
    calibrationId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?calibration=calib-reach-1'), {
    kind: 'lab',
    benchmarkId: null,
    benchmarkVersion: null,
    calibrationId: 'calib-reach-1',
  });
  assert.deepEqual(
    parseMosRoute('/lab', '?benchmark=bench-reach-v1&calibration=calib-reach-1'),
    {
      kind: 'lab',
      benchmarkId: 'bench-reach-v1',
      benchmarkVersion: null,
      calibrationId: 'calib-reach-1',
    },
  );
});

test('non-numeric, zero and padded version params parse as absent (never guessed)', () => {
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=abc'), {
    kind: 'lab',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=0'), {
    kind: 'lab',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
  });
  assert.deepEqual(parseMosRoute('/lab', '?benchmark=bench-reach-v1&version=01'), {
    kind: 'lab',
    benchmarkId: 'bench-reach-v1',
    benchmarkVersion: null,
    calibrationId: null,
  });
  assert.deepEqual(parseMosRoute('/lab/', '?benchmark='), {
    kind: 'lab',
    benchmarkId: null,
    benchmarkVersion: null,
    calibrationId: null,
  });
});

test('future product sections parse to the explicit section route', () => {
  assert.deepEqual(parseMosRoute('/connections', ''), { kind: 'section', sectionId: 'connections' });
});

test('unknown paths parse to the explicit unknown route, never a silent fallback', () => {
  assert.deepEqual(parseMosRoute('/admin', ''), { kind: 'unknown', path: '/admin' });
  assert.deepEqual(parseMosRoute('/missions/detail/x', ''), {
    kind: 'unknown',
    path: '/missions/detail/x',
  });
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
    mosRouteTitle({ kind: 'lab', benchmarkId: null, benchmarkVersion: null, calibrationId: null }),
    'MOS — Lab',
  );
  assert.equal(
    mosRouteTitle({ kind: 'lab', benchmarkId: 'bench-reach-v1', benchmarkVersion: null, calibrationId: null }),
    'MOS — Lab · benchmark digest',
  );
  assert.equal(
    mosRouteTitle({ kind: 'lab', benchmarkId: null, benchmarkVersion: null, calibrationId: 'calib-reach-1' }),
    'MOS — Lab · calibration records',
  );
  assert.equal(
    mosRouteTitle({ kind: 'lab', benchmarkId: 'bench-reach-v1', benchmarkVersion: null, calibrationId: 'calib-reach-1' }),
    'MOS — Lab · benchmark digest + calibration',
  );
  assert.equal(mosRouteTitle({ kind: 'section', sectionId: 'connections' }), 'MOS — connections');
  assert.equal(mosRouteTitle({ kind: 'unknown', path: '/x' }), 'MOS — page not found');
});
