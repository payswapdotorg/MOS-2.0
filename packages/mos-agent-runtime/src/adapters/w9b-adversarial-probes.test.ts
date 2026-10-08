/**
 * W9-B adversarial regression probes (production/engine/security sweep).
 *
 * These are ATTACK probes, not feature tests: every case shapes the input
 * the way a hostile caller or a future bug would and asserts the authority
 * holds. Each probe documents the surface it pins:
 *
 *  - tenantScope ownership: the stored record must own a PRIVATE copy of
 *    the caller's scope (mutating the caller's object after instantiate/
 *    bind/release must never change the stored record's tenant identity —
 *    that was a real cross-tenant identity-corruption defect this sweep
 *    found and fixed; the probe is the pinning test);
 *  - hostile id factories: delimiter-laden tenant ids must not alias
 *    records across tenants (§31);
 *  - record bit-for-bit immutability across the lifecycle.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AgentBody, ModelRef, RuntimeRef, TenantScope, Version } from "@mos/contracts";
import { createInMemoryAgentBodyRegistry } from "@mos/agents";

import { createInMemoryModelRuntime } from "./in-memory-model-runtime.js";
import { createInMemoryAgentInstanceRegistry } from "./in-memory-agent-instance-registry.js";

const version = (value: number) => value as Version;
const tenantScope = (value: string): TenantScope => ({
  tenantId: value as TenantScope["tenantId"],
});

const body = {
  id: "probe-pawn-body",
  version: version(1),
  roleContract: { summary: "Probe body.", duties: ["Hold still"] },
  inputContract: { type: "object", properties: {} },
  outputContract: { type: "object", properties: {} },
  tools: ["tool:probe"],
  permissions: ["permission:probe"],
  memory: { scope: "none" },
  communication: { mayInitiate: false, allowedTopics: [] },
  actionInterface: { actions: ["probe"] },
  capabilities: ["probe_capability"],
  budget: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 1_000 },
  latency: { p50Ms: 1, p95Ms: 2, p99Ms: 3 },
  evaluator: "evaluator:probe",
  safety: { prohibitions: ["rights-circumvention"] },
} as unknown as AgentBody;

function makeRegistry() {
  const bodyRegistry = createInMemoryAgentBodyRegistry({ initial: [body] });
  const modelRuntime = createInMemoryModelRuntime({
    models: [
      {
        modelRef: "model:probe" as ModelRef,
        runtimeRef: "runtime:probe" as RuntimeRef,
      },
    ],
    defaultModelRef: "model:probe" as ModelRef,
  });
  return createInMemoryAgentInstanceRegistry({ bodyRegistry, modelRuntime });
}

test("W9-B probe: mutating the caller's scope object after instantiate cannot move the stored record to another tenant", () => {
  const registry = makeRegistry();
  const hostileScope = tenantScope("tenant-a");
  const record = registry.instantiate(hostileScope, {
    bodyId: body.id,
    bodyVersion: version(1),
  });

  // The attack: rewrite the caller-owned scope after the authority took it.
  (hostileScope as { tenantId?: string }).tenantId = "tenant-b";

  // The stored record still belongs to tenant-a...
  assert.equal(record.tenantScope.tenantId, "tenant-a");
  // ...tenant-a still resolves it...
  const asA = registry.get(tenantScope("tenant-a"), record.instanceId);
  assert.ok(asA !== undefined, "tenant-a must still resolve the instance");
  // ...and tenant-b — the forged identity — must NOT.
  const asB = registry.get(tenantScope("tenant-b"), record.instanceId);
  assert.equal(asB, undefined, "the forged tenant must not resolve the instance");
});

test("W9-B probe: the stored record's scope is not the caller's object (private ownership)", () => {
  const registry = makeRegistry();
  const scope = tenantScope("tenant-a");
  const record = registry.instantiate(scope, {
    bodyId: body.id,
    bodyVersion: version(1),
  });
  assert.notEqual(record.tenantScope, scope, "the record must own a copy, not the caller's object");
  assert.ok(Object.isFrozen(record.tenantScope), "the record's scope copy must be frozen");
});

test("W9-B probe: bind and release inherit the ownership discipline (no scope bleed through later transitions)", () => {
  const registry = makeRegistry();
  const scope = tenantScope("tenant-a");
  const instantiated = registry.instantiate(scope, {
    bodyId: body.id,
    bodyVersion: version(1),
  });
  const bound = registry.bind(scope, instantiated.instanceId);
  const released = registry.release(scope, instantiated.instanceId);

  (scope as { tenantId?: string }).tenantId = "tenant-b";

  for (const record of [instantiated, bound, released]) {
    assert.equal(record.tenantScope.tenantId, "tenant-a");
  }
  // The CURRENT stored record (released) is still tenant-a's.
  assert.notEqual(
    registry.get(tenantScope("tenant-b"), instantiated.instanceId),
    released,
    "the forged tenant must not adopt the released record",
  );
});

test("W9-B probe: hostile delimiter-laden tenant ids never alias records across tenants", () => {
  const registry = makeRegistry();
  const trapTenant = tenantScope("tenant-a"); // collides with "tenant-a::x" style ids
  const hostileTenant = tenantScope("tenant-a:suffix");
  const trap = registry.instantiate(trapTenant, {
    bodyId: body.id,
    bodyVersion: version(1),
  });
  const hostile = registry.instantiate(hostileTenant, {
    bodyId: body.id,
    bodyVersion: version(1),
  });
  assert.notEqual(trap.instanceId, hostile.instanceId);
  assert.ok(registry.get(trapTenant, trap.instanceId) !== undefined);
  assert.ok(registry.get(hostileTenant, hostile.instanceId) !== undefined);
  // Reading the hostile instance from the trap tenant must fail closed.
  assert.equal(registry.get(trapTenant, hostile.instanceId), undefined);
  assert.equal(registry.get(hostileTenant, trap.instanceId), undefined);
});

test("W9-B probe: lifecycle records are bit-for-bit immutable after later transitions", () => {
  const registry = makeRegistry();
  const scope = tenantScope("tenant-a");
  const instantiated = registry.instantiate(scope, {
    bodyId: body.id,
    bodyVersion: version(1),
  });
  const snapshot = JSON.stringify(instantiated);
  registry.bind(scope, instantiated.instanceId);
  registry.release(scope, instantiated.instanceId);
  assert.equal(JSON.stringify(instantiated), snapshot);
  assert.ok(Object.isFrozen(instantiated));
});
