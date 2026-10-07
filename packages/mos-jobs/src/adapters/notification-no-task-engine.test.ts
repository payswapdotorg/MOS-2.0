/**
 * No-task-engine structural pin (NOTIFY-001 acceptance core): the
 * notification plane NEVER morphs into a task/workflow engine.
 *
 * Pinned four ways:
 * 1. VOCABULARY SCAN — the notification-plane source files (comments
 *    and strings stripped) contain NO claim/lease/execute/poll/
 *    dispatch/cancel/heartbeat/renew/work-unit tokens;
 * 2. METHOD-SET PIN — NotificationDeliveryPort's method set is exactly
 *    the eleven declared methods, none of which is a claim/lease/
 *    execute/poll/dispatch surface;
 * 3. RECORD-SHAPE PIN — the record vocabulary has no lease/claim/token/
 *    worker fields and the lifecycle has NO in-flight/running state
 *    (queued → delivered | failed | suppressed only);
 * 4. SEMANTIC PIN — a delivery attempt appends exactly ONE recorded
 *    event and never parks the record in an intermediated held state,
 *    and no plane method ever returns a token-bearing claim object.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NOTIFICATION_STATUSES } from "../contracts/notification.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.port.js";
import {
  SCOPE_A,
  createFakeClock,
  makeNotificationStack,
  makeNotificationSubmission,
} from "../testing/notification-fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Tests run from dist/adapters/: the package SOURCES live two levels up. */
const srcRoot = join(here, "../../src");

/** The notification-plane source files this pin guards. */
const NOTIFICATION_SOURCE_FILES = [
  "contracts/notification.ts",
  "contracts/notification-events.ts",
  "ports/notification-delivery.port.ts",
  "ports/notification-store.port.ts",
  "ports/notification-provider.port.ts",
  "domain/notification-retry.ts",
  "domain/notification-submission-validation.ts",
  "adapters/notification-delivery-plane.ts",
  "adapters/in-memory-notification-store.ts",
  "adapters/in-memory-notification-provider.ts",
] as const;

/** Strips line comments and strings so tokens in prose/docs don't match. */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, "''")
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "''");
}

/** Task/workflow-engine semantics that must NEVER appear on notifications. */
const TASK_ENGINE_TOKENS =
  /\b(claim|claims|claimed|claimable|lease|leases|leased|renew|renewal|heartbeat|poll|polling|dispatch|dispatched|cancel|canceled|cancellation|execute|executes|execution|workUnit|worker)\b/g;

test("vocabulary scan: no claim/lease/execute semantics anywhere in the notification plane sources", () => {
  assert.ok(statSync(srcRoot).isDirectory());
  const offenders: string[] = [];
  for (const relative of NOTIFICATION_SOURCE_FILES) {
    const path = join(srcRoot, relative);
    const stripped = stripCommentsAndStrings(readFileSync(path, "utf8"));
    const matches = stripped.match(TASK_ENGINE_TOKENS);
    if (matches !== null) {
      offenders.push(`${relative}: ${matches.join(", ")}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "the notification plane must never grow task-engine vocabulary",
  );
});

test("method-set pin: exactly the eleven declared plane methods, none task-engine-shaped", () => {
  const { plane } = makeNotificationStack();
  const methods = Object.keys(plane as unknown as Record<string, unknown>).sort();
  assert.deepEqual(methods, [
    "enqueue",
    "getNotification",
    "getNotificationHistory",
    "getReceipt",
    "getRecipientSuppression",
    "liftRecipientSuppression",
    "listNotifications",
    "listReceipts",
    "recordDeliveryAttempt",
    "suppressNotification",
    "suppressRecipient",
  ]);
  assert.deepEqual(
    methods.filter((method) =>
      /claim|lease|execute|poll|tick|dispatch|cancel|heartbeat|renew|acquire|release/i.test(
        method,
      )),
    [],
    "no claim/lease/execute/poll/dispatch/cancel method may ever appear",
  );
});

test("record-shape pin: no lease/claim/token/worker fields; no in-flight lifecycle state", () => {
  const { plane } = makeNotificationStack();
  const record = plane.enqueue(makeNotificationSubmission());
  const keys = Object.keys(record as unknown as Record<string, unknown>);

  assert.deepEqual(
    keys.filter((key) => /lease|claim|token|worker|holder|lock/i.test(key)),
    [],
    "the record vocabulary has no claim/lease/worker fields",
  );
  assert.deepEqual(
    NOTIFICATION_STATUSES.filter((status) => /running|in_flight|inflight|processing|claimed/i.test(status)),
    [],
    "the lifecycle has NO in-flight/running state — attempts are recorded events",
  );
  assert.ok(!NOTIFICATION_STATUSES.includes("running" as never));
  assert.ok(record.status === "queued");
});

test("semantic pin: an attempt appends exactly one event and never parks the record in a held state", () => {
  const clock = createFakeClock(0);
  const { plane } = makeNotificationStack({
    clock,
    routes: [
      { kind: "fail", code: "provider-transport-failed", message: "down", retriable: true },
    ],
  });
  const record = plane.enqueue(
    makeNotificationSubmission({
      retryPolicy: { maxAttempts: 2, backoffScheduleMs: [10] },
    }),
  );

  const before = plane.getNotificationHistory(SCOPE_A, record.id)?.length ?? 0;
  const result = plane.recordDeliveryAttempt(SCOPE_A, record.id);
  const after = plane.getNotificationHistory(SCOPE_A, record.id)?.length ?? 0;
  assert.equal(after, before + 1, "one attempt = exactly one recorded event");

  assert.equal(result.outcome, "retry-scheduled");
  const refreshed = plane.getNotification(SCOPE_A, record.id);
  assert.ok(refreshed !== undefined);
  assert.equal(
    refreshed.status,
    "queued",
    "a failed attempt re-queues — the record is never held/in-flight between attempts",
  );

  // No claim object: the result carries only outcome/record/failure/backoff.
  assert.deepEqual(
    Object.keys(result as unknown as Record<string, unknown>).filter((key) =>
      /claim|lease|token|worker/i.test(key)),
    [],
  );
});

test("no claimable-work surface: no plane return value ever carries a lease token or claim ref", () => {
  const { plane } = makeNotificationStack();
  const record = plane.enqueue(makeNotificationSubmission());
  plane.suppressRecipient(SCOPE_A, record.recipient, "pause", "admin:bob");
  const suppressed = plane.enqueue(
    makeNotificationSubmission({ dedupKey: "suppressed-probe" }),
  );

  const values: unknown[] = [
    plane.getNotification(SCOPE_A, record.id),
    plane.listNotifications({ scope: SCOPE_A }),
    plane.getNotificationHistory(SCOPE_A, record.id),
    plane.getRecipientSuppression(SCOPE_A, record.recipient),
    suppressed,
  ];
  const tokenLike: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (value === null || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/claim|lease|token/i.test(key)) {
        tokenLike.push(`${path}.${key}`);
      }
      walk(child, `${path}.${key}`);
    }
  };
  values.forEach((value, index) => walk(value, `$${index}`));
  assert.deepEqual(tokenLike, [], "no token-bearing claim objects anywhere in the read surface");
});

test("the provider seam stays a narrow transport double: one method + declared identity", () => {
  const { provider } = makeNotificationStack();
  const members = Object.keys(provider as unknown as Record<string, unknown>).sort();
  assert.deepEqual(members, ["deliver", "providerId"]);
  assert.equal(typeof (provider as unknown as Record<string, unknown>).deliver, "function");
  assert.equal(typeof (provider as unknown as Record<string, unknown>).providerId, "string");
});

test("the durable JOB queue surface is untouched by the notification plane (no notify method)", async () => {
  // Re-importing the package index to exercise the same object the
  // no-scheduling-authority pin covers, scoped to the queue here.
  const jobs = (await import("../index.js")) as typeof import("../index.js");
  const queue = jobs.createDurableJobQueue({ store: jobs.createInMemoryDurableJobStore() });
  const methods = Object.keys(queue as unknown as Record<string, unknown>);
  assert.deepEqual(methods.filter((method) => /notify|notification/i.test(method)), []);
  // And the plane is a SEPARATE surface, not grafted onto the queue.
  const plane = makeNotificationStack().plane as NotificationDeliveryPort;
  assert.notEqual(
    plane as unknown as object,
    queue as unknown as object,
  );
});
