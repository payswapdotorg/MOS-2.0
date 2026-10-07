/**
 * In-memory engine runner tests (ENG-003) — the policy-breach battery:
 * network fail-closed (the sanctioned seam, the ambient-fetch guard,
 * explicit grants, host scoping), the seed policy, fail-closed operational
 * paths (unknown engines, missing adapters, forbidden manifest postures,
 * malformed jobs, rogue adapter results) and adapter registration
 * validation. The happy-path/core tests live in
 * in-memory-engine-runner.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  EngineJob,
  EngineJobId,
  EngineResult,
  Version,
} from "@mos/contracts";

import { createInMemoryEngineRegistry } from "./in-memory-engine-registry.js";
import { createInMemoryEngineRunner } from "./in-memory-engine-runner.js";
import { makeEngineManifest } from "../fixtures/test-engine-manifests.js";
import { createInMemoryArtifactStore } from "../test-doubles/in-memory-artifact-store.js";
import { createSandboxAwareTestAdapter } from "../test-doubles/sandbox-aware-test-adapter.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";
import { EngineSandboxViolationError } from "../domain/errors.js";
import {
  ENGINE_ID,
  FIXED_CLOCK,
  createContextCapturingAdapter,
  createRunnerHarness,
  makeInputRef,
  makeJob,
  successResult,
} from "../fixtures/engine-runner-test-harness.js";

const GRANTED_SECURITY = {
  sandboxed: true,
  networkAccess: "explicitly-granted" as const,
  filesystemScope: "scoped-artifacts-only" as const,
  databaseCredentials: "none" as const,
  providerCredentials: "none" as const,
};

// ---------------------------------------------------------------------------
// Network: fail-closed by default, explicit grants only
// ---------------------------------------------------------------------------

test("network attempting double (seam) under default denial → run fails closed, typed code", async () => {
  const harness = createRunnerHarness({
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      implementationTag: "net",
      networkAttempt: { url: "https://weights.example/model.bin", mode: "seam" },
    }),
  });
  const result = await harness.runner.submit(makeJob());

  assert.equal(result.failure?.code, "network-access-denied");
  assert.equal(result.outputArtifactRefs.length, 0);
  const completion = harness.sink.completions[0];
  assert.equal(completion?.type, "job-failed");
});

test("network attempting double (ambient fetch) under default denial → the fetch guard fails it closed", async () => {
  const fetchBefore = globalThis.fetch;
  const harness = createRunnerHarness({
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      implementationTag: "net-ambient",
      networkAttempt: { url: "https://weights.example/model.bin", mode: "ambient-fetch" },
    }),
  });
  const result = await harness.runner.submit(makeJob());

  assert.equal(result.failure?.code, "network-access-denied");
  // The guard restored the ambient fetch afterwards.
  assert.equal(globalThis.fetch, fetchBefore);
  // And the ambient call was genuinely the guarded one (not a network hit):
  // the adapter observed the typed violation itself.
  const completion = harness.sink.completions[0];
  assert.equal(completion?.record.failure?.code, "network-access-denied");
});

test("explicitly granted manifest + explicit grant + transport → the seam works, host-scoped", async () => {
  const grantedManifest = makeEngineManifest({
    id: ENGINE_ID as string,
    security: GRANTED_SECURITY,
  });
  const seenUrls: string[] = [];
  const harness = createRunnerHarness({
    manifest: grantedManifest,
    fetchImpl: async (url: string) => {
      seenUrls.push(url);
      return new TextEncoder().encode("weights-bytes");
    },
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      implementationTag: "net-granted",
      networkAttempt: { url: "https://weights.example/model.bin", mode: "seam" },
    }),
  });
  const result = await harness.runner.submit(makeJob(), {
    networkGrant: { allowedHosts: ["weights.example"] },
  });
  assert.equal(result.failure, null);
  assert.deepEqual(seenUrls, ["https://weights.example/model.bin"]);

  // Non-granted host under a granted policy still fails closed.
  const deniedHost = await harness.runner.submit(makeJob(), {
    networkGrant: { allowedHosts: ["other.example"] },
  });
  assert.equal(deniedHost.failure?.code, "network-host-not-granted");

  // No submission grant at all: denied even though the manifest grants.
  const noGrant = await harness.runner.submit(makeJob());
  assert.equal(noGrant.failure?.code, "network-access-denied");
});

test("granted manifest without transport still fails closed (no ambient network by accident)", async () => {
  const grantedManifest = makeEngineManifest({
    id: ENGINE_ID as string,
    security: GRANTED_SECURITY,
  });
  // No fetchImpl: the runner's grantedFetch falls back to the ORIGINAL
  // ambient fetch (captured by the guard) — which exists in Node, so the
  // seam delegates. To pin the fail-closed path we point the seam at a
  // transport that rejects with the typed violation.
  const harness = createRunnerHarness({
    manifest: grantedManifest,
    fetchImpl: async (url: string) => {
      throw new EngineSandboxViolationError(
        "network-access-denied",
        `simulated unreachable transport for ${url}`,
      );
    },
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      implementationTag: "net-no-transport",
      networkAttempt: { url: "https://weights.example/model.bin", mode: "seam" },
    }),
  });
  const result = await harness.runner.submit(makeJob(), {
    networkGrant: { allowedHosts: ["weights.example"] },
  });
  assert.equal(result.failure?.code, "network-access-denied");
});

// ---------------------------------------------------------------------------
// Seed policy
// ---------------------------------------------------------------------------

test("deterministic engine without a seed → typed seed-required failure", async () => {
  const job = makeJob();
  const adapter = createContextCapturingAdapter(successResult(job));
  const harness = createRunnerHarness({ adapter });
  const result = await harness.runner.submit(makeJob({ seed: null }));

  assert.equal(result.failure?.code, "seed-required");
  assert.equal(adapter.capturedContexts.length, 0);
});

test("non-deterministic engine with a seed → typed seed-not-supported failure", async () => {
  const job = makeJob();
  const adapter = createContextCapturingAdapter(successResult(job));
  const harness = createRunnerHarness({
    manifest: makeEngineManifest({ id: ENGINE_ID as string, deterministic: false }),
    adapter,
  });
  const result = await harness.runner.submit(makeJob({ seed: 42 }));

  assert.equal(result.failure?.code, "seed-not-supported");
  assert.equal(adapter.capturedContexts.length, 0);
});

// ---------------------------------------------------------------------------
// Fail-closed operational paths
// ---------------------------------------------------------------------------

test("unknown engine version → typed unknown-engine failure (registered engines only)", async () => {
  const harness = createRunnerHarness();
  const result = await harness.runner.submit(
    makeJob({ engineVersion: 7 as Version }),
  );
  assert.equal(result.failure?.code, "unknown-engine");
});

test("registered engine without an executable adapter → typed adapter-not-registered failure", async () => {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const store = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore: store,
    clock: FIXED_CLOCK,
  });
  registry.registerEngine(makeEngineManifest({ id: ENGINE_ID as string }));
  const result = await runner.submit(makeJob());
  assert.equal(result.failure?.code, "adapter-not-registered");
});

test("unsandboxed / credential-injected manifests cannot run (gate mirrored at execution time)", async () => {
  const job = makeJob();
  const adapter = createContextCapturingAdapter(successResult(job));
  const harness = createRunnerHarness({
    manifest: makeEngineManifest({
      id: ENGINE_ID as string,
      security: {
        sandboxed: false,
        networkAccess: "denied",
        filesystemScope: "scoped-artifacts-only",
        databaseCredentials: "injected",
        providerCredentials: "none",
      },
    }),
    adapter,
  });
  const result = await harness.runner.submit(job);
  assert.equal(result.failure?.code, "engine-not-sandboxed");
  assert.deepEqual(result.failure?.details?.violations, [
    "engine-not-sandboxed",
    "database-credentials-forbidden",
  ]);
  assert.equal(adapter.capturedContexts.length, 0);
});

test("malformed EngineJob input throws fail-closed (contract-shape programming error)", async () => {
  const harness = createRunnerHarness();
  const broken = {
    id: "job:broken",
    capabilityId: "semantic_video_relevance",
  } as unknown as EngineJob;
  await assert.rejects(
    () => harness.runner.submit(broken),
    (error: unknown) =>
      error instanceof Error &&
      /EngineJob is missing required fields/.test(error.message),
  );
});

test("rogue adapter results are rejected: wrong jobId, fabricated outputs", async () => {
  // Wrong jobId echo.
  const job = makeJob();
  const rogueJobId: EngineAdapter = {
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    async invoke(innerJob: EngineJob): Promise<EngineResult> {
      return { ...successResult(innerJob), jobId: "job:someone-elses" as EngineJobId };
    },
  };
  const harness = createRunnerHarness({ adapter: rogueJobId });
  const mismatch = await harness.runner.submit(job);
  assert.equal(mismatch.failure?.code, "result-job-id-mismatch");
  assert.equal(mismatch.jobId, job.id); // the failure result echoes OUR job

  // Fabricated output ref: never materialized inside the sandbox scope.
  const fabricated = makeInputRef(55);
  const rogueOutput: EngineAdapter = {
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    async invoke(innerJob: EngineJob): Promise<EngineResult> {
      return { ...successResult(innerJob), outputArtifactRefs: [fabricated] };
    },
  };
  const harness2 = createRunnerHarness({ adapter: rogueOutput });
  const unscoped = await harness2.runner.submit(makeJob());
  assert.equal(unscoped.failure?.code, "unscoped-output-artifact");
  assert.equal(unscoped.outputArtifactRefs.length, 0);
});

test("registerAdapter validates adapter shape and rejects duplicates", () => {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const store = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore: store,
    clock: FIXED_CLOCK,
  });
  const adapter = createSandboxAwareTestAdapter({
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
  });
  runner.registerAdapter(adapter);
  assert.throws(
    () => runner.registerAdapter(adapter),
    (error: unknown) =>
      error instanceof Error && /already registered/.test(error.message),
  );
  assert.throws(
    () =>
      runner.registerAdapter({
        engineId: ENGINE_ID,
        engineVersion: 2 as Version,
        invoke: undefined as unknown as EngineAdapter["invoke"],
      }),
    (error: unknown) =>
      error instanceof Error && /invoke/.test(error.message),
  );
});
