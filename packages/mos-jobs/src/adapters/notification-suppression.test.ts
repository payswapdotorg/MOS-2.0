/**
 * Notification suppression tests (NOTIFY-001): recipient-level and
 * record-level suppression with first-class recorded reasons — never a
 * silent drop — plus lifting, tenant scoping and the dedup interplay.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { NotificationPlaneError } from "../domain/errors.js";
import {
  FIXED_CLOCK,
  RECIPIENT_A,
  RECIPIENT_B,
  SCOPE_A,
  SCOPE_B,
  TENANT_B,
  dedupKeyOf,
  makeArtifactRef,
  makeNotificationStack,
  makeNotificationSubmission,
} from "../testing/notification-fixtures.js";

test("record-level suppression: queued → suppressed with the reason recorded on the record", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());

  const suppressed = plane.suppressNotification(
    SCOPE_A,
    enqueued.id,
    "duplicate of an already-notified event",
    "admin:alice",
  );

  assert.equal(suppressed.status, "suppressed");
  assert.equal(suppressed.suppressedAt, FIXED_CLOCK());
  assert.ok(suppressed.suppression !== null);
  assert.equal(suppressed.suppression.level, "record");
  assert.equal(suppressed.suppression.reason, "duplicate of an already-notified event");
  assert.equal(suppressed.suppression.suppressedBy, "admin:alice");
  assert.equal(suppressed.suppression.recipientSuppressionId, null);

  const history = plane.getNotificationHistory(SCOPE_A, enqueued.id);
  assert.ok(history !== undefined);
  const event = history.find((entry) => entry.type === "suppressed");
  assert.ok(event !== undefined && event.type === "suppressed");
  if (event.type === "suppressed") {
    assert.equal(event.level, "record");
    assert.equal(event.reason, "duplicate of an already-notified event");
    assert.equal(event.suppressedBy, "admin:alice");
    assert.equal(event.recipientSuppressionId, null);
  }
});

test("terminal notifications cannot be suppressed (immutable)", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());
  const delivered = plane.recordDeliveryAttempt(SCOPE_A, enqueued.id);
  assert.equal(delivered.outcome, "delivered");

  assert.throws(
    () => plane.suppressNotification(SCOPE_A, enqueued.id, "late", "admin:alice"),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "notification-not-suppressible");
      assert.deepEqual(error.details, {
        notificationId: enqueued.id,
        status: "delivered",
      });
      return true;
    },
  );
});

test("suppression of unknown or foreign notifications fails identically (no existence leaks)", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());

  const unknown = captureError(() =>
    plane.suppressNotification(SCOPE_A, "notification-nope" as typeof enqueued.id, "r", "a"));
  const foreign = captureError(() =>
    plane.suppressNotification(SCOPE_B, enqueued.id, "r", "a"));

  assert.ok(unknown instanceof NotificationPlaneError);
  assert.ok(foreign instanceof NotificationPlaneError);
  assert.equal((unknown as NotificationPlaneError).code, "unknown-notification");
  assert.equal((foreign as NotificationPlaneError).code, "unknown-notification");
});

test("empty suppression reason or attribution fails closed (the reason is first-class)", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());

  assert.throws(
    () => plane.suppressNotification(SCOPE_A, enqueued.id, "", "admin:alice"),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "invalid-suppression");
      return true;
    },
  );
  assert.throws(
    () => plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "reason", ""),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "invalid-suppression");
      return true;
    },
  );
  const record = plane.getNotification(SCOPE_A, enqueued.id);
  assert.ok(record !== undefined);
  assert.equal(record.status, "queued", "nothing was suppressed by the invalid calls");
});

test("a suppressed notification cannot be delivered", () => {
  const { plane } = makeNotificationStack();
  const enqueued = plane.enqueue(makeNotificationSubmission());
  plane.suppressNotification(SCOPE_A, enqueued.id, "not wanted", "admin:alice");

  assert.throws(
    () => plane.recordDeliveryAttempt(SCOPE_A, enqueued.id),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "notification-not-deliverable");
      assert.deepEqual(error.details, {
        notificationId: enqueued.id,
        status: "suppressed",
      });
      return true;
    },
  );
});

test("recipient-level suppression: future enqueues are created suppressed carrying the rule's reason", () => {
  const { plane } = makeNotificationStack();
  const rule = plane.suppressRecipient(
    SCOPE_A,
    RECIPIENT_A,
    "user requested notification pause",
    "admin:bob",
  );
  assert.ok(rule.id.startsWith("suppression-"));
  assert.equal(rule.reason, "user requested notification pause");
  assert.equal(rule.liftedAt, null);

  const active = plane.getRecipientSuppression(SCOPE_A, RECIPIENT_A);
  assert.ok(active !== undefined);
  assert.equal(active.id, rule.id);

  const record = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("while-suppressed") }),
  );
  assert.equal(record.status, "suppressed");
  assert.ok(record.suppression !== null);
  assert.equal(record.suppression.level, "recipient");
  assert.equal(record.suppression.reason, "user requested notification pause");
  assert.equal(record.suppression.suppressedBy, "admin:bob");
  assert.equal(record.suppression.recipientSuppressionId, rule.id);

  const history = plane.getNotificationHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  assert.deepEqual(
    history.map((event) => event.type),
    ["enqueued", "suppressed"],
    "the suppression is a RECORDED outcome, never a silent drop",
  );
  const event = history[1];
  assert.ok(event !== undefined && event.type === "suppressed");
  if (event.type === "suppressed") {
    assert.equal(event.level, "recipient");
    assert.equal(event.reason, "user requested notification pause");
    assert.equal(event.recipientSuppressionId, rule.id);
  }
});

test("a recipient suppression never silently drops: the suppressed record is readable and listed", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "vacation", "admin:bob");
  const record = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("listed-suppressed") }),
  );

  assert.ok(plane.getNotification(SCOPE_A, record.id) !== undefined);
  const suppressedRows = plane.listNotifications({
    scope: SCOPE_A,
    statuses: ["suppressed"],
  });
  assert.equal(suppressedRows.length, 1);
  assert.equal(suppressedRows[0]?.suppression?.reason, "vacation");
});

test("a recipient suppression affects only that recipient", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "pause", "admin:bob");

  const other = plane.enqueue(
    makeNotificationSubmission({
      dedupKey: dedupKeyOf("other-recipient"),
      recipient: RECIPIENT_B,
    }),
  );
  assert.equal(other.status, "queued");
  assert.equal(other.suppression, null);
});

test("recipient suppressions are tenant-scoped", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "pause", "admin:bob");

  assert.ok(plane.getRecipientSuppression(SCOPE_B, RECIPIENT_A) === undefined);
  const foreignRecord = plane.enqueue(
    makeNotificationSubmission({
      scope: SCOPE_B,
      dedupKey: dedupKeyOf("tenant-b-recipient"),
      subject: {
        artifactRefs: [makeArtifactRef(1, TENANT_B)],
        taskRefs: [],
        missionRefs: [],
      },
    }),
  );
  assert.equal(foreignRecord.status, "queued", "tenant B suppression state does not leak");
});

test("lifting the rule: future notifications queue normally; suppressed records stay suppressed", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "pause", "admin:bob");
  const suppressed = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("before-lift") }),
  );
  assert.equal(suppressed.status, "suppressed");

  const lifted = plane.liftRecipientSuppression(SCOPE_A, RECIPIENT_A, "admin:bob");
  assert.ok(lifted.liftedAt !== null);
  assert.equal(lifted.liftedBy, "admin:bob");
  assert.equal(plane.getRecipientSuppression(SCOPE_A, RECIPIENT_A), undefined);

  const after = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("after-lift") }),
  );
  assert.equal(after.status, "queued");

  // The already-suppressed record is terminal and immutable.
  const still = plane.getNotification(SCOPE_A, suppressed.id);
  assert.ok(still !== undefined);
  assert.equal(still.status, "suppressed");
  assert.throws(
    () => plane.recordDeliveryAttempt(SCOPE_A, suppressed.id),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "notification-not-deliverable");
      return true;
    },
  );
});

test("lifting a nonexistent or already-lifted suppression fails closed", () => {
  const { plane } = makeNotificationStack();

  assert.throws(
    () => plane.liftRecipientSuppression(SCOPE_A, RECIPIENT_A, "admin:bob"),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "unknown-suppression");
      return true;
    },
  );

  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "pause", "admin:bob");
  plane.liftRecipientSuppression(SCOPE_A, RECIPIENT_A, "admin:bob");
  assert.throws(
    () => plane.liftRecipientSuppression(SCOPE_A, RECIPIENT_A, "admin:bob"),
    (error: unknown) => {
      assert.ok(error instanceof NotificationPlaneError);
      assert.equal(error.code, "unknown-suppression");
      return true;
    },
  );
});

test("re-suppressing a recipient replaces the active rule's reason", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "first reason", "admin:bob");
  const replaced = plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "second reason", "admin:carol");

  const active = plane.getRecipientSuppression(SCOPE_A, RECIPIENT_A);
  assert.ok(active !== undefined);
  assert.equal(active.id, replaced.id);
  assert.equal(active.reason, "second reason");
  assert.equal(active.suppressedBy, "admin:carol");

  const record = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("after-replace") }),
  );
  assert.equal(record.suppression?.reason, "second reason");
});

test("dedup + recipient suppression: the duplicate returns the suppressed record; a new key queues after lift", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(SCOPE_A, RECIPIENT_A, "pause", "admin:bob");
  const first = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("dedup-suppressed") }),
  );
  assert.equal(first.status, "suppressed");

  const duplicate = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("dedup-suppressed") }),
  );
  assert.deepEqual(duplicate, first);

  plane.liftRecipientSuppression(SCOPE_A, RECIPIENT_A, "admin:bob");
  const fresh = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("fresh-after-lift") }),
  );
  assert.equal(fresh.status, "queued");
  assert.equal(
    plane.listNotifications({ scope: SCOPE_A }).length,
    2,
    "one suppressed + one queued — no silent drops",
  );
});

test("a workspace-scoped suppression rule is invisible from the tenant root scope", () => {
  const { plane } = makeNotificationStack();
  plane.suppressRecipient(
    { tenantId: SCOPE_A.tenantId, workspaceId: "ws-1" as never },
    RECIPIENT_A,
    "workspace pause",
    "admin:bob",
  );

  assert.equal(plane.getRecipientSuppression(SCOPE_A, RECIPIENT_A), undefined);
  const rootRecord = plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("root-scope-recipient") }),
  );
  assert.equal(rootRecord.status, "queued");
});

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}
