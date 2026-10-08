/**
 * Tenant-id grammar (W11-B) — the machine-readable tenant-id rule proposed by
 * `docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md`.
 *
 * PROPOSED GRAMMAR: `^[a-z0-9][a-z0-9-]{0,63}$` — lowercase ASCII alphanumeric
 * plus hyphen, 1–64 characters, first character alphanumeric. Every exclusion
 * maps to a concrete W9-B D1/D2 attack shape (delimiter-injectable composite
 * keys, prefix-scan tenant listings) — see the ACR's per-exclusion table.
 *
 * The canonical value types (`TenantId`, `TenantScope`) stay in
 * `value-types.ts` (TYPES ONLY). This module is the small runtime companion
 * the ACR's enforcement point needs: one frozen grammar constant + one
 * validation predicate. `@mos/identity` `createTenant` is the single
 * enforcement choke point (fail-closed, typed `invalid-tenant-id`); adapters
 * MAY cite `isValidTenantId` as an early-rejection quality-of-life option
 * (disclosure only — no adapter is forced to migrate; the adapters' own
 * injective-key/equality discipline is the load-bearing defense in depth).
 *
 * ACR status: PROPOSED — the ACR proposes, the Tech Lead decides; the frozen
 * specs are untouched. If the TL amends the grammar at adoption time, the
 * change is exactly one edit to `TENANT_ID_GRAMMAR_PATTERN_SOURCE` (the
 * predicate compiles from the exported source, so the two can never drift).
 */

/**
 * The exact regular-expression source of the proposed tenant-id grammar.
 * Exported so pin tests (and any future durable adapter) can assert
 * pattern-exactness instead of re-deriving the rule.
 */
export const TENANT_ID_GRAMMAR_PATTERN_SOURCE = "^[a-z0-9][a-z0-9-]{0,63}$";

/**
 * The proposed tenant-id grammar as one frozen machine-readable constant:
 * pattern source + length bounds + a human description + the ACR anchor.
 */
export interface TenantIdGrammar {
  readonly patternSource: string;
  readonly minLength: 1;
  readonly maxLength: 64;
  readonly description: string;
  readonly acr: string;
}

/** The proposed tenant-id grammar (frozen). See the module doc and the ACR. */
export const TENANT_ID_GRAMMAR: TenantIdGrammar = Object.freeze({
  patternSource: TENANT_ID_GRAMMAR_PATTERN_SOURCE,
  minLength: 1,
  maxLength: 64,
  description: "lowercase ASCII alphanumeric plus hyphen, 1-64 chars, first char alphanumeric",
  acr: "docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md",
});

const TENANT_ID_PATTERN = new RegExp(TENANT_ID_GRAMMAR_PATTERN_SOURCE);

/**
 * Does `id` satisfy the proposed tenant-id grammar?
 *
 * Accepts: `a`, `tenant-a`, `t1`, 64-char lowercase slugs.
 * Rejects (every W9-B D1/D2 attack shape): `:`, `::`, `|`, NUL, empty,
 * whitespace, uppercase, unicode, underscore, over-length, leading hyphen.
 *
 * The predicate is pure and total: any string (including hostile shapes)
 * returns a boolean; it never throws and never mutates its input.
 */
export function isValidTenantId(id: string): boolean {
  return TENANT_ID_PATTERN.test(id);
}
