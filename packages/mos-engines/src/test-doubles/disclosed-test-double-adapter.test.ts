/**
 * EngineAdapter contract tests via the DISCLOSED test double (ENG-002).
 *
 * Covers: adapter surface shape, EngineJob → EngineResult round-trip
 * typing, the typed failure path, fail-closed malformed-job handling, and
 * determinism. The double stands in for a real adapter; per AGENTS.md the
 * double tests the CONTRACT but is never production or provider proof.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { assertRequiredFields } from "@mos/contracts";
import type {
  ArtifactRef,
  EngineJob,
  EngineJobId,
  Version,
} from "@mos/contracts";

import { EngineRegistryError } from "../domain/errors.js";
import { createTestDoubleEngineAdapter } from "./disclosed-test-double-adapter.js";
import type { EngineSandboxContext } from "../ports/engine-runner.port.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";

const ENGINE_ID = "engine:test-double" as import("@mos/contracts").EngineId;

/** Minimal well-formed sandbox context (the runner builds the real one). */
function makeSandboxContext(
  extraKeys?: Record<string, unknown>,
): EngineSandboxContext {
  const base: EngineSandboxContext = {
    job: makeJob(),
    network: {
      policy: { access: "denied" },
      request: () => Promise.reject(new Error("denied")),
    },
    artifacts: {
      resolve: () => Promise.resolve(undefined),
      persist: () => Promise.reject(new Error("not implemented")),
    },
    quotas: makeJob().resourceLimits,
    seed: 42,
  };
  return extraKeys === undefined ? base : ({ ...base, ...extraKeys } as EngineSandboxContext);
}

function makeArtifactRef(n: number): ArtifactRef {
  return {
    artifactId: `artifact:${n}` as ArtifactRef["artifactId"],
    version: 1 as ArtifactRef["version"],
    tenantId: "tenant:t1" as ArtifactRef["tenantId"],
    digest: `digest:${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:1" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:1" as ArtifactRef["provenanceRef"],
  };
}

function makeJob(overrides: Partial<EngineJob> = {}): EngineJob {
  return {
    id: "job:1" as EngineJobId,
    capabilityId: "semantic_video_relevance" as EngineJob["capabilityId"],
    capabilityVersion: 1 as Version,
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    inputArtifactRefs: [makeArtifactRef(1), makeArtifactRef(2)],
    parameters: { topK: 10 },
    seed: 42,
    resourceLimits: { cpuCores: 2, gpuUnits: 1, memoryMb: 4096, timeoutMs: 60000 },
    outputContract: { type: "object" },
    ...overrides,
  };
}

test("the adapter implements the narrow EngineAdapter surface", () => {
  const adapter: EngineAdapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
  });
  assert.equal(adapter.engineId, ENGINE_ID);
  assert.equal(adapter.engineVersion, 1);
  assert.equal(typeof adapter.invoke, "function");
  assert.equal(Object.keys(adapter).length, 3); // engineId, engineVersion, invoke — nothing else
});

test("job in → result out round-trip: identity, echo outputs, provenance, full shape", async () => {
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    modelIdentity: "checkpoint:openclip/ViT-B-32@laion2b",
  });
  const job = makeJob();
  const result = await adapter.invoke(job, makeSandboxContext());

  // Full EngineResult contract surface present.
  assert.doesNotThrow(() => assertRequiredFields(result, "EngineResult"));

  assert.equal(result.jobId, job.id);
  assert.deepEqual(result.outputArtifactRefs, job.inputArtifactRefs);
  assert.equal(result.provenance.engineId, job.engineId);
  assert.equal(result.provenance.engineVersion, job.engineVersion);
  assert.equal(result.provenance.capabilityId, job.capabilityId);
  assert.equal(result.provenance.capabilityVersion, job.capabilityVersion);
  assert.equal(result.provenance.modelIdentity, "checkpoint:openclip/ViT-B-32@laion2b");
  assert.equal(result.failure, null);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.duration, 0);
  assert.deepEqual(result.metrics, { invocations: 1, inputArtifactCount: 2 });
  assert.deepEqual(result.cost, { amount: 0, currency: "USD" });
  assert.deepEqual(result.resourceUsage, {
    cpuCoreSeconds: 0,
    gpuUnitSeconds: 0,
    memoryMbSeconds: 0,
  });
});

test("typed failure path: failures are carried in the result, shape intact", async () => {
  const failure = {
    code: "engine-timeout",
    message: "engine exceeded its resource limits",
    retriable: true,
    details: { timeoutMs: 60000 },
  };
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    failure,
  });
  const result = await adapter.invoke(makeJob(), makeSandboxContext());

  assert.doesNotThrow(() => assertRequiredFields(result, "EngineResult"));
  assert.notEqual(result.failure, null);
  assert.equal(result.failure?.code, "engine-timeout");
  assert.equal(result.failure?.retriable, true);
  assert.deepEqual(result.failure?.details, { timeoutMs: 60000 });
  // A failed run still returns an auditable result record.
  assert.equal(result.jobId, "job:1");
  assert.deepEqual(result.outputArtifactRefs, []);
  assert.equal(result.outputArtifactRefs.length, 0);
});

test("warnings and cost are configurable and carried through", async () => {
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    warnings: [{ code: "degraded-input", message: "input artifact 2 was low resolution" }],
    cost: { amount: 0.004, currency: "USD" },
  });
  const result = await adapter.invoke(makeJob(), makeSandboxContext());
  assert.deepEqual(result.warnings, [
    { code: "degraded-input", message: "input artifact 2 was low resolution" },
  ]);
  assert.deepEqual(result.cost, { amount: 0.004, currency: "USD" });
});

test("malformed jobs are rejected fail-closed (missing required fields named)", async () => {
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
  });
  const broken = {
    id: "job:broken",
    capabilityId: "semantic_video_relevance",
    // capabilityVersion, engineId, engineVersion, ... missing
  } as unknown as EngineJob;
  await assert.rejects(
    () => adapter.invoke(broken, makeSandboxContext()),
    (error: unknown) =>
      !(error instanceof EngineRegistryError) &&
      error instanceof Error &&
      /EngineJob is missing required fields/.test(error.message),
  );
});

test("the double is deterministic: identical jobs yield deeply equal results", async () => {
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    modelIdentity: "checkpoint:x@1",
  });
  const job = makeJob({ seed: 7 });
  const first = await adapter.invoke(job, makeSandboxContext());
  const second = await adapter.invoke(job, makeSandboxContext());
  assert.deepEqual(first, second);
});

test("non-model engines record null model identity in provenance", async () => {
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
  });
  const result = await adapter.invoke(makeJob(), makeSandboxContext());
  assert.equal(result.provenance.modelIdentity, null);
});

test("adapter-side defense: a credential-shaped context key fails the invocation closed", async () => {
  const adapter = createTestDoubleEngineAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
  });
  const smuggled = makeSandboxContext({
    providerApiToken: "sk-live-should-not-exist",
  });
  await assert.rejects(
    () => adapter.invoke(makeJob(), smuggled),
    (error: unknown) =>
      error instanceof Error &&
      /credential-shaped fields/.test(error.message),
  );
});
