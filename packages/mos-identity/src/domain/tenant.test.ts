import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryIdentityRepository } from '../adapters/in-memory-identity-repository.js';
import type { TenantId } from './ids.js';

const tenantId = (value: string): TenantId => value as TenantId;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

test('createTenant returns a version-1 tenant with stable timestamps', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });

  const created = repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  assert.equal(created.id, 'tenant-a');
  assert.equal(created.name, 'Tenant A');
  assert.equal(created.version, 1);
  assert.equal(created.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(created.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('createTenant round-trips through getTenant', () => {
  const repo = createInMemoryIdentityRepository();

  const created = repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  const fetched = repo.getTenant(tenantId('tenant-a'));
  assert.deepEqual(fetched, created);
});

test('getTenant returns null for an unknown tenant', () => {
  const repo = createInMemoryIdentityRepository();
  assert.equal(repo.getTenant(tenantId('nope')), null);
});

test('createTenant rejects a duplicate identifier', () => {
  const repo = createInMemoryIdentityRepository();
  const first = repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' });
  if ('error' in first) {
    assert.fail(`unexpected repository error: ${first.error} — ${first.message}`);
  }

  const duplicate = repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A again' });
  if (!('error' in duplicate)) {
    assert.fail('expected duplicate-tenant error');
  }
  assert.equal(duplicate.error, 'duplicate-tenant');
});

test('createTenant rejects a blank name', () => {
  const repo = createInMemoryIdentityRepository();
  const blank = repo.createTenant({ id: tenantId('tenant-a'), name: '   ' });
  if (!('error' in blank)) {
    assert.fail('expected invalid-input error');
  }
  assert.equal(blank.error, 'invalid-input');
});

test('tenant records are immutable at runtime', () => {
  const repo = createInMemoryIdentityRepository();
  const created = repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  assert.throws(() => {
    (created as { name: string }).name = 'mutated';
  }, TypeError);
});
