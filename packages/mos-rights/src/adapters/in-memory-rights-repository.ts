import type { TenantScope } from '@mos/contracts';
import type { ConsentRecord } from '../domain/consent.js';
import type { ProvenanceRecord } from '../domain/provenance.js';
import type { RightsGrant } from '../domain/rights-grant.js';
import type { ConsentRef, ProvenanceRef, RightsRef } from '../domain/ids.js';
import type {
  GrantRightsInput,
  RecordConsentInput,
  RecordProvenanceInput,
  RightsRepository,
  RightsRepositoryError,
  RightsRepositoryErrorCode,
} from '../ports/rights-repository.js';

/**
 * Options for {@link createInMemoryRightsRepository}.
 *
 * `now` is injectable so tests (and future golden fixtures) get deterministic
 * timestamps; it defaults to real wall-clock ISO-8601 strings. The default
 * uses only ECMAScript globals — no Node builtin imports in runtime code.
 */
export interface InMemoryRightsRepositoryOptions {
  readonly now?: () => string;
}

/**
 * Build an in-memory {@link RightsRepository}.
 *
 * W1-A GROUNDWORK DISCLOSURE: this adapter is an ephemeral, process-local
 * scaffold used to pin the domain model and the port contract. It is NOT
 * production persistence: no database, no migrations, no durability, no
 * cryptographic verification of grant authenticity. The central
 * schema/migration story is owned by the Tech Lead; a durable adapter
 * replaces this one in a later wave without touching the port.
 */
export function createInMemoryRightsRepository(
  options: InMemoryRightsRepositoryOptions = {},
): RightsRepository {
  const now = options.now ?? (() => new Date().toISOString());

  const grants = new Map<RightsRef, RightsGrant>();
  const consents = new Map<ConsentRef, ConsentRecord>();
  const provenance = new Map<ProvenanceRef, ProvenanceRecord>();

  const fail = (error: RightsRepositoryErrorCode, message: string): RightsRepositoryError => ({
    error,
    message,
  });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  const listGrantsInTenant = (scope: TenantScope): RightsGrant[] => {
    const found: RightsGrant[] = [];
    for (const grant of grants.values()) {
      if (grant.tenantId === scope.tenantId) {
        found.push(grant);
      }
    }
    return found.sort((a, b) =>
      a.grantedAt === b.grantedAt ? compareStrings(a.id, b.id) : compareStrings(a.grantedAt, b.grantedAt),
    );
  };

  const listConsentsInTenant = (scope: TenantScope): ConsentRecord[] => {
    const found: ConsentRecord[] = [];
    for (const consent of consents.values()) {
      if (consent.tenantId === scope.tenantId) {
        found.push(consent);
      }
    }
    return found.sort((a, b) =>
      a.grantedAt === b.grantedAt ? compareStrings(a.id, b.id) : compareStrings(a.grantedAt, b.grantedAt),
    );
  };

  return {
    grantRights(input: GrantRightsInput): RightsGrant | RightsRepositoryError {
      if (input.actions.length === 0) {
        return fail('invalid-input', 'rights grant must name at least one action');
      }
      if (input.subjectRefs.length === 0) {
        return fail('invalid-input', 'rights grant must name at least one subject ref');
      }
      if (input.sourceRefs.length === 0) {
        return fail('invalid-input', 'rights grant must cite at least one source ref');
      }
      const grantedAt = now();
      if (input.expiresAt !== null && input.expiresAt !== undefined) {
        if (isBlank(input.expiresAt)) {
          return fail('invalid-input', 'rights grant expiresAt must be an ISO-8601 string');
        }
        if (input.expiresAt <= grantedAt) {
          return fail('invalid-input', 'rights grant expiresAt must be after grantedAt');
        }
      }
      if (grants.has(input.id)) {
        return fail('duplicate-grant', `rights grant already exists: ${input.id}`);
      }
      const grant: RightsGrant = Object.freeze({
        id: input.id,
        tenantId: input.scope.tenantId,
        version: 1,
        scope: Object.freeze({
          actions: Object.freeze([...input.actions]),
          subjectRefs: Object.freeze([...input.subjectRefs]),
        }),
        grantee: input.grantee,
        sourceRefs: Object.freeze([...input.sourceRefs]),
        terms: Object.freeze({ ...input.terms }),
        grantedAt,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
      });
      grants.set(grant.id, grant);
      return grant;
    },

    getRights(ref: RightsRef): RightsGrant | null {
      return grants.get(ref) ?? null;
    },

    revokeRights(scope: TenantScope, ref: RightsRef): RightsGrant | RightsRepositoryError {
      const grant = grants.get(ref);
      if (!grant) {
        return fail('grant-not-found', `rights grant does not exist: ${ref}`);
      }
      if (grant.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `rights grant ${ref} does not belong to tenant ${scope.tenantId}`,
        );
      }
      if (grant.revokedAt !== null) {
        return fail(
          'grant-already-revoked',
          `rights grant ${ref} was already revoked at ${grant.revokedAt}`,
        );
      }
      const revoked: RightsGrant = Object.freeze({
        ...grant,
        version: grant.version + 1,
        revokedAt: now(),
      });
      grants.set(revoked.id, revoked);
      return revoked;
    },

    recordConsent(input: RecordConsentInput): ConsentRecord | RightsRepositoryError {
      if (isBlank(input.purpose)) {
        return fail('invalid-input', 'consent purpose must not be blank');
      }
      if (input.actions.length === 0) {
        return fail('invalid-input', 'consent must name at least one action');
      }
      if (input.subjectRefs.length === 0) {
        return fail('invalid-input', 'consent must name at least one subject ref');
      }
      if (consents.has(input.id)) {
        return fail('duplicate-consent', `consent record already exists: ${input.id}`);
      }
      const consent: ConsentRecord = Object.freeze({
        id: input.id,
        tenantId: input.scope.tenantId,
        version: 1,
        participantRef: input.participantRef,
        purpose: input.purpose,
        scope: Object.freeze({
          actions: Object.freeze([...input.actions]),
          subjectRefs: Object.freeze([...input.subjectRefs]),
        }),
        grantedAt: now(),
        revokedAt: null,
      });
      consents.set(consent.id, consent);
      return consent;
    },

    getConsent(ref: ConsentRef): ConsentRecord | null {
      return consents.get(ref) ?? null;
    },

    revokeConsent(scope: TenantScope, ref: ConsentRef): ConsentRecord | RightsRepositoryError {
      const consent = consents.get(ref);
      if (!consent) {
        return fail('consent-not-found', `consent record does not exist: ${ref}`);
      }
      if (consent.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `consent record ${ref} does not belong to tenant ${scope.tenantId}`,
        );
      }
      if (consent.revokedAt !== null) {
        return fail(
          'consent-already-revoked',
          `consent record ${ref} was already revoked at ${consent.revokedAt}`,
        );
      }
      const revoked: ConsentRecord = Object.freeze({
        ...consent,
        version: consent.version + 1,
        revokedAt: now(),
      });
      consents.set(revoked.id, revoked);
      return revoked;
    },

    recordProvenance(input: RecordProvenanceInput): ProvenanceRecord | RightsRepositoryError {
      if (provenance.has(input.id)) {
        return fail('duplicate-provenance', `provenance record already exists: ${input.id}`);
      }
      // Provenance is IMMUTABLE: version is always 1 and there is no update
      // path anywhere on the port. Correcting provenance means writing a new
      // record and pointing new artifact versions at it.
      const record: ProvenanceRecord = Object.freeze({
        id: input.id,
        tenantId: input.scope.tenantId,
        version: 1,
        creationMethod: input.creationMethod,
        actor: input.actor,
        lineageRefs: Object.freeze([...input.lineageRefs]),
        recordedAt: now(),
      });
      provenance.set(record.id, record);
      return record;
    },

    getProvenance(ref: ProvenanceRef): ProvenanceRecord | null {
      return provenance.get(ref) ?? null;
    },

    listRightsGrants(scope: TenantScope): readonly RightsGrant[] {
      return listGrantsInTenant(scope);
    },

    listConsentRecords(scope: TenantScope): readonly ConsentRecord[] {
      return listConsentsInTenant(scope);
    },
  };
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
