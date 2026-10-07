import type { IdentityId } from './ids.js';

/** The kind of an identity principal. */
export type IdentityKind = 'user' | 'service';

/**
 * An identity principal — a human user or a service account.
 *
 * Deliberately NOT tenant-scoped: an identity is a global principal, and its
 * tenancy linkage is expressed through tenant-scoped {@link Membership}
 * records (one identity may hold memberships in several tenants/workspaces).
 */
export interface Identity {
  readonly id: IdentityId;
  /** Monotonic record version; starts at 1 and is bumped on every mutation. */
  readonly version: number;
  readonly displayName: string;
  readonly kind: IdentityKind;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last mutation (equal to `createdAt` until then). */
  readonly updatedAt: string;
}
