import assert from "node:assert/strict";
import { test } from "node:test";

import { isLegalTransition } from "./lifecycle.js";
import { composeTestRuntime, TEST_ORGANIZATION } from "../testing/compose-runtime-for-tests.js";
import { createStudioRuntime } from "./studio-runtime.js";
import { createFormatRegistryWithInitialFormats } from "./formats/initial-formats.js";
import { createInMemoryOrganizationLoader } from "../testing/in-memory-organization-loader.js";
import { createInMemoryArtifactFactory } from "../testing/in-memory-artifact-factory.js";
import { createInMemoryTreatmentExecutor } from "../testing/in-memory-treatment-executor.js";
import { createInMemoryCaptureSourcePort } from "./capture/in-memory-capture-source.js";
import type { OutputTreatmentRequest } from "../contracts/treatment.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import {
  OPERATOR,
  TENANT,
  captureRawTake,
  createSessionReadyForCapture,
  mustOk,
  participantJoin,
  standaloneIntent,
  buildProcessingArtifacts,
} from "../testing/test-fixtures.js";
import type { SubmitReviewInput } from "./intake-types.js";

// ---------------------------------------------------------------------------
// STUDIO-001: lifecycle happy path (standalone intent → packaged)
// ---------------------------------------------------------------------------

test("lifecycle happy path: standalone intent → requested → loading → capturing → processing → review → packaged → closed", async () => {
  const { runtime, artifactFactory, sessionId } = await createSessionReadyForCapture();

  // createSession + loadOrganization already ran: the session is 'capturing'
  // with the versioned organization loaded and an explicit verdict.
  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.session.lifecycle.state, "capturing");
  assert.equal(view.session.version, 3); // created(1) + loading(2) + capturing(3)
  assert.equal(view.session.formatVersion.formatId, "reaction");
  assert.equal(view.request.scope, "studio:standalone");
  assert.equal(view.organization?.organization.id, TEST_ORGANIZATION.id);
  assert.equal(view.organization?.compatibility.compatible, true);

  // Participant joins with full §15 separation.
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "joinParticipant");

  // Raw capture (STUDIO-005) emits a raw artifact with provenance labeling.
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  assert.equal(rawArtifact.stage, "raw");
  assert.equal(rawArtifact.creationMethod, "human-capture");
  assert.equal(rawArtifact.parentArtifactRefs.length, 0);
  assert.match(rawArtifact.digest, /^sha256:[0-9a-f]{64}$/);

  // Processing: organization-produced intermediate + final artifacts.
  const { intermediate, finals } = await buildProcessingArtifacts(artifactFactory, [rawArtifact]);
  await mustOk(runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [
        {
          artifact: intermediate[0] as StudioArtifactRef,
          language: "en-US",
          diarized: true,
        },
      ],
      additionalCost: { currency: "USD", amount: "1.25" },
      processingSeconds: 30,
    }),
    "completeProcessing",
  );

  // Review accepts → package assembled.
  const accepted = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "submitReview",
  );
  assert.equal(accepted.session.lifecycle.state, "packaged");
  assert.ok(accepted.package !== undefined);

  // Package: all 14 required fields populated and coherent.
  const pkg = accepted.package;
  assert.equal(pkg.version, 1);
  assert.equal(pkg.sessionRef, sessionId);
  assert.deepEqual(pkg.rawArtifacts.map((a) => a.artifactId), [rawArtifact.artifactId]);
  assert.equal(pkg.intermediateArtifacts.length, 1);
  assert.equal(pkg.finalArtifacts.length, 1);
  assert.equal(pkg.transcriptRefs.length, 1);
  assert.ok(pkg.conversationGraphRef.graphId.length > 0);
  assert.ok(pkg.editGraphRef.graphId.length > 0);
  assert.equal(pkg.provenance.lineageComplete, true);
  assert.equal(pkg.consent.allRawArtifactsCovered, true);
  assert.deepEqual(pkg.consent.participantConsentRefs, ["consent-1", "consent-2"]);
  assert.equal(pkg.evaluation.status, "evaluated");
  assert.equal(pkg.evaluation.outcome, "accepted");
  assert.equal(pkg.cost.total.amount, "1.25");
  assert.equal(pkg.duration.captureSeconds, 42);
  assert.equal(pkg.duration.processingSeconds, 30);
  assert.ok(pkg.duration.totalWallClockSeconds > 0);

  // Session pins the exact package version.
  const packagedView = runtime.getSession(sessionId);
  assert.ok(packagedView !== undefined);
  assert.deepEqual(packagedView.session.artifactPackageRef, {
    packageId: pkg.id,
    version: 1,
  });

  // Transition history is append-only and complete.
  const states = packagedView.session.lifecycle.transitions.map((t) => `${t.from}->${t.to}`);
  assert.deepEqual(states, [
    "requested->loading",
    "loading->capturing",
    "capturing->processing",
    "processing->review",
    "review->packaged",
  ]);

  // Close.
  const closed = await mustOk(runtime.closeSession(sessionId), "closeSession");
  assert.equal(closed.session.lifecycle.state, "closed");
});

test("production-request entry mode: Lab request view is consumed read-only", async () => {
  const { runtime } = composeTestRuntime();
  const requestView = {
    id: "prs-lab-1" as never,
    version: 4,
    scope: "lab:candidate-17",
    objective: "Produce reaction output for candidate 17",
    sourceArtifacts: ["artifact-src-9" as never],
    strategyRef: "strategy-17" as never,
    transformGraphRef: "transform-17" as never,
    organizationRef: { id: TEST_ORGANIZATION.id as never, version: TEST_ORGANIZATION.version },
    studioFormat: { formatId: "reaction", version: 1 },
    capabilityRequirements: ["compose_reaction" as never],
    humanTasks: ["human-task-1" as never],
    acceptanceCriteria: "acceptance-17" as never,
    budget: { limit: { currency: "USD", amount: "10.00" } },
    deadline: null,
    delayPolicy: "delay-17" as never,
    rightsContext: "rights-17" as never,
    returnContract: "return-17" as never,
  };
  const created = await mustOk(
    runtime.createSession({
      kind: "production-request",
      request: requestView,
      supplier: { kind: "lab", labCandidateRef: "lab-candidate-17" as never },
      tenantId: TENANT,
      intake: {
        inputKind: "intent-with-source-material",
        sourceArtifacts: [{ artifactId: "artifact-src-9", rightsCleared: true }],
        participantCount: 1,
        hasScriptOrQuestionGraph: false,
      },
    }),
    "createSession(production-request)",
  );
  assert.equal(created.session.productionRequestRef, "prs-lab-1");
  assert.equal(created.session.lifecycle.state, "requested");
  assert.equal(created.session.version, 1);
  const view = runtime.getSession(created.session.id);
  assert.ok(view !== undefined);
  assert.equal(view.request.scope, "lab:candidate-17");
  assert.equal(view.request.budget.limit.amount, "10.00");
});

// ---------------------------------------------------------------------------
// STUDIO-001: invalid transitions rejected
// ---------------------------------------------------------------------------

test("invalid lifecycle jumps are rejected with explicit errors", async () => {
  // Pure state-machine checks first.
  assert.equal(isLegalTransition("requested", "review"), false);
  assert.equal(isLegalTransition("requested", "packaged"), false);
  assert.equal(isLegalTransition("capturing", "review"), false);
  assert.equal(isLegalTransition("review", "capturing"), false);
  assert.equal(isLegalTransition("packaged", "processing"), false);
  assert.equal(isLegalTransition("closed", "requested"), false);
  assert.equal(isLegalTransition("requested", "loading"), true);
  assert.equal(isLegalTransition("processing", "capturing"), true); // re-capture loop

  const { runtime, sessionId } = await createSessionReadyForCapture();

  // loadOrganization twice: second call is not allowed outside 'requested'.
  const secondLoad = await runtime.loadOrganization(sessionId);
  assert.ok(!secondLoad.ok && secondLoad.error.kind === "operation-not-allowed-in-state");

  // joinParticipant before the session reaches 'capturing' (fresh session).
  const { runtime: runtime2 } = composeTestRuntime();
  const fresh = await mustOk(runtime2.createSession(standaloneIntent()), "fresh create");
  const earlyJoin = await runtime2.joinParticipant(fresh.session.id, participantJoin());
  assert.ok(!earlyJoin.ok && earlyJoin.error.kind === "operation-not-allowed-in-state");

  // beginProcessing from 'requested'.
  const earlyProcessing = await runtime2.beginProcessing(fresh.session.id);
  assert.ok(!earlyProcessing.ok && earlyProcessing.error.kind === "operation-not-allowed-in-state");

  // completeProcessing from 'capturing'.
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");
  const earlyComplete = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: [],
    finalArtifacts: [],
  });
  assert.ok(!earlyComplete.ok && earlyComplete.error.kind === "operation-not-allowed-in-state");

  // submitReview from 'capturing'.
  const earlyReview = await runtime.submitReview(sessionId, {
    targetArtifactId: "art-none",
    outcome: "accept",
    decidedBy: OPERATOR,
  });
  assert.ok(!earlyReview.ok && earlyReview.error.kind === "operation-not-allowed-in-state");

  // applyTreatment from 'capturing'.
  const earlyTreatment = await runtime.applyTreatment(sessionId, {
    sessionId: sessionId as never,
    targetArtifact: { artifactId: "art-none" } as never,
    treatment: "trim",
    requestedBy: OPERATOR,
    requestedAt: "2026-01-01T00:00:00.000Z",
  } as OutputTreatmentRequest);
  assert.ok(!earlyTreatment.ok && earlyTreatment.error.kind === "operation-not-allowed-in-state");

  // closeSession from 'capturing'.
  const earlyClose = await runtime.closeSession(sessionId);
  assert.ok(!earlyClose.ok && earlyClose.error.kind === "operation-not-allowed-in-state");

  // abandon from a terminal state is rejected.
  await mustOk(runtime.abandonSession(sessionId, "operator gave up"), "abandon");
  const abandonAgain = await runtime.abandonSession(sessionId);
  assert.ok(!abandonAgain.ok && abandonAgain.error.kind === "operation-not-allowed-in-state");
});

test("unknown sessions fail with session-not-found", async () => {
  const { runtime } = composeTestRuntime();
  const unknown = "sess-unknown" as never;
  for (const outcome of [
    await runtime.loadOrganization(unknown),
    await runtime.joinParticipant(unknown, participantJoin()),
    await runtime.beginProcessing(unknown),
    await runtime.completeProcessing(unknown, { intermediateArtifacts: [], finalArtifacts: [] }),
    await runtime.submitReview(unknown, { targetArtifactId: "x", outcome: "accept", decidedBy: OPERATOR }),
    await runtime.applyTreatment(unknown, {
      sessionId: unknown,
      targetArtifact: { artifactId: "x" } as never,
      treatment: "edit",
      requestedBy: OPERATOR,
      requestedAt: "2026-01-01T00:00:00.000Z",
    } as OutputTreatmentRequest),
    await runtime.closeSession(unknown),
    await runtime.abandonSession(unknown),
  ]) {
    assert.ok(!outcome.ok && outcome.error.kind === "session-not-found");
  }
  assert.equal(runtime.getSession(unknown), undefined);
});

// ---------------------------------------------------------------------------
// STUDIO-001: organization loading verdicts (versioned, explicit)
// ---------------------------------------------------------------------------

test("organization loading fails loudly: not-found, incompatible verdict, unavailable loader", async () => {
  const { runtime: runtimeMissing } = composeTestRuntime({
    organizations: [],
  });
  const missing = await mustOk(
    runtimeMissing.createSession(standaloneIntent({ organizationRef: { id: "org-absent", version: 1 } })),
    "create",
  );
  const missingLoad = await runtimeMissing.loadOrganization(missing.session.id);
  assert.ok(!missingLoad.ok && missingLoad.error.kind === "organization-load-failed" && missingLoad.error.error.kind === "organization-not-found");
  assert.equal(runtimeMissing.getSession(missing.session.id)?.session.lifecycle.state, "failed");

  // Incompatible organization: missing capabilities → ok:false verdict path.
  const { runtime: runtimeIncompat } = composeTestRuntime({
    organizations: [{ id: "org-weak", version: 1, declaredCapabilities: ["render_timeline"] }],
  });
  const weak = await mustOk(
    runtimeIncompat.createSession(standaloneIntent({ organizationRef: { id: "org-weak", version: 1 } })),
    "create weak",
  );
  const weakLoad = await runtimeIncompat.loadOrganization(weak.session.id);
  assert.ok(!weakLoad.ok && weakLoad.error.kind === "organization-incompatible");
  assert.ok((weakLoad.error as { incompatibilityReasons: readonly string[] }).incompatibilityReasons.some((r) => r.includes("compose_reaction")));
  assert.equal(runtimeIncompat.getSession(weak.session.id)?.session.lifecycle.state, "failed");

  // Loader unavailable → explicit loader-unavailable failure (session not created → not-found on later ops).
  const unavailable = createStudioRuntime({
    formatRegistry: createFormatRegistryWithInitialFormats(),
    organizationLoader: createInMemoryOrganizationLoader({
      organizations: [TEST_ORGANIZATION],
      unavailable: true,
    }),
    artifactFactory: createInMemoryArtifactFactory(),
    treatmentExecutor: createInMemoryTreatmentExecutor({
      artifactFactory: createInMemoryArtifactFactory(),
    }),
    captureSourcePort: createInMemoryCaptureSourcePort(),
  });
  const unavailableSession = await mustOk(
    unavailable.createSession(standaloneIntent()),
    "create (unavailable loader)",
  );
  const unavailableLoad = await unavailable.loadOrganization(unavailableSession.session.id);
  assert.ok(
    !unavailableLoad.ok && unavailableLoad.error.kind === "organization-load-failed" && unavailableLoad.error.error.kind === "loader-unavailable",
  );
  // The load failure transitioned the session to the 'failed' terminal state.
  assert.equal(unavailable.getSession(unavailableSession.session.id)?.session.lifecycle.state, "failed");
});
