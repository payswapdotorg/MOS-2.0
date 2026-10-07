import type { IdentityId, MembershipId, TenantId, WorkspaceId } from './ids.js';

/** The role an identity holds inside a workspace. */
export type MembershipRole = 'owner' | 'collaborator' | 'service';

/**
 * A workspace membership granted to an identity.
 *
 * Append-only revocation (architecture policy:
 * `requireAppendOnlyHistoryWhereDeclared`): a revocation sets `revokedAt` and
 * bumps `version`; the record is never deleted. Re-granting after a
 * revocation creates a NEW membership record with a new identifier, so the
 * grant/revoke history stays auditable.
 *
 * Tenant-scoped by requirement: `tenantId` is carried explicitly.
 */
export interface Membership {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  /** Monotonic record version; starts at 1, bumped on revocation. */
  readonly version: number;
  readonly workspaceId: WorkspaceId;
  readonly identityId: IdentityId;
  readonly role: MembershipRole;
  /** ISO-8601 timestamp of the grant. */
  readonly grantedAt: string;
  /** ISO-8601 timestamp of the revocation, or `null` while the membership is active. */
  readonly revokedAt: string | null;
}
