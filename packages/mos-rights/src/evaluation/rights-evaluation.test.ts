import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateRights } from './rights-evaluation.js';
import type { RightsGrant } from '../domain/rights-grant.js';
import type { IdentityId, TenantId } from '@mos/identity';
import type { RightsRef } from '../domain/ids.js';

const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;

const NOW = '2026-06-01T00:00:00.000Z';

/** Build a fully-specified explicit grant record (the ONLY rights source). */
const grant = (overrides: Partial<RightsGrant> & { id: RightsRef }): RightsGrant => ({
  tenantId: tenantId('tenant-a'),
  version: 1,
  scope: {
    actions: ['use', 'transform'],
    subjectRefs: ['https://cdn.example.com/video-123.mp4'],
  },
  grantee: identityId('identity-1'),
  sourceRefs: ['license://creator-v2/doc-9'],
  terms: {
    attributionRequired: true,
    commercialUseAllowed: false,
    derivationAllowed: false,
    notes: null,
  },
  grantedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

const request = (overrides: {
  grants: readonly RightsGrant[];
  subjectRef?: string;
  tenantId?: TenantId;
  grantee?: IdentityId;
  action?: RightsGrant['scope']['actions'][number];
}) => ({
  tenantId: overrides.tenantId ?? tenantId('tenant-a'),
  grantee: overrides.grantee ?? identityId('identity-1'),
  action: overrides.action ?? 'use',
  subjectRef: overrides.subjectRef ?? 'https://cdn.example.com/video-123.mp4',
  grants: overrides.grants,
  now: NOW,
});

// ---------------------------------------------------------------------------
// THE CORE-003 CRITICAL RULE: rights are NEVER inferred from URL accessibility.
// A storageRef/URL alone — no explicit grant records — is DENIED with reason
// 'no-explicit-grant', no matter how public the reference looks.
// ---------------------------------------------------------------------------

test('CRITICAL: a storageRef alone (no grants) is denied with no-explicit-grant', () => {
  const result = evaluateRights(
    request({ grants: [], subjectRef: 'https://cdn.example.com/video-123.mp4' }),
  );
  assert.deepEqual(result, {
    verdict: 'denied',
    reason: 'no-explicit-grant',
    grantRef: null,
    subjectRef: 'https://cdn.example.com/video-123.mp4',
  });
});

test('CRITICAL: public/accessible-looking URLs of every shape are denied without grants', () => {
  const publicUrls = [
    'https://cdn.example.com/video-123.mp4',
    'https://www.youtube.com/watch?v=abc123',
    's3://public-bucket/assets/clip.wav',
    'file:///mnt/media/episode.wav',
    '/var/media/local-file.mp4',
  ];
  for (const url of publicUrls) {
    const result = evaluateRights(request({ grants: [], subjectRef: url }));
    assert.equal(result.verdict, 'denied', `URL must not grant rights: ${url}`);
    assert.equal(result.reason, 'no-explicit-grant', `denial reason for ${url}`);
    assert.equal(result.grantRef, null);
  }
});

test('CRITICAL: grants from another tenant never grant rights (no-explicit-grant)', () => {
  const foreignGrant = grant({
    id: rightsRef('grant-foreign'),
    tenantId: tenantId('tenant-b'),
  });
  const result = evaluateRights(request({ grants: [foreignGrant] }));
  assert.equal(result.verdict, 'denied');
  assert.equal(result.reason, 'no-explicit-grant');
});

test('an explicit grant covering subject+action+grantee+tenant yields granted', () => {
  const explicit = grant({ id: rightsRef('grant-1') });
  const result = evaluateRights(request({ grants: [explicit] }));
  assert.deepEqual(result, {
    verdict: 'granted',
    reason: null,
    grantRef: rightsRef('grant-1'),
    subjectRef: 'https://cdn.example.com/video-123.mp4',
  });
});

test('the public URL itself becomes rights-relevant ONLY when a grant names it as subject', () => {
  // Same URL as the denied case above — the difference is entirely the
  // explicit grant record, never the URL's accessibility.
  const url = 'https://cdn.example.com/video-123.mp4';
  const explicit = grant({
    id: rightsRef('grant-url'),
    scope: {
      actions: ['use'],
      subjectRefs: [url],
    },
  });
  const granted = evaluateRights(request({ grants: [explicit], subjectRef: url }));
  assert.equal(granted.verdict, 'granted');

  const coveringOtherSubject = grant({
    id: rightsRef('grant-other-subject'),
    scope: { actions: ['use'], subjectRefs: ['https://cdn.example.com/different.mp4'] },
  });
  const denied = evaluateRights(request({ grants: [coveringOtherSubject], subjectRef: url }));
  assert.equal(denied.verdict, 'denied');
  assert.equal(denied.reason, 'subject-not-covered');
});

test('a subject covered by a grant but for a different grantee is grantee-not-covered', () => {
  const someoneElses = grant({
    id: rightsRef('grant-2'),
    grantee: identityId('identity-2'),
  });
  const result = evaluateRights(request({ grants: [someoneElses] }));
  assert.equal(result.verdict, 'denied');
  assert.equal(result.reason, 'grantee-not-covered');
});

test('a grant that does not permit the requested action is action-not-covered', () => {
  const noDistribute = grant({
    id: rightsRef('grant-3'),
    scope: { actions: ['use'], subjectRefs: ['https://cdn.example.com/video-123.mp4'] },
  });
  const result = evaluateRights(request({ grants: [noDistribute], action: 'distribute' }));
  assert.equal(result.verdict, 'denied');
  assert.equal(result.reason, 'action-not-covered');
});

test('a revoked explicit grant yields grant-revoked (never granted)', () => {
  const revoked = grant({
    id: rightsRef('grant-4'),
    version: 2,
    revokedAt: '2026-02-01T00:00:00.000Z',
  });
  const result = evaluateRights(request({ grants: [revoked] }));
  assert.equal(result.verdict, 'denied');
  assert.equal(result.reason, 'grant-revoked');
  assert.equal(result.grantRef, null);
});

test('an expired explicit grant yields grant-expired (never granted)', () => {
  const expired = grant({
    id: rightsRef('grant-5'),
    expiresAt: '2026-05-01T00:00:00.000Z',
  });
  const result = evaluateRights(request({ grants: [expired] }));
  assert.equal(result.verdict, 'denied');
  assert.equal(result.reason, 'grant-expired');
});

test('a grant expiring exactly at "now" is expired (JWT exp semantics: exclusive)', () => {
  const boundary = grant({
    id: rightsRef('grant-6'),
    expiresAt: NOW,
  });
  const result = evaluateRights(request({ grants: [boundary] }));
  assert.equal(result.verdict, 'denied');
  assert.equal(result.reason, 'grant-expired');
});

test('a grant expiring strictly after "now" is granted', () => {
  const stillValid = grant({
    id: rightsRef('grant-6b'),
    expiresAt: '2026-06-01T00:00:00.001Z',
  });
  const result = evaluateRights(request({ grants: [stillValid] }));
  assert.equal(result.verdict, 'granted');
});

test('one active grant among several revoked grants still yields granted', () => {
  const revoked = grant({
    id: rightsRef('grant-revoked'),
    version: 2,
    revokedAt: '2026-02-01T00:00:00.000Z',
  });
  const active = grant({ id: rightsRef('grant-active') });
  const result = evaluateRights(request({ grants: [revoked, active] }));
  assert.equal(result.verdict, 'granted');
  assert.equal(result.grantRef, rightsRef('grant-active'));
});

test('evaluateRights is a pure function of its inputs (no I/O, deterministic)', () => {
  const explicit = grant({ id: rightsRef('grant-1') });
  const first = evaluateRights(request({ grants: [explicit] }));
  const second = evaluateRights(request({ grants: [explicit] }));
  assert.deepEqual(first, second);

  // The request type carries no channel through which accessibility could be
  // probed: the same subject with the same grants always yields the same
  // verdict, and mutation of the input array afterwards changes nothing.
  const grants = [explicit];
  const verdict = evaluateRights(request({ grants }));
  grants.pop();
  assert.deepEqual(evaluateRights(request({ grants: [explicit] })), verdict);
});
