/**
 * W9-B adversarial regression probes (production/engine/security sweep) —
 * the @mos/capabilities registry.
 *
 * Attack probes, shaped the way a hostile caller or a future bug would:
 *
 *  - nested-mutation corruption (the W5-A/W6-A/W8-A defect class): the
 *    caller mutating its OWN capability declaration (the schemas, the cost
 *    model, the latency model) AFTER registration must never rewrite the
 *    STORED record — the registry's shallow `Object.freeze({...capability})`
 *    was a REAL defect this sweep found and fixed (clone-then-deep-freeze);
 *    this file is the pinning test;
 *  - freeze-in-place side effects: the caller's declaration objects are
 *    never frozen by the authority;
 *  - version history stays bit-for-bit across later registrations.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Capability, CapabilityId, Version } from "@mos/contracts";

import { createInMemoryCapabilityRegistry } from "./in-memory-capability-registry.js";

const capabilityId = (value: string) => value as CapabilityId;
const version = (value: number) => value as Version;

function makeCapability(id: string, recordVersion: number): Capability {
  return {
    id: capabilityId(id),
    version: version(recordVersion),
    inputSchema: { type: "object", properties: { candidates: { type: "array" } } },
    outputSchema: { type: "object", properties: { ranked: { type: "array" } } },
    evaluator: `evaluator:${id}@1` as Capability["evaluator"],
    costModel: { basis: "per-invocation", amount: 0.01, currency: "USD" },
    latencyModel: { p50Ms: 100, p95Ms: 200, p99Ms: 400 },
    provenance: `provenance:capability:${id}@1` as Capability["provenance"],
  };
}

test("W9-B probe: mutating the caller's capability declaration after registration cannot change the stored record", () => {
  const registry = createInMemoryCapabilityRegistry();
  const capability = makeCapability("w9b-probe-capability", 1);
  registry.register(capability);
  const snapshot = JSON.stringify(registry.get(capabilityId("w9b-probe-capability"), version(1)));

  // The attack: rewrite the contract surface the pre-fix record aliased.
  (capability.inputSchema as { type?: string }).type = "never";
  (capability.inputSchema as { properties?: Record<string, unknown> }).properties = {};
  (capability.costModel as { amount?: number }).amount = Number.NaN;
  (capability.latencyModel as { p99Ms?: number }).p99Ms = Number.POSITIVE_INFINITY;

  assert.equal(
    JSON.stringify(registry.get(capabilityId("w9b-probe-capability"), version(1))),
    snapshot,
    "the stored capability must be bit-for-bit unchanged",
  );
  const stored = registry.get(capabilityId("w9b-probe-capability"), version(1));
  assert.ok(stored !== undefined);
  assert.equal((stored.inputSchema as { type?: string }).type, "object");
  assert.equal((stored.costModel as { amount?: number }).amount, 0.01);
});

test("W9-B probe: the stored capability is a private deep-frozen copy, not the caller's object", () => {
  const registry = createInMemoryCapabilityRegistry();
  const capability = makeCapability("w9b-probe-alias", 1);
  registry.register(capability);
  const stored = registry.get(capabilityId("w9b-probe-alias"), version(1));
  assert.ok(stored !== undefined);
  assert.notEqual(stored, capability);
  assert.notEqual(stored.inputSchema, capability.inputSchema);
  assert.notEqual(stored.costModel, capability.costModel);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.inputSchema));
  assert.ok(Object.isFrozen(stored.costModel));
  assert.ok(Object.isFrozen(stored.latencyModel));
  // Ownership: the caller's declaration is NOT frozen in place.
  assert.ok(!Object.isFrozen(capability));
  assert.ok(!Object.isFrozen(capability.inputSchema));
  assert.ok(!Object.isFrozen(capability.costModel));
});

test("W9-B probe: prior capability versions stay bit-for-bit after later versions register", () => {
  const registry = createInMemoryCapabilityRegistry();
  registry.register(makeCapability("w9b-probe-chain", 1));
  const v1 = registry.get(capabilityId("w9b-probe-chain"), version(1));
  const snapshot = JSON.stringify(v1);

  const v2 = makeCapability("w9b-probe-chain", 2);
  (v2.inputSchema as { type?: string }).type = "array";
  registry.register(v2);

  assert.equal(
    JSON.stringify(registry.get(capabilityId("w9b-probe-chain"), version(1))),
    snapshot,
  );
  assert.deepEqual(registry.listVersions(capabilityId("w9b-probe-chain")), [
    version(1),
    version(2),
  ]);
});
