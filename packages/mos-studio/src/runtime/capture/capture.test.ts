import assert from "node:assert/strict";
import { test } from "node:test";

import { createInMemoryCaptureSourcePort } from "./in-memory-capture-source.js";
import { createStudioCaptureSession } from "./studio-capture-session.js";
import { createInMemoryArtifactFactory } from "../../testing/in-memory-artifact-factory.js";
import { createDeterministicClock } from "../../testing/compose-runtime-for-tests.js";
import {
  captureRawTake,
  createSessionReadyForCapture,
  mustOk,
  mustTake,
  participantJoin,
  TENANT,
} from "../../testing/test-fixtures.js";
import type { ConsentRef, IdentityRef } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-005: capture session lifecycle, consent gate, raw artifact emission
// (in-memory capture source is a DISCLOSED TEST DOUBLE — no device involved)
// ---------------------------------------------------------------------------

test("capture session lifecycle: start → stop seals; stop-before-start and double-stop fail explicitly", async () => {
  const clock = createDeterministicClock();
  const captureSource = createInMemoryCaptureSourcePort({ now: clock, fixedTakeSeconds: 5 });
  const artifactFactory = createInMemoryArtifactFactory();
  const recorded: unknown[] = [];
  const consentRefs = ["consent-cap-1"] as never as readonly ConsentRef[];

  const buildSession = () =>
    createStudioCaptureSession({
      captureSourcePort: captureSource,
      artifactFactory,
      recorder: { onRawArtifact: (event) => recorded.push(event) },
      source: captureSource.sources[0] as never,
      targetStorage: "mos-studio:capture:test" as never,
      sessionId: "sess-cap-1" as never,
      tenantId: "tenant-cap" as never,
      takeLabel: "cap-test",
      consentRefs,
      rightsRef: "rights-cap-1" as never,
      provenanceRef: "provenance-cap-1" as never,
      capturedBy: {
        participantId: "participant-cap" as never,
        role: "subject",
        consentRefs,
      },
    });

  // stop() before start() → take-not-started.
  const notStarted = await buildSession().stop();
  assert.ok(!notStarted.ok && notStarted.error.kind === "take-not-started");

  // start → stop → sealed: take succeeds, artifact recorded once.
  const session = buildSession();
  await session.start();
  const take = await mustTake(session.stop(), "capture stop");
  assert.equal(take.artifact.stage, "raw");
  assert.equal(take.artifact.creationMethod, "human-capture");
  assert.equal(recorded.length, 1);

  // Second stop on the same session → take-already-sealed.
  const doubleStop = await session.stop();
  assert.ok(!doubleStop.ok && doubleStop.error.kind === "take-already-sealed");

  // Abort seals without emitting anything.
  const aborted = buildSession();
  await aborted.start();
  await aborted.abort();
  const afterAbort = await aborted.stop();
  assert.ok(!afterAbort.ok && afterAbort.error.kind === "take-already-sealed");
});

test("raw capture emission carries provenance labeling: receipt binding, digest, storage ref, consent coverage", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");

  const opened = await mustOk(
    runtime.openCapture(sessionId, {
      participantId: "participant-1" as never,
      mediaKind: "audio",
      deviceClass: "microphone",
      sourceId: "mic-studio-48k",
      rightsRef: "rights-context-42" as never,
      provenanceRef: "provenance-capture-42" as never,
    }),
    "openCapture",
  );
  assert.equal(opened.sessionId, sessionId);
  assert.equal(opened.capturedBy.participantId, "participant-1");
  assert.deepEqual([...opened.capturedBy.consentRefs], ["consent-1", "consent-2"]);

  await opened.start();
  const take = await mustTake(opened.stop(), "capture stop");

  // Receipt: attributable binding, real digest shape, session-scoped storage.
  assert.equal(take.receipt.mediaKind, "audio");
  assert.equal(take.receipt.capturedBy.participantId, "participant-1");
  assert.equal(take.receipt.capturedBy.role, "subject");
  assert.match(take.receipt.digest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(String(take.receipt.storageRef).startsWith("mos-studio:capture:"));

  // Raw artifact: provenance labeling per §6/§30 — explicit rights + provenance
  // refs, raw stage, human-capture creation method, no parents.
  const artifact = take.artifact;
  assert.equal(artifact.stage, "raw");
  assert.equal(artifact.creationMethod, "human-capture");
  assert.equal(artifact.parentArtifactRefs.length, 0);
  assert.equal(artifact.rightsRef, "rights-context-42");
  assert.equal(artifact.provenanceRef, "provenance-capture-42");
  assert.equal(artifact.digest, take.receipt.digest);

  // The raw artifact landed in the session draft with consent coverage.
  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  assert.deepEqual(view.rawArtifacts.map((a) => a.artifactId), [artifact.artifactId]);
});

test("multiple takes accumulate: durations and contribution provenance per participant", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");

  const first = await captureRawTake(runtime, sessionId, {});
  const second = await captureRawTake(runtime, sessionId, {
    provenanceRef: "provenance-capture-2" as never,
  });
  assert.notEqual(first.artifactId, second.artifactId);

  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.rawArtifacts.length, 2);
  // Deterministic fixture: fixedTakeSeconds = 42 per take.
  assert.equal(view.session.lifecycle.state, "capturing");
  const participant = view.participants.find((p) => p.participantId === "participant-1");
  assert.ok(participant !== undefined);
  assert.equal(participant.contributionProvenance.provenanceRefs.length, 2);
});

test("capture cannot be opened by an observer (role derives no capture capability)", async () => {
  const { runtime, sessionId, authorities } = await createSessionReadyForCapture();
  // The observer joins with REAL capture-consenting records (so the consent
  // gate passes); the denial below is therefore purely the role capability.
  const OBSERVER_IDENTITY = "identity-observer-1" as IdentityRef;
  authorities.ensureIdentity({ tenantId: TENANT, identityRef: OBSERVER_IDENTITY });
  const observerConsent = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef: OBSERVER_IDENTITY,
    sessionId,
    actions: ["use", "transform"],
  });
  await mustOk(
    runtime.joinParticipant(sessionId, participantJoin({
      participantId: "participant-obs" as never,
      identityRef: OBSERVER_IDENTITY,
      roles: ["observer"],
      grantedActions: ["observe"],
      grant: { grantedBy: OBSERVER_IDENTITY },
      consent: { consentRefs: [observerConsent] },
    })),
    "join observer",
  );
  const denied = await runtime.openCapture(sessionId, {
    participantId: "participant-obs" as never,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: "mic-studio-48k",
    rightsRef: "rights-context-1" as never,
    provenanceRef: "provenance-obs" as never,
  });
  assert.ok(!denied.ok && denied.error.kind === "participant-cannot-capture");
});

test("capture source validation: unknown source and insufficient device are explicit failures", async () => {
  const { runtime, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");

  const unknownSource = await runtime.openCapture(sessionId, {
    participantId: "participant-1" as never,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: "mic-does-not-exist",
    rightsRef: "rights-context-1" as never,
    provenanceRef: "provenance-capture-1" as never,
  });
  assert.ok(!unknownSource.ok && unknownSource.error.kind === "capture-source-not-found");

  // 8 kHz mic cannot satisfy the reaction format's 16 kHz requirement.
  const insufficient = await runtime.openCapture(sessionId, {
    participantId: "participant-1" as never,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: "mic-built-in-low",
    rightsRef: "rights-context-1" as never,
    provenanceRef: "provenance-capture-1" as never,
  });
  assert.ok(!insufficient.ok && insufficient.error.kind === "capture-source-insufficient");
  assert.ok((insufficient.error as { reasons: readonly string[] }).reasons.some((r) => r.includes("sample rate too low")));

  // Format declares no microphone slot for video.
  const wrongSlot = await runtime.openCapture(sessionId, {
    participantId: "participant-1" as never,
    mediaKind: "video",
    deviceClass: "microphone",
    sourceId: "cam-hd-720",
    rightsRef: "rights-context-1" as never,
    provenanceRef: "provenance-capture-1" as never,
  });
  assert.ok(!wrongSlot.ok && wrongSlot.error.kind === "capture-source-insufficient");

  // Missing rights/provenance refs are refused (explicit boundaries).
  const noRights = await runtime.openCapture(sessionId, {
    participantId: "participant-1" as never,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: "mic-studio-48k",
    rightsRef: "" as never,
    provenanceRef: "provenance-capture-1" as never,
  });
  assert.ok(!noRights.ok && noRights.error.kind === "missing-rights-or-provenance-ref");
});
