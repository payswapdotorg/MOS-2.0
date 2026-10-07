/**
 * Notification delivery plane tests (NOTIFY-001): enqueue vocabulary,
 * dedup idempotency (double submit → ONE record), tenant scoping with
 * no existence leaks, fail-closed submission validation and the frozen
 * vocabularies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { NotificationPlaneError } from "../domain/errors.js";
import { notificationSubmissionViolations } from "../domain/notification-submission-validation.js";
import {
  NOTIFICATION_DELIVERY_FAILURE_CODES,
  NOTIFICATION_KINDS,
  NOTIFICATION_STATUSES,
  TERMINAL_NOTIFICATION_STATUSES,
} from "../contracts/notification.js";
import { NOTIFICATION_EVENT_TYPES } from "../contracts/notification-events.js";
import {
  FIXED_CLOCK,
  RECIPIENT_A,
  RECIPIENT_B,
  SCOPE_A,
  SCOPE_B,
  TENANT_A,
  TENANT_B,
  dedupKeyOf,
  makeArtifactRef,
  makeKindSubmission,
  makeNotificationStack,
  makeNotificationSubmission,
} from "../testing/notification-fixtures.js";
import type { NotificationRecord } from "../contracts/notification.js";

test("enqueue creates a queued record with the full declarative vocabulary", () => {
  const { plane } = makeNotificationStack();
  const record = plane.enqueue(makeNotificationSubmission());

  assert.equal(record.status, "queued");
  assert.equal(record.id, "notification-1");
  assert.equal(record.dedupKey, dedupKeyOf("task-assignment-42"));
  assert.equal(record.kind, "task-assignment");
  assert.equal(record.contractVersion, 1);
  assert.deepEqual(record.submittedBy, { kind: "service", name: "studio-runtime" });
  assert.equal(record.recipient, RECIPIENT_A);
  assert.equal(record.createdAt, FIXED_CLOCK());
  assert.equal(record.deliveredAt, null);
  assert.equal(record.attemptCount, 0);
  assert.deepEqual(record.retryPolicy, { maxAttempts: 1, backoffScheduleMs: [] });
  // The subject is REFERENCES ONLY — never inline content.
  assert.deepEqual(
    Object.keys(record.subject).sort(),
    ["artifactRefs", "missionRefs", "taskRefs"],
  );
  assert.equal(record.subject.taskRefs[0], "task:shoot-episode-42");
  assert.equal(record.subject.missionRefs[0], "mission:reaction-pilot");
  for (const field of [
    "artifactId",
    "version",
    "tenantId",
    "digest",
    "type",
    "storageRef",
    "rightsRef",
    "provenanceRef",
  ] as const) {
    assert.ok(
      field in (record.subject.artifactRefs[0] as unknown as Record<string, unknown>),
      `artifact ref carries '${field}'`,
    );
  }
});

test("double submit with the same dedup key yields ONE record, ONE event, ONE list row", () => {
  const { plane } = makeNotificationStack();
  const first = plane.enqueue(makeNotificationSubmission());
  const second = plane.enqueue(makeNotificationSubmission());

  assert.deepEqual(second, first, "the duplicate submit returns the existing record");
  assert.equal(second.id, first.id);

  const history = plane.getNotificationHistory(SCOPE_A, first.id);
  assert.ok(history !== undefined);
  assert.equal(history.length, 1, "no second enqueued event for the dedup'd submit");
  assert.equal(history[0]?.type, "enqueued");

  assert.equal(plane.listNotifications({ scope: SCOPE_A }).length, 1);
});

test("the dedup key is permanently bound — a different-content duplicate still returns the existing record", () => {
  const { plane } = makeNotificationStack();
  const first = plane.enqueue(makeNotificationSubmission());
  const duplicate = plane.enqueue(
    makeNotificationSubmission({
      kind: "system-alert",
      recipient: RECIPIENT_B,
      subject: {
        artifactRefs: [makeArtifactRef(9)],
        taskRefs: ["task:other"],
        missionRefs: [],
      },
    }),
  );

  assert.equal(duplicate.id, first.id);
  assert.equal(duplicate.kind, first.kind, "new work requires a NEW dedup key");
  assert.equal(plane.listNotifications({ scope: SCOPE_A }).length, 1);
});

test("a duplicate submit AFTER delivery returns the delivered record — never a second delivery", () => {
  const { plane } = makeNotificationStack();
  const first = plane.enqueue(makeNotificationSubmission());
  const result = plane.recordDeliveryAttempt(SCOPE_A, first.id);
  assert.equal(result.outcome, "delivered");

  const duplicate = plane.enqueue(makeNotificationSubmission());
  assert.equal(duplicate.id, first.id);
  assert.equal(duplicate.status, "delivered");
  assert.equal(plane.listReceipts(SCOPE_A, first.id)?.length, 1, "still exactly one receipt");
});

test("getNotification is tenant-scoped with no existence leaks", () => {
  const { plane } = makeNotificationStack();
  const record = plane.enqueue(makeNotificationSubmission());

  assert.ok(plane.getNotification(SCOPE_A, record.id) !== undefined);
  // Cross-tenant read is indistinguishable from unknown id: both undefined.
  assert.equal(plane.getNotification(SCOPE_B, record.id), undefined);
  assert.equal(
    plane.getNotification(SCOPE_A, "notification-does-not-exist" as NotificationRecord["id"]),
    undefined,
  );
  assert.equal(plane.getNotificationHistory(SCOPE_B, record.id), undefined);
  assert.equal(plane.listReceipts(SCOPE_B, record.id), undefined);
});

test("workspace scoping follows the tenant scope (workspaceId mismatch is invisible)", () => {
  const { plane } = makeNotificationStack();
  const record = plane.enqueue(
    makeNotificationSubmission({
      scope: { tenantId: TENANT_A, workspaceId: "ws-1" as never },
    }),
  );

  assert.ok(
    plane.getNotification({ tenantId: TENANT_A, workspaceId: "ws-1" as never }, record.id)
      !== undefined,
  );
  assert.equal(plane.getNotification(SCOPE_A, record.id), undefined);
  assert.equal(plane.getNotification({ tenantId: TENANT_A, workspaceId: "ws-2" as never }, record.id), undefined);
});

test("listNotifications filters by recipient, status, kind and limit within the tenant", () => {
  const { plane } = makeNotificationStack();
  plane.enqueue(makeKindSubmission("mission-event", "m-1"));
  plane.enqueue(makeKindSubmission("task-reminder", "t-1"));
  plane.enqueue(
    makeNotificationSubmission({ dedupKey: dedupKeyOf("r-1"), recipient: RECIPIENT_B }),
  );
  // tenant B record must never appear in tenant A lists
  plane.enqueue(
    makeNotificationSubmission({
      scope: SCOPE_B,
      dedupKey: dedupKeyOf("b-1"),
      subject: {
        artifactRefs: [makeArtifactRef(1, TENANT_B)],
        taskRefs: ["task:tenant-b"],
        missionRefs: [],
      },
    }),
  );

  const all = plane.listNotifications({ scope: SCOPE_A });
  assert.equal(all.length, 3);

  const forB = plane.listNotifications({ scope: SCOPE_A, recipient: RECIPIENT_B });
  assert.equal(forB.length, 1);
  assert.equal(forB[0]?.recipient, RECIPIENT_B);

  const reminders = plane.listNotifications({ scope: SCOPE_A, kinds: ["task-reminder"] });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0]?.kind, "task-reminder");

  const queued = plane.listNotifications({ scope: SCOPE_A, statuses: ["queued"] });
  assert.equal(queued.length, 3);

  const limited = plane.listNotifications({ scope: SCOPE_A, limit: 2 });
  assert.equal(limited.length, 2);
});

test("malformed submissions fail closed with named violations (typed error)", () => {
  const { plane } = makeNotificationStack();

  const cases: readonly [string, Record<string, unknown>][] = [
    ["scope.tenantId must be a non-empty string", { scope: { tenantId: "" } }],
    ["dedupKey must be a non-empty string", { dedupKey: "" }],
    ["kind must be one of the declarative kinds", { kind: "email-blast" }],
    ["contractVersion must be an integer >= 1", { contractVersion: 0 }],
    ["submittedBy must be a user/service/agent actor record", { submittedBy: { kind: "robot" } }],
    ["recipient must be a non-empty identity ref", { recipient: "" }],
    ["subject must be a NotificationSubject record", { subject: null }],
    ["subject.artifactRefs[0] is missing ArtifactRef field", {
      subject: { artifactRefs: [{ artifactId: "a" }], taskRefs: [], missionRefs: [] },
    }],
    ["subject.artifactRefs[0] belongs to a different tenant", {
      subject: {
        artifactRefs: [makeArtifactRef(1, TENANT_B)],
        taskRefs: [],
        missionRefs: [],
      },
    }],
    ["subject.taskRefs[0] must be a non-empty task id", {
      subject: { artifactRefs: [], taskRefs: [""], missionRefs: [] },
    }],
    ["subject.missionRefs[0] must be a non-empty mission ref", {
      subject: { artifactRefs: [], taskRefs: [], missionRefs: [""] },
    }],
    ["retryPolicy must be a NotificationRetryPolicy record", { retryPolicy: null }],
    ["maxAttempts must be an integer >= 1", {
      retryPolicy: { maxAttempts: 0, backoffScheduleMs: [] },
    }],
  ];

  for (const [expectedFragment, overrides] of cases) {
    let thrown: unknown;
    try {
      plane.enqueue(makeNotificationSubmission(overrides));
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof NotificationPlaneError, `expected typed error for ${expectedFragment}`);
    assert.equal((thrown as NotificationPlaneError).code, "invalid-notification-submission");
    const message = (thrown as NotificationPlaneError).message;
    assert.ok(
      message.includes(expectedFragment),
      `violation '${expectedFragment}' named in: ${message}`,
    );
  }
});

test("the pure validator names every violation without throwing", () => {
  const violations = notificationSubmissionViolations(
    makeNotificationSubmission({ kind: "nope", dedupKey: "" }),
  );
  assert.ok(violations.length >= 2);
  assert.ok(violations.some((v) => v.includes("dedupKey")));
  assert.ok(violations.some((v) => v.includes("kind")));
});

test("each declarative kind enqueues (the closed vocabulary round-trips)", () => {
  const { plane } = makeNotificationStack();
  let index = 0;
  for (const kind of NOTIFICATION_KINDS) {
    index += 1;
    const record = plane.enqueue(makeKindSubmission(kind, `kind-${index}`));
    assert.equal(record.kind, kind);
  }
  assert.equal(plane.listNotifications({ scope: SCOPE_A }).length, NOTIFICATION_KINDS.length);
});

test("enqueue appends exactly one enqueued event carrying the dedup key and subject refs", () => {
  const { plane } = makeNotificationStack();
  const record = plane.enqueue(makeNotificationSubmission());

  const history = plane.getNotificationHistory(SCOPE_A, record.id);
  assert.ok(history !== undefined);
  const event = history[0];
  assert.ok(event !== undefined && event.type === "enqueued");
  if (event.type === "enqueued") {
    assert.equal(event.dedupKey, dedupKeyOf("task-assignment-42"));
    assert.equal(event.kind, "task-assignment");
    assert.equal(event.recipient, RECIPIENT_A);
    assert.deepEqual(event.subject.taskRefs, ["task:shoot-episode-42"]);
    assert.equal(event.sequence, 1);
    assert.equal(event.attempt, 0);
    assert.deepEqual(event.actor, {
      executor: "notification-plane",
      submittedBy: { kind: "service", name: "studio-runtime" },
    });
  }
});

test("frozen vocabularies are exact and frozen", () => {
  assert.deepEqual(NOTIFICATION_KINDS, [
    "mission-event",
    "task-assignment",
    "task-reminder",
    "rights-event",
    "system-alert",
  ]);
  assert.deepEqual(NOTIFICATION_STATUSES, ["queued", "delivered", "failed", "suppressed"]);
  assert.deepEqual(TERMINAL_NOTIFICATION_STATUSES, ["delivered", "failed", "suppressed"]);
  assert.deepEqual(NOTIFICATION_EVENT_TYPES, [
    "enqueued",
    "delivered",
    "retry-scheduled",
    "delivery-failed",
    "suppressed",
  ]);
  assert.deepEqual(NOTIFICATION_DELIVERY_FAILURE_CODES, [
    "provider-rejected",
    "provider-transport-failed",
  ]);
  for (const vocabulary of [
    NOTIFICATION_KINDS,
    NOTIFICATION_STATUSES,
    TERMINAL_NOTIFICATION_STATUSES,
    NOTIFICATION_EVENT_TYPES,
    NOTIFICATION_DELIVERY_FAILURE_CODES,
  ]) {
    assert.ok(Object.isFrozen(vocabulary));
  }
});

test("ownership: the caller-supplied submission is never mutated or frozen in place", () => {
  const { plane } = makeNotificationStack();
  const submission = makeNotificationSubmission();
  const record = plane.enqueue(submission);

  assert.ok(!Object.isFrozen(submission), "the caller's submission object stays unfrozen");
  assert.ok(!Object.isFrozen(submission.subject), "nested caller objects stay unfrozen");
  assert.deepEqual(submission.dedupKey, record.dedupKey);

  // The store's copy is frozen (the durable authority copy).
  const stored = plane.getNotification(SCOPE_A, record.id);
  assert.ok(stored !== undefined);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.subject));
});
