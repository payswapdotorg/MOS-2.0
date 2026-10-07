/**
 * Substrate InstanceExecutor tests (AGT-002).
 *
 * Executor round-trips over the DISCLOSED in-memory substrate double: the
 * port-issued model flows into the substrate spec (pass-through proof),
 * interchangeable models execute the same body, unbound/released instances
 * and malformed input fail closed, and substrate failures surface as typed
 * `substrate-execution-failed` errors (with best-effort stop so a started
 * runtime is not leaked).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AgentBody, ModelRef, TenantScope, Timestamp, Version } from "@mos/contracts";
import { createInMemoryAgentBodyRegistry } from "@mos/agents";

import { AgentRuntimeError } from "../domain/errors.js";
import { createInMemoryModelRuntime } from "./in-memory-model-runtime.js";
import { createInMemoryAgentInstanceRegistry } from "./in-memory-agent-instance-registry.js";
import { agentBodyRef, createSubstrateInstanceExecutor } from "./substrate-instance-executor.js";
import { createInMemoryAgentRuntimeSubstrateDouble } from "../test-doubles/in-memory-agent-runtime-double.js";
import type { AgentInstanceRecord } from "../domain/agent-instance.js";
import type { CatalogModel } from "./in-memory-model-runtime.js";
import type { SubstrateAgentRuntimeSpec } from "../types/substrate-agent-runtime.js";

const bodyId = (value: string) => value as AgentBody["id"];
const version = (value: number) => value as Version;
const modelRef = (value: string) => value as ModelRef;
const runtimeRef = (value: string) => value as CatalogModel["runtimeRef"];
const tenantScope = (value: string): TenantScope => ({ tenantId: value as TenantScope["tenantId"] });

const TENANT_A = tenantScope("tenant-a");

const body = {
  id: bodyId("clip-selection-pawn"),
  version: version(1),
  roleContract: { summary: "Ranks clips.", duties: ["Rank candidate clips"] },
  inputContract: { type: "object", properties: { candidates: { type: "array" } } },
  outputContract: { type: "object", properties: { ranked: { type: "array" } } },
  tools: ["tool:clip-inspector", "tool:timeline-reader"],
  permissions: ["permission:read-artifacts"],
  memory: { scope: "session" },
  communication: { mayInitiate: false, allowedTopics: ["clip-candidates"] },
  actionInterface: { actions: ["emit-ranked-clips"] },
  capabilities: ["rank_clip_candidates"],
  budget: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 60_000 },
  latency: { p50Ms: 100, p95Ms: 200, p99Ms: 300 },
  evaluator: "evaluator:clip-selection-quality",
  safety: { prohibitions: ["fake-engagement"] },
} as unknown as AgentBody;

const bodyRegistry = createInMemoryAgentBodyRegistry({ initial: [body] });

const modelRuntime = createInMemoryModelRuntime({
  models: [
    { modelRef: modelRef("model:small-fast"), runtimeRef: runtimeRef("runtime:local") },
    { modelRef: modelRef("model:large-deep"), runtimeRef: runtimeRef("runtime:remote") },
  ],
  now: () => "2025-01-01T00:00:01.000Z" as Timestamp,
});

function makeHarness() {
  const substrate = createInMemoryAgentRuntimeSubstrateDouble();
  const instances = createInMemoryAgentInstanceRegistry({ bodyRegistry, modelRuntime });
  const executor = createSubstrateInstanceExecutor(substrate.port);
  return { substrate, instances, executor };
}

function boundInstance(
  instances: ReturnType<typeof createInMemoryAgentInstanceRegistry>,
  requestedModel: ModelRef,
): AgentInstanceRecord {
  const record = instances.instantiate(TENANT_A, {
    bodyId: bodyId("clip-selection-pawn"),
    bodyVersion: version(1),
  });
  return instances.bind(TENANT_A, record.instanceId, requestedModel);
}

test("a bound instance executes through the substrate double and is stopped afterwards", async () => {
  const { substrate, instances, executor } = makeHarness();
  const instance = boundInstance(instances, modelRef("model:small-fast"));

  const outcome = await executor.execute(instance, "rank these clips");
  assert.equal(outcome.instanceId, instance.instanceId);
  assert.equal(outcome.output, "echo:rank these clips");
  assert.equal(outcome.finishReason, "completed");
  assert.equal(outcome.events.length, 3);
  assert.equal(outcome.events[0]?.type, "execution.started");
  assert.equal(outcome.events[2]?.type, "execution.completed");
  assert.equal(outcome.usage.steps, 1);
  assert.equal(outcome.usage.outputTokens, outcome.output.length);

  // The port-issued model reference flowed into the substrate spec — the
  // executor never selects a model, it passes the binding through.
  assert.equal(substrate.startedSpecs.length, 1);
  assert.equal(substrate.startedSpecs[0]?.agentBodyRef, "clip-selection-pawn@1");
  assert.equal(substrate.startedSpecs[0]?.modelRef, modelRef("model:small-fast"));
  assert.deepEqual(substrate.startedSpecs[0]?.toolRefs, instance.toolRefs);
  assert.equal(substrate.runtimes.length, 1);
  assert.ok(substrate.runtimes[0]?.stopped, "the executor must stop the runtime after execution");
});

test("structured JSON input round-trips through the double", async () => {
  const { instances, executor } = makeHarness();
  const instance = boundInstance(instances, modelRef("model:large-deep"));
  const outcome = await executor.execute(instance, { candidates: ["a", "b"] });
  assert.equal(outcome.output, 'json:{"candidates":["a","b"]}');
});

test("model interchangeability end-to-end: the same body executes under two models", async () => {
  const { substrate, instances, executor } = makeHarness();
  const small = boundInstance(instances, modelRef("model:small-fast"));
  const large = boundInstance(instances, modelRef("model:large-deep"));

  const first = await executor.execute(small, "rank these clips");
  const second = await executor.execute(large, "rank these clips");
  assert.equal(first.output, "echo:rank these clips");
  assert.equal(second.output, "echo:rank these clips");

  assert.equal(substrate.startedSpecs.length, 2);
  assert.equal(substrate.startedSpecs[0]?.agentBodyRef, "clip-selection-pawn@1");
  assert.equal(substrate.startedSpecs[1]?.agentBodyRef, "clip-selection-pawn@1");
  assert.equal(substrate.startedSpecs[0]?.modelRef, modelRef("model:small-fast"));
  assert.equal(substrate.startedSpecs[1]?.modelRef, modelRef("model:large-deep"));
});

test("unbound and released instances fail closed before any substrate call", async () => {
  const { substrate, instances, executor } = makeHarness();
  const record = instances.instantiate(TENANT_A, {
    bodyId: bodyId("clip-selection-pawn"),
    bodyVersion: version(1),
  });
  await assert.rejects(
    () => executor.execute(record, "input"),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "instance-not-bound",
  );
  instances.bind(TENANT_A, record.instanceId, modelRef("model:small-fast"));
  const released = instances.release(TENANT_A, record.instanceId);
  assert.equal(released.lifecycle, "released");
  assert.notEqual(released.modelRef, undefined);
  await assert.rejects(
    () => executor.execute(released, "input"),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "instance-not-bound",
  );
  assert.equal(substrate.startedSpecs.length, 0, "no runtime may be started for a non-bound instance");
});

test("malformed execution input fails closed", async () => {
  const { instances, executor } = makeHarness();
  const instance = boundInstance(instances, modelRef("model:small-fast"));
  await assert.rejects(
    () => executor.execute(instance, null as unknown as Parameters<typeof executor.execute>[1]),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "invalid-execution-input",
  );
});

test("substrate failures surface typed (phase-named) and the runtime is still stopped", async () => {
  const stopped: string[] = [];
  const failingPort = {
    async start(spec: SubstrateAgentRuntimeSpec) {
      return { runtimeId: "rt-1", spec };
    },
    async execute() {
      throw new Error("substrate exploded");
    },
    async stop(runtimeId: string) {
      stopped.push(runtimeId);
      return { runtimeId, stopped: true };
    },
  };
  const executor = createSubstrateInstanceExecutor(failingPort);
  const instance = boundInstance(
    createInMemoryAgentInstanceRegistry({ bodyRegistry, modelRuntime }),
    modelRef("model:small-fast"),
  );
  await assert.rejects(
    () => executor.execute(instance, "input"),
    (error: unknown) =>
      error instanceof AgentRuntimeError &&
      error.code === "substrate-execution-failed" &&
      error.message.includes("substrate execute failed") &&
      error.message.includes("substrate exploded"),
  );
  assert.deepEqual(stopped, ["rt-1"], "best-effort stop must run after an execute failure");
});

test("agentBodyRef formats the versioned body reference", () => {
  const instance = boundInstance(
    createInMemoryAgentInstanceRegistry({ bodyRegistry, modelRuntime }),
    modelRef("model:small-fast"),
  );
  assert.equal(agentBodyRef(instance), "clip-selection-pawn@1");
});
