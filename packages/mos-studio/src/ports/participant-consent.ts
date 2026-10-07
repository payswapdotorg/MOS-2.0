/**
 * Studio-owned participant consent port (STUDIO-006, §15/§27).
 *
 * The consent AUTHORITY is `@mos/rights` (CORE-003): append-only
 * `ConsentRecord`s with per-participant, per-purpose, per-scope coverage and
 * append-only revocation. The Studio only CONSUMES consent through this
 * narrow port and derives its two session gates from the records.
 *
 * Documented studio↔rights coverage convention (explicit, deterministic —
 * the rights action vocabulary is closed and Tech-Lead-owned):
 * - CONSENT SUBJECT: a consent covers a session only when its
 *   `scope.subjectRefs` include `studio-session:<sessionId>` — consent is
 *   never blanket across sessions;
 * - COVERS CAPTURE ⇔ the participant holds an ACTIVE (non-revoked,
 *   participant-owned, tenant-scoped, session-subject) consent whose actions
 *   include `use` (taking the participant's contribution into the session);
 * - COVERS PROCESSING INTO ARTIFACTS ⇔ likewise with `transform`.
 *
 * Because the authority is live behind the port, a mid-session consent
 * REVOCATION changes the derived verdict immediately — the runtime re-checks
 * at capture-open and processing-start, never trusting a join-time snapshot.
 */

import type { ConsentRef, IdentityRef, StudioSessionId, TenantId } from "../contracts/refs.js";

/** The consent subject convention binding a consent record to one session. */
export const studioSessionConsentSubject = (sessionId: StudioSessionId): string =>
  `studio-session:${sessionId}`;

/** The rights action that covers recording a participant's contribution. */
export const STUDIO_CONSENT_CAPTURE_ACTION = "use" as const;

/** The rights action that covers processing contributions into artifacts. */
export const STUDIO_CONSENT_PROCESSING_ACTION = "transform" as const;

/** Derived consent coverage of one participant for one session. */
export interface ParticipantConsentResolution {
  readonly participantIdentityRef: IdentityRef;
  /** The consent refs that were resolved (input echo, for audit). */
  readonly consentRefs: readonly ConsentRef[];
  /** Active session-scoped consents found (records matching participant + tenant + subject). */
  readonly activeSessionConsentCount: number;
  /** Derived gate verdicts (see module doc for the documented mapping). */
  readonly coversCapture: boolean;
  readonly coversProcessingIntoArtifacts: boolean;
}

/** Input of {@link ParticipantConsentPort.resolveParticipantConsent}. */
export interface ParticipantConsentQuery {
  readonly tenantId: TenantId;
  readonly sessionId: StudioSessionId;
  readonly participantIdentityRef: IdentityRef;
  readonly consentRefs: readonly ConsentRef[];
}

/**
 * Narrow port over the rights authority for participant consent (STUDIO-006).
 * Real binding: adapters compose the REAL `@mos/rights` `RightsRepository`
 * (see testing/participant-authority-adapters.ts).
 */
export interface ParticipantConsentPort {
  /** Resolve the derived consent coverage for one participant in one session. */
  resolveParticipantConsent(query: ParticipantConsentQuery): Promise<ParticipantConsentResolution>;
}
