/**
 * Agent instance lifecycle + model boundary tests (AGT-002).
 *
 * Covers: instantiate → bind → release lifecycle with frozen records,
 * fail-closed unknowns and cross-tenant denial; model interchangeability
 * (same body, two modelRefs, both bind via the port and execute);
 * port-authority (caller preferences cannot bypass the model catalog);
 * AgentInstance frozen-contract shape of bound records (pinned against
 * @mos/contracts); body subset validation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTRACT_REQUIRED_FIELDS } from "@mos/contracts";
import type {
  AgentBody,
  CapabilityId,
  ModelRef,
  TenantScope,
  Timestamp,
  ToolRef,
  Version,
} from "@mos/contracts";
import { createInMemoryAgentBodyRegistry } from "@mos/agents";

import { AgentRuntimeError } from "../domain/errors.js";
import { createInMemoryModelRuntime } from "./in-memory-model-runtime.js";
import { createInMemoryAgentInstanceRegistry } from "./in-memory-agent-instance-registry.js";
import type { CatalogModel } from "./in-memory-model-runtime.js";

const bodyId = (value: string) => value as AgentBody["id"];
const version = (value: number) => value as Version;
const modelRef = (value: string) => value as ModelRef;
const runtimeRef = (value: string) => value as CatalogModel["runtimeRef"];
const toolRef = (value: string) => value as ToolRef;
const capabilityId = (value: string) => value as CapabilityId;
const tenantScope = (value: string): TenantScope => ({ tenantId: value as TenantScope["tenantId"] });
const timestamp = (value: string) => value as Timestamp;

const TENANT_A = tenantScope("tenant-a");
const TENANT_B = tenantScope("tenant-b");

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
  capabilities: ["rank_clip_candidates", "evaluate_content"],
  budget: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 60_000 },
  latency: { p50Ms: 100, p95Ms: 200, p99Ms: 300 },
  evaluator: "evaluator:clip-selection-quality",
  safety: { prohibitions: ["fake-engagement"] },
} as unknown as AgentBody;

const bodyRegistry = createInMemoryAgentBodyRegistry({ initial: [body] });

const CLOCK_VALUES = ["2025-01-01T00:00:01.000Z", "2025-01-01T00:00:02.000Z"] as const;
let clockIndex = 0;
const modelRuntime = createInMemoryModelRuntime({
  models: [
    { modelRef: modelRef("model:small-fast"), runtimeRef: runtimeRef("runtime:local") },
    { modelRef: modelRef("model:large-deep"), runtimeRef: runtimeRef("runtime:remote") },
  ],
  defaultModelRef: modelRef("model:small-fast"),
  now: () =>
    timestamp(CLOCK_VALUES[Math.min(clockIndex, CLOCK_VALUES.length - 1)] ?? CLOCK_VALUES[0]),
});

function makeRegistry() {
  return createInMemoryAgentInstanceRegistry({ bodyRegistry, modelRuntime });
}

test("instantiate creates an unbound instance defaulting to the body's tools and capabilities", () => {
  const registry = makeRegistry();
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  assert.equal(record.lifecycle, "instantiated");
  assert.equal(record.instanceId, "agent-instance-1");
  assert.equal(record.modelRef, undefined);
  assert.equal(record.runtimeRef, undefined);
  assert.deepEqual(record.toolRefs, ["tool:clip-inspector", "tool:timeline-reader"]);
  assert.deepEqual(record.capabilityRefs, ["rank_clip_candidates", "evaluate_content"]);
  assert.ok(Object.isFrozen(record));
});

test("bind routes through the model boundary and records the port-issued binding", () => {
  const registry = makeRegistry();
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  const bound = registry.bind(TENANT_A, record.instanceId, modelRef("model:large-deep"));
  assert.equal(bound.lifecycle, "bound");
  assert.equal(bound.modelRef, modelRef("model:large-deep"));
  assert.equal(bound.runtimeRef, runtimeRef("runtime:remote"));
  assert.equal(bound.boundAt, timestamp(CLOCK_VALUES[0] ?? ""));
  assert.ok(Object.isFrozen(bound));
});

test("bound instance records carry every AgentInstance required contract field", () => {
  const registry = makeRegistry();
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  const bound = registry.bind(TENANT_A, record.instanceId);
  for (const field of CONTRACT_REQUIRED_FIELDS.AgentInstance) {
    assert.ok(
      (bound as unknown as Record<string, unknown>)[field] !== undefined,
      `bound instance must carry required AgentInstance field '${field}'`,
    );
  }
});

test("model interchangeability: the same body binds two models through the port", () => {
  const registry = makeRegistry();
  const first = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  const second = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  const firstBound = registry.bind(TENANT_A, first.instanceId, modelRef("model:small-fast"));
  const secondBound = registry.bind(TENANT_A, second.instanceId, modelRef("model:large-deep"));
  assert.equal(firstBound.modelRef, modelRef("model:small-fast"));
  assert.equal(secondBound.modelRef, modelRef("model:large-deep"));
  assert.notEqual(firstBound.modelRef, secondBound.modelRef);
  // Re-binding swaps the model on the same instance — still via the port.
  const reBound = registry.bind(TENANT_A, first.instanceId, modelRef("model:large-deep"));
  assert.equal(reBound.modelRef, modelRef("model:large-deep"));
  assert.equal(reBound.runtimeRef, runtimeRef("runtime:remote"));
});

test("caller preferences cannot bypass the model boundary catalog", () => {
  const registry = makeRegistry();
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  assert.throws(
    () => registry.bind(TENANT_A, record.instanceId, modelRef("model:not-in-catalog")),
    (error: unknown) =>
      error instanceof AgentRuntimeError &&
      error.code === "unknown-model" &&
      error.message.includes("model:not-in-catalog"),
  );
});

test("without a request and default the boundary refuses to invent a selection", () => {
  const runtime = createInMemoryModelRuntime({
    models: [{ modelRef: modelRef("model:only"), runtimeRef: runtimeRef("runtime:local") }],
  });
  const registry = createInMemoryAgentInstanceRegistry({ bodyRegistry, modelRuntime: runtime });
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  assert.throws(
    () => registry.bind(TENANT_A, record.instanceId),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "no-model-requested",
  );
});

test("release is terminal and retains the last binding", () => {
  const registry = makeRegistry();
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  const bound = registry.bind(TENANT_A, record.instanceId);
  const released = registry.release(TENANT_A, record.instanceId);
  assert.equal(released.lifecycle, "released");
  assert.equal(released.modelRef, bound.modelRef);
  assert.throws(
    () => registry.bind(TENANT_A, record.instanceId),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "instance-released",
  );
});

test("instantiation validates bodies, tool subsets and capability subsets fail-closed", () => {
  const registry = makeRegistry();
  assert.throws(
    () => registry.instantiate(TENANT_A, { bodyId: bodyId("ghost"), bodyVersion: version(1) }),
    (error: unknown) => /Unknown agent body/.test(error instanceof Error ? error.message : ""),
  );
  assert.throws(
    () =>
      registry.instantiate(TENANT_A, {
        bodyId: bodyId("clip-selection-pawn"),
        bodyVersion: version(9),
      }),
    (error: unknown) => /version 9/.test(error instanceof Error ? error.message : ""),
  );
  assert.throws(
    () =>
      registry.instantiate(TENANT_A, {
        bodyId: bodyId("clip-selection-pawn"),
        bodyVersion: version(1),
        toolRefs: [toolRef("tool:not-declared")],
      }),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "instance-tool-outside-body",
  );
  assert.throws(
    () =>
      registry.instantiate(TENANT_A, {
        bodyId: bodyId("clip-selection-pawn"),
        bodyVersion: version(1),
        capabilityRefs: [capabilityId("no_such_capability")],
      }),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "instance-capability-outside-body",
  );
  const narrowed = registry.instantiate(TENANT_A, {
    bodyId: bodyId("clip-selection-pawn"),
    bodyVersion: version(1),
    toolRefs: [toolRef("tool:clip-inspector")],
    capabilityRefs: [capabilityId("rank_clip_candidates")],
  });
  assert.deepEqual(narrowed.toolRefs, [toolRef("tool:clip-inspector")]);
  assert.deepEqual(narrowed.capabilityRefs, [capabilityId("rank_clip_candidates")]);
});

test("unknown and cross-tenant instances fail closed without existence leaks", () => {
  const registry = makeRegistry();
  const record = registry.instantiate(TENANT_A, { bodyId: bodyId("clip-selection-pawn"), bodyVersion: version(1) });
  assert.equal(registry.get(TENANT_B, record.instanceId), undefined);
  assert.deepEqual(registry.list(TENANT_B), []);
  assert.throws(
    () => registry.bind(TENANT_B, record.instanceId),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "unknown-agent-instance",
  );
  assert.throws(
    () => registry.release(TENANT_B, record.instanceId),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "unknown-agent-instance",
  );
  assert.equal(registry.get(TENANT_A, record.instanceId), record);
  assert.equal(registry.list(TENANT_A).length, 1);
});

test("model catalog construction fails closed on malformed catalogs", () => {
  assert.throws(
    () =>
      createInMemoryModelRuntime({
        models: [
          { modelRef: modelRef("model:a"), runtimeRef: runtimeRef("runtime:local") },
          { modelRef: modelRef("model:a"), runtimeRef: runtimeRef("runtime:local") },
        ],
      }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "invalid-model-catalog",
  );
  assert.throws(
    () =>
      createInMemoryModelRuntime({
        models: [{ modelRef: modelRef("model:a"), runtimeRef: runtimeRef("runtime:local") }],
        runtimes: [runtimeRef("runtime:other")],
      }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "invalid-model-catalog",
  );
  assert.throws(
    () =>
      createInMemoryModelRuntime({
        models: [{ modelRef: modelRef("model:a"), runtimeRef: runtimeRef("runtime:local") }],
        defaultModelRef: modelRef("model:missing"),
      }),
    (error: unknown) => error instanceof AgentRuntimeError && error.code === "invalid-model-catalog",
  );
});
