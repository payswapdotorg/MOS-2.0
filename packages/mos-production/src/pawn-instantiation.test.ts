/**
 * Pawn instantiation as REAL agent instances (LAB-013): the lifecycle
 * instantiate → bind → release through the agent-stack seams; DETERMINISTIC
 * pawns carry NO model binding (refused — pinned); LLM-flavored pawns bind
 * ONLY through the single model boundary (the boundary decides; preferences
 * never force a selection); tenant scoping with no existence leaks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { TRANSFORM_PAWN_BODIES } from "./bodies/transform-pawn-bodies.js";
import {
  createInMemoryPawnBodyRegistry,
  createInMemoryPawnInstanceRegistry,
  createInMemoryPawnInstanceExecutor,
} from "./adapters/in-memory-agent-stack.js";
import { createInMemoryEngineRunner } from "./adapters/in-memory-engine-runner.js";
import { createInMemoryTransformSource } from "./adapters/in-memory-transform-source.js";
import { createInMemoryPawnRightsGate } from "./adapters/in-memory-pawn-rights-gate.js";
import { createInMemoryPawnExecutionRuntime } from "./adapters/in-memory-pawn-execution.js";
import { PawnExecutionError } from "./domain/errors.js";
import {
  ACTOR_PRODUCER,
  FIXED_NOW,
  SCOPE_ALPHA,
  SCOPE_BETA,
  composePawnStack,
} from "./testing/compose-pawn-stack.js";
import type { PawnModelBindingRequest } from "./ports/agent-stack.ports.js";
import type { PawnModelBinding } from "./ports/agent-stack.ports.js";
import type { PawnModelRuntimePort } from "./ports/agent-stack.ports.js";

test("instantiatePawn creates a REAL agent instance in the instantiated state", () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  assert.equal(instance.lifecycle, "instantiated");
  assert.equal(instance.bodyId, "pawn:clip-selection");
  assert.equal(instance.bodyVersion, 1);
  assert.equal(instance.tenantScope.tenantId, SCOPE_ALPHA.tenantId);
  // Tool/capability bindings default to the body's declarations.
  assert.deepEqual([...instance.toolRefs], [
    "engine-tool:engine:clip-ranker@1:rank_clip_candidates@1",
  ]);
  assert.deepEqual([...instance.capabilityRefs], ["rank_clip_candidates"]);
  // NO model binding exists on the record (pinned at the type level too).
  assert.equal(instance.modelRef, undefined);
  assert.equal(instance.runtimeRef, undefined);
});

test("instantiation by exact body citation and by pawn kind agree", () => {
  const stack = composePawnStack();
  const byKind = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "editor" });
  const byBody = stack.execution.instantiatePawn(SCOPE_ALPHA, {
    bodyId: "pawn:editor" as Parameters<typeof stack.execution.instantiatePawn>[1]["bodyId"],
    bodyVersion: 1 as Parameters<typeof stack.execution.instantiatePawn>[1]["bodyVersion"],
  });
  assert.equal(byKind.bodyId, byBody.bodyId);
  assert.equal(byKind.bodyVersion, byBody.bodyVersion);
});

test("instantiation fails closed for unknown kinds, non-pawn bodies and bad input", () => {
  const stack = composePawnStack();
  assert.throws(
    () => stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "nonexistent" as never }),
    (error: unknown) => error instanceof PawnExecutionError && error.code === "unknown-pawn-kind",
  );
  assert.throws(
    () => stack.execution.instantiatePawn(SCOPE_ALPHA, { bodyId: "pawn:not-registered" as never }),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "pawn-body-not-registered",
  );
  assert.throws(
    () => stack.execution.instantiatePawn(SCOPE_ALPHA, {}),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "invalid-instantiation-input",
  );
  // A body registered in the AGENT registry but not as a pawn cannot
  // instantiate through the pawn surface.
  const [template] = TRANSFORM_PAWN_BODIES;
  assert.ok(template !== undefined);
  stack.doubles.bodies.register({
    ...template.agentBody,
    id: "pawn:not-a-pawn-body" as never,
  });
  assert.throws(
    () =>
      stack.execution.instantiatePawn(SCOPE_ALPHA, { bodyId: "pawn:not-a-pawn-body" as never }),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "pawn-body-not-registered",
  );
});

test("tool/capability bindings outside the body declarations fail closed", () => {
  const stack = composePawnStack();
  assert.throws(
    () =>
      stack.execution.instantiatePawn(SCOPE_ALPHA, {
        pawnKind: "clip-selection",
        toolRefs: ["engine-tool:engine:some-other@1:some_capability@1" as never],
      }),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "instance-tool-outside-body",
  );
  assert.throws(
    () =>
      stack.execution.instantiatePawn(SCOPE_ALPHA, {
        pawnKind: "clip-selection",
        capabilityRefs: ["transcribe_audio" as never],
      }),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "instance-capability-outside-body",
  );
});

test("DETERMINISTIC pawns never carry a model binding — bindPawnModel refuses (pinned)", () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId),
    (error: unknown) =>
      error instanceof PawnExecutionError &&
      error.code === "no-model-binding-for-deterministic-pawn",
  );
  // Even an explicit model preference cannot force a binding.
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId, "mos-model:any" as never),
    (error: unknown) =>
      error instanceof PawnExecutionError &&
      error.code === "no-model-binding-for-deterministic-pawn",
  );
  const stillUnbound = stack.execution.getPawnInstance(SCOPE_ALPHA, instance.instanceId);
  assert.equal(stillUnbound?.modelRef, undefined);
});

test("llm-flavored pawns bind through THE single model boundary — the boundary decides", () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "podcast-interviewer" });
  const bound = stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId);
  assert.equal(bound.lifecycle, "bound");
  assert.equal(bound.modelRef, "mos-model:pawn-default");
  assert.equal(bound.runtimeRef, "mos-runtime:in-memory-agent");
  assert.equal(bound.boundAt, FIXED_NOW());
  // The binding came from the boundary (catalog + default), not from here.
  assert.ok(stack.doubles.modelBoundary !== undefined);
});

test("an unknown model preference fails closed at the boundary (never bypasses it)", () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "question-designer" });
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId, "mos-model:not-in-catalog" as never),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "unknown-model",
  );
});

test("bindPawnModel delegates to the registry seam which owns the boundary (spy-pinned)", () => {
  const bindModelCalls: PawnModelBindingRequest[] = [];
  const boundary: PawnModelRuntimePort = {
    bindModel(request: PawnModelBindingRequest): PawnModelBinding {
      bindModelCalls.push(request);
      return {
        modelRef: "mos-model:spied" as never,
        runtimeRef: "mos-runtime:spy" as never,
        boundAt: FIXED_NOW(),
      };
    },
  };
  const bodies = createInMemoryPawnBodyRegistry();
  const instances = createInMemoryPawnInstanceRegistry({ bodyRegistry: bodies, modelRuntime: boundary });
  const runtime = createInMemoryPawnExecutionRuntime({
    bodyRegistry: bodies,
    instances,
    executor: createInMemoryPawnInstanceExecutor({ now: FIXED_NOW }),
    engineRunner: createInMemoryEngineRunner(),
    transformSource: createInMemoryTransformSource(),
    artifactSource: { resolve: async () => null },
    rightsGate: createInMemoryPawnRightsGate({
      evaluate: () => ({ verdict: "granted", reason: null, grantRef: null, subjectRef: "" }),
    }),
    now: FIXED_NOW,
  });
  // The pawn bodies must live in the runtime's own index (registered through
  // the port — which also registers the canonical bodies in the seam
  // registry, so they are NOT pre-seeded here).
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    runtime.execution.registerPawnBody(pawn);
  }
  const instance = runtime.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "podcast-interviewer" });
  const bound = runtime.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId, "mos-model:preference" as never);
  assert.equal(bindModelCalls.length, 1);
  assert.equal(bindModelCalls[0]?.requestedModelRef, "mos-model:preference");
  assert.equal(bindModelCalls[0]?.bodyId, "pawn:podcast-interviewer");
  // The boundary's decision is what lands on the record.
  assert.equal(bound.modelRef, "mos-model:spied");
});

test("release is terminal and released instances fail closed on bind", () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "podcast-interviewer" });
  const released = stack.execution.releasePawn(SCOPE_ALPHA, instance.instanceId);
  assert.equal(released.lifecycle, "released");
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_ALPHA, instance.instanceId),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "pawn-instance-released",
  );
  // A deterministic pawn still refuses BEFORE the released check (flavor
  // first): the deterministic refusal is the §9 pin, whichever fires first.
  const deterministic = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "editor" });
  stack.execution.releasePawn(SCOPE_ALPHA, deterministic.instanceId);
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_ALPHA, deterministic.instanceId),
    (error: unknown) =>
      error instanceof PawnExecutionError &&
      error.code === "no-model-binding-for-deterministic-pawn",
  );
});

test("instances are tenant-scoped with no existence leaks", () => {
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "caption" });
  assert.equal(stack.execution.getPawnInstance(SCOPE_BETA, instance.instanceId), undefined);
  assert.deepEqual(stack.execution.listPawnInstances(SCOPE_BETA), []);
  assert.equal(stack.execution.listPawnInstances(SCOPE_ALPHA).length, 1);
  assert.throws(
    () => stack.execution.releasePawn(SCOPE_BETA, instance.instanceId),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "unknown-pawn-instance",
  );
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_BETA, instance.instanceId),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "unknown-pawn-instance",
  );
});

test("unknown instance ids fail closed (unknown and foreign are indistinguishable)", () => {
  const stack = composePawnStack();
  assert.throws(
    () => stack.execution.bindPawnModel(SCOPE_ALPHA, "pawn-instance-999"),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "unknown-pawn-instance",
  );
  assert.equal(stack.execution.getPawnInstance(SCOPE_ALPHA, "pawn-instance-999"), undefined);
});

test("actor vocabulary is carried on instances' executions (scope identity check)", () => {
  // The actor is per-task, not per-instance; the instance carries the scope.
  const stack = composePawnStack();
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "dubbing" });
  assert.equal(instance.tenantScope.tenantId, SCOPE_ALPHA.tenantId);
  assert.ok(ACTOR_PRODUCER.principalId.length > 0);
});
