/**
 * DISCLOSED TEST DOUBLE — in-memory NotificationStorePort (NOTIFY-001).
 *
 * ⚠ IN-MEMORY ADAPTER ONLY — NEVER A DURABILITY CLAIM ⚠
 *
 * Process-local persistence for the notification plane: records are
 * keyed per (tenant, id) — the cross-tenant bleed lesson of W3-A is
 * baked into the keying — and per (tenant, dedupKey) for idempotency.
 * Events are appended with per-notification monotonic sequences and
 * NEVER updated or deleted; receipts are stored once and never updated
 * or deleted (the proof-of-delivery surface is immutable). The
 * recipient-suppression state is one upsertable rule per
 * (tenant, recipient). Everything returned is deep-frozen.
 *
 * The REAL durable store (PostgreSQL-backed MOS authority, or a Zcode
 * task-infra adapter) implements the same port; the plane and all
 * consumers stay unchanged (documented future seam, §26 family).
 */

import type { IdentityRef, TenantScope } from "@mos/contracts";

import type { NotificationEvent, NotificationEventInput } from "../contracts/notification-events.js";
import type {
  NotificationListQuery,
  NotificationRecord,
  NotificationReceipt,
  RecipientSuppression,
} from "../contracts/notification.js";
import type {
  NotificationDedupKey,
  NotificationId,
  NotificationReceiptId,
} from "../contracts/ids.js";
import type { NotificationStorePort } from "../ports/notification-store.port.js";
import { deepFreeze } from "./in-memory-durable-job-store.js";

/**
 * Clone-then-freeze: the store takes OWNERSHIP of everything it saves.
 * Caller-supplied records/events/receipts and every nested payload are
 * deep-cloned BEFORE freezing (the SHARED deep-freeze implementation of
 * the package's in-memory doubles — one freeze semantics, zero drift),
 * so no object the caller keeps (a submission, a typed failure, a
 * provider response) is ever mutated or frozen in place — the frozen
 * authority copy is always a private structural copy.
 */
function owned<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

/** Creates the DISCLOSED in-memory {@link NotificationStorePort}. */
export function createInMemoryNotificationStore(): NotificationStorePort {
  /** (tenant, notificationId) → record. Composite keys: no cross-tenant bleed. */
  const notifications = new Map<string, NotificationRecord>();
  /** (tenant, dedupKey) → notificationId (idempotency index). */
  const byDedupKey = new Map<string, NotificationId>();
  /** (tenant, notificationId) → ordered events. */
  const events = new Map<string, NotificationEvent[]>();
  /** notificationId → next sequence (scoped by construction to one notification). */
  const sequences = new Map<string, number>();
  /** (tenant, notificationId) → receipts in minting order. */
  const receipts = new Map<string, NotificationReceipt[]>();
  /** (tenant, receiptId) → receipt. */
  const receiptsById = new Map<string, NotificationReceipt>();
  /** (tenant, recipient) → the current suppression rule. */
  const suppressions = new Map<string, RecipientSuppression>();
  /** Composite keys in insertion order for listing scans. */
  const insertion: string[] = [];

  const notificationKeyOf = (tenantId: string, id: string): string => `${tenantId}:${id}`;
  const dedupKeyOf = (tenantId: string, key: string): string => `${tenantId}:${key}`;
  const suppressionKeyOf = (tenantId: string, recipient: string): string =>
    `${tenantId}:${recipient}`;

  function storedEvent(
    tenantId: string,
    notificationId: NotificationId,
    event: NotificationEventInput,
  ): NotificationEvent {
    const mapKey = notificationKeyOf(tenantId, notificationId as string);
    const next = (sequences.get(mapKey) ?? 0) + 1;
    sequences.set(mapKey, next);
    return owned({ ...event, sequence: next }) as NotificationEvent;
  }

  const store: NotificationStorePort = {
    saveNotification(record: NotificationRecord): void {
      const tenantId = record.scope.tenantId as string;
      const mapKey = notificationKeyOf(tenantId, record.id as string);
      if (!notifications.has(mapKey)) {
        insertion.push(mapKey);
      }
      notifications.set(mapKey, owned(record) as NotificationRecord);
      byDedupKey.set(dedupKeyOf(tenantId, record.dedupKey as string), record.id);
    },

    findNotificationById(scope: TenantScope, notificationId: NotificationId) {
      const record = notifications.get(
        notificationKeyOf(scope.tenantId as string, notificationId as string),
      );
      if (record === undefined || record.scope.workspaceId !== scope.workspaceId) {
        return undefined;
      }
      return record;
    },

    findNotificationByDedupKey(scope: TenantScope, dedupKey: NotificationDedupKey) {
      const notificationId = byDedupKey.get(
        dedupKeyOf(scope.tenantId as string, dedupKey as string),
      );
      if (notificationId === undefined) {
        return undefined;
      }
      return store.findNotificationById(scope, notificationId);
    },

    listNotifications(query: NotificationListQuery) {
      const results: NotificationRecord[] = [];
      for (const mapKey of insertion) {
        const record = notifications.get(mapKey);
        const candidate = record !== undefined
          && (record.scope.tenantId as string) === (query.scope.tenantId as string)
          && (query.scope.workspaceId === undefined
            || record.scope.workspaceId === query.scope.workspaceId)
          && (query.recipient === undefined || record.recipient === query.recipient)
          && (query.statuses === undefined || query.statuses.includes(record.status))
          && (query.kinds === undefined || query.kinds.includes(record.kind));
        if (candidate) {
          results.push(record);
          if (query.limit !== undefined && results.length >= query.limit) {
            break;
          }
        }
      }
      return results;
    },

    appendNotificationEvent(scope: TenantScope, event: NotificationEventInput) {
      const tenantId = scope.tenantId as string;
      const stored = storedEvent(tenantId, event.notificationId, event);
      const mapKey = notificationKeyOf(tenantId, event.notificationId as string);
      const list = events.get(mapKey) ?? [];
      list.push(stored);
      events.set(mapKey, list);
      return stored;
    },

    listNotificationEvents(scope: TenantScope, notificationId: NotificationId) {
      return events.get(notificationKeyOf(scope.tenantId as string, notificationId as string));
    },

    saveReceipt(receipt: NotificationReceipt): void {
      const stored = owned(receipt);
      const tenantId = stored.scope.tenantId as string;
      const list = receipts.get(notificationKeyOf(tenantId, stored.notificationId as string)) ?? [];
      list.push(stored);
      receipts.set(notificationKeyOf(tenantId, stored.notificationId as string), list);
      receiptsById.set(`${tenantId}:${stored.id as string}`, stored);
    },

    findReceiptById(scope: TenantScope, receiptId: NotificationReceiptId) {
      const receipt = receiptsById.get(`${scope.tenantId as string}:${receiptId as string}`);
      if (receipt === undefined || receipt.scope.workspaceId !== scope.workspaceId) {
        return undefined;
      }
      return receipt;
    },

    listReceiptsByNotification(scope: TenantScope, notificationId: NotificationId) {
      return receipts.get(notificationKeyOf(scope.tenantId as string, notificationId as string));
    },

    upsertRecipientSuppression(suppression: RecipientSuppression): void {
      suppressions.set(
        suppressionKeyOf(suppression.scope.tenantId as string, suppression.recipient as string),
        owned(suppression) as RecipientSuppression,
      );
    },

    findRecipientSuppression(scope: TenantScope, recipient: IdentityRef) {
      const rule = suppressions.get(
        suppressionKeyOf(scope.tenantId as string, recipient as string),
      );
      if (rule === undefined || rule.scope.workspaceId !== scope.workspaceId) {
        return undefined;
      }
      return rule;
    },
  };

  return store;
}
