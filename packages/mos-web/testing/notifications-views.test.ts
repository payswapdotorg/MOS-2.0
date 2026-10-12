/*
 * notifications-views.test.ts — the NOTIFY-CS test battery (node:test +
 * assert/strict, the house shape). 49 tests over the view port, the
 * composition double, the render-state machine, and the line renderers:
 * including the reference-subject pin, the suppression-first-class pin, and
 * the transport-label-verbatim pin. The React surface shares these exact
 * renderers, so the pins hold for the DOM too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyNotificationsViewPort,
  createInMemoryNotificationsViewPort,
  createThrowingNotificationsViewPort,
  createUnavailableNotificationsViewPort,
  IN_MEMORY_DEDUP_TWIN_ID,
  IN_MEMORY_DEDUP_TWIN_KEY,
  IN_MEMORY_DELIVERED_EVENTS,
  IN_MEMORY_SELECTED_ID,
  IN_MEMORY_SUBMITTED_RECORDS,
  IN_MEMORY_SUPPRESSED_EVENTS,
  IN_MEMORY_THROWING_MESSAGE,
  IN_MEMORY_T0_MS,
  IN_MEMORY_TRANSPORT_LABEL,
  IN_MEMORY_UNAVAILABLE_REASON,
} from './notifications-composition-double.js';
import { initialNotificationsRenderState, renderNotifications } from '../dist/src/views/notifications/notifications-view.js';
import {
  NOTIFICATION_BADGE_COLORS,
  NOTIFICATION_BADGE_LABELS,
  renderBackoff,
  renderEventLine,
  renderFailure,
  renderLifecycleBadge,
  renderObservability,
  renderRecordHeaderLine,
  renderSubjectRefs,
  renderSuppression,
  renderSuppressionRuleLine,
  renderTimestamp,
} from '../dist/src/views/notifications/notifications-lines.js';
import {
  NOTIFICATION_VIEW_KINDS,
  NOTIFICATION_VIEW_STATUSES,
  NOTIFICATION_VIEW_TERMINAL_STATUSES,
  type NotificationSummaryVm,
  type NotificationsPageData,
} from '../dist/src/ports/notifications-views.js';

/** Load the primary double's page data. */
async function loadPageData(): Promise<NotificationsPageData> {
  return createInMemoryNotificationsViewPort().getNotificationsViewData();
}

/** Load one inbox row by id, failing loudly when absent. */
async function loadVm(id: string): Promise<NotificationSummaryVm> {
  const data = await loadPageData();
  const vm = data.inbox.find((row) => row.id === id);
  assert.ok(vm, `expected an inbox row for ${id}`);
  return vm;
}

/** Render the primary double through the state machine and return the ready lines. */
async function loadReadyLines(): Promise<readonly string[]> {
  const state = await renderNotifications(createInMemoryNotificationsViewPort());
  if (state.state !== 'ready') {
    return assert.fail(`expected the ready state, got: ${JSON.stringify(state)}`);
  }
  return state.lines;
}

test('port: the composition double resolves real-shaped, available view data', async () => {
  const data = await loadPageData();
  assert.equal(data.tenant.tenantId, 'tenant-alpha');
  assert.deepEqual(data.availability, { kind: 'available' });
  assert.equal(data.inbox.length, 6);
});

test('port: getNotificationsViewData is async — a real-port round-trip shape', async () => {
  const pending = createInMemoryNotificationsViewPort().getNotificationsViewData();
  assert.equal(typeof pending.then, 'function');
  const data = await pending;
  assert.ok(data.inbox.length > 0);
});

test('double: the inbox covers every frozen lifecycle status', async () => {
  const data = await loadPageData();
  const present = new Set(data.inbox.map((vm) => vm.status));
  for (const status of NOTIFICATION_VIEW_STATUSES) {
    assert.ok(present.has(status), `expected a ${status} row in the inbox`);
  }
});

test('double: the submitted log holds the dedup twin and the inbox collapses it to one row', async () => {
  assert.equal(IN_MEMORY_SUBMITTED_RECORDS.length, 7);
  const data = await loadPageData();
  assert.equal(data.inbox.length, 6);
  const twins = IN_MEMORY_SUBMITTED_RECORDS.filter((record) => record.id === IN_MEMORY_DEDUP_TWIN_ID);
  assert.equal(twins.length, 2);
  assert.deepEqual(twins[0], twins[1]); // the second submit returned the EXISTING record, unchanged
});

test('port: the frozen status vocabulary is re-declared intact', () => {
  assert.deepEqual([...NOTIFICATION_VIEW_STATUSES], ['queued', 'delivered', 'failed', 'suppressed']);
  assert.deepEqual([...NOTIFICATION_VIEW_TERMINAL_STATUSES], ['delivered', 'failed', 'suppressed']);
});

test('port: the frozen kind vocabulary is re-declared intact', () => {
  assert.deepEqual([...NOTIFICATION_VIEW_KINDS], [
    'mission-event',
    'task-assignment',
    'task-reminder',
    'rights-event',
    'system-alert',
  ]);
});

test('tenant: context is explicit in the page data (§31)', async () => {
  const data = await loadPageData();
  assert.equal(data.tenant.tenantId, 'tenant-alpha');
  assert.equal(data.tenant.tenantDisplayName, 'Alpha Cooperative');
});

test('badge: queued renders the amber queued badge (distinct)', () => {
  assert.equal(renderLifecycleBadge('queued'), 'status=queued badge=QUEUED color=amber');
});

test('badge: delivered renders the emerald delivered badge (distinct)', () => {
  assert.equal(renderLifecycleBadge('delivered'), 'status=delivered badge=DELIVERED color=emerald');
});

test('badge: failed renders the rose failed badge (distinct)', () => {
  assert.equal(renderLifecycleBadge('failed'), 'status=failed badge=FAILED color=rose');
});

test('badge: suppressed renders the zinc suppressed badge (distinct)', () => {
  assert.equal(renderLifecycleBadge('suppressed'), 'status=suppressed badge=SUPPRESSED color=zinc');
});

test('badge: all four lifecycle badges are pairwise distinct', () => {
  const badges = NOTIFICATION_VIEW_STATUSES.map(renderLifecycleBadge);
  assert.equal(new Set(badges).size, 4);
  assert.equal(new Set(Object.values(NOTIFICATION_BADGE_LABELS)).size, 4);
  assert.equal(new Set(Object.values(NOTIFICATION_BADGE_COLORS)).size, 4);
});

test('subject: refs render as references — counts + ids', async () => {
  const vm = await loadVm('n-delivered-1');
  const line = renderSubjectRefs(vm);
  assert.ok(line.includes('subject refs (3)'));
  assert.ok(line.includes('2 artifact(s)'));
  assert.ok(line.includes('0 task(s)'));
  assert.ok(line.includes('1 mission(s)'));
  for (const refId of vm.subjectRefIds) {
    assert.ok(line.includes(refId), `the ref id ${refId} must render`);
  }
});

test('subject: view models carry subjects as REFERENCES only — no content fields', async () => {
  const data = await loadPageData();
  const forbidden = ['message', 'body', 'text', 'content', 'title', 'html'];
  for (const vm of data.inbox) {
    const keys = Object.keys(vm);
    for (const key of forbidden) {
      assert.ok(!keys.includes(key), `view model ${vm.id} must not carry a "${key}" content field`);
    }
  }
});

test('subject: the ref line is exactly the counts+ids projection (no fabricated narrative)', async () => {
  const vm = await loadVm('n-delivered-1');
  assert.equal(
    renderSubjectRefs(vm),
    'subject refs (3): 2 artifact(s), 0 task(s), 1 mission(s) · refs: art-1, art-2, mission-9',
  );
});

test('subject: an empty subject renders zero refs honestly', async () => {
  const vm = await loadVm('n-failed-1');
  assert.equal(
    renderSubjectRefs(vm),
    'subject refs (0): 0 artifact(s), 0 task(s), 0 mission(s) · refs: none',
  );
});

test('§30: the transport label appears VERBATIM in the observability line', async () => {
  const vm = await loadVm('n-delivered-1');
  const line = renderObservability(vm);
  assert.ok(line !== null);
  assert.ok(line.includes(`transport: ${IN_MEMORY_TRANSPORT_LABEL}`));
  assert.ok(line.includes(IN_MEMORY_TRANSPORT_LABEL));
});

test('§30: the observability line carries request id, provider id, duration, actor, warnings', async () => {
  const vm = await loadVm('n-delivered-1');
  const line = renderObservability(vm);
  assert.ok(line !== null);
  assert.ok(line.includes('attempt 1 · provider prov-a · 145ms'));
  assert.ok(line.includes('request req-delivered-1'));
  assert.ok(line.includes('actor mission-system/scheduler'));
  assert.ok(line.includes('warnings 0'));
});

test('§30: never-attempted records expose no observability block', async () => {
  const neverAttempted = await loadVm('n-queued-2');
  assert.equal(neverAttempted.observability, null);
  assert.equal(renderObservability(neverAttempted), null);
  const suppressedEarly = await loadVm('n-suppressed-recipient-1');
  assert.equal(suppressedEarly.observability, null);
  assert.equal(renderObservability(suppressedEarly), null);
});

test('§30: the latest-attempt failure code surfaces when present', async () => {
  const failed = await loadVm('n-failed-1');
  const failedLine = renderObservability(failed);
  assert.ok(failedLine !== null);
  assert.ok(failedLine.includes('failure provider-transport-failed'));
  const queuedGated = await loadVm('n-queued-1');
  const queuedLine = renderObservability(queuedGated);
  assert.ok(queuedLine !== null);
  assert.ok(queuedLine.includes('failure provider-transport-failed'));
});

test('§30: the attempt count leads the observability line', async () => {
  const vm = await loadVm('n-failed-1');
  const line = renderObservability(vm);
  assert.ok(line !== null);
  assert.ok(line.startsWith('attempt 2 · '));
});

test('suppression: record-level renders level, reason, by, timestamp', async () => {
  const vm = await loadVm('n-suppressed-record-1');
  const line = renderSuppression(vm);
  assert.ok(line !== null);
  assert.ok(line.includes('level record'));
  assert.ok(line.includes('reason: duplicate of an earlier system alert within the dedup window'));
  assert.ok(line.includes('by mos-jobs/system'));
  assert.ok(line.includes(`at ${renderTimestamp(IN_MEMORY_T0_MS + 6500)}`));
});

test('suppression: recipient-level renders level, reason, by', async () => {
  const vm = await loadVm('n-suppressed-recipient-1');
  const line = renderSuppression(vm);
  assert.ok(line !== null);
  assert.ok(line.includes('level recipient'));
  assert.ok(line.includes('reason: recipient-requested hold while on leave'));
  assert.ok(line.includes('by user-42'));
});

test('suppression rules: the active rule renders distinctly (state: active)', async () => {
  const data = await loadPageData();
  const rule = data.recipientSuppressions.find((candidate) => candidate.id === 'rs-1');
  assert.ok(rule, 'expected the active rule rs-1');
  const line = renderSuppressionRuleLine(rule);
  assert.ok(line.includes('state: active'));
  assert.equal(line.includes('lifted'), false); // an active rule carries no lifting facts
});

test('suppression rules: the lifted rule renders lifter + timestamp', async () => {
  const data = await loadPageData();
  const rule = data.recipientSuppressions.find((candidate) => candidate.id === 'rs-2');
  assert.ok(rule, 'expected the lifted rule rs-2');
  const line = renderSuppressionRuleLine(rule);
  assert.ok(line.includes('state: lifted'));
  assert.ok(line.includes(`lifted by user-43 at ${renderTimestamp(IN_MEMORY_T0_MS + 180000)}`));
});

test('suppression rules: both rules render in the ready lines', async () => {
  const lines = await loadReadyLines();
  const joined = lines.join('\n');
  assert.ok(joined.includes('rule rs-1 ·'));
  assert.ok(joined.includes('rule rs-2 ·'));
});

test('backoff: queued with a gate renders the not-deliverable-before fact + policy', async () => {
  const vm = await loadVm('n-queued-1');
  const line = renderBackoff(vm);
  assert.ok(line !== null);
  assert.ok(line.includes('retry policy: max 4 attempts'));
  assert.ok(line.includes(`not deliverable before ${renderTimestamp(IN_MEMORY_T0_MS + 60000)}`));
});

test('backoff: queued without a gate renders no backoff line', async () => {
  const vm = await loadVm('n-queued-2');
  assert.equal(vm.nextAttemptAtMs, null);
  assert.equal(renderBackoff(vm), null);
});

test('backoff: non-queued records never render a backoff line', async () => {
  const data = await loadPageData();
  for (const vm of data.inbox) {
    const line = renderBackoff(vm);
    if (vm.status === 'queued' && vm.nextAttemptAtMs !== null) {
      assert.ok(line !== null, `queued ${vm.id} with a gate must render a backoff line`);
    } else {
      assert.equal(line, null, `${vm.id} must not render a backoff line`);
    }
  }
});

test('failure: the latest typed failure renders code + message + retriable', async () => {
  const vm = await loadVm('n-failed-1');
  const line = renderFailure(vm);
  assert.ok(line !== null);
  assert.ok(line.includes('failure: provider-transport-failed'));
  assert.ok(line.includes('provider transport unreachable after 3 attempts'));
  assert.ok(line.includes('retriable: false'));
});

test('failure: no failure line when there is no failure', async () => {
  const delivered = await loadVm('n-delivered-1');
  assert.equal(renderFailure(delivered), null);
  const queued2 = await loadVm('n-queued-2');
  assert.equal(renderFailure(queued2), null);
});

test('history: the failed notification renders its events in sequence order', async () => {
  const data = await loadPageData();
  assert.ok(data.selected, 'the double selects the failed notification');
  assert.deepEqual(data.selected.events.map((event) => event.sequence), [1, 2, 3]);
  const joined = data.selected.events.map(renderEventLine).join('\n');
  assert.ok(joined.includes('#1 enqueued'));
  assert.ok(joined.includes('#2 retry-scheduled'));
  assert.ok(joined.includes('#3 delivery-failed'));
});

test('history: the retry-scheduled event carries failure, next attempt, delay', async () => {
  const data = await loadPageData();
  assert.ok(data.selected);
  const event = data.selected.events.find((candidate) => candidate.type === 'retry-scheduled');
  assert.ok(event, 'expected a retry-scheduled event');
  const line = renderEventLine(event);
  assert.ok(line.includes('failure provider-transport-failed'));
  assert.ok(line.includes('retriable: true'));
  assert.ok(line.includes(`next at ${renderTimestamp(IN_MEMORY_T0_MS + 33300)}`));
  assert.ok(line.includes('delay 30000ms'));
});

test('history: the delivery-failed event carries attempts + retryExhausted', async () => {
  const data = await loadPageData();
  assert.ok(data.selected);
  const event = data.selected.events.find((candidate) => candidate.type === 'delivery-failed');
  assert.ok(event, 'expected a delivery-failed event');
  const line = renderEventLine(event);
  assert.ok(line.includes('attempts 2'));
  assert.ok(line.includes('retryExhausted true'));
  assert.ok(line.includes('retriable: false'));
});

test('history: the delivered history is enqueued → delivered with receipt + ack + transport', () => {
  const joined = IN_MEMORY_DELIVERED_EVENTS.map(renderEventLine).join('\n');
  assert.ok(joined.includes('#1 enqueued'));
  assert.ok(joined.includes('#2 delivered'));
  assert.ok(joined.includes('receipt rcpt-delivered-1'));
  assert.ok(joined.includes('providerAck ack-9'));
  assert.ok(joined.includes(`transport: ${IN_MEMORY_TRANSPORT_LABEL}`));
});

test('history: the suppressed event carries level, reason, by, rule', () => {
  const event = IN_MEMORY_SUPPRESSED_EVENTS.find((candidate) => candidate.type === 'suppressed');
  assert.ok(event, 'expected a suppressed event');
  const line = renderEventLine(event);
  assert.ok(line.includes('level recipient'));
  assert.ok(line.includes('reason: recipient-requested hold while on leave'));
  assert.ok(line.includes('by user-42'));
  assert.ok(line.includes('rule rs-1'));
});

test('history: the selected detail rides the page data', async () => {
  const data = await loadPageData();
  assert.ok(data.selected);
  assert.equal(data.selected.summary.id, IN_MEMORY_SELECTED_ID);
  assert.equal(data.selected.events.length, 3);
});

test('render state: the initial state is loading', () => {
  assert.deepEqual(initialNotificationsRenderState(), { state: 'loading' });
});

test('render state: ready composes the structural lines', async () => {
  const lines = await loadReadyLines();
  assert.ok(lines.length > 10, 'the ready state composes a full structural page');
  assert.ok(lines.every((line) => line.length > 0));
});

test('render state: empty inbox + available ⇒ empty (not an error)', async () => {
  const state = await renderNotifications(createEmptyNotificationsViewPort());
  assert.deepEqual(state, { state: 'empty' });
});

test('render state: unavailable verdict ⇒ explicit unavailable state with reason', async () => {
  const state = await renderNotifications(createUnavailableNotificationsViewPort());
  assert.deepEqual(state, { state: 'unavailable', reason: IN_MEMORY_UNAVAILABLE_REASON });
});

test('render state: throwing port ⇒ error state with the message', async () => {
  const state = await renderNotifications(createThrowingNotificationsViewPort());
  if (state.state !== 'error') {
    return assert.fail(`expected the error state, got: ${JSON.stringify(state)}`);
  }
  assert.equal(state.message, IN_MEMORY_THROWING_MESSAGE);
});

test('render state: ready lines open with the tenant header', async () => {
  const lines = await loadReadyLines();
  assert.equal(lines[0], 'tenant tenant-alpha · Alpha Cooperative');
});

test('render state: ready lines state the dedup law', async () => {
  const lines = await loadReadyLines();
  assert.ok(lines.join('\n').includes('same dedup key ⇒ same record'));
});

test('render state: ready lines carry the inbox row count', async () => {
  const lines = await loadReadyLines();
  assert.ok(lines.includes('inbox rows: 6'));
});

test('dedup: the pair renders as ONE record — the shared key appears exactly once', async () => {
  const lines = await loadReadyLines();
  const joined = lines.join('\n');
  const occurrences = joined.split(IN_MEMORY_DEDUP_TWIN_KEY).length - 1;
  assert.equal(occurrences, 1);
  assert.ok(joined.includes(`dedupKey ${IN_MEMORY_DEDUP_TWIN_KEY}`));
  const submittedTwins = IN_MEMORY_SUBMITTED_RECORDS.filter((record) => record.id === IN_MEMORY_DEDUP_TWIN_ID);
  assert.equal(submittedTwins.length, 2); // two submits, one rendered record
});

test('timestamps: render as stable ISO-8601 (UTC)', () => {
  assert.equal(renderTimestamp(IN_MEMORY_T0_MS), '2025-01-01T00:00:00.000Z');
  assert.equal(renderTimestamp(0), '1970-01-01T00:00:00.000Z');
});

test('header: the record header line carries id, kind, recipient, dedupKey', async () => {
  const vm = await loadVm('n-queued-1');
  const line = renderRecordHeaderLine(vm);
  assert.ok(line.includes('id n-queued-1'));
  assert.ok(line.includes('kind task-reminder'));
  assert.ok(line.includes('recipient user-42'));
  assert.ok(line.includes('dedupKey dedup:task-reminder:user-42:task-77'));
  assert.ok(line.includes('created 2025-01-01T00:00:01.000Z'));
});

test('header: every inbox row exposes a non-empty dedupKey and it renders', async () => {
  const data = await loadPageData();
  const lines = await loadReadyLines();
  const joined = lines.join('\n');
  for (const vm of data.inbox) {
    assert.ok(vm.dedupKey.length > 0, `row ${vm.id} must expose a dedupKey`);
    assert.ok(joined.includes(vm.dedupKey), `the dedupKey of ${vm.id} must render`);
  }
});
