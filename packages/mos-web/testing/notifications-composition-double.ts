/*
 * notifications-composition-double.ts — composition double for the NOTIFY-CS
 * surface (testing/, OUTSIDE src/): REAL-shaped view data, fully disclosed.
 * It simulates exactly what a composition root would inject — view models
 * built from the frozen plane shapes — never domain internals.
 *
 * Disclosed demonstrations baked into the data:
 *  - 6 distinct inbox records covering EVERY lifecycle status (a queued with
 *    backoff, a delivered with §30, a failed with typed failure + history,
 *    a suppressed by recipient rule, a suppressed at record level, a second
 *    queued never attempted);
 *  - a DEDUP PAIR: the submitted log holds SEVEN submits, the last being a
 *    SECOND submit with the same id + dedupKey as n-queued-2 — the idempotency
 *    law returns the EXISTING record unchanged, so the projection collapses
 *    it and the inbox carries exactly SIX rows;
 *  - 2 recipient suppression rules: one ACTIVE (liftedAt null), one LIFTED;
 *  - event histories: failed = [enqueued, retry-scheduled, delivery-failed
 *    (retryExhausted true)], delivered = [enqueued, delivered], recipient-
 *    suppressed = [enqueued, suppressed];
 *  - every §30 block carries the honest transport self-label
 *    "in-memory-notification-provider-double" VERBATIM.
 */
import type {
  NotificationAttemptObservabilityVm,
  NotificationDetailVm,
  NotificationEventVm,
  NotificationSummaryVm,
  NotificationsPageData,
  NotificationsViewPort,
  RecipientSuppressionRuleVm,
} from '../dist/src/ports/notifications-views.js';

/** The honest transport self-label carried by every §30 block — VERBATIM, never disguised. */
export const IN_MEMORY_TRANSPORT_LABEL = 'in-memory-notification-provider-double';

/** Fixed epoch base for deterministic timestamps (2025-01-01T00:00:00.000Z). */
export const IN_MEMORY_T0_MS = 1735689600000;

/** The tenant under which the double's data is scoped (§31). */
export const IN_MEMORY_TENANT_ID = 'tenant-alpha';

/** The tenant display name rendered beside the id (§31). */
export const IN_MEMORY_TENANT_DISPLAY_NAME = 'Alpha Cooperative';

/** The id of the dedup twin (the record that was submitted twice). */
export const IN_MEMORY_DEDUP_TWIN_ID = 'n-queued-2';

/** The dedup key shared by both submits of the twin (same key ⇒ same record). */
export const IN_MEMORY_DEDUP_TWIN_KEY = 'dedup:task-assignment:user-42:task-88';

/** The id of the notification the double selects for the event-history view. */
export const IN_MEMORY_SELECTED_ID = 'n-failed-1';

/** The message the throwing double rejects with (pinned by the error-state test). */
export const IN_MEMORY_THROWING_MESSAGE = 'boom: notifications store unreachable';

/** The availability reason the unavailable double reports (pinned by the unavailable-state test). */
export const IN_MEMORY_UNAVAILABLE_REASON = 'notification plane not wired in this deployment';

/**
 * Internal builder — a §30 block with the shared honest attribution and the
 * VERBATIM transport label; per-attempt facts vary by parameter.
 */
function observability(
  requestId: string,
  durationMs: number,
  failureCode: string | null,
  warningCount: number,
): NotificationAttemptObservabilityVm {
  return {
    requestId,
    providerId: 'prov-a',
    actorAuthority: 'mission-system',
    actorSubmitter: 'scheduler',
    durationMs,
    failureCode,
    warningCount,
    transportLabel: IN_MEMORY_TRANSPORT_LABEL,
  };
}

/** Queued, attempted once, transport failed, now backoff-gated. */
const QUEUED_WITH_BACKOFF: NotificationSummaryVm = {
  id: 'n-queued-1',
  dedupKey: 'dedup:task-reminder:user-42:task-77',
  kind: 'task-reminder',
  recipient: 'user-42',
  status: 'queued',
  attemptCount: 1,
  createdAt: IN_MEMORY_T0_MS + 1000,
  updatedAt: IN_MEMORY_T0_MS + 35000,
  deliveredAt: null,
  nextAttemptAtMs: IN_MEMORY_T0_MS + 60000,
  retryMaxAttempts: 4,
  latestFailure: null,
  suppression: null,
  subjectRefs: { artifacts: 0, tasks: 1, missions: 0 },
  subjectRefIds: ['task-77'],
  observability: observability('req-queued-1-attempt-1', 220, 'provider-transport-failed', 1),
};

/** Delivered on the first attempt, §30 block present, receipt-level facts in the history. */
const DELIVERED_WITH_RECEIPT: NotificationSummaryVm = {
  id: 'n-delivered-1',
  dedupKey: 'dedup:mission-event:user-42:mission-9',
  kind: 'mission-event',
  recipient: 'user-42',
  status: 'delivered',
  attemptCount: 1,
  createdAt: IN_MEMORY_T0_MS + 2000,
  updatedAt: IN_MEMORY_T0_MS + 8000,
  deliveredAt: IN_MEMORY_T0_MS + 8000,
  nextAttemptAtMs: null,
  retryMaxAttempts: 3,
  latestFailure: null,
  suppression: null,
  subjectRefs: { artifacts: 2, tasks: 0, missions: 1 },
  subjectRefIds: ['art-1', 'art-2', 'mission-9'],
  observability: observability('req-delivered-1', 145, null, 0),
};

/** Failed after exhausting the declared retries — typed failure, retriable false. */
const FAILED_RETRY_EXHAUSTED: NotificationSummaryVm = {
  id: 'n-failed-1',
  dedupKey: 'dedup:system-alert:user-42:disk-9',
  kind: 'system-alert',
  recipient: 'user-42',
  status: 'failed',
  attemptCount: 2,
  createdAt: IN_MEMORY_T0_MS + 3000,
  updatedAt: IN_MEMORY_T0_MS + 95000,
  deliveredAt: null,
  nextAttemptAtMs: null,
  retryMaxAttempts: 2,
  latestFailure: {
    code: 'provider-transport-failed',
    message: 'provider transport unreachable after 3 attempts',
    retriable: false,
  },
  suppression: null,
  subjectRefs: { artifacts: 0, tasks: 0, missions: 0 },
  subjectRefIds: [],
  observability: observability('req-failed-1-attempt-2', 480, 'provider-transport-failed', 1),
};

/** Suppressed by an ACTIVE recipient rule before any delivery attempt. */
const SUPPRESSED_BY_RECIPIENT_RULE: NotificationSummaryVm = {
  id: 'n-suppressed-recipient-1',
  dedupKey: 'dedup:rights-event:user-42:rights-12',
  kind: 'rights-event',
  recipient: 'user-42',
  status: 'suppressed',
  attemptCount: 0,
  createdAt: IN_MEMORY_T0_MS + 4000,
  updatedAt: IN_MEMORY_T0_MS + 5000,
  deliveredAt: null,
  nextAttemptAtMs: null,
  retryMaxAttempts: 3,
  latestFailure: null,
  suppression: {
    level: 'recipient',
    reason: 'recipient-requested hold while on leave',
    suppressedBy: 'user-42',
    suppressedAt: IN_MEMORY_T0_MS + 5000,
  },
  subjectRefs: { artifacts: 0, tasks: 0, missions: 1 },
  subjectRefIds: ['mission-4'],
  observability: null,
};

/** Suppressed at RECORD level (dedup window) before any delivery attempt. */
const SUPPRESSED_AT_RECORD_LEVEL: NotificationSummaryVm = {
  id: 'n-suppressed-record-1',
  dedupKey: 'dedup:system-alert:user-42:disk-9-backup',
  kind: 'system-alert',
  recipient: 'user-42',
  status: 'suppressed',
  attemptCount: 0,
  createdAt: IN_MEMORY_T0_MS + 6000,
  updatedAt: IN_MEMORY_T0_MS + 6500,
  deliveredAt: null,
  nextAttemptAtMs: null,
  retryMaxAttempts: 3,
  latestFailure: null,
  suppression: {
    level: 'record',
    reason: 'duplicate of an earlier system alert within the dedup window',
    suppressedBy: 'mos-jobs/system',
    suppressedAt: IN_MEMORY_T0_MS + 6500,
  },
  subjectRefs: { artifacts: 1, tasks: 0, missions: 0 },
  subjectRefIds: ['art-7'],
  observability: null,
};

/** Queued, never attempted — no §30 block, no backoff gate. */
const NEVER_ATTEMPTED_QUEUED: NotificationSummaryVm = {
  id: 'n-queued-2',
  dedupKey: 'dedup:task-assignment:user-42:task-88',
  kind: 'task-assignment',
  recipient: 'user-42',
  status: 'queued',
  attemptCount: 0,
  createdAt: IN_MEMORY_T0_MS + 7000,
  updatedAt: IN_MEMORY_T0_MS + 7000,
  deliveredAt: null,
  nextAttemptAtMs: null,
  retryMaxAttempts: 5,
  latestFailure: null,
  suppression: null,
  subjectRefs: { artifacts: 0, tasks: 1, missions: 0 },
  subjectRefIds: ['task-88'],
  observability: null,
};

/**
 * The submitted-notification log the double simulates the store from:
 * SEVEN submits — the last entry is the SECOND submit whose id + dedupKey
 * equal n-queued-2's; per the idempotency law the store returned the
 * EXISTING record unchanged, so the view projection below carries it exactly
 * ONCE in the inbox.
 */
export const IN_MEMORY_SUBMITTED_RECORDS: readonly NotificationSummaryVm[] = [
  QUEUED_WITH_BACKOFF,
  DELIVERED_WITH_RECEIPT,
  FAILED_RETRY_EXHAUSTED,
  SUPPRESSED_BY_RECIPIENT_RULE,
  SUPPRESSED_AT_RECORD_LEVEL,
  NEVER_ATTEMPTED_QUEUED,
  NEVER_ATTEMPTED_QUEUED, // the dedup twin: same id, same dedupKey → the existing record
];

/** The failed record's append-only history: enqueued → retry-scheduled → delivery-failed (retryExhausted). */
export const IN_MEMORY_FAILED_EVENTS: readonly NotificationEventVm[] = [
  {
    type: 'enqueued',
    sequence: 1,
    notificationId: 'n-failed-1',
    attempt: 0,
    recordedAt: IN_MEMORY_T0_MS + 3100,
    dedupKey: 'dedup:system-alert:user-42:disk-9',
    kind: 'system-alert',
    contractVersion: '1.0.0',
  },
  {
    type: 'retry-scheduled',
    sequence: 2,
    notificationId: 'n-failed-1',
    attempt: 1,
    recordedAt: IN_MEMORY_T0_MS + 3300,
    observability: observability('req-failed-1-attempt-1', 200, 'provider-transport-failed', 0),
    failure: {
      code: 'provider-transport-failed',
      message: 'provider transport unreachable (attempt 1)',
      retriable: true,
    },
    nextAttemptAtMs: IN_MEMORY_T0_MS + 33300,
    delayMs: 30000,
  },
  {
    type: 'delivery-failed',
    sequence: 3,
    notificationId: 'n-failed-1',
    attempt: 2,
    recordedAt: IN_MEMORY_T0_MS + 95000,
    observability: observability('req-failed-1-attempt-2', 480, 'provider-transport-failed', 1),
    failure: {
      code: 'provider-transport-failed',
      message: 'provider transport unreachable after 3 attempts',
      retriable: false,
    },
    attempts: 2,
    retryExhausted: true,
  },
];

/** The delivered record's append-only history: enqueued → delivered. */
export const IN_MEMORY_DELIVERED_EVENTS: readonly NotificationEventVm[] = [
  {
    type: 'enqueued',
    sequence: 1,
    notificationId: 'n-delivered-1',
    attempt: 0,
    recordedAt: IN_MEMORY_T0_MS + 2100,
    dedupKey: 'dedup:mission-event:user-42:mission-9',
    kind: 'mission-event',
    contractVersion: '1.0.0',
  },
  {
    type: 'delivered',
    sequence: 2,
    notificationId: 'n-delivered-1',
    attempt: 1,
    recordedAt: IN_MEMORY_T0_MS + 8000,
    observability: observability('req-delivered-1', 145, null, 0),
    receiptId: 'rcpt-delivered-1',
    deliveredAt: IN_MEMORY_T0_MS + 8000,
    providerAckRef: 'ack-9',
  },
];

/** The recipient-suppressed record's append-only history: enqueued → suppressed (rule-linked). */
export const IN_MEMORY_SUPPRESSED_EVENTS: readonly NotificationEventVm[] = [
  {
    type: 'enqueued',
    sequence: 1,
    notificationId: 'n-suppressed-recipient-1',
    attempt: 0,
    recordedAt: IN_MEMORY_T0_MS + 4100,
    dedupKey: 'dedup:rights-event:user-42:rights-12',
    kind: 'rights-event',
    contractVersion: '1.0.0',
  },
  {
    type: 'suppressed',
    sequence: 2,
    notificationId: 'n-suppressed-recipient-1',
    attempt: 0,
    recordedAt: IN_MEMORY_T0_MS + 5000,
    level: 'recipient',
    reason: 'recipient-requested hold while on leave',
    suppressedBy: 'user-42',
    recipientSuppressionId: 'rs-1',
  },
];

/** The failed record selected into the page data for the event-history view. */
const FAILED_DETAIL: NotificationDetailVm = {
  summary: FAILED_RETRY_EXHAUSTED,
  events: IN_MEMORY_FAILED_EVENTS,
};

/** The rule registry: one ACTIVE rule (liftedAt null) and one LIFTED rule. */
const RECIPIENT_SUPPRESSION_RULES: readonly RecipientSuppressionRuleVm[] = [
  {
    id: 'rs-1',
    recipient: 'user-42',
    state: 'active',
    reason: 'recipient-requested hold while on leave',
    suppressedBy: 'user-42',
    suppressedAt: IN_MEMORY_T0_MS + 120000,
    liftedAt: null,
    liftedBy: null,
  },
  {
    id: 'rs-2',
    recipient: 'user-43',
    state: 'lifted',
    reason: 'noise complaint for system alerts',
    suppressedBy: 'user-43',
    suppressedAt: IN_MEMORY_T0_MS + 60000,
    liftedAt: IN_MEMORY_T0_MS + 180000,
    liftedBy: 'user-43',
  },
];

/**
 * The page projection over the submitted log. The DEDUP LAW lives here:
 * the projection returns each record exactly once by id — a second submit
 * with the same dedupKey is the SAME record and collapses (7 submits ⇒ 6
 * inbox rows).
 */
function pageData(): NotificationsPageData {
  const seen = new Set<string>();
  const inbox: NotificationSummaryVm[] = [];
  for (const record of IN_MEMORY_SUBMITTED_RECORDS) {
    if (seen.has(record.id)) {
      continue; // dedup law: the second submit returned the existing record
    }
    seen.add(record.id);
    inbox.push(record);
  }
  return {
    tenant: { tenantId: IN_MEMORY_TENANT_ID, tenantDisplayName: IN_MEMORY_TENANT_DISPLAY_NAME },
    availability: { kind: 'available' },
    inbox,
    selected: FAILED_DETAIL,
    recipientSuppressions: RECIPIENT_SUPPRESSION_RULES,
    generatedAtMs: IN_MEMORY_T0_MS + 200000,
  };
}

/**
 * The primary double: the view port over the disclosed in-memory data.
 * getNotificationsViewData resolves asynchronously (a real port is a server
 * round-trip).
 */
export function createInMemoryNotificationsViewPort(): NotificationsViewPort {
  return {
    getNotificationsViewData: async (): Promise<NotificationsPageData> => pageData(),
  };
}

/**
 * The empty double: availability 'available' with a zero-row inbox — the
 * empty inbox is a REAL state, never an error.
 */
export function createEmptyNotificationsViewPort(): NotificationsViewPort {
  return {
    getNotificationsViewData: async (): Promise<NotificationsPageData> => ({
      ...pageData(),
      inbox: [],
      selected: null,
    }),
  };
}

/**
 * The unavailable double: the availability verdict kind 'unavailable' with
 * an explicit reason — the surface must render the verdict, never
 * placeholder content.
 */
export function createUnavailableNotificationsViewPort(
  reason: string = IN_MEMORY_UNAVAILABLE_REASON,
): NotificationsViewPort {
  return {
    getNotificationsViewData: async (): Promise<NotificationsPageData> => ({
      ...pageData(),
      availability: { kind: 'unavailable', reason },
      inbox: [],
      selected: null,
    }),
  };
}

/**
 * The throwing double: the port call fails — the surface must land in the
 * 'error' state carrying the message, never a placeholder.
 */
export function createThrowingNotificationsViewPort(): NotificationsViewPort {
  return {
    getNotificationsViewData: async (): Promise<NotificationsPageData> => {
      throw new Error(IN_MEMORY_THROWING_MESSAGE);
    },
  };
}
