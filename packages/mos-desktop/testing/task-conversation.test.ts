import assert from 'node:assert/strict';
import { test } from 'node:test';

// The pure presentation models are consumed through the package's BUILT
// dist (the testing-seam discipline).
import {
  MOS_TASK_ARCHIVED_EMPTY,
  MOS_TASK_CONVERSATION_PLACEHOLDER,
  MOS_TASK_LIST_EMPTY,
  MOS_TASK_UNTITLED_FALLBACK,
  mosTaskConversation,
  mosTaskListSections,
  mosTaskRecordedMarkerLine,
  mosTaskRelativeTime,
  mosTaskTitle,
  mosTaskTurnCount,
} from '../dist/console/task-conversation.js';
import {
  MOS_AUTOMATIONS_CREATE_EXAMPLE_PROMPT,
  MOS_AUTOMATIONS_DESCRIPTION_EMPTY,
  MOS_AUTOMATIONS_DESCRIPTION_POPULATED,
  MOS_AUTOMATIONS_KEEP_AWAKE_LINE,
  MOS_AUTOMATIONS_TAB,
  MOS_AUTOMATIONS_TITLE,
  MOS_AUTOMATION_FILTERS,
  MOS_AUTOMATION_STATUS_WORDS,
  mosAutomationFilterBucket,
  mosAutomationNextRunLabel,
  mosAutomationRunCountLabel,
  mosAutomationScheduleBadge,
  mosAutomationsForFilter,
} from '../dist/console/automation-presentation.js';
import type { MosWorkspaceAutomation, MosWorkspaceTask } from '../dist/console/workspace-records.js';

const NOW = '2026-10-26T12:00:00.000Z';

function task(overrides: Partial<MosWorkspaceTask> = {}): MosWorkspaceTask {
  return {
    id: 'tsk-001',
    seq: 1,
    title: 'Diagnose the failing boundary checks',
    prompt: 'Run the existing checks and diagnose failures',
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    mode: 'build',
    planEnabled: true,
    reasoningLevel: 'high',
    missionId: null,
    status: 'DRAFT',
    createdAt: '2026-10-25T08:15:00.000Z',
    updatedAt: '2026-10-26T10:05:00.000Z',
    pinned: false,
    archived: false,
    followUps: [],
    ...overrides,
  };
}

function automation(overrides: Partial<MosWorkspaceAutomation> = {}): MosWorkspaceAutomation {
  return {
    id: 'atm-001',
    seq: 1,
    title: 'Weekday change summary',
    prompt: MOS_AUTOMATIONS_CREATE_EXAMPLE_PROMPT,
    cronExpr: '0 9 * * 1-5',
    schedule: 'Every weekday at 9:00 AM',
    lifecycleStatus: 'active',
    runCount: 0,
    nextRunAt: '2026-10-27T09:00:00.000Z',
    lastRunAt: null,
    createdAt: '2026-10-25T15:45:00.000Z',
    updatedAt: '2026-10-25T15:45:00.000Z',
    ...overrides,
  };
}

/* ---------------- The task-row relative time vocabulary ---------------- */

test('mosTaskRelativeTime carries the substrate\'s exact vocabulary (now / m / h / d)', () => {
  assert.equal(mosTaskRelativeTime('2026-10-26T11:59:30.000Z', NOW), 'now');
  assert.equal(mosTaskRelativeTime('2026-10-26T11:30:00.000Z', NOW), '30m');
  assert.equal(mosTaskRelativeTime('2026-10-26T07:00:00.000Z', NOW), '5h');
  assert.equal(mosTaskRelativeTime('2026-10-24T12:00:00.000Z', NOW), '2d');
  // A future timestamp clamps to "now" (never a fabricated negative).
  assert.equal(mosTaskRelativeTime('2026-10-26T13:00:00.000Z', NOW), 'now');
  // Unparsable timestamps surface honestly as no label, never a guess.
  assert.equal(mosTaskRelativeTime('not-a-time', NOW), '');
});

test('the task title keeps the substrate\'s "New task" fallback for empty titles', () => {
  assert.equal(mosTaskTitle(task()), 'Diagnose the failing boundary checks');
  assert.equal(mosTaskTitle(task({ title: '   ' })), MOS_TASK_UNTITLED_FALLBACK);
  assert.equal(MOS_TASK_UNTITLED_FALLBACK, 'New task');
  assert.equal(MOS_TASK_LIST_EMPTY, 'No tasks yet');
  assert.equal(MOS_TASK_ARCHIVED_EMPTY, 'No archived tasks');
});

/* ---------------- The task-list section split + ordering ---------------- */

test('mosTaskListSections splits Pinned / active / archived with the Updated sort', () => {
  const pinnedOld = task({ id: 'tsk-a', pinned: true, updatedAt: '2026-10-24T10:00:00.000Z', seq: 5 });
  const pinnedNew = task({ id: 'tsk-b', pinned: true, updatedAt: '2026-10-26T09:00:00.000Z', seq: 6 });
  const activeNew = task({ id: 'tsk-c', updatedAt: '2026-10-26T11:00:00.000Z', seq: 7 });
  const activeOld = task({ id: 'tsk-d', updatedAt: '2026-10-25T09:00:00.000Z', seq: 8 });
  const archived = task({ id: 'tsk-e', archived: true, updatedAt: '2026-10-23T09:00:00.000Z', seq: 9 });
  const sections = mosTaskListSections([activeOld, pinnedOld, archived, activeNew, pinnedNew]);
  assert.deepEqual(sections.pinned.map((entry) => entry.id), ['tsk-b', 'tsk-a']);
  assert.deepEqual(sections.active.map((entry) => entry.id), ['tsk-c', 'tsk-d']);
  assert.deepEqual(sections.archived.map((entry) => entry.id), ['tsk-e']);
});

/* ---------------- The conversation projection ---------------- */

test('mosTaskConversation projects the honest timeline: user turns + the recorded marker, oldest-first', () => {
  const withFollowUp = task({
    followUps: [
      { id: 'tsk-fu-001', prompt: 'Start with the boundary harness.', at: '2026-10-26T10:00:00.000Z' },
      { id: 'tsk-fu-002', prompt: 'Now the second rule.', at: '2026-10-26T10:05:00.000Z' },
    ],
  });
  const rows = mosTaskConversation(withFollowUp);
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['user-input', 'user-input', 'user-input', 'recorded-marker'],
  );
  assert.equal(rows[0]?.kind === 'user-input' ? rows[0].prompt : '', 'Run the existing checks and diagnose failures');
  assert.equal(rows[1]?.kind === 'user-input' ? rows[1].prompt : '', 'Start with the boundary harness.');
  assert.equal(mosTaskTurnCount(withFollowUp), 3);
  // A fresh task: exactly one user turn + the marker.
  assert.deepEqual(
    mosTaskConversation(task()).map((row) => row.kind),
    ['user-input', 'recorded-marker'],
  );
  assert.equal(mosTaskTurnCount(task()), 1);
});

test('the recorded-state marker line is the honest disclosure (never a fabricated assistant response)', () => {
  assert.match(mosTaskRecordedMarkerLine(task()), /^Recorded as a workspace draft — the substrate runs this task when an account is connected\.$/);
  assert.equal(MOS_TASK_CONVERSATION_PLACEHOLDER, 'Ask for follow-up changes');
});

/* ---------------- The automations presentation model ---------------- */

test('the Automations page copy is the substrate\'s verbatim set (one disclosed noun-swap)', () => {
  assert.equal(MOS_AUTOMATIONS_TITLE, 'Automations');
  assert.equal(MOS_AUTOMATIONS_DESCRIPTION_POPULATED, 'Run tasks on a schedule or whenever you need them.');
  assert.equal(MOS_AUTOMATIONS_DESCRIPTION_EMPTY, 'Schedule recurring tasks or queue background work that runs during idle time.');
  assert.equal(MOS_AUTOMATIONS_TAB, 'Scheduled tasks');
  assert.equal(MOS_AUTOMATIONS_KEEP_AWAKE_LINE, 'Keep your computer awake while MOS is running a chat.');
  assert.equal(
    MOS_AUTOMATIONS_CREATE_EXAMPLE_PROMPT,
    'Every weekday at 9 AM, summarize code changes and follow-ups for this project.',
  );
});

test('the automation card labels: the schedule badge, the run count, and the status words', () => {
  assert.equal(
    mosAutomationScheduleBadge(automation(), NOW),
    'Every weekday at 9:00 AM · Next run ' + mosAutomationNextRunLabel('2026-10-27T09:00:00.000Z', NOW),
  );
  assert.equal(mosAutomationScheduleBadge(automation(), NOW), 'Every weekday at 9:00 AM · Next run in 21h');
  // Paused (or no next run): the badge degrades to the schedule alone
  // (the record keeps its nextRunAt — the badge hides it by status).
  assert.equal(mosAutomationScheduleBadge(automation({ lifecycleStatus: 'paused', nextRunAt: null }), NOW), 'Every weekday at 9:00 AM');
  assert.equal(mosAutomationScheduleBadge(automation({ lifecycleStatus: 'paused' }), NOW), 'Every weekday at 9:00 AM');
  assert.equal(mosAutomationRunCountLabel(automation({ runCount: 0 })), 'Ran 0 times');
  assert.equal(mosAutomationRunCountLabel(automation({ runCount: 3 })), 'Ran 3 times');
  assert.equal(MOS_AUTOMATION_STATUS_WORDS.active, 'Active');
  assert.equal(MOS_AUTOMATION_STATUS_WORDS.paused, 'Paused');
  assert.equal(MOS_AUTOMATION_STATUS_WORDS.completed, 'Completed');
  assert.equal(MOS_AUTOMATION_STATUS_WORDS.failed, 'Failure');
});

test('mosAutomationNextRunLabel: relative under a day, absolute local after that', () => {
  assert.equal(mosAutomationNextRunLabel('2026-10-26T12:45:00.000Z', NOW), 'in 45m');
  assert.equal(mosAutomationNextRunLabel('2026-10-27T05:00:00.000Z', NOW), 'in 17h');
  // Over a day away: the absolute datetime form (locale-dependent — pin shape only).
  const absolute = mosAutomationNextRunLabel('2026-10-28T09:00:00.000Z', NOW);
  assert.ok(absolute.includes('Oct'), `the absolute form names the month: ${absolute}`);
  // Unparsable timestamps pass through verbatim, never a fabricated "when".
  assert.equal(mosAutomationNextRunLabel('not-a-time', NOW), 'not-a-time');
});

test('the status-filter vocabulary + buckets follow the substrate law (paused matches only "all")', () => {
  assert.deepEqual(
    MOS_AUTOMATION_FILTERS.map((filter) => filter.label),
    ['All', 'In progress', 'Completed', 'Failed'],
  );
  assert.equal(mosAutomationFilterBucket(automation()), 'in-progress');
  assert.equal(mosAutomationFilterBucket(automation({ lifecycleStatus: 'paused' })), 'paused');
  assert.equal(mosAutomationFilterBucket(automation({ lifecycleStatus: 'completed' })), 'completed');
  assert.equal(mosAutomationFilterBucket(automation({ lifecycleStatus: 'failed' })), 'failed');

  const active = automation({ id: 'atm-a' });
  const paused = automation({ id: 'atm-b', lifecycleStatus: 'paused', nextRunAt: null });
  const list = [active, paused];
  assert.deepEqual(mosAutomationsForFilter(list, 'all').map((entry) => entry.id), ['atm-a', 'atm-b']);
  assert.deepEqual(mosAutomationsForFilter(list, 'in-progress').map((entry) => entry.id), ['atm-a']);
  assert.deepEqual(mosAutomationsForFilter(list, 'completed'), []);
  assert.deepEqual(mosAutomationsForFilter(list, 'failed'), []);
});
