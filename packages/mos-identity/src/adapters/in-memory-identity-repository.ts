import type { Identity } from '../domain/identity.js';
import type { Membership } from '../domain/membership.js';
import type { Tenant } from '../domain/tenant.js';
import type { Workspace } from '../domain/workspace.js';
import type {
  CreateTenantInput,
  CreateWorkspaceInput,
  GrantMembershipInput,
  IdentityRepository,
  IdentityRepositoryError,
  IdentityRepositoryErrorCode,
  TenantScope,
  UpsertIdentityInput,
  WorkspaceScope,
} from '../ports/identity-repository.js';
import type { IdentityId, MembershipId, TenantId, WorkspaceId } from '../domain/ids.js';

/**
 * Options for {@link createInMemoryIdentityRepository}.
 *
 * `now` is injectable so tests (and future golden fixtures) get deterministic
 * timestamps; it defaults to real wall-clock ISO-8601 strings. The default
 * uses only ECMAScript globals — no Node builtin imports in runtime code.
 */
export interface InMemoryIdentityRepositoryOptions {
  readonly now?: () => string;
}

/**
 * Build an in-memory {@link IdentityRepository}.
 *
 * WAVE-0 GROUNDWORK DISCLOSURE: this adapter is an ephemeral, process-local
 * scaffold used to pin the domain model and the port contract. It is NOT
 * production persistence: no database, no migrations, no durability. The
 * central schema/migration story is owned by the Tech Lead, and a durable
 * adapter replaces this one in a later wave without touching the port.
 */
export function createInMemoryIdentityRepository(
  options: InMemoryIdentityRepositoryOptions = {},
): IdentityRepository {
  const now = options.now ?? (() => new Date().toISOString());

  const tenants = new Map<TenantId, Tenant>();
  const workspaces = new Map<WorkspaceId, Workspace>();
  const identities = new Map<IdentityId, Identity>();
  const memberships = new Map<MembershipId, Membership>();

  const fail = (error: IdentityRepositoryErrorCode, message: string): IdentityRepositoryError => ({
    error,
    message,
  });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  const activeMembershipFor = (
    workspaceId: WorkspaceId,
    identityId: IdentityId,
  ): Membership | undefined => {
    for (const membership of memberships.values()) {
      if (
        membership.workspaceId === workspaceId &&
        membership.identityId === identityId &&
        membership.revokedAt === null
      ) {
        return membership;
      }
    }
    return undefined;
  };

  const membershipsInWorkspace = (scope: WorkspaceScope): Membership[] => {
    const found: Membership[] = [];
    for (const membership of memberships.values()) {
      if (membership.tenantId === scope.tenantId && membership.workspaceId === scope.workspaceId) {
        found.push(membership);
      }
    }
    return found.sort((a, b) =>
      a.grantedAt === b.grantedAt ? compareStrings(a.id, b.id) : compareStrings(a.grantedAt, b.grantedAt),
    );
  };

  return {
    createTenant(input: CreateTenantInput): Tenant | IdentityRepositoryError {
      if (isBlank(input.name)) {
        return fail('invalid-input', 'tenant name must not be blank');
      }
      if (tenants.has(input.id)) {
        return fail('duplicate-tenant', `tenant already exists: ${input.id}`);
      }
      const timestamp = now();
      const tenant: Tenant = Object.freeze({
        id: input.id,
        version: 1,
        name: input.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      tenants.set(tenant.id, tenant);
      return tenant;
    },

    getTenant(id: TenantId): Tenant | null {
      return tenants.get(id) ?? null;
    },

    createWorkspace(input: CreateWorkspaceInput): Workspace | IdentityRepositoryError {
      if (isBlank(input.name)) {
        return fail('invalid-input', 'workspace name must not be blank');
      }
      if (!tenants.has(input.scope.tenantId)) {
        return fail('tenant-not-found', `tenant does not exist: ${input.scope.tenantId}`);
      }
      if (workspaces.has(input.id)) {
        return fail('duplicate-workspace', `workspace already exists: ${input.id}`);
      }
      const timestamp = now();
      const workspace: Workspace = Object.freeze({
        id: input.id,
        tenantId: input.scope.tenantId,
        version: 1,
        name: input.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      workspaces.set(workspace.id, workspace);
      return workspace;
    },

    listWorkspaces(scope: TenantScope): readonly Workspace[] {
      const found: Workspace[] = [];
      for (const workspace of workspaces.values()) {
        if (workspace.tenantId === scope.tenantId) {
          found.push(workspace);
        }
      }
      return found.sort((a, b) =>
        a.createdAt === b.createdAt ? compareStrings(a.id, b.id) : compareStrings(a.createdAt, b.createdAt),
      );
    },

    upsertIdentity(input: UpsertIdentityInput): Identity | IdentityRepositoryError {
      if (isBlank(input.displayName)) {
        return fail('invalid-input', 'identity displayName must not be blank');
      }
      const existing = identities.get(input.id);
      if (existing) {
        const updated: Identity = Object.freeze({
          id: existing.id,
          version: existing.version + 1,
          displayName: input.displayName,
          kind: input.kind,
          createdAt: existing.createdAt,
          updatedAt: now(),
        });
        identities.set(updated.id, updated);
        return updated;
      }
      const timestamp = now();
      const identity: Identity = Object.freeze({
        id: input.id,
        version: 1,
        displayName: input.displayName,
        kind: input.kind,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      identities.set(identity.id, identity);
      return identity;
    },

    getIdentity(id: IdentityId): Identity | null {
      return identities.get(id) ?? null;
    },

    grantMembership(input: GrantMembershipInput): Membership | IdentityRepositoryError {
      if (!tenants.has(input.scope.tenantId)) {
        return fail('tenant-not-found', `tenant does not exist: ${input.scope.tenantId}`);
      }
      const workspace = workspaces.get(input.workspaceId);
      if (!workspace) {
        return fail('workspace-not-found', `workspace does not exist: ${input.workspaceId}`);
      }
      if (workspace.tenantId !== input.scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `workspace ${input.workspaceId} does not belong to tenant ${input.scope.tenantId}`,
        );
      }
      if (!identities.has(input.identityId)) {
        return fail('identity-not-found', `identity does not exist: ${input.identityId}`);
      }
      if (memberships.has(input.id)) {
        return fail('duplicate-membership', `membership already exists: ${input.id}`);
      }
      const active = activeMembershipFor(input.workspaceId, input.identityId);
      if (active) {
        return fail(
          'duplicate-membership',
          `identity ${input.identityId} already holds active membership ${active.id} in workspace ${input.workspaceId}`,
        );
      }
      const membership: Membership = Object.freeze({
        id: input.id,
        tenantId: input.scope.tenantId,
        version: 1,
        workspaceId: input.workspaceId,
        identityId: input.identityId,
        role: input.role,
        grantedAt: now(),
        revokedAt: null,
      });
      memberships.set(membership.id, membership);
      return membership;
    },

    listMemberships(scope: WorkspaceScope): readonly Membership[] {
      return membershipsInWorkspace(scope);
    },

    revokeMembership(scope: TenantScope, id: MembershipId): Membership | IdentityRepositoryError {
      const membership = memberships.get(id);
      if (!membership) {
        return fail('membership-not-found', `membership does not exist: ${id}`);
      }
      if (membership.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `membership ${id} does not belong to tenant ${scope.tenantId}`,
        );
      }
      if (membership.revokedAt !== null) {
        return fail(
          'membership-already-revoked',
          `membership ${id} was already revoked at ${membership.revokedAt}`,
        );
      }
      const revoked: Membership = Object.freeze({
        ...membership,
        version: membership.version + 1,
        revokedAt: now(),
      });
      memberships.set(revoked.id, revoked);
      return revoked;
    },
  };
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
