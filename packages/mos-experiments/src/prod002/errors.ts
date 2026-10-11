/**
 * PROD-002 — Experiment / Evidence / Learning.
 * Typed-failure vocabulary. House law: failures are values — a code, a
 * message, and details — never thrown control flow, never fabricated away.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface Failure {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function failure(
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): Failure {
  return { code, message, details };
}

/** Documentation of the typed-failure space emitted by the PROD-002 surface. */
export type Prod002FailureCode =
  | 'E_INVALID_TENANT_ID'
  | 'E_PLAN_INVALID'
  | 'E_ABORT_REASON_REQUIRED'
  | 'E_EXPERIMENT_NOT_FOUND'
  | 'E_INVALID_TRANSITION'
  | 'E_WRONG_STATE'
  | 'E_CITATION_UNRESOLVED'
  | 'E_AUTHORITY_VERSION_UNAVAILABLE'
  | 'E_RIGHTS_DENIED'
  | 'E_JOB_ENQUEUE_FAILED'
  | 'E_JOB_CLAIM_FAILED'
  | 'E_JOB_COMPLETE_FAILED'
  | 'E_JOB_FAIL_FAILED'
  | 'E_JOBS_PORT_INCOMPATIBLE'
  | 'E_JOB_PAYLOAD_MISMATCH'
  | 'E_OBSERVATION_INVALID'
  | 'E_NON_PLATFORM_SAID_SOURCE'
  | 'E_TENANT_SCOPE_VIOLATION'
  | 'E_ATTRIBUTION_BINDING_MISMATCH'
  | 'E_OBSERVATION_OUTSIDE_WINDOW'
  | 'E_DUPLICATE_OBSERVATION'
  | 'E_OBSERVATION_LIMIT_EXCEEDED'
  | 'E_COLLECTION_WINDOW_OPEN'
  | 'E_EVIDENCE_EMPTY'
  | 'E_UNKNOWN_FORMULA'
  | 'E_UNSUPPORTED_CONFIDENCE'
  | 'E_METRIC_DATA_MISMATCH'
  | 'E_INSUFFICIENT_SAMPLE'
  | 'E_RESTRICTION_CONFLATION_FORBIDDEN'
  | 'E_LEARNING_MISSING_PREDICTION'
  | 'E_LEARNING_COUNTERFACTUAL_REJECTED'
  | 'E_LEARNING_PUBLISH_FAILED'
  | 'E_STORE_FAILED'
  | 'E_TRAIL_FAILED';
