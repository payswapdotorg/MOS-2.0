import type { IdentityId } from '@mos/identity';
import type { TenantId } from '@mos/contracts';
import type { RightsGrantId } from './ids.js';

/**
 * The actions a rights grant can cover. Closed vocabulary until the CORE-001
 * contracts reconciliation decides the canonical form; extensions are a
 * Tech-Lead-owned contract change, not a package-local decision.
 */
export type RightsAction = 'use' | 'transform' | 'distribute' | 'derive' | 'analyze';

/**
 * What a grant covers: the actions permitted, applied to the explicit set of
 * subject references (storage refs, source ids, artifact ids — whatever the
 * granting terms name). An empty scope is rejected by the repository: a grant
 * that permits nothing over nothing is invalid, not vacuously-true.
 */
export interface RightsScope {
  /** Actions the grantee may perform. Must contain at least one action. */
  readonly actions: readonly RightsAction[];
  /**
   * Subjects the grant covers, as opaque refs (e.g. object-store storageRefs,
   * external source refs, artifact ids). Must contain at least one subject.
   * Subject coverage is the ONLY way a storageRef/URL becomes rights-relevant
   * — see {@link ../evaluation/rights-evaluation.ts}.
   */
  readonly subjectRefs: readonly string[];
}

/**
 * Structured terms attached to a grant. Deliberately minimal and explicit:
 * every field is an affirmative statement, so consumers never have to guess
 * defaults. Extended terms are a contracts-reconciliation concern.
 */
export interface RightsTerms {
  /** Whether attribution of the source/rights-holder is required on use. */
  readonly attributionRequired: boolean;
  /** Whether commercial use is permitted. */
  readonly commercialUseAllowed: boolean;
  /** Whether derivative works are permitted. */
  readonly derivationAllowed: boolean;
  /** Free-form legal/contractual notes, or `null` when there are none. */
  readonly notes: string | null;
}

/**
 * A rights grant: the ONLY construct in the MOS rights domain that can make an
 * action lawful. Grants are explicit records — they are never inferred from
 * URL accessibility, file availability, or any other environmental signal
 * (architecture §27: "Public URLs do not imply rights").
 *
 * Append-only revocation (architecture policy
 * `requireAppendOnlyHistoryWhereDeclared`): revoking sets `revokedAt` and bumps
 * `version`; the record is never deleted. Granting again after a revocation
 * creates a NEW record with a new identifier, preserving the full history.
 *
 * Tenant-scoped by requirement: `tenantId` is carried explicitly.
 */
export interface RightsGrant {
  readonly id: RightsGrantId;
  readonly tenantId: TenantId;
  /** Monotonic record version; starts at 1, bumped on revocation. */
  readonly version: number;
  /** What is granted (actions over subjects). */
  readonly scope: RightsScope;
  /** The identity principal that receives the rights. */
  readonly grantee: IdentityId;
  /**
   * References to the sources that back the grant (consent record refs,
   * license document refs, contract refs). At least one source is required:
   * grants are always traceable to something explicit.
   */
  readonly sourceRefs: readonly string[];
  /** Structured terms of the grant. */
  readonly terms: RightsTerms;
  /** ISO-8601 timestamp of the grant. */
  readonly grantedAt: string;
  /** ISO-8601 timestamp after which the grant is no longer valid, or `null`. */
  readonly expiresAt: string | null;
  /** ISO-8601 timestamp of the (append-only) revocation, or `null` while active. */
  readonly revokedAt: string | null;
}
