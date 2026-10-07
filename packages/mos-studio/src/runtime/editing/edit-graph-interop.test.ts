import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { composeEditingStack } from "../../testing/compose-editing-stack.js";
import {
  EDIT_GRAPH_INTERCHANGE_FORMAT,
  EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION,
  type EditGraphExport,
} from "../../contracts/edit-graph-interop.js";
import type { EditingCompositionGraph } from "../../contracts/editing-composition.js";
import {
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  editingChoice,
  editingSessionInputOverPackage,
} from "../../testing/editing-fixtures.js";

// ---------------------------------------------------------------------------
// STUDIO-008 §12 Editorial interoperability: editing decisions and edit
// graphs are INTEROPERABLE RECORDS. The studio declares ONE export format
// (`mos-edit-graph-interchange`, versioned) whose payload is the COMPLETE
// graph record — external editors can consume it, edit it and return it;
// import VALIDATES the returned record and VERSIONS it append-only. There
// is NO silent lossy conversion: the export carries the full graph
// verbatim, and the import either records the whole validated record or
// fails with enumerated reasons. OTIO stays an interchange LAYER (the
// `otioInterchange` flag), never the authority.
// ---------------------------------------------------------------------------

const SCOPE = { tenantId: EDITING_STACK_TENANT };
const SESSION_ID = "studio-session:editing-interop";

/** Runs one session and returns the stack + the recorded graph. */
async function interopScenario() {
  const stack = composeEditingStack();
  const formatPlugin = createAudioPodcastFormatPlugin();
  const final = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "final",
    content: "mix",
  });
  const sourcePackage = stack.buildSourcePackage({
    tenantId: EDITING_STACK_TENANT,
    sessionId: SESSION_ID,
    packageId: "package:interop-1",
    rawArtifacts: [],
    intermediateArtifacts: [],
    finalArtifacts: [final],
  });
  stack.grantTransformRights({
    tenantId: EDITING_STACK_TENANT,
    grantee: EDITING_PRINCIPAL,
    subjectRefs: [String(final.artifactId)],
  });
  const input = editingSessionInputOverPackage({
    formatPlugin,
    artifactPackage: sourcePackage,
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tight-cut",
        [
          {
            operationId: "op-cut-1",
            kind: "cut" as const,
            inputArtifactRefs: [final],
            parameters: { to: 10 },
          },
          {
            operationId: "op-scale-1",
            kind: "scale" as const,
            inputArtifactRefs: [final],
            parameters: { target: "1080p" },
          },
        ],
        stack.now(),
      ),
      editingChoice(
        "choice-pacing",
        "podcast-edit-pacing",
        "brisk",
        [
          {
            operationId: "op-reorder-1",
            kind: "reorder" as const,
            inputArtifactRefs: [final],
            parameters: { order: ["a", "b"] },
          },
        ],
        stack.now(),
      ),
    ],
  });
  const outcome = await stack.editing.runEditingSession(SCOPE, input);
  assert.ok(outcome.ok, `the session must succeed: ${JSON.stringify(outcome)}`);
  return { stack, graph: outcome.result.editGraph };
}

test("STUDIO-008 §12: export carries the COMPLETE graph verbatim in the ONE declared format", async () => {
  const scenario = await interopScenario();
  const exported = scenario.stack.editing.exportEditGraph(SCOPE, scenario.graph.graphId);
  assert.ok(exported.ok, "the recorded graph exports");
  const envelope = exported.export;
  assert.equal(envelope.format, EDIT_GRAPH_INTERCHANGE_FORMAT);
  assert.equal(envelope.formatVersion, EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION);
  assert.equal(envelope.tenantId, EDITING_STACK_TENANT);
  // NOTHING is projected away: the complete record, verbatim.
  assert.deepEqual(envelope.graph, scenario.graph);
  // Export of an unknown graph is an explicit negative outcome.
  const unknown = scenario.stack.editing.exportEditGraph(SCOPE, "edit-graph:unknown" as never);
  assert.ok(!unknown.ok);
  // Export of an EXACT version pins that version.
  const exact = scenario.stack.editing.exportEditGraph(SCOPE, scenario.graph.graphId, 1);
  assert.ok(exact.ok);
  assert.equal(exact.export.graph.version, 1);
});

test("STUDIO-008 §12: import validates + re-versions a returned record (round-trip, no silent loss)", async () => {
  const scenario = await interopScenario();
  const exported = scenario.stack.editing.exportEditGraph(SCOPE, scenario.graph.graphId);
  assert.ok(exported.ok);
  const original: EditingCompositionGraph = exported.export.graph;

  // An EXTERNAL EDITOR consumed the export and returned it with one choice
  // re-decided (the interoperability story: decisions are comparable data).
  const editedByExternalEditor: EditGraphExport = {
    ...exported.export,
    graph: {
      ...original,
      choices: original.choices.map((choice) =>
        choice.decisionPointId === "podcast-edit-points"
          ? { ...choice, selectedOption: "loose-cut" }
          : choice,
      ),
    },
  };
  const imported = scenario.stack.editing.importEditGraph(SCOPE, editedByExternalEditor);
  assert.ok(imported.ok, `the returned record imports: ${JSON.stringify(imported)}`);
  // The import VERSIONS the record append-only under the SAME chain id.
  assert.equal(imported.importedAs.graphId, scenario.graph.graphId);
  assert.equal(imported.importedAs.version, 2);
  assert.equal(imported.graph.version, 2);
  assert.equal(imported.graph.origin.kind, "imported-interchange");
  if (imported.graph.origin.kind === "imported-interchange") {
    assert.equal(imported.graph.origin.sourceVersion, original.version);
  }
  // The payload is preserved VERBATIM except the version chain assignment
  // and the import origin annotation (explicit versioning, no lossy
  // conversion): choices, operations, declared points all carried unchanged.
  assert.deepEqual(imported.graph.choices.map((choice) => choice.selectedOption), [
    "loose-cut",
    "brisk",
  ]);
  assert.equal(imported.graph.operations.length, original.operations.length);
  assert.deepEqual(imported.graph.declaredPointIds, original.declaredPointIds);
  assert.deepEqual(imported.graph.tenantId, original.tenantId);
  // The chain is append-only: both versions stay resolvable.
  const versions = scenario.stack.editing.listEditGraphVersions(SCOPE, scenario.graph.graphId);
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.map((version) => version.version), [1, 2]);
  assert.equal(scenario.stack.editing.getEditGraph(SCOPE, scenario.graph.graphId, 1)?.version, 1);
  // Re-importing the SAME returned record appends ANOTHER version (idempotent
  // chain growth — imports are new versions, never overwrites).
  const again = scenario.stack.editing.importEditGraph(SCOPE, editedByExternalEditor);
  assert.ok(again.ok);
  assert.equal(again.importedAs.version, 3);
});

test("STUDIO-008 §12: invalid returned records fail with enumerated reasons — nothing is recorded", async () => {
  const scenario = await interopScenario();
  const exported = scenario.stack.editing.exportEditGraph(SCOPE, scenario.graph.graphId);
  assert.ok(exported.ok);
  const original: EditingCompositionGraph = exported.export.graph;
  const versionsBefore = scenario.stack.editing.listEditGraphVersions(SCOPE, scenario.graph.graphId).length;

  // An operation with an edit kind outside the closed vocabulary.
  const alienKind = scenario.stack.editing.importEditGraph(SCOPE, {
    ...exported.export,
    graph: {
      ...original,
      operations: original.operations.map((operation) => ({ ...operation, kind: "speed-ramp" as never })),
    },
  });
  assert.ok(!alienKind.ok);
  if (!alienKind.ok) {
    assert.equal(alienKind.error.kind, "edit-graph-import-invalid");
    if (alienKind.error.kind === "edit-graph-import-invalid") {
      assert.ok(alienKind.error.reasons.some((reason) => reason.includes("unknown edit kind")));
    }
  }

  // An operation citing a choice that does not exist.
  const orphanOperation = scenario.stack.editing.importEditGraph(SCOPE, {
    ...exported.export,
    graph: {
      ...original,
      operations: original.operations.map((operation) => ({ ...operation, choiceId: "choice-nope" })),
    },
  });
  assert.ok(!orphanOperation.ok);
  assert.equal(orphanOperation.error.kind, "edit-graph-import-invalid");

  // A duplicated choice id.
  const duplicateChoice = scenario.stack.editing.importEditGraph(SCOPE, {
    ...exported.export,
    graph: {
      ...original,
      choices: [...original.choices, { ...original.choices[0]! }],
    },
  });
  assert.ok(!duplicateChoice.ok);
  assert.equal(duplicateChoice.error.kind, "edit-graph-import-invalid");

  // NOTHING was recorded by any failed import.
  assert.equal(
    scenario.stack.editing.listEditGraphVersions(SCOPE, scenario.graph.graphId).length,
    versionsBefore,
  );
});

test("STUDIO-008 §12: format identity and tenant scope are enforced on import", async () => {
  const scenario = await interopScenario();
  const exported = scenario.stack.editing.exportEditGraph(SCOPE, scenario.graph.graphId);
  assert.ok(exported.ok);

  // Unknown export format.
  const wrongFormat = scenario.stack.editing.importEditGraph(SCOPE, {
    ...exported.export,
    format: "some-other-editor-format" as never,
  });
  assert.ok(!wrongFormat.ok);
  if (!wrongFormat.ok) {
    assert.equal(wrongFormat.error.kind, "unknown-edit-graph-export-format");
    if (wrongFormat.error.kind === "unknown-edit-graph-export-format") {
      assert.equal(wrongFormat.error.format, "some-other-editor-format");
    }
  }

  // Unsupported format version (no silent downgrade/conversion).
  const wrongVersion = scenario.stack.editing.importEditGraph(SCOPE, {
    ...exported.export,
    formatVersion: 99,
  });
  assert.ok(!wrongVersion.ok);
  if (!wrongVersion.ok) {
    assert.equal(wrongVersion.error.kind, "unsupported-export-format-version");
    if (wrongVersion.error.kind === "unsupported-export-format-version") {
      assert.equal(wrongVersion.error.formatVersion, 99);
    }
  }

  // A foreign tenant's export is rejected (§31 — no sharing contract).
  const foreignTenant = scenario.stack.editing.importEditGraph(
    SCOPE,
    { ...exported.export, tenantId: "tenant:foreign" as never },
  );
  assert.ok(!foreignTenant.ok);
  if (!foreignTenant.ok) {
    assert.equal(foreignTenant.error.kind, "edit-graph-foreign-tenant");
    if (foreignTenant.error.kind === "edit-graph-foreign-tenant") {
      assert.equal(foreignTenant.error.exportTenantId, "tenant:foreign");
    }
  }
  // Nothing was recorded.
  assert.equal(scenario.stack.editing.listEditGraphVersions(SCOPE, scenario.graph.graphId).length, 1);
});

test("STUDIO-008 §12: two graph versions compare structurally (comparable shapes, no conversion)", async () => {
  const scenario = await interopScenario();
  const exported = scenario.stack.editing.exportEditGraph(SCOPE, scenario.graph.graphId);
  assert.ok(exported.ok);
  const original: EditingCompositionGraph = exported.export.graph;
  const imported = scenario.stack.editing.importEditGraph(SCOPE, {
    ...exported.export,
    graph: {
      ...original,
      // The external editor re-decided the edit-points choice AND added an
      // operation implementing it under the SAME choice.
      choices: original.choices.map((choice) =>
        choice.decisionPointId === "podcast-edit-points"
          ? { ...choice, selectedOption: "loose-cut", operationIds: ["op-cut-1", "op-scale-1", "op-reorder-1"] }
          : choice,
      ),
      operations: [
        ...original.operations,
        {
          ...original.operations[0]!,
          operationId: "op-caption-1",
          kind: "caption" as const,
          decisionPointId: "podcast-edit-points",
          choiceId: "choice-cut",
        },
      ],
    },
  });
  assert.ok(imported.ok);

  const comparison = scenario.stack.editing.compareEditGraphs(
    SCOPE,
    { graphId: scenario.graph.graphId, version: 1 },
    { graphId: scenario.graph.graphId, version: 2 },
  );
  assert.ok(comparison.ok, `the two versions compare: ${JSON.stringify(comparison)}`);
  if (!comparison.ok) return;
  const { comparison: view } = comparison;
  assert.deepEqual(view.sharedPointIds, ["podcast-edit-points", "podcast-edit-pacing"]);
  assert.deepEqual(view.pointsOnlyInA, []);
  assert.deepEqual(view.pointsOnlyInB, []);
  // The per-point choice difference exposes the re-decision.
  const editPoints = view.choiceDifferences.find(
    (difference) => difference.decisionPointId === "podcast-edit-points",
  );
  assert.ok(editPoints);
  assert.equal(editPoints?.inA?.selectedOption, "tight-cut");
  assert.equal(editPoints?.inB?.selectedOption, "loose-cut");
  assert.deepEqual(editPoints?.inB?.operationIds, ["op-cut-1", "op-scale-1", "op-reorder-1"]);
  // The operation-kind histograms project both sides (cut/scale/reorder + caption).
  assert.equal(view.operationKindCountsA.cut, 1);
  assert.equal(view.operationKindCountsA.scale, 1);
  assert.equal(view.operationKindCountsA.reorder, 1);
  assert.equal(view.operationKindCountsA.caption, 0);
  assert.equal(view.operationKindCountsB.caption, 1);
  assert.equal(view.operationKindCountsB.cut, 1);
  // Comparing against an unknown graph is the typed negative outcome.
  const missing = scenario.stack.editing.compareEditGraphs(
    SCOPE,
    { graphId: "edit-graph:missing" as never, version: 1 },
    { graphId: scenario.graph.graphId, version: 1 },
  );
  assert.ok(!missing.ok);
  assert.equal(missing.kind, "edit-graph-not-found");
});
