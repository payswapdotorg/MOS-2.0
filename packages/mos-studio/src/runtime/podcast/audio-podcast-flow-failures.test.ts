import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFlow } from "./audio-podcast-flow.js";
import { createVideoPodcastFormatPlugin } from "../formats/video-podcast.js";
import { INTERVIEWER_AGENT_BODY_ID } from "../interviewer/interviewer-agent-body.js";
import { TEST_ORGANIZATION } from "../../testing/compose-runtime-for-tests.js";
import {
  OPERATOR,
  PREDICTED_SESSION_ID,
  SPEAKER_A,
  SPEAKER_B,
  SUPPLIER,
  SYNTHETIC_VOICE_INTERVIEWER,
  TENANT,
  composePodcastScenario,
  editDecisionsAt,
  onePersonPlan,
  participantPlan,
  scriptGraphFor,
  seedParticipant,
  terminalRounds,
} from "../../testing/podcast-flow-fixtures.js";
import { ANSWER_ELABORATE } from "../../testing/in-memory-script-graph-generator.js";
import type { AudioPodcastProductionPlan } from "./audio-podcast-flow.js";
import type { RecordedEditDecision } from "../../contracts/podcast-graphs.js";
import type { ConsentRef, Version } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-011: the audio-podcast flow's fail-closed discipline — §15 consent
// gates bite at join (revoked and never-granted consent alike), rounds that
// do not reach the graph terminal are explicit failures, edit decisions
// outside the format's declared organization points are rejected, and the
// flow refuses a non-audio-podcast format plugin.
// ---------------------------------------------------------------------------

test("STUDIO-011 consent gates bite: a participant whose consent was revoked cannot join the podcast flow", async () => {
  const scenario = composePodcastScenario();
  const graph = await scriptGraphFor(scenario, "Interview me about consent gates");
  const consentA = seedParticipant(scenario.authorities, SPEAKER_A);
  const consentB = seedParticipant(scenario.authorities, SPEAKER_B);
  // REAL revocation through the rights authority BEFORE the flow runs: the
  // join-time gate must refuse speaker B (live resolution, never a snapshot).
  for (const ref of consentB) {
    scenario.authorities.revokeSessionConsent(TENANT, ref);
  }
  const plan: AudioPodcastProductionPlan = {
    tenantId: TENANT,
    supplierIdentityRef: SUPPLIER,
    intent: "A podcast where one speaker revoked consent",
    organizationRef: { id: TEST_ORGANIZATION.id, version: TEST_ORGANIZATION.version },
    participants: [
      participantPlan("participant-1", SPEAKER_A, consentA, "account-A"),
      participantPlan("participant-2", SPEAKER_B, consentB, "account-B"),
    ],
    scriptGraph: graph,
    interviewer: {
      representation: SYNTHETIC_VOICE_INTERVIEWER,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    rounds: terminalRounds([]),
    editDecisions: editDecisionsAt(scenario.clock),
    operator: OPERATOR,
  };
  const result = await scenario.flow.run(plan);
  assert.ok(!result.ok, "the flow must fail when a participant's consent was revoked");
  assert.equal(result.error.kind, "participant-join-failed");
  assert.equal((result.error as { participantId: string }).participantId, "participant-2");
  const inner = (result.error as { error: { kind: string; detail?: string } }).error;
  assert.equal(inner.kind, "consent-required-for-join");

  // A participant with NO session-scoped consent records at all is refused too.
  const scenario2 = composePodcastScenario();
  const graph2 = await scriptGraphFor(scenario2, "Interview me about missing consent");
  const consentA2 = seedParticipant(scenario2.authorities, SPEAKER_A);
  // The identity EXISTS and is authorized — only the consent records are absent,
  // so the refusal is the CONSENT gate, not the identity gate.
  scenario2.authorities.ensureIdentity({ tenantId: TENANT, identityRef: SPEAKER_B });
  const plan2: AudioPodcastProductionPlan = {
    tenantId: TENANT,
    supplierIdentityRef: SUPPLIER,
    intent: "A podcast where one speaker never consented",
    organizationRef: { id: TEST_ORGANIZATION.id, version: TEST_ORGANIZATION.version },
    participants: [
      participantPlan("participant-1", SPEAKER_A, consentA2, "account-A"),
      // Unknown refs: no rights records exist — coverage is empty, never guessed.
      participantPlan("participant-2", SPEAKER_B, ["consent-does-not-exist" as ConsentRef], "account-B"),
    ],
    scriptGraph: graph2,
    interviewer: {
      representation: SYNTHETIC_VOICE_INTERVIEWER,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    rounds: terminalRounds([]),
    editDecisions: editDecisionsAt(scenario2.clock),
    operator: OPERATOR,
  };
  const result2 = await scenario2.flow.run(plan2);
  assert.ok(!result2.ok);
  assert.equal(result2.error.kind, "participant-join-failed");
  assert.equal((result2.error as { error: { kind: string } }).error.kind, "consent-required-for-join");
});

test("STUDIO-011 fail-closed: rounds that do not reach the graph terminal are an explicit failure", async () => {
  const scenario = composePodcastScenario();
  const plan = await onePersonPlan(scenario, {
    // Only ONE round: the declared branch graph still has presentable nodes.
    rounds: [
      { participantId: "participant-1" as never, answerRef: ANSWER_ELABORATE, answerText: "halfway only" },
    ],
  });
  const result = await scenario.flow.run(plan);
  assert.ok(!result.ok, "an incomplete interview must fail the flow");
  assert.equal(result.error.kind, "interview-incomplete");
  assert.equal((result.error as { remainingQuestionNodeId: string }).remainingQuestionNodeId, "core");
  // No processing happened — the session is still capturing.
  const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
  assert.equal(view?.session.lifecycle.state, "capturing");
});

test("STUDIO-011 fail-closed: edit decisions outside the format's declared points are rejected", async () => {
  const scenario = composePodcastScenario();
  const badDecisions: readonly Omit<RecordedEditDecision, "decidedByOrganization">[] = [
    {
      decisionId: "edit-rogue",
      decisionPointId: "not-a-declared-point",
      decision: { kind: "cut", targetConversationNodeIds: ["q-0"] },
      decidedAt: scenario.clock(),
    },
  ];
  const plan = await onePersonPlan(scenario, { editDecisions: badDecisions });
  const result = await scenario.flow.run(plan);
  assert.ok(!result.ok, "undeclared edit decisions must be rejected");
  assert.equal(result.error.kind, "edit-graph-failed");
  const error = (result.error as { error: { kind: string; decisionPointId?: string } }).error;
  assert.equal(error.kind, "decision-point-not-declared");
  assert.equal(error.decisionPointId, "not-a-declared-point");
});

test("STUDIO-011 fail-closed: the flow refuses a non-audio-podcast format plugin", async () => {
  const scenario = composePodcastScenario();
  const wrongPlugin = createVideoPodcastFormatPlugin();
  let conversationGraphs = 0;
  let editGraphs = 0;
  const flow = createAudioPodcastFlow({
    runtime: scenario.runtime,
    artifactFactory: scenario.artifactFactory,
    store: scenario.store,
    sequencer: scenario.sequencer,
    agentBinding: scenario.stack.agentBinding,
    agent: scenario.stack.agent,
    formatPlugin: wrongPlugin,
    clock: scenario.clock,
    nextInterviewSessionId: () => "ivs-x",
    nextConversationGraphId: () => `cgraph-x-${++conversationGraphs}`,
    nextEditGraphId: () => `egraph-x-${++editGraphs}`,
  });
  const plan = await onePersonPlan(scenario);
  const result = await flow.run(plan);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "format-not-audio-podcast");
  assert.equal((result.error as { formatId: string }).formatId, "video-podcast");
});
