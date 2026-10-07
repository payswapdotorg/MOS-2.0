/**
 * Retry policy domain logic (JOBS-001) — pure functions.
 *
 * Retries are driven FROM typed failure records: the `retriable` flag of
 * the failure (the ENG-003 EngineJobFailure vocabulary is the model)
 * decides whether a retry is even considered, the attempt count against
 * the declared maxAttempts decides retry vs dead-letter, and the declared
 * backoff schedule decides the delay. No clocks, no IO — deterministic.
 */

import type { JobRetryPolicy, TypedJobFailure } from "../contracts/durable-job.js";

/**
 * Backoff delay after the n-th failed attempt (1-based): schedule[0] for
 * the first retry, advancing through the schedule, clamped to the last
 * entry once attempts exceed the schedule length. An empty schedule means
 * no delay (immediate re-queue).
 */
export function retryDelayMs(
  policy: JobRetryPolicy,
  failedAttempt: number,
): number {
  if (policy.backoffScheduleMs.length === 0) {
    return 0;
  }
  const index = Math.min(
    Math.max(0, failedAttempt - 1),
    policy.backoffScheduleMs.length - 1,
  );
  return policy.backoffScheduleMs[index] as number;
}

/**
 * The retry decision from a typed failure + the attempts already started:
 * - non-retriable failure → terminal at the failure's own terminalStatus;
 * - retriable and attempts remaining → "retry" (the caller applies the
 *   declared backoff);
 * - retriable and no attempts remaining → "dead-letter" (retry
 *   exhaustion; full history is preserved by the append-only log).
 */
export type RetryDecision =
  | { readonly decision: "retry" }
  | { readonly decision: "dead-letter" }
  | { readonly decision: "terminal"; readonly status: "failed" | "timed_out" };

/** Computes the retry decision for a failed attempt. */
export function decideRetry(
  policy: JobRetryPolicy,
  attemptsStarted: number,
  failure: TypedJobFailure,
): RetryDecision {
  if (!failure.retriable) {
    return { decision: "terminal", status: failure.terminalStatus };
  }
  if (attemptsStarted < policy.maxAttempts) {
    return { decision: "retry" };
  }
  return { decision: "dead-letter" };
}

/** Validates a declared retry policy (fail-closed, named reasons). */
export function retryPolicyViolations(
  policy: JobRetryPolicy,
): readonly string[] {
  const violations: string[] = [];
  if (
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1
  ) {
    violations.push("maxAttempts must be an integer >= 1");
  }
  if (!Array.isArray(policy.backoffScheduleMs)) {
    violations.push("backoffScheduleMs must be an array");
  } else {
    for (const delay of policy.backoffScheduleMs) {
      if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
        violations.push("backoffScheduleMs entries must be finite numbers >= 0");
        break;
      }
    }
  }
  return violations;
}
