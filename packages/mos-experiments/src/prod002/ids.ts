import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';

declare const tenantIdBrand: unique symbol;

/** Tenant-scoped identifier (§31): validated against the frozen tenant-id grammar. */
export type TenantId = string & { readonly [tenantIdBrand]: true };

/**
 * Default tenant-id grammar: lowercase slug, 1–63 chars, alphanumeric boundaries.
 * SINGLE RECONCILIATION POINT: if the frozen contracts grammar differs, override via
 * `ExperimentEngineDeps.tenantIdPattern` (or correct this one constant at merge).
 */
export const DEFAULT_TENANT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidTenantId(raw: unknown, pattern: RegExp = DEFAULT_TENANT_ID_PATTERN): boolean {
  return typeof raw === 'string' && pattern.test(raw);
}

export function validateTenantId(raw: unknown, pattern: RegExp = DEFAULT_TENANT_ID_PATTERN): Result<TenantId, Failure> {
  if (!isValidTenantId(raw, pattern)) {
    return err(failure(
      'E_INVALID_TENANT_ID',
      `tenant id ${JSON.stringify(raw)} does not match the frozen tenant-id grammar`,
      { tenantId: typeof raw === 'string' ? raw : null },
    ));
  }
  return ok(raw as TenantId);
}
