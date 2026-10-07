import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryIdentityRepository } from '../adapters/in-memory-identity-repository.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { IdentityId, MembershipId, TenantId, WorkspaceId } from './ids.js';

const tenantId = (value: string): TenantId => value as TenantId;
const workspaceId = (value: string): WorkspaceId => value as WorkspaceId;
const identityId = (value: string): IdentityId => value as IdentityId;
const membershipId = (value: string): MembershipId => value as MembershipId;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

const seedTenantAndWorkspace = (
  repo: IdentityRepository,
  tenant: string,
  workspace: string,
): { tenant: TenantId; workspace: WorkspaceId } => {
  const createdTenant = repo.createTenant({ id: tenantId(tenant), name: tenant });
  if ('error' in createdTenant) {
    throw new Error(`seed failure: ${createdTenant.error} — ${createdTenant.message}`);
  }
  const createdWorkspace = repo.createWorkspace({
    scope: { tenantId: createdTenant.id },
    id: workspaceId(workspace),
    name: workspace,
  });
  if ('error' in createdWorkspace) {
    throw new Error(`seed failure: ${createdWorkspace.error} — ${createdWorkspace.message}`);
  }
  return { tenant: createdTenant.id, workspace: createdWorkspace.id };
};

test('grantMembership returns a tenant-scoped active membership', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });
  const scope = seedTenantAndWorkspace(repo, 'tenant-a', 'workspace-a1');
  const principal = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada',
    kind: 'user',
  });
  if ('error' in principal) {
    assert.fail(`unexpected repository error: ${principal.error} — ${principal.message}`);
  }

  const granted = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-1'),
    workspaceId: scope.workspace,
    identityId: principal.id,
    role: 'owner',
  });
  if ('error' in granted) {
    assert.fail(`unexpected repository error: ${granted.error} — ${granted.message}`);
  }
  assert.equal(granted.id, 'membership-1');
  assert.equal(granted.tenantId, scope.tenant);
  assert.equal(granted.workspaceId, scope.workspace);
  assert.equal(granted.identityId, 'identity-1');
  assert.equal(granted.role, 'owner');
  assert.equal(granted.version, 1);
  // Clock ticks: createTenant=00:00:00, createWorkspace=00:00:01,
  // upsertIdentity=00:00:02, grantMembership=00:00:03.
  assert.equal(granted.grantedAt, '2026-01-01T00:00:03.000Z');
  assert.equal(granted.revokedAt, null);
});

test('grantMembership requires an existing workspace', () => {
  const repo = createInMemoryIdentityRepository();
  const scope = seedTenantAndWorkspace(repo, 'tenant-a', 'workspace-a1');
  const principal = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada',
    kind: 'user',
  });
  if ('error' in principal) {
    assert.fail(`unexpected repository error: ${principal.error} — ${principal.message}`);
  }

  const missing = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-1'),
    workspaceId: workspaceId('ghost-workspace'),
    identityId: principal.id,
    role: 'collaborator',
  });
  if (!('error' in missing)) {
    assert.fail('expected workspace-not-found error');
  }
  assert.equal(missing.error, 'workspace-not-found');
});

test('grantMembership requires an existing identity', () => {
  const repo = createInMemoryIdentityRepository();
  const scope = seedTenantAndWorkspace(repo, 'tenant-a', 'workspace-a1');

  const missing = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-1'),
    workspaceId: scope.workspace,
    identityId: identityId('ghost-identity'),
    role: 'service',
  });
  if (!('error' in missing)) {
    assert.fail('expected identity-not-found error');
  }
  assert.equal(missing.error, 'identity-not-found');
});

test('grantMembership refuses a duplicate membership identifier', () => {
  const repo = createInMemoryIdentityRepository();
  const scope = seedTenantAndWorkspace(repo, 'tenant-a', 'workspace-a1');
  const firstIdentity = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada',
    kind: 'user',
  });
  if ('error' in firstIdentity) {
    assert.fail(`unexpected repository error: ${firstIdentity.error} — ${firstIdentity.message}`);
  }
  const secondIdentity = repo.upsertIdentity({
    id: identityId('identity-2'),
    displayName: 'Grace',
    kind: 'user',
  });
  if ('error' in secondIdentity) {
    assert.fail(`unexpected repository error: ${secondIdentity.error} — ${secondIdentity.message}`);
  }

  const first = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-1'),
    workspaceId: scope.workspace,
    identityId: firstIdentity.id,
    role: 'owner',
  });
  if ('error' in first) {
    assert.fail(`unexpected repository error: ${first.error} — ${first.message}`);
  }

  const duplicate = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-1'),
    workspaceId: scope.workspace,
    identityId: secondIdentity.id,
    role: 'collaborator',
  });
  if (!('error' in duplicate)) {
    assert.fail('expected duplicate-membership error');
  }
  assert.equal(duplicate.error, 'duplicate-membership');
});

test('grantMembership refuses a second active membership for the same identity and workspace', () => {
  const repo = createInMemoryIdentityRepository();
  const scope = seedTenantAndWorkspace(repo, 'tenant-a', 'workspace-a1');
  const principal = repo.upsertIdentity({
    id: identityId('identity-1'),
    displayName: 'Ada',
    kind: 'user',
  });
  if ('error' in principal) {
    assert.fail(`unexpected repository error: ${principal.error} — ${principal.message}`);
  }
  const first = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-1'),
    workspaceId: scope.workspace,
    identityId: principal.id,
    role: 'owner',
  });
  if ('error' in first) {
    assert.fail(`unexpected repository error: ${first.error} — ${first.message}`);
  }

  const duplicate = repo.grantMembership({
    scope: { tenantId: scope.tenant },
    id: membershipId('membership-2'),
    workspaceId: scope.workspace,
    identityId: principal.id,
    role: 'collaborator',
  });
  if (!('error' in duplicate)) {
    assert.fail('expected duplicate-membership error');
  }
  assert.equal(duplicate.error, 'duplicate-membership');
});
