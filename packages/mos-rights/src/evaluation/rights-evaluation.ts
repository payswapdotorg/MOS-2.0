import type { IdentityId, TenantId } from '@mos/identity';
import type { RightsAction, RightsGrant } from '../domain/rights-grant.js';
import type { RightsRef } from '../domain/ids.js';

/**
 * evaluateRights — THE rights evaluation rule of MOS v2.0 (CORE-003).
 *
 * ARCHITECTURE LAW (spec/mos-architecture-v2.0.md §27: "Public URLs do not
 * imply rights"; AGENTS.md: "Do not infer rights from URL accessibility"):
 *
 * Rights are evaluated ONLY from explicit grant records passed in as data.
 * This function is PURE: it receives the grants as a value, performs no I/O,
 * consults no storage, and probes no URL. A request whose grants contain no
 * explicit grant covering it is DENIED with reason `'no-explicit-grant'` —
 * no matter how public, reachable, or downloadable the subject reference is.
 * The `subjectRef` on the request is used EXCLUSIVELY to match against
 * `grant.scope.subjectRefs`; its resolvability is never consulted.
 *
 * This is enforced structurally, not just by convention: the request type has
 * no field through which accessibility could even be expressed.
 */
export interface RightsEvaluationRequest {
  /** Tenant in whose scope the action would happen. */
  readonly tenantId: TenantId;
  /** Identity that wants to perform the action. */
  readonly grantee: IdentityId;
  /** The action being attempted. */
  readonly action: RightsAction;
  /**
   * The subject of the action (a storageRef, source ref or artifact id).
   * Used ONLY for matching against grant subject lists — never probed.
   */
  readonly subjectRef: string;
  /**
   * The explicit grant records to evaluate against — the caller's COMPLETE
   * view of grants for this decision (typically from
   * `RightsRepository.listRightsGrants(scope)`).
   */
  readonly grants: readonly RightsGrant[];
  /** ISO-8601 "now" used for expiry evaluation. */
  readonly now: string;
}

/** Why a request was denied. `null` on a granted verdict. */
export type RightsDenialReason =
  /** No explicit grant record exists in this tenant at all. */
  | 'no-explicit-grant'
  /** Grants exist in-tenant but none names this subject. */
  | 'subject-not-covered'
  /** Subject-covering grants exist but none is for this grantee. */
  | 'grantee-not-covered'
  /** Matching grants exist but none permits this action. */
  | 'action-not-covered'
  /** The only matching grants were revoked (append-only history). */
  | 'grant-revoked'
  /** The only matching grants have expired. */
  | 'grant-expired';

/** Result of a rights evaluation. */
export interface RightsEvaluationResult {
  readonly verdict: 'granted' | 'denied';
  /** Denial reason, or `null` when granted. */
  readonly reason: RightsDenialReason | null;
  /** The explicit grant that authorized the action, or `null` when denied. */
  readonly grantRef: RightsRef | null;
  /** Echo of the request subject, for audit records. */
  readonly subjectRef: string;
}

/**
 * Evaluate a rights request against explicit grant records.
 *
 * Deterministic cascade (first failing stage produces the denial reason):
 * 1. grants scoped to `tenantId` — none ⇒ `no-explicit-grant`;
 * 2. of those, grants whose `scope.subjectRefs` include `subjectRef` —
 *    none ⇒ `subject-not-covered`;
 * 3. of those, grants for `grantee` — none ⇒ `grantee-not-covered`;
 * 4. of those, grants permitting `action` — none ⇒ `action-not-covered`;
 * 5. of those, active grants (not revoked; expiry is EXCLUSIVE — a grant is
 *    valid strictly before `expiresAt`, JWT `exp` semantics): any ⇒
 *    **granted** (the first active one in input order is cited); all expired
 *    ⇒ `grant-expired`; otherwise all revoked ⇒ `grant-revoked`.
 *
 * The result never depends on anything but the inputs; calling twice with the
 * same request returns deep-equal results.
 */
export function evaluateRights(request: RightsEvaluationRequest): RightsEvaluationResult {
  const denied = (reason: RightsDenialReason): RightsEvaluationResult => ({
    verdict: 'denied',
    reason,
    grantRef: null,
    subjectRef: request.subjectRef,
  });

  // Stage 1: explicit grants in this tenant. Zero ⇒ the default denial.
  const inTenant = request.grants.filter((grant) => grant.tenantId === request.tenantId);
  if (inTenant.length === 0) {
    return denied('no-explicit-grant');
  }

  // Stage 2: subject coverage — an explicit grant must NAME this subject.
  const coveringSubject = inTenant.filter(
    (grant) => grant.scope.subjectRefs.includes(request.subjectRef),
  );
  if (coveringSubject.length === 0) {
    return denied('subject-not-covered');
  }

  // Stage 3: grantee.
  const forGrantee = coveringSubject.filter((grant) => grant.grantee === request.grantee);
  if (forGrantee.length === 0) {
    return denied('grantee-not-covered');
  }

  // Stage 4: action.
  const permitting = forGrantee.filter((grant) => grant.scope.actions.includes(request.action));
  if (permitting.length === 0) {
    return denied('action-not-covered');
  }

  // Stage 5: liveness of the surviving explicit grants.
  const notRevoked = permitting.filter((grant) => grant.revokedAt === null);
  if (notRevoked.length === 0) {
    return denied('grant-revoked');
  }
  const active = notRevoked.filter(
    (grant) => grant.expiresAt === null || grant.expiresAt > request.now,
  );
  if (active.length === 0) {
    return denied('grant-expired');
  }

  const grant = active[0];
  if (grant === undefined) {
    // Unreachable: active.length > 0 was checked above; noUncheckedIndexedAccess guard.
    return denied('no-explicit-grant');
  }
  return {
    verdict: 'granted',
    reason: null,
    grantRef: grant.id,
    subjectRef: request.subjectRef,
  };
}
