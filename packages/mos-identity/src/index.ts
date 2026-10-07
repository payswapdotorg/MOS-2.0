/**
 * Public surface of `@mos/identity` (MOS v2.0 CORE-002 Wave-0 groundwork).
 *
 * Per the Wave-0 assignment this entry point exports ONLY the domain/port
 * types plus the single runtime factory `createInMemoryIdentityRepository`.
 * No helper constructors, error classes, or internals are exposed; everything
 * else is an implementation detail reachable only within this package.
 */

export type { Identity, IdentityKind } from './domain/identity.js';
export type {
  IdentityId,
  MembershipId,
  TenantId,
  WorkspaceId,
} from './domain/ids.js';
export type { Membership, MembershipRole } from './domain/membership.js';
export type { Tenant } from './domain/tenant.js';
export type { Workspace } from './domain/workspace.js';
export type {
  CreateTenantInput,
  CreateWorkspaceInput,
  GrantMembershipInput,
  IdentityRepository,
  IdentityRepositoryError,
  IdentityRepositoryErrorCode,
  TenantScope,
  UpsertIdentityInput,
  WorkspaceScope,
} from './ports/identity-repository.js';
export type { InMemoryIdentityRepositoryOptions } from './adapters/in-memory-identity-repository.js';

export { createInMemoryIdentityRepository } from './adapters/in-memory-identity-repository.js';
