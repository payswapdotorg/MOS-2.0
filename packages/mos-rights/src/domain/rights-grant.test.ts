import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryRightsRepository } from '../adapters/in-memory-rights-repository.js';
import type { RightsGrant } from './rights-grant.js';
import type { IdentityId, TenantId } from '@mos/identity';
import type { ConsentRef, ProvenanceRef, RightsRef } from './ids.js';

const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const consentRef = (value: string): ConsentRef => value as ConsentRef;
const provenanceRef = (value: string): ProvenanceRef => value as ProvenanceRef;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

const terms = {
  attributionRequired: true,
  commercialUseAllowed: false,
  derivationAllowed: true,
  notes: 'Creator License v2',
} as const;

test('grantRights returns a frozen tenant-scoped RightsGrant with the declared fields', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const granted = repo.grantRights({
    scope: { tenantId: tenantId('tenant-a') },
    id: rightsRef('grant-1'),
    grantee: identityId('identity-1'),
    actions: ['use', 'transform'],
    subjectRefs: ['src://platform/post/123', 'artifact/abc'],
    sourceRefs: ['license://creator-v2/doc-9'],
    terms,
  });
  if ('error' in granted) {
    assert.fail(`unexpected repository error: ${granted.error} — ${granted.message}`);
  }

  assert.equal(granted.id, rightsRef('grant-1'));
  assert.equal(granted.tenantId, tenantId('tenant-a'));
  assert.equal(granted.version, 1);
  assert.equal(granted.grantee, identityId('identity-1'));
  assert.deepEqual(granted.scope.actions, ['use', 'transform']);
  assert.deepEqual(granted.scope.subjectRefs, ['src://platform/post/123', 'artifact/abc']);
  assert.deepEqual(granted.sourceRefs, ['license://creator-v2/doc-9']);
  assert.equal(granted.terms.attributionRequired, true);
  assert.equal(granted.terms.commercialUseAllowed, false);
  assert.equal(granted.grantedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(granted.expiresAt, null);
  assert.equal(granted.revokedAt, null);

  // Frozen at every level: record, scope, terms, and the array fields.
  assert.ok(Object.isFrozen(granted));
  assert.ok(Object.isFrozen(granted.scope));
  assert.ok(Object.isFrozen(granted.scope.actions));
  assert.ok(Object.isFrozen(granted.sourceRefs));
  assert.ok(Object.isFrozen(granted.terms));
});

test('RightsGrant carries exactly the CORE-003 record fields', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const granted = repo.grantRights({
    scope: { tenantId: tenantId('tenant-a') },
    id: rightsRef('grant-1'),
    grantee: identityId('identity-1'),
    actions: ['use'],
    subjectRefs: ['src://x'],
    sourceRefs: ['license://y'],
    terms,
  });
  if ('error' in granted) {
    assert.fail(`unexpected repository error: ${granted.error} — ${granted.message}`);
  }
  const grant: RightsGrant = granted;
  assert.deepEqual(Object.keys(grant).sort(), [
    'expiresAt',
    'grantedAt',
    'grantee',
    'id',
    'revokedAt',
    'scope',
    'sourceRefs',
    'tenantId',
    'terms',
    'version',
  ]);
});

test('grantRights rejects vacuous and malformed grants', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const base = {
    scope: { tenantId: tenantId('tenant-a') },
    id: rightsRef('grant-bad'),
    grantee: identityId('identity-1'),
    subjectRefs: ['src://x'],
    sourceRefs: ['license://y'],
    terms,
  } as const;

  const noActions = repo.grantRights({ ...base, actions: [] });
  assert.ok('error' in noActions && noActions.error === 'invalid-input');

  const noSubjects = repo.grantRights({ ...base, actions: ['use'], subjectRefs: [] });
  assert.ok('error' in noSubjects && noSubjects.error === 'invalid-input');

  const noSources = repo.grantRights({ ...base, actions: ['use'], sourceRefs: [] });
  assert.ok('error' in noSources && noSources.error === 'invalid-input');

  const pastExpiry = repo.grantRights({
    ...base,
    actions: ['use'],
    expiresAt: '2020-01-01T00:00:00.000Z',
  });
  assert.ok('error' in pastExpiry && pastExpiry.error === 'invalid-input');
});

test('recordConsent returns a frozen structured consent record', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const consent = repo.recordConsent({
    scope: { tenantId: tenantId('tenant-a') },
    id: consentRef('consent-1'),
    participantRef: identityId('identity-9'),
    purpose: 'Voice capture for the Q4 podcast pilot',
    actions: ['use', 'transform'],
    subjectRefs: ['capture://session-77/audio'],
  });
  if ('error' in consent) {
    assert.fail(`unexpected repository error: ${consent.error} — ${consent.message}`);
  }
  assert.equal(consent.version, 1);
  assert.equal(consent.participantRef, identityId('identity-9'));
  assert.equal(consent.purpose, 'Voice capture for the Q4 podcast pilot');
  assert.deepEqual(consent.scope.actions, ['use', 'transform']);
  assert.equal(consent.revokedAt, null);
  assert.ok(Object.isFrozen(consent));
  assert.ok(Object.isFrozen(consent.scope));
  assert.deepEqual(Object.keys(consent).sort(), [
    'grantedAt',
    'id',
    'participantRef',
    'purpose',
    'revokedAt',
    'scope',
    'tenantId',
    'version',
  ]);
});

test('recordConsent rejects blank purpose and empty scopes', () => {
  const repo = createInMemoryRightsRepository();
  const blankPurpose = repo.recordConsent({
    scope: { tenantId: tenantId('tenant-a') },
    id: consentRef('consent-bad'),
    participantRef: identityId('identity-9'),
    purpose: '   ',
    actions: ['use'],
    subjectRefs: ['capture://s'],
  });
  assert.ok('error' in blankPurpose && blankPurpose.error === 'invalid-input');

  const noActions = repo.recordConsent({
    scope: { tenantId: tenantId('tenant-a') },
    id: consentRef('consent-bad'),
    participantRef: identityId('identity-9'),
    purpose: 'valid purpose',
    actions: [],
    subjectRefs: ['capture://s'],
  });
  assert.ok('error' in noActions && noActions.error === 'invalid-input');
});

test('recordProvenance returns a frozen immutable provenance record', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const record = repo.recordProvenance({
    scope: { tenantId: tenantId('tenant-a') },
    id: provenanceRef('prov-1'),
    creationMethod: 'acquisition',
    actor: { kind: 'identity', identityId: identityId('identity-1') },
    lineageRefs: ['src://platform/post/123'],
  });
  if ('error' in record) {
    assert.fail(`unexpected repository error: ${record.error} — ${record.message}`);
  }
  assert.equal(record.version, 1);
  assert.equal(record.creationMethod, 'acquisition');
  assert.deepEqual(record.actor, { kind: 'identity', identityId: identityId('identity-1') });
  assert.deepEqual(record.lineageRefs, ['src://platform/post/123']);
  assert.equal(record.recordedAt, '2026-01-01T00:00:00.000Z');
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.lineageRefs));
  assert.deepEqual(Object.keys(record).sort(), [
    'actor',
    'creationMethod',
    'id',
    'lineageRefs',
    'recordedAt',
    'tenantId',
    'version',
  ]);
});
