/**
 * Branded nominal identifier types for the MOS identity domain.
 *
 * These are compile-time-only types: at runtime every identifier is a plain
 * string. Branding keeps `TenantId`, `WorkspaceId`, `IdentityId` and
 * `MembershipId` from being mixed up where a plain `string` would compile.
 *
 * Per the Wave-0 public-surface rule, no runtime constructors are exported
 * from the package entry point; callers construct branded values with their
 * own assertion helpers (e.g. `value as TenantId`) until the CORE-001
 * reconciliation decides the canonical construction/validation story.
 */

declare const tenantIdBrand: unique symbol;
declare const workspaceIdBrand: unique symbol;
declare const identityIdBrand: unique symbol;
declare const membershipIdBrand: unique symbol;

/** Unique identifier of a tenant (the tenant-scoping root of MOS v2.0). */
export type TenantId = string & { readonly [tenantIdBrand]: true };

/** Unique identifier of a workspace. Every workspace belongs to exactly one tenant. */
export type WorkspaceId = string & { readonly [workspaceIdBrand]: true };

/** Unique identifier of an identity principal (`user` or `service`). */
export type IdentityId = string & { readonly [identityIdBrand]: true };

/**
 * Unique identifier of a membership record.
 *
 * Memberships use append-only revocation: revoking sets `revokedAt` and never
 * deletes the record, so identifiers are never reused after a revocation.
 */
export type MembershipId = string & { readonly [membershipIdBrand]: true };
