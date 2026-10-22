/*
 * notifications-view.tsx — the React route surface for the notification
 * consumer surface (NOTIFY-CS), following the connections-view.tsx house
 * pattern. Presentation only: the shell hands it an already-resolved
 * NotificationsPageData; loading/error shells live above this component.
 * No react import — the repo's views rely on the automatic JSX runtime
 * (react-jsx). All line texts come from the shared line renderers so the
 * DOM and the structural lines cannot drift apart.
 */
import type {
  NotificationDetailVm,
  NotificationSummaryVm,
  NotificationsPageData,
  NotificationViewStatus,
  RecipientSuppressionRuleVm,
} from '../ports/notifications-views.js';
import { DEDUP_LAW_LINE } from '../views/notifications/notifications-view.js';
import {
  renderBackoff,
  renderEventLine,
  renderFailure,
  renderObservability,
  renderRecordHeaderLine,
  renderSubjectRefs,
  renderSuppression,
  renderSuppressionRuleLine,
  renderTenantHeader,
} from '../views/notifications/notifications-lines.js';

/**
 * Literal Tailwind classes per lifecycle status — the colored chip contract:
 * queued=amber, delivered=emerald, failed=rose, suppressed=zinc. Kept as
 * full literal strings here (not assembled from the color names) so the
 * Tailwind scanner sees every class name in this file.
 */
const STATUS_CHIP_CLASSES: Readonly<Record<NotificationViewStatus, string>> = {
  queued: 'border-amber-300 bg-amber-100 text-amber-800',
  delivered: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  failed: 'border-rose-300 bg-rose-100 text-rose-800',
  suppressed: 'border-zinc-300 bg-zinc-100 text-zinc-700',
};

/**
 * One inbox row: the distinct lifecycle chip, the record header (id, kind,
 * recipient, dedupKey — idempotency honest), timestamps, the subject
 * reference chips (counts + ids, never message content), the §30 block when
 * present, the suppression panel when suppressed, the backoff line when the
 * queued record is gated, and the typed failure when present.
 */
function NotificationRow({ vm }: { readonly vm: NotificationSummaryVm }) {
  return (
    <article data-testid="notif-row" className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          data-testid={`notif-status-${vm.status}`}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CHIP_CLASSES[vm.status]}`}
        >
          {vm.status}
        </span>
      </div>
      <p className="text-xs text-slate-500">{renderRecordHeaderLine(vm)}</p>
      <div data-testid="notif-subject-refs" className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-slate-500">{renderSubjectRefs(vm)}</span>
        {vm.subjectRefIds.map((refId, index) => (
          <span
            key={`${index}:${refId}`}
            className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700"
          >
            {refId}
          </span>
        ))}
      </div>
      {vm.observability !== null ? (
        <p data-testid="notif-observability" className="text-xs text-slate-600">
          {renderObservability(vm)}
        </p>
      ) : null}
      {vm.suppression !== null ? (
        <p data-testid="notif-suppression" className="text-xs text-zinc-600">
          {renderSuppression(vm)}
        </p>
      ) : null}
      {vm.status === 'queued' && vm.nextAttemptAtMs !== null ? (
        <p data-testid="notif-backoff" className="text-xs text-amber-700">
          {renderBackoff(vm)}
        </p>
      ) : null}
      {vm.latestFailure !== null ? (
        <p data-testid="notif-failure" className="text-xs text-rose-700">
          {renderFailure(vm)}
        </p>
      ) : null}
    </article>
  );
}

/**
 * The recipient suppression-rule registry: active and lifted rules listed
 * separately and distinctly, with reasons — never silent.
 */
function SuppressionRulesPanel({ rules }: { readonly rules: readonly RecipientSuppressionRuleVm[] }) {
  return (
    <div data-testid="notif-suppression-rules" className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recipient suppression rules</h2>
      {rules.map((rule) => (
        <p
          key={rule.id}
          data-testid="notif-suppression-rule"
          className={`text-xs ${rule.state === 'active' ? 'text-rose-700' : 'text-slate-500'}`}
        >
          {renderSuppressionRuleLine(rule)}
        </p>
      ))}
    </div>
  );
}

/** The append-only event history of the selected notification. */
function EventHistoryPanel({ detail }: { readonly detail: NotificationDetailVm }) {
  return (
    <div data-testid="notif-history" className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Event history — {detail.summary.id} (append-only)
      </h2>
      {detail.events.map((event) => (
        <p key={event.sequence} data-testid="notif-history-event" className="text-xs text-slate-600">
          {renderEventLine(event)}
        </p>
      ))}
    </div>
  );
}

/**
 * The notification consumer surface. Tenant context explicit (§31); the
 * availability verdict renders as an explicit panel when unavailable; an
 * empty inbox renders as a real state, never an error; the dedup law is
 * stated on the page (same dedup key ⇒ same record); the suppression-rule
 * registry and the selected notification's event history render beneath the
 * inbox.
 */
export function NotificationsSurfaceView({ data }: { readonly data: NotificationsPageData }) {
  return (
    <section className="mx-auto max-w-3xl space-y-4 p-4 text-sm text-slate-800">
      <header className="space-y-1">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notifications</h1>
        <p data-testid="notif-tenant" className="text-xs text-slate-500">
          {renderTenantHeader(data.tenant)}
        </p>
        <p className="text-xs text-slate-500">{DEDUP_LAW_LINE}</p>
      </header>
      {data.availability.kind === 'unavailable' ? (
        <div
          data-testid="notif-unavailable"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"
        >
          notifications are unavailable: {data.availability.reason}
        </div>
      ) : data.inbox.length === 0 ? (
        <div
          data-testid="notif-empty"
          className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500"
        >
          inbox is empty — no notifications for this recipient yet (a real state, not an error)
        </div>
      ) : (
        <div data-testid="notif-inbox" className="space-y-2">
          {data.inbox.map((vm) => (
            <NotificationRow key={vm.id} vm={vm} />
          ))}
        </div>
      )}
      {data.recipientSuppressions.length > 0 ? <SuppressionRulesPanel rules={data.recipientSuppressions} /> : null}
      {data.selected !== null ? <EventHistoryPanel detail={data.selected} /> : null}
    </section>
  );
}
