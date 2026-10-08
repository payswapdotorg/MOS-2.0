import assert from "node:assert/strict";
import { test } from "node:test";

import { FLOW_ORGANIZATION_REF } from "../../testing/compose-format-flows.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import {
  OPERATOR,
  PREDICTED_SESSION_ID,
  REACTOR_A,
  REACTOR_B,
  SUPPLIER,
  composeFormatFlowScenario,
  onePersonReactionPlan,
  reactionCompositionChoices,
  reactionParticipantPlan,
  reactionSourcePlan,
  seedParticipant,
  seedSourceConsent,
} from "../../testing/format-flow-fixtures.js";
import type { FormatFlowScenario } from "../../testing/compose-format-flows.js";
import type { ReactionProductionPlan } from "../reaction/reaction-plan.js";
import type { StudioArtifactPackage } from "../../contracts/studio-artifact-package.js";
import type { OutputTreatmentRequest } from "../../contracts/treatment.js";

// ---------------------------------------------------------------------------
// STUDIO-009: the reaction session round-trips — rights-cleared source +
// human participant → the org's §16 reaction-composition decisions → the
// W8-C editing surface → the packaged StudioArtifactPackage with ALL required
// fields; synthetic vs real reactor labeling; multi-account §15 consent;
// treatment → new immutable version; edit-graph integration.
// Fail-closed paths live in reaction-flow-failures.test.ts.
// ---------------------------------------------------------------------------

test("STUDIO-009 round-trip: source + participant → org §16 decisions → editing → packaged artifact with all required fields", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonReactionPlan(scenario);
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(result.ok, `the reaction flow must succeed: ${JSON.stringify(result)}`);

  // The deterministic session id the seeded §15 consent records target.
  assert.equal(result.value.sessionId, PREDICTED_SESSION_ID);
  assert.equal(result.value.session.session.lifecycle.state, "packaged");
  assert.equal(result.value.session.session.formatVersion.formatId, "reaction");

  // ---- The source/reference artifact: the §6 acquired input, rights-gated. ----
  assert.equal(result.value.sources.length, 1);
  const source = result.value.sources[0] as StudioArtifactRef;
  assert.equal(source.type, "video");
  assert.equal(source.stage, "raw");
  assert.equal(source.creationMethod, "human-import");
  assert.equal(source.parentArtifactRefs.length, 0, "an acquired input is a lineage root");

  // ---- Capture rounds: one audio + one video take per round (STUDIO-005). ----
  assert.equal(result.value.rawTakes.length, 4, "two rounds × (audio + video)");
  for (const take of result.value.rawTakes as readonly StudioArtifactRef[]) {
    assert.equal(take.stage, "raw");
    assert.equal(take.creationMethod, "human-capture");
    assert.equal(take.tenantId, scenario.tenantId);
  }
  assert.equal(result.value.rawTakes.filter((take) => take.type === "audio").length, 2);
  assert.equal(result.value.rawTakes.filter((take) => take.type === "video").length, 2);

  // ---- §16: raw reaction capture enters the organization as INTERMEDIATE. ----
  assert.equal(result.value.entryArtifacts.length, 4);
  for (const entry of result.value.entryArtifacts) {
    assert.equal(entry.stage, "intermediate");
    assert.equal(entry.creationMethod, "organization-transform", "the HUMAN reactor's entry is an organization transform");
    assert.equal(entry.parentArtifactRefs.length, 1);
  }

  // ---- Transcripts of the spoken reaction. ----
  assert.equal(result.value.transcriptRefs.length, 2);
  for (const transcript of result.value.transcriptRefs) {
    assert.equal(transcript.artifact.stage, "intermediate");
    assert.equal(transcript.artifact.creationMethod, "organization-transform");
    assert.equal(transcript.artifact.parentArtifactRefs.length, 1);
  }

  // ---- The W8-C editing session: the org's §16 decisions, composed for real. ----
  const editing = result.value.editing;
  assert.equal(editing.record.lifecycle, "succeeded");
  assert.equal(editing.record.formatId, "reaction");
  assert.equal(editing.record.organization.id, String(FLOW_ORGANIZATION_REF.id));
  assert.equal(editing.record.organization.version, FLOW_ORGANIZATION_REF.version);
  const graph = editing.editGraph;
  assert.deepEqual(
    graph.declaredPointIds,
    ["reaction-layout", "reaction-timing", "source-presentation"],
    "the reaction format's §16 decision points, declared",
  );
  assert.deepEqual(
    graph.choices.map((choice) => [choice.choiceId, choice.decisionPointId, choice.selectedOption]),
    [
      ["choice-reaction-layout", "reaction-layout", "org-learned-layout-variant-a"],
      ["choice-reaction-timing", "reaction-timing", "org-learned-timing-variant-b"],
      ["choice-source-presentation", "source-presentation", "org-learned-presentation-variant-c"],
    ],
  );
  for (const choice of graph.choices) {
    assert.equal(choice.decidedByOrganization.id, String(FLOW_ORGANIZATION_REF.id));
    assert.equal(choice.decidedByOrganization.version, FLOW_ORGANIZATION_REF.version);
  }
  // Every composition operation executed through the Editor Pawn with REAL
  // engine invocations (§30 summaries quote the runner's job identities).
  assert.equal(graph.operations.length, 4);
  for (const operation of graph.operations) {
    assert.equal(operation.outputArtifactRefs.length, 1);
    assert.ok(operation.inputArtifactRefs.length >= 1);
    assert.ok(
      operation.engineInvocations.length >= 1,
      `operation ${operation.operationId} recorded engine invocations`,
    );
    assert.equal(operation.engineInvocations[0]?.engineId, "engine:timeline-renderer");
  }
  assert.ok(editing.record.engineInvocations.length >= graph.operations.length + 1, "the final assembly also invoked the engine");
  // The engine jobs REALLY flowed through the runner seam (§30 event trail).
  assert.ok(scenario.editingStack.jobEvents.completions.length >= 5, "job completion events recorded by the REAL runner");

  // ---- The composed final artifact (video, lineage over source + reaction). ----
  const finalArtifact = result.value.finalArtifact;
  assert.equal(finalArtifact.type, "video");
  assert.equal(finalArtifact.stage, "final");
  assert.equal(finalArtifact.creationMethod, "composition");
  assert.ok(finalArtifact.parentArtifactRefs.length >= 1);

  // ---- The packaged StudioArtifactPackage: ALL required fields. ----
  const pkg = result.value.package;
  assert.equal(pkg.sessionRef, result.value.sessionId);
  assert.equal(pkg.version, 1);
  // raw = the imported source + the four takes. (Identity comparison is by
  // artifact id: the authority stores clone-then-deep-frozen records — the
  // caller's draft artifacts are never aliased into the store, W9-B D3.)
  assert.equal(pkg.rawArtifacts.length, 5);
  assert.ok(
    pkg.rawArtifacts.some((artifact) => artifact.artifactId === source.artifactId),
    "the imported source is a raw artifact of the package",
  );
  // intermediates = transcripts + §16 entries + the editing operation outputs.
  assert.equal(
    pkg.intermediateArtifacts.length,
    result.value.transcriptRefs.length + result.value.entryArtifacts.length + graph.operations.length,
  );
  assert.equal(pkg.finalArtifacts.length, 1);
  assert.deepEqual(pkg.finalArtifacts, [finalArtifact]);
  assert.deepEqual(pkg.transcriptRefs, result.value.transcriptRefs);
  // Reaction is NOT interview-style: the honest session-scoped placeholder
  // conversation-graph ref (no adaptive interview ran).
  assert.equal(String(pkg.conversationGraphRef.graphId), `mos-studio:conversation-graph:${String(result.value.sessionId)}`);
  // The edit graph is the W8-C session's recorded graph.
  assert.deepEqual(pkg.editGraphRef, {
    graphId: graph.graphId,
    version: graph.version,
    otioInterchange: graph.otioInterchange,
  });
  // Provenance: closed lineage, no synthetic material (a REAL human reactor).
  assert.equal(pkg.provenance.lineageComplete, true);
  assert.equal(pkg.provenance.containsSyntheticMaterial, false);
  assert.ok(pkg.provenance.provenanceRefs.map(String).includes("provenance-source-video-1"));
  // Consent: every raw artifact (source + takes) covered; the participant's
  // real consent records flow into the package.
  assert.equal(pkg.consent.allRawArtifactsCovered, true);
  assert.ok(pkg.consent.participantConsentRefs.length >= 2);
  // Evaluation + cost + duration.
  assert.equal(pkg.evaluation.outcome, "accepted");
  const expectedCost = (editing.record.cost.amount + 0.3).toFixed(2);
  assert.equal(pkg.cost.total.amount, expectedCost);
  assert.equal(pkg.duration.captureSeconds, 4 * 42, "four sealed 42s takes");
  assert.equal(pkg.duration.processingSeconds, 45);
});

test("STUDIO-009 synthetic reactor labeling: one-person synthetic variant is engine-generated + disclosed; real stays human", async () => {
  const scenario = composeFormatFlowScenario();
  const consentRefs = seedParticipant(scenario.authorities, REACTOR_A);
  const sourceConsentRef = seedSourceConsent(scenario.authorities);
  const plan: ReactionProductionPlan = {
    tenantId: scenario.tenantId,
    supplierIdentityRef: SUPPLIER,
    intent: "A synthetic persona reacts to the keynote",
    organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
    sources: [reactionSourcePlan(sourceConsentRef)],
    participants: [
      reactionParticipantPlan("participant-1", REACTOR_A, consentRefs, "account-A", {
        reactorKind: "synthetic",
        syntheticGenerator: { capability: "generate_reaction_persona" },
      }),
    ],
    rounds: [{ participantId: "participant-1" as never }],
    compositionChoices: reactionCompositionChoices(),
    operator: OPERATOR,
  };
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(result.ok, `the synthetic-labeled reaction flow must succeed: ${JSON.stringify(result)}`);

  // The synthetic reactor's §16 entry intermediates are engine-generated and
  // the provenance ref NAMES the generating capability (§14-style disclosure).
  for (const entry of result.value.entryArtifacts) {
    assert.equal(entry.creationMethod, "engine-generated", "synthetic reactor entries are engine-generated");
    assert.match(String(entry.provenanceRef), /synthetic:generate_reaction_persona$/);
  }
  // The packaged output carries the synthetic disclosure.
  assert.equal(result.value.package.provenance.containsSyntheticMaterial, true);

  // The REAL-human variant (a FRESH scenario: the §15 consent records are
  // session-subject scoped to the first-drawn session id) stays human-labeled.
  const realScenario = composeFormatFlowScenario();
  const realPlan = await onePersonReactionPlan(realScenario);
  const realResult = await realScenario.reactionFlow.run(realPlan);
  assert.ok(realResult.ok);
  for (const entry of realResult.value.entryArtifacts) {
    assert.equal(entry.creationMethod, "organization-transform");
    assert.match(String(entry.provenanceRef), /human:participant-1$/);
  }
  assert.equal(realResult.value.package.provenance.containsSyntheticMaterial, false);
});

test("STUDIO-009 multi-account: two real reactors through §15 consent gates, consent never pooled", async () => {
  const scenario: FormatFlowScenario = composeFormatFlowScenario();
  const consentA = seedParticipant(scenario.authorities, REACTOR_A);
  const consentB = seedParticipant(scenario.authorities, REACTOR_B);
  const sourceConsentRef = seedSourceConsent(scenario.authorities);
  const plan: ReactionProductionPlan = {
    tenantId: scenario.tenantId,
    supplierIdentityRef: SUPPLIER,
    intent: "Two creators react together",
    organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
    sources: [reactionSourcePlan(sourceConsentRef)],
    participants: [
      reactionParticipantPlan("participant-1", REACTOR_A, consentA, "account-A"),
      reactionParticipantPlan("participant-2", REACTOR_B, consentB, "account-B"),
    ],
    rounds: [
      { participantId: "participant-1" as never },
      { participantId: "participant-2" as never },
    ],
    compositionChoices: reactionCompositionChoices(),
    operator: OPERATOR,
  };
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(result.ok, `the multi-account reaction flow must succeed: ${JSON.stringify(result)}`);
  assert.equal(result.value.sessionId, PREDICTED_SESSION_ID);

  // Both reactors joined with their own identity/account/consent boundaries.
  const participants = result.value.session.participants;
  assert.equal(participants.length, 2);
  assert.deepEqual(
    participants.map((p) => [String(p.identityRef), String(p.accountBoundary.accountId)]),
    [
      [String(REACTOR_A), "account-A"],
      [String(REACTOR_B), "account-B"],
    ],
  );
  // Consent refs stayed SEPARATE per participant (never pooled, §15).
  assert.deepEqual(participants[0]?.consent.consentRefs, consentA);
  assert.deepEqual(participants[1]?.consent.consentRefs, consentB);

  // Raw takes were captured by BOTH accounts (4 takes: each reactor one round).
  assert.equal(result.value.rawTakes.length, 4);
  const consentRefs = new Set(result.value.package.consent.participantConsentRefs.map(String));
  for (const ref of [...consentA, ...consentB]) {
    assert.ok(consentRefs.has(String(ref)), `consent ${String(ref)} must flow into the package`);
  }
  // The source's own consent record covers the imported raw artifact
  // (allRawArtifactsCovered includes the §6 acquired input).
  assert.equal(result.value.package.consent.allRawArtifactsCovered, true);
});

test("STUDIO-009 treatment on the packaged output creates a NEW immutable package version (§19)", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonReactionPlan(scenario);
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(result.ok, `flow must succeed: ${JSON.stringify(result)}`);
  const v1: StudioArtifactPackage = result.value.package;

  const treatmentRequest: OutputTreatmentRequest = {
    sessionId: result.value.sessionId,
    targetArtifact: result.value.finalArtifact,
    treatment: "trim",
    parametersRef: "params-trim-reaction-1",
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

  // The successor's lineage links to the treated final; the §16 edit graph
  // refs survive into the new version.
  const successor = v2.finalArtifacts[v2.finalArtifacts.length - 1];
  assert.ok(successor !== undefined && successor.artifactId !== result.value.finalArtifact.artifactId);
  assert.ok(
    successor.parentArtifactRefs.some((p) => p.artifactId === result.value.finalArtifact.artifactId),
    "the treated version must be a parent of the successor",
  );
  assert.deepEqual(v2.editGraphRef, v1.editGraphRef);
  assert.equal(v2.transcriptRefs.length, v1.transcriptRefs.length);
  assert.equal(v2.provenance.lineageComplete, true);
  assert.equal(v2.evaluation.outcome, "treatment-requested");
});

test("STUDIO-009 edit-graph integration: the W8-C surface resolves + re-versions the recorded reaction edit graph", async () => {
  const scenario = composeFormatFlowScenario();
  const plan = await onePersonReactionPlan(scenario);
  const result = await scenario.reactionFlow.run(plan);
  assert.ok(result.ok);
  const { editing, package: pkg } = result.value;
  const scope = { tenantId: scenario.tenantId };

  // The recorded graph resolves through the editing port (exact version).
  const resolved = scenario.editingStack.editing.getEditGraph(scope, editing.editGraph.graphId, editing.editGraph.version);
  assert.ok(resolved !== undefined);
  assert.deepEqual(resolved, editing.editGraph);
  assert.equal(String(resolved?.graphId), String(pkg.editGraphRef.graphId));

  // The §30 session record resolves and cites the same graph.
  const record = scenario.editingStack.editing.getEditingSession(scope, editing.editingSessionId);
  assert.ok(record !== undefined);
  assert.deepEqual(record?.editGraph, { graphId: editing.editGraph.graphId, version: editing.editGraph.version });
  assert.deepEqual(record?.resultPackage, { packageId: editing.newPackage.id, version: editing.newPackage.version });

  // The append-only version chain lists exactly this version.
  const versions = scenario.editingStack.editing.listEditGraphVersions(scope, editing.editGraph.graphId);
  assert.equal(versions.length, 1);
});
