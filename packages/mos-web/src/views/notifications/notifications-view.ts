/*
 * notifications-view.ts — the render-state machine for the notification
 * consumer surface (NOTIFY-CS), following the connections-view.ts house
 * pattern. Pure async projection: port → NotificationsRenderState.
 * No I/O, no DOM, no fabricated content.
 */
import type { NotificationsPageData, NotificationsViewPort } from '../../ports/notifications-views.js';
import {
  renderBackoff,
  renderEventLine,
  renderFailure,
  renderLifecycleBadge,
  renderObservability,
  renderRecordHeaderLine,
  renderSubjectRefs,
  renderSuppression,
  renderSuppressionRuleLine,
  renderTenantHeader,
  renderTimestamp,
} from './notifications-lines.js';

/**
 * The render states of the surface. FIRST-CLASS, per the house pattern:
 * 'loading' is the initial shell state, 'error' carries the failure message,
 * 'empty' is a REAL state (zero notifications while available — never an
 * error), 'unavailable' renders the availability verdict explicitly, and
 * 'ready' carries the structural lines.
 */
export type NotificationsRenderState =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly message: string }
  | { readonly state: 'empty' }
  | { readonly state: 'unavailable'; readonly reason: string }
  | { readonly state: 'ready'; readonly lines: readonly string[] };

/**
 * The initial render state ('loading'). renderNotifications itself never
 * returns 'loading' — the shell starts here before the first port call.
 */
export function initialNotificationsRenderState(): NotificationsRenderState {
  return { state: 'loading' };
}

/**
 * The idempotency statement rendered on the surface: same dedup key ⇒ same
 * record — duplicate submits return the existing record. Shared by the line
 * rendering and the React surface so the wording cannot drift.
 */
export const DEDUP_LAW_LINE =
  'dedup law: same dedup key ⇒ same record — duplicate submits return the existing record (idempotent)';

/**
 * Extract a human-readable message from an unknown thrown value without
 * coercing it (UNKNOWN never coerced): Error.message when it is an Error,
 * String() of the value otherwise.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Render the notification surface through the port. Ordering, disclosed:
 * a port failure ⇒ 'error'; an 'unavailable' verdict ⇒ the explicit
 * 'unavailable' state (the verdict outranks content); an empty inbox while
 * available ⇒ 'empty' (a real state, never an error — an empty inbox with a
 * selected detail is not a meaningful surface state, so empty short-circuits
 * before detail composition); otherwise 'ready' with the structural lines:
 * tenant header (§31), the dedup law, one block per inbox row (lifecycle
 * badge, header, subject refs, §30 observability, suppression, failure,
 * backoff — each clause only when present), the suppression-rule registry,
 * and the selected notification's append-only event history.
 */
export async function renderNotifications(port: NotificationsViewPort): Promise<NotificationsRenderState> {
  let data: NotificationsPageData;
  try {
    data = await port.getNotificationsViewData();
  } catch (err: unknown) {
    return { state: 'error', message: toErrorMessage(err) };
  }
  if (data.availability.kind === 'unavailable') {
    return { state: 'unavailable', reason: data.availability.reason };
  }
  if (data.inbox.length === 0) {
    return { state: 'empty' };
  }
  const lines: string[] = [];
  lines.push(renderTenantHeader(data.tenant));
  lines.push(`generated at ${renderTimestamp(data.generatedAtMs)}`);
  lines.push(DEDUP_LAW_LINE);
  lines.push(`inbox rows: ${data.inbox.length}`);
  for (const vm of data.inbox) {
    lines.push(renderLifecycleBadge(vm.status));
    lines.push(renderRecordHeaderLine(vm));
    lines.push(renderSubjectRefs(vm));
    const observability = renderObservability(vm);
    if (observability !== null) {
      lines.push(observability);
    }
    const suppression = renderSuppression(vm);
    if (suppression !== null) {
      lines.push(suppression);
    }
    const failure = renderFailure(vm);
    if (failure !== null) {
      lines.push(failure);
    }
    const backoff = renderBackoff(vm);
    if (backoff !== null) {
      lines.push(backoff);
    }
  }
  lines.push(`recipient suppression rules: ${data.recipientSuppressions.length}`);
  for (const rule of data.recipientSuppressions) {
    lines.push(renderSuppressionRuleLine(rule));
  }
  if (data.selected !== null) {
    lines.push(
      `selected notification ${data.selected.summary.id} — event history (append-only, ${data.selected.events.length} event(s), sequence order):`,
    );
    for (const event of data.selected.events) {
      lines.push(renderEventLine(event));
    }
  }
  return { state: 'ready', lines };
}
