/**
 * Tenant isolation + vocabulary pin tests (JOBS-001): no existence leaks
 * across tenants (§31), workspace narrowing, the §26 kind vocabulary and
 * lifecycle status vocabulary pinned, and the port method surfaces pinned
 * against drift (policy budget ≤ 12).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DURABLE_JOB_KINDS,
  DURABLE_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
} from "../contracts/durable-job.js";
import { DURABLE_JOB_EVENT_TYPES } from "../contracts/job-events.js";
import { createInMemoryDurableJobStore } from "./in-memory-durable-job-store.js";
import type { JobQueuePort } from "../ports/job-queue.port.js";
import type { DurableJobStorePort } from "../ports/durable-job-store.port.js";
import {
  SCOPE_A,
  SCOPE_B,
  TENANT_A,
  TENANT_B,
  createFakeClock,
  jobKeyOf,
  makeArtifactRef,
  makeQueue,
  makeSubmission,
  tenantId,
  workspaceIdOf,
} from "../testing/job-fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Tests run from dist/: the port SOURCES live two levels up. */
const srcRoot = join(here, "../../src");

test("tenant isolation: reads never leak existence across tenants (§31)", () => {
  const queue = makeQueue();
  const a = queue.enqueue(makeSubmission());
  const b = queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("b"),
      scope: SCOPE_B,
      inputArtifactRefs: [makeArtifactRef(1, TENANT_B)],
    }),
  );

  // Foreign get is indistinguishable from unknown.
  assert.equal(queue.getJob(SCOPE_B, a.id), undefined);
  assert.equal(queue.getJob(SCOPE_A, b.id), undefined);
  assert.equal(queue.getJob(SCOPE_A, "job-does-not-exist" as never), undefined);

  // Foreign history is indistinguishable from unknown.
  assert.equal(queue.getJobHistory(SCOPE_B, a.id), undefined);
  assert.equal(queue.getJobByKey(SCOPE_B, a.jobKey), undefined);

  // Lists are scoped: no cross-tenant rows.
  assert.deepEqual(
    queue.listJobs({ tenantId: TENANT_A }).map((job) => job.id),
    [a.id],
  );
  assert.deepEqual(
    queue.listJobs({ tenantId: TENANT_B }).map((job) => job.id),
    [b.id],
  );
});

test("tenant isolation: one tenant's claims never see the other tenant's queued work", () => {
  const queue = makeQueue();
  queue.enqueue(makeSubmission());
  queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("b"),
      scope: SCOPE_B,
      inputArtifactRefs: [makeArtifactRef(1, TENANT_B)],
    }),
  );

  const claimA = queue.claimNextRunnable({ workerId: "w", tenantId: TENANT_A });
  const claimB = queue.claimNextRunnable({ workerId: "w", tenantId: TENANT_B });
  assert.ok(claimA !== null && claimB !== null);
  assert.equal(claimA.job.scope.tenantId, TENANT_A);
  assert.equal(claimB.job.scope.tenantId, TENANT_B);
  assert.notEqual(claimA.jobId, claimB.jobId);
});

test("workspace narrowing: a workspace query only sees same-workspace records", () => {
  const queue = makeQueue();
  const tenantWide = queue.enqueue(makeSubmission());
  const workspace1 = queue.enqueue(
    makeSubmission({ jobKey: jobKeyOf("ws1"), scope: { tenantId: TENANT_A, workspaceId: workspaceIdOf("ws-1") } }),
  );
  void workspace1;

  const tenantWideVisible = queue.listJobs({ tenantId: TENANT_A });
  assert.equal(tenantWideVisible.length, 2, "tenant-wide queries see all tenant records");

  const ws1 = queue.listJobs({ tenantId: TENANT_A, workspaceId: workspaceIdOf("ws-1") });
  assert.equal(ws1.length, 1);
  assert.equal(ws1[0]?.jobKey, jobKeyOf("ws1"));

  assert.equal(
    queue.getJob({ tenantId: TENANT_A, workspaceId: workspaceIdOf("ws-2") }, tenantWide.id),
    undefined,
    "a workspace-scoped get cannot see tenant-wide records",
  );
});

test("the §26 job-kind vocabulary is exactly the frozen six", () => {
  assert.deepEqual([...DURABLE_JOB_KINDS], [
    "lab-run",
    "media-processing",
    "engine-execution",
    "rendering",
    "studio-processing",
    "benchmark",
  ]);
});

test("the lifecycle status vocabulary is the §26 terminal set + queued/running + dead-letter", () => {
  assert.deepEqual([...DURABLE_JOB_STATUSES], [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
    "dead_lettered",
  ]);
  assert.deepEqual([...TERMINAL_JOB_STATUSES], [
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
    "dead_lettered",
  ]);
});

test("the event vocabulary covers every lifecycle transition", () => {
  assert.deepEqual([...DURABLE_JOB_EVENT_TYPES], [
    "enqueued",
    "claim",
    "lease-renewed",
    "lease-expired",
    "attempt-succeeded",
    "retry-scheduled",
    "attempt-failed",
    "attempt-timed-out",
    "dead-lettered",
    "cancelled",
  ]);
});

test("port method surfaces are pinned (policy budget ≤ 12 per port)", () => {
  const queueMethods = Object.keys(makeQueue() as unknown as Record<string, unknown>).sort();
  assert.deepEqual(queueMethods, [
    "cancelJob",
    "claimNextRunnable",
    "completeJob",
    "enqueue",
    "failJob",
    "getJob",
    "getJobByKey",
    "getJobHistory",
    "listJobs",
    "renewLease",
  ]);
  assert.ok(queueMethods.length <= 12, "JobQueuePort ≤ 12 methods");

  // The PORT type declarations carry exactly those methods (source pin).
  const portSource = readFileSync(join(srcRoot, "ports/job-queue.port.ts"), "utf8");
  const declared = [...portSource.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1] as string);
  assert.deepEqual([...new Set(declared)].sort(), queueMethods);
  assert.ok(declared.length <= 12);

  const storeSource = readFileSync(join(srcRoot, "ports/durable-job-store.port.ts"), "utf8");
  const storeMethods = [...storeSource.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1] as string);
  assert.deepEqual(storeMethods.sort(), [
    "appendJobEvent",
    "findClaimableJobs",
    "findJobById",
    "findJobByKey",
    "listJobEvents",
    "listJobs",
    "saveJob",
  ]);
  assert.ok(storeMethods.length <= 12, "DurableJobStorePort ≤ 12 methods");

  // Type-level: the adapters satisfy the port interfaces.
  const queueAsPort: JobQueuePort = makeQueue();
  const storeAsPort: DurableJobStorePort = createInMemoryDurableJobStore();
  void queueAsPort;
  void storeAsPort;
});

test("records from one tenant keep working after another tenant's activity (no bleed)", () => {
  const clock = createFakeClock();
  const queue = makeQueue({ clock });
  const a = queue.enqueue(makeSubmission());
  queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("b"),
      scope: SCOPE_B,
      inputArtifactRefs: [makeArtifactRef(1, TENANT_B)],
    }),
  );
  queue.enqueue(
    makeSubmission({
      jobKey: jobKeyOf("c"),
      scope: SCOPE_B,
      inputArtifactRefs: [makeArtifactRef(1, TENANT_B)],
    }),
  );

  const claim = queue.claimNextRunnable({ workerId: "w", tenantId: TENANT_A });
  assert.ok(claim !== null);
  assert.equal(claim.jobId, a.id);
  const completed = queue.completeJob(claim, { outputArtifactRefs: [], durationMs: 1 });
  assert.equal(completed.status, "succeeded");
  assert.equal(queue.claimNextRunnable({ workerId: "w", tenantId: TENANT_A }), null);

  const bClaims = queue.claimNextRunnable({ workerId: "w", tenantId: TENANT_B });
  assert.ok(bClaims !== null);
  assert.equal(queue.listJobs({ tenantId: tenantId("tenant:zzz") }).length, 0);
});
