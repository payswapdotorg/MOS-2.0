import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OPERATOR,
  captureRawTake,
  createSessionReadyForCapture,
  mustOk,
  participantJoin,
  consentRef,
} from "../testing/test-fixtures.js";
import type { SubmitReviewInput } from "./intake-types.js";

// ---------------------------------------------------------------------------
// STUDIO-001: multi-account + consent enforcement (§15, §27)
// ---------------------------------------------------------------------------

test("session refuses a participant without consent (join gate)", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();

  // Every participant must carry consent records — no anonymous pool.
  const noRefs = await runtime.joinParticipant(sessionId, participantJoin({
    consent: { consentRefs: [], coversCapture: true, coversProcessingIntoArtifacts: true },
  }));
  assert.ok(!noRefs.ok && noRefs.error.kind === "consent-required-for-join" && noRefs.error.detail === "missing-consent-refs");

  // A subject (the recorded human) must have capture consent BEFORE joining.
  const noCapture = await runtime.joinParticipant(sessionId, participantJoin({
    consent: { consentRefs: [consentRef(3)], coversCapture: false, coversProcessingIntoArtifacts: true },
  }));
  assert.ok(!noCapture.ok && noCapture.error.kind === "consent-required-for-join" && noCapture.error.detail === "capture-not-covered");

  // Nothing was admitted.
  assert.equal(runtime.getSession(sessionId)?.participants.length, 0);
});

test("processing is blocked when a participant did not consent to artifact processing", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();

  // Joined with capture consent but NOT processing consent.
  await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      consent: { consentRefs: [consentRef(9)], coversCapture: true, coversProcessingIntoArtifacts: false },
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

test("multi-account participants keep identity/account/authorization/consent separate (§15)", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();

  const first = await mustOk(
    runtime.joinParticipant(sessionId, participantJoin()),
    "join participant-1",
  );
  // participant-2 is an operator WITHOUT capture consent: joinable (the
  // operator role does not imply being recorded), but capture-gated below.
  const second = await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      participantId: "participant-2" as never,
      identityRef: "identity-user-2" as never,
      accountBoundary: { accountId: "account-B" as never, deviceRef: "device-B1" as never },
      roles: ["operator"],
      grantedActions: ["operate-capture"],
      consent: { consentRefs: [consentRef(7)], coversCapture: false, coversProcessingIntoArtifacts: true },
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
  assert.deepEqual([...second.participant.consent.consentRefs], [consentRef(7)]);

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
  } satisfies SubmitReviewInput);
  assert.ok(!reviewWithoutProcessing.ok && reviewWithoutProcessing.error.kind === "operation-not-allowed-in-state");
});
