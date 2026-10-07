/**
 * Disclosed clock-driven poller double tests (JOBS-001): manual timers
 * drive the poll loop, claims flow to the handler, and stopping halts.
 * The double exists to demonstrate the work-polling consumption model —
 * it is NEVER a scheduling authority (see no-scheduling-authority.test.ts).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createJobPollerDouble } from "./job-poller-double.js";
import type { JobPollerTimers } from "./job-poller-double.js";
import {
  SCOPE_A,
  TENANT_A,
  jobKeyOf,
  makeQueue,
  makeSubmission,
} from "../testing/job-fixtures.js";

interface ManualTimers extends JobPollerTimers {
  fire(): void;
}

function manualTimers(): ManualTimers {
  let callback: (() => void) | undefined;
  return {
    setInterval(cb: () => void): object {
      callback = cb;
      return { handle: true };
    },
    clearInterval(): void {
      callback = undefined;
    },
    fire(): void {
      callback?.();
    },
  };
}

test("the poller claims runnable work and hands it to the handler", async () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());
  const timers = manualTimers();
  const handled: string[] = [];

  const poller = createJobPollerDouble({
    queue,
    workerId: "poller-worker",
    tenantId: TENANT_A,
    intervalMs: 100,
    handler: (claim) => {
      handled.push(claim.jobId as string);
      queue.completeJob(claim, { outputArtifactRefs: [], durationMs: 0 });
    },
    timers,
  });

  assert.equal(poller.started, false);
  poller.start();
  assert.equal(poller.started, true);

  timers.fire();
  await Promise.resolve(); // let the async poll tick settle
  assert.deepEqual(handled, [record.id as string]);
  assert.equal(poller.pollCount, 1);
  assert.equal(queue.getJob(SCOPE_A, record.id)?.status, "succeeded");

  timers.fire();
  await Promise.resolve();
  assert.deepEqual(handled, [record.id as string], "completed work is not re-polled");
  assert.equal(poller.pollCount, 2);

  poller.stop();
  assert.equal(poller.started, false);
  timers.fire();
  assert.equal(poller.pollCount, 2, "stopped pollers never tick again");
});

test("an async handler is awaited; failed work stays claimable per the queue rules", async () => {
  const queue = makeQueue();
  const record = queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("flaky"),
      retryPolicy: { maxAttempts: 1, backoffScheduleMs: [] },
    }),
  );
  const timers = manualTimers();
  let attempts = 0;

  const poller = createJobPollerDouble({
    queue,
    workerId: "poller-worker",
    intervalMs: 10,
    handler: async (claim) => {
      attempts += 1;
      await Promise.resolve();
      queue.failJob(claim, {
        code: "engine-invocation-error",
        message: "simulated failure",
        retriable: true,
        terminalStatus: "failed",
      });
    },
    timers,
  });

  poller.start();
  timers.fire();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(attempts, 1);
  // maxAttempts 1: the retriable failure exhausted and dead-lettered.
  assert.equal(queue.getJob(SCOPE_A, record.id)?.status, "dead_lettered");
  assert.deepEqual(poller.claimed.map((claim) => claim.jobId), [record.id]);
  poller.stop();
});
