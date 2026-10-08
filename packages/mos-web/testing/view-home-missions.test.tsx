/**
 * Home + Missions render tests (UX-001) — render-LEVEL only (static
 * render-tree walk, no DOM, no browser claim; full browser acceptance is
 * UX-006). Home narrates the §2 complete loop; the Missions surface presents
 * the catalog view models: list rows, detail, intent receipt / refusal /
 * receipt-unavailable panels, and the create-mission INTENT form.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HomeView,
  MissionDetailPanel,
  MissionIntentForm,
  MissionsListView,
  MissionsView,
} from '../dist/src/index.js';
import type { MissionSummaryView } from '../dist/src/ports/mission-catalog.js';
import { MISSION_LIFECYCLE_STATES } from './in-memory-mission-catalog.js';
import {
  elementWithTestId,
  elementsWithTag,
  elementsWithTestId,
  linkHrefs,
  renderTreeText,
} from './render-tree.js';
import { MISSION_DETAIL, MISSION_SUMMARY, missionsPage, noopIntent } from './view-fixtures.js';

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

test('Home narrates the ten §2 stages in order with their owners', () => {
  const tree = <HomeView />;
  const expectedStages = [
    'Mission',
    'Lab',
    'Program',
    'Studio',
    'Artifact graph',
    'Quality / Rights / Policy',
    'Experiment',
    'Measurement',
    'Learning',
    'Next run',
  ];
  for (let index = 0; index < expectedStages.length; index += 1) {
    const stage = elementWithTestId(tree, `loop-stage-${index + 1}`);
    assert.ok(stage, `stage ${index + 1} renders`);
    const text = renderTreeText(stage);
    assert.equal(text.includes(expectedStages[index] ?? ''), true);
    assert.equal(text.includes('Owned by'), true);
  }
  const fullText = renderTreeText(tree);
  assert.equal(fullText.includes('marketing-engineering operating system'), true);
  assert.equal(fullText.includes('Four cooperating loops'), true);
});

test('Home links into the Missions surface (the loop\'s front door)', () => {
  const tree = <HomeView />;
  const cta = elementWithTestId(tree, 'home-cta-missions');
  assert.equal(cta?.type, 'a');
  assert.equal(cta?.props.href, '/missions');
  const hrefs = linkHrefs(tree);
  assert.equal(hrefs.every((href) => href === '/missions'), true);
});

test('Home summarizes the four cooperating loops', () => {
  const tree = <HomeView />;
  const loops = elementWithTestId(tree, 'cooperating-loops');
  assert.ok(loops);
  const text = renderTreeText(loops);
  for (const phrase of ['Mission loop', 'Production loop', 'Learning loop', 'Engine loop']) {
    assert.equal(text.includes(phrase), true);
  }
});

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

test('the Missions page without a tenant scope renders the explicit no-tenant view', () => {
  const tree = (
    <MissionsView
      data={missionsPage({ scope: null, summaries: [], metricVocabulary: [] })}
      onDeclareMissionIntent={noopIntent}
    />
  );
  assert.ok(elementWithTestId(tree, 'missions-no-tenant'));
});

test('the mission list renders rows as detail links with lifecycle and reward summaries', () => {
  const tree = (
    <MissionsView data={missionsPage()} onDeclareMissionIntent={noopIntent} />
  );
  const row = elementWithTestId(tree, 'mission-row-mission_demo_1');
  assert.ok(row);
  assert.equal(row.type, 'a');
  assert.equal(row.props.href, '/missions?mission=mission_demo_1');
  const text = renderTreeText(row);
  assert.equal(text.includes('Grow qualified reach of the developer audience'), true);
  assert.equal(text.includes('active'), true);
  assert.equal(text.includes('2 reward terms · spec v2'), true);
  assert.equal(text.includes('record v2 · reward spec v2'), true);
  assert.equal(text.includes('tenant-demo'), true);
  assert.equal(text.includes('2026-06-01T00:00:00.000Z'), true);
});

test('the selected mission row is marked aria-current', () => {
  const tree = (
    <MissionsView
      data={missionsPage({ selected: MISSION_DETAIL })}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const row = elementWithTestId(tree, 'mission-row-mission_demo_1');
  assert.equal(row?.props['aria-current'], 'page');
});

test('an empty mission scope lists the explicit empty state, never placeholder rows', () => {
  const tree = (
    <MissionsListView summaries={[]} selectedMissionId={null} />
  );
  const empty = elementWithTestId(tree, 'missions-empty');
  assert.ok(empty);
  assert.equal(renderTreeText(empty).includes('No missions are visible'), true);
});

test('every mission lifecycle state renders its badge in the list', () => {
  const summaries: MissionSummaryView[] = MISSION_LIFECYCLE_STATES.map(
    (lifecycleState, index) => ({
      ...MISSION_SUMMARY,
      missionId: `mission_state_${index + 1}` as MissionSummaryView['missionId'],
      lifecycleState,
    }),
  );
  const tree = <MissionsListView summaries={summaries} selectedMissionId={null} />;
  const rows = elementsWithTestId(tree, 'missions-list');
  assert.equal(rows.length, 1, 'one mission list renders');
  const text = renderTreeText(rows[0] ?? tree);
  for (const lifecycleState of MISSION_LIFECYCLE_STATES) {
    assert.equal(
      text.includes(lifecycleState),
      true,
      `the "${lifecycleState}" lifecycle badge renders (presentation of the authority's state, never a control)`,
    );
  }
});

test('mission detail presents objective, metrics, constraints, transitions and reward versions', () => {
  const tree = <MissionDetailPanel detail={MISSION_DETAIL} />;
  assert.ok(elementWithTestId(tree, 'mission-detail'));
  const text = renderTreeText(tree);
  assert.equal(text.includes('Grow qualified reach of the developer audience in Q3.'), true);
  assert.equal(text.includes('250000'), true);
  assert.equal(text.includes('Hard ceiling 5000 EUR total.'), true);
  assert.equal(text.includes('strategy://baseline-noop'), true);

  const transitions = elementWithTestId(tree, 'mission-transitions');
  assert.ok(transitions);
  const transitionsText = renderTreeText(transitions);
  assert.equal(transitionsText.includes('created'), true);
  assert.equal(transitionsText.includes('draft'), true);
  assert.equal(transitionsText.includes('active'), true);

  const versions = elementWithTestId(tree, 'mission-reward-versions');
  assert.ok(versions);
  const versionsText = renderTreeText(versions);
  assert.equal(versionsText.includes('Spec v1'), true);
  assert.equal(versionsText.includes('Spec v2'), true);
  assert.equal(versionsText.includes('qualified-reach'), true);
  assert.equal(versionsText.includes('0.7'), true);
});

test('a mission selection failure renders the explicit selection-error panel', () => {
  const tree = (
    <MissionsView
      data={missionsPage({ selectionError: 'mission-not-found' })}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const panel = elementWithTestId(tree, 'mission-selection-error');
  assert.ok(panel);
  assert.equal(panel.props.role, 'alert');
});

test('an intent receipt renders with its routing disclosure', () => {
  const tree = (
    <MissionsView
      data={missionsPage({
        intentReceipt: {
          intentId: 'intent-1',
          declaredAt: '2026-06-01T00:00:00.000Z',
          routedTo: 'missions-authority',
          note: 'The Missions authority validates and executes the declaration.',
        },
      })}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const panel = elementWithTestId(tree, 'intent-receipt');
  assert.ok(panel);
  const text = renderTreeText(panel);
  assert.equal(text.includes('missions-authority'), true);
  assert.equal(text.includes('intent-1'), true);
});

test('an intent failure renders the explicit intent-error panel with its code', () => {
  const tree = (
    <MissionsView
      data={missionsPage({ intentError: 'mission-catalog-unavailable' })}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const panel = elementWithTestId(tree, 'intent-error');
  assert.ok(panel);
  assert.equal(panel.props.role, 'alert');
  assert.equal(renderTreeText(panel).includes('mission-catalog-unavailable'), true);
});

test('an unresolvable receipt is NOT a refused declaration — distinct honest panel', () => {
  const tree = (
    <MissionsView
      data={missionsPage({ intentError: 'intent-receipt-not-found' })}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const refusal = elementWithTestId(tree, 'intent-error');
  assert.equal(refusal, null, 'the refusal panel must not render for a receipt read-back miss');
  const panel = elementWithTestId(tree, 'intent-receipt-unavailable');
  assert.ok(panel, 'the receipt-unavailable panel renders');
  assert.equal(panel.props.role, 'status');
  const text = renderTreeText(panel);
  assert.equal(text.includes('declaration itself was accepted'), true);
  assert.equal(text.includes('receipt read-back'), true);
  assert.equal(linkHrefs(panel).includes('/missions'), true);
});

test('the create-mission intent form declares intent — labels, options, submit', () => {
  const pageScope = missionsPage().scope;
  assert.ok(pageScope);
  const tree = (
    <MissionIntentForm
      scope={pageScope}
      metricVocabulary={[
        { id: 'qualified-reach', label: 'Qualified reach' },
        { id: 'cost', label: 'Cost' },
      ]}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const form = elementsWithTag(tree, 'form')[0];
  assert.ok(form, 'the intent declaration is a real form element');
  assert.equal(typeof form.props.onSubmit, 'function');

  const labels = elementsWithTag(tree, 'label');
  assert.equal(labels.length >= 5, true, 'objective + term fields are labeled');
  const selects = elementsWithTag(tree, 'select');
  assert.equal(selects.length >= 4, true, 'metric + direction selects per term row');
  const options = elementsWithTag(tree, 'option');
  const optionValues = options.map((option) => String(option.props.value ?? ''));
  assert.equal(optionValues.includes('qualified-reach'), true);
  assert.equal(optionValues.includes('cost'), true);
  assert.equal(optionValues.includes('maximize'), true);
  assert.equal(optionValues.includes('minimize'), true);

  const submit = elementWithTestId(tree, 'mission-intent-submit');
  assert.equal(submit?.type, 'button');
  assert.equal(submit?.props.type, 'submit');

  const text = renderTreeText(tree);
  assert.equal(text.includes('Declare the intent to create a mission'), true);
  assert.equal(text.includes('Missions authority'), true);
});

test('the first reward-term row is required; later rows are optional', () => {
  const tree = (
    <MissionIntentForm
      scope={{ tenantId: 'tenant-demo' as never }}
      metricVocabulary={[{ id: 'revenue', label: 'Revenue' }]}
      onDeclareMissionIntent={noopIntent}
    />
  );
  const requiredFields = [
    ...elementsWithTag(tree, 'select'),
    ...elementsWithTag(tree, 'input'),
    ...elementsWithTag(tree, 'textarea'),
  ].filter((element) => element.props.required === true);
  // objective textarea + first-row metric/direction/weight/definition = 5.
  assert.equal(requiredFields.length, 5);
});
