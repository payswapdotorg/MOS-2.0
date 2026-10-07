import type { TenantId } from './ids.js';

/**
 * A tenant — the mandatory scoping root for all mutable MOS state
 * (architecture policy: `requireTenantScopeOnMutableArtifacts`).
 *
 * The tenant record itself is the scope, so it carries no `tenantId` field.
 * All timestamps are ISO-8601 strings so records serialize losslessly across
 * the future `@mos/contracts` wire contracts.
 */
export interface Tenant {
  readonly id: TenantId;
  /** Monotonic record version; starts at 1 and is bumped on every mutation. */
  readonly version: number;
  readonly name: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last mutation (equal to `createdAt` until then). */
  readonly updatedAt: string;
}
