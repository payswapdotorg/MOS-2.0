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

test('future product sections parse to the explicit section route', () => {
  assert.deepEqual(parseMosRoute('/studio', ''), { kind: 'section', sectionId: 'studio' });
  assert.deepEqual(parseMosRoute('/lab', ''), { kind: 'section', sectionId: 'lab' });
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
  assert.equal(mosRouteTitle({ kind: 'section', sectionId: 'studio' }), 'MOS — studio');
  assert.equal(mosRouteTitle({ kind: 'unknown', path: '/x' }), 'MOS — page not found');
});
