/**
 * The notification delivery plane adapter (NOTIFY-001) — MOS-owned plane
 * semantics over a {@link NotificationStorePort} + a
 * {@link NotificationProviderPort}.
 *
 * This adapter is the REAL domain logic of the notification plane:
 * idempotent enqueue by dedup key (the SAME logical notification
 * submitted twice yields ONE record — the duplicate returns the
 * existing record, never a second delivery), delivery attempts RECORDED
 * as append-only §30 events through the declared provider transport
 * seam (success mints the immutable receipt; failure records the typed
 * reason and drives the declared retry policy — retriable + attempts
 * remaining re-queues with the declared backoff, exhaustion or
 * non-retriable terminates as failed with the typed failure recorded),
 * suppression at recipient or record level as a FIRST-CLASS recorded
 * outcome with a reason (never a silent drop), and tenant-scoped reads
 * with no existence leaks (§31).
 *
 * WITHOUT task/workflow duplication (the acceptance's core discipline,
 * structurally test-pinned): the plane has NO claim/lease/execute
 * semantics — `recordDeliveryAttempt` records ONE delivery attempt
 * performed through the injected provider seam at the caller's chosen
 * time; it never hands out claimable work units, there are no lease
 * tokens, no in-flight/running state, no worker vocabulary. The
 * durable-record disciplines (idempotency, typed failures, declared
 * retry backoff, terminal failure, append-only history) are consumed as
 * a parallel narrow surface, NOT re-implemented as a task engine.
 *
 * The backing STORE is the disclosed in-memory double in tests; the
 * real durable store binds behind the same port (§26 family seam). The
 * PROVIDER is the declared transport seam — the disclosed in-memory
 * double in tests; real provider bindings (email/push/webhook adapters
 * over the provider-contract vocabulary) are composition-root work.
 */

import { randomUUID } from "node:crypto";
import type { IdentityRef, TenantScope, Timestamp } from "@mos/contracts";

import type {
  NotificationActorAttribution,
  NotificationAttemptObservability,
  NotificationRecord,
  NotificationSubmission,
  RecipientSuppression,
} from "../contracts/notification.js";
import {
  notificationId as notificationIdBuilder,
  notificationReceiptId,
  deliveryAttemptId,
} from "../contracts/ids.js";
import type { NotificationId } from "../contracts/ids.js";
import type {
  DeliveryAttemptOptions,
  NotificationDeliveryPort,
  NotificationDeliveryResult,
} from "../ports/notification-delivery.port.js";
import type { NotificationProviderPort } from "../ports/notification-provider.port.js";
import type { NotificationStorePort } from "../ports/notification-store.port.js";
import { NotificationPlaneError } from "../domain/errors.js";
import {
  requireNotification,
  requireSuppressionReason,
} from "../domain/notification-guards.js";
import { decideNotificationRetry, notificationRetryDelayMs } from "../domain/notification-retry.js";
import { notificationSubmissionViolations } from "../domain/notification-submission-validation.js";

/** Options for the notification delivery plane adapter. */
export interface NotificationDeliveryPlaneOptions {
  /** The persistence seam (in-memory double in tests; real store later). */
  readonly store: NotificationStorePort;
  /** The declared transport seam (in-memory double in tests; real binding later). */
  readonly provider: NotificationProviderPort;
  /** Injectable ISO clock for stamps (default: real time). */
  readonly clock?: () => Timestamp;
  /** Injectable epoch-ms clock (default: Date.now). */
  readonly now?: () => number;
  /** Injectable notification id factory (default: `notification_` + random UUID). */
  readonly notificationIdFactory?: () => string;
  /** Injectable delivery attempt id factory (default: `attempt_` + random UUID). */
  readonly attemptIdFactory?: () => string;
  /** Injectable receipt id factory (default: `receipt_` + random UUID). */
  readonly receiptIdFactory?: () => string;
  /** Injectable suppression rule id factory (default: `suppression_` + random UUID). */
  readonly suppressionIdFactory?: () => string;
}

/** Creates the notification delivery plane over store + provider seams. */
export function createNotificationDeliveryPlane(
  options: NotificationDeliveryPlaneOptions,
): NotificationDeliveryPort {
  const store = options.store;
  const provider = options.provider;
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  const now = options.now ?? Date.now;
  const notificationIdFactory = options.notificationIdFactory
    ?? (() => `notification_${randomUUID()}`);
  const attemptIdFactory = options.attemptIdFactory
    ?? (() => `attempt_${randomUUID()}`);
  const receiptIdFactory = options.receiptIdFactory
    ?? (() => `receipt_${randomUUID()}`);
  const suppressionIdFactory = options.suppressionIdFactory
    ?? (() => `suppression_${randomUUID()}`);

  function saved(record: NotificationRecord): NotificationRecord {
    store.saveNotification(record);
    const refreshed = store.findNotificationById(record.scope, record.id);
    if (refreshed === undefined) {
      throw new NotificationPlaneError(
        "unknown-notification",
        "store lost a just-saved notification record",
        { notificationId: record.id as string },
      );
    }
    return refreshed;
  }

  const plane: NotificationDeliveryPort = {
    enqueue(submission: NotificationSubmission): NotificationRecord {
      const violations = notificationSubmissionViolations(submission);
      if (violations.length > 0) {
        throw new NotificationPlaneError(
          "invalid-notification-submission",
          `invalid notification submission: ${violations.join("; ")}`,
          { violations },
        );
      }

      // Idempotency: same (tenant, dedupKey) → the EXISTING record, no event.
      const existing = store.findNotificationByDedupKey(submission.scope, submission.dedupKey);
      if (existing !== undefined) {
        return existing;
      }

      // Recipient-level suppression: the record is created directly with
      // status `suppressed` carrying the active rule's reason — a
      // first-class recorded outcome, never a silent drop, never an error.
      const activeRule = store.findRecipientSuppression(submission.scope, submission.recipient);
      const recipientSuppressed = activeRule !== undefined && activeRule.liftedAt === null;

      const id = notificationIdBuilder(notificationIdFactory());
      const stamp = clock();
      const record: NotificationRecord = {
        id,
        dedupKey: submission.dedupKey,
        scope: submission.scope,
        kind: submission.kind,
        contractVersion: submission.contractVersion,
        submittedBy: submission.submittedBy,
        recipient: submission.recipient,
        subject: submission.subject,
        status: recipientSuppressed ? "suppressed" : "queued",
        attemptCount: 0,
        retryPolicy: submission.retryPolicy,
        observability: null,
        failure: null,
        createdAt: stamp,
        updatedAt: stamp,
        deliveredAt: null,
        nextAttemptAtMs: null,
        suppressedAt: recipientSuppressed ? stamp : null,
        suppression: recipientSuppressed
          ? {
            level: "recipient",
            reason: activeRule?.reason ?? "",
            suppressedBy: activeRule?.suppressedBy ?? "",
            suppressedAt: stamp,
            recipientSuppressionId: activeRule?.id ?? null,
          }
          : null,
      };
      store.saveNotification(record);
      store.appendNotificationEvent(submission.scope, {
        type: "enqueued",
        notificationId: id,
        attempt: 0,
        actor: { executor: "notification-plane", submittedBy: submission.submittedBy },
        recordedAt: stamp,
        dedupKey: submission.dedupKey,
        kind: submission.kind,
        contractVersion: submission.contractVersion,
        submittedBy: submission.submittedBy,
        recipient: submission.recipient,
        subject: submission.subject,
      });
      if (recipientSuppressed && activeRule !== undefined) {
        store.appendNotificationEvent(submission.scope, {
          type: "suppressed",
          notificationId: id,
          attempt: 0,
          actor: { executor: "notification-plane", submittedBy: submission.submittedBy },
          recordedAt: stamp,
          level: "recipient",
          reason: activeRule.reason,
          suppressedBy: activeRule.suppressedBy,
          recipientSuppressionId: activeRule.id,
        });
      }
      return saved(record);
    },

    getNotification(scope, notificationId) {
      return store.findNotificationById(scope, notificationId);
    },

    listNotifications(query) {
      return store.listNotifications(query);
    },

    getNotificationHistory(scope, notificationId) {
      return store.listNotificationEvents(scope, notificationId);
    },

    recordDeliveryAttempt(
      scope: TenantScope,
      notificationId: NotificationId,
      attemptOptions?: DeliveryAttemptOptions,
    ): NotificationDeliveryResult {
      const record = requireNotification(store, scope, notificationId);
      if (record.status !== "queued") {
        throw new NotificationPlaneError(
          "notification-not-deliverable",
          `notification ${record.id as string} is ${record.status}; only queued notifications accept delivery attempts`,
          { notificationId: record.id as string, status: record.status },
        );
      }
      if (record.nextAttemptAtMs !== null && now() < record.nextAttemptAtMs) {
        throw new NotificationPlaneError(
          "delivery-backoff-not-elapsed",
          `notification ${record.id as string} is inside its declared retry backoff window until ${record.nextAttemptAtMs}`,
          { notificationId: record.id as string, nextAttemptAtMs: record.nextAttemptAtMs },
        );
      }

      const attempt = record.attemptCount + 1;
      const attemptId = deliveryAttemptId(attemptIdFactory());
      const attribution: NotificationActorAttribution = {
        executor: attemptOptions?.executor ?? "notification-plane",
        submittedBy: record.submittedBy,
      };

      const startedAtMs = now();
      const response = provider.deliver({
        requestId: attemptId,
        scope: record.scope,
        notificationId: record.id,
        kind: record.kind,
        recipient: record.recipient,
        subject: record.subject,
        attempt,
      });
      const durationMs = Math.max(0, now() - startedAtMs);

      const observability: NotificationAttemptObservability = {
        requestId: attemptId,
        providerId: provider.providerId,
        actor: attribution,
        durationMs,
        failure: response.ok ? null : response.failure,
        warnings: response.ok ? response.warnings : [],
        transportLabel: response.source,
      };

      if (response.ok) {
        const stamp = clock();
        const receipt = {
          id: notificationReceiptId(receiptIdFactory()),
          scope: record.scope,
          notificationId: record.id,
          attempt,
          recipient: record.recipient,
          deliveredAt: stamp,
          providerId: provider.providerId,
          providerAckRef: response.ackRef,
          transportLabel: response.source,
        };
        const delivered = saved({
          ...record,
          status: "delivered",
          attemptCount: attempt,
          observability,
          failure: null,
          deliveredAt: stamp,
          nextAttemptAtMs: null,
          updatedAt: stamp,
        });
        store.saveReceipt(receipt);
        // The returned receipt is the STORE's frozen authority copy.
        const storedReceipt = store.findReceiptById(record.scope, receipt.id);
        const authorityReceipt = storedReceipt ?? receipt;
        store.appendNotificationEvent(record.scope, {
          type: "delivered",
          notificationId: record.id,
          attempt,
          actor: attribution,
          recordedAt: stamp,
          observability,
          receiptId: authorityReceipt.id,
          deliveredAt: stamp,
          providerAckRef: response.ackRef,
        });
        return { outcome: "delivered", record: delivered, receipt: authorityReceipt };
      }

      const failure = response.failure;
      const decision = decideNotificationRetry(record.retryPolicy, attempt, failure);
      if (decision.decision === "retry") {
        const delayMs = notificationRetryDelayMs(record.retryPolicy, attempt);
        const nextAttemptAtMs = now() + delayMs;
        const stamp = clock();
        const requeued = saved({
          ...record,
          status: "queued",
          attemptCount: attempt,
          observability,
          failure,
          nextAttemptAtMs,
          updatedAt: stamp,
        });
        store.appendNotificationEvent(record.scope, {
          type: "retry-scheduled",
          notificationId: record.id,
          attempt,
          actor: attribution,
          recordedAt: stamp,
          observability,
          failure,
          nextAttemptAtMs,
          delayMs,
        });
        return { outcome: "retry-scheduled", record: requeued, failure, nextAttemptAtMs, delayMs };
      }

      const stamp = clock();
      const retryExhausted = failure.retriable;
      const failed = saved({
        ...record,
        status: "failed",
        attemptCount: attempt,
        observability,
        failure,
        nextAttemptAtMs: null,
        updatedAt: stamp,
      });
      store.appendNotificationEvent(record.scope, {
        type: "delivery-failed",
        notificationId: record.id,
        attempt,
        actor: attribution,
        recordedAt: stamp,
        observability,
        failure,
        attempts: attempt,
        retryExhausted,
      });
      return { outcome: "failed", record: failed, failure, retryExhausted };
    },

    suppressNotification(scope, notificationId, reason, suppressedBy): NotificationRecord {
      requireSuppressionReason(reason, suppressedBy);
      const record = requireNotification(store, scope, notificationId);
      if (record.status !== "queued") {
        throw new NotificationPlaneError(
          "notification-not-suppressible",
          `notification ${record.id as string} is ${record.status}; only queued notifications can be suppressed`,
          { notificationId: record.id as string, status: record.status },
        );
      }
      const stamp = clock();
      const suppressed = saved({
        ...record,
        status: "suppressed",
        suppressedAt: stamp,
        suppression: {
          level: "record",
          reason,
          suppressedBy,
          suppressedAt: stamp,
          recipientSuppressionId: null,
        },
        updatedAt: stamp,
      });
      store.appendNotificationEvent(record.scope, {
        type: "suppressed",
        notificationId: record.id,
        attempt: 0,
        actor: { executor: suppressedBy, submittedBy: record.submittedBy },
        recordedAt: stamp,
        level: "record",
        reason,
        suppressedBy,
        recipientSuppressionId: null,
      });
      return suppressed;
    },

    suppressRecipient(scope, recipient: IdentityRef, reason, suppressedBy): RecipientSuppression {
      requireSuppressionReason(reason, suppressedBy);
      const rule: RecipientSuppression = {
        id: suppressionIdFactory(),
        scope,
        recipient,
        reason,
        suppressedBy,
        suppressedAt: clock(),
        liftedAt: null,
        liftedBy: null,
      };
      store.upsertRecipientSuppression(rule);
      return rule;
    },

    liftRecipientSuppression(scope, recipient: IdentityRef, liftedBy): RecipientSuppression {
      if (typeof liftedBy !== "string" || liftedBy === "") {
        throw new NotificationPlaneError(
          "invalid-suppression",
          "lifting a suppression requires a non-empty liftedBy attribution",
          {},
        );
      }
      const rule = store.findRecipientSuppression(scope, recipient);
      if (rule === undefined || rule.liftedAt !== null) {
        throw new NotificationPlaneError(
          "unknown-suppression",
          `no active recipient suppression for ${recipient as string} in the requesting scope`,
          { recipient: recipient as string },
        );
      }
      const lifted: RecipientSuppression = {
        ...rule,
        liftedAt: clock(),
        liftedBy,
      };
      store.upsertRecipientSuppression(lifted);
      return lifted;
    },

    getRecipientSuppression(scope, recipient: IdentityRef) {
      const rule = store.findRecipientSuppression(scope, recipient);
      if (rule === undefined || rule.liftedAt !== null) {
        return undefined;
      }
      return rule;
    },

    getReceipt(scope, receiptId) {
      return store.findReceiptById(scope, receiptId);
    },

    listReceipts(scope, notificationId) {
      return store.listReceiptsByNotification(scope, notificationId);
    },
  };

  return plane;
}
