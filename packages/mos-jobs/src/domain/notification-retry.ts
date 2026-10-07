/**
 * Notification retry policy domain logic (NOTIFY-001) — pure functions.
 *
 * The SAME discipline as the job queue's retry policy (retries driven
 * FROM typed failure records against the declared policy) applied to the
 * notification plane's narrower lifecycle: a retriable failure with
 * attempts remaining re-queues with the declared backoff (delay via the
 * SHARED `retryDelayMs` — one backoff implementation, zero drift); a
 * non-retriable failure or declared retry-policy EXHAUSTION terminates
 * the notification as `failed` with the typed failure recorded. There is
 * NO dead-letter state — the notification lifecycle is queued →
 * delivered | failed | suppressed. No clocks, no IO — deterministic.
 */

import type {
  NotificationRetryPolicy,
  TypedNotificationFailure,
} from "../contracts/notification.js";
import { retryDelayMs } from "./retry-policy.js";

/** The retry decision for a failed delivery attempt. */
export type NotificationRetryDecision =
  | { readonly decision: "retry" }
  | { readonly decision: "terminal" };

/**
 * Computes the notification retry decision for a failed attempt:
 * - non-retriable failure → terminal `failed`;
 * - retriable and attempts remaining under the declared policy → retry
 *   (the caller applies the declared backoff via `notificationRetryDelayMs`);
 * - retriable with no attempts remaining → terminal `failed` (declared
 *   retry-policy exhaustion — the terminal failure is recorded).
 */
export function decideNotificationRetry(
  policy: NotificationRetryPolicy,
  attemptsStarted: number,
  failure: TypedNotificationFailure,
): NotificationRetryDecision {
  if (!failure.retriable) {
    return { decision: "terminal" };
  }
  if (attemptsStarted < policy.maxAttempts) {
    return { decision: "retry" };
  }
  return { decision: "terminal" };
}

/**
 * Backoff delay after the n-th failed delivery attempt (1-based). The
 * SHARED job-queue implementation (schedule-indexed, clamped to the last
 * entry, empty schedule = immediate re-queue) — re-exported under the
 * notification-plane name for the plane's consumers.
 */
export function notificationRetryDelayMs(
  policy: NotificationRetryPolicy,
  failedAttempt: number,
): number {
  return retryDelayMs(policy, failedAttempt);
}
