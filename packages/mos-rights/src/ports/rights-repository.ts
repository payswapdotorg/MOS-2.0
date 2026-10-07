import type { IdentityId, TenantScope } from '@mos/identity';
import type { ConsentRecord } from '../domain/consent.js';
import type { ProvenanceActor, ProvenanceCreationMethod, ProvenanceRecord } from '../domain/provenance.js';
import type { RightsAction, RightsGrant, RightsTerms } from '../domain/rights-grant.js';
import type { ConsentRef, ProvenanceRef, RightsRef } from '../domain/ids.js';

/**
 * Repository port for the MOS rights domain (CORE-003).
 *
 * Scope objects are passed explicitly on every mutating call — there is no
 * ambient "current tenant" anywhere (architecture policy:
 * `requireTenantScopeOnMutableArtifacts`).
 *
 * Failure model: mutating operations return either the resulting record or a
 * typed {@link RightsRepositoryError} value (result union, no thrown
 * subclasses), matching the `@mos/identity` convention. Read operations use
 * plain `null` / empty-array misses so cross-tenant existence never leaks.
 *
 * Identifier allocation is caller-driven: every create input carries the
 * caller-supplied branded identifier; the port needs no id generator. The
 * clock is injectable on the adapter, not the port.
 *
 * RIGHTS EVALUATION IS NOT A REPOSITORY OPERATION: it lives in the pure
 * function {@link ../evaluation/rights-evaluation.ts | evaluateRights}, which
 * takes explicit grant records as data and performs no I/O by construction.
 */
export interface RightsRepository {
  /**
   * Grant rights (append-only create). Fails with `invalid-input` (blank or
   * empty scope/actions/subjects/sources, or `expiresAt` not after
   * `grantedAt`), `duplicate-grant`, or `cross-tenant-reference`.
   */
  grantRights(input: GrantRightsInput): RightsGrant | RightsRepositoryError;

  /**
   * Fetch a rights grant by its stable ref, or `null` when unknown.
   * Revoked grants are still returned (append-only history is readable).
   */
  getRights(ref: RightsRef): RightsGrant | null;

  /**
   * Revoke a rights grant (append-only): sets `revokedAt`, bumps `version`,
   * never deletes. Fails with `grant-not-found`, `cross-tenant-reference` or
   * `grant-already-revoked`.
   */
  revokeRights(scope: TenantScope, ref: RightsRef): RightsGrant | RightsRepositoryError;

  /**
   * Record a participant consent (append-only create). Fails with
   * `invalid-input` (blank purpose / empty scope) or `duplicate-consent`.
   */
  recordConsent(input: RecordConsentInput): ConsentRecord | RightsRepositoryError;

  /**
   * Fetch a consent record by its stable ref, or `null` when unknown.
   * Revoked consents are still returned.
   */
  getConsent(ref: ConsentRef): ConsentRecord | null;

  /**
   * Revoke a consent (append-only): sets `revokedAt`, bumps `version`, never
   * deletes. Fails with `consent-not-found`, `cross-tenant-reference` or
   * `consent-already-revoked`.
   */
  revokeConsent(scope: TenantScope, ref: ConsentRef): ConsentRecord | RightsRepositoryError;

  /**
   * Record provenance (immutable create — there is deliberately NO update or
   * delete operation for provenance). Fails with `invalid-input` or
   * `duplicate-provenance`.
   */
  recordProvenance(input: RecordProvenanceInput): ProvenanceRecord | RightsRepositoryError;

  /**
   * Fetch a provenance record by its stable ref, or `null` when unknown.
   */
  getProvenance(ref: ProvenanceRef): ProvenanceRecord | null;

  /**
   * List the rights grants visible in a tenant scope — including revoked ones
   * (append-only history is auditable). Empty array for an unknown tenant
   * scope (queries never leak existence).
   */
  listRightsGrants(scope: TenantScope): readonly RightsGrant[];

  /**
   * List the consent records visible in a tenant scope — including revoked
   * ones. Empty array for an unknown tenant scope.
   */
  listConsentRecords(scope: TenantScope): readonly ConsentRecord[];
}

export interface GrantRightsInput {
  readonly scope: TenantScope;
  readonly id: RightsRef;
  readonly grantee: IdentityId;
  readonly actions: readonly RightsAction[];
  readonly subjectRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly terms: RightsTerms;
  readonly expiresAt?: string | null;
}

export interface RecordConsentInput {
  readonly scope: TenantScope;
  readonly id: ConsentRef;
  readonly participantRef: IdentityId;
  readonly purpose: string;
  readonly actions: readonly RightsAction[];
  readonly subjectRefs: readonly string[];
}

export interface RecordProvenanceInput {
  readonly scope: TenantScope;
  readonly id: ProvenanceRef;
  readonly creationMethod: ProvenanceCreationMethod;
  readonly actor: ProvenanceActor;
  readonly lineageRefs: readonly string[];
}

/** Machine-readable failure codes returned by mutating operations. */
export type RightsRepositoryErrorCode =
  | 'invalid-input'
  | 'duplicate-grant'
  | 'grant-not-found'
  | 'grant-already-revoked'
  | 'duplicate-consent'
  | 'consent-not-found'
  | 'consent-already-revoked'
  | 'duplicate-provenance'
  | 'cross-tenant-reference';

/**
 * Typed failure value. Use `'error' in result` to discriminate against the
 * success record (success records never carry an `error` field).
 */
export interface RightsRepositoryError {
  readonly error: RightsRepositoryErrorCode;
  readonly message: string;
}
