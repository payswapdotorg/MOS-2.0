/**
 * Fail-closed claim guards (JOBS-001) — pure-ish domain logic.
 *
 * The typed gates every claim-held mutation passes: the job must exist IN
 * THE REQUESTING SCOPE (foreign ≡ unknown — no existence leaks, §31) and
 * the claim must be the job's LIVE lease (status running + matching token
 * + not expired). Violations are typed `JobQueueError`s, never silent
 * behavior.
 */

import type { TenantScope } from "@mos/contracts";

import type { DurableJobRecord } from "../contracts/durable-job.js";
import type { DurableJobId } from "../contracts/ids.js";
import type { JobClaimRef } from "../ports/job-queue.port.js";
import type { DurableJobStorePort } from "../ports/durable-job-store.port.js";
import { JobQueueError } from "./errors.js";

/** Resolves one job in scope; foreign/unknown both fail as `unknown-job`. */
export function requireJob(
  store: DurableJobStorePort,
  scope: TenantScope,
  jobId: DurableJobId,
): DurableJobRecord {
  const record = store.findJobById(scope, jobId);
  if (record === undefined) {
    throw new JobQueueError(
      "unknown-job",
      `no durable job ${jobId as string} in the requesting scope`,
      { jobId: jobId as string },
    );
  }
  return record;
}

/** Valid lease-holder gate for complete/renew/fail: running + live token. */
export function requireLiveLease(
  record: DurableJobRecord,
  ref: JobClaimRef,
  now: () => number,
): void {
  if (record.status !== "running" || record.lease === null) {
    throw new JobQueueError(
      "job-not-running",
      `durable job ${record.id as string} is ${record.status}, not running under a claim`,
      { jobId: record.id as string, status: record.status },
    );
  }
  if (record.lease.token !== ref.leaseToken) {
    throw new JobQueueError(
      "stale-lease",
      `the lease token does not authorize mutations on job ${record.id as string}`,
      { jobId: record.id as string },
    );
  }
  if (now() >= record.lease.expiresAtMs) {
    throw new JobQueueError(
      "lease-expired",
      `the lease on job ${record.id as string} expired at ${record.lease.expiresAtMs}; the job is reclaimable`,
      { jobId: record.id as string, expiresAtMs: record.lease.expiresAtMs },
    );
  }
}
