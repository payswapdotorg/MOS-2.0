/**
 * Participant intake for the Studio runtime (STUDIO-001).
 *
 * §15 multi-account discipline: every joined participant carries SEPARATE
 * identity, account boundary, authorization, participation grant, consent
 * and contribution provenance — never merged. The precondition checks are
 * pure functions; the runtime applies them before mutating session state.
 */

import type { StudioRuntimeError } from "./errors.js";
import type { JoinParticipantRequest } from "./intake-types.js";
import type { StudioSessionRecord } from "./session-state.js";
import type { SessionParticipant } from "../contracts/studio-session.js";
import type { SessionParticipantId, StudioSessionId, Timestamp } from "../contracts/refs.js";

/**
 * Preconditions for joining a participant: state, allowed roles,
 * duplicate id, participant maximum and — when the format requires consent
 * refs on raw capture — per-participant consent coverage:
 * - EVERY participant must carry at least one consent record (there is no
 *   anonymous pool; attribution is mandatory §15);
 * - a participant holding the `subject` role (the recorded human whose
 *   capture is the point of the session) must have `coversCapture` consent
 *   BEFORE joining — the session refuses an unconsented subject;
 * - other roles (interviewer/operator/observer) are consent-checked at
 *   capture-open time (`consent-required-for-capture`) if and when they
 *   attempt to record.
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
  if (record.formatPlugin.provenanceRequirements.requiresConsentRefsOnRawCapture) {
    if (request.consent.consentRefs.length === 0) {
      return { kind: "consent-required-for-join", participantId: request.participantId, detail: "missing-consent-refs" };
    }
    if (request.roles.includes("subject") && !request.consent.coversCapture) {
      return { kind: "consent-required-for-join", participantId: request.participantId, detail: "capture-not-covered" };
    }
  }
  return undefined;
}

/** Build the frozen `SessionParticipant` record (§15 — every field separate). */
export function buildSessionParticipant(
  request: JoinParticipantRequest,
  sessionId: StudioSessionId,
  grantedAt: Timestamp,
  nextGrantId: () => string,
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
    consent: Object.freeze({
      consentRefs: Object.freeze([...request.consent.consentRefs]),
      coversCapture: request.consent.coversCapture,
      coversProcessingIntoArtifacts: request.consent.coversProcessingIntoArtifacts,
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
