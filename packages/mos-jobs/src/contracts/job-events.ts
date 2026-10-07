/**
 * Append-only immutable job event history (JOBS-001).
 *
 * EVERY lifecycle transition of a durable job is recorded as one immutable
 * event (requireAppendOnlyHistoryWhereDeclared): enqueued, claim,
 * lease-renewed, lease-expired (crash recovery), attempt-succeeded,
 * retry-scheduled, attempt-failed, attempt-timed-out, dead-lettered and
 * cancelled. Events carry §30 attribution (executor enriched with the
 * submitting actor) and the observability payload of the transition.
 * There is NO update or delete for events — the store port exposes append
 * and list only, and records are deep-frozen at the adapter boundary.
 */

import type { Timestamp } from "@mos/contracts";

import type {
  DurableJobKind,
  DurableJobObservability,
  JobActorAttribution,
  JobSubmitterActor,
  TypedJobFailure,
} from "./durable-job.js";
import type { DurableJobId, JobKey, LeaseToken } from "./ids.js";
import type { ArtifactRef } from "@mos/contracts";
import type { Version } from "@mos/contracts";

/** Shared event fields (sequence is assigned by the store, monotonic per job). */
interface DurableJobEventBase {
  readonly sequence: number;
  readonly jobId: DurableJobId;
  /** The attempt number the event belongs to (0 for pre-attempt events). */
  readonly attempt: number;
  readonly actor: JobActorAttribution;
  readonly recordedAt: Timestamp;
}

/** Job accepted (first enqueue only — idempotent re-submit emits nothing). */
export interface DurableJobEnqueuedEvent extends DurableJobEventBase {
  readonly type: "enqueued";
  readonly jobKey: JobKey;
  readonly kind: DurableJobKind;
  readonly contractVersion: Version;
  readonly submittedBy: JobSubmitterActor;
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly maxAttempts: number;
}

/** A worker claimed the job: attempt started under a lease. */
export interface DurableJobClaimEvent extends DurableJobEventBase {
  readonly type: "claim";
  readonly workerId: string;
  readonly leaseToken: LeaseToken;
  readonly leaseExpiresAtMs: number;
}

/** Heartbeat: the holder renewed its lease. */
export interface DurableJobLeaseRenewedEvent extends DurableJobEventBase {
  readonly type: "lease-renewed";
  readonly workerId: string;
  readonly leaseToken: LeaseToken;
  readonly leaseExpiresAtMs: number;
}

/** Crash recovery: the lease expired, the job returned to claimable state. */
export interface DurableJobLeaseExpiredEvent extends DurableJobEventBase {
  readonly type: "lease-expired";
  readonly workerId: string;
  readonly leaseToken: LeaseToken;
}

/** Attempt completed successfully (carries the full §30 observability). */
export interface DurableJobAttemptSucceededEvent extends DurableJobEventBase {
  readonly type: "attempt-succeeded";
  readonly observability: DurableJobObservability;
}

/** Retriable failure: the job re-queued with the declared backoff. */
export interface DurableJobRetryScheduledEvent extends DurableJobEventBase {
  readonly type: "retry-scheduled";
  readonly failure: TypedJobFailure;
  readonly nextAttemptAtMs: number;
  readonly delayMs: number;
}

/** Terminal non-retriable failure (status → failed). */
export interface DurableJobAttemptFailedEvent extends DurableJobEventBase {
  readonly type: "attempt-failed";
  readonly failure: TypedJobFailure;
}

/** Terminal timeout (status → timed_out). */
export interface DurableJobAttemptTimedOutEvent extends DurableJobEventBase {
  readonly type: "attempt-timed-out";
  readonly failure: TypedJobFailure;
}

/** Retry exhaustion: the job is dead-lettered with full history preserved. */
export interface DurableJobDeadLetteredEvent extends DurableJobEventBase {
  readonly type: "dead-lettered";
  readonly failure: TypedJobFailure;
  readonly attempts: number;
}

/** Explicit cancellation of a queued job. */
export interface DurableJobCancelledEvent extends DurableJobEventBase {
  readonly type: "cancelled";
  readonly reason: string;
  readonly cancelledBy: JobActorAttribution;
}

/** Every immutable event in one job's append-only history, in order. */
export type DurableJobEvent =
  | DurableJobEnqueuedEvent
  | DurableJobClaimEvent
  | DurableJobLeaseRenewedEvent
  | DurableJobLeaseExpiredEvent
  | DurableJobAttemptSucceededEvent
  | DurableJobRetryScheduledEvent
  | DurableJobAttemptFailedEvent
  | DurableJobAttemptTimedOutEvent
  | DurableJobDeadLetteredEvent
  | DurableJobCancelledEvent;

/** Distributive Omit: applies per union member (plain Omit collapses it). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** An event before the store assigns its per-job sequence number. */
export type DurableJobEventInput = DistributiveOmit<DurableJobEvent, "sequence">;

/** The ordered event-type vocabulary (test-pinned against drift). */
export const DURABLE_JOB_EVENT_TYPES = Object.freeze([
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
] as const);

/** One event type in the history vocabulary. */
export type DurableJobEventType = (typeof DURABLE_JOB_EVENT_TYPES)[number];
