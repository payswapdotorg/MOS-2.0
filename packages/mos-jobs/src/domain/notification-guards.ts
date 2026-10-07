/**
 * Fail-closed notification-plane guards (NOTIFY-001) — pure-ish domain
 * logic.
 *
 * The typed gates every plane mutation passes: the notification must
 * exist IN THE REQUESTING SCOPE (foreign ≡ unknown — no existence
 * leaks, §31) and suppression inputs must carry a first-class
 * non-empty reason + attribution (a suppression is a recorded outcome,
 * never a silent drop). Violations are typed `NotificationPlaneError`s,
 * never silent behavior.
 */

import type { TenantScope } from "@mos/contracts";

import type { NotificationRecord } from "../contracts/notification.js";
import type { NotificationId } from "../contracts/ids.js";
import type { NotificationStorePort } from "../ports/notification-store.port.js";
import { NotificationPlaneError } from "./errors.js";

/** Resolves one notification in scope; foreign/unknown both fail as `unknown-notification`. */
export function requireNotification(
  store: NotificationStorePort,
  scope: TenantScope,
  notificationId: NotificationId,
): NotificationRecord {
  const record = store.findNotificationById(scope, notificationId);
  if (record === undefined) {
    throw new NotificationPlaneError(
      "unknown-notification",
      `no notification ${notificationId as string} in the requesting scope`,
      { notificationId: notificationId as string },
    );
  }
  return record;
}

/** Fail-closed validation of suppression inputs (the reason is first-class). */
export function requireSuppressionReason(
  reason: string,
  actor: string,
): void {
  if (typeof reason !== "string" || reason === "") {
    throw new NotificationPlaneError(
      "invalid-suppression",
      "a suppression requires a non-empty reason (first-class recorded outcome, never a silent drop)",
      {},
    );
  }
  if (typeof actor !== "string" || actor === "") {
    throw new NotificationPlaneError(
      "invalid-suppression",
      "a suppression requires a non-empty suppressedBy attribution",
      {},
    );
  }
}
