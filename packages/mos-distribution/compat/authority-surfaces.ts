/**
 * PROD-001 zero-drift pins — TL-side reconciliation points (AC9).
 *
 * These arrays mirror the REAL authority surfaces as declared in:
 *   - spec/contracts/core-contracts-v2.0.yaml (SocialAdapter + ConnectorProvider)
 *   - spec/mos-module-registry-v2.0.yaml (distribution / integrations / jobs modules)
 *
 * When a REAL authority changes, update the pin here: the compat battery
 * then fails until the production ports and twins are realigned. That is the
 * zero-drift mechanism — drift is detected at the boundary, not in the wild.
 *
 * NOTE (disclosed): Worker C could not read the real contracts in this
 * session; these pins reflect the dispatch packet's declared surface
 * (publish/schedule/read-observations/delete-retract/list-restrictions;
 * enqueue idempotent by client job key; the six job states). The TL
 * reconciles on first run — this file is the single place to do it.
 */

export const DISTRIBUTION_AUTHORITY_SURFACE: readonly string[] = [
  'publish', 'schedule', 'readObservations', 'delete', 'listRestrictions',
];

export const JOBS_QUEUE_SURFACE: readonly string[] = ['enqueue', 'getJob', 'cancelJob'];

/** Twin-only runtime surface, disclosed; NOT part of the real JobQueuePort. */
export const JOBS_TWIN_ONLY_SURFACE: readonly string[] = ['registerHandler', 'runDue', 'nextRunAtMs'];

export const RIGHTS_GATE_SURFACE: readonly string[] = ['evaluateRights'];

export const POLICY_GATE_SURFACE: readonly string[] = ['evaluatePolicy'];

export const HEALTH_AUTHORITY_SURFACE: readonly string[] = ['readRestrictions'];

export const INTEGRATIONS_DIRECTORY_SURFACE: readonly string[] = ['listCapabilityInstances'];

export const OBSERVABILITY_RECORDER_SURFACE: readonly string[] = ['appendObservabilityRecord'];

export const GATE_DECISION_VOCAB: readonly string[] = ['ALLOW', 'DENY'];

export const JOB_STATE_VOCAB: readonly string[] = [
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out',
];

/** Declared retryability per typed failure kind (drift guard). */
export const TYPED_FAILURE_RETRYABILITY: Readonly<Record<string, boolean>> = {
  transport_error: true,
  provider_rejected: false,
  timeout: true,
  unknown_failure: false,
};

export const MAX_PORT_METHODS = 12;
