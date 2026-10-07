import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryRightsRepository } from './in-memory-rights-repository.js';
import type { RightsRepository } from '../ports/rights-repository.js';
import type { IdentityId, TenantId } from '@mos/identity';
import type { ConsentRef, ProvenanceRef, RightsRef } from '../domain/ids.js';

const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const consentRef = (value: string): ConsentRef => value as ConsentRef;
const provenanceRef = (value: string): ProvenanceRef => value as ProvenanceRef;

const terms = {
  attributionRequired: true,
  commercialUseAllowed: false,
  derivationAllowed: true,
  notes: null,
} as const;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

const grantInput = (overrides: { id?: string; tenant?: string } = {}) => ({
  scope: { tenantId: tenantId(overrides.tenant ?? 'tenant-a') },
  id: rightsRef(overrides.id ?? 'grant-1'),
  grantee: identityId('identity-1'),
  actions: ['use', 'transform'] as const,
  subjectRefs: ['https://cdn.example.com/video-123.mp4'],
  sourceRefs: ['license://creator-v2/doc-9'],
  terms,
  expiresAt: null,
});

test('grant → get round-trips the same record', () => {
  const repo: RightsRepository = createInMemoryRightsRepository({
    now: createDeterministicClock(),
  });
  const granted = repo.grantRights(grantInput());
  if ('error' in granted) {
    assert.fail(`unexpected repository error: ${granted.error} — ${granted.message}`);
  }
  const fetched = repo.getRights(rightsRef('grant-1'));
  assert.ok(fetched !== null);
  assert.deepEqual(fetched, granted);
  assert.equal(repo.getRights(rightsRef('missing')), null);
});

test('duplicate grant ids are rejected', () => {
  const repo = createInMemoryRightsRepository();
  const first = repo.grantRights(grantInput());
  assert.ok(!('error' in first));
  const second = repo.grantRights(grantInput());
  assert.ok('error' in second && second.error === 'duplicate-grant');
});

test('revocation is append-only: revoked grants stay readable and listed', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const granted = repo.grantRights(grantInput());
  if ('error' in granted) {
    assert.fail(`unexpected repository error: ${granted.error} — ${granted.message}`);
  }

  const revoked = repo.revokeRights({ tenantId: tenantId('tenant-a') }, rightsRef('grant-1'));
  if ('error' in revoked) {
    assert.fail(`unexpected repository error: ${revoked.error} — ${revoked.message}`);
  }
  assert.equal(revoked.version, 2);
  assert.equal(revoked.revokedAt, '2026-01-01T00:00:01.000Z');
  assert.notEqual(revoked.revokedAt, granted.grantedAt);

  // Append-only: the record is still there (never deleted) and still lists.
  const fetched = repo.getRights(rightsRef('grant-1'));
  assert.ok(fetched !== null);
  assert.equal(fetched.revokedAt, '2026-01-01T00:00:01.000Z');
  const listed = repo.listRightsGrants({ tenantId: tenantId('tenant-a') });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.revokedAt, '2026-01-01T00:00:01.000Z');
});

test('double revocation is rejected', () => {
  const repo = createInMemoryRightsRepository();
  const granted = repo.grantRights(grantInput());
  assert.ok(!('error' in granted));
  assert.ok(!('error' in repo.revokeRights({ tenantId: tenantId('tenant-a') }, rightsRef('grant-1'))));
  const again = repo.revokeRights({ tenantId: tenantId('tenant-a') }, rightsRef('grant-1'));
  assert.ok('error' in again && again.error === 'grant-already-revoked');
});

test('re-granting after revocation creates a NEW record; history is preserved', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  assert.ok(!('error' in repo.grantRights(grantInput({ id: 'grant-old' }))));
  assert.ok(
    !('error' in repo.revokeRights({ tenantId: tenantId('tenant-a') }, rightsRef('grant-old'))),
  );
  const regranted = repo.grantRights(grantInput({ id: 'grant-new' }));
  assert.ok(!('error' in regranted));

  const listed = repo.listRightsGrants({ tenantId: tenantId('tenant-a') });
  assert.equal(listed.length, 2);
  const ids = listed.map((g) => g.id);
  assert.ok(ids.includes(rightsRef('grant-old')));
  assert.ok(ids.includes(rightsRef('grant-new')));
});

test('revocation across tenants is denied', () => {
  const repo = createInMemoryRightsRepository();
  assert.ok(!('error' in repo.grantRights(grantInput({ tenant: 'tenant-a' }))));
  const cross = repo.revokeRights({ tenantId: tenantId('tenant-b') }, rightsRef('grant-1'));
  assert.ok('error' in cross && cross.error === 'cross-tenant-reference');
  // The grant itself was untouched by the failed cross-tenant attempt.
  const fetched = repo.getRights(rightsRef('grant-1'));
  assert.ok(fetched !== null && fetched.revokedAt === null);
});

test('consent lifecycle: record → revoke (append-only) → double-revoke rejected', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const recorded = repo.recordConsent({
    scope: { tenantId: tenantId('tenant-a') },
    id: consentRef('consent-1'),
    participantRef: identityId('identity-9'),
    purpose: 'Voice capture for the Q4 podcast pilot',
    actions: ['use'],
    subjectRefs: ['capture://session-77/audio'],
  });
  assert.ok(!('error' in recorded));

  const revoked = repo.revokeConsent({ tenantId: tenantId('tenant-a') }, consentRef('consent-1'));
  if ('error' in revoked) {
    assert.fail(`unexpected repository error: ${revoked.error} — ${revoked.message}`);
  }
  assert.equal(revoked.version, 2);
  assert.ok(revoked.revokedAt !== null);

  // Still readable and listed after revocation (append-only history).
  assert.ok(repo.getConsent(consentRef('consent-1')) !== null);
  assert.equal(repo.listConsentRecords({ tenantId: tenantId('tenant-a') }).length, 1);

  const again = repo.revokeConsent({ tenantId: tenantId('tenant-a') }, consentRef('consent-1'));
  assert.ok('error' in again && again.error === 'consent-already-revoked');

  const unknown = repo.revokeConsent({ tenantId: tenantId('tenant-a') }, consentRef('nope'));
  assert.ok('error' in unknown && unknown.error === 'consent-not-found');

  const cross = repo.revokeConsent({ tenantId: tenantId('tenant-b') }, consentRef('consent-1'));
  assert.ok('error' in cross && cross.error === 'cross-tenant-reference');
});

test('provenance records are immutable by construction (no mutation path exists)', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const record = repo.recordProvenance({
    scope: { tenantId: tenantId('tenant-a') },
    id: provenanceRef('prov-1'),
    creationMethod: 'raw-capture',
    actor: { kind: 'identity', identityId: identityId('identity-9') },
    lineageRefs: [],
  });
  assert.ok(!('error' in record));

  // The port deliberately exposes NO update/delete for provenance — the only
  // way to "change" provenance is a brand-new record with a new identifier.
  const duplicate = repo.recordProvenance({
    scope: { tenantId: tenantId('tenant-a') },
    id: provenanceRef('prov-1'),
    creationMethod: 'raw-capture',
    actor: { kind: 'system' },
    lineageRefs: [],
  });
  assert.ok('error' in duplicate && duplicate.error === 'duplicate-provenance');

  // Fetched record is byte-identical to the created one and frozen.
  const fetched = repo.getProvenance(provenanceRef('prov-1'));
  assert.ok(fetched !== null);
  assert.deepEqual(fetched, record);
  assert.ok(Object.isFrozen(fetched));
  assert.throws(() => {
    (fetched as { recordedAt?: string }).recordedAt = '2020-01-01T00:00:00.000Z';
  }, /Cannot assign to read only property/);
});

test('tenant scoping: lists never leak cross-tenant existence', () => {
  const repo = createInMemoryRightsRepository();
  assert.ok(!('error' in repo.grantRights(grantInput({ tenant: 'tenant-a', id: 'g-a' }))));
  assert.ok(!('error' in repo.grantRights(grantInput({ tenant: 'tenant-b', id: 'g-b' }))));
  assert.ok(
    !('error' in repo.recordConsent({
      scope: { tenantId: tenantId('tenant-a') },
      id: consentRef('c-a'),
      participantRef: identityId('identity-9'),
      purpose: 'p',
      actions: ['use'],
      subjectRefs: ['capture://s'],
    })),
  );

  const tenantA = repo.listRightsGrants({ tenantId: tenantId('tenant-a') });
  const tenantB = repo.listRightsGrants({ tenantId: tenantId('tenant-b') });
  const unknown = repo.listRightsGrants({ tenantId: tenantId('tenant-unknown') });
  assert.deepEqual(tenantA.map((g) => g.id), [rightsRef('g-a')]);
  assert.deepEqual(tenantB.map((g) => g.id), [rightsRef('g-b')]);
  assert.deepEqual(unknown, []);
  assert.deepEqual(repo.listConsentRecords({ tenantId: tenantId('tenant-b') }), []);
});

test('records survive unchanged when other records in the tenant change', () => {
  const repo = createInMemoryRightsRepository({ now: createDeterministicClock() });
  const first = repo.grantRights(grantInput({ id: 'grant-1' }));
  if ('error' in first) {
    assert.fail(`unexpected repository error: ${first.error} — ${first.message}`);
  }
  const snapshot = { ...first };

  assert.ok(!('error' in repo.grantRights(grantInput({ id: 'grant-2' }))));
  assert.ok(
    !('error' in repo.revokeRights({ tenantId: tenantId('tenant-a') }, rightsRef('grant-2'))),
  );

  const refetched = repo.getRights(rightsRef('grant-1'));
  assert.ok(refetched !== null);
  assert.deepEqual(refetched, snapshot);
});
