/**
 * INTERNAL fail-closed RIGHTS GATE for the W11-A product-intelligence
 * record path. NOT exported from the package index.
 *
 * Rights-respect is a REQUIRED property of every stored record (§27: every
 * media acquisition/transform step must carry rights/provenance context;
 * public URLs never imply rights). The gate resolves the declared
 * `rightsRef` through the injected `ProductIntelligenceRightsSource` and
 * fails closed, in order, on:
 *
 * 1. `no-explicit-grant` — the ref does not resolve (URL/storage
 *    accessibility NEVER implies rights);
 * 2. `rights-grant-tenant-mismatch` — the grant belongs to another tenant;
 * 3. `rights-grant-revoked` — append-only revocation already happened;
 * 4. `rights-grant-expired` — the grant's `expiresAt` has passed;
 * 5. `analyze-action-not-granted` — the closed rights-action vocabulary
 *    does not include `analyze` in the grant's actions;
 * 6. `attribution-required` — the grant's terms demand attribution and the
 *    request carries none;
 * 7. `cited-ref-not-covered-by-grant` — some cited ref (evidence refs,
 *    source refs, or cited commerce observation refs) is NOT covered by the
 *    grant's subject set. The coverage comparison is ELEMENT-WISE on
 *    sorted arrays (the W9-B D6 discipline — never a delimiter-joined set
 *    comparison, which can alias different sets).
 */

import type { TenantScope, Timestamp } from '@mos/contracts';
import type { RightsGrant } from '@mos/rights';
import type {
  ProductIntelligenceRightsSource,
  RecordProductIntelligenceInput,
} from '../ports/product-intelligence-port.js';
import { productIntelligenceFailure } from '../ports/product-intelligence-port.js';
import { isPlainObject } from './adapter-support.js';

/**
 * The union of every ref the record cites — all of them must be covered by
 * the grant's subject set (evidence + sources + commerce observations).
 */
const citedRefsOf = (input: RecordProductIntelligenceInput): readonly string[] => {
  const refs: string[] = [
    ...(input.content.evidenceRefs as readonly string[]),
    ...(input.source.sourceRefs as readonly string[]),
    ...((input.citedCommerceObservations ?? []).map(
      (citation) => citation.observationRef as string,
    )),
  ];
  return [...new Set(refs)];
};

/**
 * ELEMENT-WISE subset check: every cited ref is a member of the grant's
 * subject set (order-insensitive; duplicates collapse; NEVER a
 * delimiter-joined comparison — the W9-B D6 discipline).
 */
export const citedRefsCoveredBy = (
  cited: readonly string[],
  subjects: readonly string[],
): boolean => {
  const subjectSet = new Set<string>(subjects as readonly string[]);
  for (const ref of cited) {
    if (!subjectSet.has(ref)) {
      return false;
    }
  }
  return true;
};

/**
 * The full rights gate. `input` MUST have passed structural validation
 * first (adapters/record-validation.ts). Returns `null` when the record is
 * rights-respecting, else the typed failure.
 */
export const checkProductIntelligenceRights = (
  scope: TenantScope,
  input: RecordProductIntelligenceInput,
  rights: ProductIntelligenceRightsSource,
  now: () => Timestamp,
): ReturnType<typeof productIntelligenceFailure> | null => {
  // ---- 1. the explicit grant must resolve ----
  const grant: RightsGrant | null = rights.getRights(input.rightsRef);
  if (grant === null) {
    return productIntelligenceFailure(
      'no-explicit-grant',
      `rightsRef does not resolve to an explicit rights grant: ${String(input.rightsRef)} (object-store/URL accessibility never implies rights — §27)`,
    );
  }
  if (!isPlainObject(grant) || !isPlainObject(grant.scope)) {
    // Defensive: a structurally malformed grant source fails closed too.
    return productIntelligenceFailure(
      'no-explicit-grant',
      `rightsRef ${String(input.rightsRef)} resolved to a structurally malformed grant — failing closed`,
    );
  }

  // ---- 2. the grant must belong to THIS tenant ----
  if ((grant.tenantId as string) !== (scope.tenantId as string)) {
    return productIntelligenceFailure(
      'rights-grant-tenant-mismatch',
      `rights grant ${String(input.rightsRef)} belongs to tenant ${String(grant.tenantId)}, not ${String(scope.tenantId)}`,
    );
  }

  // ---- 3. revocation (append-only history stays readable, but gates) ----
  if (grant.revokedAt !== null) {
    return productIntelligenceFailure(
      'rights-grant-revoked',
      `rights grant ${String(input.rightsRef)} was revoked at ${String(grant.revokedAt)}`,
    );
  }

  // ---- 4. expiry ----
  if (grant.expiresAt !== null && grant.expiresAt <= now()) {
    return productIntelligenceFailure(
      'rights-grant-expired',
      `rights grant ${String(input.rightsRef)} expired at ${String(grant.expiresAt)}`,
    );
  }

  // ---- 5. the analyze action (closed rights-action vocabulary) ----
  const actions = (grant.scope.actions ?? []) as readonly string[];
  if (!actions.includes('analyze')) {
    return productIntelligenceFailure(
      'analyze-action-not-granted',
      `rights grant ${String(input.rightsRef)} does not include the 'analyze' action — recording product intelligence over the granted subjects requires it`,
    );
  }

  // ---- 6. attribution when the terms demand it ----
  const terms: Record<string, unknown> = isPlainObject(grant.terms) ? grant.terms : {};
  if (terms.attributionRequired === true) {
    const attribution = input.attribution ?? null;
    if (attribution === null || String(attribution).trim().length === 0) {
      return productIntelligenceFailure(
        'attribution-required',
        `rights grant ${String(input.rightsRef)} requires attribution — the record must carry a non-blank attribution naming the source/rights holder`,
      );
    }
  }

  // ---- 7. cited-ref coverage (element-wise — the D6 discipline) ----
  const cited = citedRefsOf(input);
  const subjects = (grant.scope.subjectRefs ?? []) as readonly string[];
  if (!citedRefsCoveredBy(cited, subjects)) {
    const subjectSet = new Set<string>(subjects as readonly string[]);
    const uncovered = cited
      .filter((ref) => !subjectSet.has(ref))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const first = uncovered[0] ?? '';
    return productIntelligenceFailure(
      'cited-ref-not-covered-by-grant',
      `cited ref "${first}" is not covered by the subject set of rights grant ${String(input.rightsRef)} — every evidence ref, source ref and cited commerce observation the record relies on must be within the grant's subjects (§27 rights context on every step)`,
    );
  }
  return null;
};
