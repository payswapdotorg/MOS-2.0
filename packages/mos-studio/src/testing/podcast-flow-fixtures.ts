/**
 * Shared fixtures for the audio-podcast flow node:test suites (STUDIO-011).
 * Test-support code only — compiled with the package but never exported from
 * the package index (same pattern as test-fixtures.ts).
 *
 * The scenario composes: the deterministic Studio runtime (REAL identity +
 * rights authorities behind the ports, disclosed in-memory doubles for the
 * remaining seams), the versioned script-graph store + deterministic
 * generator double + REAL adaptive sequencer, the REAL interviewer agent
 * stack (@mos/agents + @mos/agent-runtime), and the audio-podcast flow over
 * the audio-podcast format plugin.
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
import { composeTestRuntime, TEST_ORGANIZATION } from "./compose-runtime-for-tests.js";
import { createAudioPodcastFlow } from "../runtime/podcast/audio-podcast-flow.js";
import { INTERVIEWER_AGENT_BODY_ID } from "../runtime/interviewer/interviewer-agent-body.js";
import type { RealParticipantAuthorities } from "./real-participant-authorities.js";
import type { JoinParticipantRequest } from "../runtime/intake-types.js";
import type { IntentRecord, ScriptGraphVersionRef } from "../contracts/script-graph.js";
import type { RecordedEditDecision } from "../contracts/podcast-graphs.js";
import type { AudioPodcastProductionPlan } from "../runtime/podcast/audio-podcast-flow.js";
import type {
  ConsentRef,
  IdentityRef,
  SessionParticipantId,
  StudioSessionId,
  TenantId,
  Timestamp,
  Version,
} from "../contracts/refs.js";

export const TENANT = "tenant-001" as TenantId;
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

/** Compose the full audio-podcast scenario seam (runtime + REAL agent stack + graphs). */
export function composePodcastScenario() {
  const composed = composeTestRuntime();
  const store = createScriptGraphStore({ clock: composed.clock });
  const generator = createInMemoryScriptGraphGenerator();
  const sequencer = createAdaptiveSequencer({ store });
  const stack = composeRealInterviewerAgentStack({ now: composed.clock });
  const formatPlugin = createAudioPodcastFormatPlugin();
  let interviewSessions = 0;
  let conversationGraphs = 0;
  let editGraphs = 0;
  const flow = createAudioPodcastFlow({
    runtime: composed.runtime,
    artifactFactory: composed.artifactFactory,
    store,
    sequencer,
    agentBinding: stack.agentBinding,
    agent: stack.agent,
    formatPlugin,
    clock: composed.clock,
    nextInterviewSessionId: () => `ivs-${++interviewSessions}`,
    nextConversationGraphId: () => `cgraph-${++conversationGraphs}`,
    nextEditGraphId: () => `egraph-${++editGraphs}`,
  });
  return { ...composed, store, generator, sequencer, stack, formatPlugin, flow };
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

/** Organization edit decisions to record (org decides; caller stands in — disclosed). */
export function editDecisionsAt(now: () => Timestamp): readonly Omit<RecordedEditDecision, "decidedByOrganization">[] {
  return [
    {
      decisionId: "edit-keep-opening",
      decisionPointId: "podcast-edit-points",
      decidedByNodeId: "editor-node",
      decision: { kind: "keep", targetConversationNodeIds: ["q-0", "a-0"] },
      decidedAt: now(),
    },
    {
      decisionId: "edit-trim-core",
      decisionPointId: "podcast-edit-points",
      decidedByNodeId: "editor-node",
      decision: { kind: "trim", targetConversationNodeIds: ["q-1", "a-1"] },
      decidedAt: now(),
    },
    {
      decisionId: "edit-reorder-deepening",
      decisionPointId: "podcast-edit-pacing",
      decidedByNodeId: "editor-node",
      decision: { kind: "reorder", targetConversationNodeIds: ["q-2", "a-2"], reorderedTo: ["a-2", "q-2"] },
      decidedAt: now(),
    },
  ];
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
    editDecisions: editDecisionsAt(scenario.clock),
    operator: OPERATOR,
    processingCost: { currency: "USD", amount: "0.42" },
    processingSeconds: 30,
    ...overrides,
  };
}
