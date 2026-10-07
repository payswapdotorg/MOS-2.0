/**
 * ENG-003 runner-seam compatibility test (JOBS-001) — RUNTIME half of the
 * compatibility pin.
 *
 * Runs the REAL `@mos/engines` ENG-003 in-memory runner (built dist, via a
 * relative path — no package dependency edge; see engines-event-compat.ts)
 * with the BUILT `@mos/jobs` bridge wired DIRECTLY as its event sink:
 *
 * 1. the bridge object is handed to `createInMemoryEngineRunner` where a
 *    `JobEventSinkPort` is expected — the runtime proof that the mirrored
 *    seam is structurally the real port (the compile-time proof is
 *    engines-event-compat.ts, compiled by tsconfig.compat.json);
 * 2. a REAL engine run (registry + manifest + seeded artifact store + the
 *    disclosed sandbox-aware adapter) completes through the runner and the
 *    bridge materializes it as the durable job's success with the FULL §30
 *    observability record copied from the real run;
 * 3. §30 actor enrichment: the runner's "engine-runner" attribution is
 *    enriched with the submitting actor from the durable job record;
 * 4. a REAL retriable typed failure drives the declared retry through the
 *    bridge, and retry exhaustion dead-letters with the full append-only
 *    history — the complete durable loop over the real runner.
 *
 * The engine/adapter here are the engines package's own DISCLOSED test
 * doubles; this file makes no engine claim beyond the seam contract.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  ArtifactRef,
  Engine,
  EngineJob,
  EngineJobId,
  ResourceLimits,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import {
  createInMemoryArtifactStore,
  createInMemoryEngineRegistry,
  createInMemoryEngineRunner,
  createSandboxAwareTestAdapter,
} from "../../mos-engines/dist/index.js";

import {
  createDurableJobQueue,
  createEngineRunnerJobEventBridge,
  createInMemoryDurableJobStore,
  jobKey,
} from "../dist/index.js";
import type {
  DurableJobRecord,
  JobSubmitterActor,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// The deterministic world (mirrors the engines package's own runner tests)
// ---------------------------------------------------------------------------

const FIXED_CLOCK = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;
const TENANT = "tenant:compat" as TenantId;
const SCOPE: TenantScope = { tenantId: TENANT };
const ENGINE_ALPHA = "engine:sandbox-alpha";
const ENGINE_BETA = "engine:sandbox-beta";
const CAPABILITY_ID = "semantic_video_relevance";
const SUBMITTER: JobSubmitterActor = { kind: "service", name: "compat-harness" };
const LIMITS: ResourceLimits = {
  cpuCores: 2,
  gpuUnits: 1,
  memoryMb: 4096,
  timeoutMs: 60_000,
};

/** One input artifact ref (n-th), tenant-scoped to the compat tenant. */
function inputRef(n: number): ArtifactRef {
  return {
    artifactId: `artifact:compat-input-${n}` as ArtifactRef["artifactId"],
    version: 1 as Version,
    tenantId: TENANT,
    digest: `sha256:compat-input-${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://compat-input-${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:compat-input" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:compat-input" as ArtifactRef["provenanceRef"],
  };
}

const INPUTS = [inputRef(1), inputRef(2)];
const INPUT_BYTES = [
  new TextEncoder().encode("compat-frame-one"),
  new TextEncoder().encode("compat-frame-two"),
];

/** A well-formed engine manifest for the given engine id (runner scope). */
function manifestOf(engineId: string): Engine {
  return {
    id: engineId as Engine["id"],
    version: 1 as Version,
    capabilityIds: [CAPABILITY_ID as Engine["capabilityIds"][number]],
    adapterRef: `adapter:${engineId}@1` as Engine["adapterRef"],
    inputContract: { type: "object" },
    outputContract: { type: "object" },
    resources: { cpuCores: 2, gpuUnits: 1, memoryMb: 4096, timeoutMs: 60_000 },
    deterministic: true,
    license: {
      code: { identifier: "MIT", status: "cleared" },
      model: { identifier: "CC-BY-4.0", status: "cleared" },
      data: { identifier: "CC-BY-4.0", status: "cleared" },
    },
    security: {
      sandboxed: true,
      networkAccess: "denied",
      filesystemScope: "scoped-artifacts-only",
      databaseCredentials: "none",
      providerCredentials: "none",
    },
    provenance: `provenance:engine:${engineId}@1` as Engine["provenance"],
    benchmark: {
      id: `benchmark:${engineId}@1` as Engine["benchmark"]["id"],
      capabilityVersion: 1 as Version,
      engineVersion: 1 as Version,
      benchmarkCorpusRef: "corpus:golden@1" as Engine["benchmark"]["benchmarkCorpusRef"],
      evaluatorVersion: 1 as Version,
      metrics: { score: 0.8 },
      cost: { amount: 0.01, currency: "USD" },
      latency: 1_000,
      licenseStatus: "cleared",
      result: "passed",
    },
  };
}

/** The real runner + the durable queue + the bridge, wired at the seam. */
function createWorld(options: { readonly now: () => number } ) {
  const queue = createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock: FIXED_CLOCK,
    now: options.now,
    leaseDurationMs: 60_000,
  });
  const bridge = createEngineRunnerJobEventBridge({ queue, scope: SCOPE });

  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  registry.registerEngine(manifestOf(ENGINE_ALPHA));
  registry.registerEngine(manifestOf(ENGINE_BETA));

  const artifactStore = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  artifactStore.registerArtifact(INPUTS[0] as ArtifactRef, INPUT_BYTES[0] as Uint8Array);
  artifactStore.registerArtifact(INPUTS[1] as ArtifactRef, INPUT_BYTES[1] as Uint8Array);

  // THE SEAM: the bridge is handed directly where a JobEventSinkPort goes.
  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore,
    eventSink: bridge,
    clock: FIXED_CLOCK,
    now: options.now,
  });
  runner.registerAdapter(
    createSandboxAwareTestAdapter({
      engineId: ENGINE_ALPHA as Parameters<typeof createSandboxAwareTestAdapter>[0]["engineId"],
      engineVersion: 1 as Version,
      modelIdentity: "checkpoint:test/sandbox-alpha@1",
      implementationTag: "alpha",
    }),
  );
  runner.registerAdapter(
    createSandboxAwareTestAdapter({
      engineId: ENGINE_BETA as Parameters<typeof createSandboxAwareTestAdapter>[0]["engineId"],
      engineVersion: 1 as Version,
      modelIdentity: "checkpoint:test/sandbox-beta@1",
      implementationTag: "beta",
      failure: {
        code: "engine-invocation-error",
        message: "adapter invocation failed: compat simulated retriable failure",
        retriable: true,
      },
    }),
  );

  return { queue, bridge, runner };
}

/** A durable engine-execution submission for the compat tenant. */
function submission(
  jobKeyValue: string,
  retryPolicy: { maxAttempts: number; backoffScheduleMs: number[] },
): Parameters<ReturnType<typeof createDurableJobQueue>["enqueue"]>[0] {
  return {
    scope: SCOPE,
    jobKey: jobKey(jobKeyValue),
    kind: "engine-execution",
    contractVersion: 1 as Version,
    submittedBy: SUBMITTER,
    inputArtifactRefs: INPUTS,
    parameters: {},
    retryPolicy,
  };
}

/** The EngineJob whose id IS the durable job id (documented identity bridge). */
function engineJobFor(
  record: DurableJobRecord,
  engineId: string,
): EngineJob {
  return {
    id: record.id as unknown as EngineJobId,
    capabilityId: CAPABILITY_ID as EngineJob["capabilityId"],
    capabilityVersion: 1 as Version,
    engineId: engineId as EngineJob["engineId"],
    engineVersion: 1 as Version,
    inputArtifactRefs: INPUTS,
    parameters: {},
    seed: 42,
    resourceLimits: { ...LIMITS },
    outputContract: { type: "object" },
  };
}

// ---------------------------------------------------------------------------
// The round-trips
// ---------------------------------------------------------------------------

test("real runner success materializes as durable job success with full §30 observability", async () => {
  const { queue, bridge, runner } = createWorld({ now: () => 0 });

  const record = queue.enqueue(submission("compat-success", { maxAttempts: 1, backoffScheduleMs: [] }));
  const claim = queue.claimNextRunnable({ workerId: "compat-worker" });
  assert.ok(claim !== null, "the durable job must be claimable");

  const result = await runner.submit(engineJobFor(record, ENGINE_ALPHA));
  assert.equal(result.failure, null, "the real run must succeed");

  const job = queue.getJob(SCOPE, record.id);
  assert.ok(job !== undefined);
  assert.equal(job.status, "succeeded");
  assert.equal(job.lease, null);
  assert.equal(job.attemptCount, 1);

  // §30 completeness — copied from the REAL run, not fabricated.
  const observability = job.observability;
  assert.ok(observability !== null);
  assert.equal(observability.runId, record.id as string);
  assert.equal(observability.engineId as string, ENGINE_ALPHA);
  assert.equal(observability.engineVersion, 1);
  assert.equal(observability.capabilityId as string, CAPABILITY_ID);
  assert.equal(observability.capabilityVersion, 1);
  assert.deepEqual(observability.outputArtifactRefs, result.outputArtifactRefs);
  assert.equal(observability.durationMs, 0);
  assert.deepEqual(observability.cost, result.cost);
  assert.deepEqual(observability.resourceUsage, result.resourceUsage);
  assert.deepEqual(observability.warnings, []);
  assert.equal(observability.provenance?.modelIdentity, "checkpoint:test/sandbox-alpha@1");
  assert.equal(observability.provenance?.engineId as string, ENGINE_ALPHA);
  assert.equal(job.run.workerId, "compat-worker");

  // The bridge observed the full real lifecycle without conflicts.
  assert.deepEqual(bridge.counts, { queued: 1, running: 1, succeeded: 1, failed: 0, timedOut: 0 });
  assert.deepEqual(bridge.conflicts, []);

  // §30 actor enrichment on the lifecycle event.
  const history = queue.getJobHistory(SCOPE, record.id);
  assert.ok(history !== undefined);
  assert.deepEqual(
    history.map((event) => event.type),
    ["enqueued", "claim", "attempt-succeeded"],
  );
  const success = history.find((event) => event.type === "attempt-succeeded");
  assert.ok(success !== undefined);
  assert.deepEqual(success.actor, { executor: "engine-runner", submittedBy: SUBMITTER });
  assert.equal(success.observability.runId, record.id as string);
});

test("a real retriable failure retries through the bridge, then dead-letters on exhaustion", async () => {
  let time = 0;
  const { queue, bridge, runner } = createWorld({ now: () => time });

  const record = queue.enqueue(submission("compat-retry", { maxAttempts: 2, backoffScheduleMs: [25] }));
  const first = queue.claimNextRunnable({ workerId: "compat-worker-1" });
  assert.ok(first !== null);

  const firstResult = await runner.submit(engineJobFor(record, ENGINE_BETA));
  assert.equal(firstResult.failure?.code, "engine-invocation-error");
  assert.equal(firstResult.failure?.retriable, true);

  const afterFirst = queue.getJob(SCOPE, record.id);
  assert.ok(afterFirst !== undefined);
  assert.equal(afterFirst.status, "queued", "the retriable failure re-queued the job");
  assert.equal(afterFirst.attemptCount, 1);
  assert.equal(afterFirst.failure?.code, "engine-invocation-error");
  assert.equal(afterFirst.failure?.retriable, true);
  assert.equal(afterFirst.nextAttemptAtMs, 25, "declared backoff schedules the retry");

  const retryEvent = queue
    .getJobHistory(SCOPE, record.id)
    ?.find((event) => event.type === "retry-scheduled");
  assert.ok(retryEvent !== undefined);
  assert.equal(retryEvent.delayMs, 25);
  assert.deepEqual(retryEvent.actor, { executor: "engine-runner", submittedBy: SUBMITTER });

  // The backoff window gates the retry…
  time = 24;
  assert.equal(queue.claimNextRunnable({ workerId: "compat-worker-2" }), null);

  // …then the retry runs and exhausts into the dead-letter state.
  time = 25;
  const second = queue.claimNextRunnable({ workerId: "compat-worker-2" });
  assert.ok(second !== null);
  assert.equal(second.attempt, 2);
  const secondResult = await runner.submit(engineJobFor(record, ENGINE_BETA));
  assert.equal(secondResult.failure?.code, "engine-invocation-error");

  const dead = queue.getJob(SCOPE, record.id);
  assert.ok(dead !== undefined);
  assert.equal(dead.status, "dead_lettered");
  assert.equal(dead.attemptCount, 2);
  assert.equal(queue.claimNextRunnable({ workerId: "compat-worker-3" }), null);

  const history = queue.getJobHistory(SCOPE, record.id);
  assert.ok(history !== undefined);
  assert.deepEqual(
    history.map((event) => event.type),
    ["enqueued", "claim", "retry-scheduled", "claim", "dead-lettered"],
    "the full append-only history survives the real-runner loop",
  );

  assert.deepEqual(bridge.counts, { queued: 2, running: 2, succeeded: 0, failed: 2, timedOut: 0 });
  assert.deepEqual(bridge.conflicts, []);
});
