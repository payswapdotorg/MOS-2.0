/**
 * Append-only immutable notification event history (NOTIFY-001).
 *
 * EVERY lifecycle transition of a notification record is recorded as one
 * immutable event (requireAppendOnlyHistoryWhereDeclared): enqueued
 * (first enqueue only — a dedup'd re-submit emits nothing),
 * delivery-succeeded (carries the receipt id + the full §30 attempt
 * observability), delivery-retry-scheduled (typed failure + declared
 * backoff), delivery-failed (terminal failure — non-retriable or retry
 * exhaustion) and suppressed (recipient- or record-level, with the
 * reason). There is NO update or delete for events — the store port
 * exposes append and list only, and records are deep-frozen at the
 * adapter boundary.
 *
 * Delivery attempts are RECORDED EVENTS, not claimable work units: there
 * is no claim event, no lease event, no worker/poll vocabulary — the
 * no-task-engine discipline (NOTIFY-001 acceptance) is structural.
 */

import type {
  ArtifactRef,
  HumanProductionTaskId,
  IdentityRef,
  Milliseconds,
  MissionRef,
  Timestamp,
  Version,
} from "@mos/contracts";

import type {
  NotificationActorAttribution,
  NotificationAttemptObservability,
  NotificationKind,
  NotificationSubmitterActor,
  NotificationSuppressionLevel,
  TypedNotificationFailure,
} from "./notification.js";
import type {
  NotificationDedupKey,
  NotificationId,
  NotificationReceiptId,
  ProviderAckRef,
} from "./ids.js";

/** Shared event fields (sequence is assigned by the store, monotonic per notification). */
interface NotificationEventBase {
  readonly sequence: number;
  readonly notificationId: NotificationId;
  /** The delivery attempt number the event belongs to (0 for pre-attempt events). */
  readonly attempt: number;
  readonly actor: NotificationActorAttribution;
  readonly recordedAt: Timestamp;
}

/** Notification accepted (first enqueue only — dedup re-submit emits nothing). */
export interface NotificationEnqueuedEvent extends NotificationEventBase {
  readonly type: "enqueued";
  readonly dedupKey: NotificationDedupKey;
  readonly kind: NotificationKind;
  readonly contractVersion: Version;
  readonly submittedBy: NotificationSubmitterActor;
  readonly recipient: IdentityRef;
  readonly subject: {
    readonly artifactRefs: readonly ArtifactRef[];
    readonly taskRefs: readonly HumanProductionTaskId[];
    readonly missionRefs: readonly MissionRef[];
  };
}

/**
 * A delivery attempt succeeded: the receipt was minted (provider ref, ack
 * ref when the provider returned one, transport label) and the record is
 * terminal `delivered`. Carries the full §30 attempt observability.
 */
export interface NotificationDeliveredEvent extends NotificationEventBase {
  readonly type: "delivered";
  readonly observability: NotificationAttemptObservability;
  readonly receiptId: NotificationReceiptId;
  readonly deliveredAt: Timestamp;
  readonly providerAckRef: ProviderAckRef | null;
}

/**
 * Retriable delivery failure: the notification re-queued with the
 * declared backoff (§30 attempt observability + typed failure + the
 * backoff window applied).
 */
export interface NotificationRetryScheduledEvent extends NotificationEventBase {
  readonly type: "retry-scheduled";
  readonly observability: NotificationAttemptObservability;
  readonly failure: TypedNotificationFailure;
  readonly nextAttemptAtMs: number;
  readonly delayMs: Milliseconds;
}

/**
 * Terminal delivery failure (status → failed): non-retriable failure or
 * declared retry-policy exhaustion. Carries the §30 attempt
 * observability + the typed failure and the attempts recorded.
 */
export interface NotificationDeliveryFailedEvent extends NotificationEventBase {
  readonly type: "delivery-failed";
  readonly observability: NotificationAttemptObservability;
  readonly failure: TypedNotificationFailure;
  readonly attempts: number;
  /** True when the terminal failure is retry-policy exhaustion. */
  readonly retryExhausted: boolean;
}

/**
 * The notification was suppressed (recipient-level or record-level) with
 * a first-class reason — a recorded outcome, never a silent drop.
 */
export interface NotificationSuppressedEvent extends NotificationEventBase {
  readonly type: "suppressed";
  readonly level: NotificationSuppressionLevel;
  readonly reason: string;
  readonly suppressedBy: string;
  readonly recipientSuppressionId: string | null;
}

/** Every immutable event in one notification's append-only history, in order. */
export type NotificationEvent =
  | NotificationEnqueuedEvent
  | NotificationDeliveredEvent
  | NotificationRetryScheduledEvent
  | NotificationDeliveryFailedEvent
  | NotificationSuppressedEvent;

/** Distributive Omit: applies per union member (plain Omit collapses it). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** An event before the store assigns its per-notification sequence number. */
export type NotificationEventInput = DistributiveOmit<NotificationEvent, "sequence">;

/** The ordered event-type vocabulary (test-pinned against drift). */
export const NOTIFICATION_EVENT_TYPES = Object.freeze([
  "enqueued",
  "delivered",
  "retry-scheduled",
  "delivery-failed",
  "suppressed",
] as const);

/** One event type in the notification history vocabulary. */
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
