/**
 * Universal agent composer render tests (the §6 P0 universal-composer wave,
 * UXR-WC) — render-LEVEL only (static render-tree walk, no DOM, no browser
 * claim; the browser evidence is the smoke suites). Covers:
 *
 * - the HOTKEY module: pure matcher table (Ctrl+J everywhere, Cmd+J only on
 *   darwin, repeats/shift/alt refused) + install/dispose over a stub
 *   document (capture-phase keydown, no-op without a document);
 * - the OPEN BRIDGE: subscribe/open/unsubscribe with entry payloads and the
 *   plain-toggle null;
 * - the CATALOG: all 16 declared actions (1 mission + 7 console + 8 lab),
 *   the three picker groups, field names pinned VERBATIM against the shared
 *   form-field constants, and NO Pay entry (no payment authority exists);
 * - the OVERLAY: dock geometry pins (fixed bottom-right, max-h-70vh,
 *   scrollable, role=dialog, autofocus), the context line (route + mission
 *   or "No active mission" + the session-scoped disclosure + the entry
 *   label), and the honest voice-unavailable row (never a fake mic);
 * - the PROGRESSIVE flow for create-mission: one field per step, Next
 *   refused while a required field is blank, "Show all fields" details,
 *   back navigation, and the summary's plain-language block ("No
 *   consequential side effect occurs on this step");
 * - the CONFIRM plan: the declaration the composer builds is EXACTLY the
 *   declaration the existing form parsers build over the same field names
 *   (the parity pin — the composer never invents a parallel vocabulary),
 *   routed through the right shell callback family (the entries' dispatch
 *   harness, mirrored 1:1), with named refusals (no tenant scope, no
 *   parser, incomplete fields);
 * - the RECEIPT card: executed authority echo (ids/versions/lifecycle
 *   verbatim), the authority's rejection VERBATIM, the composer-side
 *   refusal, the honest waiting card, and the "Open in <owning surface>"
 *   links;
 * - the SHELL chrome: the Ask MOS header control (aria-keyshortcuts,
 *   aria-expanded) renders only when the entry provides the composer chrome.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import { MosAppShell } from '../dist/src/index.js';
import type { AppShellView } from '../dist/src/ports/app-shell.js';
import {
  COMPOSER_ACTIONS,
  COMPOSER_ACTIONS_BY_ID,
  COMPOSER_ACTION_CATEGORIES,
} from '../dist/src/shell/composer-actions.js';
import type { ComposerActionId } from '../dist/src/shell/composer-actions.js';
import { openMosComposer, subscribeMosComposerOpen } from '../dist/src/shell/composer-bridge.js';
import type { ComposerActionEntry } from '../dist/src/shell/composer-bridge.js';
import {
  MOS_COMPOSER_HOTKEY,
  composerHotkeyMatches,
  installMosComposerHotkey,
} from '../dist/src/shell/composer-hotkey.js';
import {
  composerConfirmPlan,
  composerReducer,
  initialComposerState,
} from '../dist/src/shell/composer-state.js';
import type { ComposerUiEvent, ComposerUiState } from '../dist/src/shell/composer-state.js';
import { MosComposerOverlay } from '../dist/src/shell/mos-composer.js';
import { CONSOLE_INTENT_FORM_FIELDS } from '../dist/src/views/console-intent-form-data.js';
import { createExperimentDeclarationFromFormData } from '../dist/src/views/console-intent-form-data.js';
import { LAB_INTENT_FORM_FIELDS } from '../dist/src/views/lab-intent-form-data.js';
import { MISSION_INTENT_FORM_FIELDS } from '../dist/src/views/mission-intent-form-data.js';
import { missionIntentDeclarationFromFormData } from '../dist/src/views/mission-intent-form-data.js';
import { elementWithTestId, elementsWithRole, elementsWithTag, renderTreeText } from './render-tree.js';

const SCOPE: TenantScope = { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never };

const KEY_EVENT = (overrides: Partial<Parameters<typeof composerHotkeyMatches>[0]> = {}) => ({
  key: 'j',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// The hotkey module
// ---------------------------------------------------------------------------

test('the composer hotkey matcher: Ctrl+J everywhere, Cmd+J only on darwin, repeats refused', () => {
  assert.equal(MOS_COMPOSER_HOTKEY.key, 'j');
  assert.equal(MOS_COMPOSER_HOTKEY.modifier, 'Control');
  assert.equal(MOS_COMPOSER_HOTKEY.darwinAlternateModifier, 'Meta');

  assert.equal(composerHotkeyMatches(KEY_EVENT(), 'other'), true, 'Ctrl+J fires everywhere');
  assert.equal(composerHotkeyMatches(KEY_EVENT({ key: 'J' }), 'other'), true, 'case-insensitive');
  assert.equal(composerHotkeyMatches(KEY_EVENT(), 'darwin'), true, 'Ctrl+J also on darwin');
  assert.equal(
    composerHotkeyMatches(KEY_EVENT({ ctrlKey: false, metaKey: true }), 'darwin'),
    true,
    'Cmd+J is honored on darwin',
  );
  assert.equal(
    composerHotkeyMatches(KEY_EVENT({ ctrlKey: false, metaKey: true }), 'other'),
    false,
    'Cmd+J is refused off darwin',
  );
  assert.equal(composerHotkeyMatches(KEY_EVENT({ repeat: true }), 'other'), false, 'repeats are ignored');
  assert.equal(composerHotkeyMatches(KEY_EVENT({ shiftKey: true }), 'other'), false, 'Shift combos refused');
  assert.equal(composerHotkeyMatches(KEY_EVENT({ altKey: true }), 'other'), false, 'Alt combos refused');
  assert.equal(composerHotkeyMatches(KEY_EVENT({ key: 'k' }), 'other'), false, 'other keys refused');
  assert.equal(
    composerHotkeyMatches(KEY_EVENT({ ctrlKey: false }), 'other'),
    false,
    'bare J refused',
  );
});

test('installMosComposerHotkey installs one capture-phase listener and disposes idempotently', () => {
  const realDocument = globalThis.document;
  const listeners: { type: string; handler: (event: unknown) => void; capture: boolean }[] = [];
  const removals: { type: string; capture: boolean }[] = [];
  const fakeDocument = {
    addEventListener(type: string, handler: (event: unknown) => void, capture: boolean): void {
      listeners.push({ type, handler, capture });
    },
    removeEventListener(type: string, _handler: unknown, capture: boolean): void {
      // Real DOM semantics: removing an unregistered listener is a no-op —
      // the fake only records EFFECTIVE removals.
      const index = listeners.findIndex(
        (entry) => entry.type === type && entry.capture === capture,
      );
      if (index !== -1) {
        listeners.splice(index, 1);
        removals.push({ type, capture });
      }
    },
  };
  (globalThis as { document: unknown }).document = fakeDocument;

  let toggles = 0;
  const dispose = installMosComposerHotkey(() => {
    toggles += 1;
  });
  try {
    assert.equal(listeners.length, 1, 'exactly one listener installs');
    assert.equal(listeners[0]?.type, 'keydown');
    assert.equal(listeners[0]?.capture, true, 'capture phase — before route key handling');

    let prevented = 0;
    listeners[0]?.handler({
      key: 'j',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: false,
      preventDefault: (): void => {
        prevented += 1;
      },
    });
    assert.equal(toggles, 1, 'the toggle fired');
    assert.equal(prevented, 1, 'the combination is default-prevented');

    listeners[0]?.handler({
      key: 'j',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: true,
      preventDefault: (): void => undefined,
    });
    assert.equal(toggles, 1, 'a repeat does not strobe the overlay');

    dispose();
    assert.equal(listeners.length, 0, 'dispose removes the capture listener');
    assert.deepEqual(
      removals.map((entry) => ({ type: entry.type, capture: entry.capture })),
      [{ type: 'keydown', capture: true }],
      'one effective removal is recorded',
    );
    dispose();
    assert.equal(removals.length, 1, 'dispose is idempotent (second removal is a no-op)');
  } finally {
    (globalThis as { document: unknown }).document = realDocument;
  }
});

test('installMosComposerHotkey without a document is a no-op with a symmetric disposer', () => {
  const realDocument = globalThis.document;
  (globalThis as { document: unknown }).document = undefined;
  try {
    const dispose = installMosComposerHotkey(() => {
      assert.fail('no toggle may fire without a document');
    });
    assert.equal(typeof dispose, 'function');
    dispose();
  } finally {
    (globalThis as { document: unknown }).document = realDocument;
  }
});

// ---------------------------------------------------------------------------
// The open bridge
// ---------------------------------------------------------------------------

test('the open bridge delivers entries to every subscriber and unsubscribes cleanly', () => {
  const seen: (ComposerActionEntry | null)[] = [];
  const seenTwo: (ComposerActionEntry | null)[] = [];
  const disposeOne = subscribeMosComposerOpen((entry) => {
    seen.push(entry);
  });
  const disposeTwo = subscribeMosComposerOpen((entry) => {
    seenTwo.push(entry);
  });

  const entry: ComposerActionEntry = { actionId: 'create-mission', contextLabel: 'Missions surface' };
  openMosComposer(entry);
  openMosComposer();

  assert.deepEqual(seen, [entry, null], 'the entry and the plain toggle both arrive');
  assert.deepEqual(seenTwo, [entry, null], 'every subscriber hears the open event');

  disposeOne();
  openMosComposer({ actionId: 'simulate-step' });
  assert.equal(seen.length, 2, 'the disposed subscriber hears nothing more');
  assert.equal(seenTwo.length, 3, 'the remaining subscriber still hears it');
  disposeTwo();
  openMosComposer();
  assert.equal(seenTwo.length, 3, 'all subscribers are gone');
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test('the catalog carries all 16 declared actions across the three groups — and NO Pay entry', () => {
  assert.equal(COMPOSER_ACTIONS.length, 16);
  assert.deepEqual(COMPOSER_ACTION_CATEGORIES, ['Mission', 'Console', 'Research Lab']);
  assert.deepEqual(
    COMPOSER_ACTIONS.filter((action) => action.category === 'Mission').map((action) => action.actionId),
    ['create-mission'],
  );
  assert.deepEqual(
    COMPOSER_ACTIONS.filter((action) => action.category === 'Console').map((action) => action.actionId),
    [
      'create-experiment',
      'grant-analysis-rights',
      'record-intelligence',
      'compose-plan',
      'compile-strategy',
      'create-run',
      'arm-run',
    ],
  );
  assert.deepEqual(
    COMPOSER_ACTIONS.filter((action) => action.category === 'Research Lab').map((action) => action.actionId),
    [
      'ingest-reference-document',
      'snapshot-corpus-version',
      'register-world-model',
      'simulate-step',
      'search-organizations',
      'learn-strategy',
      'run-benchmark',
      'record-calibration-error',
    ],
  );
  // The Pay boundary: no payment authority exists in MOS-2.0 — the composer
  // clarifies intents only; nothing is invented.
  assert.equal(
    COMPOSER_ACTIONS.some((action) => action.actionId.toLowerCase().includes('pay')),
    false,
    'no Pay action exists in the catalog',
  );
  assert.equal(
    COMPOSER_ACTIONS.every((action) => action.routedTo.length > 0 && action.oneLinePurpose.length > 0),
    true,
    'every action names its authority and purpose',
  );
});

test('the catalog field names are VERBATIM the existing intent forms\' shared constants (no parallel vocabulary)', () => {
  const F = CONSOLE_INTENT_FORM_FIELDS;
  const L = LAB_INTENT_FORM_FIELDS;
  const M = MISSION_INTENT_FORM_FIELDS;
  const fieldNames = (actionId: ComposerActionId): readonly string[] =>
    COMPOSER_ACTIONS_BY_ID[actionId].fields.map((field) => field.name);

  assert.deepEqual(fieldNames('create-mission'), [
    M.objectiveStatement,
    M.termMetric,
    M.termDirection,
    M.termWeight,
    M.termDefinition,
  ]);
  assert.deepEqual(fieldNames('create-experiment'), [
    F.experimentId,
    F.questionText,
    F.successCriterionText,
    F.hypothesisJson,
    F.missionRefsText,
  ]);
  assert.deepEqual(fieldNames('arm-run'), [F.runId, F.principalText]);
  assert.deepEqual(fieldNames('ingest-reference-document'), [
    L.documentId,
    L.niche,
    L.platform,
    L.modality,
    L.artifactId,
    L.sourceRefsText,
    L.acquiredAt,
    L.rightsRef,
    L.provenanceRef,
  ]);
  assert.deepEqual(fieldNames('snapshot-corpus-version'), [L.documentRefsText]);
  assert.deepEqual(fieldNames('record-calibration-error'), [
    L.calibrationId,
    L.predictionJson,
    L.observationRefsJson,
    L.rewardSpecJson,
    L.functionalJson,
    L.noteText,
  ]);
  // Every console/lab action carries the EXISTING parser (mission parses at
  // the plan step through the mission form parser).
  for (const action of COMPOSER_ACTIONS) {
    if (action.declareRoute === 'mission') {
      continue;
    }
    assert.equal(typeof action.parse, 'function', `${action.actionId} reuses the existing parser`);
  }
});

// ---------------------------------------------------------------------------
// The overlay chrome
// ---------------------------------------------------------------------------

const overlayAt = (state: ComposerUiState): ReturnType<typeof MosComposerOverlay> => (
  <MosComposerOverlay
    state={state}
    routeLabel="Missions"
    activeMissionTitle="Grow qualified reach of the developer audience"
    onEvent={(): void => undefined}
  />
);

test('the closed composer renders nothing; the open composer is the docked Ask MOS dialog', () => {
  const closedTree = overlayAt(initialComposerState());
  assert.equal(renderTreeText(closedTree), '', 'closed renders nothing — no element at all');
  assert.equal(
    elementWithTestId(closedTree, 'mos-composer-overlay'),
    null,
    'nothing obscures the route surface while closed',
  );

  const state = composerReducer(initialComposerState(), { kind: 'toggle' });
  const tree = overlayAt(state);
  const dialog = elementsWithRole(tree, 'dialog')[0];
  assert.ok(dialog, 'the overlay is a dialog');
  assert.equal(dialog.props['aria-label'], 'Ask MOS');
  assert.equal(dialog.props.autoFocus, true, 'focus moves into the dock on open');
  const className = String(dialog.props.className ?? '');
  for (const pin of ['fixed', 'bottom-4', 'right-4', 'max-h-[70vh]', 'overflow-y-auto']) {
    assert.equal(className.includes(pin), true, `the dock keeps its geometry pin: ${pin}`);
  }
});

test('the context line carries the route, the mission (or its absence), the session disclosure and the entry label', () => {
  const opened = composerReducer(initialComposerState(), {
    kind: 'open',
    entry: { actionId: 'create-mission', contextLabel: 'Missions surface' },
  });
  const tree = overlayAt(opened);
  const context = elementWithTestId(tree, 'composer-context-line');
  assert.ok(context);
  const text = renderTreeText(context);
  assert.equal(text.includes('Missions'), true, 'the current route label renders');
  assert.equal(
    text.includes('Grow qualified reach of the developer audience'),
    true,
    'the active mission title renders',
  );
  assert.equal(
    text.includes('Session-scoped workspace state'),
    true,
    'the honest session-scoped disclosure renders',
  );
  assert.equal(elementWithTestId(tree, 'composer-context-entry-label') !== null, true, 'the entry label renders');

  const noMissionTree = (
    <MosComposerOverlay
      state={opened}
      routeLabel="Home"
      activeMissionTitle={null}
      onEvent={(): void => undefined}
    />
  );
  assert.equal(
    renderTreeText(elementWithTestId(noMissionTree, 'composer-context-line')).includes('No active mission'),
    true,
    'the absence of a mission is stated, never guessed',
  );
});

test('STEP 1 renders the grouped catalog with every declared action', () => {
  const state = composerReducer(initialComposerState(), { kind: 'toggle' });
  const tree = overlayAt(state);
  assert.ok(elementWithTestId(tree, 'composer-action-picker'), 'the picker renders');
  for (const category of COMPOSER_ACTION_CATEGORIES) {
    assert.ok(
      elementWithTestId(tree, `composer-category-${category}`),
      `the ${category} group renders`,
    );
  }
  for (const action of COMPOSER_ACTIONS) {
    const button = elementWithTestId(tree, `composer-action-${action.actionId}`);
    assert.ok(button, `${action.actionId} renders as a picker entry`);
    const text = renderTreeText(button);
    assert.equal(text.includes(action.label), true);
    assert.equal(text.includes(action.routedTo), true, 'the authority id is shown');
  }
  const pickerText = renderTreeText(elementWithTestId(tree, 'composer-action-picker'));
  assert.equal(
    pickerText.includes('No Pay action exists'),
    true,
    'the picker discloses the Pay absence honestly',
  );
});

test('the voice row is honest-unavailable — never a fake mic control', () => {
  const state = composerReducer(initialComposerState(), {
    kind: 'open',
    entry: { actionId: 'snapshot-corpus-version', contextLabel: 'Research Lab · corpus' },
  });
  const tree = overlayAt(state);
  const voice = elementWithTestId(tree, 'composer-voice-unavailable');
  assert.ok(voice, 'the voice-unavailable row renders');
  const text = renderTreeText(voice);
  assert.equal(text.includes('Voice input — not available in this build'), true);
  assert.equal(text.includes('text is fully supported'), true);
  for (const button of elementsWithTag(tree, 'button')) {
    const label = String(
      button.props['aria-label'] ?? renderTreeText(button),
    ).toLowerCase();
    assert.equal(label.includes('microphone'), false, 'no microphone control is rendered');
    assert.equal(label.includes('start voice'), false, 'no voice start control is rendered');
  }
});

// ---------------------------------------------------------------------------
// The progressive clarification flow (create-mission)
// ---------------------------------------------------------------------------

const CREATE_MISSION_VALUES: Readonly<Record<string, string>> = {
  'objective-statement': 'Grow qualified reach of the developer audience in Q3.',
  'term-metric': 'qualified-reach',
  'term-direction': 'maximize',
  'term-weight': '1',
  'term-definition': 'Reach among ICP accounts.',
};

function openCreateMission(): ComposerUiState {
  return composerReducer(initialComposerState(), {
    kind: 'open',
    entry: { actionId: 'create-mission', contextLabel: 'Missions surface' },
  });
}

test('STEP 2 clarifies ONE field at a time; Next refuses blank required fields; back returns to the picker', () => {
  let state = openCreateMission();
  assert.equal(state.open, true);
  assert.equal(state.actionId, 'create-mission');
  assert.deepEqual(state.phase, { kind: 'clarify', stepIndex: 0 });
  assert.deepEqual(
    state.values,
    {
      'objective-statement': '',
      'term-metric': '',
      'term-direction': 'maximize',
      'term-weight': '1',
      'term-definition': '',
    },
    'the catalog\'s declared defaults seed the values — never more',
  );

  // The step renders its heading with progress + the Show-all alternative.
  let tree = overlayAt(state);
  const clarify = elementWithTestId(tree, 'composer-clarify');
  assert.ok(clarify);
  assert.equal(
    renderTreeText(clarify).includes('field 1 of 5'),
    true,
    'the first of five fields renders',
  );
  assert.ok(elementWithTestId(tree, 'composer-show-all-fields'), 'the compact alternative renders');
  assert.ok(
    elementWithTestId(tree, 'composer-field-objective-statement'),
    'the current field control renders',
  );

  // A required blank field refuses to advance (defense in depth).
  assert.deepEqual(
    composerReducer(state, { kind: 'advance' }).phase,
    { kind: 'clarify', stepIndex: 0 },
    'advance is refused while the required field is blank',
  );
  const nextDisabled = elementWithTestId(tree, 'composer-clarify-next')?.props.disabled;
  assert.equal(nextDisabled, true, 'the Next control is disabled while blank');

  // Fill and advance, one field at a time.
  const fields = COMPOSER_ACTIONS_BY_ID['create-mission'].fields;
  for (let index = 0; index < fields.length; index += 1) {
    state = composerReducer(state, {
      kind: 'field-change',
      name: fields[index]?.name ?? '',
      value: CREATE_MISSION_VALUES[fields[index]?.name ?? ''] ?? '',
    });
    state = composerReducer(state, { kind: 'advance' });
    if (index < fields.length - 1) {
      assert.deepEqual(
        state.phase,
        { kind: 'clarify', stepIndex: index + 1 },
        `advance moves to field ${index + 2}`,
      );
    }
  }
  assert.deepEqual(state.phase, { kind: 'summary' }, 'the last advance lands on the summary');

  // Back from the summary returns to the LAST field; back from the first
  // field returns to the picker with the action cleared.
  state = composerReducer(state, { kind: 'back' });
  assert.deepEqual(state.phase, { kind: 'clarify', stepIndex: 4 });
  state = composerReducer(state, { kind: 'back' });
  state = composerReducer(state, { kind: 'back' });
  state = composerReducer(state, { kind: 'back' });
  state = composerReducer(state, { kind: 'back' });
  assert.deepEqual(state.phase, { kind: 'clarify', stepIndex: 0 });
  state = composerReducer(state, { kind: 'back' });
  assert.deepEqual(state.phase, { kind: 'pick' });
  assert.equal(state.actionId, null);
  assert.deepEqual(state.values, {});
});

// ---------------------------------------------------------------------------
// STEP 3 — the summary and the confirm plan
// ---------------------------------------------------------------------------

function createMissionAtSummary(): ComposerUiState {
  let state = openCreateMission();
  const fields = COMPOSER_ACTIONS_BY_ID['create-mission'].fields;
  for (const field of fields) {
    state = composerReducer(state, {
      kind: 'field-change',
      name: field.name,
      value: CREATE_MISSION_VALUES[field.name] ?? '',
    });
  }
  for (let index = 0; index < fields.length; index += 1) {
    state = composerReducer(state, { kind: 'advance' });
  }
  return state;
}

test('STEP 3 summarizes the structured intent in plain language with the no-side-effect line', () => {
  const state = createMissionAtSummary();
  const tree = overlayAt(state);
  const summary = elementWithTestId(tree, 'composer-summary');
  assert.ok(summary, 'the summary renders');
  const text = renderTreeText(summary);
  assert.equal(text.includes('Create a mission'), true, 'the action is named');
  assert.equal(
    text.includes('Missions authority validates, creates and versions the mission'),
    true,
    'the one-line purpose renders',
  );
  for (const value of Object.values(CREATE_MISSION_VALUES)) {
    assert.equal(text.includes(value), true, `the declared value ${value} echoes verbatim`);
  }
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'composer-no-side-effect')),
    'No consequential side effect occurs on this step.',
    'the target SVG\'s no-side-effect line renders',
  );
  assert.equal(
    text.includes('missions-authority'),
    true,
    'the authority the declaration routes to is named',
  );
  assert.ok(elementWithTestId(tree, 'composer-confirm'), 'the Declare intent control renders');
  assert.ok(elementWithTestId(tree, 'composer-summary-back'), 'the back control renders');
  // Required fields carry their marking in the structured summary.
  assert.equal(text.includes('(required)'), true);
});

/**
 * The entries' confirm dispatch, mirrored 1:1 from src/main.jsx (the .jsx
 * entries are outside the scanned test program; the pure pieces pin here):
 * fold the plan's followUp, then route the declaration through the shell
 * callback family the plan names.
 */
function entryConfirmDispatch(
  state: ComposerUiState,
  scope: TenantScope | null,
  callbacks: {
    readonly onMission: (declaration: unknown) => unknown;
    readonly onConsole: (declaration: unknown) => unknown;
    readonly onLab: (declaration: unknown) => unknown;
  },
): { readonly after: ComposerUiState; readonly called: 'mission' | 'console' | 'lab' | null } {
  const plan = composerConfirmPlan(state, scope);
  const after = composerReducer(state, plan.followUp);
  if (plan.declaration === null || plan.declareRoute === null) {
    return { after, called: null };
  }
  const declare =
    plan.declareRoute === 'mission'
      ? callbacks.onMission
      : plan.declareRoute === 'console'
        ? callbacks.onConsole
        : callbacks.onLab;
  declare(plan.declaration);
  return { after, called: plan.declareRoute };
}

test('confirm builds EXACTLY the declaration the existing create-mission form parser builds, through the mission callback', () => {
  const state = createMissionAtSummary();

  // The parity reference: the Missions form submits these same field names.
  const form = new FormData();
  form.set('objective-statement', CREATE_MISSION_VALUES['objective-statement'] ?? '');
  form.set('term-metric', CREATE_MISSION_VALUES['term-metric'] ?? '');
  form.set('term-direction', CREATE_MISSION_VALUES['term-direction'] ?? '');
  form.set('term-weight', CREATE_MISSION_VALUES['term-weight'] ?? '');
  form.set('term-definition', CREATE_MISSION_VALUES['term-definition'] ?? '');
  const expected = missionIntentDeclarationFromFormData(form, SCOPE);
  assert.ok(!('error' in expected), 'the reference form parses');

  const received: unknown[] = [];
  const { after, called } = entryConfirmDispatch(state, SCOPE, {
    onMission: (declaration): void => {
      received.push(declaration);
    },
    onConsole: (): void => assert.fail('the mission declaration never routes to the console callback'),
    onLab: (): void => assert.fail('the mission declaration never routes to the lab callback'),
  });

  assert.equal(called, 'mission');
  assert.deepEqual(after.phase, { kind: 'waiting' }, 'the composer waits for the authority verdict');
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], expected, 'the composer declaration is the form declaration, 1:1');
});

test('confirm for a console action routes the console callback with the parser\'s declaration shape', () => {
  let state = composerReducer(initialComposerState(), {
    kind: 'open',
    entry: { actionId: 'create-experiment', contextLabel: 'Agent Console · research' },
  });
  const F = CONSOLE_INTENT_FORM_FIELDS;
  const values: Readonly<Record<string, string>> = {
    [F.experimentId]: 'exp-ghana-001',
    [F.questionText]: 'Which platform wins the launch cohort?',
    [F.successCriterionText]: 'Qualified reach > baseline.',
    [F.hypothesisJson]: '{"prior":"reach-led"}',
    [F.missionRefsText]: 'mission_demo_1',
  };
  for (const field of COMPOSER_ACTIONS_BY_ID['create-experiment'].fields) {
    state = composerReducer(state, {
      kind: 'field-change',
      name: field.name,
      value: values[field.name] ?? '',
    });
    state = composerReducer(state, { kind: 'advance' });
  }
  assert.deepEqual(state.phase, { kind: 'summary' });

  const form = new FormData();
  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  const expected = createExperimentDeclarationFromFormData(form);
  assert.ok(expected.ok, 'the reference form parses');

  const received: unknown[] = [];
  const { called } = entryConfirmDispatch(state, null, {
    onMission: (): void => assert.fail('a console declaration never routes to the mission callback'),
    onConsole: (declaration): void => {
      received.push(declaration);
    },
    onLab: (): void => assert.fail('a console declaration never routes to the lab callback'),
  });
  assert.equal(called, 'console');
  assert.deepEqual(received[0], expected.declaration, 'the console declaration is the form declaration, 1:1');
});

test('confirm refuses by name: no tenant scope for mission, no action, incomplete fields', () => {
  // No tenant scope: the mission declaration needs one — a named refusal,
  // never a guessed scope.
  const missionState = createMissionAtSummary();
  const refusedScope = composerConfirmPlan(missionState, null);
  assert.equal(refusedScope.declaration, null);
  assert.equal(refusedScope.declareRoute, null);
  assert.deepEqual(refusedScope.followUp, {
    kind: 'refused',
    code: 'composer-no-tenant-context',
    message:
      'no tenant context is resolved — the create-mission declaration needs one; the shell refuses to guess',
  });

  // No action selected: nothing to declare.
  const pickState = composerReducer(initialComposerState(), { kind: 'toggle' });
  const refusedNoAction = composerConfirmPlan(pickState, SCOPE);
  assert.equal(refusedNoAction.followUp.kind, 'refused');
  if (refusedNoAction.followUp.kind === 'refused') {
    assert.equal(refusedNoAction.followUp.code, 'composer-no-action');
  }

  // Incomplete required fields: the parser refuses, the composer relays the
  // parser's own code — never a defaulted declaration.
  let blankState = openCreateMission();
  blankState = composerReducer(blankState, {
    kind: 'field-change',
    name: 'objective-statement',
    value: 'Declare a mission without its reward terms.',
  });
  const blankPlan = composerConfirmPlan(blankState, SCOPE);
  assert.equal(blankPlan.declaration, null);
  assert.equal(blankPlan.followUp.kind, 'refused');
  if (blankPlan.followUp.kind === 'refused') {
    assert.equal(blankPlan.followUp.code, 'reward-terms-missing');
  }
});

// ---------------------------------------------------------------------------
// The waiting card + the receipt card
// ---------------------------------------------------------------------------

test('the waiting card names what it waits on and links the owning surface', () => {
  const state = composerReducer(createMissionAtSummary(), { kind: 'declared' });
  const tree = overlayAt(state);
  const waiting = elementWithTestId(tree, 'composer-waiting');
  assert.ok(waiting);
  assert.equal(waiting.props.role, 'status');
  const text = renderTreeText(waiting);
  assert.equal(text.includes('missions-authority'), true, 'the authority is named');
  assert.equal(text.includes('awaiting the authority'), true, 'the wait is stated as a wait');
  assert.equal(text.includes('Nothing is retried and nothing is fabricated'), true);
  const surface = elementWithTestId(tree, 'composer-open-surface');
  assert.equal(surface?.type, 'a');
  assert.equal(surface?.props.href, '/missions');
  assert.equal(renderTreeText(surface).includes('Open in Missions'), true);
});

const CONSOLE_EXECUTED_RECORD = {
  intentId: 'console-intent-7',
  action: 'create-experiment',
  declaredAt: '2026-10-23T10:00:00.000Z',
  routedTo: 'experiments-authority',
  outcome: {
    intentId: 'console-intent-7',
    action: 'create-experiment',
    declaredAt: '2026-10-23T10:00:00.000Z',
    routedTo: 'experiments-authority',
    authorityEcho: {
      recordId: 'exp-ghana-001',
      recordVersion: 1,
      lifecycleState: null,
      summary: 'Experiment exp-ghana-001 registered at version 1.',
    },
  },
} as const;

const CONSOLE_REJECTED_RECORD = {
  intentId: 'console-intent-9',
  action: 'record-intelligence',
  declaredAt: '2026-10-23T11:00:00.000Z',
  routedTo: 'product-intelligence-authority',
  outcome: {
    intentId: 'console-intent-9',
    action: 'record-intelligence',
    declaredAt: '2026-10-23T11:00:00.000Z',
    routedTo: 'product-intelligence-authority',
    error: 'no-explicit-grant',
    message: 'No rights grant covers the analyze action for this scope — recording denied.',
  },
} as const;

test('the receipt card renders the EXECUTED authority echo verbatim with the owning-surface link', () => {
  let state = composerReducer(initialComposerState(), {
    kind: 'open',
    entry: { actionId: 'create-experiment', contextLabel: 'Agent Console · research' },
  });
  state = composerReducer(state, {
    kind: 'outcome',
    outcome: { kind: 'console', record: CONSOLE_EXECUTED_RECORD },
  });
  const tree = overlayAt(state);
  const executed = elementWithTestId(tree, 'composer-receipt-executed');
  assert.ok(executed, 'the executed verdict renders');
  const text = renderTreeText(executed);
  assert.equal(text.includes('experiments-authority'), true);
  assert.equal(text.includes('console-intent-7'), true, 'the intent id echoes');
  assert.equal(text.includes('exp-ghana-001'), true, 'the record id echoes');
  assert.equal(text.includes('1'), true, 'the record version echoes');
  assert.equal(
    text.includes('Experiment exp-ghana-001 registered at version 1.'),
    true,
    'the authority summary echoes verbatim',
  );
  const surface = elementWithTestId(tree, 'composer-open-surface');
  assert.equal(surface?.props.href, '/console?mode=research');
  assert.equal(renderTreeText(surface).includes('Open in Agent Console'), true);
  assert.ok(elementWithTestId(tree, 'composer-restart'), 'the restart control renders');
  assert.ok(elementWithTestId(tree, 'composer-result-close'), 'the close control renders');
});

test('the receipt card renders the authority\'s rejection VERBATIM — never paraphrased into success', () => {
  let state = composerReducer(initialComposerState(), {
    kind: 'open',
    entry: { actionId: 'record-intelligence', contextLabel: 'Agent Console · research' },
  });
  state = composerReducer(state, {
    kind: 'outcome',
    outcome: { kind: 'console', record: CONSOLE_REJECTED_RECORD },
  });
  const tree = overlayAt(state);
  const rejected = elementWithTestId(tree, 'composer-receipt-rejected');
  assert.ok(rejected, 'the rejected verdict renders');
  const text = renderTreeText(rejected);
  assert.equal(text.includes('no-explicit-grant'), true, 'the failure code renders');
  assert.equal(
    text.includes('No rights grant covers the analyze action for this scope — recording denied.'),
    true,
    'the failure message renders verbatim',
  );
  assert.equal(elementWithTestId(tree, 'composer-receipt-executed'), null, 'no executed verdict renders');
});

test('the receipt card renders a mission receipt and the composer-side refusal distinctly', () => {
  const missionState = composerReducer(createMissionAtSummary(), {
    kind: 'outcome',
    outcome: {
      kind: 'mission',
      outcome: {
        kind: 'receipt',
        receipt: {
          intentId: 'mission-intent-3',
          declaredAt: '2026-10-23T09:00:00.000Z',
          routedTo: 'missions-authority',
          note: 'The missions authority will validate and create the mission when the intent executes.',
        },
      },
    },
  });
  const missionTree = overlayAt(missionState);
  const executed = elementWithTestId(missionTree, 'composer-receipt-executed');
  assert.ok(executed);
  const text = renderTreeText(executed);
  assert.equal(text.includes('mission-intent-3'), true);
  assert.equal(text.includes('2026-10-23T09:00:00.000Z'), true);
  assert.equal(
    elementWithTestId(missionTree, 'composer-open-surface')?.props.href,
    '/missions',
    'the mission receipt links the Missions surface',
  );

  const refusedState = composerReducer(createMissionAtSummary(), {
    kind: 'refused',
    code: 'composer-no-tenant-context',
    message: 'no tenant context is resolved — the create-mission declaration needs one; the shell refuses to guess',
  });
  const refusedTree = overlayAt(refusedState);
  const refused = elementWithTestId(refusedTree, 'composer-receipt-refused');
  assert.ok(refused, 'the composer-side refusal renders distinctly');
  assert.equal(renderTreeText(refused).includes('was not sent'), true);
  assert.equal(renderTreeText(refused).includes('composer-no-tenant-context'), true);
});

// ---------------------------------------------------------------------------
// Escape + the shell chrome integration
// ---------------------------------------------------------------------------

test('Escape on the dialog closes the overlay through the dismiss event', () => {
  const events: ComposerUiEvent[] = [];
  const state = openCreateMission();
  const tree = (
    <MosComposerOverlay
      state={state}
      routeLabel="Missions"
      activeMissionTitle={null}
      onEvent={(event): void => {
        events.push(event);
      }}
    />
  );
  const dialog = elementsWithRole(tree, 'dialog')[0];
  assert.ok(dialog);
  const onKeyDown = dialog.props.onKeyDown as (event: { readonly key: string }) => void;
  onKeyDown({ key: 'Escape' });
  assert.deepEqual(events, [{ kind: 'dismiss' }], 'Escape emits exactly one dismiss');
  const closed = composerReducer(state, events[0] as ComposerUiEvent);
  assert.equal(closed.open, false, 'the overlay closes');
  assert.equal(closed.actionId, 'create-mission', 'the flow is preserved for reopen');
});

const SHELL_VIEW: AppShellView = {
  sections: [
    { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
    { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  ],
  tenant: null,
  missionStatus: null,
  recentMissions: [],
};

test('the shell renders the Ask MOS header control only when the entry provides the composer chrome', () => {
  const noop = (): void => undefined;
  const withComposer = (
    <MosAppShell
      shellView={SHELL_VIEW}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noop}
      onDeclareLabIntent={noop}
      onDeclareConsoleIntent={noop}
      shellVersion="0.1.0-test"
      composer={{
        state: openCreateMission(),
        onEvent: noop,
      }}
    />
  );
  const button = elementWithTestId(withComposer, 'composer-ask-mos-button');
  assert.ok(button, 'the Ask MOS control renders near the mission badge');
  assert.equal(button?.props['aria-keyshortcuts'], 'Control+J');
  assert.equal(button?.props['aria-expanded'], true);
  assert.equal(
    String(button.props.title ?? '').includes('Ctrl+J'),
    true,
    'the tooltip names the shortcut',
  );
  assert.ok(elementWithTestId(withComposer, 'mos-composer-overlay'), 'the overlay mounts inside the shell');

  const toggleEvents: ComposerUiEvent[] = [];
  const tree = (
    <MosAppShell
      shellView={SHELL_VIEW}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noop}
      onDeclareLabIntent={noop}
      onDeclareConsoleIntent={noop}
      shellVersion="0.1.0-test"
      composer={{
        state: initialComposerState(),
        onEvent: (event): void => {
          toggleEvents.push(event);
        },
      }}
    />
  );
  const closedButton = elementWithTestId(tree, 'composer-ask-mos-button');
  assert.equal(closedButton?.props['aria-expanded'], false);
  (closedButton?.props.onClick as () => void)();
  assert.deepEqual(toggleEvents, [{ kind: 'toggle' }], 'the header control toggles through the event sink');

  const withoutComposer = (
    <MosAppShell
      shellView={SHELL_VIEW}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noop}
      onDeclareLabIntent={noop}
      onDeclareConsoleIntent={noop}
      shellVersion="0.1.0-test"
    />
  );
  assert.equal(
    elementWithTestId(withoutComposer, 'composer-ask-mos-button'),
    null,
    'a shell without the composer chrome renders exactly what it is given',
  );
  assert.equal(elementWithTestId(withoutComposer, 'mos-composer-overlay'), null);
});
