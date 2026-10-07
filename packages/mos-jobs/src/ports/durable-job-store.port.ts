/**
 * DurableJobStorePort — the persistence seam of the durable-job authority
 * (JOBS-001).
 *
 * The queue semantics (leases, retries, dead-lettering, event history)
 * are MOS-owned domain logic in `adapters/durable-job-queue.ts` and run
 * over THIS port. What the port abstracts is exactly the part a real
 * substrate provides: durable record storage, the append-only event log
 * with per-job monotonic sequences, key-indexed idempotency lookup, and a
 * claimable scan.
 *
 * Future substrate bindings (documented seams, §26: "ZCode runtime task
 * infrastructure may provide worker mechanics through an adapter"):
 * - a PostgreSQL-backed store adapter (the MOS durable authority);
 * - a Zcode task-infra adapter that maps records/events onto the runtime
 *   task infrastructure. Both implement this port; the queue and every
 *   consumer stay unchanged.
 *
 * ATOMICITY REQUIREMENT for real adapters: claimNextRunnable executes as
 * scan → validate → save over this port. The in-memory adapter is
 * synchronous, so the sequence is atomic within one event-loop turn. A
 * concurrent real store MUST serialize that scan/save (transaction or
 * conditional write) so two workers can never claim the same job — the
 * lease token check makes stale claims fail closed regardless.
 *
 * The disclosed in-memory adapter lives at
 * `adapters/in-memory-durable-job-store.ts` (EPHEMERAL: process-local,
 * never a production durability claim).
 *
 * 7 public methods (policy budget 12).
 */

import type { TenantId, TenantScope } from "@mos/contracts";

import type {
  DurableJobEvent,
  DurableJobEventInput,
} from "../contracts/job-events.js";
import type {
  DurableJobKind,
  DurableJobRecord,
  JobListQuery,
} from "../contracts/durable-job.js";
import type { DurableJobId, JobKey } from "../contracts/ids.js";

/** What the store's claimable scan matches. */
export interface ClaimableJobsQuery {
  /** Epoch milliseconds "now". */
  readonly nowMs: number;
  /** Optional tenant filter. */
  readonly tenantId?: TenantId;
  /** Optional §26 kind filter. */
  readonly kinds?: readonly DurableJobKind[];
}

/** Tenant-scoped record + event-log persistence for durable jobs. */
export interface DurableJobStorePort {
  /** Upserts one job record (the queue owns all transitions). */
  saveJob(record: DurableJobRecord): void;

  /** Finds one job by id; foreign-scope and unknown both yield undefined. */
  findJobById(scope: TenantScope, jobId: DurableJobId): DurableJobRecord | undefined;

  /** Finds one job by client job key (idempotency index). */
  findJobByKey(scope: TenantScope, jobKey: JobKey): DurableJobRecord | undefined;

  /** Lists records by status/kind within one tenant (§31 scoped). */
  listJobs(query: JobListQuery): readonly DurableJobRecord[];

  /**
   * Appends one immutable event, assigning the per-job monotonic sequence
   * number. Returns the stored event. There is no event update/delete.
   */
  appendJobEvent(scope: TenantScope, event: DurableJobEventInput): DurableJobEvent;

  /** The full ordered event history of one job (undefined when unknown/foreign). */
  listJobEvents(
    scope: TenantScope,
    jobId: DurableJobId,
  ): readonly DurableJobEvent[] | undefined;

  /**
   * Claimable records in FIFO creation order: status queued with
   * nextAttemptAtMs elapsed (or null), or status running with an expired
   * lease (reclaimable crash recovery). Records carry their own scopes;
   * the tenant/kind filters narrow the scan. Ordering: createdAt then id.
   */
  findClaimableJobs(query: ClaimableJobsQuery): readonly DurableJobRecord[];
}
