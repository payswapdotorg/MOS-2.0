/**
 * Public surface of `@mos/jobs` (MOS v2.0 JOBS-001).
 *
 * The durable-job authority (§26): DurableJobRecord vocabulary, the
 * JobQueuePort work-polling surface (idempotent enqueue, leased claims,
 * heartbeats, typed complete/fail/cancel, retries driven from typed
 * failures, dead-lettering with full append-only history), the
 * DurableJobStorePort persistence seam, the ENG-003 runner-seam bridge
 * adapter (§30 actor enrichment) and the disclosed in-memory adapters.
 *
 * Runtime export count: 11 (4 factories — queue, disclosed in-memory
 * store, runner-seam bridge, disclosed poller double; 3 pure domain
 * functions; 3 branded-id builders; 1 error class) + 4 frozen vocabulary
 * constants. The 12-public-method policy budget applies PER PORT —
 * JobQueuePort 10, DurableJobStorePort 7.
 */

// ---- Contracts: the durable job record + vocabulary ----
export type {
  DurableJobInput,
  DurableJobKind,
  DurableJobObservability,
  DurableJobRecord,
  DurableJobRunInfo,
  DurableJobStatus,
  DurableJobSubmission,
  JobActorAttribution,
  JobCompletion,
  JobListQuery,
  JobProvenance,
  JobRetryPolicy,
  JobSubmitterActor,
  JobWarning,
  TerminalJobStatus,
  TypedJobFailure,
} from "./contracts/durable-job.js";
export {
  DURABLE_JOB_KINDS,
  DURABLE_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
} from "./contracts/durable-job.js";
export type {
  DurableJobEvent,
  DurableJobEventInput,
  DurableJobEventType,
} from "./contracts/job-events.js";
export { DURABLE_JOB_EVENT_TYPES } from "./contracts/job-events.js";
export type {
  DurableJobId,
  JobKey,
  LeaseToken,
} from "./contracts/ids.js";
export { durableJobId, jobKey, leaseToken } from "./contracts/ids.js";

// ---- Contracts: the ENG-003 runner seam mirror ----
export type {
  RunnerJobCompletedEvent,
  RunnerJobEvent,
  RunnerJobEventSink,
  RunnerJobLifecycleState,
  RunnerJobQueuedEvent,
  RunnerJobRunningEvent,
  RunnerRunObservabilityRecord,
} from "./contracts/runner-events.js";

// ---- Ports ----
export type {
  JobClaim,
  JobClaimQuery,
  JobClaimRef,
  JobMutationOptions,
  JobQueuePort,
} from "./ports/job-queue.port.js";
export type {
  ClaimableJobsQuery,
  DurableJobStorePort,
} from "./ports/durable-job-store.port.js";

// ---- Domain ----
export type { RetryDecision } from "./domain/retry-policy.js";
export {
  decideRetry,
  retryDelayMs,
  retryPolicyViolations,
} from "./domain/retry-policy.js";
export { JobQueueError } from "./domain/errors.js";
export type { JobQueueErrorCode } from "./domain/errors.js";

// ---- Adapters ----
export type { DurableJobQueueOptions } from "./adapters/durable-job-queue.js";
export { createDurableJobQueue } from "./adapters/durable-job-queue.js";
export { createInMemoryDurableJobStore } from "./adapters/in-memory-durable-job-store.js";
export type {
  EngineRunnerJobEventBridge,
  EngineRunnerJobEventBridgeOptions,
  UnresolvedRunnerEvent,
} from "./adapters/engine-runner-job-event-bridge.js";
export { createEngineRunnerJobEventBridge } from "./adapters/engine-runner-job-event-bridge.js";

// ---- DISCLOSED TEST DOUBLE (clock-driven poller — never an authority) ----
export type {
  JobPollerDouble,
  JobPollerDoubleOptions,
  JobPollerTimers,
} from "./test-doubles/job-poller-double.js";
export { createJobPollerDouble } from "./test-doubles/job-poller-double.js";
