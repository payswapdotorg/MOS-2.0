/*
 * notifications-views.ts — view-side contracts for the notification consumer
 * surface (NOTIFY-CS), the recipient-facing read side of the frozen
 * notification plane (NOTIFY-001).
 *
 * PRESENTATION-ONLY (WEB-001 discipline): this file imports NOTHING — not
 * even from sibling packages. The frozen plane authority
 * (packages/mos-jobs/src/contracts/notification.ts + notification-events.ts)
 * is RE-DECLARED here as plain view models: branded ids (NotificationId,
 * IdentityRef, TenantScope, ArtifactRef, HumanProductionTaskId, MissionRef,
 * DeliveryAttemptId, ProviderId) become plain `string`, timestamps stay
 * epoch-ms `number`. The composition root injects real-shaped data; the
 * surface renders only what it is handed and never fabricates content.
 */

/** The frozen notification-kind vocabulary, re-declared for the view (source: NOTIFICATION_KINDS). */
export const NOTIFICATION_VIEW_KINDS = [
  'mission-event',
  'task-assignment',
  'task-reminder',
  'rights-event',
  'system-alert',
] as const;

/** One frozen notification kind (source: NotificationKind). */
export type NotificationViewKind = (typeof NOTIFICATION_VIEW_KINDS)[number];

/** The frozen lifecycle-status vocabulary, re-declared for the view (source: NOTIFICATION_STATUSES). */
export const NOTIFICATION_VIEW_STATUSES = ['queued', 'delivered', 'failed', 'suppressed'] as const;

/** One notification lifecycle status (source: NotificationStatus). */
export type NotificationViewStatus = (typeof NOTIFICATION_VIEW_STATUSES)[number];

/** The frozen terminal-status vocabulary (source: TERMINAL_NOTIFICATION_STATUSES). */
export const NOTIFICATION_VIEW_TERMINAL_STATUSES = ['delivered', 'failed', 'suppressed'] as const;

/**
 * Honest availability verdict for the surface. FIRST-CLASS: the shell renders
 * the verdict itself instead of placeholder content
 * (BROWSER-SHELL-REPLACEMENT-PLAN §4 risk 5).
 */
export type NotificationsAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * A typed failure on a delivery attempt or on a record (source:
 * TypedNotificationFailure). The frozen code union is
 * 'provider-rejected' | 'provider-transport-failed'; the view keeps `code`
 * as a plain string so an unknown code renders verbatim instead of being
 * coerced (UNKNOWN never coerced).
 */
export interface NotificationFailureVm {
  readonly code: string;
  readonly message: string;
  readonly retriable: boolean;
}

/**
 * The §30 observability block of the LATEST delivery attempt (source:
 * NotificationAttemptObservability). Projection choices, disclosed: the actor
 * attribution is flattened to its two labels, and the warning list
 * ({code, message}[] in the plane) is reduced to a count — the count renders;
 * the codes stay in the plane authority, not in this view. `transportLabel`
 * is the provider's honest self-label and is rendered VERBATIM, never
 * disguised (e.g. "in-memory-notification-provider-double").
 */
export interface NotificationAttemptObservabilityVm {
  readonly requestId: string; // DeliveryAttemptId (branded in @mos/jobs; plain here)
  readonly providerId: string; // ProviderId
  readonly actorAuthority: string; // NotificationActorAttribution.authority
  readonly actorSubmitter: string; // NotificationActorAttribution.submitter
  readonly durationMs: number; // Milliseconds
  readonly failureCode: string | null; // latest attempt failure code; null when the attempt succeeded
  readonly warningCount: number; // the plane's warnings list, counted for the view
  readonly transportLabel: string; // shown VERBATIM
}

/**
 * Suppression facts recorded on a single notification (source:
 * NotificationSuppressionInfo). `level` is 'recipient' | 'record' in the
 * plane; kept as `string` here so the view never coerces an unknown level.
 */
export interface NotificationSuppressionVm {
  readonly level: string; // 'recipient' | 'record' in the frozen plane
  readonly reason: string;
  readonly suppressedBy: string;
  readonly suppressedAt: number; // epoch ms
}

/**
 * Reference-only subject counts (source: NotificationSubject). Subjects are
 * REFERENCES: counts plus the ids in `subjectRefIds` — never message content.
 */
export interface NotificationSubjectRefsVm {
  readonly artifacts: number;
  readonly tasks: number;
  readonly missions: number;
}

/**
 * One inbox row: the recipient-facing summary of a NotificationRecord
 * (source: NotificationRecord in packages/mos-jobs — re-declared, never
 * imported).
 */
export interface NotificationSummaryVm {
  readonly id: string; // NotificationId
  readonly dedupKey: string; // NotificationDedupKey — same dedup key ⇒ same record (idempotent submit)
  readonly kind: string; // NotificationKind (the frozen 5-value vocabulary above)
  readonly recipient: string; // IdentityRef
  readonly status: NotificationViewStatus;
  readonly attemptCount: number; // attempts RECORDED, including failures
  readonly createdAt: number; // epoch ms
  readonly updatedAt: number; // epoch ms
  readonly deliveredAt: number | null;
  readonly nextAttemptAtMs: number | null; // backoff gate for queued records
  readonly retryMaxAttempts: number; // retryPolicy.maxAttempts (JobRetryPolicy shape) — the declared policy summary
  readonly latestFailure: NotificationFailureVm | null; // latest typed failure
  readonly suppression: NotificationSuppressionVm | null; // suppression is first-class, never silent
  readonly subjectRefs: NotificationSubjectRefsVm; // counts — references ONLY
  readonly subjectRefIds: readonly string[]; // the reference chips render these ids
  readonly observability: NotificationAttemptObservabilityVm | null; // null before the first attempt
}

/**
 * One entry of the append-only event history of a selected notification
 * (source: NotificationEvent). Every variant carries sequence, attempt and
 * recordedAt. Disclosed projection: the enqueued variant's actor/subject echo
 * the record summary, so this view repeats only the identifying fields
 * (dedupKey, kind, contractVersion) — the row summary carries the rest.
 */
export type NotificationEventVm =
  | {
      readonly type: 'enqueued';
      readonly sequence: number;
      readonly notificationId: string;
      readonly attempt: 0;
      readonly recordedAt: number;
      readonly dedupKey: string;
      readonly kind: string;
      readonly contractVersion: string;
    }
  | {
      readonly type: 'delivered';
      readonly sequence: number;
      readonly notificationId: string;
      readonly attempt: number;
      readonly recordedAt: number;
      readonly observability: NotificationAttemptObservabilityVm;
      readonly receiptId: string;
      readonly deliveredAt: number;
      readonly providerAckRef: string | null;
    }
  | {
      readonly type: 'retry-scheduled';
      readonly sequence: number;
      readonly notificationId: string;
      readonly attempt: number;
      readonly recordedAt: number;
      readonly observability: NotificationAttemptObservabilityVm;
      readonly failure: NotificationFailureVm;
      readonly nextAttemptAtMs: number;
      readonly delayMs: number;
    }
  | {
      readonly type: 'delivery-failed';
      readonly sequence: number;
      readonly notificationId: string;
      readonly attempt: number;
      readonly recordedAt: number;
      readonly observability: NotificationAttemptObservabilityVm;
      readonly failure: NotificationFailureVm;
      readonly attempts: number;
      readonly retryExhausted: boolean;
    }
  | {
      readonly type: 'suppressed';
      readonly sequence: number;
      readonly notificationId: string;
      readonly attempt: number;
      readonly recordedAt: number;
      readonly level: 'recipient' | 'record';
      readonly reason: string;
      readonly suppressedBy: string;
      readonly recipientSuppressionId: string | null;
    };

/** The selected notification together with its append-only event history. */
export interface NotificationDetailVm {
  readonly summary: NotificationSummaryVm;
  readonly events: readonly NotificationEventVm[];
}

/**
 * One recipient suppression rule from the rule registry (source:
 * RecipientSuppression). `state` is the derived, honest view of the rule:
 * 'active' while liftedAt is null, 'lifted' once liftedAt + liftedBy are
 * recorded.
 */
export interface RecipientSuppressionRuleVm {
  readonly id: string;
  readonly recipient: string; // IdentityRef
  readonly state: 'active' | 'lifted';
  readonly reason: string;
  readonly suppressedBy: string;
  readonly suppressedAt: number; // epoch ms
  readonly liftedAt: number | null;
  readonly liftedBy: string | null;
}

/** Tenant context, explicit per §31 (source: TenantScope + display name). */
export interface NotificationsTenantContextVm {
  readonly tenantId: string; // TenantScope (branded in @mos/jobs; plain here)
  readonly tenantDisplayName: string;
}

/**
 * The whole page the surface renders, resolved in one port call: tenant
 * context, availability verdict, the recipient inbox, the selected
 * notification's event history, and the recipient suppression registry.
 */
export interface NotificationsPageData {
  readonly tenant: NotificationsTenantContextVm;
  readonly availability: NotificationsAvailability;
  readonly inbox: readonly NotificationSummaryVm[];
  readonly selected: NotificationDetailVm | null;
  readonly recipientSuppressions: readonly RecipientSuppressionRuleVm[];
  readonly generatedAtMs: number; // epoch ms — when the view data was assembled
}

/** Alias kept for drift-safety with earlier sketches of the port's return type. */
export type NotificationsViewData = NotificationsPageData;

/**
 * The typed view port the surface consumes. PRESENTATION-ONLY: the
 * composition root injects an implementation backed by the notification
 * plane (or a disclosed double under testing/); the view never knows which.
 */
export interface NotificationsViewPort {
  getNotificationsViewData(): Promise<NotificationsPageData>;
}
