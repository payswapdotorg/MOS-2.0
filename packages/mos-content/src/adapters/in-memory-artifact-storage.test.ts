import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryArtifactStorage } from './in-memory-artifact-storage.js';
import type { StorageRef } from '../contracts/artifact.js';
import type { TenantId } from '@mos/identity';

const tenantId = (value: string): TenantId => value as TenantId;
const storageRef = (value: string): StorageRef => value as StorageRef;

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decoder = new TextDecoder();

test('put returns a content-addressed storageRef + sha256 digest; get round-trips the bytes', async () => {
  const storage = createInMemoryArtifactStorage({ now: () => '2026-06-01T00:00:00.000Z' });
  const stored = await storage.put({
    scope: { tenantId: tenantId('tenant-a') },
    bytes: text('hello artifact'),
    contentType: 'text/plain',
  });
  if ('error' in stored) {
    assert.fail(`unexpected storage error: ${stored.error} — ${stored.message}`);
  }
  assert.match(stored.storageRef, /^mem:\/\/tenant-a\/sha256:[0-9a-f]{64}$/);
  assert.match(stored.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(stored.size, 'hello artifact'.length);
  assert.equal(stored.storedAt, '2026-06-01T00:00:00.000Z');

  const bytes = await storage.get({ tenantId: tenantId('tenant-a') }, stored.storageRef);
  if ('error' in bytes) {
    assert.fail(`unexpected storage error: ${bytes.error} — ${bytes.message}`);
  }
  assert.equal(decoder.decode(bytes), 'hello artifact');
});

test('put is idempotent for identical bytes in the same scope (same ref, first-write wins)', async () => {
  const storage = createInMemoryArtifactStorage({ now: () => '2026-06-01T00:00:00.000Z' });
  const first = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('same') });
  const second = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('same') });
  assert.ok(!('error' in first) && !('error' in second));
  assert.equal(first.storageRef, second.storageRef);
  assert.equal(first.digest, second.digest);
  assert.equal(first.storedAt, second.storedAt);

  // Different bytes → different content-addressed ref.
  const other = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('diff') });
  assert.ok(!('error' in other));
  assert.notEqual(other.storageRef, first.storageRef);
});

test('identical bytes in different tenants are distinct objects (tenant isolation)', async () => {
  const storage = createInMemoryArtifactStorage();
  const inA = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('shared') });
  const inB = await storage.put({ scope: { tenantId: tenantId('tenant-b') }, bytes: text('shared') });
  assert.ok(!('error' in inA) && !('error' in inB));
  assert.notEqual(inA.storageRef, inB.storageRef);

  const cross = await storage.get({ tenantId: tenantId('tenant-b') }, inA.storageRef);
  assert.ok('error' in cross && cross.error === 'cross-tenant-reference');
});

test('unknown refs are object-not-found; cross-tenant refs are denied', async () => {
  const storage = createInMemoryArtifactStorage();
  const stored = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('x') });
  assert.ok(!('error' in stored));

  const missing = await storage.get(
    { tenantId: tenantId('tenant-a') },
    storageRef('mem://tenant-a/sha256:' + 'ab'.repeat(32)),
  );
  assert.ok('error' in missing && missing.error === 'object-not-found');

  const foreign = await storage.get({ tenantId: tenantId('tenant-b') }, stored.storageRef);
  assert.ok('error' in foreign && foreign.error === 'cross-tenant-reference');
});

test('byte buffers are private copies in both directions', async () => {
  const storage = createInMemoryArtifactStorage();
  const input = text('mutable-input');
  const stored = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: input });
  assert.ok(!('error' in stored));

  // Mutating the input after put never affects stored content.
  input[0] = 88;
  const afterInputMutation = await storage.get({ tenantId: tenantId('tenant-a') }, stored.storageRef);
  assert.ok(!('error' in afterInputMutation));
  assert.equal(decoder.decode(afterInputMutation), 'mutable-input');

  // Mutating the returned copy never affects stored content.
  afterInputMutation[0] = 89;
  const again = await storage.get({ tenantId: tenantId('tenant-a') }, stored.storageRef);
  assert.ok(!('error' in again));
  assert.equal(decoder.decode(again), 'mutable-input');
});

test('empty or non-buffer bytes are invalid-input', async () => {
  const storage = createInMemoryArtifactStorage();
  const empty = await storage.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: new Uint8Array(0) });
  assert.ok('error' in empty && empty.error === 'invalid-input');
});

test('digests are deterministic across instances for identical bytes', async () => {
  const first = createInMemoryArtifactStorage();
  const second = createInMemoryArtifactStorage();
  const a = await first.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('determinism') });
  const b = await second.put({ scope: { tenantId: tenantId('tenant-a') }, bytes: text('determinism') });
  assert.ok(!('error' in a) && !('error' in b));
  assert.equal(a.digest, b.digest);
  assert.equal(a.storageRef, b.storageRef);
});
