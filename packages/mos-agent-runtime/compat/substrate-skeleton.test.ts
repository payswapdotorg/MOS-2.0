/**
 * Substrate skeleton integration test (AGT-002) — RUNTIME half of the
 * compatibility pin.
 *
 * Runs the REAL `@mos/substrate-adapters` package (loaded through Node's
 * native type stripping — its `exports` map points at `./src/index.ts`) plus
 * the BUILT executor from `../dist/index.js`:
 *
 * 1. the disclosed W0-B `UnboundAgentRuntimeAdapter` skeleton fails closed
 *    on construction (and on prototype bypass) with
 *    `SubstrateAdapterNotBoundError` naming the AGT-002 binding work item —
 *    never silently pretending to work;
 * 2. the real `SubstrateAdapterNotBoundError` class thrown from a substrate
 *    port surfaces through `createSubstrateInstanceExecutor` as the typed
 *    `substrate-execution-failed` failure with the original message and
 *    work-item identifier preserved — proving the executor's failure path
 *    handles the real skeleton error shape end-to-end.
 *
 * The real Zcode AgentRuntime binding itself is FUTURE WORK (deep zcode-cli
 * integration; tracked for the Tech Lead): until it exists, production
 * execution binds a real adapter implementing the same port and tests bind
 * the disclosed in-memory double (src/test-doubles/).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SubstrateAdapterNotBoundError,
  UnboundAgentRuntimeAdapter,
} from "@mos/substrate-adapters";
import {
  AgentRuntimeError,
  createSubstrateInstanceExecutor,
} from "../dist/index.js";
import type { AgentInstanceRecord } from "../dist/index.js";

test("the real substrate skeleton fails closed on construction, naming the AGT-002 binding", () => {
  assert.throws(
    () => new UnboundAgentRuntimeAdapter(),
    (error: unknown) =>
      error instanceof SubstrateAdapterNotBoundError &&
      error.portName === "AgentRuntimePort" &&
      error.bindingWorkItem.includes("AGT-002") &&
      error.code === "MOS_SUBSTRATE_ADAPTER_NOT_BOUND",
  );
});

test("the real substrate skeleton blocks prototype bypass", () => {
  const bypassed = Object.create(UnboundAgentRuntimeAdapter.prototype) as UnboundAgentRuntimeAdapter;
  assert.throws(
    () => bypassed.start({ agentBodyRef: "body@1" }),
    (error: unknown) => error instanceof SubstrateAdapterNotBoundError,
  );
});

test("a real SubstrateAdapterNotBoundError from the substrate port surfaces typed through the executor", async () => {
  // A substrate port whose binding is missing — exactly what the real
  // skeleton would present if construction were possible before binding.
  const unboundPort = {
    start() {
      throw new SubstrateAdapterNotBoundError(
        "AgentRuntimePort",
        "AGT-002 (Agent Instance / Model Boundary)",
        "The ZCode AgentRuntime execution binding is not implemented yet.",
      );
    },
    execute() {
      throw new SubstrateAdapterNotBoundError(
        "AgentRuntimePort",
        "AGT-002 (Agent Instance / Model Boundary)",
        "The ZCode AgentRuntime execution binding is not implemented yet.",
      );
    },
    stop() {
      throw new SubstrateAdapterNotBoundError(
        "AgentRuntimePort",
        "AGT-002 (Agent Instance / Model Boundary)",
        "The ZCode AgentRuntime execution binding is not implemented yet.",
      );
    },
  };
  const executor = createSubstrateInstanceExecutor(unboundPort);
  const instance = {
    instanceId: "agent-instance-1",
    bodyId: "clip-selection-pawn",
    bodyVersion: 1,
    tenantScope: { tenantId: "tenant-a" },
    lifecycle: "bound",
    modelRef: "model:small-fast",
    runtimeRef: "runtime:local",
    toolRefs: [],
    capabilityRefs: [],
  } as unknown as AgentInstanceRecord;

  await assert.rejects(
    () => executor.execute(instance, "rank these clips"),
    (error: unknown) =>
      error instanceof AgentRuntimeError &&
      error.code === "substrate-execution-failed" &&
      error.message.includes("substrate start failed") &&
      error.message.includes("AgentRuntimePort") &&
      error.message.includes("AGT-002"),
  );
});
