/**
 * Public surface of `@mos/jobs` (MOS v2.0 JOBS-001 + NOTIFY-001).
 *
 * The durable-job authority (§26): DurableJobRecord vocabulary, the
 * JobQueuePort work-polling surface (idempotent enqueue, leased claims,
 * heartbeats, typed complete/fail/cancel, retries driven from typed
 * failures, dead-lettering with full append-only history), the
 * DurableJobStorePort persistence seam, the ENG-003 runner-seam bridge
 * adapter (§30 actor enrichment) and the disclosed in-memory adapters.
 *
 * The notification plane (NOTIFY-001 — MOS2-WAVE5-HARVEST TL topology
 * decision: no notify module in the frozen registry, so the plane lives
 * here): NotificationRecord vocabulary (declarative kinds, identity-ref
 * recipients, reference-only subjects, dedup idempotency, lifecycle
 * queued → delivered | failed | suppressed), the NotificationDeliveryPort
 * (delivery attempts as RECORDED §30 events through the declared
 * NotificationProviderPort transport seam, receipts on success, typed
 * retries otherwise, suppression with reasons), the NotificationStorePort
 * persistence seam and the disclosed in-memory store + provider doubles.
 *
 * Runtime export count: 18 (7 factories — queue, disclosed in-memory job
 * store, runner-seam bridge, disclosed poller double, notification plane,
 * disclosed in-memory notification store, disclosed in-memory notification
 * provider double; 4 pure domain functions; 7 branded-id builders... see
 * the README surface table) + 9 frozen vocabulary constants + 1 error
 * class. The 12-public-method policy budget applies PER PORT —
 * JobQueuePort 10, DurableJobStorePort 7, NotificationDeliveryPort 11,
 * NotificationStorePort 11, NotificationProviderPort 1.
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

// ---- Contracts: the notification plane (NOTIFY-001) ----
export type {
  NotificationActorAttribution,
  NotificationAttemptObservability,
  NotificationDeliveryFailureCode,
  NotificationKind,
  NotificationListQuery,
  NotificationRecord,
  NotificationReceipt,
  NotificationRetryPolicy,
  NotificationStatus,
  NotificationSubject,
  NotificationSubmitterActor,
  NotificationSuppressionInfo,
  NotificationSuppressionLevel,
  NotificationWarning,
  RecipientSuppression,
  TerminalNotificationStatus,
  TypedNotificationFailure,
} from "./contracts/notification.js";
export {
  NOTIFICATION_DELIVERY_FAILURE_CODES,
  NOTIFICATION_KINDS,
  NOTIFICATION_STATUSES,
  TERMINAL_NOTIFICATION_STATUSES,
} from "./contracts/notification.js";
export type {
  DeliveryAttemptId,
  NotificationDedupKey,
  NotificationId,
  NotificationReceiptId,
  ProviderAckRef,
} from "./contracts/ids.js";
export {
  deliveryAttemptId,
  notificationDedupKey,
  notificationId,
  notificationReceiptId,
  providerAckRef,
} from "./contracts/ids.js";
export type {
  NotificationEvent,
  NotificationEventInput,
  NotificationEventType,
} from "./contracts/notification-events.js";
export { NOTIFICATION_EVENT_TYPES } from "./contracts/notification-events.js";

// ---- Ports: the notification plane ----
export type {
  DeliveryAttemptOptions,
  NotificationDeliveryResult,
  NotificationDeliveryPort,
} from "./ports/notification-delivery.port.js";
export type {
  NotificationDeliveryRequest,
  NotificationProviderPort,
  NotificationProviderResponse,
} from "./ports/notification-provider.port.js";
export type { NotificationStorePort } from "./ports/notification-store.port.js";

// ---- Domain: the notification plane ----
export type { NotificationRetryDecision } from "./domain/notification-retry.js";
export {
  decideNotificationRetry,
  notificationRetryDelayMs,
} from "./domain/notification-retry.js";
export { notificationSubmissionViolations } from "./domain/notification-submission-validation.js";
export { NotificationPlaneError } from "./domain/errors.js";
export type { NotificationPlaneErrorCode } from "./domain/errors.js";

// ---- Adapters: the notification plane ----
export type { NotificationDeliveryPlaneOptions } from "./adapters/notification-delivery-plane.js";
export { createNotificationDeliveryPlane } from "./adapters/notification-delivery-plane.js";
export { createInMemoryNotificationStore } from "./adapters/in-memory-notification-store.js";
export type {
  InMemoryNotificationProviderDoubleOptions,
  InMemoryNotificationRoute,
} from "./adapters/in-memory-notification-provider.js";
export { createInMemoryNotificationProviderDouble } from "./adapters/in-memory-notification-provider.js";
