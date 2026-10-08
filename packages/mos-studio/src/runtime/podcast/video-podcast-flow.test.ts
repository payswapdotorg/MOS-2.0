import assert from "node:assert/strict";
import { test } from "node:test";

import { INTERVIEWER_AGENT_BODY_ID } from "../interviewer/interviewer-agent-body.js";
import {
  OPERATOR,
  PREDICTED_SESSION_ID,
  SPEAKER_A,
  SPEAKER_B,
  SUPPLIER,
  SYNTHETIC_AVATAR_INTERVIEWER,
  composeFormatFlowScenario,
  onePersonVideoPlan,
  scriptGraphFor,
  seedParticipant,
  terminalRounds,
  videoEditChoices,
  videoParticipantPlan,
} from "../../testing/format-flow-fixtures.js";
import type { VideoPodcastProductionPlan } from "./video-podcast-plan.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type { StudioArtifactPackage } from "../../contracts/studio-artifact-package.js";
import type { OutputTreatmentRequest } from "../../contracts/treatment.js";
import type { Version } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-012: the video-podcast end-to-end happy paths — script → adaptive
// interview (synthetic avatar interviewer, labeled end-to-end) → VIDEO CAPTURE
// ROUNDS (video + audio takes per round) → transcripts + conversation graph +
// the W8-C edit graph → the packaged StudioArtifactPackage with ALL required
// fields + full provenance; multi-account mode through the REAL §15
// identity/rights consent gates; treatment on the packaged output creating a
// NEW immutable version (§19).
// Fail-closed paths live in video-podcast-flow-failures.test.ts.
// ---------------------------------------------------------------------------

test("STUDIO-012 e2e one-person: script → interview → video capture rounds → transcripts + graphs → packaged all-fields + provenance", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonVideoPlan(scenario);
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(result.ok, `the one-person video-podcast flow must succeed: ${JSON.stringify(result)}`);

  // The deterministic session id the seeded §15 consent records target (pinned).
  assert.equal(result.value.sessionId, PREDICTED_SESSION_ID);
  assert.equal(result.value.session.session.lifecycle.state, "packaged");
  assert.equal(result.value.session.session.formatVersion.formatId, "video-podcast");

  // ---- The adaptive interview ran the full question → answer loop through
  // ---- the REAL agent instance (STUDIO-004 binding; avatar modality §14).
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

  // ---- Video capture rounds: one VIDEO take AND one audio take per round. ----
  const rawTakes = result.value.rawTakes as readonly StudioArtifactRef[];
  assert.equal(rawTakes.length, 6, "three rounds × (video + audio)");
  for (const [index, take] of rawTakes.entries()) {
    assert.equal(take.stage, "raw");
    assert.equal(take.creationMethod, "human-capture");
    assert.equal(take.tenantId, scenario.tenantId);
    // Interleaved in capture order: video first, then the matching audio take.
    assert.equal(take.type, index % 2 === 0 ? "video" : "audio");
  }

  // ---- Transcripts of the spoken answers (audio takes → text intermediates). ----
  assert.equal(result.value.transcriptRefs.length, 3);
  for (const transcript of result.value.transcriptRefs) {
    assert.equal(transcript.artifact.stage, "intermediate");
    assert.equal(transcript.artifact.creationMethod, "organization-transform");
    assert.equal(transcript.artifact.parentArtifactRefs.length, 1);
  }

  // ---- The conversation graph (§14 labels end-to-end, avatar modality). ----
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
  for (const node of conversation.nodes) {
    if (node.kind === "question") {
      assert.equal(node.representationKind, "avatar");
      assert.equal(node.interviewerProvenance.origin, "synthetic-generated");
      assert.equal(node.interviewerProvenance.generatorCapability, "generate_avatar");
      assert.ok(node.agentExecution !== undefined, "agent execution traces travel into the conversation graph");
    }
  }
  assert.equal(conversation.containsSyntheticInterviewerMaterial, true);

  // ---- The W8-C editing session: the org's decisions at the video-podcast's
  // ---- declared points, composed through the REAL Editor Pawn + engines runner.
  const editing = result.value.editing;
  assert.equal(editing.record.lifecycle, "succeeded");
  assert.equal(editing.record.formatId, "video-podcast");
  const graph = editing.editGraph;
  assert.deepEqual(
    graph.declaredPointIds,
    ["participant-framing", "podcast-edit-points", "podcast-edit-pacing"],
    "the video-podcast format's declared decision points",
  );
  assert.deepEqual(
    graph.choices.map((choice) => [choice.choiceId, choice.decisionPointId, choice.selectedOption]),
    [
      ["choice-framing", "participant-framing", "org-learned-framing-side-by-side"],
      ["choice-edit-points", "podcast-edit-points", "org-learned-edit-keep-tighten"],
      ["choice-edit-pacing", "podcast-edit-pacing", "org-learned-pacing-front-load"],
    ],
  );
  for (const choice of graph.choices) {
    assert.equal(choice.decidedByOrganization.id, "org-studio-format-flows");
    assert.equal(choice.decidedByOrganization.version, 1);
  }
  // Every composition operation executed through the Editor Pawn with REAL
  // engine invocations (§30 summaries quote the runner's job identities).
  assert.equal(graph.operations.length, 5);
  for (const operation of graph.operations) {
    assert.equal(operation.outputArtifactRefs.length, 1);
    assert.ok(operation.inputArtifactRefs.length >= 1);
    assert.ok(operation.engineInvocations.length >= 1, `operation ${operation.operationId} recorded engine invocations`);
  }
  assert.ok(editing.record.engineInvocations.length >= graph.operations.length + 1, "the final assembly also invoked the engine");
  assert.ok(scenario.editingStack.jobEvents.completions.length >= 6, "job completion events recorded by the REAL runner");

  // ---- The composed final VIDEO artifact. ----
  const finalArtifact = result.value.finalArtifact;
  assert.equal(finalArtifact.type, "video");
  assert.equal(finalArtifact.stage, "final");
  assert.equal(finalArtifact.creationMethod, "composition");
  assert.ok(finalArtifact.parentArtifactRefs.length >= 1);

  // ---- The packaged StudioArtifactPackage: ALL required fields. ----
  const pkg: StudioArtifactPackage = result.value.package;
  assert.equal(pkg.sessionRef, result.value.sessionId);
  assert.equal(pkg.version, 1);
  assert.equal(pkg.rawArtifacts.length, 6, "six raw takes (video + audio per round)");
  assert.deepEqual(pkg.rawArtifacts, rawTakes);
  // intermediates = transcripts + the editing operation outputs.
  assert.equal(
    pkg.intermediateArtifacts.length,
    result.value.transcriptRefs.length + graph.operations.length,
  );
  assert.equal(pkg.finalArtifacts.length, 1);
  assert.deepEqual(pkg.finalArtifacts, [finalArtifact]);
  assert.deepEqual(pkg.transcriptRefs, result.value.transcriptRefs);
  assert.equal(pkg.conversationGraphRef.graphId, conversation.graphId);
  assert.equal(pkg.conversationGraphRef.version, conversation.version);
  assert.deepEqual(pkg.conversationGraphRef.derivedFrom, result.value.transcriptRefs);
  assert.deepEqual(pkg.editGraphRef, {
    graphId: graph.graphId,
    version: graph.version,
    otioInterchange: graph.otioInterchange,
  });
  // Provenance: closed lineage + the declared capture provenance refs.
  assert.equal(pkg.provenance.lineageComplete, true);
  assert.ok(
    pkg.provenance.provenanceRefs.map(String).includes("provenance-account-A"),
    "the declared capture provenance refs flow into the package",
  );
  assert.equal(pkg.consent.allRawArtifactsCovered, true);
  assert.ok(pkg.consent.participantConsentRefs.length >= 2, "the participant's real consent records flow into the package");
  assert.equal(pkg.evaluation.outcome, "accepted");
  // Cost = the editing session's engine cost + the plan's declared processing cost.
  const expectedCost = (editing.record.cost.amount + 0.55).toFixed(2);
  assert.equal(pkg.cost.total.amount, expectedCost);
  assert.equal(pkg.duration.captureSeconds, 6 * 42, "six sealed 42s takes");
  assert.equal(pkg.duration.processingSeconds, 60);
});

test("STUDIO-012 multi-account: two real speakers through §15 consent gates, consent + contribution provenance preserved", async () => {
  const scenario = composeFormatFlowScenario();
  const graph = await scriptGraphFor(scenario, "Interview us about learning to sail together");
  // Two REAL identities with SEPARATE session-scoped consent records (never pooled).
  const consentA = seedParticipant(scenario.authorities, SPEAKER_A);
  const consentB = seedParticipant(scenario.authorities, SPEAKER_B);
  const plan: VideoPodcastProductionPlan = {
    tenantId: scenario.tenantId,
    supplierIdentityRef: SUPPLIER,
    intent: "A two-person video podcast about sailing",
    organizationRef: { id: "org-studio-format-flows", version: 1 },
    participants: [
      videoParticipantPlan("participant-1", SPEAKER_A, consentA, "account-A"),
      videoParticipantPlan("participant-2", SPEAKER_B, consentB, "account-B"),
    ],
    scriptGraph: graph,
    interviewer: {
      representation: SYNTHETIC_AVATAR_INTERVIEWER,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    // Alternate the speakers across the adaptive rounds (multi-account capture).
    rounds: terminalRounds(["participant-1" as never, "participant-2" as never, "participant-1" as never]),
    editChoices: videoEditChoices(),
    operator: OPERATOR,
  };
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(result.ok, `the multi-account video-podcast flow must succeed: ${JSON.stringify(result)}`);
  assert.equal(result.value.sessionId, PREDICTED_SESSION_ID);

  // Both speakers joined with their own identity/account/consent boundaries.
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

  // Six raw takes captured across BOTH accounts' cameras + microphones.
  assert.equal(result.value.rawTakes.length, 6);
  const consentRefs = new Set(result.value.package.consent.participantConsentRefs.map(String));
  for (const ref of [...consentA, ...consentB]) {
    assert.ok(consentRefs.has(String(ref)), `consent ${String(ref)} must flow into the package`);
  }
  assert.equal(result.value.package.consent.allRawArtifactsCovered, true);
});

test("STUDIO-012 treatment on the packaged output creates a NEW immutable package version (§19)", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonVideoPlan(scenario);
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(result.ok, `flow must succeed: ${JSON.stringify(result)}`);
  const v1: StudioArtifactPackage = result.value.package;

  const treatmentRequest: OutputTreatmentRequest = {
    sessionId: result.value.sessionId,
    targetArtifact: result.value.finalArtifact,
    treatment: "trim",
    parametersRef: "params-trim-video-1",
    requestedBy: OPERATOR,
    requestedAt: scenario.clock(),
  };
  const treated = await scenario.runtime.applyTreatment(result.value.sessionId, treatmentRequest);
  assert.ok(treated.ok, `treatment must succeed: ${JSON.stringify(treated)}`);
  const v2 = treated.value.package as StudioArtifactPackage;
  assert.ok(v2 !== undefined, "treating a packaged session assembles a successor package version");

  // New immutable version under the SAME package id; v1 untouched + resolvable.
  assert.equal(v2.id, v1.id);
  assert.equal(v2.version, v1.version + 1);
  const view = scenario.runtime.getSession(result.value.sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 2);
  assert.deepEqual(view.packages[0], v1);
  assert.deepEqual(view.session.artifactPackageRef, { packageId: v1.id, version: v2.version });

  // The successor's lineage links to the treated final; the REAL conversation
  // + edit graph refs survive into the new version.
  const successor = v2.finalArtifacts[v2.finalArtifacts.length - 1];
  assert.ok(successor !== undefined && successor.artifactId !== result.value.finalArtifact.artifactId);
  assert.ok(
    successor.parentArtifactRefs.some((p) => p.artifactId === result.value.finalArtifact.artifactId),
    "the treated version must be a parent of the successor",
  );
  assert.deepEqual(v2.conversationGraphRef, v1.conversationGraphRef);
  assert.deepEqual(v2.editGraphRef, v1.editGraphRef);
  assert.equal(v2.transcriptRefs.length, v1.transcriptRefs.length);
  assert.equal(v2.provenance.lineageComplete, true);
  assert.equal(v2.evaluation.outcome, "treatment-requested");
});
