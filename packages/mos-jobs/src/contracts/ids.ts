/**
 * Identifier brands of the durable-job authority (@mos/jobs, JOBS-001 +
 * NOTIFY-001).
 *
 * One new branded id per record kind the module owns (spec §5 style):
 * `DurableJobId` for job records, `JobKey` for the client-supplied
 * idempotency key, `LeaseToken` for claim leases; the notification plane
 * (NOTIFY-001) adds `NotificationId` for notification records,
 * `NotificationDedupKey` for the notification idempotency key,
 * `DeliveryAttemptId` for recorded delivery attempts (§30 request id),
 * `NotificationReceiptId` for proof-of-delivery receipts and
 * `ProviderAckRef` for provider-returned acknowledgment references.
 * Branding is compile-time nominal typing only — at runtime every value
 * is the plain string.
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

// ---------------------------------------------------------------------------
// NOTIFY-001 — notification plane identifier brands
// ---------------------------------------------------------------------------

/** Identifier of one durable notification record. */
export type NotificationId = Branded<string, "NotificationId">;

/**
 * Client-supplied dedup key: submitting the same logical notification
 * (same (tenant, dedup key)) twice yields ONE record — the duplicate
 * submit returns the existing record, never a second delivery.
 */
export type NotificationDedupKey = Branded<string, "NotificationDedupKey">;

/**
 * Identifier of one recorded delivery attempt — the §30 request id of the
 * attempt's observability record. Attempts are RECORDED EVENTS, not
 * claimable work units (the acceptance's no-task-engine discipline).
 */
export type DeliveryAttemptId = Branded<string, "DeliveryAttemptId">;

/** Identifier of one immutable proof-of-delivery receipt. */
export type NotificationReceiptId = Branded<string, "NotificationReceiptId">;

/**
 * Opaque acknowledgment reference a provider returns for one delivered
 * notification (null when the provider returns none).
 */
export type ProviderAckRef = Branded<string, "ProviderAckRef">;

/** Builds a notification id (machine-assigned at enqueue time). */
export function notificationId(value: string): NotificationId {
  return value as NotificationId;
}

/** Builds a dedup key from a client-supplied string. */
export function notificationDedupKey(value: string): NotificationDedupKey {
  return value as NotificationDedupKey;
}

/** Builds a delivery attempt id (machine-assigned per attempt). */
export function deliveryAttemptId(value: string): DeliveryAttemptId {
  return value as DeliveryAttemptId;
}

/** Builds a receipt id (machine-assigned per successful delivery). */
export function notificationReceiptId(value: string): NotificationReceiptId {
  return value as NotificationReceiptId;
}

/** Builds a provider ack ref from a provider-returned string. */
export function providerAckRef(value: string): ProviderAckRef {
  return value as ProviderAckRef;
}
