import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryIdentityRepository } from '../adapters/in-memory-identity-repository.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { TenantId, WorkspaceId } from './ids.js';

const tenantId = (value: string): TenantId => value as TenantId;
const workspaceId = (value: string): WorkspaceId => value as WorkspaceId;

const seedTenant = (repo: IdentityRepository, id: string, name: string): TenantId => {
  const created = repo.createTenant({ id: tenantId(id), name });
  if ('error' in created) {
    throw new Error(`failed to seed tenant: ${created.error} — ${created.message}`);
  }
  return created.id;
};

test('createWorkspace returns a tenant-scoped version-1 workspace', () => {
  const repo = createInMemoryIdentityRepository();
  const tenant = seedTenant(repo, 'tenant-a', 'Tenant A');

  const created = repo.createWorkspace({
    scope: { tenantId: tenant },
    id: workspaceId('workspace-a1'),
    name: 'Workspace A1',
  });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }
  assert.equal(created.id, 'workspace-a1');
  assert.equal(created.tenantId, tenant);
  assert.equal(created.version, 1);
  assert.equal(created.name, 'Workspace A1');
  assert.equal(created.createdAt, created.updatedAt);
});

test('createWorkspace requires an existing tenant', () => {
  const repo = createInMemoryIdentityRepository();

  const missing = repo.createWorkspace({
    scope: { tenantId: tenantId('ghost') },
    id: workspaceId('workspace-g1'),
    name: 'Ghost Workspace',
  });
  if (!('error' in missing)) {
    assert.fail('expected tenant-not-found error');
  }
  assert.equal(missing.error, 'tenant-not-found');
});

test('createWorkspace rejects a duplicate identifier', () => {
  const repo = createInMemoryIdentityRepository();
  const tenant = seedTenant(repo, 'tenant-a', 'Tenant A');

  const first = repo.createWorkspace({
    scope: { tenantId: tenant },
    id: workspaceId('workspace-a1'),
    name: 'Workspace A1',
  });
  if ('error' in first) {
    assert.fail(`unexpected repository error: ${first.error} — ${first.message}`);
  }

  const duplicate = repo.createWorkspace({
    scope: { tenantId: tenant },
    id: workspaceId('workspace-a1'),
    name: 'Different name, same id',
  });
  if (!('error' in duplicate)) {
    assert.fail('expected duplicate-workspace error');
  }
  assert.equal(duplicate.error, 'duplicate-workspace');
});

test('listWorkspaces returns only the workspaces of the requested tenant', () => {
  const repo = createInMemoryIdentityRepository();
  const tenantA = seedTenant(repo, 'tenant-a', 'Tenant A');
  const tenantB = seedTenant(repo, 'tenant-b', 'Tenant B');

  for (const id of ['workspace-a1', 'workspace-a2']) {
    const created = repo.createWorkspace({ scope: { tenantId: tenantA }, id: workspaceId(id), name: id });
    if ('error' in created) {
      assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
    }
  }
  const createdB = repo.createWorkspace({
    scope: { tenantId: tenantB },
    id: workspaceId('workspace-b1'),
    name: 'workspace-b1',
  });
  if ('error' in createdB) {
    assert.fail(`unexpected repository error: ${createdB.error} — ${createdB.message}`);
  }

  const visibleA = repo.listWorkspaces({ tenantId: tenantA });
  assert.deepEqual(
    visibleA.map((workspace) => workspace.id),
    ['workspace-a1', 'workspace-a2'],
  );

  const visibleB = repo.listWorkspaces({ tenantId: tenantB });
  assert.deepEqual(
    visibleB.map((workspace) => workspace.id),
    ['workspace-b1'],
  );
});

test('listWorkspaces returns an empty array for an unknown tenant scope', () => {
  const repo = createInMemoryIdentityRepository();
  const tenant = seedTenant(repo, 'tenant-a', 'Tenant A');
  const created = repo.createWorkspace({
    scope: { tenantId: tenant },
    id: workspaceId('workspace-a1'),
    name: 'Workspace A1',
  });
  if ('error' in created) {
    assert.fail(`unexpected repository error: ${created.error} — ${created.message}`);
  }

  assert.deepEqual(repo.listWorkspaces({ tenantId: tenantId('ghost') }), []);
});
