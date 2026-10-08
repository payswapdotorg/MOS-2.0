/**
 * STUDIO-014 (§15/§27 live consent re-resolution at operator actions).
 *
 * Re-resolve the consent behind every raw artifact of the session — every
 * entry of the draft's §15 coverage list whose consenting holder identity
 * is known (captures: the capturing participant; imported sources: the
 * source holder) must STILL cover processing into artifacts. A revoked
 * consent surfaces at the NEXT operator action as a typed failure — never
 * silently passed. Entries without a known holder keep their recorded
 * consent refs (disclosed: no re-resolution subject).
 *
 * Extracted from studio-runtime.ts so the runtime file stays within the
 * architecture file-size budget.
 */

import type { StudioSessionRecord } from "./session-state.js";
import type { ParticipantConsentPort } from "../ports/participant-consent.js";
import type { StudioRuntimeError } from "./errors.js";

/** The §15 live re-resolution behind submitReview/applyTreatment gates. */
export async function operatorConsentFailure(
  record: StudioSessionRecord,
  participantConsentPort: ParticipantConsentPort,
): Promise<StudioRuntimeError | null> {
  const participantIdentities = new Set(
    [...record.participants.values()].map((participant) => String(participant.identityRef)),
  );
  for (const entry of record.draft.rawArtifactConsent.values()) {
    if (entry.holderIdentityRef === undefined) {
      continue;
    }
    const resolution = await participantConsentPort.resolveParticipantConsent({
      tenantId: record.tenantId,
      sessionId: record.sessionId,
      participantIdentityRef: entry.holderIdentityRef,
      consentRefs: entry.consentRefs,
    });
    if (!resolution.coversProcessingIntoArtifacts) {
      return {
        kind: "consent-required-for-operator-action",
        sessionId: record.sessionId,
        subjectIdentityRef: entry.holderIdentityRef,
        subjectKind: participantIdentities.has(String(entry.holderIdentityRef))
          ? "participant"
          : "imported-source",
      } satisfies StudioRuntimeError;
    }
  }
  return null;
}
