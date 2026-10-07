import type { TenantScope } from '@mos/contracts';
import type { Identity, IdentityKind } from '../domain/identity.js';
import type { IdentityId, MembershipId, TenantId, WorkspaceId } from '../domain/ids.js';
import type { Membership, MembershipRole } from '../domain/membership.js';
import type { Tenant } from '../domain/tenant.js';
import type { Workspace } from '../domain/workspace.js';

// Re-exported so consumers importing the scope vocabulary from this package
// keep resolving (W2-A / RECONCILE-A: @mos/contracts is the canonical home).
export type { TenantScope };

/**
 * Repository port for the MOS identity domain (CORE-002 groundwork).
 *
 * Scope objects are passed explicitly on every call — there is no ambient
 * "current tenant" anywhere in the package (architecture policy:
 * `requireTenantScopeOnMutableArtifacts`).
 *
 * Failure model: mutating operations return either the resulting record or a
 * typed {@link IdentityRepositoryError} value (result union, no thrown
 * subclasses). This keeps the package public surface at exactly one runtime
 * export (`createInMemoryIdentityRepository`) plus types, per the Wave-0
 * assignment. Read operations use plain `null` / empty-array misses.
 *
 * Identifier allocation is caller-driven: every create/upsert/grant input
 * carries the caller-supplied branded identifier. The port therefore needs no
 * id generator, clock, or any other ambient service.
 */
export interface IdentityRepository {
  /** Create a tenant. Fails with `duplicate-tenant` if the id already exists. */
  createTenant(input: CreateTenantInput): Tenant | IdentityRepositoryError;

  /** Fetch a tenant by id, or `null` when unknown. */
  getTenant(id: TenantId): Tenant | null;

  /**
   * Create a workspace inside the tenant named by `scope`.
   * Fails with `tenant-not-found` or `duplicate-workspace`.
   */
  createWorkspace(input: CreateWorkspaceInput): Workspace | IdentityRepositoryError;

  /**
   * List the workspaces visible in a tenant scope. Returns an empty array for
   * an unknown tenant scope (queries never leak existence).
   */
  listWorkspaces(scope: TenantScope): readonly Workspace[];

  /**
   * Create or update an identity principal. Updating bumps `version` and
   * `updatedAt` and preserves `createdAt`. Identities are global (not
   * tenant-scoped); tenancy linkage happens through memberships.
   */
  upsertIdentity(input: UpsertIdentityInput): Identity | IdentityRepositoryError;

  /** Fetch an identity by id, or `null` when unknown. */
  getIdentity(id: IdentityId): Identity | null;

  /**
   * Grant a workspace membership. Fails with `tenant-not-found`,
   * `workspace-not-found`, `identity-not-found`, `cross-tenant-reference` or
   * `duplicate-membership` (id collision, or an active membership already
   * exists for the identity in that workspace).
   */
  grantMembership(input: GrantMembershipInput): Membership | IdentityRepositoryError;

  /**
   * List the memberships visible in a workspace scope, both active and
   * revoked (append-only history). Returns an empty array when nothing is
   * visible under the scope (queries never leak cross-tenant existence).
   */
  listMemberships(scope: WorkspaceScope): readonly Membership[];

  /**
   * Revoke a membership (append-only): sets `revokedAt` and bumps `version`;
   * the record is never deleted. Fails with `membership-not-found`,
   * `cross-tenant-reference` or `membership-already-revoked`.
   */
  revokeMembership(scope: TenantScope, id: MembershipId): Membership | IdentityRepositoryError;
}

/** Workspace scope: tenant + workspace, for membership listing. */
export interface WorkspaceScope extends TenantScope {
  readonly workspaceId: WorkspaceId;
}

export interface CreateTenantInput {
  readonly id: TenantId;
  readonly name: string;
}

export interface CreateWorkspaceInput {
  readonly scope: TenantScope;
  readonly id: WorkspaceId;
  readonly name: string;
}

export interface UpsertIdentityInput {
  readonly id: IdentityId;
  readonly displayName: string;
  readonly kind: IdentityKind;
}

export interface GrantMembershipInput {
  readonly scope: TenantScope;
  readonly id: MembershipId;
  readonly workspaceId: WorkspaceId;
  readonly identityId: IdentityId;
  readonly role: MembershipRole;
}

/** Machine-readable failure codes returned by mutating operations. */
export type IdentityRepositoryErrorCode =
  | 'invalid-input'
  | 'tenant-not-found'
  | 'duplicate-tenant'
  | 'duplicate-workspace'
  | 'identity-not-found'
  | 'workspace-not-found'
  | 'duplicate-membership'
  | 'membership-not-found'
  | 'membership-already-revoked'
  | 'cross-tenant-reference';

/**
 * Typed failure value. Use `'error' in result` to discriminate against the
 * success record (success records never carry an `error` field).
 */
export interface IdentityRepositoryError {
  readonly error: IdentityRepositoryErrorCode;
  readonly message: string;
}
