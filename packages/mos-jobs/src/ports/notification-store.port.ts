/**
 * NotificationStorePort — the persistence seam of the notification plane
 * (NOTIFY-001).
 *
 * The plane's domain semantics (dedup idempotency, delivery attempts as
 * recorded events, retry-from-typed-failures, suppression as a recorded
 * outcome, receipt minting) are MOS-owned logic in
 * `adapters/notification-delivery-plane.ts` and run over THIS port. What
 * the port abstracts is exactly the part a real substrate provides:
 * durable record storage, the append-only event log with
 * per-notification monotonic sequences, the dedup-key index, the
 * immutable receipt log and the recipient-suppression state.
 *
 * Future substrate bindings (documented seams): a PostgreSQL-backed
 * store adapter or a Zcode task-infra adapter implementing this port;
 * the plane and every consumer stay unchanged.
 *
 * The disclosed in-memory adapter lives at
 * `adapters/in-memory-notification-store.ts` (EPHEMERAL: process-local,
 * never a durability claim).
 *
 * 11 public methods (policy budget 12).
 */

import type { IdentityRef, TenantScope } from "@mos/contracts";

import type { NotificationEvent, NotificationEventInput } from "../contracts/notification-events.js";
import type {
  NotificationListQuery,
  NotificationRecord,
  NotificationReceipt,
  RecipientSuppression,
} from "../contracts/notification.js";
import type { NotificationDedupKey, NotificationId, NotificationReceiptId } from "../contracts/ids.js";

/** Tenant-scoped record, event, receipt and suppression persistence for notifications. */
export interface NotificationStorePort {
  /** Upserts one notification record (the plane owns all transitions). */
  saveNotification(record: NotificationRecord): void;

  /** Finds one notification by id; foreign-scope and unknown both yield undefined. */
  findNotificationById(
    scope: TenantScope,
    notificationId: NotificationId,
  ): NotificationRecord | undefined;

  /** Finds one notification by dedup key (the idempotency index). */
  findNotificationByDedupKey(
    scope: TenantScope,
    dedupKey: NotificationDedupKey,
  ): NotificationRecord | undefined;

  /** Lists records by recipient/status/kind within one tenant scope (§31). */
  listNotifications(query: NotificationListQuery): readonly NotificationRecord[];

  /**
   * Appends one immutable event, assigning the per-notification monotonic
   * sequence number. Returns the stored event. There is no event
   * update/delete.
   */
  appendNotificationEvent(
    scope: TenantScope,
    event: NotificationEventInput,
  ): NotificationEvent;

  /** The full ordered event history of one notification (undefined when unknown/foreign). */
  listNotificationEvents(
    scope: TenantScope,
    notificationId: NotificationId,
  ): readonly NotificationEvent[] | undefined;

  /** Stores one immutable receipt (no update, no delete — proof-of-delivery surface). */
  saveReceipt(receipt: NotificationReceipt): void;

  /** Finds one receipt by id; foreign-scope and unknown both yield undefined. */
  findReceiptById(
    scope: TenantScope,
    receiptId: NotificationReceiptId,
  ): NotificationReceipt | undefined;

  /** The receipts of one notification, in minting order (undefined when unknown/foreign). */
  listReceiptsByNotification(
    scope: TenantScope,
    notificationId: NotificationId,
  ): readonly NotificationReceipt[] | undefined;

  /**
   * Upserts the recipient suppression rule for (scope, recipient) — one
   * rule per recipient; suppressing again replaces the active rule (the
   * notification-level suppressed events remain the audit trail).
   */
  upsertRecipientSuppression(suppression: RecipientSuppression): void;

  /** The CURRENT suppression rule for (scope, recipient); undefined when none or lifted. */
  findRecipientSuppression(
    scope: TenantScope,
    recipient: IdentityRef,
  ): RecipientSuppression | undefined;
}
