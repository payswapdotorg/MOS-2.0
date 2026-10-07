/**
 * JobQueuePort — the durable-job work-polling port (JOBS-001).
 *
 * The consumer surface of the durable-job authority (Studio and Lab are
 * registry dependents of `jobs`; these shapes are their stable surface).
 * It deliberately has NO scheduling authority: there is no cron, no HTTP
 * timer, no clock-driven dispatch — workers POLL for runnable work via
 * {@link claimNextRunnable}. Scheduling authority stays with the
 * submitting subsystems; the queue only makes submitted work durable,
 * claim-safe and retry-safe (§26: no synchronous HTTP / Hobby-Cron
 * scheduling authority).
 *
 * Semantics:
 * - enqueue is idempotent per (tenant, client jobKey): a duplicate submit
 *   returns the EXISTING record and never double-executes;
 * - claimNextRunnable grants a LEASE (token + expiry): two claimers can
 *   never hold the same job; a claim-holder renews via renewLease
 *   (heartbeat); an expired lease makes the job claimable again (crash
 *   recovery) and invalidates the stale claim's mutations;
 * - complete/fail/cancel carry typed reasons; failures are TYPED records
 *   (the ENG-003 vocabulary is the model) and retries are driven from the
 *   `retriable` flag + the job's declared retry policy; exhaustion
 *   dead-letters with full append-only history;
 * - every method is tenant-scoped; foreign-scope access is
 *   indistinguishable from unknown-job (no existence leaks, §31).
 *
 * 10 public methods (policy budget 12).
 */

import type { TenantId, TenantScope } from "@mos/contracts";

import type {
  DurableJobKind,
  DurableJobRecord,
  DurableJobSubmission,
  JobCompletion,
  JobListQuery,
  TypedJobFailure,
} from "../contracts/durable-job.js";
import type { DurableJobEvent } from "../contracts/job-events.js";
import type { DurableJobId, JobKey, LeaseToken } from "../contracts/ids.js";

/** Reference to a held claim: the lease token authorizes mutations. */
export interface JobClaimRef {
  readonly scope: TenantScope;
  readonly jobId: DurableJobId;
  readonly leaseToken: LeaseToken;
}

/** A granted claim: the job snapshot plus the lease. */
export interface JobClaim extends JobClaimRef {
  readonly attempt: number;
  readonly workerId: string;
  readonly leaseExpiresAtMs: number;
  readonly job: DurableJobRecord;
}

/** Query for claiming the next runnable job (the work-polling surface). */
export interface JobClaimQuery {
  /** Worker identity recorded on the claim + claim events. */
  readonly workerId: string;
  /**
   * Optional tenant filter. A tenant-scoped worker claims only its
   * tenant's jobs; a fleet worker may claim across tenants (claiming is a
   * lease operation, not a data read — the returned record carries its
   * own scope and every subsequent mutation is scope-checked).
   */
  readonly tenantId?: TenantId;
  /** Optional §26 kind filter. */
  readonly kinds?: readonly DurableJobKind[];
  /** Lease duration for the claim (default from queue construction). */
  readonly leaseDurationMs?: number;
}

/** Optional attribution override for claim-held mutations. */
export interface JobMutationOptions {
  /** §30 executor attribution; defaults to the claim's worker id. */
  readonly executor?: string;
}

/**
 * The durable job queue: enqueue (idempotent), claim (leased),
 * heartbeat, complete/fail/cancel (typed reasons), tenant-scoped reads
 * and the append-only history.
 */
export interface JobQueuePort {
  /**
   * Enqueues one job. Idempotent per (scope.tenantId, jobKey): submitting
   * the same key again returns the existing record unchanged (no second
   * event, no double execution). Invalid submissions fail closed with a
   * typed error.
   */
  enqueue(submission: DurableJobSubmission): DurableJobRecord;

  /**
   * Claims the next runnable job (FIFO by creation): status queued with
   * its backoff window elapsed, or running with an EXPIRED lease (crash
   * recovery — a lease-expired event is recorded and the job re-queued).
   * Returns null when nothing is claimable. The claim grants a lease
   * token; a second claimer gets a DIFFERENT job or null — never the same
   * live lease.
   */
  claimNextRunnable(query: JobClaimQuery): JobClaim | null;

  /**
   * Heartbeat: extends the claim's lease by its duration from now.
   * Typed failure when the token is stale or the lease already expired.
   */
  renewLease(claim: JobClaimRef): JobClaim | null;

  /**
   * Completes the claimed attempt: status succeeded, the §30 completion
   * facts recorded, the lease released. Only the lease holder, before
   * expiry, on a running job — otherwise a typed failure.
   */
  completeJob(claim: JobClaimRef, completion: JobCompletion): DurableJobRecord;

  /**
   * Fails the claimed attempt with a TYPED failure record. Retries are
   * driven from the failure: retriable + attempts remaining → queued
   * again with the declared backoff; retriable + exhausted →
   * dead_lettered (full history preserved); non-retriable → the failure's
   * terminal status ("failed" or "timed_out"). `options.executor`
   * overrides the §30 executor attribution (the runner bridge passes
   * "engine-runner").
   */
  failJob(
    claim: JobClaimRef,
    failure: TypedJobFailure,
    options?: JobMutationOptions,
  ): DurableJobRecord;

  /**
   * Cancels a QUEUED job (explicit reason, actor attribution). Running
   * jobs are not cancellable through the queue — the claim holder fails
   * them or the lease expires; terminal jobs are immutable (typed
   * failure). Foreign-scope cancellation is indistinguishable from
   * unknown-job (no existence leak).
   */
  cancelJob(
    scope: TenantScope,
    jobId: DurableJobId,
    reason: string,
    cancelledBy: string,
  ): DurableJobRecord;

  /** Tenant-scoped get; foreign/unknown ids both return undefined. */
  getJob(scope: TenantScope, jobId: DurableJobId): DurableJobRecord | undefined;

  /** Tenant-scoped list by statuses/kinds (§31: no cross-tenant rows). */
  listJobs(query: JobListQuery): readonly DurableJobRecord[];

  /**
   * The full append-only event history of one job (undefined for
   * foreign/unknown ids — no existence leaks).
   */
  getJobHistory(
    scope: TenantScope,
    jobId: DurableJobId,
  ): readonly DurableJobEvent[] | undefined;

  /** Looks up a job by its client job key (idempotency reads). */
  getJobByKey(scope: TenantScope, jobKey: JobKey): DurableJobRecord | undefined;
}
