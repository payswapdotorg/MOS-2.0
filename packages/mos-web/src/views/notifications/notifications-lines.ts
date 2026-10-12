/*
 * notifications-lines.ts — structural line renderers for the notification
 * consumer surface (NOTIFY-CS). Pure functions: view model → display line
 * (string). Every line is deterministic; timestamps render as stable
 * ISO-8601 (UTC). Clauses are rendered ONLY when the underlying fact is
 * present (null renderers return null) — nothing is fabricated.
 */
import type {
  NotificationEventVm,
  NotificationSummaryVm,
  NotificationViewStatus,
  NotificationsTenantContextVm,
  RecipientSuppressionRuleVm,
} from '../../ports/notifications-views.js';

/**
 * Badge labels per lifecycle status — the textual half of the
 * visually-distinct lifecycle badge contract (the color half is
 * NOTIFICATION_BADGE_COLORS; the React surface maps the color names to
 * literal Tailwind classes locally so the scanner sees every class).
 */
export const NOTIFICATION_BADGE_LABELS: Readonly<Record<NotificationViewStatus, string>> = {
  queued: 'QUEUED',
  delivered: 'DELIVERED',
  failed: 'FAILED',
  suppressed: 'SUPPRESSED',
};

/**
 * Badge color vocabulary per lifecycle status — queued=amber,
 * delivered=emerald, failed=rose, suppressed=zinc. Color NAMES here (stable,
 * testable in plain text); the Tailwind class literals live in the .tsx.
 */
export const NOTIFICATION_BADGE_COLORS: Readonly<Record<NotificationViewStatus, string>> = {
  queued: 'amber',
  delivered: 'emerald',
  failed: 'rose',
  suppressed: 'zinc',
};

/**
 * Stable ISO-8601 (UTC) rendering of an epoch-ms timestamp — the stable
 * string form the house accepts for epoch-ms facts.
 */
export function renderTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

/**
 * The lifecycle badge line — distinct per status by construction: the status
 * word, the badge label and the badge color all appear, so no two statuses
 * can render the same line.
 */
export function renderLifecycleBadge(status: NotificationViewStatus): string {
  return `status=${status} badge=${NOTIFICATION_BADGE_LABELS[status]} color=${NOTIFICATION_BADGE_COLORS[status]}`;
}

/** The tenant context header line (§31: tenantId + displayName, explicit). */
export function renderTenantHeader(tenant: NotificationsTenantContextVm): string {
  return `tenant ${tenant.tenantId} · ${tenant.tenantDisplayName}`;
}

/**
 * The record header line — id, kind, recipient, dedupKey (idempotency
 * honest: the key is always visible), created/updated, and the delivered
 * timestamp when present.
 */
export function renderRecordHeaderLine(vm: NotificationSummaryVm): string {
  const delivered = vm.deliveredAt !== null ? ` · delivered ${renderTimestamp(vm.deliveredAt)}` : '';
  return `id ${vm.id} · kind ${vm.kind} · recipient ${vm.recipient} · dedupKey ${vm.dedupKey} · created ${renderTimestamp(vm.createdAt)} · updated ${renderTimestamp(vm.updatedAt)}${delivered}`;
}

/**
 * The subject-refs line — REFERENCES ONLY: total, per-kind counts, and the
 * ref ids. NEVER any message content (the view models carry no body to
 * fabricate from; the ids are the whole story).
 */
export function renderSubjectRefs(vm: NotificationSummaryVm): string {
  const refs = vm.subjectRefs;
  const total = vm.subjectRefIds.length;
  const ids = total > 0 ? vm.subjectRefIds.join(', ') : 'none';
  return `subject refs (${total}): ${refs.artifacts} artifact(s), ${refs.tasks} task(s), ${refs.missions} mission(s) · refs: ${ids}`;
}

/**
 * The §30 observability line for the LATEST attempt — attempt count,
 * provider id, duration, request id, actor attribution, warning count,
 * latest-attempt failure code when present, and the transport label
 * VERBATIM. Returns null when the record has no attempt block yet.
 */
export function renderObservability(vm: NotificationSummaryVm): string | null {
  const obs = vm.observability;
  if (obs === null) {
    return null;
  }
  const failure = obs.failureCode !== null ? ` · failure ${obs.failureCode}` : '';
  return `attempt ${vm.attemptCount} · provider ${obs.providerId} · ${obs.durationMs}ms · request ${obs.requestId} · actor ${obs.actorAuthority}/${obs.actorSubmitter} · warnings ${obs.warningCount}${failure} · transport: ${obs.transportLabel}`;
}

/**
 * The suppression line — suppression is FIRST-CLASS, never silent: level,
 * suppressedBy, timestamp, reason. Returns null when the record is not
 * suppressed.
 */
export function renderSuppression(vm: NotificationSummaryVm): string | null {
  const suppression = vm.suppression;
  if (suppression === null) {
    return null;
  }
  return `suppressed · level ${suppression.level} · by ${suppression.suppressedBy} · at ${renderTimestamp(suppression.suppressedAt)} · reason: ${suppression.reason}`;
}

/**
 * The latest typed failure line — code + message + retriable. Returns null
 * when the record carries no failure.
 */
export function renderFailure(vm: NotificationSummaryVm): string | null {
  const failure = vm.latestFailure;
  if (failure === null) {
    return null;
  }
  return `failure: ${failure.code} · ${failure.message} · retriable: ${failure.retriable}`;
}

/**
 * The retry/backoff line — retry/backoff HONESTY: only for queued records
 * with a nextAttemptAtMs gate, rendering the declared retry policy summary
 * and the gate as a "not deliverable before" fact. Returns null otherwise
 * (non-queued records, and queued records with no gate).
 */
export function renderBackoff(vm: NotificationSummaryVm): string | null {
  if (vm.status !== 'queued' || vm.nextAttemptAtMs === null) {
    return null;
  }
  return `retry policy: max ${vm.retryMaxAttempts} attempts · not deliverable before ${renderTimestamp(vm.nextAttemptAtMs)}`;
}

/**
 * One suppression-rule registry line — active and lifted rules render
 * distinctly: the state word, and the lifting facts (by whom, when) only
 * when the rule has actually been lifted.
 */
export function renderSuppressionRuleLine(rule: RecipientSuppressionRuleVm): string {
  const base = `rule ${rule.id} · recipient ${rule.recipient} · state: ${rule.state} · reason: ${rule.reason} · by ${rule.suppressedBy} at ${renderTimestamp(rule.suppressedAt)}`;
  const lifted =
    rule.liftedAt !== null && rule.liftedBy !== null
      ? ` · lifted by ${rule.liftedBy} at ${renderTimestamp(rule.liftedAt)}`
      : '';
  return `${base}${lifted}`;
}

/**
 * One event-history line — sequence, type, attempt number, recordedAt, plus
 * the type-specific fields: enqueued (kind, dedupKey, contractVersion),
 * delivered (receipt, provider ack, deliveredAt, transport label VERBATIM),
 * retry-scheduled (failure, next attempt, delay), delivery-failed (failure,
 * attempts, retryExhausted), suppressed (level, reason, by, rule linkage).
 * The default branch is an exhaustiveness guard: adding an event type to the
 * union breaks compilation here rather than rendering silently wrong.
 */
export function renderEventLine(event: NotificationEventVm): string {
  const head = `#${event.sequence} ${event.type} · attempt ${event.attempt} · at ${renderTimestamp(event.recordedAt)}`;
  switch (event.type) {
    case 'enqueued':
      return `${head} · kind ${event.kind} · dedupKey ${event.dedupKey} · contract ${event.contractVersion}`;
    case 'delivered': {
      const ack = event.providerAckRef !== null ? event.providerAckRef : 'none';
      return `${head} · receipt ${event.receiptId} · providerAck ${ack} · delivered ${renderTimestamp(event.deliveredAt)} · transport: ${event.observability.transportLabel}`;
    }
    case 'retry-scheduled':
      return `${head} · failure ${event.failure.code} (${event.failure.message}) · retriable: ${event.failure.retriable} · next at ${renderTimestamp(event.nextAttemptAtMs)} · delay ${event.delayMs}ms`;
    case 'delivery-failed':
      return `${head} · failure ${event.failure.code} (${event.failure.message}) · retriable: ${event.failure.retriable} · attempts ${event.attempts} · retryExhausted ${event.retryExhausted}`;
    case 'suppressed': {
      const rule = event.recipientSuppressionId !== null ? ` · rule ${event.recipientSuppressionId}` : '';
      return `${head} · level ${event.level} · reason: ${event.reason} · by ${event.suppressedBy}${rule}`;
    }
    default: {
      const neverType: never = event;
      return `unknown notification event type: ${String(neverType)}`;
    }
  }
}
