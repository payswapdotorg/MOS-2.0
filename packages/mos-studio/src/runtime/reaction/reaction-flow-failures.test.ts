import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { createReactionFormatPlugin } from "../formats/reaction.js";
import { createFormatRegistry } from "../format-registry.js";
import { createStudioRuntime } from "../studio-runtime.js";
import { createStudioOrganizationLoader } from "../organization-loading/studio-organization-loader.js";
import { FLOW_ORGANIZATION, FLOW_ORGANIZATION_REF } from "../../testing/compose-format-flows.js";
import { createInMemoryOrganizationSource } from "../../testing/in-memory-organization-source.js";
import { createInMemoryArtifactFactory } from "../../testing/in-memory-artifact-factory.js";
import { createInMemoryTreatmentExecutor } from "../../testing/in-memory-treatment-executor.js";
import { createInMemoryCaptureSourcePort } from "../capture/in-memory-capture-source.js";
import { createStudioPackagingAuthority } from "../packaging/packaging-authority.js";
import { createDeterministicClock, createDeterministicIdFactory } from "../../testing/compose-runtime-for-tests.js";
import {
  OPERATOR,
  PREDICTED_SESSION_ID,
  REACTOR_A,
  SUPPLIER,
  composeFormatFlowScenario,
  onePersonReactionPlan,
  reactionCompositionChoices,
  reactionFlowWithFormat,
  reactionParticipantPlan,
  reactionSourcePlan,
  seedSourceConsent,
} from "../../testing/format-flow-fixtures.js";
import type { ReactionProductionPlan } from "../reaction/reaction-plan.js";
import type { OrganizationEditChoice } from "../../contracts/editing-composition.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";

// ---------------------------------------------------------------------------
// STUDIO-009 fail-closed discipline: source-rights gate (never silent), the
// org-decision discipline (undeclared §16 points rejected), the §15 consent
// gates through the editing surface, and the format gate.
// ---------------------------------------------------------------------------

test("STUDIO-009 fail-closed: an uncleared source is a TYPED failure — no session is ever created", async () => {
  const scenario = composeFormatFlowScenario();
  const sourceConsentRef = seedSourceConsent(scenario.authorities);
  const plan = await onePersonReactionPlan(scenario, {
    sources: [reactionSourcePlan(sourceConsentRef, { rightsCleared: false })],
  });
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(!result.ok, "the flow must fail closed on uncleared source rights");
  assert.deepEqual(result.error, {
    kind: "source-rights-not-cleared",
    sourceRef: "source-video-1",
  });
  // NOTHING ran: no session exists under the predicted id.
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined);
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
});

test("STUDIO-009 fail-closed: the runtime import surface rejects uncleared sources with its own typed failure", async () => {
  const scenario = composeFormatFlowScenario();
  // A session the runtime alone drives (the flow is bypassed on purpose):
  // createSession passes the intake validation because the INTENT declares
  // the source cleared, then the import contradicts it — the import gate
  // must reject the contradiction, never silently admit it.
  const created = await scenario.runtime.createSession({
    kind: "standalone-intent",
    intent: {
      supplier: { kind: "standalone-user", identityRef: SUPPLIER },
      tenantId: scenario.tenantId,
      format: { formatId: "reaction" as never, version: 1 },
      inputKind: "intent-with-source-material",
      intent: "React to this",
      sourceArtifacts: [{ artifactId: "src-x" as never, rightsCleared: true }],
      organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
      plannedParticipants: 1,
    },
  });
  assert.ok(created.ok, `session creation must succeed: ${JSON.stringify(created)}`);
  const sessionId = created.value.session.id;
  const loaded = await scenario.runtime.loadOrganization(sessionId);
  assert.ok(loaded.ok);
  const imported = await scenario.runtime.importSourceArtifact(sessionId, {
    artifactId: "src-x" as never,
    type: "video",
    storageRef: "storage:x" as never,
    rightsCleared: false,
    rightsRef: "rights-x" as never,
    provenanceRef: "provenance-x" as never,
  });
  assert.ok(!imported.ok);
  assert.deepEqual(imported.error, { kind: "source-rights-not-cleared", sourceRef: "src-x" });
  // And the intake-level gate: the format validator rejects uncleared sources
  // at createSession too (the double gate).
  const rejected = await scenario.runtime.createSession({
    kind: "standalone-intent",
    intent: {
      supplier: { kind: "standalone-user", identityRef: SUPPLIER },
      tenantId: scenario.tenantId,
      format: { formatId: "reaction" as never, version: 1 },
      inputKind: "intent-with-source-material",
      intent: "React to this",
      sourceArtifacts: [{ artifactId: "src-y" as never, rightsCleared: false }],
      organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
      plannedParticipants: 1,
    },
  });
  assert.ok(!rejected.ok);
  assert.equal(rejected.error.kind, "invalid-session-input");
  if (rejected.error.kind === "invalid-session-input") {
    assert.deepEqual(
      rejected.error.reasons.map((reason) => reason.kind),
      ["source-rights-not-cleared"],
    );
  } else {
    assert.fail("expected invalid-session-input");
  }
});

test("STUDIO-009 org-decision discipline: a choice at an UNDECLARED §16 point is rejected (no §30 record)", async () => {
  const scenario = composeFormatFlowScenario();
  const base = await onePersonReactionPlan(scenario);
  const undeclared: Omit<OrganizationEditChoice, "decidedAt">[] = [
    {
      choiceId: "choice-bogus",
      decisionPointId: "reaction-layout-plus-audio-ducking",
      selectedOption: "made-up-point",
      operations: [],
    },
  ];
  const plan: ReactionProductionPlan = {
    ...base,
    compositionChoices: () => undeclared.map((choice) => ({ ...choice, operations: [...choice.operations] })),
  };
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(!result.ok, "the flow must fail closed on an undeclared decision point");
  assert.equal(result.error.kind, "editing-session-failed");
  const failure = (result.error as { failure: { kind: string; decisionPointId?: string; declaredPointIds?: string[] } }).failure;
  assert.equal(failure.kind, "choice-point-not-declared");
  assert.equal(failure.decisionPointId, "reaction-layout-plus-audio-ducking");
  assert.deepEqual(failure.declaredPointIds, ["reaction-layout", "reaction-timing", "source-presentation"]);
  // Validation failures record NOTHING (no production action ran).
  assert.equal((result.error as { record: unknown }).record, null);
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
  // The session is left mid-flight (capturing→processing happened); the flow
  // failed BEFORE review, so no package exists.
  const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 0);
});

test("STUDIO-009 §15 consent gate: a reactor WITHOUT processing consent blocks the editing session", async () => {
  const scenario = composeFormatFlowScenario();
  // Capture consent only: the join + capture gates pass, but the editing
  // session's contributor gate requires processing (transform) consent.
  scenario.authorities.ensureIdentity({ tenantId: scenario.tenantId, identityRef: REACTOR_A });
  const captureOnly = scenario.authorities.recordSessionConsent({
    tenantId: scenario.tenantId,
    identityRef: REACTOR_A,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["use"],
  });
  const sourceConsentRef = seedSourceConsent(scenario.authorities);
  const plan: ReactionProductionPlan = {
    tenantId: scenario.tenantId,
    supplierIdentityRef: SUPPLIER,
    intent: "React to this trailer",
    organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
    sources: [reactionSourcePlan(sourceConsentRef)],
    participants: [reactionParticipantPlan("participant-1", REACTOR_A, [captureOnly], "account-A")],
    rounds: [{ participantId: "participant-1" as never }],
    compositionChoices: reactionCompositionChoices(),
    operator: OPERATOR,
  };
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(!result.ok, "the missing processing consent must fail the flow");
  assert.equal(result.error.kind, "editing-session-failed");
  const failure = (result.error as { failure: { kind: string; participantIdentityRef?: string } }).failure;
  assert.equal(failure.kind, "consent-not-covering-processing");
  assert.equal(failure.participantIdentityRef, String(REACTOR_A));
  assert.equal((result.error as { record: unknown }).record, null, "no §30 record — validation failure");
});

test("STUDIO-009 format gate: the reaction flow refuses to run a non-reaction format plugin", async () => {
  const scenario = composeFormatFlowScenario();
  const flow = reactionFlowWithFormat(scenario, createAudioPodcastFormatPlugin());
  const plan = await onePersonReactionPlan(scenario);
  const result = await flow.run(plan);
  assert.ok(!result.ok);
  assert.deepEqual(result.error, { kind: "format-not-reaction", formatId: "audio-podcast" });
});

test("STUDIO-009 import gates: a format that forbids media import rejects the import; missing rights/provenance refs are typed failures", async () => {
  // A custom reaction-compatible plugin that FORBIDS media import — the
  // runtime honors the format's declaration, never a studio-side default.
  const reactionPlugin = createReactionFormatPlugin();
  const noImport: StudioFormatPlugin = {
    ...reactionPlugin,
    id: "reaction-no-import" as StudioFormatPlugin["id"],
    captureRequirements: { ...reactionPlugin.captureRequirements, allowsMediaImport: false },
  };
  const registry = createFormatRegistry();
  const registered = registry.register(noImport);
  assert.ok(registered.ok, `the custom plugin must register: ${JSON.stringify(registered)}`);
  const clock = createDeterministicClock();
  const artifactFactory = createInMemoryArtifactFactory({ idFactory: createDeterministicIdFactory("art") });
  const scenario = composeFormatFlowScenario();
  const runtime = createStudioRuntime({
    formatRegistry: registry,
    organizationLoader: createStudioOrganizationLoader({
      source: createInMemoryOrganizationSource({ organizations: [FLOW_ORGANIZATION] }),
    }),
    artifactFactory,
    treatmentExecutor: createInMemoryTreatmentExecutor({ artifactFactory, clock }),
    captureSourcePort: createInMemoryCaptureSourcePort({ now: clock, fixedTakeSeconds: 42 }),
    participantIdentityPort: scenario.authorities.participantIdentityPort,
    participantConsentPort: scenario.authorities.participantConsentPort,
    packaging: createStudioPackagingAuthority(),
    clock,
    idFactory: createDeterministicIdFactory("id"),
  });
  const created = await runtime.createSession({
    kind: "standalone-intent",
    intent: {
      supplier: { kind: "standalone-user", identityRef: SUPPLIER },
      tenantId: scenario.tenantId,
      format: { formatId: noImport.id, version: noImport.version },
      inputKind: "intent-with-source-material",
      intent: "React to this",
      sourceArtifacts: [{ artifactId: "src-noimport" as never, rightsCleared: true }],
      organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
      plannedParticipants: 1,
    },
  });
  assert.ok(created.ok, `session creation must succeed: ${JSON.stringify(created)}`);
  const loaded = await runtime.loadOrganization(created.value.session.id);
  assert.ok(loaded.ok);
  const forbidden = await runtime.importSourceArtifact(created.value.session.id, {
    artifactId: "src-noimport" as never,
    type: "video",
    storageRef: "storage:noimport" as never,
    rightsCleared: true,
    rightsRef: "rights-x" as never,
    provenanceRef: "provenance-x" as never,
  });
  assert.ok(!forbidden.ok, "the format-forbidden import must fail closed");
  assert.deepEqual(forbidden.error, { kind: "import-not-allowed-by-format", formatId: "reaction-no-import" });

  // And on the REAL reaction format (import allowed): an import without
  // explicit rights/provenance refs is a typed failure (§27/§30).
  const scenario2 = composeFormatFlowScenario();
  const created2 = await scenario2.runtime.createSession({
    kind: "standalone-intent",
    intent: {
      supplier: { kind: "standalone-user", identityRef: SUPPLIER },
      tenantId: scenario2.tenantId,
      format: { formatId: "reaction" as never, version: 1 },
      inputKind: "intent-with-source-material",
      intent: "React to this",
      sourceArtifacts: [{ artifactId: "src-refs" as never, rightsCleared: true }],
      organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
      plannedParticipants: 1,
    },
  });
  assert.ok(created2.ok);
  const loaded2 = await scenario2.runtime.loadOrganization(created2.value.session.id);
  assert.ok(loaded2.ok);
  const missingRefs = await scenario2.runtime.importSourceArtifact(created2.value.session.id, {
    artifactId: "src-refs" as never,
    type: "video",
    storageRef: "storage:refs" as never,
    rightsCleared: true,
    rightsRef: "" as never,
    provenanceRef: "" as never,
  });
  assert.ok(!missingRefs.ok, "an import without rights/provenance refs must fail closed");
  assert.deepEqual(missingRefs.error, { kind: "missing-source-rights-or-provenance-ref", sourceRef: "src-refs" });
});
