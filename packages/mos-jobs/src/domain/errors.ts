/**
 * Typed job-queue failures (JOBS-001).
 *
 * Machine-readable `code` + structured `details`, mirroring the typed
 * failure discipline of the sibling registries (ENG-001/AGT-001 pattern).
 * Fail-closed everywhere: malformed submissions, unknown jobs (foreign
 * scope is INDISTINGUISHABLE from unknown — no existence leaks, §31),
 * stale/expired leases, non-running mutations and non-cancellable
 * cancellations are typed errors, never silent behavior.
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
