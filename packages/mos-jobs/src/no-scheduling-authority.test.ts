/**
 * No-scheduling-authority tests (JOBS-001, §26): the package exposes NO
 * cron/HTTP-timer scheduling authority. The ONLY dispatch surface is the
 * work-polling port (JobQueuePort.claimNextRunnable); the single
 * clock-driven consumer is the DISCLOSED in-memory poller double, and
 * timer usage outside that disclosed file fails this test.
 *
 * The exported-surface pin also covers the notification plane (NOTIFY-001):
 * its factories/id-builders/error class follow the same naming discipline
 * and the plane itself carries no scheduling machinery.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as mosJobs from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Tests run from dist/: the package SOURCES live one level up. */
const srcRoot = join(here, "../src");

/** Recursively lists .ts files under src/ (tests excluded optionally). */
function listSources(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSources(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

/** Strips line comments and strings so tokens in prose/docs don't match. */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, "''")
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "''");
}

test("no cron/HTTP/timer scheduling authority outside the DISCLOSED poller double", () => {
  const schedulingTokens =
    /\b(setInterval|setTimeout|clearInterval|clearTimeout|createServer|listen|cron)\b/g;

  const offenders: string[] = [];
  for (const file of listSources(srcRoot)) {
    const relative = file.slice(srcRoot.length + 1);
    const isDisclosedPoller = relative === join("test-doubles", "job-poller-double.ts");
    const isTest = relative.endsWith(".test.ts");
    if (isTest) {
      continue;
    }
    const stripped = stripCommentsAndStrings(readFileSync(file, "utf8"));
    const matches = stripped.match(schedulingTokens);
    if (matches !== null && !isDisclosedPoller) {
      offenders.push(`${relative}: ${matches.join(", ")}`);
    }
    if (isDisclosedPoller) {
      assert.ok(matches !== null, "the disclosed poller double is the one timer consumer");
    }
  }
  assert.deepEqual(offenders, [], "scheduling tokens live only in the disclosed double");
});

test("the exported runtime surface contains no scheduling machinery", () => {
  const exported = Object.keys(mosJobs).sort();
  for (const name of exported) {
    const value = (mosJobs as Record<string, unknown>)[name];
    if (/^(DURABLE_|TERMINAL_|NOTIFICATION_)/.test(name)) {
      // Frozen vocabulary constants (arrays), pinned by the isolation tests.
      assert.ok(Array.isArray(value) && Object.isFrozen(value), name);
      continue;
    }
    assert.equal(typeof value, "function", `export '${name}' must be a factory/function`);
    assert.match(
      name,
      /^(create|decide|retry|durableJobId|jobKey|leaseToken|notificationId|notificationDedupKey|notificationReceiptId|deliveryAttemptId|providerAckRef|notificationRetryDelayMs|notificationSubmissionViolations|JobQueueError$|NotificationPlaneError$)/,
      name,
    );
  }
  assert.ok(exported.includes("createDurableJobQueue"));
  assert.ok(exported.includes("createJobPollerDouble"), "the poller is exported AS a disclosed double");
  assert.ok(exported.includes("createNotificationDeliveryPlane"), "the notification plane is exported");
  assert.ok(!exported.some((name) => /cron|timer|schedule/i.test(name)));
});

test("the ONLY dispatch surface is the claim port — the queue exposes no tick/emit/schedule", () => {
  const queue = mosJobs.createDurableJobQueue({
    store: mosJobs.createInMemoryDurableJobStore(),
  });
  const methods = Object.keys(queue as unknown as Record<string, unknown>);
  assert.equal(methods.includes("claimNextRunnable"), true);
  assert.deepEqual(
    methods.filter((method) => /tick|emit|schedule|dispatch|notify|wake/i.test(method)),
    [],
  );
});
