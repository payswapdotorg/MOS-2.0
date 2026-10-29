/**
 * NEW TASK DRAFT pins (W35 — the substrate's New Task page composer state,
 * emerged as the MOS console's draft surface): the seed defaults, the
 * model/mode transition honesty (a pick resets the reasoning level; a
 * connection-mode switch resets a model the mode does not enable), the
 * time-of-day greeting bands (verbatim), the permission-mode descriptor
 * set (verbatim), the suggested-prompt pool, and the task-title derivation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_NEW_TASK_ATTACHMENT_LIMIT,
  MOS_NEW_TASK_MODES,
  MOS_NEW_TASK_SUGGESTED_PROMPTS,
  initialMosNewTaskDraft,
  mosNewTaskAttachmentFacts,
  mosNewTaskBasenameFromPath,
  mosNewTaskClipboardTextAttachmentFilename,
  mosNewTaskCountClipboardTextLines,
  mosNewTaskDraftWithAttachmentAdded,
  mosNewTaskDraftWithAttachmentRemoved,
  mosNewTaskDraftForConnectionMode,
  mosNewTaskDraftForModel,
  mosNewTaskFormatAttachmentSize,
  mosNewTaskGreeting,
  mosNewTaskInferAttachmentMimeType,
  mosNewTaskIntakeAttachments,
  mosNewTaskMode,
  mosNewTaskShouldCreateClipboardTextAttachment,
  mosNewTaskTitleFromPrompt,
} from '../dist/console/new-task-draft.js';

test('the seed draft is the substrate\'s initializeNewTaskDraft honesty (build mode, plan off, GLM-5.3)', () => {
  const draft = initialMosNewTaskDraft();
  assert.equal(draft.mode, 'build');
  assert.equal(draft.planEnabled, false);
  assert.equal(draft.modelId, 'GLM-5.3');
  assert.equal(draft.connectionMode, 'individual');
  assert.equal(draft.reasoningLevel, 'high');
  assert.equal(draft.missionId, null);
});

test('a model pick resets the reasoning level honestly to the model\'s own specs', () => {
  const draft = initialMosNewTaskDraft();
  // GLM-5.3 → GLM-5.2: 'high' is still listed (disabled/high/max) — kept.
  const to52 = mosNewTaskDraftForModel(draft, 'GLM-5.2');
  assert.equal(to52.modelId, 'GLM-5.2');
  assert.equal(to52.reasoningLevel, 'high');
  // GLM-5.3 → GLM-5.1: only disabled/enabled — 'high' drops to 'enabled'.
  const to51 = mosNewTaskDraftForModel(draft, 'GLM-5.1');
  assert.equal(to51.reasoningLevel, 'enabled');
  // GLM-5.3 → GLM-4.6V: no reasoning control — ''.
  const toVision = mosNewTaskDraftForModel(draft, 'GLM-4.6V');
  assert.equal(toVision.reasoningLevel, '');
  // The mission context and mode survive a model pick.
  assert.equal(toVision.mode, draft.mode);
  assert.equal(toVision.missionId, draft.missionId);
});

test('a connection-mode switch resets a model the new mode does not enable', () => {
  const draft = initialMosNewTaskDraft(); // GLM-5.3 on individual
  // individual → start: GLM-5.3 is NOT on Start Plan → resets to GLM-5.3-Flash.
  const toStart = mosNewTaskDraftForConnectionMode(draft, 'start');
  assert.equal(toStart.connectionMode, 'start');
  assert.equal(toStart.modelId, 'GLM-5.3-Flash');
  assert.equal(toStart.reasoningLevel, 'high'); // Flash shares low/high/max
  // individual → team: GLM-5.3 IS on Team Plan — kept.
  const toTeam = mosNewTaskDraftForConnectionMode(draft, 'team');
  assert.equal(toTeam.modelId, 'GLM-5.3');
  // individual → api: GLM-5.3 kept.
  const toApi = mosNewTaskDraftForConnectionMode(draft, 'api');
  assert.equal(toApi.modelId, 'GLM-5.3');
  // A no-op switch returns the same draft untouched.
  assert.equal(mosNewTaskDraftForConnectionMode(draft, 'individual'), draft);
});

test('the greeting bands are the substrate\'s verbatim time-of-day strings', () => {
  assert.equal(mosNewTaskGreeting(5), 'Morning, ready when you are');
  assert.equal(mosNewTaskGreeting(8), 'Morning, ready when you are');
  assert.equal(mosNewTaskGreeting(9), 'Morning, how can I help?');
  assert.equal(mosNewTaskGreeting(11), 'Morning, how can I help?');
  assert.equal(mosNewTaskGreeting(12), 'Noon break?');
  assert.equal(mosNewTaskGreeting(13), 'Noon break?');
  assert.equal(mosNewTaskGreeting(14), 'Good afternoon! Leave the rest to me.');
  assert.equal(mosNewTaskGreeting(17), 'Good afternoon! Leave the rest to me.');
  assert.equal(mosNewTaskGreeting(18), 'Evening, nice work today');
  assert.equal(mosNewTaskGreeting(22), 'Evening, nice work today');
  assert.equal(mosNewTaskGreeting(23), "It's late—remember to take care of yourself.");
  assert.equal(mosNewTaskGreeting(0), "It's late—remember to take care of yourself.");
  assert.equal(mosNewTaskGreeting(4), "It's late—remember to take care of yourself.");
});

test('the permission mode descriptors are the substrate\'s verbatim labels', () => {
  assert.deepEqual(
    MOS_NEW_TASK_MODES.map((mode) => mode.label),
    ['Ask before changes', 'Edit automatically', 'Full access'],
  );
  assert.equal(MOS_NEW_TASK_MODES[0]?.description, 'Ask before each file changes.');
  assert.equal(MOS_NEW_TASK_MODES[1]?.description, 'Edit selected files or relevant workspace files automatically.');
  assert.equal(MOS_NEW_TASK_MODES[2]?.description, 'Edit and run commands with fewer confirmations.');
  assert.equal(mosNewTaskMode('build')?.label, 'Ask before changes');
  assert.equal(mosNewTaskMode('yolo')?.label, 'Full access');
  assert.equal(mosNewTaskMode('nonsense'), undefined);
});

test('the suggested prompts are the substrate fallback pool + i18n defaults, verbatim', () => {
  assert.ok(MOS_NEW_TASK_SUGGESTED_PROMPTS.length >= 8);
  assert.equal(MOS_NEW_TASK_SUGGESTED_PROMPTS[0]?.label, 'Help me understand and run this repository');
  assert.equal(MOS_NEW_TASK_SUGGESTED_PROMPTS[6]?.label, 'Review commits from the last 7 days');
  assert.equal(MOS_NEW_TASK_SUGGESTED_PROMPTS[7]?.label, 'Create a PDF');
  for (const prompt of MOS_NEW_TASK_SUGGESTED_PROMPTS) {
    assert.equal(prompt.prompt.length > 0, true);
    assert.equal(prompt.label.length > 0, true);
  }
});

test('the task title derives from the prompt\'s first line, collapsed and capped at 64', () => {
  assert.equal(mosNewTaskTitleFromPrompt('Fix the landing page\nand test it'), 'Fix the landing page');
  assert.equal(mosNewTaskTitleFromPrompt('  \n\n  Summarize   the week  \nrest'), 'Summarize the week');
  const long = `${'a'.repeat(80)}`;
  const title = mosNewTaskTitleFromPrompt(long);
  assert.equal(title.length, 64);
  assert.ok(title.endsWith('…'));
  assert.equal(mosNewTaskTitleFromPrompt(''), '');
  assert.equal(mosNewTaskTitleFromPrompt('ab'), 'ab');
});

/* --------------------------------------------------------------------
 * W40 — the composer attachment queue (the substrate's own paste law,
 * verbatim pins)
 * -------------------------------------------------------------------- */

test('the long-paste law is the substrate\'s own threshold, verbatim (15 * 1024 chars)', () => {
  assert.equal(mosNewTaskShouldCreateClipboardTextAttachment('x'.repeat(15 * 1024 - 1)), false);
  assert.equal(mosNewTaskShouldCreateClipboardTextAttachment('x'.repeat(15 * 1024)), true);
  assert.equal(mosNewTaskShouldCreateClipboardTextAttachment('x'.repeat(15 * 1024 + 1)), true);
  assert.equal(mosNewTaskShouldCreateClipboardTextAttachment(''), false);
  assert.equal(MOS_NEW_TASK_ATTACHMENT_LIMIT, 8);
});

test('the paste filename derives the substrate\'s own pasted-text pattern', () => {
  assert.equal(
    mosNewTaskClipboardTextAttachmentFilename(new Date(2026, 9, 29, 8, 42, 15)),
    'pasted-text-20261029-084215.txt',
  );
});

test('the paste line count follows the substrate\'s \n/\r separator law', () => {
  assert.equal(mosNewTaskCountClipboardTextLines(''), 0);
  assert.equal(mosNewTaskCountClipboardTextLines('one line'), 1);
  assert.equal(mosNewTaskCountClipboardTextLines('a\nb\nc'), 3);
  assert.equal(mosNewTaskCountClipboardTextLines('a\rb'), 2);
  assert.equal(mosNewTaskCountClipboardTextLines(Array.from({ length: 4100 }, (_, i) => `line ${i + 1}`).join('\n')), 4100);
});

test('the attachment size formats follow the substrate\'s KB/MB law, verbatim', () => {
  assert.equal(mosNewTaskFormatAttachmentSize(1024), '1 KB');
  assert.equal(mosNewTaskFormatAttachmentSize(302292), '296 KB'); // the W40 evidence's own 4,100-line paste
  assert.equal(mosNewTaskFormatAttachmentSize(1024 * 1024), '1.0 MB');
  assert.equal(mosNewTaskFormatAttachmentSize(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(mosNewTaskFormatAttachmentSize(12.4 * 1024 * 1024), '12 MB');
});

test('the chip facts line renders the locale-grouped counts', () => {
  assert.equal(mosNewTaskAttachmentFacts(294092, 4100), '4,100 lines · 294,092 chars');
});

test('the picked path resolves the substrate\'s basename + MIME inference laws', () => {
  assert.equal(mosNewTaskBasenameFromPath('/home/z/notes/boundary-findings.md'), 'boundary-findings.md');
  assert.equal(mosNewTaskBasenameFromPath('C:\\Users\\z\\report.txt'), 'report.txt');
  assert.equal(mosNewTaskBasenameFromPath('plainname'), 'plainname');
  assert.equal(mosNewTaskInferAttachmentMimeType('a.md'), 'text/markdown');
  assert.equal(mosNewTaskInferAttachmentMimeType('a.TXT'), 'text/plain');
  assert.equal(mosNewTaskInferAttachmentMimeType('a.json'), 'application/json');
  assert.equal(mosNewTaskInferAttachmentMimeType('a.png'), 'image/png');
  assert.equal(mosNewTaskInferAttachmentMimeType('a.pdf'), 'application/pdf');
  assert.equal(mosNewTaskInferAttachmentMimeType('a.weird'), 'application/octet-stream');
});

test('the draft queue transitions are pure (add / remove / intake projection)', () => {
  const draft = initialMosNewTaskDraft();
  assert.deepEqual(draft.attachments, []);
  const pasted = {
    id: 'att-1',
    filename: 'pasted-text-20261029-084215.txt',
    sourceKind: 'clipboard-text' as const,
    mimeType: 'text/plain',
    sizeBytes: 302292,
    charCount: 294092,
    lineCount: 4100,
    localPath: '/root/tmp/paste-attachments/2026-10-29/pasted-text-20261029-084215-420213b1.txt',
  };
  const withOne = mosNewTaskDraftWithAttachmentAdded(draft, pasted);
  assert.equal(withOne.attachments.length, 1);
  assert.equal(withOne.attachments[0]?.id, 'att-1');
  assert.equal(withOne.mode, draft.mode); // the queue never disturbs the rest of the draft
  const removed = mosNewTaskDraftWithAttachmentRemoved(withOne, 'att-1');
  assert.deepEqual(removed.attachments, []);
  const intake = mosNewTaskIntakeAttachments(withOne);
  assert.equal(intake.length, 1);
  assert.equal(intake[0]?.filename, pasted.filename);
  assert.equal('id' in (intake[0] ?? {}), false); // the draft-only id never reaches the intake
});
