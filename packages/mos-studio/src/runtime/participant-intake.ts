/**
 * Participant intake for the Studio runtime (STUDIO-001 + STUDIO-006).
 *
 * §15 multi-account discipline: every joined participant carries SEPARATE
 * identity, account boundary, authorization, participation grant, consent
 * and contribution provenance — never merged. STUDIO-006 replaces the
 * caller-asserted consent booleans of the W1-C test-double machinery with
 * LIVE resolution through the studio ports over the REAL identity + rights
 * authorities: the identity must exist and hold an active workspace
 * membership in the tenant, and consent coverage is DERIVED from real
 * consent records (unknown/revoked/foreign records cover nothing).
 */

import type { StudioRuntimeError } from "./errors.js";
import type { JoinParticipantRequest } from "./intake-types.js";
import type { StudioSessionRecord } from "./session-state.js";
import type { SessionParticipant } from "../contracts/studio-session.js";
import type { SessionParticipantId, StudioSessionId, Timestamp } from "../contracts/refs.js";
import type { ParticipantConsentResolution } from "../ports/participant-consent.js";
import type { ParticipantConsentPort } from "../ports/participant-consent.js";
import type { ParticipantIdentityPort } from "../ports/participant-identity.js";

/** The studio-owned authority ports the admission flow consumes. */
export interface ParticipantAuthorityPorts {
  readonly participantIdentityPort: ParticipantIdentityPort;
  readonly participantConsentPort: ParticipantConsentPort;
}

/**
 * Structural join preconditions (state, allowed roles, duplicate id,
 * participant maximum). Consent/identity gates are authority-backed and live
 * in {@link admitParticipant}.
 */
export function checkJoinPreconditions(
  record: StudioSessionRecord,
  request: JoinParticipantRequest,
): StudioRuntimeError | undefined {
  if (record.session.lifecycle.state !== "capturing") {
    return {
      kind: "operation-not-allowed-in-state",
      operation: "joinParticipant",
      state: record.session.lifecycle.state,
    };
  }
  const model = record.formatPlugin.participantModel;
  const disallowed = request.roles.filter((role) => !model.allowedRoles.includes(role));
  if (disallowed.length > 0) {
    return { kind: "role-not-allowed-by-format", roles: disallowed, allowedRoles: [...model.allowedRoles] };
  }
  if (record.participants.has(request.participantId)) {
    return { kind: "duplicate-participant", participantId: request.participantId, sessionId: record.sessionId };
  }
  if (record.participants.size + 1 > model.maximumParticipants) {
    return {
      kind: "participant-count-out-of-range",
      count: record.participants.size + 1,
      minimum: model.minimumParticipants,
      maximum: model.maximumParticipants,
    };
  }
  return undefined;
}

/**
 * Admit one participant through the REAL authorities (§15):
 * 1. the identity principal must EXIST (identity authority);
 * 2. it must hold an ACTIVE workspace membership in the session tenant
 *    (authorization basis);
 * 3. when the format requires consent refs on raw capture, every participant
 *    must carry ≥1 ACTIVE session-scoped consent record (no anonymous pool)
 *    and a `subject` role must have capture coverage BEFORE joining;
 *    interviewer/operator/observer roles are consent-checked at
 *    capture-open time.
 */
export async function admitParticipant(
  record: StudioSessionRecord,
  request: JoinParticipantRequest,
  ports: ParticipantAuthorityPorts,
): Promise<{ ok: true; consent: ParticipantConsentResolution } | { ok: false; error: StudioRuntimeError }> {
  const structural = checkJoinPreconditions(record, request);
  if (structural !== undefined) {
    return { ok: false, error: structural };
  }
  const identity = await ports.participantIdentityPort.resolveParticipantIdentity({
    tenantId: record.tenantId,
    identityRef: request.identityRef,
  });
  if (identity.identity === null) {
    return {
      ok: false,
      error: {
        kind: "participant-identity-unknown",
        participantId: request.participantId,
        identityRef: request.identityRef,
      },
    };
  }
  if (identity.activeMemberships.length === 0) {
    return {
      ok: false,
      error: {
        kind: "participant-not-authorized",
        participantId: request.participantId,
        identityRef: request.identityRef,
      },
    };
  }
  const consent = await ports.participantConsentPort.resolveParticipantConsent({
    tenantId: record.tenantId,
    sessionId: record.sessionId,
    participantIdentityRef: request.identityRef,
    consentRefs: request.consent.consentRefs,
  });
  if (record.formatPlugin.provenanceRequirements.requiresConsentRefsOnRawCapture) {
    if (consent.activeSessionConsentCount === 0) {
      return { ok: false, error: { kind: "consent-required-for-join", participantId: request.participantId, detail: "missing-consent-refs" } };
    }
    if (request.roles.includes("subject") && !consent.coversCapture) {
      return { ok: false, error: { kind: "consent-required-for-join", participantId: request.participantId, detail: "capture-not-covered" } };
    }
  }
  return { ok: true, consent };
}

/** Build the frozen `SessionParticipant` record (§15 — every field separate). */
export function buildSessionParticipant(
  request: JoinParticipantRequest,
  sessionId: StudioSessionId,
  grantedAt: Timestamp,
  nextGrantId: () => string,
  consent: ParticipantConsentResolution,
): SessionParticipant {
  return Object.freeze({
    participantId: request.participantId,
    identityRef: request.identityRef,
    accountBoundary: Object.freeze({ ...request.accountBoundary }),
    authorization: Object.freeze({
      grantedActions: Object.freeze([...request.grantedActions]),
      scopedToSession: sessionId,
    }),
    participationGrant: Object.freeze({
      grantId: nextGrantId() as SessionParticipant["participationGrant"]["grantId"],
      grantedBy: request.grant.grantedBy,
      grantedAt,
      expiresAt: request.grant.expiresAt,
    }),
    // Consent snapshot derived from the LIVE authority resolution (audit);
    // the capture/processing gates re-resolve live, so a mid-session
    // revocation blocks further capture/processing even though this
    // join-time snapshot stays frozen.
    consent: Object.freeze({
      consentRefs: Object.freeze([...request.consent.consentRefs]),
      coversCapture: consent.coversCapture,
      coversProcessingIntoArtifacts: consent.coversProcessingIntoArtifacts,
    }),
    contributionProvenance: Object.freeze({ provenanceRefs: [] }),
    roles: Object.freeze([...request.roles]),
  });
}

/** Participant lookup helper used by capture opening. */
export function findParticipant(
  record: StudioSessionRecord,
  participantId: SessionParticipantId,
): { participant: SessionParticipant } | { error: StudioRuntimeError } {
  const participant = record.participants.get(participantId);
  if (participant === undefined) {
    return { error: { kind: "participant-not-found", participantId, sessionId: record.sessionId } };
  }
  return { participant };
}
