/**
 * PROD-003 — tenant-id discipline (§27/§31).
 *
 * TL RECONCILE: the pattern below is the conservative grammar assumed for the frozen
 * tenant-id grammar (§31): lowercase alphanumerics and hyphens, 3–63 chars, no
 * leading/trailing hyphen. If the frozen grammar in the spec differs, change
 * TENANT_ID_PATTERN only — every tenant check funnels through isValidTenantId.
 */
export type TenantId = string;

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export function isValidTenantId(tenantId: string): boolean {
  return TENANT_ID_PATTERN.test(tenantId);
}

export function sameTenant(a: string, b: string): boolean {
  return a === b;
}
