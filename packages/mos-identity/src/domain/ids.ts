/**
 * Branded nominal identifier types for the MOS identity domain.
 *
 * RECONCILED (W2-A / RECONCILE-A): the shared `TenantId` and `WorkspaceId`
 * brands are imported from `@mos/contracts` (CORE-001 — the canonical
 * cross-package authority for the shared value-type vocabulary) and
 * re-exported here so existing import sites keep resolving unchanged.
 *
 * `IdentityId` and `MembershipId` are identity-owned record identifiers with
 * no `@mos/contracts` equivalent (contracts models identity principals only
 * as the opaque `IdentityRef`), so they stay locally branded.
 *
 * These are compile-time-only types: at runtime every identifier is a plain
 * string. Branding keeps `TenantId`, `WorkspaceId`, `IdentityId` and
 * `MembershipId` from being mixed up where a plain `string` would compile.
 * No runtime constructors are exported from the package entry point; callers
 * construct branded values with their own assertion helpers
 * (e.g. `value as TenantId`).
 */

import type { TenantId, WorkspaceId } from '@mos/contracts';

// Re-exported as the canonical shared brands (see module doc).
export type { TenantId, WorkspaceId };

declare const identityIdBrand: unique symbol;
declare const membershipIdBrand: unique symbol;

/** Unique identifier of an identity principal (`user` or `service`). */
export type IdentityId = string & { readonly [identityIdBrand]: true };

/**
 * Unique identifier of a membership record.
 *
 * Memberships use append-only revocation: revoking sets `revokedAt` and never
 * deletes the record, so identifiers are never reused after a revocation.
 */
export type MembershipId = string & { readonly [membershipIdBrand]: true };
