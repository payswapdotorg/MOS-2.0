/**
 * Durable job queue core tests (JOBS-001): enqueue idempotency, claim
 * lease semantics (two claimers, one wins), heartbeats, crash recovery
 * via lease expiry, completion, and fail-closed mutation guards.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { JobQueueError } from "../domain/errors.js";
import type { DurableJobEnqueuedEvent } from "../contracts/job-events.js";
import type { LeaseToken } from "../contracts/ids.js";
import type { JobClaimRef } from "../ports/job-queue.port.js";
import {
  FIXED_CLOCK,
  SCOPE_A,
  SCOPE_B,
  TENANT_B,
  createFakeClock,
  jobKeyOf,
  makeArtifactRef,
  makeFailure,
  makeQueue,
  makeSubmission,
  tenantId,
} from "../testing/job-fixtures.js";

const SUBMITTER = { kind: "service", name: "studio-runtime" };

test("enqueue creates the queued record and the enqueued event with the full vocabulary", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());

  assert.equal(record.status, "queued");
  assert.equal(record.attemptCount, 0);
  assert.equal(record.kind, "rendering");
  assert.equal(record.jobKey, "render-episode-42");
  assert.deepEqual(record.submittedBy, SUBMITTER);
  assert.deepEqual(record.input.inputArtifactRefs, [makeArtifactRef(1), makeArtifactRef(2)]);
  assert.deepEqual(record.input.parameters, { quality: "high" });
  assert.deepEqual(record.retryPolicy, { maxAttempts: 1, backoffScheduleMs: [] });
  assert.equal(record.createdAt, FIXED_CLOCK());
  assert.equal(record.updatedAt, FIXED_CLOCK());
  assert.equal(record.lease, null);
  assert.equal(record.nextAttemptAtMs, null);

  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  assert.equal(history.length, 1);
  const event = history[0] as DurableJobEnqueuedEvent | undefined;
  assert.ok(event !== undefined);
  assert.equal(event.type, "enqueued");
  assert.equal(event.jobKey, "render-episode-42");
  assert.equal(event.kind, "rendering");
  assert.equal(event.maxAttempts, 1);
  assert.deepEqual(event.actor, { executor: "job-queue", submittedBy: SUBMITTER });
});

test("duplicate job key returns the EXISTING record — no second event, no double execution", () => {
  const queue = makeQueue();
  const first = queue.enqueue(makeSubmission());
  const second = queue.enqueue(makeSubmission({ parameters: { quality: "changed" } }));

  assert.equal(second.id, first.id);
  assert.equal(second.updatedAt, first.updatedAt);
  assert.deepEqual(second.input.parameters, first.input.parameters);

  const history = queue.getJobHistory(SCOPE_A, first.id);
  assert.ok(history !== undefined);
  assert.equal(history.length, 1, "idempotent re-submit must not append events");

  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);
  assert.equal(claim.jobId, first.id);
  assert.equal(queue.claimNextRunnable({ workerId: "worker-2" }), null, "single job runs once");
});

test("the idempotency key is tenant-scoped: the same key in another tenant is a different job", () => {
  const queue = makeQueue();
  const a = queue.enqueue(makeSubmission());
  const b = queue.enqueue(
    makeSubmission({ scope: SCOPE_B, inputArtifactRefs: [makeArtifactRef(1, TENANT_B)] }),
  );

  assert.notEqual(a.id, b.id);
  assert.equal(queue.getJob(SCOPE_B, a.id), undefined);
  assert.equal(queue.getJob(SCOPE_A, b.id), undefined);
});

test("invalid submissions fail closed with named reasons (frozen vocabulary guards)", () => {
  const queue = makeQueue();

  const cases: Array<[string, Record<string, unknown>]> = [
    ["empty jobKey", { jobKey: "" }],
    ["bad kind", { kind: "cron-cleanup" }],
    ["bad contract version", { contractVersion: 0 }],
    ["bad submitter", { submittedBy: { kind: "mystery" } }],
    ["bad parameters", { parameters: ["not", "an", "object"] }],
    ["bad retry policy", { retryPolicy: { maxAttempts: 0, backoffScheduleMs: [] } }],
    ["foreign-tenant artifact ref", { inputArtifactRefs: [makeArtifactRef(1, TENANT_B)] }],
  ];
  for (const [label, overrides] of cases) {
    assert.throws(
      () => queue.enqueue(makeSubmission(overrides)),
      (error: unknown) =>
        error instanceof JobQueueError
        && error.code === "invalid-job-submission"
        && error.details.violations !== undefined,
      `submission with ${label} must fail closed`,
    );
  }

  const missingRef = makeSubmission();
  delete (missingRef.inputArtifactRefs[0] as unknown as Partial<Record<string, unknown>>).digest;
  assert.throws(
    () => queue.enqueue(missingRef),
    (error: unknown) =>
      error instanceof JobQueueError
      && (error.details.violations as string[]).some((violation) => violation.includes("digest")),
    "an input ref missing a frozen ArtifactRef field must fail closed",
  );
});

test("claim grants a lease: running status, attempt 1, FIFO order, claim event", () => {
  const queue = makeQueue();
  const first = queue.enqueue(makeSubmission());
  queue.enqueue(makeSubmission({ jobKey: jobKeyOf("second") }));

  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);
  assert.equal(claim.jobId, first.id, "FIFO: the first-enqueued job claims first");
  assert.equal(claim.job.status, "running");
  assert.equal(claim.attempt, 1);
  assert.equal(claim.workerId, "worker-1");
  assert.ok(typeof claim.leaseToken === "string" && claim.leaseToken.length > 0);
  assert.ok(claim.leaseExpiresAtMs > 0);
  assert.ok(claim.job.lease !== null);
  assert.equal(claim.job.attemptCount, 1);

  const history = queue.getJobHistory(SCOPE_A, claim.jobId);
  assert.ok(history !== undefined);
  const claimEvent = history.find((event) => event.type === "claim");
  assert.ok(claimEvent !== undefined);
  assert.deepEqual(claimEvent.actor, { executor: "worker-1", submittedBy: SUBMITTER });
});

test("two claimers, one wins each job: the second claimer gets the OTHER job, then nothing", () => {
  const queue = makeQueue();
  const first = queue.enqueue(makeSubmission());
  const second = queue.enqueue(makeSubmission({ jobKey: jobKeyOf("second") }));

  const claimA = queue.claimNextRunnable({ workerId: "worker-A" });
  const claimB = queue.claimNextRunnable({ workerId: "worker-B" });
  assert.ok(claimA !== null && claimB !== null);
  assert.notEqual(claimA.jobId, claimB.jobId);
  assert.deepEqual([claimA.jobId, claimB.jobId].sort(), [first.id, second.id].sort());
  assert.equal(queue.claimNextRunnable({ workerId: "worker-C" }), null);

  // The same job can NEVER be claimed twice concurrently.
  const again = queue.claimNextRunnable({ workerId: "worker-D" });
  assert.ok(again === null || again.jobId !== claimA.jobId);
});

test("claim honors tenant and kind filters", () => {
  const queue = makeQueue();
  const render = queue.enqueue(makeSubmission({ jobKey: jobKeyOf("render-1") }));
  queue.enqueue(makeSubmission({ jobKey: jobKeyOf("lab-1"), kind: "lab-run" }));
  queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("other-tenant"),
      scope: SCOPE_B,
      inputArtifactRefs: [makeArtifactRef(1, TENANT_B)],
    }),
  );

  const renderClaim = queue.claimNextRunnable({ workerId: "w", kinds: ["rendering"] });
  assert.ok(renderClaim !== null);
  assert.equal(renderClaim.jobId, render.id);

  const tenantClaim = queue.claimNextRunnable({ workerId: "w", tenantId: TENANT_B });
  assert.ok(tenantClaim !== null);
  assert.equal(tenantClaim.job.scope.tenantId, TENANT_B);
});

test("heartbeat renews the lease; a stale token or an expired lease fails closed", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock, leaseDurationMs: 1_000 });
  queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  clock.advance(500);
  const renewed = queue.renewLease(claim);
  assert.ok(renewed !== null);
  assert.ok(renewed.leaseExpiresAtMs > claim.leaseExpiresAtMs);
  const history = queue.getJobHistory(SCOPE_A, claim.jobId);
  assert.ok(history !== undefined);
  assert.ok(history.some((event) => event.type === "lease-renewed"));

  const stale: JobClaimRef = { ...claim, leaseToken: "lease-forged" as LeaseToken };
  assert.throws(
    () => queue.renewLease(stale),
    (error: unknown) => error instanceof JobQueueError && error.code === "stale-lease",
  );

  clock.advance(renewed.leaseExpiresAtMs + 1);
  assert.throws(
    () => queue.renewLease(renewed),
    (error: unknown) => error instanceof JobQueueError && error.code === "lease-expired",
  );
});

test("lease expiry makes the job claimable again (crash recovery) and invalidates the stale claim", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock, leaseDurationMs: 1_000 });
  queue.enqueue(makeSubmission());
  const first = queue.claimNextRunnable({ workerId: "crashed-worker" });
  assert.ok(first !== null);

  clock.advance(2_000);
  const reclaimed = queue.claimNextRunnable({ workerId: "recovery-worker" });
  assert.ok(reclaimed !== null);
  assert.equal(reclaimed.jobId, first.jobId);
  assert.equal(reclaimed.attempt, 2, "the crashed attempt and the recovery attempt are distinct");
  assert.equal(reclaimed.job.attemptCount, 2);

  const history = queue.getJobHistory(SCOPE_A, first.jobId);
  assert.ok(history !== undefined);
  const expired = history.find((event) => event.type === "lease-expired");
  assert.ok(expired !== undefined);
  assert.deepEqual(expired.actor, { executor: "crashed-worker", submittedBy: SUBMITTER });

  assert.throws(
    () => queue.completeJob(first, { outputArtifactRefs: [], durationMs: 0 }),
    (error: unknown) => error instanceof JobQueueError && error.code === "stale-lease",
    "the crashed worker's old token is not authorized once the job is reclaimed",
  );
});

test("completeJob records §30 observability, releases the lease and ends the lifecycle", () => {
  const queue = makeQueue();
  queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  const completed = queue.completeJob(claim, {
    runId: "engine-run-7",
    outputArtifactRefs: [makeArtifactRef(9)],
    durationMs: 1234,
    cost: { amount: 2, currency: "USD" },
    resourceUsage: { cpuCoreSeconds: 3, gpuUnitSeconds: 1, memoryMbSeconds: 100 },
    warnings: [{ code: "slow-step", message: "over p95" }],
    provenance: null,
  });

  assert.equal(completed.status, "succeeded");
  assert.equal(completed.lease, null);
  assert.equal(completed.observability?.runId, "engine-run-7");
  assert.equal(completed.observability?.durationMs, 1234);
  assert.deepEqual(completed.observability?.cost, { amount: 2, currency: "USD" });
  assert.deepEqual(completed.observability?.warnings, [{ code: "slow-step", message: "over p95" }]);
  assert.deepEqual(completed.observability?.outputArtifactRefs, [makeArtifactRef(9)]);
  assert.equal(completed.run.workerId, "worker-1");

  const history = queue.getJobHistory(SCOPE_A, completed.id);
  assert.ok(history !== undefined);
  const success = history.find((event) => event.type === "attempt-succeeded");
  assert.ok(success !== undefined);
  assert.deepEqual(success.actor, { executor: "worker-1", submittedBy: SUBMITTER });

  assert.equal(queue.claimNextRunnable({ workerId: "worker-2" }), null, "never re-runs");
});

test("claim-held mutations fail closed: unknown job, stale lease, non-running", () => {
  const queue = makeQueue();
  queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);

  const foreign: JobClaimRef = { scope: SCOPE_B, jobId: claim.jobId, leaseToken: claim.leaseToken };
  assert.throws(
    () => queue.completeJob(foreign, { outputArtifactRefs: [], durationMs: 0 }),
    (error: unknown) => error instanceof JobQueueError && error.code === "unknown-job",
  );

  const stale: JobClaimRef = { ...claim, leaseToken: "lease-forged" as LeaseToken };
  assert.throws(
    () => queue.completeJob(stale, { outputArtifactRefs: [], durationMs: 0 }),
    (error: unknown) => error instanceof JobQueueError && error.code === "stale-lease",
  );

  const completed = queue.completeJob(claim, { outputArtifactRefs: [], durationMs: 0 });
  assert.equal(completed.status, "succeeded");
  assert.throws(
    () => queue.completeJob(claim, { outputArtifactRefs: [], durationMs: 0 }),
    (error: unknown) => error instanceof JobQueueError && error.code === "job-not-running",
    "terminal jobs are immutable",
  );
});

test("records and events are deep-frozen (append-only by construction)", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());
  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);
  queue.completeJob(claim, { outputArtifactRefs: [], durationMs: 0 });

  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.input));
  assert.ok(Object.isFrozen(record.input.inputArtifactRefs[0]));
  const history = queue.getJobHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  for (const event of history) {
    assert.ok(Object.isFrozen(event), "every event is frozen");
  }
  assert.throws(() => {
    (record as { status: string }).status = "succeeded";
  }, TypeError);
});

test("the store takes ownership: caller payloads are cloned, never frozen or mutated", () => {
  const queue = makeQueue();
  const submission = makeSubmission({ jobKey: jobKeyOf("caller-owned") });
  const record = queue.enqueue(submission);

  // The caller keeps mutable ownership of everything it submitted…
  assert.ok(!Object.isFrozen(submission));
  assert.ok(!Object.isFrozen(submission.inputArtifactRefs));
  assert.ok(!Object.isFrozen(submission.inputArtifactRefs[0]));
  // …while the durable record is an independent frozen copy.
  assert.ok(Object.isFrozen(record));
  assert.notEqual(record.input.inputArtifactRefs[0], submission.inputArtifactRefs[0]);

  const claim = queue.claimNextRunnable({ workerId: "worker-1" });
  assert.ok(claim !== null);
  const failure = makeFailure({ retriable: false });
  const failed = queue.failJob(claim, failure);
  assert.ok(!Object.isFrozen(failure), "the caller's typed failure stays mutable");
  assert.deepEqual(failed.failure, failure);
  assert.ok(Object.isFrozen(failed.failure), "the record's failure copy is frozen");
});

test("machine ids and lease tokens come from the injectable factories", () => {
  const queue = makeQueue();
  const first = queue.enqueue(makeSubmission());
  const second = queue.enqueue(makeSubmission({ jobKey: jobKeyOf("another") }));
  assert.notEqual(first.id, second.id);
  assert.match(first.id as string, /^job-\d+$/);

  const claim = queue.claimNextRunnable({ workerId: "w" });
  assert.ok(claim !== null);
  assert.match(claim.leaseToken as string, /^lease-[a-z]+$/);
});

test("getJobByKey serves idempotency reads within scope only", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());
  assert.equal(queue.getJobByKey(SCOPE_A, record.jobKey)?.id, record.id);
  assert.equal(queue.getJobByKey(SCOPE_B, record.jobKey), undefined);
});

test("tenant-scoped reads use the importing module's tenant id type", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());
  assert.ok(queue.getJob({ tenantId: tenantId("tenant:a") }, record.id) !== undefined);
  assert.ok(queue.getJob({ tenantId: tenantId("tenant:zzz") }, record.id) === undefined);
});

test("DurableJobRecord field set is pinned (frozen contract vocabulary)", () => {
  const queue = makeQueue();
  const record = queue.enqueue(makeSubmission());
  const fields = Object.keys(record).sort();
  assert.deepEqual(fields, [
    "attemptCount",
    "contractVersion",
    "createdAt",
    "deadLetteredAt",
    "failure",
    "id",
    "input",
    "jobKey",
    "kind",
    "lease",
    "nextAttemptAtMs",
    "observability",
    "retryPolicy",
    "run",
    "scope",
    "status",
    "submittedBy",
    "updatedAt",
  ]);
});
