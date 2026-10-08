import assert from "node:assert/strict";
import { test } from "node:test";

import type { StudioFormatPlugin } from "../contracts/studio-format.js";
import type { StudioFormatId, Timestamp } from "../contracts/refs.js";
import type { EditingCompositionGraph } from "../contracts/editing-composition.js";
import { EDIT_GRAPH_INTERCHANGE_FORMAT, EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION } from "../contracts/edit-graph-interop.js";
import { createFormatRegistry, type FormatRegistry } from "./format-registry.js";
import { createFormatRegistryWithInitialFormats } from "./formats/initial-formats.js";
import { createReactionFormatPlugin } from "./formats/reaction.js";
import { createVideoPodcastFormatPlugin } from "./formats/video-podcast.js";
import { createEditingGraphStore } from "./editing/editing-graph-store.js";
import { createScriptGraphStore } from "./script-graph/script-graph-store.js";
import { createInMemoryScriptGraphGenerator, intentRecordFixture } from "../testing/in-memory-script-graph-generator.js";
import { composeRealParticipantAuthorities } from "../testing/real-participant-authorities.js";
import { studioSessionConsentSubject } from "../ports/participant-consent.js";
import {
  REACTOR_A,
  composeFormatFlowScenario,
  onePersonReactionPlan,
  onePersonVideoPlan,
  PREDICTED_SESSION_ID,
  reactionFlowWithFormat,
  reactionParticipantPlan,
  videoPodcastFlowWithFormat,
} from "../testing/format-flow-fixtures.js";
import type { ReactionProductionPlan } from "./reaction/reaction-plan.js";
import type { VideoPodcastProductionPlan } from "./podcast/video-podcast-plan.js";
import type { VideoPodcastParticipantPlan } from "./podcast/video-podcast-plan.js";

// ---------------------------------------------------------------------------
// W10-B adversarial probes over the Wave 9 studio surfaces (STUDIO-009/012 +
// the stores/registries the format flows run through): caller-aliased
// declaration objects (the W9-B D3 class), §15 session/tenant/participant
// consent scoping, §16 synthetic-persona discipline, and the format-gate
// integrity under hostile plugin objects.
// ---------------------------------------------------------------------------

/** A fully MUTABLE deep copy of a plugin (the validator kept by reference). */
function mutableCopyOf(plugin: StudioFormatPlugin): StudioFormatPlugin {
  const { validateSessionInput, ...data } = plugin;
  const copy = JSON.parse(JSON.stringify(data)) as Omit<StudioFormatPlugin, "validateSessionInput">;
  return { ...copy, validateSessionInput };
}

test("W10-B probe: the built-in format factories return DEEPLY FROZEN plugins (mutation attempts throw)", () => {
  for (const plugin of [createReactionFormatPlugin(), createVideoPodcastFormatPlugin()]) {
    assert.ok(Object.isFrozen(plugin), "the plugin object itself is frozen");
    assert.ok(Object.isFrozen(plugin.captureRequirements), "nested declarations are frozen");
    assert.ok(Object.isFrozen(plugin.captureRequirements.video), "the video requirement is frozen");
    assert.ok(Object.isFrozen(plugin.inputRequirements), "input requirements are frozen");
    assert.ok(Object.isFrozen(plugin.organizationDecisionPoints), "decision points are frozen");
    assert.throws(() => {
      (plugin as unknown as Record<string, unknown>).id = "hostile" as StudioFormatId;
    }, TypeError);
    assert.throws(() => {
      (plugin.captureRequirements.video as unknown as Record<string, unknown>).required = false;
    }, TypeError);
  }
});

test("W10-B probe: mutating a registered plugin AFTER registration cannot rewrite the stored format declarations", () => {
  const registry: FormatRegistry = createFormatRegistry();
  const hostile = mutableCopyOf(createVideoPodcastFormatPlugin());
  const registration = registry.register(hostile);
  assert.ok(registration.ok, `the mutable plugin variant must register: ${JSON.stringify(registration)}`);

  // The caller rewrites its own object after the authority took it.
  (hostile as unknown as Record<string, unknown>).id = "renamed" as StudioFormatId;
  (hostile.captureRequirements.video as unknown as Record<string, unknown>).required = false;
  (hostile.inputRequirements as unknown as Record<string, unknown>).requiresRightsClearedSources = false;
  (hostile.organizationDecisionPoints as unknown as unknown[]).length = 0;

  const resolved = registry.resolve("video-podcast" as StudioFormatId, 2);
  assert.ok(resolved.ok);
  // The STORED declarations are unchanged (the private frozen clone).
  assert.equal(resolved.plugin.id, "video-podcast");
  assert.equal(resolved.plugin.captureRequirements.video.required, true, "mandatory video stays declared");
  assert.equal(resolved.plugin.inputRequirements.requiresRightsClearedSources, true);
  assert.equal((resolved.plugin.organizationDecisionPoints ?? []).length, 3);
  // The stored plugin is frozen; the caller's object was NOT frozen in place
  // (ownership — the authority never mutates the caller's data).
  assert.ok(Object.isFrozen(resolved.plugin));
  assert.equal(Object.isFrozen(hostile), false);
  // Re-registering the (id-restored) mutated original still collides on
  // id@version — the duplicate guard keys on the declared id@version, never
  // on object identity.
  (hostile as unknown as Record<string, unknown>).id = "video-podcast" as StudioFormatId;
  const duplicate = registry.register(hostile);
  assert.ok(!duplicate.ok, "duplicate id@version is still rejected");
});

test("W10-B probe: mutating the flow's format plugin AFTER flow creation cannot weaken the video-podcast gates", async () => {
  const scenario = composeFormatFlowScenario();
  const hostile = mutableCopyOf(createVideoPodcastFormatPlugin());
  const flow = videoPodcastFlowWithFormat(scenario, hostile);
  // The caller weakens its plugin after the flow took it.
  (hostile.captureRequirements.video as unknown as Record<string, unknown>).required = false;
  (hostile.interviewerRequirements.supportedRepresentations as unknown as unknown[]).length = 0;

  // An audio-only plan under the weakened caller object must STILL be
  // rejected — the flow's gates read its own frozen copy.
  const base = await onePersonVideoPlan(scenario);
  const audioOnly: VideoPodcastParticipantPlan = {
    ...base.participants[0]!,
    capture: { ...base.participants[0]!.capture, videoSourceId: undefined },
  };
  const plan: VideoPodcastProductionPlan = { ...base, participants: [audioOnly] };
  const result = await flow.run(plan);
  assert.ok(!result.ok, "the audio-only plan must still be rejected");
  assert.deepEqual(result.error, { kind: "video-capture-required", participantId: "participant-1" });
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined, "no session may exist");
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
});

test("W10-B probe: mutating the flow's format plugin AFTER flow creation cannot re-brand the reaction run", async () => {
  const scenario = composeFormatFlowScenario();
  const hostile = mutableCopyOf(createReactionFormatPlugin());
  const flow = reactionFlowWithFormat(scenario, hostile);
  // The caller re-brands its plugin object after the flow took it.
  (hostile as unknown as Record<string, unknown>).id = "hostile-format" as StudioFormatId;

  const plan = await onePersonReactionPlan(scenario);
  const result = await flow.run(plan);
  assert.ok(result.ok, `the run must succeed under the flow's frozen plugin copy: ${JSON.stringify(result)}`);
  assert.equal(result.value.session.session.formatVersion.formatId, "reaction");
  assert.equal(result.value.editing.record.formatId, "reaction");
});

test("W10-B probe: the editing-graph store never aliases the caller's choice/operation objects", () => {
  const now = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;
  const store = createEditingGraphStore({ graphIdFactory: () => "egraph-w10b" as never, now });
  const choice = {
    choiceId: "choice-1",
    decisionPointId: "reaction-layout",
    selectedOption: "org-learned-variant",
    decidedByOrganization: { id: "org-1" as never, version: 1 },
    decidedAt: now(),
    operationIds: [],
  };
  const graphInput: Omit<EditingCompositionGraph, "graphId" | "version"> = {
    editingSessionId: "es-1" as never,
    tenantId: "tenant-001" as never,
    formatId: "reaction" as never,
    declaredPointIds: ["reaction-layout"],
    choices: [choice],
    operations: [],
    otioInterchange: false,
    origin: { kind: "editing-session", editingSessionId: "es-1" as never },
    recordedAt: now(),
  };
  const recorded = store.recordSessionGraph({ tenantId: "tenant-001" as never }, graphInput);
  // The caller rewrites its own choice object AFTER the graph was recorded.
  (choice as { selectedOption: string }).selectedOption = "hostile-rewrite";
  const reread = store.get({ tenantId: "tenant-001" as never }, "egraph-w10b" as never, 1);
  assert.ok(reread !== undefined);
  assert.equal(reread.choices[0]?.selectedOption, "org-learned-variant", "the stored decision stays bit-for-bit");
  // The stored graph is deeply frozen; the caller's object was not frozen in place.
  assert.throws(() => {
    (recorded.choices[0] as unknown as Record<string, unknown>).selectedOption = "forged";
  }, TypeError);
  assert.equal(Object.isFrozen(choice), false);
});

test("W10-B probe: a hostile edit-graph interchange carrying non-cloneable values fails closed TYPED (never a crash)", () => {
  const now = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;
  const store = createEditingGraphStore({ graphIdFactory: () => "egraph-w10b-2" as never, now });
  const validGraph: EditingCompositionGraph = {
    graphId: "egraph-foreign" as never,
    version: 1 as never,
    editingSessionId: "es-2" as never,
    tenantId: "tenant-001" as never,
    formatId: "reaction" as never,
    declaredPointIds: ["reaction-layout"],
    choices: [
      {
        choiceId: "choice-1",
        decisionPointId: "reaction-layout",
        selectedOption: "opt",
        decidedByOrganization: { id: "org-1" as never, version: 1 },
        decidedAt: now(),
        operationIds: ["op-1"],
      },
    ],
    operations: [
      {
        operationId: "op-1",
        kind: "overlay",
        decisionPointId: "reaction-layout",
        choiceId: "choice-1",
        parameters: {},
        inputArtifactRefs: [
          {
            artifactId: "art-1" as never,
            version: 1 as never,
            tenantId: "tenant-001" as never,
            digest: "sha256:w10b" as never,
            type: "video",
            storageRef: "mos-studio:w10b" as never,
            rightsRef: "rights-w10b" as never,
            provenanceRef: "prov-w10b" as never,
            stage: "intermediate",
            parentArtifactRefs: [],
            creationMethod: "organization-transform",
          },
        ],
        outputArtifactRefs: [],
        engineInvocations: [],
        executedAt: now(),
      },
    ],
    otioInterchange: false,
    origin: { kind: "editing-session", editingSessionId: "es-2" as never },
    recordedAt: now(),
  };
  const hostileExport = {
    format: EDIT_GRAPH_INTERCHANGE_FORMAT,
    formatVersion: EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION,
    tenantId: "tenant-001" as never,
    graph: { ...validGraph, hostilePayload: () => "not pure data" } as never,
  };
  const outcome = store.importGraph({ tenantId: "tenant-001" as never }, hostileExport);
  assert.ok(!outcome.ok, "the non-cloneable interchange record must fail closed");
  assert.equal(outcome.error.kind, "edit-graph-import-invalid");
  // The pure-data counterpart still imports (not over-strict).
  const honest = store.importGraph(
    { tenantId: "tenant-001" as never },
    {
      format: EDIT_GRAPH_INTERCHANGE_FORMAT,
      formatVersion: EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION,
      tenantId: "tenant-001" as never,
      graph: validGraph,
    },
  );
  assert.ok(honest.ok, `the pure-data interchange must import: ${JSON.stringify(honest)}`);
});

test("W10-B probe: the script-graph store never aliases (nor freezes) the caller's draft", async () => {
  const store = createScriptGraphStore({ clock: () => "2026-01-01T00:00:00.000Z" as Timestamp });
  const generator = createInMemoryScriptGraphGenerator();
  const generated = await generator.generateScriptGraph({
    intent: intentRecordFixture({ statement: "Interview me about adversarial probing", tenantId: "tenant-001" as never, recordedBy: "identity-user-1" as never }),
    formatId: "audio-podcast" as never,
  });
  assert.ok(generated.ok, `fixture graph generation must succeed: ${JSON.stringify(generated)}`);
  const registered = store.register(generated.draft);
  assert.ok(registered.ok, `registration must succeed: ${JSON.stringify(registered)}`);
  const storedBefore = JSON.stringify(registered.value.graph);

  // The caller rewrites its own draft AFTER registration (nested included).
  const firstNode = generated.draft.nodes[0] as unknown as Record<string, unknown>;
  const provenance = firstNode.provenance as Record<string, unknown>;
  provenance.origin = "human-authored";
  firstNode.nodeId = "hostile-node";

  const resolved = store.resolve({ graphId: registered.value.graph.graphId, version: 1 as never });
  assert.ok(resolved !== null);
  assert.equal(JSON.stringify(resolved), storedBefore, "the stored graph stays bit-for-bit unchanged");
  // The caller's draft was never frozen in place (ownership).
  assert.equal(Object.isFrozen(generated.draft), false);
  assert.equal(Object.isFrozen(generated.draft.nodes[0]), false);
});

// ---------------------------------------------------------------------------
// §15 consent/session scoping (cross-session, cross-tenant, participant
// pooling, hostile subject shapes) over the REAL rights authority port
// ---------------------------------------------------------------------------

test("W10-B §15 probe: a consent handle from ANOTHER SESSION smuggles nothing (session-subject scoping bites)", async () => {
  const authorities = composeRealParticipantAuthorities();
  authorities.ensureIdentity({ tenantId: "tenant-a" as never, identityRef: "identity-1" as never });
  const sessionA = "sess-honest-a" as never;
  const refA = authorities.recordSessionConsent({
    tenantId: "tenant-a" as never,
    identityRef: "identity-1" as never,
    sessionId: sessionA,
    actions: ["use", "transform"],
  });
  const forHonestSession = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: "tenant-a" as never,
    sessionId: sessionA,
    participantIdentityRef: "identity-1" as never,
    consentRefs: [refA],
  });
  assert.equal(forHonestSession.activeSessionConsentCount, 1);
  assert.equal(forHonestSession.coversCapture, true);
  assert.equal(forHonestSession.coversProcessingIntoArtifacts, true);

  const smuggled = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: "tenant-a" as never,
    sessionId: "sess-victim-b" as never,
    participantIdentityRef: "identity-1" as never,
    consentRefs: [refA],
  });
  assert.equal(smuggled.activeSessionConsentCount, 0, "the foreign-session consent covers nothing here");
  assert.equal(smuggled.coversCapture, false);
  assert.equal(smuggled.coversProcessingIntoArtifacts, false);
});

test("W10-B §15 probe: consent never crosses tenants and never pools across participants", async () => {
  const authorities = composeRealParticipantAuthorities();
  authorities.ensureIdentity({ tenantId: "tenant-a" as never, identityRef: "identity-1" as never });
  authorities.ensureIdentity({ tenantId: "tenant-a" as never, identityRef: "identity-2" as never });
  const ref = authorities.recordSessionConsent({
    tenantId: "tenant-a" as never,
    identityRef: "identity-1" as never,
    sessionId: "sess-shared" as never,
    actions: ["use", "transform"],
  });
  // Cross-tenant resolution (same identity string, foreign tenant scope).
  const crossTenant = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: "tenant-b" as never,
    sessionId: "sess-shared" as never,
    participantIdentityRef: "identity-1" as never,
    consentRefs: [ref],
  });
  assert.equal(crossTenant.activeSessionConsentCount, 0);
  assert.equal(crossTenant.coversCapture, false);
  // Participant pooling (a DIFFERENT identity under the same tenant + session).
  const pooled = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: "tenant-a" as never,
    sessionId: "sess-shared" as never,
    participantIdentityRef: "identity-2" as never,
    consentRefs: [ref],
  });
  assert.equal(pooled.activeSessionConsentCount, 0, "another participant's consent never covers me");
  assert.equal(pooled.coversProcessingIntoArtifacts, false);
});

test("W10-B §15 probe: a hostile consent SUBJECT shape (session-id prefix/suffix) matches no session (exact-element binding)", async () => {
  const authorities = composeRealParticipantAuthorities();
  authorities.ensureIdentity({ tenantId: "tenant-a" as never, identityRef: "identity-1" as never });
  // A consent whose subjectRefs carry a SUFFIXED session subject (and a bare
  // session id with no convention prefix) — recorded directly through the
  // REAL rights repository so the hostile shape is exact.
  const hostileRef = "consent-hostile-subject" as never;
  const recorded = authorities.rightsRepository.recordConsent({
    scope: { tenantId: "tenant-a" as never },
    id: hostileRef,
    participantRef: "identity-1" as never,
    purpose: "hostile subject shape",
    actions: ["use", "transform"],
    subjectRefs: [`${studioSessionConsentSubject("sess-victim" as never)}:extra`, "sess-victim"],
  });
  assert.ok(!("error" in recorded), `the hostile consent must record: ${JSON.stringify(recorded)}`);
  const resolution = await authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: "tenant-a" as never,
    sessionId: "sess-victim" as never,
    participantIdentityRef: "identity-1" as never,
    consentRefs: [hostileRef],
  });
  assert.equal(resolution.activeSessionConsentCount, 0, "neither the suffixed subject nor the bare id covers the session");
  assert.equal(resolution.coversCapture, false);
  assert.equal(resolution.coversProcessingIntoArtifacts, false);
});

test("W10-B §15 probe end-to-end: foreign-session consent refs fail the reaction flow at the join gate", async () => {
  const scenario = composeFormatFlowScenario();
  // The reactor's consent is recorded for a DIFFERENT session (a foreign-session
  // handle smuggled into the join request).
  const foreign = scenario.authorities.recordSessionConsent({
    tenantId: scenario.tenantId,
    identityRef: REACTOR_A,
    sessionId: "sess-elsewhere" as never,
    actions: ["use", "transform"],
  });
  const base = await onePersonReactionPlan(scenario);
  const plan: ReactionProductionPlan = {
    ...base,
    participants: [reactionParticipantPlan("participant-1", REACTOR_A, [foreign], "account-A")],
  };
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(!result.ok, "the foreign-session consent must fail the flow");
  assert.equal(result.error.kind, "participant-join-failed");
  const error = (result.error as { error: { kind: string; detail?: string } }).error;
  assert.equal(error.kind, "consent-required-for-join");
  assert.equal(error.detail, "missing-consent-refs");
  // The session was created and loaded, but NOTHING was packaged.
  const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 0);
});

// ---------------------------------------------------------------------------
// §16 entry-intermediate discipline + the format-gate integrity re-pins
// ---------------------------------------------------------------------------

test("W10-B §16 probe: a synthetic reactor persona WITHOUT a named generating capability is a typed failure", async () => {
  for (const generator of [undefined, { capability: "   " }]) {
    const scenario = composeFormatFlowScenario();
    const base = await onePersonReactionPlan(scenario);
    const honestConsent = base.participants[0]!.join.consent.consentRefs;
    const plan: ReactionProductionPlan = {
      ...base,
      participants: [
        reactionParticipantPlan("participant-1", "identity-reactor-1" as never, honestConsent, "account-A", {
          reactorKind: "synthetic",
          ...(generator === undefined ? {} : { syntheticGenerator: generator }),
        }),
      ],
    };
    const result = await scenario.reactionFlow.run(plan);
    assert.ok(!result.ok, "the unnamed synthetic persona must fail the flow");
    assert.equal(result.error.kind, "entry-versioning-failed");
    assert.ok(
      (result.error as { reason: string }).reason.includes("generating capability"),
      `the failure must name the §14 disclosure rule: ${JSON.stringify(result.error)}`,
    );
    // Nothing was packaged (the session existed — capture ran — but no review).
    const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
    assert.ok(view !== undefined);
    assert.equal(view.packages.length, 0);
  }
});

test("W10-B format-gate re-pin: an audio-only video-podcast plan is rejected BEFORE any session exists (the frozen-plugin gates hold)", async () => {
  const scenario = composeFormatFlowScenario();
  const base = await onePersonVideoPlan(scenario);
  const audioOnly: VideoPodcastParticipantPlan = {
    ...base.participants[0]!,
    capture: { ...base.participants[0]!.capture, videoSourceId: undefined },
  };
  const plan: VideoPodcastProductionPlan = { ...base, participants: [audioOnly] };
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(!result.ok);
  assert.deepEqual(result.error, { kind: "video-capture-required", participantId: "participant-1" });
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined);
  assert.equal(scenario.editingStack.jobEvents.events.length, 0);
});

test("W10-B probe: the initial format registry stores frozen clones of the three built-in formats", () => {
  const registry = createFormatRegistryWithInitialFormats();
  for (const formatId of ["reaction", "audio-podcast", "video-podcast"] as const) {
    const resolved = registry.resolve(formatId as StudioFormatId);
    assert.ok(resolved.ok, `${formatId} must resolve`);
    assert.ok(Object.isFrozen(resolved.plugin), `${formatId} is stored frozen`);
    assert.ok(Object.isFrozen(resolved.plugin.captureRequirements), `${formatId} declarations are frozen`);
  }
  // The caller may re-register a fresh unfrozen instance of the same
  // id@version — the duplicate guard keys on id@version, not identity.
  const fresh = mutableCopyOf(createReactionFormatPlugin());
  const duplicate = registry.register(fresh);
  assert.ok(!duplicate.ok, "duplicate id@version is still rejected");
  assert.equal(Object.isFrozen(fresh), false, "the rejected caller object is never frozen");
});
