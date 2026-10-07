/**
 * PermissionsPort — permission grant/check surface.
 *
 * MOS v2.0 (W0-B / BOOT-003). MOS-owned contract surface.
 * PORT INVARIANT: files under `src/ports/**` NEVER import `@zcode/*`.
 *
 * Architecture role: the ZCode substrate provides permission mechanics
 * (substrate inventory, "Tools/permissions" row). MOS policy authority
 * (`mos-policy`) decides what SHOULD be permitted; this port only exposes
 * the substrate mechanics: grant, revoke, check. Grant/check decisions
 * recorded here are substrate runtime state, not MOS policy truth.
 */

/** Principal a permission applies to (opaque, e.g. `agent:<id>`). */
export type PermissionPrincipal = string;

/** Substrate action name (e.g. `file.read`, `shell.exec`). */
export type PermissionAction = string;

/** Resource scope the action applies to (opaque reference). */
export type PermissionScope = string;

/** Request to grant a permission. */
export interface PermissionGrantRequest {
  readonly principal: PermissionPrincipal;
  readonly action: PermissionAction;
  readonly scope: PermissionScope;
  /** Who approved the grant (audit trail). */
  readonly grantedBy?: string;
  /** RFC 3339 expiry; absent = no expiry. */
  readonly expiresAt?: string;
}

/** A recorded permission grant. */
export interface PermissionGrant {
  readonly grantId: string;
  readonly principal: PermissionPrincipal;
  readonly action: PermissionAction;
  readonly scope: PermissionScope;
  /** RFC 3339 grant timestamp. */
  readonly grantedAt: string;
  readonly grantedBy?: string;
  readonly expiresAt?: string;
}

/** Result of a revoke. */
export interface PermissionRevokeResult {
  readonly grantId: string;
  readonly revoked: boolean;
}

/** Request to check a permission at a point in time. */
export interface PermissionCheckRequest {
  readonly principal: PermissionPrincipal;
  readonly action: PermissionAction;
  readonly scope: PermissionScope;
  /** RFC 3339 evaluation time (defaults to now). */
  readonly atTime?: string;
}

/** Outcome of a permission check. */
export interface PermissionCheckResult {
  readonly allowed: boolean;
  /** Human-readable explanation (never used for authorization logic). */
  readonly reason?: string;
  /** Grant that satisfied the check, when allowed. */
  readonly grantId?: string;
}

/** Permission grant/check surface over the substrate. */
export interface PermissionsPort {
  grant(request: PermissionGrantRequest): Promise<PermissionGrant>;
  revoke(grantId: string): Promise<PermissionRevokeResult>;
  check(request: PermissionCheckRequest): Promise<PermissionCheckResult>;
}
