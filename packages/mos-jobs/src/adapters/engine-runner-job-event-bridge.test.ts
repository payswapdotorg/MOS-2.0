/**
 * ENG-003 runner-seam bridge tests (JOBS-001): completion events
 * materialize as durable job lifecycle events with FULL §30 observability
 * and the actor enrichment (runner "engine-runner" + the submitting actor
 * from the job record); typed failures drive retries; unresolvable
 * events are buffered, never thrown into the runner.
 *
 * The REAL @mos/engines runner round-trip is pinned separately in
 * compat/engine-runner-bridge.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createEngineRunnerJobEventBridge } from "./engine-runner-job-event-bridge.js";
import type { RunnerJobEventSink } from "../contracts/runner-events.js";
import {
  SCOPE_A,
  createFakeRunner,
  engineJobId,
  jobKeyOf,
  makeArtifactRef,
  makeFailure,
  makeQueue,
  makeRunnerRecord,
  makeSubmission,
  runnerCompletedEvent,
  runnerQueuedEvent,
  runnerRunningEvent,
} from "../testing/job-fixtures.js";

const SUBMITTER = { kind: "service", name: "studio-runtime" };

function setup() {
  const queue = makeQueue();
  const bridge = createEngineRunnerJobEventBridge({ queue, scope: SCOPE_A });
  return { queue, bridge };
}

test("runner success materializes as the durable job completion with full §30 observability", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(
    makeSubmission({ kind: "engine-execution", jobKey: jobKeyOf("engine-1") }),
  );
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  const runnerRecord = makeRunnerRecord({ runId: engineJobId(record.id as string) });
  bridge.onJobEvent(runnerQueuedEvent(record.id as string));
  bridge.onJobEvent(runnerRunningEvent(record.id as string));
  bridge.onJobEvent(runnerCompletedEvent("job-succeeded", runnerRecord));

  const job = queue.getJob(SCOPE_A, record.id);
  assert.ok(job !== undefined);
  assert.equal(job.status, "succeeded");

  // §30 completeness on the materialized record.
  const observability = job.observability;
  assert.ok(observability !== null);
  assert.equal(observability.runId, record.id as string);
  assert.equal(observability.engineId, "engine:sandbox-alpha");
  assert.equal(observability.engineVersion, 1);
  assert.equal(observability.capabilityId, "semantic_video_relevance");
  assert.equal(observability.capabilityVersion, 1);
  assert.deepEqual(observability.outputArtifactRefs, runnerRecord.outputArtifactRefs);
  assert.equal(observability.durationMs, runnerRecord.durationMs);
  assert.deepEqual(observability.cost, runnerRecord.cost);
  assert.deepEqual(observability.resourceUsage, runnerRecord.resourceUsage);
  assert.deepEqual(observability.warnings, runnerRecord.warnings);
  assert.deepEqual(observability.provenance, runnerRecord.provenance);

  // §30 completeness on the lifecycle event.
  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  const success = history.find((event) => event.type === "attempt-succeeded");
  assert.ok(success !== undefined);
  assert.equal(success.observability.runId, record.id as string);
  assert.deepEqual(success.observability.provenance, runnerRecord.provenance);
  assert.deepEqual(
    history.map((event) => event.type),
    ["enqueued", "claim", "attempt-succeeded"],
  );
});

test("§30 actor enrichment: engine-runner enriched with the submitting actor from the job record", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(
    makeSubmission({
      submittedBy: { kind: "user", identityRef: "identity:user-42" },
    }),
  );
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  bridge.onJobEvent(
    runnerCompletedEvent("job-succeeded", makeRunnerRecord({ runId: engineJobId(record.id as string) })),
  );

  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  const success = history.find((event) => event.type === "attempt-succeeded");
  assert.ok(success !== undefined);
  assert.deepEqual(success.actor, {
    executor: "engine-runner",
    submittedBy: { kind: "user", identityRef: "identity:user-42" },
  });
});

test("the bridge is a runner event sink: the fake runner drives it end-to-end", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(
    makeSubmission({ kind: "engine-execution", jobKey: jobKeyOf("engine-2") }),
  );
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  const runner = createFakeRunner(bridge as RunnerJobEventSink);
  runner.submit(record.id as string, "succeeded");

  const job = queue.getJob(SCOPE_A, record.id);
  assert.ok(job !== undefined);
  assert.equal(job.status, "succeeded");
  assert.deepEqual(runner.emitted.map((event) => event.type), [
    "job-queued",
    "job-running",
    "job-succeeded",
  ]);
  assert.deepEqual(bridge.counts, { queued: 1, running: 1, succeeded: 1, failed: 0, timedOut: 0 });
});

test("retriable runner failure drives the declared retry through the bridge", () => {
  const { queue, bridge } = setup();
  queue.enqueue(
    makeSubmission({
      kind: "engine-execution",
      jobKey: jobKeyOf("engine-3"),
      retryPolicy: { maxAttempts: 2, backoffScheduleMs: [50] },
    }),
  );
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  bridge.onJobEvent(
    runnerCompletedEvent(
      "job-failed",
      makeRunnerRecord({
        lifecycle: "failed",
        outputArtifactRefs: [],
        failure: {
          code: "engine-invocation-error",
          message: "adapter invocation failed: simulated",
          retriable: true,
        },
      }),
    ),
  );

  const requeued = queue.getJobByKey(SCOPE_A, jobKeyOf("engine-3"));
  assert.ok(requeued !== undefined);
  assert.equal(requeued.status, "queued");
  assert.equal(requeued.failure?.retriable, true);
  assert.equal(requeued.nextAttemptAtMs, 50);

  const history = queue.getJobHistory(SCOPE_A, requeued.id);
  assert.ok(history !== undefined);
  const retry = history.find((event) => event.type === "retry-scheduled");
  assert.ok(retry !== undefined);
  assert.deepEqual(retry.actor, { executor: "engine-runner", submittedBy: SUBMITTER });
});

test("runner timeout events retry or terminate as timed_out per the typed failure", () => {
  const { queue, bridge } = setup();
  queue.enqueue(
    makeSubmission({
      kind: "engine-execution",
      jobKey: jobKeyOf("engine-4"),
      retryPolicy: { maxAttempts: 1, backoffScheduleMs: [] },
    }),
  );
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  bridge.onJobEvent(
    runnerCompletedEvent(
      "job-timed-out",
      makeRunnerRecord({
        lifecycle: "timed_out",
        outputArtifactRefs: [],
        failure: {
          code: "engine-job-timeout",
          message: "engine job exceeded its 60000ms wall-clock deadline",
          retriable: true,
        },
      }),
    ),
  );

  const job = queue.getJobByKey(SCOPE_A, jobKeyOf("engine-4"));
  assert.ok(job !== undefined);
  assert.equal(job.status, "dead_lettered", "maxAttempts 1: the retriable timeout exhausts");

  const history = queue.getJobHistory(SCOPE_A, job.id);
  assert.ok(history !== undefined);
  const dead = history.find((event) => event.type === "dead-lettered");
  assert.ok(dead !== undefined);
  assert.equal(dead.failure.code, "engine-job-timeout");
});

test("runner events for an unknown job are buffered — never thrown into the runner", () => {
  const { queue, bridge } = setup();
  queue.enqueue(makeSubmission());

  assert.doesNotThrow(() => {
    bridge.onJobEvent(
      runnerCompletedEvent("job-succeeded", makeRunnerRecord({ runId: engineJobId("job-ghost") })),
    );
  });
  assert.equal(bridge.conflicts.length, 1);
  assert.equal(bridge.conflicts[0]?.code, "unknown-job");
  assert.equal(queue.listJobs({ tenantId: SCOPE_A.tenantId })[0]?.status, "queued");
});

test("a runner completing a cancelled job is a buffered conflict, not a crash", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(makeSubmission());
  queue.cancelJob(SCOPE_A, record.id, "operator stop", "studio-operator");

  assert.doesNotThrow(() => {
    bridge.onJobEvent(
      runnerCompletedEvent("job-succeeded", makeRunnerRecord({ runId: engineJobId(record.id as string) })),
    );
  });
  assert.equal(bridge.conflicts.length, 1);
  assert.equal(bridge.conflicts[0]?.code, "job-not-running");
  assert.equal(queue.getJob(SCOPE_A, record.id)?.status, "cancelled");
});

test("a failed runner event without a typed failure record is buffered, not guessed", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  bridge.onJobEvent(
    runnerCompletedEvent(
      "job-failed",
      makeRunnerRecord({ lifecycle: "failed", failure: null }),
    ),
  );
  assert.equal(bridge.conflicts.length, 1);
  assert.ok(bridge.conflicts[0]?.reason.includes("typed failure"));
  assert.equal(queue.getJob(SCOPE_A, record.id)?.status, "running", "nothing was guessed");
});

test("queued/running runner events are observed but never mutate the durable job", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  bridge.onJobEvent(runnerQueuedEvent(record.id as string));
  bridge.onJobEvent(runnerRunningEvent(record.id as string));

  const job = queue.getJob(SCOPE_A, record.id);
  assert.ok(job !== undefined);
  assert.equal(job.status, "running");
  assert.equal(bridge.conflicts.length, 0);
  assert.deepEqual(bridge.counts, { queued: 1, running: 1, succeeded: 0, failed: 0, timedOut: 0 });
  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  assert.equal(history.length, 2, "enqueued + claim only — no duplicate run events");
});

test("output artifact refs from the runner flow into the durable record untouched", () => {
  const { queue, bridge } = setup();
  const record = queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  bridge.onJobEvent(
    runnerCompletedEvent(
      "job-succeeded",
      makeRunnerRecord({
        runId: record.id as never,
        outputArtifactRefs: [makeArtifactRef(31), makeArtifactRef(32)],
      }),
    ),
  );

  const job = queue.getJob(SCOPE_A, record.id);
  assert.ok(job !== undefined);
  assert.deepEqual(job.observability?.outputArtifactRefs, [
    makeArtifactRef(31),
    makeArtifactRef(32),
  ]);
});

test("makeFailure fixture stays an ENG-003-shaped typed failure", () => {
  const failure = makeFailure();
  assert.equal(typeof failure.code, "string");
  assert.equal(typeof failure.message, "string");
  assert.equal(typeof failure.retriable, "boolean");
  assert.equal(failure.terminalStatus === "failed" || failure.terminalStatus === "timed_out", true);
});
