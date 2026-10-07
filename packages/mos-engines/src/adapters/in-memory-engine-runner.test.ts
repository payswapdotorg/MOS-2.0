/**
 * In-memory engine runner tests (ENG-003) — core sandbox behavior: the
 * EngineJob → EngineResult round-trip with the DISCLOSED deterministic test
 * adapter, the job lifecycle event stream, §30 observability record
 * completeness, the STRUCTURAL no-credential pins of the sandbox context
 * (runtime side; compile-time pins live in sandbox-policy.test.ts), the
 * job-scoped artifact store, quota enforcement (validity, adequacy,
 * post-flight usage) and the wall-clock deadline.
 *
 * Policy-breach paths (network, seed, fail-closed operations, rogue
 * adapters) live in in-memory-engine-runner-policy.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { assertRequiredFields } from "@mos/contracts";
import type {
  ArtifactRef,
  EngineJob,
  EngineJobId,
  EngineResult,
  Version,
} from "@mos/contracts";

import { createSandboxAwareTestAdapter } from "../test-doubles/sandbox-aware-test-adapter.js";
import type { EngineSandboxContext } from "../ports/engine-runner.port.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";
import {
  ENGINE_ID,
  FIXED_CLOCK,
  LIMITS,
  createContextCapturingAdapter,
  createRunnerHarness,
  makeInputRef,
  makeJob,
  successResult,
} from "../fixtures/engine-runner-test-harness.js";

// ---------------------------------------------------------------------------
// Round-trip + lifecycle + observability
// ---------------------------------------------------------------------------

test("round-trip: sandbox-aware adapter resolves inputs, persists outputs, full result shape", async () => {
  const harness = createRunnerHarness();
  const job = makeJob();
  const result = await harness.runner.submit(job);

  assert.doesNotThrow(() => assertRequiredFields(result, "EngineResult"));
  assert.equal(result.failure, null);
  assert.equal(result.jobId, job.id);
  assert.equal(result.provenance.engineId, ENGINE_ID);
  assert.equal(result.provenance.modelIdentity, "checkpoint:test/sandbox-alpha@1");
  assert.equal(result.outputArtifactRefs.length, 2);

  // Outputs are real persisted artifacts with lineage + creation method.
  for (const outputRef of result.outputArtifactRefs) {
    const record = await harness.store.resolve(outputRef);
    assert.notEqual(record, undefined);
    assert.equal(record?.ref.tenantId, job.inputArtifactRefs[0]?.tenantId);
  }
  const generated = harness.store
    .listArtifacts()
    .filter((artifact) => artifact.creationMethod === "engine-generated");
  assert.equal(generated.length, 2);
  const inputArtifactIds = job.inputArtifactRefs.map((ref) => ref.artifactId);
  for (const artifact of generated) {
    assert.equal(artifact.lineage.length, 1);
    const parent = artifact.lineage[0];
    assert.notEqual(parent, undefined);
    assert.ok(
      parent !== undefined && inputArtifactIds.includes(parent.artifactId),
      "engine-generated artifacts must carry their input lineage",
    );
  }

  // Determinism: same job → same output digests.
  const second = await harness.runner.submit(
    makeJob({ id: "job:runner-2" as EngineJobId }),
  );
  assert.deepEqual(
    second.outputArtifactRefs.map((ref) => ref.digest),
    result.outputArtifactRefs.map((ref) => ref.digest),
  );
});

test("lifecycle events: queued → running → succeeded, in order, for one job", async () => {
  const harness = createRunnerHarness();
  const job = makeJob();
  await harness.runner.submit(job);

  const events = harness.sink.eventsFor(job.id as string);
  assert.deepEqual(
    events.map((event) => event.type),
    ["job-queued", "job-running", "job-succeeded"],
  );
  assert.equal(harness.sink.completions.length, 1);
});

test("adapter-resolved typed failure → job-failed lifecycle (the durable-job seam sees the failure)", async () => {
  // W4-B regression-sweep defect pin: an adapter that RESOLVES an
  // EngineResult with failure !== null is a FAILED run per the frozen
  // EngineResult contract. The completion event through the
  // JobEventSinkPort seam must be job-failed with lifecycle "failed" and
  // the typed failure preserved — the durable jobs consumer (mos-jobs)
  // drives retries from exactly this record; a job-succeeded event here
  // would materialize failed engine work as a successful durable job.
  const harness = createRunnerHarness({
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      modelIdentity: "checkpoint:test/sandbox-alpha@1",
      implementationTag: "alpha",
      failure: {
        code: "engine-invocation-error",
        message: "adapter invocation failed: pinned typed failure",
        retriable: true,
      },
    }),
  });
  const job = makeJob();
  const result = await harness.runner.submit(job);

  // The returned result is the adapter's honest typed failure, auditable.
  assert.equal(result.failure?.code, "engine-invocation-error");
  assert.equal(result.failure?.retriable, true);
  assert.deepEqual(result.outputArtifactRefs, []);

  // The lifecycle events report the run as failed, in order.
  const events = harness.sink.eventsFor(job.id as string);
  assert.deepEqual(
    events.map((event) => event.type),
    ["job-queued", "job-running", "job-failed"],
  );
  const completion = harness.sink.completions[0];
  assert.notEqual(completion, undefined);
  assert.equal(completion?.type, "job-failed");
  assert.equal(completion?.record.lifecycle, "failed");
  assert.equal(completion?.record.failure?.code, "engine-invocation-error");
  assert.equal(completion?.record.failure?.retriable, true);
  assert.equal(completion?.record.outputArtifactRefs.length, 0);
});

test("§30 observability record completeness on the completion event", async () => {
  const harness = createRunnerHarness();
  const job = makeJob();
  const result = await harness.runner.submit(job);

  const completion = harness.sink.completions[0];
  assert.notEqual(completion, undefined);
  assert.equal(completion?.type, "job-succeeded");
  const record = completion?.record;
  assert.notEqual(record, undefined);
  if (record === undefined) {
    return;
  }
  assert.equal(record.runId, job.id);
  assert.equal(record.capabilityId, job.capabilityId);
  assert.equal(record.capabilityVersion, job.capabilityVersion);
  assert.equal(record.engineId, job.engineId);
  assert.equal(record.engineVersion, job.engineVersion);
  assert.equal(record.actor, "engine-runner");
  assert.deepEqual(record.inputArtifactRefs, job.inputArtifactRefs);
  assert.deepEqual(record.outputArtifactRefs, result.outputArtifactRefs);
  assert.equal(typeof record.durationMs, "number");
  assert.deepEqual(record.resourceUsage, result.resourceUsage);
  assert.deepEqual(record.cost, result.cost);
  assert.deepEqual(record.warnings, result.warnings);
  assert.equal(record.failure, null);
  assert.deepEqual(record.provenance, result.provenance);
  assert.equal(record.lifecycle, "succeeded");
  assert.equal(record.recordedAt, FIXED_CLOCK());
});

// ---------------------------------------------------------------------------
// Structural pins: the context the adapter receives
// ---------------------------------------------------------------------------

test("structural runtime pin: the sandbox context has exactly the five sanctioned keys, no credential surface", async () => {
  const job = makeJob();
  const adapter = createContextCapturingAdapter(successResult(job));
  const harness = createRunnerHarness({ adapter });
  await harness.runner.submit(job);

  assert.equal(adapter.capturedContexts.length, 1);
  const context = adapter.capturedContexts[0];
  assert.notEqual(context, undefined);
  if (context === undefined) {
    return;
  }
  // Exact key set — anything added to EngineSandboxContext fails here (and
  // the compile-time pin in sandbox-policy.test.ts fails the build).
  assert.deepEqual(Object.keys(context).sort(), [
    "artifacts",
    "job",
    "network",
    "quotas",
    "seed",
  ]);
  // Serialized scan: no credential-shaped vocabulary anywhere inside.
  const serialized = JSON.stringify(context, (key, value) => {
    if (typeof key === "string" && /credential|secret|token|password|apikey|privatekey/i.test(key)) {
      return `CREDENTIAL-SURFACE:${key}`;
    }
    return value;
  });
  assert.equal(serialized.includes("CREDENTIAL-SURFACE"), false);
  // The granted quotas + seed travel with the context.
  assert.deepEqual(context.quotas, job.resourceLimits);
  assert.equal(context.seed, job.seed);
  assert.equal(context.network.policy.access, "denied");
});

test("the adapter sees a job-scoped artifact store: foreign refs do not resolve", async () => {
  const job = makeJob();
  let scopedResolve:
    | ((ref: ArtifactRef) => Promise<unknown>)
    | undefined;
  const adapter: EngineAdapter = {
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    async invoke(innerJob: EngineJob, context: EngineSandboxContext): Promise<EngineResult> {
      scopedResolve = (ref: ArtifactRef) => context.artifacts.resolve(ref);
      return successResult(innerJob);
    },
  };
  const harness = createRunnerHarness({ adapter });
  await harness.runner.submit(job);
  assert.notEqual(scopedResolve, undefined);
  if (scopedResolve === undefined) {
    return;
  }

  // In-scope input resolves with its bytes.
  const inside = await scopedResolve(job.inputArtifactRefs[0] as ArtifactRef);
  assert.notEqual(inside, undefined);
  // A foreign, existing artifact in the backing store does NOT resolve.
  const foreignRef = makeInputRef(99);
  harness.store.registerArtifact(foreignRef, new TextEncoder().encode("secret-tenant-data"));
  assert.equal(await scopedResolve(foreignRef), undefined);
  // An unknown ref does not resolve either (no existence leaks).
  assert.equal(await scopedResolve(makeInputRef(98)), undefined);
});

// ---------------------------------------------------------------------------
// Quota enforcement
// ---------------------------------------------------------------------------

test("invalid resource limits → typed failure before the adapter runs", async () => {
  const job = makeJob();
  const adapter = createContextCapturingAdapter(successResult(job));
  const harness = createRunnerHarness({ adapter });
  const result = await harness.runner.submit(
    makeJob({ resourceLimits: { ...LIMITS, cpuCores: 0 } }),
  );

  assert.equal(result.failure?.code, "invalid-resource-limits");
  assert.deepEqual(result.failure?.details?.invalid, ["cpuCores"]);
  assert.equal(result.outputArtifactRefs.length, 0);
  assert.equal(adapter.capturedContexts.length, 0); // never invoked
  const events = harness.sink.events;
  assert.deepEqual(
    events.map((event) => event.type),
    ["job-queued", "job-failed"],
  );
});

test("job granting less than the engine profile → typed failure naming the deficit dimensions", async () => {
  const job = makeJob();
  const adapter = createContextCapturingAdapter(successResult(job));
  const harness = createRunnerHarness({ adapter });
  const result = await harness.runner.submit(
    makeJob({ resourceLimits: { ...LIMITS, memoryMb: 1024, gpuUnits: 0.5 } }),
  );

  assert.equal(
    result.failure?.code,
    "resource-quota-below-engine-requirements",
  );
  assert.deepEqual(result.failure?.details?.deficit, ["gpuUnits", "memoryMb"]);
  assert.equal(adapter.capturedContexts.length, 0);
});

test("over-quota reported usage → typed failure, outputs stripped, run stays auditable", async () => {
  const harness = createRunnerHarness({
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      implementationTag: "hog",
      excessUsage: { cpuCoreSeconds: 9999 },
    }),
  });
  const result = await harness.runner.submit(makeJob());

  assert.equal(result.failure?.code, "resource-quota-exceeded");
  assert.deepEqual(result.failure?.details?.violations, ["cpuCoreSeconds"]);
  // Outputs of a quota-violating run are discarded, never surfaced.
  assert.equal(result.outputArtifactRefs.length, 0);
  // But the usage/warnings/provenance remain for audit.
  assert.equal(result.resourceUsage.cpuCoreSeconds, 9999);
  assert.equal(result.provenance.engineId, ENGINE_ID);
  const completion = harness.sink.completions[0];
  assert.equal(completion?.type, "job-failed");
  assert.equal(completion?.record.lifecycle, "failed");
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

test("wall-clock deadline: hanging adapter → timed_out lifecycle, partial metrics, typed failure", async () => {
  const harness = createRunnerHarness({
    adapter: createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      implementationTag: "hang",
      hang: true,
    }),
  });
  const pendingResult = harness.runner.submit(makeJob());
  harness.tick(); // the measured wall clock advances while the job hangs
  harness.timers.fireFirst(); // the deadline fires deterministically
  const result = await pendingResult;

  assert.equal(result.failure?.code, "engine-job-timeout");
  assert.deepEqual(result.metrics, { partial: 1, timeoutDeadlineMs: 60000 });
  assert.equal(result.outputArtifactRefs.length, 0);
  assert.equal(result.duration, 5); // measured wall clock at abandonment
  const events = harness.sink.events;
  assert.deepEqual(
    events.map((event) => event.type),
    ["job-queued", "job-running", "job-timed-out"],
  );
  const completion = harness.sink.completions[0];
  assert.equal(completion?.type, "job-timed-out");
  assert.equal(completion?.record.lifecycle, "timed_out");
});

test("a completing adapter cancels its deadline timer (no stray timeouts)", async () => {
  const harness = createRunnerHarness();
  await harness.runner.submit(makeJob());
  assert.equal(harness.timers.pendingCount(), 0);
});
