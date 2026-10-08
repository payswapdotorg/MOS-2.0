/**
 * W9-B adversarial regression probes — durable jobs + notification plane.
 *
 * Attack probes against the JOBS-001/NOTIFY-001 surfaces:
 *
 *  - hostile id factories (the W3-A branch-bleed class): tenant ids and
 *    client job keys / dedup keys containing the OLD ":" key delimiter
 *    must not alias another tenant's records — the pre-fix `${tenant}:${id}`
 *    concatenation let a hostile tenant id like "tenant:a:b" OVERWRITE the
 *    honest tenant's (tenant, jobKey) idempotency index entry, silently
 *    breaking enqueue dedup (a duplicate submission would execute TWICE).
 *    These probes are the pinning tests for the JSON-array composite keys;
 *  - double-claim/lease discipline under hostile claim refs (stale token,
 *    foreign tenant) — spot-pins over the pinned core tests;
 *  - retry-storm cap: maxAttempts bounds attempts even under repeated
 *    failure (dead-letter terminal, no infinite retry);
 *  - notification dedup idempotency under hostile delimiters;
 *  - prototype-pollution resistance: __proto__-carrying payloads never
 *    touch Object.prototype and never enter the stores.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FIXED_CLOCK,
  SCOPE_A,
  createFakeClock,
  makeArtifactRef,
  makeSubmission,
  tenantId,
  jobKeyOf,
} from "../testing/job-fixtures.js";
import {
  RECIPIENT_A,
  makeNotificationSubmission,
  makeNotificationStack,
  dedupKeyOf,
} from "../testing/notification-fixtures.js";
import { createInMemoryNotificationStore } from "./in-memory-notification-store.js";
import { createDurableJobQueue } from "./durable-job-queue.js";
import { createInMemoryDurableJobStore } from "./in-memory-durable-job-store.js";
import type { TenantScope } from "@mos/contracts";

const scopeOf = (value: string): TenantScope => ({
  tenantId: tenantId(value),
});

function makeStoreQueue() {
  const fake = createFakeClock();
  let counter = 0;
  return createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock: FIXED_CLOCK,
    now: () => fake.now(),
    leaseDurationMs: 60_000,
    jobIdFactory: () => `job-${(counter += 1)}`,
    leaseTokenFactory: () => `lease-${counter}`,
  });
}

// ---------------------------------------------------------------------------
// Hostile id factories vs the (tenant, jobKey) idempotency index
// ---------------------------------------------------------------------------

test("W9-B probe: a hostile tenant id containing ':' cannot alias the honest tenant's job-key idempotency", () => {
  const queue = makeStoreQueue();

  // The honest tenant enqueues a job whose CLIENT key contains ':'.
  const honest = queue.enqueue(
    makeSubmission({ scope: scopeOf("tenant:a"), jobKey: jobKeyOf("b:c") }),
  );

  // The attack: a hostile tenant id that concatenates into the same
  // composite key enqueues its own job under the SUFFIX key.
  const hostile = queue.enqueue(
    makeSubmission({
      scope: scopeOf("tenant:a:b"),
      jobKey: jobKeyOf("c"),
      inputArtifactRefs: [makeArtifactRef(1, tenantId("tenant:a:b"))],
    }),
  );
  assert.notEqual(honest.id, hostile.id, "two distinct jobs exist");

  // Each tenant's dedup read returns ITS OWN record.
  const honestRead = queue.getJobByKey(scopeOf("tenant:a"), jobKeyOf("b:c"));
  const hostileRead = queue.getJobByKey(scopeOf("tenant:a:b"), jobKeyOf("c"));
  assert.ok(honestRead !== undefined);
  assert.ok(hostileRead !== undefined);
  assert.equal(honestRead.id, honest.id);
  assert.equal(hostileRead.id, hostile.id);

  // CRITICAL: the honest tenant's resubmit of the SAME key is still
  // deduped (the hostile write must not have evicted the index entry).
  const resubmit = queue.enqueue(
    makeSubmission({ scope: scopeOf("tenant:a"), jobKey: jobKeyOf("b:c") }),
  );
  assert.equal(resubmit.id, honest.id, "idempotency survives the hostile neighbor");
  assert.equal(queue.listJobs({ tenantId: tenantId("tenant:a") }).length, 1);
  assert.equal(queue.listJobs({ tenantId: tenantId("tenant:a:b") }).length, 1);
});

test("W9-B probe: a hostile tenant id cannot read or claim another tenant's job history", () => {
  const queue = makeStoreQueue();
  const honest = queue.enqueue(
    makeSubmission({ scope: scopeOf("tenant:a"), jobKey: jobKeyOf("honest-1") }),
  );
  const hostile = queue.enqueue(
    makeSubmission({
      scope: scopeOf("tenant:a:job-1"),
      jobKey: jobKeyOf("hostile-1"),
      inputArtifactRefs: [makeArtifactRef(1, tenantId("tenant:a:job-1"))],
    }),
  );
  void hostile;

  // History reads stay scoped: the composite-key forgery sees nothing.
  assert.equal(queue.getJobHistory(scopeOf("tenant:a:job-1"), honest.id), undefined);
  assert.ok(queue.getJobHistory(scopeOf("tenant:a"), honest.id) !== undefined);

  // Claims stay scoped: the hostile tenant's worker cannot claim the
  // honest tenant's queued job.
  const hostileClaim = queue.claimNextRunnable({
    tenantId: tenantId("tenant:a:job-1"),
    workerId: "hostile-worker",
  });
  assert.ok(hostileClaim === null || hostileClaim.job.scope.tenantId !== tenantId("tenant:a"));
});

test("W9-B probe: double-claim discipline holds under a forged lease token and foreign tenant", () => {
  const queue = makeStoreQueue();
  const record = queue.enqueue(makeSubmission({ scope: SCOPE_A }));
  const claim = queue.claimNextRunnable({ tenantId: SCOPE_A.tenantId, workerId: "worker-1" });
  assert.ok(claim !== null && claim.jobId === record.id);

  // A second claimer gets nothing (the lease is held).
  const second = queue.claimNextRunnable({ tenantId: SCOPE_A.tenantId, workerId: "worker-2" });
  assert.equal(second, null);

  // Forged completion with a wrong lease token fails closed.
  assert.throws(
    () =>
      queue.completeJob(
        { scope: SCOPE_A, jobId: record.id, leaseToken: "lease-forged" as never },
        {
          outputArtifactRefs: [],
          durationMs: 1,
        },
      ),
  );
});

test("W9-B probe: repeated failures cap at maxAttempts — no retry storm, terminal dead-letter", () => {
  const queue = makeStoreQueue();
  const record = queue.enqueue(
    makeSubmission({
      retryPolicy: { maxAttempts: 3, backoffScheduleMs: [0, 0] },
    }),
  );
  const failure = {
    code: "engine-invocation-error",
    message: "simulated",
    retriable: true,
    terminalStatus: "failed",
  } as const;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const claim = queue.claimNextRunnable({
      tenantId: SCOPE_A.tenantId,
      workerId: "storm-worker",
    });
    if (claim === null) {
      break;
    }
    queue.failJob(
      { scope: SCOPE_A, jobId: record.id, leaseToken: claim.leaseToken },
      failure,
    );
  }
  const deadLetters = queue.listJobs({
    tenantId: SCOPE_A.tenantId,
    statuses: ["dead_lettered"],
  });
  assert.equal(deadLetters.length, 1);
  assert.equal(deadLetters[0]?.id, record.id);
  assert.equal(deadLetters[0]?.attemptCount, 3, "exactly maxAttempts attempts ran");
  // Nothing left to claim — the storm is bounded.
  assert.equal(
    queue.claimNextRunnable({ tenantId: SCOPE_A.tenantId, workerId: "any" }),
    null,
  );
});

// ---------------------------------------------------------------------------
// Notification dedup under hostile delimiters
// ---------------------------------------------------------------------------

test("W9-B probe: a hostile tenant id containing ':' cannot alias the notification dedup index", () => {
  const stack = makeNotificationStack();
  const honest = stack.plane.enqueue(
    makeNotificationSubmission({
      scope: scopeOf("tenant:a"),
      dedupKey: dedupKeyOf("task:x"),
    }),
  );
  const hostile = stack.plane.enqueue(
    makeNotificationSubmission({
      scope: scopeOf("tenant:a:task"),
      dedupKey: dedupKeyOf("x"),
      subject: {
        artifactRefs: [makeArtifactRef(1, tenantId("tenant:a:task"))],
        taskRefs: ["task:shoot-hostile"],
        missionRefs: ["mission:hostile"],
      },
    }),
  );
  assert.notEqual(honest.id, hostile.id);

  // Each tenant reads its own record by dedup key.
  assert.ok(stack.plane.getNotification(scopeOf("tenant:a"), honest.id) !== undefined);
  assert.ok(stack.plane.getNotification(scopeOf("tenant:a:task"), hostile.id) !== undefined);

  // Dedup still works inside each tenant after the hostile neighbor wrote.
  const resubmit = stack.plane.enqueue(
    makeNotificationSubmission({
      scope: scopeOf("tenant:a"),
      dedupKey: dedupKeyOf("task:x"),
    }),
  );
  assert.equal(resubmit.id, honest.id, "duplicate submit returns the existing record");
  assert.equal(
    stack.plane.listNotifications({ scope: scopeOf("tenant:a") }).length,
    1,
  );
  assert.equal(
    stack.plane.listNotifications({ scope: scopeOf("tenant:a:task") }).length,
    1,
  );
});

test("W9-B probe: notification store finds receipts only in the owning tenant scope", () => {
  const store = createInMemoryNotificationStore();
  const receipt = {
    id: "receipt-1",
    scope: scopeOf("tenant:a"),
    notificationId: "notification-1",
    attempt: 1,
    recipient: RECIPIENT_A,
    deliveredAt: FIXED_CLOCK(),
    providerId: "provider:double",
    providerAckRef: null,
    transportLabel: "double",
  };
  store.saveReceipt(receipt as never);

  // The owning tenant resolves the receipt...
  assert.ok(
    store.findReceiptById(scopeOf("tenant:a"), "receipt-1" as never) !== undefined,
  );
  // ...a foreign tenant with a delimiter-laden id (the OLD `${tenant}:${id}`
  // receiptsById key was injectable by exactly this shape) resolves nothing.
  assert.equal(
    store.findReceiptById(scopeOf("tenant:a:receipt-1"), "receipt-1" as never),
    undefined,
  );
  assert.equal(
    store.findReceiptById(scopeOf("tenant"), "a:receipt-1" as never),
    undefined,
  );
  // And receipt listing stays scoped per (tenant, notification).
  assert.equal(store.listReceiptsByNotification(scopeOf("tenant:a"), "notification-1" as never)?.length, 1);
  assert.equal(store.listReceiptsByNotification(scopeOf("tenant:a:notification-1"), "notification-1" as never), undefined);
});

// ---------------------------------------------------------------------------
// Prototype-pollution resistance
// ---------------------------------------------------------------------------

test("W9-B probe: __proto__-carrying submissions never pollute Object.prototype", () => {
  const queue = makeStoreQueue();
  const hostile = makeSubmission();
  Object.defineProperty(hostile, "__proto__", {
    value: { pollute: "yes" },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const record = queue.enqueue(hostile);
  assert.ok(typeof record.id === "string");
  assert.equal(({} as { pollute?: string }).pollute, undefined);
  // The store's own records stay clean of inherited junk.
  const read = queue.getJobByKey(SCOPE_A, record.jobKey);
  assert.ok(read !== undefined);
  assert.equal((read as { pollute?: string }).pollute, undefined);
});
