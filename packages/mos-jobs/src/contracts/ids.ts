/**
 * Identifier brands of the durable-job authority (@mos/jobs, JOBS-001).
 *
 * One new branded id per record kind the module owns (spec §5 style):
 * `DurableJobId` for job records, `JobKey` for the client-supplied
 * idempotency key, `LeaseToken` for claim leases. Branding is compile-time
 * nominal typing only — at runtime every value is the plain string.
 */

import type { Branded } from "@mos/contracts";

/** Identifier of one durable job record. */
export type DurableJobId = Branded<string, "DurableJobId">;

/**
 * Client-supplied idempotency key: enqueueing twice with the same
 * (tenant, jobKey) returns the EXISTING record and never double-executes.
 */
export type JobKey = Branded<string, "JobKey">;

/** Opaque lease token authorizing claim-held mutations (complete/fail/renew). */
export type LeaseToken = Branded<string, "LeaseToken">;

/** Builds a job id (machine-assigned at enqueue time). */
export function durableJobId(value: string): DurableJobId {
  return value as DurableJobId;
}

/** Builds a job key from a client-supplied string. */
export function jobKey(value: string): JobKey {
  return value as JobKey;
}

/** Builds a lease token (machine-assigned per claim). */
export function leaseToken(value: string): LeaseToken {
  return value as LeaseToken;
}
