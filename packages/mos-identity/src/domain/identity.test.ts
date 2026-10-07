import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryIdentityRepository } from '../adapters/in-memory-identity-repository.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { IdentityId } from './ids.js';

const identityId = (value: string): IdentityId => value as IdentityId;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

test('upsertIdentity creates a version-1 identity', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });

  const created = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada Lovelace',
    kind: 'user',
  });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  assert.equal(created.id, 'identity-1');
  assert.equal(created.displayName, 'Ada Lovelace');
  assert.equal(created.kind, 'user');
  assert.equal(created.version, 1);
  assert.equal(created.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(created.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('upsertIdentity round-trips through getIdentity', () => {
  const repo = createInMemoryIdentityRepository();

  const created = repo.upsertIdentity({
    id: identityId('svc-1'),
    displayName: 'Indexer',
    kind: 'service',
  });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  assert.deepEqual(repo.getIdentity(identityId('svc-1')), created);
  assert.equal(repo.getIdentity(identityId('missing')), null);
});

test('upsertIdentity bumps version and preserves createdAt on update', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });

  const first = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada',
    kind: 'user',
  });
  if ('error' in first) {
    assert.fail(`unexpected repository error: ${first.error} — ${first.message}`);
  }

  const second = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada Lovelace',
    kind: 'user',
  });
  if ('error' in second) {
    assert.fail(`unexpected repository error: ${second.error} — ${second.message}`);
  }
  assert.equal(second.version, 2);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.updatedAt, '2026-01-01T00:00:01.000Z');
  assert.notEqual(second.updatedAt, second.createdAt);

  const third = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada King',
    kind: 'user',
  });
  if ('error' in third) {
    assert.fail(`unexpected repository error: ${third.error} — ${third.message}`);
  }
  assert.equal(third.version, 3);
  assert.equal(third.displayName, 'Ada King');

  // The stored record is the latest version only — identities are not
  // append-only, they are versioned current-state records.
  const stored = repo.getIdentity(identityId('identity-1'));
  assert.equal(stored?.version, 3);
});

test('upsertIdentity can change the kind of an existing identity', () => {
  const repo: IdentityRepository = createInMemoryIdentityRepository();

  const created = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Bot',
    kind: 'user',
  });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  const promoted = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Bot',
    kind: 'service',
  });
  if ('error' in promoted) {
    assert.fail(`unexpected repository error: ${promoted.error} — ${promoted.message}`);
  }
  assert.equal(promoted.kind, 'service');
  assert.equal(promoted.version, created.version + 1);
});

test('upsertIdentity rejects a blank displayName', () => {
  const repo = createInMemoryIdentityRepository();
  const blank = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: '  ',
    kind: 'user',
  });
  if (!('error' in blank)) {
    assert.fail('expected invalid-input error');
  }
  assert.equal(blank.error, 'invalid-input');
});
