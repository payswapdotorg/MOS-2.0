/**
 * Typed job-queue + notification-plane failures (JOBS-001 + NOTIFY-001).
 *
 * Machine-readable `code` + structured `details`, mirroring the typed
 * failure discipline of the sibling registries (ENG-001/AGT-001 pattern).
 * Fail-closed everywhere: malformed submissions, unknown jobs (foreign
 * scope is INDISTINGUISHABLE from unknown — no existence leaks, §31),
 * stale/expired leases, non-running mutations and non-cancellable
 * cancellations are typed errors, never silent behavior. The
 * notification plane (NOTIFY-001) adds its own typed error class with
 * the same discipline for malformed notification submissions, unknown
 * notifications, non-deliverable states, backoff gates,
 * non-suppressible records and unknown suppression rules.
 */

/** Machine-readable error codes of the durable job queue. */
export type JobQueueErrorCode =
  | "invalid-job-submission"
  | "unknown-job"
  | "job-not-claimable"
  | "job-not-running"
  | "job-not-cancellable"
  | "stale-lease"
  | "lease-expired";

/** Typed durable-job-queue failure. */
export class JobQueueError extends Error {
  readonly code: JobQueueErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: JobQueueErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "JobQueueError";
    this.code = code;
    this.details = details;
  }
}

/** Machine-readable error codes of the notification delivery plane. */
export type NotificationPlaneErrorCode =
  | "invalid-notification-submission"
  | "unknown-notification"
  | "notification-not-deliverable"
  | "delivery-backoff-not-elapsed"
  | "notification-not-suppressible"
  | "unknown-suppression"
  | "invalid-suppression";

/** Typed notification-plane failure (NOTIFY-001). */
export class NotificationPlaneError extends Error {
  readonly code: NotificationPlaneErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: NotificationPlaneErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "NotificationPlaneError";
    this.code = code;
    this.details = details;
  }
}
