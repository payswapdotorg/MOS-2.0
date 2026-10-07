import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryIdentityRepository } from './in-memory-identity-repository.js';
import type { IdentityId, MembershipId, TenantId, WorkspaceId } from '../domain/ids.js';
import type { Membership } from '../domain/membership.js';
import type { IdentityRepositoryError } from '../ports/identity-repository.js';

const tenantId = (value: string): TenantId => value as TenantId;
const workspaceId = (value: string): WorkspaceId => value as WorkspaceId;
const identityId = (value: string): IdentityId => value as IdentityId;
const membershipId = (value: string): MembershipId => value as MembershipId;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

const mustSucceed = <T extends object>(result: T | IdentityRepositoryError, label: string): T => {
  if ('error' in result) {
    const failure = result as IdentityRepositoryError;
    assert.fail(`${label}: unexpected repository error ${failure.error} — ${failure.message}`);
  }
  return result;
};

test('CRUD round-trips across tenants, workspaces, identities and memberships', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });

  // Tenants
  const tenantA = mustSucceed(
    repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' }),
    'createTenant(a)',
  );
  const tenantB = mustSucceed(
    repo.createTenant({ id: tenantId('tenant-b'), name: 'Tenant B' }),
    'createTenant(b)',
  );
  assert.deepEqual(repo.getTenant(tenantId('tenant-a')), tenantA);
  assert.deepEqual(repo.getTenant(tenantId('tenant-b')), tenantB);

  // Workspaces
  const workspaceA1 = mustSucceed(
    repo.createWorkspace({ scope: { tenantId: tenantA.id }, id: workspaceId('ws-a1'), name: 'A1' }),
    'createWorkspace(a1)',
  );
  const workspaceB1 = mustSucceed(
    repo.createWorkspace({ scope: { tenantId: tenantB.id }, id: workspaceId('ws-b1'), name: 'B1' }),
    'createWorkspace(b1)',
  );
  assert.equal(repo.listWorkspaces({ tenantId: tenantA.id }).length, 1);
  assert.equal(repo.listWorkspaces({ tenantId: tenantA.id })[0]?.id, workspaceA1.id);
  assert.equal(repo.listWorkspaces({ tenantId: tenantB.id })[0]?.id, workspaceB1.id);

  // Identities
  const user = mustSucceed(
    repo.upsertIdentity({ id: identityId('identity-user'), displayName: 'Ada', kind: 'user' }),
    'upsertIdentity(user)',
  );
  assert.deepEqual(repo.getIdentity(identityId('identity-user')), user);
  assert.equal(repo.getIdentity(identityId('identity-none')), null);

  // Memberships
  const membership = mustSucceed(
    repo.grantMembership({
      scope: { tenantId: tenantA.id },
      id: membershipId('membership-1'),
      workspaceId: workspaceA1.id,
      identityId: user.id,
      role: 'owner',
    }),
    'grantMembership(1)',
  );
  const listed = repo.listMemberships({ tenantId: tenantA.id, workspaceId: workspaceA1.id });
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], membership);
});

test('tenant isolation: tenant B cannot see tenant A workspaces or memberships', () => {
  const repo = createInMemoryIdentityRepository();
  const tenantA = mustSucceed(
    repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' }),
    'createTenant(a)',
  );
  const tenantB = mustSucceed(
    repo.createTenant({ id: tenantId('tenant-b'), name: 'Tenant B' }),
    'createTenant(b)',
  );
  const workspaceA1 = mustSucceed(
    repo.createWorkspace({ scope: { tenantId: tenantA.id }, id: workspaceId('ws-a1'), name: 'Shared Name' }),
    'createWorkspace(a1)',
  );
  // Same workspace name is allowed in the other tenant — names are scoped.
  mustSucceed(
    repo.createWorkspace({ scope: { tenantId: tenantB.id }, id: workspaceId('ws-b1'), name: 'Shared Name' }),
    'createWorkspace(b1)',
  );
  const user = mustSucceed(
    repo.upsertIdentity({ id: identityId('identity-user'), displayName: 'Ada', kind: 'user' }),
    'upsertIdentity(user)',
  );
  mustSucceed(
    repo.grantMembership({
      scope: { tenantId: tenantA.id },
      id: membershipId('membership-1'),
      workspaceId: workspaceA1.id,
      identityId: user.id,
      role: 'owner',
    }),
    'grantMembership(1)',
  );

  // Workspace listing is scoped per tenant.
  assert.deepEqual(
    repo.listWorkspaces({ tenantId: tenantB.id }).map((workspace) => workspace.id),
    ['ws-b1'],
  );
  // A cross-tenant workspace scope lists nothing — no existence leak.
  assert.deepEqual(repo.listMemberships({ tenantId: tenantB.id, workspaceId: workspaceA1.id }), []);

  // Command-level cross-tenant references are denied explicitly.
  const grantDenied = repo.grantMembership({
    scope: { tenantId: tenantB.id },
    id: membershipId('membership-x'),
    workspaceId: workspaceA1.id,
    identityId: user.id,
    role: 'collaborator',
  });
  if (!('error' in grantDenied)) {
    assert.fail('expected cross-tenant-reference error for grant');
  }
  assert.equal(grantDenied.error, 'cross-tenant-reference');

  const revokeDenied = repo.revokeMembership({ tenantId: tenantB.id }, membershipId('membership-1'));
  if (!('error' in revokeDenied)) {
    assert.fail('expected cross-tenant-reference error for revoke');
  }
  assert.equal(revokeDenied.error, 'cross-tenant-reference');

  // The denied operations changed nothing for tenant A.
  const survivors = repo.listMemberships({ tenantId: tenantA.id, workspaceId: workspaceA1.id });
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0]?.revokedAt, null);
});

test('membership revocation is append-only: revoked records stay and re-grants create new records', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });
  const tenant = mustSucceed(
    repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' }),
    'createTenant(a)',
  );
  const workspace = mustSucceed(
    repo.createWorkspace({ scope: { tenantId: tenant.id }, id: workspaceId('ws-a1'), name: 'A1' }),
    'createWorkspace(a1)',
  );
  const user = mustSucceed(
    repo.upsertIdentity({ id: identityId('identity-user'), displayName: 'Ada', kind: 'user' }),
    'upsertIdentity(user)',
  );
  const granted = mustSucceed(
    repo.grantMembership({
      scope: { tenantId: tenant.id },
      id: membershipId('membership-1'),
      workspaceId: workspace.id,
      identityId: user.id,
      role: 'collaborator',
    }),
    'grantMembership(1)',
  );
  assert.equal(granted.version, 1);
  assert.equal(granted.revokedAt, null);

  // Revoke: sets revokedAt and bumps the version; never deletes.
  // Clock ticks so far: createTenant=00:00:00, createWorkspace=00:00:01,
  // upsertIdentity=00:00:02, grantMembership=00:00:03, revoke=00:00:04.
  const revoked = mustSucceed(
    repo.revokeMembership({ tenantId: tenant.id }, granted.id),
    'revokeMembership(1)',
  );
  assert.equal(revoked.id, granted.id);
  assert.equal(revoked.version, granted.version + 1);
  assert.equal(revoked.grantedAt, granted.grantedAt);
  assert.equal(revoked.revokedAt, '2026-01-01T00:00:04.000Z');

  // The revoked record remains visible in the workspace history.
  const historyAfterRevoke = repo.listMemberships({
    tenantId: tenant.id,
    workspaceId: workspace.id,
  });
  assert.equal(historyAfterRevoke.length, 1);
  assert.equal(historyAfterRevoke[0]?.revokedAt, '2026-01-01T00:00:04.000Z');

  // Revoking twice is an error — no silent rewrites of history.
  const doubleRevoke = repo.revokeMembership({ tenantId: tenant.id }, granted.id);
  if (!('error' in doubleRevoke)) {
    assert.fail('expected membership-already-revoked error');
  }
  assert.equal(doubleRevoke.error, 'membership-already-revoked');

  // Revoking an unknown membership is an error.
  const missing = repo.revokeMembership({ tenantId: tenant.id }, membershipId('ghost'));
  if (!('error' in missing)) {
    assert.fail('expected membership-not-found error');
  }
  assert.equal(missing.error, 'membership-not-found');

  // Re-granting creates a NEW membership record; the revoked one is untouched.
  const regranted = mustSucceed(
    repo.grantMembership({
      scope: { tenantId: tenant.id },
      id: membershipId('membership-2'),
      workspaceId: workspace.id,
      identityId: user.id,
      role: 'owner',
    }),
    'grantMembership(2)',
  );
  assert.notEqual(regranted.id, granted.id);
  assert.equal(regranted.version, 1);
  assert.equal(regranted.revokedAt, null);

  const fullHistory: readonly Membership[] = repo.listMemberships({
    tenantId: tenant.id,
    workspaceId: workspace.id,
  });
  assert.equal(fullHistory.length, 2);
  assert.deepEqual(fullHistory.map((m) => m.id), ['membership-1', 'membership-2']);
  const [first, second] = fullHistory;
  assert.ok(first && first.revokedAt !== null, 'first (revoked) record must carry revokedAt');
  assert.ok(second && second.revokedAt === null, 'second (re-granted) record must be active');
});

test('version bumps on every mutating update', () => {
  const repo = createInMemoryIdentityRepository({ now: createDeterministicClock() });
  const tenant = mustSucceed(
    repo.createTenant({ id: tenantId('tenant-a'), name: 'Tenant A' }),
    'createTenant(a)',
  );
  const workspace = mustSucceed(
    repo.createWorkspace({ scope: { tenantId: tenant.id }, id: workspaceId('ws-a1'), name: 'A1' }),
    'createWorkspace(a1)',
  );
  const user = mustSucceed(
    repo.upsertIdentity({ id: identityId('identity-user'), displayName: 'Ada', kind: 'user' }),
    'upsertIdentity(user)',
  );

  // Identity upserts bump the version monotonically.
  const v1 = repo.getIdentity(user.id);
  assert.equal(v1?.version, 1);
  const renamed = mustSucceed(
    repo.upsertIdentity({ id: user.id, displayName: 'Ada Lovelace', kind: 'user' }),
    'upsertIdentity(2)',
  );
  assert.equal(renamed.version, 2);
  const renamedAgain = mustSucceed(
    repo.upsertIdentity({ id: user.id, displayName: 'Ada King', kind: 'user' }),
    'upsertIdentity(3)',
  );
  assert.equal(renamedAgain.version, 3);

  // Membership revocation bumps the version of the membership record.
  const granted = mustSucceed(
    repo.grantMembership({
      scope: { tenantId: tenant.id },
      id: membershipId('membership-1'),
      workspaceId: workspace.id,
      identityId: user.id,
      role: 'collaborator',
    }),
    'grantMembership(1)',
  );
  assert.equal(granted.version, 1);
  const revoked = mustSucceed(
    repo.revokeMembership({ tenantId: tenant.id }, granted.id),
    'revokeMembership(1)',
  );
  assert.equal(revoked.version, 2);
});
