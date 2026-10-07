import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { composeEditingStack } from "../../testing/compose-editing-stack.js";
import {
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  editingChoice,
  editingSessionInputOverPackage,
  recordEditingSessionConsent,
} from "../../testing/editing-fixtures.js";
import { createEditorPawnBinding, FINAL_ASSEMBLY_OPERATION_ID } from "./editor-pawn-binding.js";

// ---------------------------------------------------------------------------
// STUDIO-008: the EDITOR AGENT BINDING — the W7-B Editor Pawn composed
// through the REAL `@mos/production` surfaces (a registry-listed studio
// dependency since W7-B). The editor pawn is DETERMINISTIC (no model
// binding — pinned separately in editing-no-model-selection.test.ts); its
// engine invocations are EngineJobs through the REAL engines runner seam
// and typed failures pass through VERBATIM into the §30 records; the rights
// gate PRECEDES every engine invocation; the instance is released after the
// session; the studio never selects models and never publishes.
// ---------------------------------------------------------------------------

const SCOPE = { tenantId: EDITING_STACK_TENANT };
const SESSION_ID = "studio-session:editing-binding";

/** A single-operation session scenario over a packaged source. */
async function bindingScenario(stack: ReturnType<typeof composeEditingStack>) {
  const formatPlugin = createAudioPodcastFormatPlugin();
  const final = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "final",
    content: "mix",
  });
  const consentRef = recordEditingSessionConsent(stack.rightsRepository, {
    tenantId: EDITING_STACK_TENANT,
    identityRef: "identity:contributor-a",
    sessionId: SESSION_ID,
  });
  const sourcePackage = stack.buildSourcePackage({
    tenantId: EDITING_STACK_TENANT,
    sessionId: SESSION_ID,
    packageId: "package:binding-1",
    rawArtifacts: [],
    intermediateArtifacts: [],
    finalArtifacts: [final],
    consentRefs: [consentRef],
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
        "tight",
        [
          {
            operationId: "op-cut-1",
            kind: "cut" as const,
            inputArtifactRefs: [final],
            parameters: { to: 10 },
          },
        ],
        stack.now(),
      ),
    ],
  });
  return { input, sourcePackage, final };
}

test("STUDIO-008 editor binding: the W7-B Editor Pawn instantiates through the REAL production surfaces", async () => {
  const stack = composeEditingStack();
  const binding = createEditorPawnBinding({ pawnExecution: stack.pawnExecution });
  const instance = binding.instantiateEditor(SCOPE);
  assert.equal(instance.bodyId, "pawn:editor", "the registered W7-B editor pawn body");
  assert.equal(instance.bodyVersion, 1);
  assert.equal(instance.lifecycle, "instantiated");
  // The deterministic editor pawn carries NO model selection (the optional
  // model fields are absent until a boundary binding — never requested here).
  assert.equal(instance.modelRef, undefined);
  assert.equal(instance.runtimeRef, undefined);
  const stored = stack.pawnExecution.getPawnInstance(SCOPE, instance.instanceId);
  assert.ok(stored, "a REAL agent instance exists in the registry");
  const released = binding.releaseEditor(SCOPE, instance.instanceId);
  assert.equal(released.lifecycle, "released", "release is terminal");
});

test("STUDIO-008 editor binding: engine invocations are REAL EngineJobs through the engines runner seam (§30)", async () => {
  const stack = composeEditingStack();
  const scenario = await bindingScenario(stack);
  const outcome = await stack.editing.runEditingSession(SCOPE, scenario.input);
  assert.ok(outcome.ok, `the session must succeed: ${JSON.stringify(outcome)}`);
  // The pawn executions recorded by production: one per operation + assembly.
  const executions = stack.pawnExecution.listPawnExecutions(SCOPE);
  assert.equal(executions.length, 2);
  for (const execution of executions) {
    assert.equal(execution.pawnKind, "editor");
    assert.equal(execution.modelBinding, null, "deterministic pawn: no model binding on any execution");
    assert.equal(execution.lifecycle, "succeeded");
    assert.equal(execution.transformKind, "remix");
    assert.deepEqual(execution.organization, { organizationId: "org:studio-editing", version: 1 });
    assert.equal(execution.engineInvocations.length, 1);
    assert.equal(execution.engineInvocations[0]?.engineId, "engine:timeline-renderer");
    assert.equal(execution.engineInvocations[0]?.capabilityId, "render_timeline");
  }
  // The final assembly execution cites all operation outputs as inputs.
  const assembly = executions[1];
  assert.equal(assembly?.inputArtifactRefs.length, 1);
  // §30 audit trail on the pawn execution records.
  const auditTypes = (assembly?.auditTrace ?? []).map((event) => event.type);
  assert.ok(auditTypes.includes("rights-evaluated"));
  assert.ok(auditTypes.includes("engine-job-submitted"));
  assert.ok(auditTypes.includes("engine-job-completed"));
  assert.ok(auditTypes.includes("execution-completed"));
});

test("STUDIO-008 editor binding: a typed engine failure passes through VERBATIM on a recorded failed session", async () => {
  const stack = composeEditingStack({
    engineFailure: { code: "render-window-out-of-range", message: "cut window [0,∞) exceeds source", retriable: false },
  });
  const scenario = await bindingScenario(stack);
  const outcome = await stack.editing.runEditingSession(SCOPE, scenario.input);
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "editor-pawn-composition-failed");
  if (outcome.failure.kind === "editor-pawn-composition-failed") {
    assert.equal(outcome.failure.operationId, "op-cut-1");
    assert.ok(outcome.failure.failure);
    assert.equal(outcome.failure.failure?.code, "engine-invocation-failed");
    assert.equal(outcome.failure.failure?.retriable, false);
  }
  // The failure CARRIES a §30 record — the composing started; failures are
  // auditable, and the ENGINE's typed failure code is quoted VERBATIM in the
  // engine-invocation summary.
  assert.ok(outcome.record);
  assert.equal(outcome.record?.lifecycle, "failed");
  assert.equal(outcome.record?.resultPackage, null);
  assert.equal(outcome.record?.editGraph, null);
  assert.equal(outcome.record?.engineInvocations.length, 1);
  assert.equal(outcome.record?.engineInvocations[0]?.lifecycle, "failed");
  assert.equal(outcome.record?.engineInvocations[0]?.failureCode, "render-window-out-of-range");
  assert.equal(
    outcome.record?.engineInvocations[0]?.failureMessage,
    "cut window [0,∞) exceeds source",
  );
  // The typed failure also lives on production's own pawn execution record.
  const execution = stack.pawnExecution.listPawnExecutions(SCOPE)[0];
  assert.equal(execution?.lifecycle, "failed");
  assert.equal(execution?.failure?.code, "engine-invocation-failed");
  // No package version was produced and the pawn instance is released.
  assert.equal(stack.editing.listEditingSessions(SCOPE).length, 1);
  const instanceId = outcome.record?.editorPawn.instanceId;
  assert.ok(instanceId);
  assert.equal(stack.pawnExecution.getPawnInstance(SCOPE, instanceId as never)?.lifecycle, "released");
});

test("STUDIO-008 editor binding: the rights gate PRECEDES engine invocation (denial is a recorded failure, no EngineJob)", async () => {
  const stack = composeEditingStack();
  const scenario = await bindingScenario(stack);
  // An actor with NO transform grants over the source artifacts.
  const outcome = await stack.editing.runEditingSession(SCOPE, {
    ...scenario.input,
    actor: { kind: "identity", principalId: "identity:unauthorized-editor" },
  });
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "editor-pawn-composition-failed");
  if (outcome.failure.kind === "editor-pawn-composition-failed") {
    assert.equal(outcome.failure.failure?.code, "rights-denied");
  }
  assert.ok(outcome.record, "the denial is a RECORDED production action");
  assert.equal(outcome.record?.engineInvocations.length, 0, "no EngineJob ran — the gate precedes");
  assert.equal(stack.jobEvents.events.length, 0);
  const execution = stack.pawnExecution.listPawnExecutions(SCOPE)[0];
  assert.equal(execution?.failure?.code, "rights-denied");
  assert.equal(execution?.rights.verdict, "denied");
  assert.ok(typeof execution?.rights.denialReason === "string");
});

test("STUDIO-008 editor binding: service actors cannot hold grants — fail closed at the gate", async () => {
  const stack = composeEditingStack();
  const scenario = await bindingScenario(stack);
  const outcome = await stack.editing.runEditingSession(SCOPE, {
    ...scenario.input,
    actor: { kind: "service", name: "studio-batch-service" },
  });
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "editor-pawn-composition-failed");
  if (outcome.failure.kind === "editor-pawn-composition-failed") {
    assert.equal(outcome.failure.failure?.code, "rights-denied");
  }
  assert.equal(outcome.record?.engineInvocations.length, 0);
});

test("STUDIO-008 editor binding: tenant scoping — sessions and instances are invisible across tenants", async () => {
  const stack = composeEditingStack();
  const scenario = await bindingScenario(stack);
  const outcome = await stack.editing.runEditingSession(SCOPE, scenario.input);
  assert.ok(outcome.ok);
  const foreignScope = { tenantId: "tenant:foreign" as typeof EDITING_STACK_TENANT };
  // §30 session records are tenant-scoped (no existence leaks).
  assert.equal(
    stack.editing.getEditingSession(foreignScope, outcome.result.editingSessionId),
    undefined,
  );
  assert.equal(stack.editing.listEditingSessions(foreignScope).length, 0);
  // The edit graph is tenant-scoped.
  assert.equal(
    stack.editing.getEditGraph(foreignScope, outcome.result.editGraph.graphId),
    undefined,
  );
  assert.equal(stack.editing.listEditGraphVersions(foreignScope, outcome.result.editGraph.graphId).length, 0);
  // Exports are tenant-scoped: a foreign tenant cannot export the graph.
  const foreignExport = stack.editing.exportEditGraph(foreignScope, outcome.result.editGraph.graphId);
  assert.ok(!foreignExport.ok);
  // The pawn instance is invisible cross-tenant.
  const instanceId = outcome.result.record.editorPawn.instanceId;
  assert.equal(stack.pawnExecution.getPawnInstance(foreignScope, instanceId as never), undefined);
  // And a foreign tenant cannot run a session over this tenant's package.
  const foreignAttempt = await stack.editing.runEditingSession(foreignScope, scenario.input);
  assert.ok(!foreignAttempt.ok);
  assert.equal(foreignAttempt.failure.kind, "cross-tenant-source");
});

test("STUDIO-008 editor binding: FINAL_ASSEMBLY_OPERATION_ID is distinct from the edit kinds", () => {
  assert.equal(FINAL_ASSEMBLY_OPERATION_ID, "final-assembly");
  assert.ok(!["cut", "trim", "reorder", "overlay", "caption", "dub-track", "scale"].includes(FINAL_ASSEMBLY_OPERATION_ID));
});
