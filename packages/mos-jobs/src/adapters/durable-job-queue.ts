/**
 * The durable job queue adapter (JOBS-001) — MOS-owned queue semantics
 * over any {@link DurableJobStorePort}.
 *
 * This adapter is the REAL domain logic of the durable-job authority:
 * idempotent enqueue (client job key), FIFO leased claims (two claimers,
 * one wins — the lease token authorizes claim-held mutations),
 * heartbeats, lease-expiry crash recovery (expired running jobs are
 * re-queued and reclaimable, stale claims fail closed), complete/fail
 * with typed reasons, retries driven FROM the typed failure's
 * `retriable` flag against the declared retry policy with the declared
 * backoff schedule, dead-lettering on exhaustion with the full
 * append-only history preserved, explicit queued-job cancellation, and
 * tenant-scoped reads with no existence leaks (§31).
 *
 * What is NOT here (by design, §26): no cron, no HTTP timer, no clock
 * driven dispatch — workers poll claimNextRunnable. The disclosed
 * clock-driven poller lives in test-doubles/job-poller-double.ts.
 *
 * The backing STORE is the disclosed in-memory double in tests; the real
 * durable store (PostgreSQL authority / Zcode task-infra adapter) binds
 * behind the same port. Atomicity of claim follows the store's contract
 * (synchronous in-memory = atomic per event-loop turn; real adapters
 * serialize the scan/save).
 */

import { randomUUID } from "node:crypto";
import type { Timestamp } from "@mos/contracts";

import type {
  DurableJobRecord,
  DurableJobSubmission,
  JobActorAttribution,
  JobCompletion,
  TypedJobFailure,
} from "../contracts/durable-job.js";
import type { JobKey } from "../contracts/ids.js";
import { durableJobId, leaseToken } from "../contracts/ids.js";
import type {
  JobClaim,
  JobClaimQuery,
  JobClaimRef,
  JobMutationOptions,
  JobQueuePort,
} from "../ports/job-queue.port.js";
import type { DurableJobStorePort } from "../ports/durable-job-store.port.js";
import { JobQueueError } from "../domain/errors.js";
import { requireJob, requireLiveLease } from "../domain/claim-guards.js";
import { decideRetry, retryDelayMs } from "../domain/retry-policy.js";
import { submissionViolations } from "../domain/submission-validation.js";

/** Options for the queue adapter. */
export interface DurableJobQueueOptions {
  /** The persistence seam (in-memory double in tests; real store later). */
  readonly store: DurableJobStorePort;
  /** Injectable ISO clock for stamps (default: real time). */
  readonly clock?: () => Timestamp;
  /** Injectable epoch-ms clock (default: Date.now). */
  readonly now?: () => number;
  /** Default lease duration in ms (default: 60 000). */
  readonly leaseDurationMs?: number;
  /** Injectable job id factory (default: `job_` + random UUID). */
  readonly jobIdFactory?: () => string;
  /** Injectable lease token factory (default: `lease_` + random UUID). */
  readonly leaseTokenFactory?: () => string;
}

/** Creates the durable job queue over a {@link DurableJobStorePort}. */
export function createDurableJobQueue(
  options: DurableJobQueueOptions,
): JobQueuePort {
  const store = options.store;
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  const now = options.now ?? Date.now;
  const defaultLeaseMs = options.leaseDurationMs ?? 60_000;
  const jobIdFactory = options.jobIdFactory ?? (() => `job_${randomUUID()}`);
  const tokenFactory = options.leaseTokenFactory ?? (() => `lease_${randomUUID()}`);

  function saved(record: DurableJobRecord): DurableJobRecord {
    store.saveJob(record);
    const refreshed = store.findJobById(record.scope, record.id);
    if (refreshed === undefined) {
      throw new JobQueueError("unknown-job", "store lost a just-saved record", {
        jobId: record.id as string,
      });
    }
    return refreshed;
  }

  const queue: JobQueuePort = {
    enqueue(submission: DurableJobSubmission): DurableJobRecord {
      const violations = submissionViolations(submission);
      if (violations.length > 0) {
        throw new JobQueueError(
          "invalid-job-submission",
          `invalid durable job submission: ${violations.join("; ")}`,
          { violations },
        );
      }

      // Idempotency: same (tenant, jobKey) → the EXISTING record, no event.
      const existing = store.findJobByKey(submission.scope, submission.jobKey);
      if (existing !== undefined) {
        return existing;
      }

      const id = durableJobId(jobIdFactory());
      const stamp = clock();
      const record: DurableJobRecord = {
        id,
        jobKey: submission.jobKey,
        scope: submission.scope,
        kind: submission.kind,
        contractVersion: submission.contractVersion,
        submittedBy: submission.submittedBy,
        input: {
          inputArtifactRefs: submission.inputArtifactRefs,
          parameters: submission.parameters,
        },
        status: "queued",
        attemptCount: 0,
        retryPolicy: submission.retryPolicy,
        run: {
          runId: null,
          engineId: null,
          engineVersion: null,
          capabilityId: null,
          capabilityVersion: null,
          workerId: null,
        },
        observability: null,
        failure: null,
        createdAt: stamp,
        updatedAt: stamp,
        nextAttemptAtMs: null,
        lease: null,
        deadLetteredAt: null,
      };
      store.saveJob(record);
      store.appendJobEvent(submission.scope, {
        type: "enqueued",
        jobId: id,
        attempt: 0,
        actor: { executor: "job-queue", submittedBy: submission.submittedBy },
        recordedAt: stamp,
        jobKey: submission.jobKey,
        kind: submission.kind,
        contractVersion: submission.contractVersion,
        submittedBy: submission.submittedBy,
        inputArtifactRefs: submission.inputArtifactRefs,
        maxAttempts: submission.retryPolicy.maxAttempts,
      });
      return saved(record);
    },

    claimNextRunnable(query: JobClaimQuery): JobClaim | null {
      const nowMs = now();
      const claimable = store.findClaimableJobs({
        nowMs,
        tenantId: query.tenantId,
        kinds: query.kinds,
      });
      const candidate = claimable[0];
      if (candidate === undefined) {
        return null;
      }

      // Crash recovery: a running job with an expired lease is first
      // re-queued (lease-expired event) so the new claim is honest history.
      let record = candidate;
      if (record.status === "running" && record.lease !== null) {
        const stale = record.lease;
        record = saved({
          ...record,
          status: "queued",
          lease: null,
          updatedAt: clock(),
        });
        store.appendJobEvent(record.scope, {
          type: "lease-expired",
          jobId: record.id,
          attempt: stale.attempt,
          actor: { executor: stale.workerId, submittedBy: record.submittedBy },
          recordedAt: clock(),
          workerId: stale.workerId,
          leaseToken: stale.token,
        });
      }

      const attempt = record.attemptCount + 1;
      const leaseMs = query.leaseDurationMs ?? defaultLeaseMs;
      const token = leaseToken(tokenFactory());
      const lease = {
        token,
        workerId: query.workerId,
        attempt,
        acquiredAt: clock(),
        expiresAtMs: nowMs + leaseMs,
        durationMs: leaseMs,
      };
      const running: DurableJobRecord = {
        ...record,
        status: "running",
        attemptCount: attempt,
        lease,
        nextAttemptAtMs: null,
        run: { ...record.run, workerId: query.workerId },
        updatedAt: clock(),
      };
      const refreshed = saved(running);
      store.appendJobEvent(refreshed.scope, {
        type: "claim",
        jobId: refreshed.id,
        attempt,
        actor: { executor: query.workerId, submittedBy: refreshed.submittedBy },
        recordedAt: clock(),
        workerId: query.workerId,
        leaseToken: token,
        leaseExpiresAtMs: lease.expiresAtMs,
      });
      return {
        scope: refreshed.scope,
        jobId: refreshed.id,
        leaseToken: token,
        attempt,
        workerId: query.workerId,
        leaseExpiresAtMs: lease.expiresAtMs,
        job: refreshed,
      };
    },

    renewLease(ref: JobClaimRef): JobClaim | null {
      const record = requireJob(store, ref.scope, ref.jobId);
      requireLiveLease(record, ref, now);
      const lease = record.lease as NonNullable<DurableJobRecord["lease"]>;
      const expiresAtMs = now() + lease.durationMs;
      const renewed = saved({
        ...record,
        lease: { ...lease, expiresAtMs },
        updatedAt: clock(),
      });
      store.appendJobEvent(renewed.scope, {
        type: "lease-renewed",
        jobId: renewed.id,
        attempt: lease.attempt,
        actor: { executor: lease.workerId, submittedBy: renewed.submittedBy },
        recordedAt: clock(),
        workerId: lease.workerId,
        leaseToken: lease.token,
        leaseExpiresAtMs: expiresAtMs,
      });
      return {
        scope: renewed.scope,
        jobId: renewed.id,
        leaseToken: lease.token,
        attempt: lease.attempt,
        workerId: lease.workerId,
        leaseExpiresAtMs: expiresAtMs,
        job: renewed,
      };
    },

    completeJob(ref: JobClaimRef, completion: JobCompletion): DurableJobRecord {
      const record = requireJob(store, ref.scope, ref.jobId);
      requireLiveLease(record, ref, now);
      const lease = record.lease as NonNullable<DurableJobRecord["lease"]>;
      const executor = completion.executor ?? lease.workerId;
      const observability = {
        runId: completion.runId ?? record.run.runId,
        engineId: completion.engineId ?? record.run.engineId,
        engineVersion: completion.engineVersion ?? record.run.engineVersion,
        capabilityId: completion.capabilityId ?? record.run.capabilityId,
        capabilityVersion: completion.capabilityVersion ?? record.run.capabilityVersion,
        outputArtifactRefs: completion.outputArtifactRefs,
        durationMs: completion.durationMs,
        cost: completion.cost ?? null,
        resourceUsage: completion.resourceUsage ?? null,
        warnings: completion.warnings ?? [],
        provenance: completion.provenance ?? null,
      };
      const completed = saved({
        ...record,
        status: "succeeded",
        lease: null,
        observability,
        run: {
          runId: observability.runId,
          engineId: observability.engineId,
          engineVersion: observability.engineVersion,
          capabilityId: observability.capabilityId,
          capabilityVersion: observability.capabilityVersion,
          workerId: lease.workerId,
        },
        updatedAt: clock(),
      });
      store.appendJobEvent(completed.scope, {
        type: "attempt-succeeded",
        jobId: completed.id,
        attempt: lease.attempt,
        actor: { executor, submittedBy: completed.submittedBy },
        recordedAt: clock(),
        observability,
      });
      return completed;
    },

    failJob(
      ref: JobClaimRef,
      failure: TypedJobFailure,
      mutationOptions?: JobMutationOptions,
    ): DurableJobRecord {
      const record = requireJob(store, ref.scope, ref.jobId);
      requireLiveLease(record, ref, now);
      const lease = record.lease as NonNullable<DurableJobRecord["lease"]>;
      const executor = mutationOptions?.executor ?? lease.workerId;
      const decision = decideRetry(record.retryPolicy, lease.attempt, failure);
      const attribution: JobActorAttribution = {
        executor,
        submittedBy: record.submittedBy,
      };

      if (decision.decision === "retry") {
        const delayMs = retryDelayMs(record.retryPolicy, lease.attempt);
        const nextAttemptAtMs = now() + delayMs;
        const requeued = saved({
          ...record,
          status: "queued",
          lease: null,
          failure,
          nextAttemptAtMs,
          updatedAt: clock(),
        });
        store.appendJobEvent(requeued.scope, {
          type: "retry-scheduled",
          jobId: requeued.id,
          attempt: lease.attempt,
          actor: attribution,
          recordedAt: clock(),
          failure,
          nextAttemptAtMs,
          delayMs,
        });
        return requeued;
      }

      if (decision.decision === "dead-letter") {
        const deadLettered = saved({
          ...record,
          status: "dead_lettered",
          lease: null,
          failure,
          deadLetteredAt: clock(),
          updatedAt: clock(),
        });
        store.appendJobEvent(deadLettered.scope, {
          type: "dead-lettered",
          jobId: deadLettered.id,
          attempt: lease.attempt,
          actor: attribution,
          recordedAt: clock(),
          failure,
          attempts: lease.attempt,
        });
        return deadLettered;
      }

      const terminal = saved({
        ...record,
        status: decision.status,
        lease: null,
        failure,
        updatedAt: clock(),
      });
      store.appendJobEvent(terminal.scope, {
        type: decision.status === "timed_out" ? "attempt-timed-out" : "attempt-failed",
        jobId: terminal.id,
        attempt: lease.attempt,
        actor: attribution,
        recordedAt: clock(),
        failure,
      });
      return terminal;
    },

    cancelJob(scope, jobId, reason, cancelledBy): DurableJobRecord {
      const record = requireJob(store, scope, jobId);
      if (record.status !== "queued") {
        throw new JobQueueError(
          "job-not-cancellable",
          `durable job ${record.id as string} is ${record.status}; only queued jobs can be cancelled`,
          { jobId: record.id as string, status: record.status },
        );
      }
      const cancelled = saved({
        ...record,
        status: "cancelled",
        lease: null,
        updatedAt: clock(),
      });
      store.appendJobEvent(cancelled.scope, {
        type: "cancelled",
        jobId: cancelled.id,
        attempt: 0,
        actor: { executor: cancelledBy, submittedBy: cancelled.submittedBy },
        recordedAt: clock(),
        reason,
        cancelledBy: { executor: cancelledBy, submittedBy: cancelled.submittedBy },
      });
      return cancelled;
    },

    getJob(scope, jobId) {
      return store.findJobById(scope, jobId);
    },

    listJobs(query) {
      return store.listJobs(query);
    },

    getJobHistory(scope, jobId) {
      return store.listJobEvents(scope, jobId);
    },

    getJobByKey(scope, key: JobKey) {
      return store.findJobByKey(scope, key);
    },
  };

  return queue;
}
