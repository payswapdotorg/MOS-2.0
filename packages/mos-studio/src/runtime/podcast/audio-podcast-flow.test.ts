import assert from "node:assert/strict";
import { test } from "node:test";

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
  onePersonPlan,
  participantPlan,
  podcastEditChoices,
  scriptGraphFor,
  seedParticipant,
  terminalRounds,
} from "../../testing/podcast-flow-fixtures.js";
import type { AudioPodcastProductionPlan } from "./audio-podcast-flow.js";
import type { StudioRuntime } from "../studio-runtime.js";
import type { StudioArtifactPackage } from "../../contracts/studio-artifact-package.js";
import type { OutputTreatmentRequest } from "../../contracts/treatment.js";
import type { Version } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-011: the audio-podcast end-to-end happy paths — one-person mode
// (single participant + SYNTHETIC interviewer, labeled end-to-end),
// multi-account mode through the REAL §15 identity/rights consent gates, and
// treatment on the packaged output creating a NEW immutable version (§19).
// STUDIO-013: the final audio composition rides the W8-C editing session
// (the ONE composition surface — the flow's own edit-graph recorder is gone).
// Fail-closed paths live in audio-podcast-flow-failures.test.ts.
// ---------------------------------------------------------------------------

test("STUDIO-011 e2e one-person: script → adaptive interview → capture → processing → packaged artifact with full provenance", async () => {
  const scenario = composePodcastScenario();
  const plan = await onePersonPlan(scenario);
  const result = await scenario.flow.run(plan);
  assert.ok(result.ok, `the one-person podcast flow must succeed: ${JSON.stringify(result)}`);

  // The deterministic session id the seeded consent records target (pinned).
  assert.equal(result.value.sessionId, PREDICTED_SESSION_ID);
  assert.equal(result.value.session.session.lifecycle.state, "packaged");
  assert.equal(result.value.session.session.formatVersion.formatId, "audio-podcast");

  // The adaptive interview ran the full question → answer → next-question loop
  // through the REAL agent instance (agent execution traces on every question).
  const interview = result.value.interview;
  assert.equal(interview.presentations.length, 3);
  assert.equal(interview.answers.length, 3);
  assert.equal(interview.closed, true);
  assert.equal(interview.terminal, true);
  for (const presentation of interview.presentations) {
    assert.ok(presentation.agentExecution !== undefined, "every question was delivered by the REAL agent instance");
    assert.equal(presentation.agentExecution?.bodyId, INTERVIEWER_AGENT_BODY_ID);
    assert.equal(presentation.provenance.origin, "synthetic-generated", "the synthetic interviewer stays labeled");
  }
  // Adaptive path per the declared branch graph: intro → core → deepen → wrap(beat) → terminal.
  assert.deepEqual(
    interview.answers.map((a) => [a.questionNodeId, a.nextNodeId]),
    [
      ["intro", "core"],
      ["core", "deepen"],
      ["deepen", "wrap"],
    ],
  );

  // The conversation graph (question/answer nodes from the adaptive loop).
  const conversation = result.value.conversationGraph;
  assert.deepEqual(
    conversation.nodes.map((n) => [n.nodeId, n.kind]),
    [
      ["q-0", "question"],
      ["q-1", "question"],
      ["q-2", "question"],
      ["a-0", "answer"],
      ["a-1", "answer"],
      ["a-2", "answer"],
    ],
  );
  // Question nodes carry the interviewer representation provenance (§14 end-to-end).
  for (const node of conversation.nodes) {
    if (node.kind === "question") {
      assert.equal(node.representationKind, "voice");
      assert.equal(node.interviewerProvenance.origin, "synthetic-generated");
      assert.ok(node.agentExecution !== undefined, "agent execution traces travel into the conversation graph");
    }
  }
  // Every answer responds to its question; answers chain to the next question.
  assert.equal(conversation.containsSyntheticInterviewerMaterial, true);
  assert.deepEqual(
    conversation.edges.map((e) => [e.fromNodeId, e.toNodeId]),
    [
      ["a-0", "q-1"],
      ["a-1", "q-2"],
      ["q-0", "a-0"],
      ["q-1", "a-1"],
      ["q-2", "a-2"],
    ],
  );

  // The W8-C editing session: the org's choices at the audio-podcast's
  // DECLARED points, composed through the REAL Editor Pawn + engines runner
  // (STUDIO-013 — ONE composition surface, ONE edit-graph record shape).
  const editing = result.value.editing;
  assert.equal(editing.record.lifecycle, "succeeded");
  assert.equal(editing.record.formatId, "audio-podcast");
  const editGraph = editing.editGraph;
  assert.deepEqual(
    editGraph.declaredPointIds,
    ["podcast-edit-points", "podcast-edit-pacing"],
    "the audio-podcast format's declared decision points",
  );
  assert.deepEqual(
    editGraph.choices.map((choice) => [choice.choiceId, choice.decisionPointId, choice.selectedOption]),
    [
      ["choice-edit-points", "podcast-edit-points", "org-learned-edit-keep-tighten"],
      ["choice-edit-pacing", "podcast-edit-pacing", "org-learned-pacing-front-load"],
    ],
  );
  for (const choice of editGraph.choices) {
    assert.equal(choice.decidedByOrganization.id, TEST_ORGANIZATION.id);
    assert.equal(choice.decidedByOrganization.version, 1, "the pawn-organization citation drives the composition");
  }
  // Every composition operation executed through the Editor Pawn with REAL
  // engine invocations (§30 summaries quote the runner's job identities).
  assert.equal(editGraph.operations.length, 4);
  for (const operation of editGraph.operations) {
    assert.equal(operation.outputArtifactRefs.length, 1);
    assert.ok(operation.inputArtifactRefs.length >= 1);
    assert.ok(
      operation.engineInvocations.length >= 1,
      `operation ${operation.operationId} recorded engine invocations`,
    );
  }
  assert.ok(
    editing.record.engineInvocations.length >= editGraph.operations.length + 1,
    "the final assembly also invoked the engine",
  );

  // Transcripts exist as intermediate artifacts derived from the raw captures.
  assert.equal(result.value.transcriptRefs.length, 3);
  for (const transcript of result.value.transcriptRefs) {
    assert.equal(transcript.artifact.stage, "intermediate");
    assert.equal(transcript.artifact.creationMethod, "organization-transform");
    assert.equal(transcript.artifact.parentArtifactRefs.length, 1);
  }

  // The packaged StudioArtifactPackage: every required contract field present
  // and the REAL conversation/edit graph refs flow into it (STUDIO-011),
  // composed through THE canonical packaging authority (STUDIO-013).
  const pkg = result.value.package;
  assert.equal(pkg.sessionRef, result.value.sessionId);
  assert.equal(pkg.version, 1);
  assert.equal(pkg.rawArtifacts.length, 3, "one raw audio take per capture round");
  // intermediates = transcripts + the editing session's operation outputs.
  assert.equal(
    pkg.intermediateArtifacts.length,
    result.value.transcriptRefs.length + editGraph.operations.length,
  );
  assert.equal(pkg.finalArtifacts.length, 1);
  assert.deepEqual(pkg.transcriptRefs, result.value.transcriptRefs);
  assert.equal(pkg.conversationGraphRef.graphId, conversation.graphId);
  assert.equal(pkg.conversationGraphRef.version, conversation.version);
  assert.deepEqual(pkg.conversationGraphRef.derivedFrom, result.value.transcriptRefs);
  assert.deepEqual(pkg.editGraphRef, {
    graphId: editGraph.graphId,
    version: editGraph.version,
    otioInterchange: editGraph.otioInterchange,
  });
  // Provenance chain: closed lineage, consent coverage, synthetic disclosure.
  assert.equal(pkg.provenance.lineageComplete, true);
  assert.ok(
    pkg.provenance.provenanceRefs.map(String).includes("provenance-account-A"),
    "the declared capture provenance refs flow into the package",
  );
  assert.equal(pkg.consent.allRawArtifactsCovered, true);
  assert.ok(pkg.consent.participantConsentRefs.length >= 2, "the participant's real consent records flow into the package");
  assert.equal(pkg.evaluation.outcome, "accepted");
  // Cost = the editing session's engine cost + the plan's declared processing cost.
  const expectedCost = (editing.record.cost.amount + 0.42).toFixed(2);
  assert.equal(pkg.cost.total.amount, expectedCost);
  assert.equal(pkg.duration.captureSeconds, 42 * 3, "three sealed 42s takes");
  assert.equal(pkg.duration.processingSeconds, 30);

  // The composed final audio artifact (the editing session's final assembly,
  // a composition over the editing outputs — §6).
  const finalAudio = result.value.finalArtifact;
  assert.equal(finalAudio.type, "audio");
  assert.equal(finalAudio.stage, "final");
  assert.equal(finalAudio.creationMethod, "composition");
  assert.ok(finalAudio.parentArtifactRefs.length >= 1);
  // The editing session's NEW immutable package version is ALSO composed
  // through the ONE authority (append-only, same tenant store).
  assert.equal(editing.newPackage.version, 1);
  assert.equal(editing.newPackage.id !== pkg.id, true, "the editing package id differs from the session package id");
  assert.ok(
    scenario.packaging.listPackageVersions({ tenantId: plan.tenantId }, editing.newPackage.id).length >= 1,
    "the editing version is browsable through the ONE packaging authority",
  );
});

test("STUDIO-011 multi-account: two real participants through §15 consent gates, contribution provenance preserved", async () => {
  const scenario = composePodcastScenario();
  const graph = await scriptGraphFor(scenario, "Interview us about remote work habits");
  // Two REAL identities with SEPARATE session-scoped consent records (never pooled).
  const consentA = seedParticipant(scenario.authorities, SPEAKER_A);
  const consentB = seedParticipant(scenario.authorities, SPEAKER_B);
  const plan: AudioPodcastProductionPlan = {
    tenantId: TENANT,
    supplierIdentityRef: SUPPLIER,
    intent: "A two-person podcast about remote work",
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
    // Alternate the speakers across the adaptive rounds (multi-account capture).
    rounds: terminalRounds(["participant-1" as never, "participant-2" as never, "participant-1" as never]),
    editChoices: podcastEditChoices(),
    operator: OPERATOR,
  };
  const result = await scenario.flow.run(plan);
  assert.ok(result.ok, `the multi-account podcast flow must succeed: ${JSON.stringify(result)}`);
  assert.equal(result.value.sessionId, PREDICTED_SESSION_ID);

  // Both participants joined with their own identity/account/consent boundaries.
  const participants = result.value.session.participants;
  assert.equal(participants.length, 2);
  assert.deepEqual(
    participants.map((p) => [String(p.identityRef), String(p.accountBoundary.accountId)]),
    [
      [String(SPEAKER_A), "account-A"],
      [String(SPEAKER_B), "account-B"],
    ],
  );
  // Consent refs stayed SEPARATE per participant (never pooled, §15).
  assert.deepEqual(participants[0]?.consent.consentRefs, consentA);
  assert.deepEqual(participants[1]?.consent.consentRefs, consentB);

  // Contribution provenance: answer nodes record WHO answered (A, B, A).
  const answers = result.value.conversationGraph.nodes.filter((n) => n.kind === "answer");
  assert.deepEqual(
    answers.map((a) => (a as { answeredBy: string }).answeredBy),
    [String(SPEAKER_A), String(SPEAKER_B), String(SPEAKER_A)],
  );

  // Raw takes were captured by both accounts (contribution provenance §15).
  const view = scenario.runtime.getSession(result.value.sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.rawArtifacts.length, 3);
  // The packaged output carries both participants' consent records.
  const consentRefs = new Set(result.value.package.consent.participantConsentRefs.map(String));
  for (const ref of [...consentA, ...consentB]) {
    assert.ok(consentRefs.has(String(ref)), `consent ${String(ref)} must flow into the package`);
  }
  assert.equal(result.value.package.consent.allRawArtifactsCovered, true);
});

test("STUDIO-011 treatment on the packaged output creates a NEW immutable package version (§19)", async () => {
  const scenario = composePodcastScenario();
  const plan = await onePersonPlan(scenario);
  const result = await scenario.flow.run(plan);
  assert.ok(result.ok, `flow must succeed: ${JSON.stringify(result)}`);
  const runtime: StudioRuntime = scenario.runtime;
  const v1 = result.value.package;

  const treatmentRequest: OutputTreatmentRequest = {
    sessionId: result.value.sessionId,
    targetArtifact: result.value.finalArtifact,
    treatment: "trim",
    parametersRef: "params-trim-podcast-1",
    requestedBy: OPERATOR,
    requestedAt: scenario.clock(),
  };
  const treated = await runtime.applyTreatment(result.value.sessionId, treatmentRequest);
  assert.ok(treated.ok, `treatment must succeed: ${JSON.stringify(treated)}`);
  const v2 = treated.value.package as StudioArtifactPackage;
  assert.ok(v2 !== undefined, "treating a packaged session assembles a successor package version");

  // New immutable version under the SAME package id; v1 untouched + resolvable.
  assert.equal(v2.id, v1.id);
  assert.equal(v2.version, v1.version + 1);
  const view = runtime.getSession(result.value.sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 2);
  assert.deepEqual(view.packages[0], v1);
  assert.deepEqual(view.session.artifactPackageRef, { packageId: v1.id, version: v2.version });

  // The successor artifact's lineage links to the treated final audio version.
  const successor = v2.finalArtifacts[v2.finalArtifacts.length - 1];
  assert.ok(successor !== undefined && successor.artifactId !== result.value.finalArtifact.artifactId);
  assert.ok(
    successor.parentArtifactRefs.some((p) => p.artifactId === result.value.finalArtifact.artifactId),
    "the treated version must be a parent of the successor",
  );

  // The REAL conversation + edit graph refs survive into the new version.
  assert.deepEqual(v2.conversationGraphRef, v1.conversationGraphRef);
  assert.deepEqual(v2.editGraphRef, v1.editGraphRef);
  assert.equal(v2.transcriptRefs.length, v1.transcriptRefs.length);
  assert.equal(v2.provenance.lineageComplete, true);
  assert.equal(v2.evaluation.outcome, "treatment-requested");
});
