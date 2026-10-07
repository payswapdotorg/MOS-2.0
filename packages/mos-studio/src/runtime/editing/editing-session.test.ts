import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { composeEditingStack } from "../../testing/compose-editing-stack.js";
import {
  EDITING_ORGANIZATION_REF,
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  editingChoice,
  editingContributor,
  editingSessionInputOverPackage,
  recordEditingSessionConsent,
} from "../../testing/editing-fixtures.js";
import type { StudioArtifactPackage } from "../../contracts/studio-artifact-package.js";
import type { EditingContributor } from "../../contracts/editing-composition.js";

// ---------------------------------------------------------------------------
// STUDIO-008: the editing-session round-trip — a packaged artifact + an
// organization (whose §16-style edit decision points drive the choices —
// THE ORG DECIDES, THE STUDIO RECORDS) produce a NEW IMMUTABLE VERSION of
// the artifact package (treatment-versioned like W3-C) with a complete
// recorded edit graph, versioned intermediates (CORE-004 discipline) and
// §30 records of every engine invocation through the REAL engines runner.
// ---------------------------------------------------------------------------

const SCOPE = { tenantId: EDITING_STACK_TENANT };
const SESSION_ID = "studio-session:editing-001";

/** Builds the standard scenario: one source package + contributor consent + transform grants. */
async function standardScenario() {
  const stack = composeEditingStack();
  const formatPlugin = createAudioPodcastFormatPlugin();
  const now = stack.now;
  const raw = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "raw",
    content: "speaker-a-voice",
  });
  const sourceFinal = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "final",
    content: "source-final-mix",
  });
  const consentRef = recordEditingSessionConsent(stack.rightsRepository, {
    tenantId: EDITING_STACK_TENANT,
    identityRef: "identity:contributor-a",
    sessionId: SESSION_ID,
  });
  const contributors: EditingContributor[] = [
    editingContributor("identity:contributor-a", [String(consentRef)]),
  ];
  const sourcePackage = stack.buildSourcePackage({
    tenantId: EDITING_STACK_TENANT,
    sessionId: SESSION_ID,
    packageId: "package:episode-1",
    rawArtifacts: [raw],
    intermediateArtifacts: [],
    finalArtifacts: [sourceFinal],
    consentRefs: [consentRef],
  });
  stack.grantTransformRights({
    tenantId: EDITING_STACK_TENANT,
    grantee: EDITING_PRINCIPAL,
    subjectRefs: [String(raw.artifactId), String(sourceFinal.artifactId)],
  });
  const choices = [
    editingChoice(
      "choice-cut",
      "podcast-edit-points",
      "keep-opening-cut-midroll",
      [
        {
          operationId: "op-cut-1",
          kind: "cut" as const,
          inputArtifactRefs: [sourceFinal],
          parameters: { from: 0, to: 42 },
        },
        {
          operationId: "op-trim-1",
          kind: "trim" as const,
          inputArtifactRefs: [raw],
          parameters: { leadIn: 1.5 },
        },
      ],
      now(),
    ),
    editingChoice(
      "choice-pacing",
      "podcast-edit-pacing",
      "fast-paced-reorder",
      [
        {
          operationId: "op-reorder-1",
          kind: "reorder" as const,
          inputArtifactRefs: [sourceFinal, raw],
          parameters: { order: ["op-cut-1", "op-trim-1"] },
        },
      ],
      now(),
    ),
  ];
  const input = editingSessionInputOverPackage({
    formatPlugin,
    artifactPackage: sourcePackage,
    choices,
    contributors,
  });
  return { stack, formatPlugin, input, sourcePackage, raw, sourceFinal, choices, contributors };
}

test("STUDIO-008 round-trip: packaged artifact + org choices → new immutable version + complete edit graph", async () => {
  const scenario = await standardScenario();
  const outcome = await scenario.stack.editing.runEditingSession(SCOPE, scenario.input);
  assert.ok(outcome.ok, `the editing session must succeed: ${JSON.stringify(outcome)}`);
  const { result } = outcome;

  // ---- The NEW IMMUTABLE VERSION (treatment-versioned, §19) ----
  const newPackage: StudioArtifactPackage = result.newPackage;
  assert.equal(newPackage.id, scenario.sourcePackage.id, "same package id — a treatment version");
  assert.equal(newPackage.version, scenario.sourcePackage.version + 1, "version+1");
  assert.ok(Object.isFrozen(newPackage), "the new package version is frozen");
  // The predecessor is NEVER mutated and stays bit-identical.
  assert.equal(scenario.sourcePackage.version, 1);
  assert.deepEqual(newPackage.rawArtifacts, scenario.sourcePackage.rawArtifacts);
  // The new version's editGraphRef cites the recorded graph.
  assert.deepEqual(newPackage.editGraphRef, {
    graphId: result.editGraph.graphId,
    version: result.editGraph.version,
    otioInterchange: false,
  });

  // ---- The complete EDIT GRAPH (the org decides; the studio records) ----
  const graph = result.editGraph;
  assert.equal(graph.formatId, "audio-podcast");
  assert.deepEqual(graph.declaredPointIds, ["podcast-edit-points", "podcast-edit-pacing"]);
  assert.equal(graph.origin.kind, "editing-session");
  assert.equal(graph.editingSessionId, result.editingSessionId);
  assert.equal(graph.choices.length, 2);
  for (const choice of graph.choices) {
    assert.deepEqual(
      choice.decidedByOrganization,
      EDITING_ORGANIZATION_REF,
      "every recorded choice carries the deciding organization's provenance",
    );
  }
  assert.deepEqual(
    graph.choices.map((choice) => [choice.choiceId, choice.decisionPointId, choice.selectedOption]),
    [
      ["choice-cut", "podcast-edit-points", "keep-opening-cut-midroll"],
      ["choice-pacing", "podcast-edit-pacing", "fast-paced-reorder"],
    ],
    "org choices recorded verbatim with provenance",
  );
  // Every operation is recorded with its inputs, NEW output versions and
  // §30 engine-invocation summaries.
  assert.equal(graph.operations.length, 3);
  assert.deepEqual(
    graph.operations.map((operation) => [operation.operationId, operation.kind, operation.choiceId]),
    [
      ["op-cut-1", "cut", "choice-cut"],
      ["op-trim-1", "trim", "choice-cut"],
      ["op-reorder-1", "reorder", "choice-pacing"],
    ],
  );
  assert.ok(graph.operations.every((operation) => operation.engineInvocations.length === 1));

  // ---- Intermediates VERSIONED through the ArtifactFactoryPort (CORE-004) ----
  const created = scenario.stack.artifactFactory.createdArtifacts;
  // 3 operation outputs + 1 final assembly artifact were newly versioned.
  const operationOutputs = graph.operations.map((operation) => operation.outputArtifactRefs[0]);
  assert.equal(operationOutputs.length, 3);
  for (let index = 0; index < graph.operations.length; index += 1) {
    const operation = graph.operations[index];
    if (operation === undefined) continue;
    const declaredInput = operation.inputArtifactRefs[0];
    const output = operation.outputArtifactRefs[0];
    assert.ok(output, "every operation produced a new studio-side version");
    assert.deepEqual(
      output.parentArtifactRefs,
      operation.inputArtifactRefs,
      "lineage: parents = the operation's declared inputs",
    );
    assert.equal(output.stage, "intermediate");
    assert.equal(output.creationMethod, "composition");
    assert.notEqual(String(output.artifactId), String(declaredInput?.artifactId));
    assert.ok(
      created.some((artifact) => String(artifact.artifactId) === String(output.artifactId)),
      "outputs are factory-versioned artifacts",
    );
  }
  // The new package carries inherited + newly versioned intermediates, and a
  // NEW final candidate whose parents are all operation outputs.
  assert.equal(newPackage.intermediateArtifacts.length, 3);
  assert.deepEqual(newPackage.intermediateArtifacts, operationOutputs);
  assert.equal(newPackage.finalArtifacts.length, 1);
  assert.deepEqual(newPackage.finalArtifacts[0]?.parentArtifactRefs, operationOutputs);
  assert.equal(newPackage.finalArtifacts[0]?.stage, "final");
  // Consent is inherited onto the new version (§15).
  assert.deepEqual(
    newPackage.consent.participantConsentRefs,
    scenario.sourcePackage.consent.participantConsentRefs,
  );

  // ---- §30 records: engine invocations through the REAL engines runner ----
  const record = result.record;
  assert.equal(record.lifecycle, "succeeded");
  assert.equal(record.contractVersion, "editing-session/1");
  assert.equal(record.tenantId, EDITING_STACK_TENANT);
  assert.deepEqual(record.actor, { kind: "identity", principalId: EDITING_PRINCIPAL });
  assert.deepEqual(record.organization, EDITING_ORGANIZATION_REF);
  assert.deepEqual(record.source, {
    packageId: scenario.sourcePackage.id,
    packageVersion: 1,
    sessionRef: scenario.sourcePackage.sessionRef,
  });
  assert.deepEqual(record.resultPackage, { packageId: newPackage.id, version: newPackage.version });
  assert.deepEqual(record.editGraph, { graphId: graph.graphId, version: graph.version });
  // 3 operation executions + 1 final assembly = 4 engine invocations.
  assert.equal(record.engineInvocations.length, 4);
  for (const invocation of record.engineInvocations) {
    assert.equal(invocation.engineId, "engine:timeline-renderer");
    assert.equal(invocation.engineVersion, 1);
    assert.equal(invocation.capabilityId, "render_timeline");
    assert.equal(invocation.capabilityVersion, 1);
    assert.equal(invocation.lifecycle, "succeeded");
    assert.equal(invocation.failureCode, null);
    assert.ok(invocation.jobId.length > 0, "job ids cite the EngineJobs");
    assert.equal(invocation.cost.amount, 0.02);
  }
  // The EngineJobs really flowed through the REAL runner (§30 event trail).
  const jobEvents = scenario.stack.jobEvents.events;
  assert.equal(jobEvents.length, 4 * 3, "queued/running/completed events per EngineJob");
  const queuedEvents = jobEvents.filter((event) => event.type === "job-queued");
  assert.equal(queuedEvents.length, 4);
  assert.ok(queuedEvents.every((event) => event.engineId === "engine:timeline-renderer"));
  // Editor pawn citation (the W7-B Editor Pawn through production surfaces).
  assert.equal(record.editorPawn.pawnKind, "editor");
  assert.equal(record.editorPawn.bodyId, "pawn:editor");
  assert.equal(record.editorPawn.bodyVersion, 1);
  // Cost/latency/provenance present.
  assert.equal(record.cost.amount, 0.08);
  assert.equal(record.cost.currency, "USD");
  assert.ok(record.durationMs >= 0);
  assert.deepEqual(record.provenance, {
    transformApplication: scenario.input.transformApplication,
    seed: scenario.input.seed,
  });
  // artifactIds echo the consumed + produced ids.
  for (const artifactId of [String(scenario.raw.artifactId), String(scenario.sourceFinal.artifactId)]) {
    assert.ok(record.artifactIds.includes(artifactId));
  }

  // ---- Port reads: the session + graph are tenant-scoped and resolvable ----
  const stored = scenario.stack.editing.getEditingSession(SCOPE, result.editingSessionId);
  assert.ok(stored, "the §30 session record is retrievable");
  assert.equal(stored?.editingSessionId, result.editingSessionId);
  assert.equal(scenario.stack.editing.listEditingSessions(SCOPE).length, 1);
  const storedGraph = scenario.stack.editing.getEditGraph(SCOPE, graph.graphId);
  assert.ok(storedGraph, "the edit graph is retrievable");
  assert.equal(storedGraph?.version, graph.version);
  assert.equal(scenario.stack.editing.listEditGraphVersions(SCOPE, graph.graphId).length, 1);
});

test("STUDIO-008 treatment chain: a second editing session over the new version produces version+1 again", async () => {
  const scenario = await standardScenario();
  const first = await scenario.stack.editing.runEditingSession(SCOPE, scenario.input);
  assert.ok(first.ok);
  // A no-op session over the NEW version: the org decided to change nothing.
  const second = await scenario.stack.editing.runEditingSession(SCOPE, {
    ...scenario.input,
    source: { kind: "package", artifactPackage: first.result.newPackage },
    choices: [],
    contributors: scenario.contributors,
  });
  assert.ok(second.ok, `the no-op session must succeed: ${JSON.stringify(second)}`);
  assert.equal(second.result.newPackage.id, first.result.newPackage.id);
  assert.equal(second.result.newPackage.version, first.result.newPackage.version + 1);
  // The honest NO-OP edit graph (lock rule 5: no-op is first-class).
  assert.equal(second.result.editGraph.choices.length, 0);
  assert.equal(second.result.editGraph.operations.length, 0);
  assert.deepEqual(second.result.editGraph.declaredPointIds, ["podcast-edit-points", "podcast-edit-pacing"]);
  // No engine invocations ran for a no-op (nothing to compose).
  assert.equal(second.result.record.engineInvocations.length, 0);
  // The no-op new version inherits the final artifacts (nothing changed).
  assert.deepEqual(second.result.newPackage.finalArtifacts, first.result.newPackage.finalArtifacts);
  // Both sessions are in the append-only log.
  assert.equal(scenario.stack.editing.listEditingSessions(SCOPE).length, 2);
  // The session filter narrows by produced package id.
  assert.equal(
    scenario.stack.editing.listEditingSessions(SCOPE, { packageId: first.result.newPackage.id }).length,
    2,
  );
});

test("STUDIO-008 intermediates source: editing session intermediates starts a NEW package id", async () => {
  const scenario = await standardScenario();
  const outcome = await scenario.stack.editing.runEditingSession(SCOPE, {
    ...scenario.input,
    source: {
      kind: "intermediates",
      sessionRef: scenario.sourcePackage.sessionRef,
      intermediates: [scenario.sourceFinal],
    },
    // Only the cited intermediates are editable inputs for this source.
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tighten-the-opening",
        [
          {
            operationId: "op-cut-1",
            kind: "cut" as const,
            inputArtifactRefs: [scenario.sourceFinal],
            parameters: { from: 0, to: 30 },
          },
        ],
        scenario.stack.now(),
      ),
    ],
  });
  assert.ok(outcome.ok, `the intermediates session must succeed: ${JSON.stringify(outcome)}`);
  const { result } = outcome;
  assert.notEqual(result.newPackage.id, scenario.sourcePackage.id, "a NEW package id");
  assert.equal(result.newPackage.version, 1);
  // The new package's intermediates = the cited source intermediates + the
  // newly versioned operation outputs (CORE-004 discipline).
  assert.equal(result.newPackage.intermediateArtifacts.length, 2);
  assert.deepEqual(result.newPackage.intermediateArtifacts.slice(0, 1), [scenario.sourceFinal]);
  assert.deepEqual(result.record.source, {
    packageId: null,
    packageVersion: null,
    sessionRef: scenario.sourcePackage.sessionRef,
  });
});
