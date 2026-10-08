/**
 * The PRODUCT-INTELLIGENCE PORT (W11-A) — the authority's complete public
 * surface and THE port set a MARKETING-001 mission planner consumes.
 *
 * THE PORTS FOR MISSION PLANNING (the §25 "informs planning" side, read
 * surfaces only): `searchProductIntelligence` (query with filters),
 * `listProductIntelligenceForSubject` / `listProductIntelligenceVersions`
 * (listings), `getProductIntelligenceRecord` /
 * `resolveProductIntelligenceCitations` (versioned-citation resolution —
 * fail-closed: a citation that does not resolve is an error, never
 * silently-dropped provenance). The planner cites exact
 * `ProductIntelligenceVersionRef`s into its evidence-linked plan; this
 * package never sees, validates or executes a plan (no mission authority).
 *
 * SEVEN methods ≤ the 12-method architecture policy budget. The ONLY write
 * path is `recordProductIntelligence` (append-only: a new record is always
 * a new version of its chain; there is NO update or delete method —
 * historical intelligence is never rewritten).
 *
 * Failure model: the result-union convention (`'error' in result`
 * discriminates; typed kebab-case codes, no thrown subclasses — the
 * `@mos/identity`/`@mos/rights` precedent). Reads use `null` / empty-array
 * misses so cross-tenant existence never leaks.
 *
 * `@mos/rights` is imported TYPE-ONLY (the `Pick<RightsRepository,
 * 'getRights'>` view — the @mos/content precedent): the rights gate is an
 * injected seam; the composition root wires a real rights repository at TL
 * integration time, and the disclosed in-memory adapter takes the same
 * view.
 */

import type { TenantScope, Version } from '@mos/contracts';
import type { RightsRepository } from '@mos/rights';
import type {
  ProductIntelligenceId,
  ProductIntelligenceVersionRef,
  ProductSubjectRef,
} from '../contracts/ids.js';
import type {
  CommerceObservationCitation,
  ProductIntelligenceBasis,
  ProductIntelligenceContent,
  ProductIntelligenceRecord,
  ProductIntelligenceSource,
} from '../contracts/records.js';
import type { ProductIntelligenceSearchQuery } from '../contracts/search.js';
import type { RightsRef, Timestamp } from '@mos/contracts';
import type { IdentityId } from '@mos/identity';

/**
 * The injected rights source (a narrow structural view of `@mos/rights`'
 * `RightsRepository`): the rights gate resolves the declared `RightsRef`
 * through it. `@mos/rights` is imported type-only — hexagonal.
 */
export type ProductIntelligenceRightsSource = Pick<RightsRepository, 'getRights'>;

/** The append-only record input (validation: adapters/record-validation.ts). */
export interface RecordProductIntelligenceInput {
  /** The tenant scope the record is recorded under (§31). */
  readonly scope: TenantScope;
  /** The record chain id (caller-driven identifier allocation). */
  readonly id: ProductIntelligenceId;
  /** The product-side subject. */
  readonly subject: ProductSubjectRef;
  /** The evidence-linked content (fact | metric | observation). */
  readonly content: ProductIntelligenceContent;
  /** The explicit source attribution. */
  readonly source: ProductIntelligenceSource;
  /** The basis (cited external evidence vs counterfactual forecast). */
  readonly basis: ProductIntelligenceBasis;
  /**
   * External commerce observations cited with provenance (§25 — citations
   * only, never authored state). REQUIRED non-empty when
   * `source.sourceKind === 'external-commerce-system'`.
   */
  readonly citedCommerceObservations?: readonly CommerceObservationCitation[];
  /** The explicit rights grant this analysis is recorded under. */
  readonly rightsRef: RightsRef;
  /**
   * Source/rights-holder attribution — required non-blank whenever the
   * grant's terms demand attribution (fail-closed `attribution-required`).
   */
  readonly attribution?: string | null;
  /** The identity principal recording this intelligence. */
  readonly recordedBy: IdentityId;
  /** Free-form recorder note. */
  readonly note?: string | null;
}

/** Machine-readable failure codes (typed result union — never thrown). */
export type ProductIntelligenceErrorCode =
  | 'invalid-input'
  | 'non-finite-metric-value'
  | 'commerce-citation-required'
  | 'no-explicit-grant'
  | 'rights-grant-tenant-mismatch'
  | 'rights-grant-revoked'
  | 'rights-grant-expired'
  | 'analyze-action-not-granted'
  | 'attribution-required'
  | 'cited-ref-not-covered-by-grant'
  | 'invalid-citation'
  | 'citation-not-found';

/** Typed failure value (`'error' in result` discriminates). */
export interface ProductIntelligenceError {
  readonly error: ProductIntelligenceErrorCode;
  readonly message: string;
}

/** The bit-for-bit integrity report of one stored record. */
export interface ProductIntelligenceIntegrityReport {
  readonly recordId: ProductIntelligenceId;
  readonly version: Version;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

/**
 * THE PRODUCT-INTELLIGENCE PORT. Recording (append-only) + the
 * planning-facing reads (search/list/resolve with versioned citations) +
 * integrity verification. Seven methods.
 */
export interface ProductIntelligencePort {
  /**
   * Record ONE product-side intelligence observation (append-only — always
   * a NEW version of the `(tenant, id)` chain; never rewrites history).
   * Fail-closed validation order: structural request faults → the rights
   * gate (explicit ACTIVE tenant-matching `analyze` grant covering every
   * cited ref; attribution when the terms demand it) → the basis literal
   * re-validation → the finite metric guard. Nothing is recorded on any
   * failure.
   */
  recordProductIntelligence(
    input: RecordProductIntelligenceInput,
  ): Promise<ProductIntelligenceRecord | ProductIntelligenceError>;

  /**
   * Fetch one record by chain id — the exact version when given, else the
   * chain's latest — or `null` when unknown in this tenant scope
   * (cross-tenant reads never leak existence).
   */
  getProductIntelligenceRecord(
    scope: TenantScope,
    id: ProductIntelligenceId,
    version?: number,
  ): Promise<ProductIntelligenceRecord | null>;

  /**
   * The full immutable version history of one chain, oldest first. Empty
   * array for an unknown chain in this tenant scope.
   */
  listProductIntelligenceVersions(
    scope: TenantScope,
    id: ProductIntelligenceId,
  ): Promise<readonly ProductIntelligenceRecord[]>;

  /**
   * The LATEST version of every record chain about one subject (the
   * subject's current intelligence picture), deterministic `recordId` order.
   */
  listProductIntelligenceForSubject(
    scope: TenantScope,
    subject: ProductSubjectRef,
  ): Promise<readonly ProductIntelligenceRecord[]>;

  /**
   * Search the tenant's product intelligence: the LATEST version of every
   * chain matching the exact-equality filters, deterministic
   * `(subject, recordId)` order, capped by `query.limit`. An invalid query
   * (non-integer or out-of-range limit, unknown filter vocabulary) fails
   * closed as `invalid-input` — never a silently-widened scan.
   */
  searchProductIntelligence(
    scope: TenantScope,
    query: ProductIntelligenceSearchQuery,
  ): Promise<readonly ProductIntelligenceRecord[] | ProductIntelligenceError>;

  /**
   * Resolve a list of VERSIONED citations into the frozen records they name
   * — the planner's fail-closed provenance resolution: every citation must
   * resolve (unknown record id or version in this tenant scope →
   * `citation-not-found`; a malformed citation → `invalid-citation`),
   * because citing intelligence that does not resolve would fabricate the
   * plan's evidence base. Returns the records in citation order.
   */
  resolveProductIntelligenceCitations(
    scope: TenantScope,
    citations: readonly ProductIntelligenceVersionRef[],
  ): Promise<readonly ProductIntelligenceRecord[] | ProductIntelligenceError>;

  /**
   * Verify one record's bit-for-bit integrity (recomputed digest vs the
   * sealed digest): `intact` or `tampered` — or `null` when the record is
   * unknown in this tenant scope.
   */
  verifyProductIntelligenceIntegrity(
    scope: TenantScope,
    id: ProductIntelligenceId,
    version?: number,
  ): Promise<ProductIntelligenceIntegrityReport | null>;
}

/** Convenience: the typed failure value builder (internal convention). */
export const productIntelligenceFailure = (
  error: ProductIntelligenceError['error'],
  message: string,
): ProductIntelligenceError => ({ error, message });

/** Injectable clock default (ISO-8601 wall clock). */
export const productIntelligenceNowDefault = (): Timestamp =>
  new Date().toISOString() as Timestamp;
