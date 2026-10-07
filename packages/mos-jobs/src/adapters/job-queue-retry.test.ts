/**
 * Durable job queue retry tests (JOBS-001): retries driven from TYPED
 * failures with the declared backoff schedule, retry exhaustion →
 * dead-letter with full append-only history, terminal timeouts, and
 * cancellation of queued jobs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { JobQueueError } from "../domain/errors.js";
import { retryDelayMs } from "../domain/retry-policy.js";
import type { DurableJobRecord } from "../contracts/durable-job.js";
import type { JobClaim } from "../ports/job-queue.port.js";
import {
  SCOPE_A,
  SCOPE_B,
  TENANT_B,
  createFakeClock,
  jobKeyOf,
  makeArtifactRef,
  makeFailure,
  makeQueue,
  makeSubmission,
} from "../testing/job-fixtures.js";

const SUBMITTER = { kind: "service", name: "studio-runtime" };

function claimOrFail(queue: ReturnType<typeof makeQueue>, workerId: string): JobClaim {
  const claim = queue.claimNextRunnable({ workerId });
  assert.ok(claim !== null, "expected a claimable job");
  return claim;
}

function enqueueRetriable(
  queue: ReturnType<typeof makeQueue>,
  maxAttempts: number,
  backoffScheduleMs: number[],
): DurableJobRecord {
  return queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("retry-target"),
      kind: "engine-execution",
      retryPolicy: { maxAttempts, backoffScheduleMs },
    }),
  );
}

test("retryDelayMs follows the declared schedule and clamps to the last entry", () => {
  const policy = { maxAttempts: 5, backoffScheduleMs: [100, 500, 2_000] };
  assert.equal(retryDelayMs(policy, 1), 100);
  assert.equal(retryDelayMs(policy, 2), 500);
  assert.equal(retryDelayMs(policy, 3), 2_000);
  assert.equal(retryDelayMs(policy, 4), 2_000, "clamped to the last entry");
  assert.equal(retryDelayMs({ maxAttempts: 1, backoffScheduleMs: [] }, 1), 0);
});

test("non-retriable typed failure terminates as failed with the failure recorded", () => {
  const queue = makeQueue();
  enqueueRetriable(queue, 3, [100]);
  const claim = claimOrFail(queue, "worker-1");

  const failed = queue.failJob(claim, makeFailure({ retriable: false, terminalStatus: "failed" }));
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure?.code, "engine-invocation-error");
  assert.equal(failed.attemptCount, 1);
  assert.equal(queue.claimNextRunnable({ workerId: "worker-2" }), null, "terminal, never re-run");

  const history = queue.getJobHistory(SCOPE_A, failed.id);
  assert.ok(history !== undefined);
  const event = history.find((entry) => entry.type === "attempt-failed");
  assert.ok(event !== undefined);
  assert.equal(event.failure.code, "engine-invocation-error");
  assert.deepEqual(event.actor, { executor: "worker-1", submittedBy: SUBMITTER });
});

test("retriable typed failure re-queues with the declared backoff; the window gates claiming", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock });
  enqueueRetriable(queue, 3, [1_000, 5_000]);
  const claim = claimOrFail(queue, "worker-1");

  const requeued = queue.failJob(
    claim,
    makeFailure({ retriable: true, terminalStatus: "failed" }),
  );
  assert.equal(requeued.status, "queued");
  assert.equal(requeued.attemptCount, 1);
  assert.equal(requeued.nextAttemptAtMs, 1_000, "now(0) + schedule[0]");
  assert.equal(requeued.lease, null);

  clock.advance(999);
  assert.equal(queue.claimNextRunnable({ workerId: "worker-2" }), null, "still inside backoff");

  clock.advance(1);
  const second = claimOrFail(queue, "worker-2");
  assert.equal(second.attempt, 2, "the retry is a NEW attempt");

  const history = queue.getJobHistory(SCOPE_A, requeued.id);
  assert.ok(history !== undefined);
  const retryEvent = history.find((entry) => entry.type === "retry-scheduled");
  assert.ok(retryEvent !== undefined);
  assert.equal(retryEvent.delayMs, 1_000);
  assert.equal(retryEvent.nextAttemptAtMs, 1_000);
  assert.equal(retryEvent.failure.retriable, true);

  // Second failure advances through the schedule.
  clock.advance(10_000);
  const requeuedAgain = queue.failJob(
    second,
    makeFailure({ retriable: true, terminalStatus: "failed" }),
  );
  assert.equal(requeuedAgain.nextAttemptAtMs, 11_000 + 5_000, "now(11s) + schedule[1]");
});

test("retry exhaustion dead-letters with the full append-only history preserved", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock });
  const record = enqueueRetriable(queue, 2, [0]);

  const first = claimOrFail(queue, "worker-1");
  queue.failJob(first, makeFailure({ retriable: true, terminalStatus: "failed" }));
  const second = claimOrFail(queue, "worker-2");
  const dead = queue.failJob(
    second,
    makeFailure({ retriable: true, terminalStatus: "failed", code: "engine-job-timeout" }),
  );

  assert.equal(dead.status, "dead_lettered");
  assert.equal(dead.attemptCount, 2);
  assert.equal(dead.failure?.code, "engine-job-timeout");
  assert.notEqual(dead.deadLetteredAt, null);
  assert.equal(queue.claimNextRunnable({ workerId: "worker-3" }), null);

  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  assert.deepEqual(
    history.map((event) => event.type),
    [
      "enqueued",
      "claim",
      "retry-scheduled",
      "claim",
      "dead-lettered",
    ],
    "every lifecycle transition is an immutable event, in order",
  );
  const deadEvent = history.find((entry) => entry.type === "dead-lettered");
  assert.ok(deadEvent !== undefined);
  assert.equal(deadEvent.attempts, 2);
  assert.equal(deadEvent.failure.code, "engine-job-timeout");
  // Sequences are monotonic per job.
  assert.deepEqual(
    history.map((event) => event.sequence),
    [1, 2, 3, 4, 5],
  );
});

test("dead-lettered jobs are listable (the dead-letter queue is a status view)", () => {
  const queue = makeQueue();
  enqueueRetriable(queue, 1, []);
  const claim = claimOrFail(queue, "worker-1");
  const dead = queue.failJob(claim, makeFailure({ retriable: true, terminalStatus: "failed" }));
  assert.equal(dead.status, "dead_lettered", "maxAttempts 1: the first retriable failure exhausts");

  const deadJobs = queue.listJobs({ tenantId: SCOPE_A.tenantId, statuses: ["dead_lettered"] });
  assert.equal(deadJobs.length, 1);
  assert.equal(deadJobs[0]?.id, dead.id);
});

test("timeout failures terminate as timed_out when not retried", () => {
  const queue = makeQueue();
  enqueueRetriable(queue, 1, []);
  const claim = claimOrFail(queue, "worker-1");

  const timedOut = queue.failJob(
    claim,
    makeFailure({
      code: "engine-job-timeout",
      message: "engine job exceeded its 60000ms wall-clock deadline",
      retriable: false,
      terminalStatus: "timed_out",
    }),
  );
  assert.equal(timedOut.status, "timed_out");

  const history = queue.getJobHistory(SCOPE_A, timedOut.id);
  assert.ok(history !== undefined);
  const event = history.find((entry) => entry.type === "attempt-timed-out");
  assert.ok(event !== undefined);
  assert.equal(event.failure.code, "engine-job-timeout");
});

test("retriable timeout failures retry first, then dead-letter on exhaustion", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock });
  enqueueRetriable(queue, 2, [100]);
  const first = claimOrFail(queue, "worker-1");

  const requeued = queue.failJob(
    first,
    makeFailure({ retriable: true, terminalStatus: "timed_out", code: "engine-job-timeout" }),
  );
  assert.equal(requeued.status, "queued");

  clock.advance(100);
  const second = claimOrFail(queue, "worker-2");
  const dead = queue.failJob(
    second,
    makeFailure({ retriable: true, terminalStatus: "timed_out", code: "engine-job-timeout" }),
  );
  assert.equal(dead.status, "dead_lettered");
});

test("executor attribution override lands on failure events (the bridge's engine-runner)", () => {
  const queue = makeQueue();
  enqueueRetriable(queue, 1, []);
  const claim = claimOrFail(queue, "worker-1");
  queue.failJob(claim, makeFailure(), { executor: "engine-runner" });

  const history = queue.getJobHistory(SCOPE_A, claim.jobId);
  assert.ok(history !== undefined);
  const event = history.find((entry) => entry.type === "attempt-failed");
  assert.ok(event !== undefined);
  assert.deepEqual(event.actor, { executor: "engine-runner", submittedBy: SUBMITTER });
});

test("cancelling a queued job records the reason and removes it from claimable work", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());

  const cancelled = queue.cancelJob(SCOPE_A, record.id, "operator requested stop", "studio-operator");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(queue.claimNextRunnable({ workerId: "worker-1" }), null);

  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  const event = history.find((entry) => entry.type === "cancelled");
  assert.ok(event !== undefined);
  assert.equal(event.reason, "operator requested stop");
  assert.deepEqual(event.cancelledBy, { executor: "studio-operator", submittedBy: SUBMITTER });
});

test("cancellation fails closed for running and terminal jobs, and hides foreign jobs", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());
  const claim = claimOrFail(queue, "worker-1");

  assert.throws(
    () => queue.cancelJob(SCOPE_A, record.id, "no", "operator"),
    (error: unknown) => error instanceof JobQueueError && error.code === "job-not-cancellable",
    "running jobs are failed by their holder or reclaimed — not cancelled",
  );

  queue.completeJob(claim, { outputArtifactRefs: [], durationMs: 0 });
  assert.throws(
    () => queue.cancelJob(SCOPE_A, record.id, "no", "operator"),
    (error: unknown) => error instanceof JobQueueError && error.code === "job-not-cancellable",
    "terminal jobs are immutable",
  );

  const foreign = queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("foreign"),
      scope: SCOPE_B,
      inputArtifactRefs: [makeArtifactRef(1, TENANT_B)],
    }),
  );
  assert.throws(
    () => queue.cancelJob(SCOPE_A, foreign.id, "no", "operator"),
    (error: unknown) =>
      error instanceof JobQueueError
      && error.code === "unknown-job"
      && !error.message.includes(SCOPE_B.tenantId as string),
    "foreign cancellation is indistinguishable from unknown (no existence leak)",
  );
});

test("a cancelled backoff-waiting retry can no longer be claimed", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock });
  enqueueRetriable(queue, 3, [10_000]);
  const claim = claimOrFail(queue, "worker-1");
  queue.failJob(claim, makeFailure({ retriable: true, terminalStatus: "failed" }));

  const record = queue.listJobs({ tenantId: SCOPE_A.tenantId })[0];
  assert.ok(record !== undefined);
  queue.cancelJob(SCOPE_A, record.id, "abandoned", "operator");

  clock.advance(60_000);
  assert.equal(queue.claimNextRunnable({ workerId: "worker-9" }), null);
});
