import type { TenantId, WorkspaceId } from './ids.js';

/**
 * A workspace — the collaboration container inside a tenant.
 *
 * Tenant-scoped by requirement: `tenantId` is carried explicitly on every
 * mutable record so no ambient-tenant context is ever needed.
 */
export interface Workspace {
  readonly id: WorkspaceId;
  readonly tenantId: TenantId;
  /** Monotonic record version; starts at 1 and is bumped on every mutation. */
  readonly version: number;
  readonly name: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last mutation (equal to `createdAt` until then). */
  readonly updatedAt: string;
}
