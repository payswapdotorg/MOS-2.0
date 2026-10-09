import type {
  MissionRef,
  StudioArtifactPackageId,
  StudioSessionId,
  TenantScope,
} from '@mos/contracts';
import type { TenantContextView } from '../ports/app-shell.js';

/**
 * Route-scope helpers (WEB-001 / UX-001).
 *
 * The Missions surface reads through `TenantScope` values (the contracts
 * vocabulary) derived from the shell's tenant context view, and mission ids
 * arrive as raw URL query strings that must be branded into `MissionRef`
 * before they cross a view port. Both are presentation-shaped coercions —
 * they carry no authority: an unknown or cross-tenant id still fails closed
 * inside the Missions authority behind the port (`mission-not-found`).
 *
 * Branded ids are compile-time-only (the `@mos/contracts` convention): at
 * runtime every value is the plain string, so the coercion never alters data.
 */

/**
 * Derive the tenant scope for catalog reads from the shell's tenant context
 * view, or `null` when no tenant context resolved (the Missions surface then
 * renders its explicit no-tenant-context state instead of guessing).
 */
export function missionScopeFromTenantContext(
  tenant: TenantContextView | null,
): TenantScope | null {
  if (tenant === null) {
    return null;
  }
  return tenant.workspaceId === null
    ? { tenantId: tenant.tenantId }
    : { tenantId: tenant.tenantId, workspaceId: tenant.workspaceId };
}

/**
 * Brand a raw query-string mission id into a `MissionRef`. Presentation-only
 * coercion: no existence check happens here — the catalog port resolves (or
 * fails closed on) the id against the Missions authority.
 */
export function missionRefFromQueryValue(raw: string): MissionRef {
  return raw as MissionRef;
}

/**
 * The route-scope surface as a single frozen namespace (the shape the route
 * loading pass asks for).
 */
export const MissionScope = Object.freeze({
  fromTenantContext: missionScopeFromTenantContext,
  missionRef: missionRefFromQueryValue,
});

/**
 * Brand a raw query-string studio session id into a `StudioSessionId`, and a
 * studio package id into a `StudioArtifactPackageId` (UX-002). Presentation-
 * only coercions: no existence check happens here — the studio view ports
 * resolve (or fail closed on) the ids against the tenant scope.
 */
export function studioSessionRefFromQueryValue(raw: string): StudioSessionId {
  return raw as StudioSessionId;
}

export function studioPackageRefFromQueryValue(raw: string): StudioArtifactPackageId {
  return raw as StudioArtifactPackageId;
}

/**
 * The Studio route-scope surface as a single frozen namespace (the same
 * tenant-scope derivation the Missions surface reads through).
 */
export const StudioScope = Object.freeze({
  fromTenantContext: missionScopeFromTenantContext,
  sessionRef: studioSessionRefFromQueryValue,
  packageRef: studioPackageRefFromQueryValue,
});

export type { TenantScope };
