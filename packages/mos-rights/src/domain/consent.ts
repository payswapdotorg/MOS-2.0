import type { IdentityId, TenantId } from '@mos/identity';
import type { RightsAction } from './rights-grant.js';
import type { ConsentRecordId } from './ids.js';

/**
 * What a consent covers: the actions consented to, applied to the explicit set
 * of subject references. Mirrors {@link RightsScope} because a consent record
 * is one of the sources a rights grant can be backed by.
 */
export interface ConsentScope {
  /** Actions the participant consents to. Must contain at least one action. */
  readonly actions: readonly RightsAction[];
  /** Subjects the consent covers, as opaque refs. Must contain at least one. */
  readonly subjectRefs: readonly string[];
}

/**
 * A participant's consent record (architecture §27: "Participant contributions
 * require explicit authorization/consent data").
 *
 * Append-only revocation, exactly like rights grants: revoking sets
 * `revokedAt` and bumps `version`; the record is never deleted. Consent is
 * per-participant, per-purpose, per-scope — never blanket.
 *
 * This is the record referenced by `HumanProductionTask.rightsConsent` in the
 * frozen contracts YAML (via its stable {@link ConsentRef} form).
 */
export interface ConsentRecord {
  readonly id: ConsentRecordId;
  readonly tenantId: TenantId;
  /** Monotonic record version; starts at 1, bumped on revocation. */
  readonly version: number;
  /** The identity principal that gave the consent (the participant). */
  readonly participantRef: IdentityId;
  /**
   * What the consent is FOR — a declarative purpose statement (e.g. "voice
   * capture for the Q4 podcast pilot"). Blank purposes are rejected.
   */
  readonly purpose: string;
  /** What the consent covers (actions over subjects). */
  readonly scope: ConsentScope;
  /** ISO-8601 timestamp of the consent. */
  readonly grantedAt: string;
  /** ISO-8601 timestamp of the (append-only) revocation, or `null` while active. */
  readonly revokedAt: string | null;
}
