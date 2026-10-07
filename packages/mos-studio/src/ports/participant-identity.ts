/**
 * Studio-owned participant identity port (STUDIO-006, §15).
 *
 * The identity AUTHORITY is `@mos/identity` (CORE-002); the Studio only
 * CONSUMES it through this narrow port. The port speaks the studio's
 * cross-authority vocabulary (`IdentityRef`, `TenantId` from
 * `@mos/contracts`) and returns the REAL `@mos/identity` domain records
 * (`Identity`, `Membership`) — the adapter (testing seam / composition root)
 * bridges the packages' compile-time brands, which are erased at runtime.
 *
 * §15 multi-account discipline: joining a session requires (a) the referenced
 * identity principal to EXIST in the identity authority and (b) an ACTIVE
 * workspace membership in the session's tenant — the authorization basis for
 * participation. The Studio stores only identity REFS and grants; it never
 * stores or merges participant credentials.
 */

import type { Identity, Membership } from "@mos/identity";
import type { IdentityRef, TenantId } from "../contracts/refs.js";

/** Resolution of one prospective participant's identity + tenant authorization. */
export interface ParticipantIdentityResolution {
  readonly identityRef: IdentityRef;
  /** The REAL identity record, or `null` when the authority does not know it. */
  readonly identity: Identity | null;
  /** ACTIVE workspace memberships of this identity inside the tenant (may be empty). */
  readonly activeMemberships: readonly Membership[];
}

/** Input of {@link ParticipantIdentityPort.resolveParticipantIdentity}. */
export interface ParticipantIdentityQuery {
  readonly tenantId: TenantId;
  readonly identityRef: IdentityRef;
}

/**
 * Narrow port over the identity authority for participant admission
 * (STUDIO-006). Real binding: adapters compose the REAL
 * `@mos/identity` `IdentityRepository` (see
 * testing/participant-authority-adapters.ts); durable repositories replace
 * the in-memory ones at the composition root without touching this port.
 */
export interface ParticipantIdentityPort {
  /** Resolve an identity principal and its active tenant memberships. */
  resolveParticipantIdentity(query: ParticipantIdentityQuery): Promise<ParticipantIdentityResolution>;
}
