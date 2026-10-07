/**
 * OAuth state codec tests (WEB-001) — the identity-flow plumbing pattern
 * ported from the audited `oauthStateCodec.ts` (KEEP table), carried for the
 * Phase 2 MOS identity sign-in surface: encode/parse round-trips and the
 * safe-return-path validation that keeps post-login redirects app-internal.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  encodeMosOAuthState,
  parseMosOAuthState,
  resolveSafeMosAppReturnTo,
} from '../dist/src/platform/oauth-state-codec.js';

test('encode/parse round-trip preserves nonce and return path', () => {
  const state = encodeMosOAuthState({ nonce: 'n-123', appReturnTo: '/missions' });
  const parsed = parseMosOAuthState(state);
  assert.deepEqual(parsed, { nonce: 'n-123', appReturnTo: '/missions' });
});

test('encode/parse round-trip without a return path', () => {
  const parsed = parseMosOAuthState(encodeMosOAuthState({ nonce: 'abc' }));
  assert.deepEqual(parsed, { nonce: 'abc' });
});

test('parse rejects malformed, nonce-less and foreign payloads with null', () => {
  assert.equal(parseMosOAuthState('not-base64-url!!'), null);
  assert.equal(parseMosOAuthState(encodeBase64Url('{"appReturnTo":"/missions"}')), null);
  assert.equal(parseMosOAuthState(encodeBase64Url('{"nonce":""}')), null);
  assert.equal(parseMosOAuthState(encodeBase64Url('not json')), null);
  assert.equal(parseMosOAuthState(''), null);
});

test('resolveSafeMosAppReturnTo accepts app-internal paths only', () => {
  assert.equal(resolveSafeMosAppReturnTo('/'), '/');
  assert.equal(resolveSafeMosAppReturnTo('/missions'), '/missions');
  assert.equal(resolveSafeMosAppReturnTo('/missions?mission=m1'), null, 'query strings are rejected');
  assert.equal(resolveSafeMosAppReturnTo('/studio'), '/studio');
  assert.equal(resolveSafeMosAppReturnTo('/lab/runs'), '/lab/runs');
  assert.equal(resolveSafeMosAppReturnTo('/connections'), '/connections');
});

test('resolveSafeMosAppReturnTo rejects traversal, foreign paths and absolute URLs', () => {
  const currentOrigin = { currentOrigin: 'https://mos.example.com' };
  assert.equal(resolveSafeMosAppReturnTo('/../etc/passwd'), null);
  assert.equal(
    resolveSafeMosAppReturnTo('https://evil.example.com/missions', currentOrigin),
    null,
    'a foreign origin with an app-looking path is an open redirect, never a safe return',
  );
  assert.equal(
    resolveSafeMosAppReturnTo('https://evil.example.com/admin', currentOrigin),
    null,
  );
  assert.equal(resolveSafeMosAppReturnTo('javascript:alert(1)'), null);
  assert.equal(resolveSafeMosAppReturnTo('//evil.example.com'), null);
  assert.equal(resolveSafeMosAppReturnTo('/unknown-route'), null);
  assert.equal(resolveSafeMosAppReturnTo(''), null);
  assert.equal(resolveSafeMosAppReturnTo(undefined), null);
});

test('absolute URLs are rejected fail-closed when no origin is resolvable', () => {
  // Node test context: no window.location — without a trusted origin the
  // codec must not guess; absolute URLs reduce to null, relative paths work.
  assert.equal(resolveSafeMosAppReturnTo('https://mos.example.com/missions'), null);
  assert.equal(resolveSafeMosAppReturnTo('https://localhost:5174/missions'), null);
  assert.equal(resolveSafeMosAppReturnTo('/missions'), '/missions');
});

test('the runtime location origin is the default trusted origin', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { origin: 'https://runtime.mos.example.com' },
    } as unknown as Window & typeof globalThis;
    assert.equal(
      resolveSafeMosAppReturnTo('https://runtime.mos.example.com/missions'),
      '/missions',
    );
    assert.equal(
      resolveSafeMosAppReturnTo('https://other.example.com/missions'),
      null,
      'a different origin is foreign even with an app-looking path',
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test('same-origin absolute URLs back onto app routes reduce to the internal path', () => {
  const currentOrigin = { currentOrigin: 'https://mos.example.com' };
  assert.equal(
    resolveSafeMosAppReturnTo('https://mos.example.com/missions', currentOrigin),
    '/missions',
  );
  assert.equal(
    resolveSafeMosAppReturnTo('https://mos.example.com/missions?x=1', currentOrigin),
    null,
    'query/fragment on absolute URLs is rejected',
  );
});

/** Local base64url helper (test-only mirror of the codec's internals). */
function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
