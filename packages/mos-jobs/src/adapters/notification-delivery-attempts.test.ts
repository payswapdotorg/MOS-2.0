/**
 * Notification delivery attempt tests (NOTIFY-001): success → immutable
 * receipts (completeness), §30 observability completeness on every
 * attempt event, failed delivery → typed reason + declared retry
 * backoff → terminal failure recorded, backoff gating, tenant scoping
 * and determinism with injectable clocks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { NotificationPlaneError } from "../domain/errors.js";
import { IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE } from "./in-memory-notification-provider.js";
import {
  FIXED_CLOCK,
  PROVIDER_ID,
  RECIPIENT_A,
  SCOPE_A,
  SCOPE_B,
  createFakeClock,
  dedupKeyOf,
  makeNotificationStack,
  makeNotificationSubmission,
} from "../testing/notification-fixtures.js";
import type { NotificationReceipt } from "../contracts/notification.js";

/** Deep frozen-check for JSON-shaped values. */
function assertDeepFrozen(value: unknown, path = "root"): void {
  if (value !== null && typeof value === "object") {
    assert.ok(Object.isFrozen(value), `${path} is frozen`);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => assertDeepFrozen(entry, `${path}[${index}]`));
    } else {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assertDeepFrozen(child, `${path}.${key}`);
      }
    }
  }
}

test("a successful attempt delivers, mints the receipt and terminates the record", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());

  const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(result.outcome, "delivered");
  if (result.outcome !== "delivered") {
    assert.fail("unreachable");
  }

  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.status, "delivered");
  assert.equal(record.attemptCount, 1);
  assert.equal(record.deliveredAt, FIXED_CLOCK());
  assert.equal(record.failure, null);

  const receipt = result.receipt;
  assert.equal(receipt.id, "receipt-1");
  assert.equal(receipt.notificationId, enqueued.id);
  assert.equal(receipt.attempt, 1);
  assert.equal(receipt.recipient, RECIPIENT_A);
  assert.equal(receipt.deliveredAt, FIXED_CLOCK());
  assert.equal(receipt.providerId, PROVIDER_ID);
  assert.equal(receipt.providerAckRef, "ack:attempt-1");
  assert.equal(receipt.transportLabel, IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE);
});

test("receipts are immutable and complete — frozen, re-readable, mutation-rejecting", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());
  const { receipt } = (() => {
    const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
    assert.equal(result.outcome, "delivered");
    return result as { receipt: NotificationReceipt };
  })();

  assertDeepFrozen(receipt, "receipt");

  const reread = plane.getReceipt(SCOPE_A, receipt.id);
  assert.ok(reread !== undefined);
  assert.deepEqual(reread, receipt);
  assert.throws(() => {
    (reread as unknown as { deliveredAt: string }).deliveredAt = "2020-01-01T00:00:00.000Z";
  }, TypeError);

  const listed = plane.listReceipts(SCOPE_A, enqueued.id);
  assert.ok(listed !== undefined);
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], receipt);
});

test("receipt carries a null ackRef when the provider returns none, and the custom ack when it does", () => {
  const nullAck = makeNotificationStack({
    routes: [{ kind: "ok", ackRef: null }],
  });
  const a = nullAck.plane.enqueue(makeNotificationSubmission());
  const aResult = nullAck.plane.recordDeliveryAttempt(SCOPE_A, a.id);
  assert.equal(aResult.outcome, "delivered");
  if (aResult.outcome === "delivered") {
    assert.equal(aResult.receipt.providerAckRef, null);
  }

  const customAck = makeNotificationStack({
    routes: [{ kind: "ok", ackRef: "ack:custom-42" }],
  });
  const b = customAck.plane.enqueue(makeNotificationSubmission());
  const bResult = customAck.plane.recordDeliveryAttempt(SCOPE_A, b.id);
  assert.equal(bResult.outcome, "delivered");
  if (bResult.outcome === "delivered") {
    assert.equal(bResult.receipt.providerAckRef, "ack:custom-42");
  }
});

test("receipt reads are tenant-scoped with no existence leaks", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());
  const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(result.outcome, "delivered");
  if (result.outcome !== "delivered") {
    assert.fail("unreachable");
  }

  assert.ok(plane.getReceipt(SCOPE_A, result.receipt.id) !== undefined);
  assert.equal(plane.getReceipt(SCOPE_B, result.receipt.id), undefined);
  assert.equal(
    plane.getReceipt(SCOPE_A, "receipt-nope" as NotificationReceipt["id"]),
    undefined,
  );
  assert.equal(plane.listReceipts(SCOPE_B, enqueued.id), undefined);
});

test("every attempt event carries the full §30 observability block", () => {
  const { plane } = makeNotificationStack({
    routes: [{ kind: "ok", warnings: [{ code: "slow-transport", message: "p95 exceeded" }] }],
  });
  const enqueued = plane.enqueue(makeNotificationSubmission());

  const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id, {
    executor: "delivery-worker-7",
  });
  assert.equal(result.outcome, "delivered");
  if (result.outcome !== "delivered") {
    assert.fail("unreachable");
  }

  // §30 on the RECORD (latest attempt summary).
  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined && record.observability !== null);
  const observability = record.observability;
  assert.equal(observability.requestId, "attempt-1", "§30 request id");
  assert.equal(observability.providerId, PROVIDER_ID, "§30 provider ref");
  assert.deepEqual(
    observability.actor,
    {
      executor: "delivery-worker-7",
      submittedBy: { kind: "service", name: "studio-runtime" },
    },
    "§30 actor attribution (executor enriched with the submitting actor)",
  );
  assert.equal(typeof observability.durationMs, "number");
  assert.ok(observability.durationMs >= 0);
  assert.equal(observability.failure, null);
  assert.deepEqual(observability.warnings, [
    { code: "slow-transport", message: "p95 exceeded" },
  ]);
  assert.equal(observability.transportLabel, IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE);

  // §30 on the EVENT (the recorded delivery attempt).
  const history = plane.getNotificationHistory(SCOPE_A, enqueued.id);
  assert.ok(history !== undefined);
  const deliveredEvent = history.find((event) => event.type === "delivered");
  assert.ok(deliveredEvent !== undefined && deliveredEvent.type === "delivered");
  if (deliveredEvent.type === "delivered") {
    assert.deepEqual(deliveredEvent.observability, observability);
    assert.equal(deliveredEvent.receiptId, result.receipt.id);
    assert.equal(deliveredEvent.deliveredAt, FIXED_CLOCK());
    assert.equal(deliveredEvent.providerAckRef, "ack:attempt-1");
  }
});

test("the default §30 executor attribution is the plane, enriched with the submitter", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());
  const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(result.outcome, "delivered");
  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined && record.observability !== null);
  assert.deepEqual(record.observability.actor, {
    executor: "notification-plane",
    submittedBy: { kind: "service", name: "studio-runtime" },
  });
});

test("a retriable failure records the typed reason and schedules the declared backoff", () => {
  const clock = createFakeClock(1_000);
  const { plane } = makeNotificationStack({
    clock,
    routes: [
      { kind: "fail", code: "provider-transport-failed", message: "smtp down", retriable: true },
    ],
  });
  const enqueued = plane.enqueue(
    makeNotificationSubmission({
      retryPolicy: { maxAttempts: 3, backoffScheduleMs: [500, 2_000] },
    }),
  );

  const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(result.outcome, "retry-scheduled");
  if (result.outcome !== "retry-scheduled") {
    assert.fail("unreachable");
  }

  assert.equal(result.failure.code, "provider-transport-failed");
  assert.equal(result.failure.message, "smtp down");
  assert.equal(result.failure.retriable, true);
  assert.equal(result.delayMs, 500, "declared backoff schedule[0]");
  assert.equal(result.nextAttemptAtMs, 1_000 + 500);

  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.status, "queued", "retriable failure re-queues — no in-flight state");
  assert.equal(record.attemptCount, 1);
  assert.equal(record.failure?.code, "provider-transport-failed");
  assert.equal(record.nextAttemptAtMs, 1_500);

  const history = plane.getNotificationHistory(SCOPE_A, enqueued.id);
  assert.ok(history !== undefined);
  const retryEvent = history.find((event) => event.type === "retry-scheduled");
  assert.ok(retryEvent !== undefined && retryEvent.type === "retry-scheduled");
  if (retryEvent.type === "retry-scheduled") {
    assert.equal(retryEvent.delayMs, 500);
    assert.equal(retryEvent.nextAttemptAtMs, 1_500);
    assert.equal(retryEvent.failure.code, "provider-transport-failed");
    assert.ok(retryEvent.observability.failure !== null, "§30 failure on the attempt event");
  }
});

test("the declared backoff gates the next attempt until the window elapses", () => {
  const clock = createFakeClock(1_000);
  const { plane } = makeNotificationStack({
    clock,
    routes: [
      { kind: "fail", code: "provider-transport-failed", message: "smtp down", retriable: true },
      { kind: "ok" },
    ],
  });
  const enqueued = plane.enqueue(
    makeNotificationSubmission({
      retryPolicy: { maxAttempts: 2, backoffScheduleMs: [500] },
    }),
  );

  const first = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(first.outcome, "retry-scheduled");

  // Inside the backoff window: fail closed.
  assert.throws(
    () => plane.recordDeliveryAttempt(SCOPE_A, enqueued.id),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "delivery-backoff-not-elapsed");
      assert.deepEqual(error.details, { notificationId: enqueued.id, nextAttemptAtMs: 1_500 });
      return true;
    },
  );

  // Exactly at the boundary: deliverable (window elapsed).
  clock.advance(500);
  const second = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(second.outcome, "delivered");
});

test("retry → success after the backoff: attempt count 2, one receipt, full history", () => {
  const clock = createFakeClock(1_000);
  const { plane } = makeNotificationStack({
    clock,
    routes: [
      { kind: "fail", code: "provider-transport-failed", message: "smtp down", retriable: true },
      { kind: "ok", ackRef: "ack:second-try" },
    ],
  });
  const enqueued = plane.enqueue(
    makeNotificationSubmission({
      retryPolicy: { maxAttempts: 3, backoffScheduleMs: [100] },
    }),
  );

  const first = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(first.outcome, "retry-scheduled");
  clock.advance(100);
  const second = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(second.outcome, "delivered");
  if (second.outcome !== "delivered") {
    assert.fail("unreachable");
  }

  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.attemptCount, 2);
  assert.equal(record.status, "delivered");
  assert.equal(record.nextAttemptAtMs, null);
  assert.equal(second.receipt.attempt, 2);
  assert.equal(second.receipt.providerAckRef, "ack:second-try");

  const history = plane.getNotificationHistory(SCOPE_A, enqueued.id);
  assert.ok(history !== undefined);
  assert.deepEqual(
    history.map((event) => event.type),
    ["enqueued", "retry-scheduled", "delivered"],
  );
  assert.equal(plane.listReceipts(SCOPE_A, enqueued.id)?.length, 1);
});

test("retry exhaustion terminates as failed with the typed failure recorded", () => {
  const clock = createFakeClock(0);
  const { plane } = makeNotificationStack({
    clock,
    routes: [
      { kind: "fail", code: "provider-transport-failed", message: "smtp down", retriable: true },
    ],
  });
  const enqueued = plane.enqueue(
    makeNotificationSubmission({
      dedupKey: dedupKeyOf("exhaustion-case"),
      retryPolicy: { maxAttempts: 2, backoffScheduleMs: [10, 20] },
    }),
  );

  const first = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(first.outcome, "retry-scheduled");
  clock.advance(10);
  const second = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(second.outcome, "failed");
  if (second.outcome !== "failed") {
    assert.fail("unreachable");
  }

  assert.equal(second.retryExhausted, true, "declared retry-policy exhaustion");
  assert.equal(second.failure.code, "provider-transport-failed");

  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.status, "failed");
  assert.equal(record.attemptCount, 2);
  assert.equal(record.failure?.code, "provider-transport-failed");
  assert.equal(record.nextAttemptAtMs, null);

  const history = plane.getNotificationHistory(SCOPE_A, enqueued.id);
  assert.ok(history !== undefined);
  const failedEvent = history.find((event) => event.type === "delivery-failed");
  assert.ok(failedEvent !== undefined && failedEvent.type === "delivery-failed");
  if (failedEvent.type === "delivery-failed") {
    assert.equal(failedEvent.attempts, 2);
    assert.equal(failedEvent.retryExhausted, true);
    assert.equal(failedEvent.failure.code, "provider-transport-failed");
    assert.ok(failedEvent.observability.failure !== null);
  }
  assert.equal(plane.listReceipts(SCOPE_A, enqueued.id), undefined, "no receipt on failure");
});

test("a non-retriable provider rejection terminates immediately as failed", () => {
  const { plane } = makeNotificationStack({
    routes: [
      { kind: "fail", code: "provider-rejected", message: "unknown recipient address" },
    ],
  });
  const enqueued = plane.enqueue(
    makeNotificationSubmission({
      dedupKey: dedupKeyOf("rejected-case"),
      retryPolicy: { maxAttempts: 5, backoffScheduleMs: [100] },
    }),
  );

  const result = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(result.outcome, "failed");
  if (result.outcome !== "failed") {
    assert.fail("unreachable");
  }
  assert.equal(result.retryExhausted, false, "non-retriable — not exhaustion");
  assert.equal(result.failure.code, "provider-rejected");
  assert.equal(result.failure.retriable, false);

  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.status, "failed");
  assert.equal(record.attemptCount, 1);
});

test("terminal notifications are immutable — no second attempt, receipt or event", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());
  const delivered = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(delivered.outcome, "delivered");

  assert.throws(
    () => plane.recordDeliveryAttempt(SCOPE_A, enqueued.id),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "notification-not-deliverable");
      assert.deepEqual(error.details, {
        notificationId: enqueued.id,
        status: "delivered",
      });
      return true;
    },
  );

  assert.equal(plane.listReceipts(SCOPE_A, enqueued.id)?.length, 1);
  const history = plane.getNotificationHistory(SCOPE_A, enqueued.id);
  assert.ok(history !== undefined);
  assert.equal(history.length, 2, "enqueued + delivered only");
});

test("delivery attempts on unknown or foreign notifications fail identically (no existence leaks)", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());

  const unknown = captureError(() =>
    plane.recordDeliveryAttempt(SCOPE_A, "notification-nope" as typeof enqueued.id));
  const foreign = captureError(() => plane.recordDeliveryAttempt(SCOPE_B, enqueued.id));

  assert.ok(unknown instanceof NotificationPlaneError);
  assert.ok(foreign instanceof NotificationPlaneError);
  assert.equal((unknown as NotificationPlaneError).code, "unknown-notification");
  assert.equal((foreign as NotificationPlaneError).code, "unknown-notification");
  assert.equal(
    (unknown as NotificationPlaneError).message,
    (foreign as NotificationPlaneError).message.replace(
      enqueued.id as string,
      "notification-nope",
    ),
    "cross-tenant is indistinguishable from unknown",
  );
});

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

test("determinism: identical stacks produce bit-identical records, events and receipts", () => {
  const build = () => {
    const stack = makeNotificationStack({
      routes: [{ kind: "ok", ackRef: "ack:determinism" }],
    });
    const enqueued = stack.plane.enqueue(makeNotificationSubmission());
    stack.plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
    return {
      record: stack.plane.getNotification(SCOPE_A, enqueued.id),
      history: stack.plane.getNotificationHistory(SCOPE_A, enqueued.id),
      receipts: stack.plane.listReceipts(SCOPE_A, enqueued.id),
    };
  };

  const first = build();
  const second = build();
  assert.deepEqual(first, second);

  // A different injectable ISO clock moves the stamps (timestamps are
  // clock-derived, nothing else drifts).
  const shifted = makeNotificationStack({
    isoClock: () => "2027-06-01T00:00:00.000Z" as ReturnType<typeof FIXED_CLOCK>,
    routes: [{ kind: "ok", ackRef: "ack:determinism" }],
  });
  const enqueued = shifted.plane.enqueue(makeNotificationSubmission());
  const before = shifted.plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(before !== undefined);
  assert.equal(before.createdAt, "2027-06-01T00:00:00.000Z");
  assert.notEqual(before.createdAt, FIXED_CLOCK());
});

test("each recordDeliveryAttempt call appends exactly ONE event (the attempt IS the event)", () => {
  const clock = createFakeClock(0);
  const { plane } = makeNotificationStack({
    clock,
    routes: [
      { kind: "fail", code: "provider-transport-failed", message: "smtp down", retriable: true },
      { kind: "fail", code: "provider-transport-failed", message: "smtp still down", retriable: true },
      { kind: "ok" },
    ],
  });
  const enqueued = plane.enqueue(
    makeNotificationSubmission({
      retryPolicy: { maxAttempts: 3, backoffScheduleMs: [10] },
    }),
  );

  assert.equal(plane.getNotificationHistory(SCOPE_A, enqueued.id)?.length, 1);
  plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(plane.getNotificationHistory(SCOPE_A, enqueued.id)?.length, 2);
  clock.advance(10);
  plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(plane.getNotificationHistory(SCOPE_A, enqueued.id)?.length, 3);
  clock.advance(10);
  plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(plane.getNotificationHistory(SCOPE_A, enqueued.id)?.length, 4);

  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.attemptCount, 3);
  assert.equal(record.status, "delivered");
});
