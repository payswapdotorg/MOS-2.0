/**
 * Shared fixtures for the audio-podcast flow node:test suites (STUDIO-011;
 * STUDIO-013 migrated the flow's final composition onto the W8-C editing
 * surface — the scenario now composes the REAL editing stack, exactly like
 * the reaction/video format-flow scenario). Test-support code only — compiled
 * with the package but never exported from the package index (same pattern
 * as test-fixtures.ts).
 *
 * The scenario composes: the deterministic Studio runtime (REAL identity +
 * rights authorities behind the ports, disclosed in-memory doubles for the
 * remaining seams), the W8-C editing stack (REAL W7-B Editor Pawn through
 * production's surfaces, REAL engines runner seam, REAL rights gate —
 * SHARED rights repository + packaging authority with the studio runtime),
 * the versioned script-graph store + deterministic generator double + REAL
 * adaptive sequencer, the REAL interviewer agent stack (@mos/agents +
 * @mos/agent-runtime), and the audio-podcast flow over the audio-podcast
 * format plugin whose final audio composes through EditingCompositionPort.
 */

import assert from "node:assert/strict";

import { createAudioPodcastFormatPlugin } from "../runtime/formats/audio-podcast.js";
import { createScriptGraphStore } from "../runtime/script-graph/script-graph-store.js";
import { createAdaptiveSequencer } from "../runtime/script-graph/adaptive-sequencer.js";
import {
  ANSWER_CONCLUDE,
  ANSWER_ELABORATE,
  createInMemoryScriptGraphGenerator,
  intentRecordFixture,
} from "./in-memory-script-graph-generator.js";
import { composeRealInterviewerAgentStack } from "./real-interviewer-agent.js";
import {
  composeTestRuntime,
  createDeterministicClock,
  TEST_ORGANIZATION,
} from "./compose-runtime-for-tests.js";
import { composeEditingStack } from "./compose-editing-stack.js";
import { createStudioPackagingAuthority } from "../runtime/packaging/packaging-authority.js";
import { composeRealParticipantAuthorities } from "./real-participant-authorities.js";
import { createAudioPodcastFlow } from "../runtime/podcast/audio-podcast-flow.js";
import { INTERVIEWER_AGENT_BODY_ID } from "../runtime/interviewer/interviewer-agent-body.js";
import {
  EDITING_ENGINE_RESOURCE_LIMITS,
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  EDITING_TRANSFORM_APPLICATION,
} from "./editing-fixtures.js";
import type { RealParticipantAuthorities } from "./real-participant-authorities.js";
import type { JoinParticipantRequest } from "../runtime/intake-types.js";
import type { IntentRecord, ScriptGraphVersionRef } from "../contracts/script-graph.js";
import type {
  CompositionOperationDeclaration,
  OrganizationEditChoice,
} from "../contracts/editing-composition.js";
import type { AudioPodcastProductionPlan } from "../runtime/podcast/audio-podcast-flow.js";
import type {
  ConsentRef,
  IdentityRef,
  SessionParticipantId,
  StudioSessionId,
  Version,
} from "../contracts/refs.js";

export const TENANT = EDITING_STACK_TENANT;
export const SUPPLIER = "identity-user-1" as IdentityRef;
export const SPEAKER_A = "identity-participant-1" as IdentityRef;
export const SPEAKER_B = "identity-participant-2" as IdentityRef;
export const OPERATOR = { kind: "studio-operator", identityRef: "identity-operator-1" } as const;

/**
 * The DETERMINISTIC session id the flow's `createSession` will draw first in a
 * fresh composition: the runtime's id factory emits `t-id-0001` (request id)
 * then `t-id-0002` (session id). Asserted on every flow result so a change to
 * the draw order fails loudly there instead of producing a confusing join
 * refusal — the consent records the tests seed are session-subject scoped
 * (`studio-session:<sessionId>`), so they must target exactly this session.
 */
export const PREDICTED_SESSION_ID = "sess_t-id-0002" as StudioSessionId;

/** A SYNTHETIC voice interviewer (§14: labeled synthetic-generated, generator named). */
export const SYNTHETIC_VOICE_INTERVIEWER = {
  representation: "voice",
  provenance: {
    origin: "synthetic-generated",
    generatorCapability: "generate_voice" as never,
  },
} as const;

/** One composition operation declaration (the org's choice implementation). */
function operation(
  operationId: string,
  kind: CompositionOperationDeclaration["kind"],
  inputArtifactRefs: CompositionOperationDeclaration["inputArtifactRefs"],
  parameters: Record<string, unknown>,
): CompositionOperationDeclaration {
  return { operationId, kind, inputArtifactRefs, parameters };
}

/**
 * Compose the full audio-podcast scenario seam: the deterministic studio
 * runtime + the REAL editing stack (STUDIO-013 — the final audio composes
 * through EditingCompositionPort) + the REAL agent stack + the graphs, all
 * sharing ONE rights repository, ONE packaging authority and ONE (wrapped,
 * engine-store + derived-grant aware) artifact factory.
 */
export function composePodcastScenario() {
  const clock = createDeterministicClock();
  // The ONE REAL rights + identity authority pair behind every gate (the
  // studio runtime's §15 ports AND the editing stack's contributor/pawn gates).
  const authorities = composeRealParticipantAuthorities({ now: clock });
  // STUDIO-013: the ONE packaging authority — the runtime's session packages
  // and the editing session's successor versions compose through the SAME
  // canonical path (one append-only store per tenant).
  const packaging = createStudioPackagingAuthority({ now: clock });
  // The W8-C editing stack over the SHARED rights repository + authority.
  const editingStack = composeEditingStack({ now: clock, rightsRepository: authorities.rightsRepository, packaging });
  // The session organization is registered as an editor-node pawn organization
  // so the SAME organization id drives the session compatibility gate and the
  // Editor Pawn composition (the W9-C format-flow discipline).
  const pawnOrganization = editingStack.registerPawnOrganization({
    organizationId: TEST_ORGANIZATION.id,
    evaluator: "evaluator:studio-podcast-flow",
  });
  assert.ok(
    pawnOrganization.id === TEST_ORGANIZATION.id && pawnOrganization.version === 1,
    `podcast pawn organization registration mismatch: ${JSON.stringify(pawnOrganization)}`,
  );
  const composed = composeTestRuntime({
    clock,
    authorities,
    packaging,
    // The runtime's captures/treatments AND the flow's transcripts ride the
    // editing stack's wrapped factory (engine-store + derived-work grants).
    artifactFactory: editingStack.artifactFactory,
  });
  const store = createScriptGraphStore({ clock: composed.clock });
  const generator = createInMemoryScriptGraphGenerator();
  const sequencer = createAdaptiveSequencer({ store });
  const stack = composeRealInterviewerAgentStack({ now: composed.clock });
  const formatPlugin = createAudioPodcastFormatPlugin();
  let interviewSessions = 0;
  let conversationGraphs = 0;
  const flow = createAudioPodcastFlow({
    runtime: composed.runtime,
    artifactFactory: editingStack.artifactFactory,
    editing: editingStack.editing,
    formatPlugin,
    editingOrganization: {
      id: TEST_ORGANIZATION.id as never,
      version: pawnOrganization.version,
    },
    editingActor: { kind: "identity" as const, principalId: EDITING_PRINCIPAL },
    transformApplication: EDITING_TRANSFORM_APPLICATION,
    engineResourceLimits: { ...EDITING_ENGINE_RESOURCE_LIMITS },
    seed: 7,
    store,
    sequencer,
    agentBinding: stack.agentBinding,
    agent: stack.agent,
    clock: composed.clock,
    nextInterviewSessionId: () => `ivs-${++interviewSessions}`,
    nextConversationGraphId: () => `cgraph-${++conversationGraphs}`,
  });
  return { ...composed, editingStack, store, generator, sequencer, stack, formatPlugin, flow };
}

export type Scenario = ReturnType<typeof composePodcastScenario>;

/** Generate + register the script graph the interview follows (STUDIO-003). */
export async function scriptGraphFor(scenario: Scenario, statement: string): Promise<ScriptGraphVersionRef> {
  const intent: IntentRecord = intentRecordFixture({
    statement,
    tenantId: TENANT,
    recordedBy: SUPPLIER,
  });
  const generated = await scenario.generator.generateScriptGraph({
    intent,
    formatId: "audio-podcast" as never,
  });
  assert.ok(generated.ok, `graph generation must succeed: ${JSON.stringify(generated)}`);
  const registered = scenario.store.register(generated.draft);
  assert.ok(registered.ok, `graph registration must succeed: ${JSON.stringify(registered)}`);
  return { graphId: registered.value.graph.graphId, version: registered.value.graph.version };
}

/** Seed one REAL participant (identity + membership + session-scoped use+transform consent). */
export function seedParticipant(
  authorities: RealParticipantAuthorities,
  identityRef: IdentityRef,
): readonly ConsentRef[] {
  authorities.ensureIdentity({ tenantId: TENANT, identityRef });
  const capture = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["use"],
  });
  const processing = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["transform"],
  });
  return [capture, processing];
}

/** One podcast participant plan entry (join request + capture settings). */
export function participantPlan(
  participantId: string,
  identityRef: IdentityRef,
  consentRefs: readonly ConsentRef[],
  account: string,
): {
  join: JoinParticipantRequest;
  capture: { rightsRef: never; provenanceRef: never; sourceId?: string };
} {
  return {
    join: {
      participantId: participantId as never,
      identityRef,
      accountBoundary: { accountId: account as never, deviceRef: `${account}-dev-1` as never },
      roles: ["subject"],
      grantedActions: ["capture", "review"],
      grant: { grantedBy: SUPPLIER },
      consent: { consentRefs: [...consentRefs] },
    },
    capture: {
      rightsRef: `rights-${account}` as never,
      provenanceRef: `provenance-${account}` as never,
    },
  };
}

/** The interview rounds that walk the generated graph to its terminal beat. */
export function terminalRounds(participantIds: readonly SessionParticipantId[]): AudioPodcastProductionPlan["rounds"] {
  return [
    { participantId: "participant-1" as SessionParticipantId, answerRef: ANSWER_ELABORATE, answerText: "I got into it slowly" },
    { participantId: participantIds[1] ?? ("participant-1" as SessionParticipantId), answerRef: ANSWER_ELABORATE, answerText: "The community mattered most" },
    { participantId: participantIds[2] ?? ("participant-1" as SessionParticipantId), answerRef: ANSWER_CONCLUDE, answerText: "That is a wrap" },
  ];
}

/**
 * The organization's audio-podcast edit choices at the DECLARED points
 * (podcast-edit-points / podcast-edit-pacing) — a BUILDER over the flow's
 * artifact universe (the ORG decides; the caller stands in for the org's
 * decision output — disclosed, the W3-C/W8-C discipline). STUDIO-013: the
 * flow's own edit-graph recorder is gone — these choices compose through the
 * W8-C EditingCompositionPort like every other format.
 */
export function podcastEditChoices(): AudioPodcastProductionPlan["editChoices"] {
  return ({ rawTakes, transcripts }) => {
    const takeA = rawTakes[0];
    const takeB = rawTakes[1];
    const transcriptA = transcripts[0];
    assert.ok(
      takeA !== undefined && takeB !== undefined && transcriptA !== undefined,
      "podcastEditChoices requires at least two raw takes and one transcript",
    );
    return [
      {
        choiceId: "choice-edit-points",
        decisionPointId: "podcast-edit-points",
        selectedOption: "org-learned-edit-keep-tighten",
        operations: [
          operation("audio-op-keep", "trim", [takeA], { leadIn: 0 }),
          operation("audio-op-tighten", "trim", [takeB], { leadIn: 0.5 }),
        ],
      },
      {
        choiceId: "choice-edit-pacing",
        decisionPointId: "podcast-edit-pacing",
        selectedOption: "org-learned-pacing-front-load",
        operations: [
          operation("audio-op-reorder", "reorder", [takeA, takeB], { order: ["tightened", "kept"] }),
          operation("audio-op-caption", "caption", [transcriptA], { language: "en" }),
        ],
      },
    ] satisfies Omit<OrganizationEditChoice, "decidedAt">[];
  };
}

/** Build a one-person podcast production plan (single participant + synthetic interviewer). */
export async function onePersonPlan(
  scenario: Scenario,
  overrides: Partial<AudioPodcastProductionPlan> = {},
): Promise<AudioPodcastProductionPlan> {
  const graph = await scriptGraphFor(scenario, "Interview me about learning to sail");
  const consentRefs = seedParticipant(scenario.authorities, SPEAKER_A);
  return {
    tenantId: TENANT,
    supplierIdentityRef: SUPPLIER,
    intent: "A one-person podcast about learning to sail",
    organizationRef: { id: TEST_ORGANIZATION.id, version: TEST_ORGANIZATION.version },
    participants: [participantPlan("participant-1", SPEAKER_A, consentRefs, "account-A")],
    scriptGraph: graph,
    interviewer: {
      representation: SYNTHETIC_VOICE_INTERVIEWER,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    rounds: terminalRounds([]),
    editChoices: podcastEditChoices(),
    operator: OPERATOR,
    processingCost: { currency: "USD", amount: "0.42" },
    processingSeconds: 30,
    ...overrides,
  };
}
