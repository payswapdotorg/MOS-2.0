/**
 * NotificationRecord and its vocabulary (NOTIFY-001, spec §30/§31 — the
 * notification plane of the durable-record authority, MOS2-WAVE5-HARVEST
 * TL topology decision: no notify module exists in the frozen registry,
 * so the plane lives in @mos/jobs).
 *
 * A notification is a DURABLE, tenant-scoped, append-only record of one
 * logical notification to one recipient: the kind declares a SEMANTIC
 * category (never provider specifics), the recipient is an identity ref
 * from the @mos/contracts vocabulary, the subject is REFERENCES ONLY
 * (artifact/task/mission refs — never inline content; large media and
 * task bodies stay behind their owning authorities), and the dedup key
 * makes enqueue idempotent (the SAME logical notification submitted twice
 * yields ONE record — the duplicate returns the existing record, never a
 * second delivery).
 *
 * Lifecycle: queued → delivered | failed | suppressed. Suppression is a
 * FIRST-CLASS recorded outcome with a reason — never a silent drop.
 * Retries follow the job queue's declared-policy discipline (typed
 * failure + declared backoff schedule; exhaustion terminates as failed).
 *
 * WITHOUT task/workflow duplication (the acceptance's core discipline):
 * delivery attempts are RECORDED EVENTS (§30 observability records), not
 * claimable work units — there are NO claim/lease/execute semantics on
 * notifications anywhere in this plane.
 */

import type {
  ArtifactRef,
  HumanProductionTaskId,
  IdentityRef,
  JsonObject,
  Milliseconds,
  MissionRef,
  ProviderId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import type {
  DeliveryAttemptId,
  NotificationDedupKey,
  NotificationId,
  NotificationReceiptId,
  ProviderAckRef,
} from "./ids.js";
import type {
  JobActorAttribution,
  JobRetryPolicy,
  JobSubmitterActor,
} from "./durable-job.js";

// ---------------------------------------------------------------------------
// Kind + lifecycle (declarative semantic vocabulary)
// ---------------------------------------------------------------------------

/**
 * The declarative notification kind vocabulary: SEMANTIC categories of
 * what happened, never provider/transport specifics (an email/push/webhook
 * choice is a delivery-provider concern, not a record property).
 */
export const NOTIFICATION_KINDS = Object.freeze([
  "mission-event",
  "task-assignment",
  "task-reminder",
  "rights-event",
  "system-alert",
] as const);

/** One declarative notification kind. */
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Lifecycle states. `queued` is the only live state; `delivered`,
 * `failed` and `suppressed` are terminal (append-only event history
 * records how the record got there). Retriable delivery failures loop a
 * failed attempt back to `queued` (retry-scheduled with the declared
 * backoff); retry EXHAUSTION and non-retriable failures terminate as
 * `failed` with the typed failure recorded.
 */
export const NOTIFICATION_STATUSES = Object.freeze([
  "queued",
  "delivered",
  "failed",
  "suppressed",
] as const);

/** Lifecycle state of one notification record. */
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** States a notification can never leave (history records the rest). */
export const TERMINAL_NOTIFICATION_STATUSES = Object.freeze([
  "delivered",
  "failed",
  "suppressed",
] as const);

/** One of the terminal notification statuses. */
export type TerminalNotificationStatus = (typeof TERMINAL_NOTIFICATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Retry policy + typed failure (the job queue's discipline, reused)
// ---------------------------------------------------------------------------

/**
 * Declared notification retry policy — the SAME shape as the job queue's
 * {@link JobRetryPolicy} (zero-drift alias): maximum delivery attempts
 * (INCLUDING the first) and the backoff schedule (one delay in ms per
 * scheduled retry, indexed by the failed attempt number; the last entry
 * clamps beyond the schedule length).
 */
export type NotificationRetryPolicy = JobRetryPolicy;

/**
 * A typed delivery failure (§30 failure field): machine-readable code
 * from the closed provider-seam vocabulary, message, retriable flag and
 * optional structured details. Retries are driven FROM this record
 * against the notification's declared retry policy.
 */
export interface TypedNotificationFailure {
  readonly code: NotificationDeliveryFailureCode;
  readonly message: string;
  readonly retriable: boolean;
  readonly details?: JsonObject;
}

/**
 * Closed failure-code vocabulary of the notification provider seam (the
 * only codes a provider response may carry):
 * - `provider-rejected` — PERMANENT: the provider refused the
 *   notification (bad recipient address, policy refusal);
 * - `provider-transport-failed` — TRANSIENT: the transport failed before
 *   the provider answered (retry candidate per the declared policy).
 */
export const NOTIFICATION_DELIVERY_FAILURE_CODES = Object.freeze([
  "provider-rejected",
  "provider-transport-failed",
] as const);

/** One provider-seam delivery failure code. */
export type NotificationDeliveryFailureCode =
  (typeof NOTIFICATION_DELIVERY_FAILURE_CODES)[number];

/** A non-fatal warning recorded with a delivery attempt (§30 warnings). */
export interface NotificationWarning {
  readonly code: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Actor (§30 attribution — reused from the durable-job vocabulary)
// ---------------------------------------------------------------------------

/** The actor that caused the notification (zero-drift alias). */
export type NotificationSubmitterActor = JobSubmitterActor;

/** §30 executor + submitting-actor attribution (zero-drift alias). */
export type NotificationActorAttribution = JobActorAttribution;

// ---------------------------------------------------------------------------
// Subject — REFERENCES ONLY, never inline content
// ---------------------------------------------------------------------------

/**
 * What the notification is about: artifact refs, human production task
 * refs and mission refs. NEVER inline content — the subject is resolved
 * by consumers through the owning authorities (content/tasks/missions);
 * media and task bodies never travel over the control plane (§6).
 */
export interface NotificationSubject {
  readonly artifactRefs: readonly ArtifactRef[];
  readonly taskRefs: readonly HumanProductionTaskId[];
  readonly missionRefs: readonly MissionRef[];
}

// ---------------------------------------------------------------------------
// §30 observability of the latest delivery attempt
// ---------------------------------------------------------------------------

/**
 * §30 observability block of the LATEST recorded delivery attempt (null
 * before the first attempt): request id (the attempt id), provider ref,
 * actor attribution, duration, failure/warnings and the transport label
 * of the provider response. Every attempt carries this block as an
 * immutable append-only event; the record keeps the latest as a summary.
 */
export interface NotificationAttemptObservability {
  /** §30 request id — the delivery attempt id. */
  readonly requestId: DeliveryAttemptId;
  /** §30 provider ref — the declared transport binding's provider identity. */
  readonly providerId: ProviderId;
  /** §30 actor — the executing delivery authority + the submitting actor. */
  readonly actor: NotificationActorAttribution;
  /** §30 duration of the delivery attempt (≥ 0). */
  readonly durationMs: Milliseconds;
  /** §30 failure — null on success. */
  readonly failure: TypedNotificationFailure | null;
  /** §30 warnings from the provider response. */
  readonly warnings: readonly NotificationWarning[];
  /** Honest transport self-label (e.g. "in-memory-notification-provider-double"). */
  readonly transportLabel: string;
}

// ---------------------------------------------------------------------------
// Suppression (first-class recorded outcome, never a silent drop)
// ---------------------------------------------------------------------------

/** Where a suppression came from. */
export type NotificationSuppressionLevel = "recipient" | "record";

/**
 * The recorded suppression of one notification: WHO suppressed it, WHY
 * (the reason is first-class), at what level and when. Carried on the
 * record (status `suppressed`) and as an immutable `suppressed` event.
 */
export interface NotificationSuppressionInfo {
  readonly level: NotificationSuppressionLevel;
  readonly reason: string;
  readonly suppressedBy: string;
  readonly suppressedAt: Timestamp;
  /**
   * The id of the active recipient-suppression rule when the level is
   * `recipient` (null for record-level suppressions).
   */
  readonly recipientSuppressionId: string | null;
}

/**
 * One tenant-scoped recipient suppression rule. While ACTIVE (liftedAt
 * null), every notification enqueued for the recipient is created
 * directly with status `suppressed` carrying this rule's reason — a
 * first-class recorded outcome, never a silent drop. Lifting the rule
 * affects only FUTURE notifications (already-suppressed records are
 * terminal and immutable).
 */
export interface RecipientSuppression {
  readonly id: string;
  readonly scope: TenantScope;
  readonly recipient: IdentityRef;
  readonly reason: string;
  readonly suppressedBy: string;
  readonly suppressedAt: Timestamp;
  /** Null while active; set by liftRecipientSuppression. */
  readonly liftedAt: Timestamp | null;
  readonly liftedBy: string | null;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * One durable notification record — the notification plane's authority
 * shape. Fields: id, dedup key, tenant scope, declarative kind, contract
 * version, submitting actor, identity-ref recipient, reference-only
 * subject, lifecycle status, delivery attempts recorded, declared retry
 * policy, latest §30 attempt observability, last typed failure,
 * timestamps (injectable clock), the backoff gate for the next attempt
 * and the recorded suppression when one applies.
 */
export interface NotificationRecord {
  readonly id: NotificationId;
  readonly dedupKey: NotificationDedupKey;
  readonly scope: TenantScope;
  readonly kind: NotificationKind;
  readonly contractVersion: Version;
  readonly submittedBy: NotificationSubmitterActor;
  readonly recipient: IdentityRef;
  readonly subject: NotificationSubject;
  readonly status: NotificationStatus;
  /** Delivery attempts RECORDED (append-only events), including failures. */
  readonly attemptCount: number;
  readonly retryPolicy: NotificationRetryPolicy;
  readonly observability: NotificationAttemptObservability | null;
  readonly failure: TypedNotificationFailure | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly deliveredAt: Timestamp | null;
  /** Epoch ms before which a backoff-waiting queued notification is not deliverable. */
  readonly nextAttemptAtMs: number | null;
  readonly suppressedAt: Timestamp | null;
  readonly suppression: NotificationSuppressionInfo | null;
}

// ---------------------------------------------------------------------------
// Submission + queries
// ---------------------------------------------------------------------------

/** Input to enqueue: everything the record needs (except machine fields). */
export interface NotificationSubmission {
  readonly scope: TenantScope;
  readonly dedupKey: NotificationDedupKey;
  readonly kind: NotificationKind;
  readonly contractVersion: Version;
  readonly submittedBy: NotificationSubmitterActor;
  readonly recipient: IdentityRef;
  readonly subject: NotificationSubject;
  readonly retryPolicy: NotificationRetryPolicy;
}

/** Query for listing notifications, always tenant-scoped (§31). */
export interface NotificationListQuery {
  readonly scope: TenantScope;
  readonly recipient?: IdentityRef;
  readonly statuses?: readonly NotificationStatus[];
  readonly kinds?: readonly NotificationKind[];
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Receipts — the durable proof-of-delivery surface
// ---------------------------------------------------------------------------

/**
 * One immutable proof-of-delivery receipt, minted by the plane for every
 * SUCCESSFUL delivery attempt: when it was delivered, through which
 * provider (ref), the provider's acknowledgment reference when one was
 * returned, and the transport label of the adapter that produced the
 * response. Receipts are never updated or deleted — there is exactly one
 * per successful attempt (a delivered notification is terminal, so at
 * most one per notification in this wave).
 */
export interface NotificationReceipt {
  readonly id: NotificationReceiptId;
  readonly scope: TenantScope;
  readonly notificationId: NotificationId;
  /** The delivery attempt that produced this receipt (1-based). */
  readonly attempt: number;
  readonly recipient: IdentityRef;
  readonly deliveredAt: Timestamp;
  /** §30 provider ref — the transport binding's provider identity. */
  readonly providerId: ProviderId;
  /** The provider's acknowledgment reference, or null when it returns none. */
  readonly providerAckRef: ProviderAckRef | null;
  /** Honest transport self-label (from the provider response's `source`). */
  readonly transportLabel: string;
}
