import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OPERATOR,
  TENANT,
  USER,
  captureRawTake,
  createSessionReadyForCapture,
  mustOk,
  mustTake,
  participantJoin,
  consentRef,
} from "../testing/test-fixtures.js";
import type { JoinParticipantRequest } from "./intake-types.js";
import type { SessionParticipant } from "../contracts/studio-session.js";
import type { IdentityRef } from "../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-001 + STUDIO-006: multi-account + consent enforcement through the
// REAL identity + rights authorities (§15, §27). The composed runtime's
// ParticipantIdentityPort / ParticipantConsentPort answer every admission and
// gate decision from the REAL @mos/identity / @mos/rights repositories.
// ---------------------------------------------------------------------------

/** Second, distinct participant identity (different MOS account, §15). */
const USER_2 = "identity-user-2" as IdentityRef;

test("session refuses a participant without real consent (join gate)", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();

  // Every participant must carry ACTIVE session-scoped consent records from
  // the rights authority — no anonymous pool, no caller-asserted booleans.
  const noRefs = await runtime.joinParticipant(sessionId, participantJoin({
    consent: { consentRefs: [] },
  }));
  assert.ok(!noRefs.ok && noRefs.error.kind === "consent-required-for-join" && noRefs.error.detail === "missing-consent-refs");

  // A consent record that belongs to the OTHER participant covers nothing
  // here (records are per-participant — never pooled, never merged): no
  // ACTIVE session consent remains for this participant.
  authorities.ensureIdentity({ tenantId: TENANT, identityRef: USER_2 });
  const foreignConsent = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER_2, sessionId, actions: ["use", "transform"],
  });
  const foreign = await runtime.joinParticipant(sessionId, participantJoin({
    consent: { consentRefs: [foreignConsent] },
  }));
  assert.ok(!foreign.ok && foreign.error.kind === "consent-required-for-join" && foreign.error.detail === "missing-consent-refs");

  // A subject (the recorded human) must have capture consent BEFORE joining.
  const transformOnly = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER, sessionId, actions: ["transform"],
  });
  const noCapture = await runtime.joinParticipant(sessionId, participantJoin({
    consent: { consentRefs: [transformOnly] },
  }));
  assert.ok(!noCapture.ok && noCapture.error.kind === "consent-required-for-join" && noCapture.error.detail === "capture-not-covered");

  // Nothing was admitted.
  assert.equal(runtime.getSession(sessionId)?.participants.length, 0);
});

test("admission requires the identity authority to know the identity and an active membership", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();

  // Unknown identity principal → explicit refusal (never a silent guess).
  const ghost = await runtime.joinParticipant(sessionId, participantJoin({
    identityRef: "identity-ghost" as never,
    consent: { consentRefs: [consentRef(1), consentRef(2)] },
  }));
  assert.ok(!ghost.ok && ghost.error.kind === "participant-identity-unknown");

  // Known identity WITHOUT an active workspace membership in the tenant →
  // no §15 authorization basis (bypassing the seeding helper and talking to
  // the REAL identity repository directly: upsert WITHOUT grantMembership).
  const { runtime: runtime2, sessionId: sessionId2, authorities } = await createSessionReadyForCapture();
  authorities.identityRepository.upsertIdentity({
    id: "identity-nobody" as never,
    displayName: "Nobody",
    kind: "user",
  });
  const membershipLess = await runtime2.joinParticipant(sessionId2, participantJoin({
    participantId: "participant-nobody" as never,
    identityRef: "identity-nobody" as never,
    consent: { consentRefs: [consentRef(1), consentRef(2)] },
  }));
  assert.ok(
    !membershipLess.ok && membershipLess.error.kind === "participant-not-authorized",
    `membership-less identity must be refused: ${JSON.stringify(membershipLess)}`,
  );

  // Nothing was admitted on either session.
  assert.equal(runtime.getSession(sessionId)?.participants.length, 0);
  assert.equal(runtime2.getSession(sessionId2)?.participants.length, 0);
});

test("processing is blocked when a participant did not consent to artifact processing", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();

  // Real consent covering capture (`use`) but NOT processing (`transform`).
  const captureOnly = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER, sessionId, actions: ["use"],
  });
  await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      consent: { consentRefs: [captureOnly] },
    })),
    "join",
  );
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  assert.ok(rawArtifact !== undefined);

  const blocked = await runtime.beginProcessing(sessionId);
  assert.ok(
    !blocked.ok && blocked.error.kind === "consent-required-for-processing",
    `beginProcessing must be consent-gated: ${JSON.stringify(blocked)}`,
  );
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "capturing");
});

test("STUDIO-006: two participants from different identities join with separate consent records", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();

  authorities.ensureIdentity({ tenantId: TENANT, identityRef: USER_2 });
  const secondCapture = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER_2, sessionId, actions: ["use"],
  });
  const secondProcessing = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER_2, sessionId, actions: ["transform"],
  });

  const first = await mustOk(
    runtime.joinParticipant(sessionId, participantJoin()),
    "join participant-1",
  );
  const second = await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      participantId: "participant-2" as never,
      identityRef: USER_2,
      accountBoundary: { accountId: "account-B" as never, deviceRef: "device-B1" as never },
      roles: ["subject"],
      grantedActions: ["capture"],
      grant: { grantedBy: USER_2 },
      consent: { consentRefs: [secondCapture, secondProcessing] },
    })),
    "join participant-2",
  );

  // Separate identity, account boundary, authorization, grant, consent.
  assert.notEqual(first.participant.identityRef, second.participant.identityRef);
  assert.notEqual(first.participant.accountBoundary.accountId, second.participant.accountBoundary.accountId);
  assert.deepEqual([...first.participant.authorization.grantedActions], ["capture", "review"]);
  assert.deepEqual([...second.participant.authorization.grantedActions], ["capture"]);
  assert.equal(first.participant.authorization.scopedToSession, sessionId);
  assert.notEqual(first.participant.participationGrant.grantId, second.participant.participationGrant.grantId);
  assert.deepEqual([...first.participant.consent.consentRefs], [consentRef(1), consentRef(2)]);
  assert.deepEqual([...second.participant.consent.consentRefs], [secondCapture, secondProcessing]);
  assert.notEqual(first.participant.consent.consentRefs[0], second.participant.consent.consentRefs[0]);

  // The two consent records resolve SEPARATELY in the rights authority: each
  // participant's coverage is derived only from its own records.
  const firstResolution = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: TENANT, sessionId, participantIdentityRef: USER,
    consentRefs: first.participant.consent.consentRefs,
  });
  const secondResolution = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: TENANT, sessionId, participantIdentityRef: USER_2,
    consentRefs: [secondCapture, secondProcessing],
  });
  assert.equal(firstResolution.coversCapture, true);
  assert.equal(secondResolution.coversCapture, true);
  assert.equal(firstResolution.consentRefs.length, 2);
  assert.equal(secondResolution.consentRefs.length, 2);
  assert.notDeepEqual(firstResolution.consentRefs, secondResolution.consentRefs);
});

test("STUDIO-006: mid-session consent revocation blocks further capture and processing", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");

  // Capture works while the consent is active.
  const firstTake = await captureRawTake(runtime, sessionId, {});
  assert.ok(firstTake !== undefined);

  // Revoke the CAPTURE consent in the REAL rights authority (append-only).
  authorities.revokeSessionConsent(TENANT, consentRef(1));

  // A further capture is blocked — the runtime re-resolves LIVE, never
  // trusting the frozen join-time consent snapshot.
  const denied = await runtime.openCapture(sessionId, {
    participantId: "participant-1" as never,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: "mic-studio-48k",
    rightsRef: "rights-context-1" as never,
    provenanceRef: "provenance-capture-2" as never,
  });
  assert.ok(!denied.ok && denied.error.kind === "consent-required-for-capture");

  // Revoking the PROCESSING consent blocks beginProcessing the same way.
  authorities.revokeSessionConsent(TENANT, consentRef(2));
  const blocked = await runtime.beginProcessing(sessionId);
  assert.ok(
    !blocked.ok && blocked.error.kind === "consent-required-for-processing",
    `revoked processing consent must block: ${JSON.stringify(blocked)}`,
  );
});

test("multi-account participants keep identity/account/authorization/consent separate (§15)", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();

  const first = await mustOk(
    runtime.joinParticipant(sessionId, participantJoin()),
    "join participant-1",
  );
  // participant-2 is an operator whose real consent covers processing only
  // (the operator role does not imply being recorded): joinable, but
  // capture-gated below.
  authorities.ensureIdentity({ tenantId: TENANT, identityRef: USER_2 });
  const operatorConsent = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER_2, sessionId, actions: ["transform"],
  });
  const second = await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      participantId: "participant-2" as never,
      identityRef: USER_2,
      accountBoundary: { accountId: "account-B" as never, deviceRef: "device-B1" as never },
      roles: ["operator"],
      grantedActions: ["operate-capture"],
      grant: { grantedBy: USER_2 },
      consent: { consentRefs: [operatorConsent] },
    })),
    "join participant-2",
  );

  // Separate identity, account boundary, authorization, grant, consent.
  assert.notEqual(first.participant.identityRef, second.participant.identityRef);
  assert.notEqual(first.participant.accountBoundary.accountId, second.participant.accountBoundary.accountId);
  assert.deepEqual([...first.participant.authorization.grantedActions], ["capture", "review"]);
  assert.deepEqual([...second.participant.authorization.grantedActions], ["operate-capture"]);
  assert.equal(first.participant.authorization.scopedToSession, sessionId);
  assert.notEqual(first.participant.participationGrant.grantId, second.participant.participationGrant.grantId);
  assert.deepEqual([...first.participant.consent.consentRefs], [consentRef(1), consentRef(2)]);
  assert.deepEqual([...second.participant.consent.consentRefs], [operatorConsent]);

  // Only participant-1 consented to capture: participant-2 cannot open one.
  const denied = await runtime.openCapture(sessionId, {
    participantId: "participant-2" as never,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: "mic-studio-48k",
    rightsRef: "rights-context-1" as never,
    provenanceRef: "provenance-capture-2" as never,
  });
  assert.ok(!denied.ok && denied.error.kind === "consent-required-for-capture");

  // participant-1 captures; contribution provenance lands on participant-1 only.
  await captureRawTake(runtime, sessionId, {});
  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  const p1 = view.participants.find((p) => p.participantId === "participant-1");
  const p2 = view.participants.find((p) => p.participantId === "participant-2");
  assert.ok(p1 && p2);
  assert.equal(p1.contributionProvenance.provenanceRefs.length, 1);
  assert.equal(p2.contributionProvenance.provenanceRefs.length, 0);
});

test("STUDIO-006: contribution provenance is recorded per participant across takes", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();

  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join p1");
  authorities.ensureIdentity({ tenantId: TENANT, identityRef: USER_2 });
  const secondConsent = authorities.recordSessionConsent({
    tenantId: TENANT, identityRef: USER_2, sessionId, actions: ["use"],
  });
  await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      participantId: "participant-2" as never,
      identityRef: USER_2,
      accountBoundary: { accountId: "account-C" as never, deviceRef: "device-C1" as never },
      roles: ["subject"],
      grantedActions: ["capture"],
      grant: { grantedBy: USER_2 },
      consent: { consentRefs: [secondConsent] },
    })),
    "join p2",
  );

  // Each participant captures one take on its own account/device boundary.
  await captureRawTake(runtime, sessionId, { provenanceRef: "provenance-capture-p1" as never });
  const opened = await mustOk(
    runtime.openCapture(sessionId, {
      participantId: "participant-2" as never,
      mediaKind: "audio",
      deviceClass: "microphone",
      sourceId: "mic-studio-48k",
      rightsRef: "rights-context-1" as never,
      provenanceRef: "provenance-capture-p2" as never,
    }),
    "openCapture p2",
  );
  await opened.start();
  await mustTake(opened.stop(), "stop p2");

  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  const p1 = view.participants.find((p) => p.participantId === "participant-1");
  const p2 = view.participants.find((p) => p.participantId === "participant-2");
  assert.ok(p1 && p2);
  assert.equal(p1.contributionProvenance.provenanceRefs.length, 1);
  assert.equal(p2.contributionProvenance.provenanceRefs.length, 1);
  assert.equal(String(p1.contributionProvenance.provenanceRefs[0]), "provenance-capture-p1");
  assert.equal(String(p2.contributionProvenance.provenanceRefs[0]), "provenance-capture-p2");
});

// ——— Credentials are NEVER merged or stored (§15 structural guarantees) ———

/** Keys whose names betray a credential/secret surface. */
type CredentialishKey<T> = {
  [K in keyof T]-?: K extends `${string}${"credential" | "secret" | "password" | "apikey" | "token"}${string}` ? K : never;
}[keyof T];
/** Asserts (compile-time) that a type exposes no credential-ish key at all. */
type HasNoCredentialSurface<T> = [CredentialishKey<T>] extends [never] ? true : never;

const joinRequestIsCredentialFree: HasNoCredentialSurface<JoinParticipantRequest> = true;
const participantRecordIsCredentialFree: HasNoCredentialSurface<SessionParticipant> = true;
void joinRequestIsCredentialFree;
void participantRecordIsCredentialFree;

test("STUDIO-006 structural: no API surface stores participant credentials — only identity refs + grants", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");

  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  // The serialized session carries refs + grants only: no credential-ish key
  // ever appears in the stored participant data.
  const serialized = JSON.stringify(view.participants);
  assert.match(serialized, /"identityRef"/);
  assert.match(serialized, /"participationGrant"/);
  for (const forbidden of ["credential", "password", "secret", "apikey"]) {
    assert.ok(
      !serialized.includes(forbidden),
      `session participant data must never contain "${forbidden}"`,
    );
  }

  // The join REQUEST surface is the only participant intake surface: its
  // runtime shape carries exactly the ref/grant fields, nothing else.
  const request: JoinParticipantRequest = participantJoin();
  assert.deepEqual(Object.keys(request).sort(), [
    "accountBoundary",
    "consent",
    "grant",
    "grantedActions",
    "identityRef",
    "participantId",
    "roles",
  ]);
});

test("duplicate participant ids and disallowed roles are rejected", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");

  const duplicate = await runtime.joinParticipant(sessionId, participantJoin());
  assert.ok(!duplicate.ok && duplicate.error.kind === "duplicate-participant");

  const badRole = await runtime.joinParticipant(sessionId, participantJoin({
    participantId: "participant-3" as never,
    roles: ["interviewer"], // reaction format does not allow interviewer
  }));
  assert.ok(!badRole.ok && badRole.error.kind === "role-not-allowed-by-format");
});

test("beginProcessing enforces the format's participant minimum", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();
  // No participants joined yet — reaction requires at least 1.
  const blocked = await runtime.beginProcessing(sessionId);
  assert.ok(
    !blocked.ok && blocked.error.kind === "participant-count-out-of-range",
    `participant minimum enforced: ${JSON.stringify(blocked)}`,
  );
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "capturing");

  // Consent gates also fire with no raw artifacts yet (join-gate first).
  const reviewWithoutProcessing = await runtime.submitReview(sessionId, {
    targetArtifactId: "art-none",
    outcome: "accept",
    decidedBy: OPERATOR,
  });
  assert.ok(!reviewWithoutProcessing.ok && reviewWithoutProcessing.error.kind === "operation-not-allowed-in-state");
});
