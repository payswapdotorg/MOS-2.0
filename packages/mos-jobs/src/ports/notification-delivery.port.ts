/**
 * NotificationDeliveryPort (NOTIFY-001) — the notification plane's
 * consumer surface.
 *
 * Durable notification records with dedup idempotency (same logical
 * notification → ONE record; the duplicate submit returns the existing
 * record, never a second delivery), delivery attempts RECORDED as
 * append-only §30 events through the declared provider seam (success →
 * an immutable receipt; failure → a typed reason + the declared retry
 * backoff; exhaustion/non-retriable → terminal failure recorded),
 * suppression at recipient or record level as a FIRST-CLASS recorded
 * outcome with a reason (never a silent drop), and tenant-scoped reads
 * with no existence leaks (§31).
 *
 * WITHOUT task/workflow duplication (the acceptance's core discipline,
 * test-pinned structurally): there are NO claim/lease/execute semantics
 * on notifications — the plane never hands out claimable work units, no
 * lease tokens exist, and `recordDeliveryAttempt` records ONE delivery
 * attempt performed through the injected provider seam at the caller's
 * chosen time. The durable-record disciplines (idempotency, typed
 * failures, retry, terminal failure, append-only history) are consumed
 * as a parallel narrow surface, NOT re-implemented as a task engine.
 *
 * 11 public methods (policy budget 12).
 */

import type { IdentityRef, TenantScope } from "@mos/contracts";

import type { NotificationId, NotificationReceiptId } from "../contracts/ids.js";
import type {
  NotificationListQuery,
  NotificationRecord,
  NotificationReceipt,
  NotificationSubmission,
  RecipientSuppression,
  TypedNotificationFailure,
} from "../contracts/notification.js";
import type { NotificationEvent } from "../contracts/notification-events.js";

/** Optional attribution override for delivery-attempt recording. */
export interface DeliveryAttemptOptions {
  /**
   * §30 executor attribution for the attempt (e.g. the delivery worker's
   * id); defaults to `"notification-plane"`. The plane enriches it with
   * the SUBMITTING actor from the record.
   */
  readonly executor?: string;
}

/**
 * The outcome of one recorded delivery attempt:
 * - `delivered` — the provider transport answered OK; the immutable
 *   receipt is minted and echoed here; the record is terminal delivered;
 * - `retry-scheduled` — a retriable typed failure; the notification
 *   re-queued with the declared backoff (nextAttemptAtMs gates the next
 *   attempt);
 * - `failed` — terminal failure (non-retriable, or declared retry-policy
 *   exhaustion); the typed failure is recorded on the terminal record.
 */
export type NotificationDeliveryResult =
  | {
      readonly outcome: "delivered";
      readonly record: NotificationRecord;
      readonly receipt: NotificationReceipt;
    }
  | {
      readonly outcome: "retry-scheduled";
      readonly record: NotificationRecord;
      readonly failure: TypedNotificationFailure;
      readonly nextAttemptAtMs: number;
      readonly delayMs: number;
    }
  | {
      readonly outcome: "failed";
      readonly record: NotificationRecord;
      readonly failure: TypedNotificationFailure;
      /** True when the terminal failure is declared retry-policy exhaustion. */
      readonly retryExhausted: boolean;
    };

/**
 * The notification delivery plane: idempotent enqueue, tenant-scoped
 * reads with no existence leaks, delivery attempts recorded through the
 * provider seam (receipts on success, typed retries otherwise),
 * recipient/record suppression with reasons, and the append-only
 * history + receipt proof-of-delivery surfaces.
 */
export interface NotificationDeliveryPort {
  /**
   * Enqueues one notification. Idempotent per (scope.tenantId, dedupKey):
   * submitting the same logical notification again returns the EXISTING
   * record unchanged (no second event, no second delivery). When an
   * ACTIVE recipient suppression exists, the record is created directly
   * with status `suppressed` carrying the rule's reason (a first-class
   * recorded outcome — never a silent drop, never an error). Invalid
   * submissions fail closed with a typed error.
   */
  enqueue(submission: NotificationSubmission): NotificationRecord;

  /** Tenant-scoped get; foreign/unknown ids both return undefined. */
  getNotification(
    scope: TenantScope,
    notificationId: NotificationId,
  ): NotificationRecord | undefined;

  /** Tenant-scoped list by recipient/status/kind (§31: no cross-tenant rows). */
  listNotifications(query: NotificationListQuery): readonly NotificationRecord[];

  /**
   * The full append-only event history of one notification (undefined
   * for foreign/unknown ids — no existence leaks). Delivery attempts are
   * events here — recorded, never claimable.
   */
  getNotificationHistory(
    scope: TenantScope,
    notificationId: NotificationId,
  ): readonly NotificationEvent[] | undefined;

  /**
   * Records ONE delivery attempt performed through the injected provider
   * seam: success mints the immutable receipt (provider ref, ack ref when
   * the provider returns one, transport label) and terminates the record
   * as delivered; failure records the typed reason and drives the
   * declared retry policy (retriable + attempts remaining → queued again
   * with the declared backoff; exhaustion or non-retriable → terminal
   * failed). The attempt must target a QUEUED notification whose backoff
   * window has elapsed — otherwise typed failures. This method records
   * events; it never claims, leases or executes work units.
   */
  recordDeliveryAttempt(
    scope: TenantScope,
    notificationId: NotificationId,
    options?: DeliveryAttemptOptions,
  ): NotificationDeliveryResult;

  /**
   * Suppresses one QUEUED notification with an explicit reason (record
   * level): status → suppressed with the suppression recorded + an
   * immutable event. Terminal notifications are immutable (typed
   * failure). Foreign-scope suppression is indistinguishable from
   * unknown-notification (no existence leak).
   */
  suppressNotification(
    scope: TenantScope,
    notificationId: NotificationId,
    reason: string,
    suppressedBy: string,
  ): NotificationRecord;

  /**
   * Activates (or replaces) the recipient suppression rule for one
   * recipient in a tenant scope: every FUTURE enqueue for that recipient
   * is created suppressed carrying this rule's reason.
   */
  suppressRecipient(
    scope: TenantScope,
    recipient: IdentityRef,
    reason: string,
    suppressedBy: string,
  ): RecipientSuppression;

  /**
   * Lifts the active recipient suppression rule. Affects only FUTURE
   * notifications (already-suppressed records are terminal and
   * immutable). Typed failure when no active rule exists.
   */
  liftRecipientSuppression(
    scope: TenantScope,
    recipient: IdentityRef,
    liftedBy: string,
  ): RecipientSuppression;

  /** The ACTIVE recipient suppression rule (undefined when none or lifted). */
  getRecipientSuppression(
    scope: TenantScope,
    recipient: IdentityRef,
  ): RecipientSuppression | undefined;

  /**
   * One immutable proof-of-delivery receipt by id (undefined for
   * foreign/unknown — no existence leaks).
   */
  getReceipt(
    scope: TenantScope,
    receiptId: NotificationReceiptId,
  ): NotificationReceipt | undefined;

  /** The receipts of one notification, in minting order (undefined when unknown/foreign). */
  listReceipts(
    scope: TenantScope,
    notificationId: NotificationId,
  ): readonly NotificationReceipt[] | undefined;
}
