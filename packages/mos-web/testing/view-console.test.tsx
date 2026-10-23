/**
 * Agent Console surface render tests (the CONSOLE wave, Worker B) —
 * render-LEVEL only (static render-tree walk, no DOM, no browser claim;
 * the browser evidence is the smoke-console suite). Covers:
 *
 * - the workspace shell for EVERY working mode: mission rail + banner +
 *   mode rail render, the rail's honest no-tenant / load-failed / empty
 *   states, aria-current pins on the mission + mode links;
 * - every mode's honest empty state and its DEEP detail renderers (plan
 *   chains with platform rationale + basis labels + the boundary statement
 *   + digest; strategies with roles/edges/phases/comparators/budgets and
 *   the AGT-003 validation receipt; runs with the §30 trail, ledger,
 *   binding and the honest waiting states);
 * - all 7 intent forms render with their field configs and submits, and
 *   the ONLY operator controls anywhere on the console are those forms'
 *   DECLARE submits;
 * - the outcome panel's executed receipt / verbatim rejection / honest
 *   not-found states;
 * - the right contextual inspector's per-mode content;
 * - the responsive lg: markers on the rail + inspector regions;
 * - NO fabricated data: an unknown mission renders the honest
 *   unknown-mission banner, never an invented one.
 *
 * View fixtures are derived ONCE from the disclosed composition double
 * (plain view models — the shapes the ports return), mirroring the Lab
 * view-fixture discipline: the full chain is DECLARED through the
 * console-intents port and the read models are what the authorities hold.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import { ConsoleView } from '../dist/src/index.js';
import type { MissionSummaryView } from '../dist/src/ports/mission-catalog.js';
import type {
  ConsoleAgentsData,
  ConsoleControlData,
  ConsoleDirectData,
  ConsolePlanData,
  ConsoleResearchData,
  ConsoleResultsData,
} from '../dist/src/ports/agent-console.js';
import type { ConsoleIntentLedgerRecord } from '../dist/src/ports/console-intents.js';
import type {
  ConsolePageData,
  ConsoleRoutePageModel,
} from '../dist/src/routes/console-page-loading.js';
import { declareConsoleIntentThroughPort } from '../dist/src/routes/console-intent-declaration.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';
import {
  elementWithTestId,
  elementsWithAriaCurrent,
  elementsWithTag,
  elementsWithTestId,
  linkHrefs,
  renderTreeText,
} from './render-tree.js';

const NOOP_ON_DECLARE_CONSOLE_INTENT = (): void => undefined;
const NOW = '2026-10-22T12:00:00.000Z';
const MISSION_ID = 'mission-console-view';
const DEMO_SCOPE: TenantScope = {
  tenantId: 'tenant-demo' as never,
  workspaceId: 'ws_demo' as never,
};

const PLATFORMS = JSON.stringify([
  { platform: 'mastodon', rationale: 'The launch cohort is active there.', evidence: [{ recordId: 'intel-1', version: 1 }] },
]);
const EXPECTATIONS = JSON.stringify([
  { metric: 'qualified-reach', expectation: '10000', unit: 'count', basis: { kind: 'cited-evidence' }, evidence: [{ recordId: 'intel-1', version: 1 }] },
]);
const EXPERIMENT_EXPECTATIONS = JSON.stringify([
  { question: 'Which platform wins the launch cohort?', successCriterion: 'Qualified reach > baseline.', evidence: [{ recordId: 'intel-1', version: 1 }] },
]);

const GRANT_DECLARATION = {
  action: 'grant-analysis-rights',
  grantId: 'grant-analyze-1',
  rightsHolderId: 'identity-operator',
  actionText: 'analyze',
  scopeJson: '{}',
  termsJson: '{}',
} as const;
const EXPERIMENT_DECLARATION = {
  action: 'create-experiment',
  experimentId: 'exp-001',
  questionText: 'Which platform wins the launch cohort?',
  successCriterionText: 'Qualified reach > baseline.',
  hypothesisJson: '{}',
  missionRefsText: MISSION_ID,
} as const;
const INTELLIGENCE_DECLARATION = {
  action: 'record-intelligence',
  recordId: 'intel-1',
  subjectJson: '{}',
  contentKindText: 'observation',
  contentJson: '{"note":"cohort observation"}',
  sourceJson: '{"sourceKind":"operator-declared"}',
  basisKindText: 'cited-evidence',
  citedCommerceObservationsJson: '[]',
  rightsRef: 'grant-analyze-1',
  attributionText: '',
  noteText: '',
} as const;

function seedMission(composition: ReturnType<typeof createInMemoryMosWebComposition>): void {
  const created = composition.missionRepository.createMission({
    scope: { tenantId: 'tenant-demo' as never },
    id: MISSION_ID as never,
    objective: {
      statement: 'Grow qualified reach for the console render pass.',
      targetMetrics: [
        { metric: 'qualified-reach' as never, target: '10000', unit: 'count', horizon: null },
      ],
      constraints: [{ kind: 'budget' as never, description: 'Hard ceiling 5000 EUR total.' }],
    } as never,
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: 'qualified-reach' as never,
          weight: 1,
          direction: 'maximize' as never,
          definition: 'Qualified reach among the render-pass cohort.',
        },
      ],
    } as never,
  });
  if ('error' in created) {
    throw new Error(`fixture mission seed failed: ${created.message}`);
  }
}

/**
 * Declares the chain up to `through` on a FRESH composition and returns
 * it. 'arm-run' (default) executes the complete authorized path; 'create-run'
 * stops with the run compiled (the pending-authorization fixture).
 */
async function chainComposition(
  through: 'arm-run' | 'create-run' = 'arm-run',
): Promise<ReturnType<typeof createInMemoryMosWebComposition>> {
  const composition = createInMemoryMosWebComposition({ now: () => NOW });
  seedMission(composition);
  await declareConsoleIntentThroughPort(composition, GRANT_DECLARATION);
  await declareConsoleIntentThroughPort(composition, EXPERIMENT_DECLARATION);
  await declareConsoleIntentThroughPort(composition, INTELLIGENCE_DECLARATION);
  await declareConsoleIntentThroughPort(composition, {
    action: 'compose-plan',
    planId: 'plan-render-1',
    missionId: MISSION_ID,
    objectiveAlignmentText: 'Serve the mission objective through evidence-linked platform choices.',
    platformsJson: PLATFORMS,
    metricExpectationsJson: EXPECTATIONS,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS,
    experimentRefsText: 'exp-001',
    noteText: '',
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'compile-strategy',
    planId: 'plan-render-1',
    planVersion: 0,
    principalText: 'identity-operator',
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'create-run',
    strategyId: 'prod003-strategy:plan-render-1@v1',
  });
  if (through === 'arm-run') {
    await declareConsoleIntentThroughPort(composition, {
      action: 'arm-run',
      runId: 'run-plan-render-1-1',
      principalText: 'identity-operator',
    });
  }
  return composition;
}

type LoadFailure = { readonly error: string; readonly message: string };

function read<T>(result: unknown, label: string): T {
  if (result !== null && typeof result === 'object' && 'error' in result) {
    throw new Error(
      `view fixture could not load ${label}: ${(result as LoadFailure).message}`,
    );
  }
  return result as T;
}

const executed = await chainComposition('arm-run');
const pending = await chainComposition('create-run');
// A PRISTINE composition (no console records at all) backs the honest-empty
// reads: the research/control reads are tenant-scoped, so an executed chain
// would leak its records into the empty-state fixtures.
const pristine = createInMemoryMosWebComposition({ now: () => NOW });

const DIRECT: ConsoleDirectData = read(
  await executed.agentConsole.loadConsoleDirect(MISSION_ID, DEMO_SCOPE),
  'the direct read',
);
const PLAN: ConsolePlanData = read(
  await executed.agentConsole.loadConsolePlan(MISSION_ID, DEMO_SCOPE),
  'the plan read',
);
const AGENTS: ConsoleAgentsData = read(
  await executed.agentConsole.loadConsoleAgents(DEMO_SCOPE),
  'the agents read',
);
const RESEARCH: ConsoleResearchData = read(
  await executed.agentConsole.loadConsoleResearch(MISSION_ID, DEMO_SCOPE),
  'the research read',
);
const RESULTS: ConsoleResultsData = read(
  await executed.agentConsole.loadConsoleResults(MISSION_ID, DEMO_SCOPE),
  'the results read',
);
const CONTROL_EXECUTED: ConsoleControlData = read(
  await executed.agentConsole.loadConsoleControl(MISSION_ID, DEMO_SCOPE),
  'the executed control read',
);
const CONTROL_PENDING: ConsoleControlData = read(
  await pending.agentConsole.loadConsoleControl(MISSION_ID, DEMO_SCOPE),
  'the pending control read',
);
const MISSIONS: readonly MissionSummaryView[] = read(
  await executed.missionCatalog.listMissionSummaries(DEMO_SCOPE),
  'the mission summaries',
);

const grantOutcome = await declareConsoleIntentThroughPort(executed, {
  ...GRANT_DECLARATION,
  grantId: 'grant-render-echo',
});
const EXECUTED_LEDGER: ConsoleIntentLedgerRecord = grantOutcome.record;

// The fail-closed rejection fixture: recording intelligence with NO grant.
const noGrant = createInMemoryMosWebComposition({ now: () => NOW });
const rejectedOutcome = await declareConsoleIntentThroughPort(noGrant, INTELLIGENCE_DECLARATION);
const REJECTED_LEDGER: ConsoleIntentLedgerRecord = rejectedOutcome.record;

const planPageData: ConsolePageData = { mode: 'plan', data: PLAN, agents: AGENTS, agentsError: null };

const consolePage = (
  page: ConsolePageData,
  overrides: Partial<ConsoleRoutePageModel> = {},
): ConsoleRoutePageModel => ({
  scope: DEMO_SCOPE,
  missions: MISSIONS,
  missionsError: null,
  selectedMissionId: MISSION_ID,
  intentOutcome: null,
  intentOutcomeError: null,
  page,
  ...overrides,
});

const directPage = (): ConsoleRoutePageModel => consolePage({ mode: 'direct', data: DIRECT });
const planPage = (overrides: Partial<ConsoleRoutePageModel> = {}): ConsoleRoutePageModel =>
  consolePage(planPageData, overrides);
const researchPage = (overrides: Partial<ConsoleRoutePageModel> = {}): ConsoleRoutePageModel =>
  consolePage({ mode: 'research', data: RESEARCH }, overrides);
const resultsPage = (overrides: Partial<ConsoleRoutePageModel> = {}): ConsoleRoutePageModel =>
  consolePage({ mode: 'results', data: RESULTS }, overrides);
const controlPage = (
  data: ConsoleControlData,
  overrides: Partial<ConsoleRoutePageModel> = {},
): ConsoleRoutePageModel => consolePage({ mode: 'control', data }, overrides);

const MODE_PAGES: readonly [string, ConsoleRoutePageModel][] = [
  ['direct', directPage()],
  ['plan', planPage()],
  ['research', researchPage()],
  ['results', resultsPage()],
  ['control', controlPage(CONTROL_EXECUTED)],
];

// ---------------------------------------------------------------------------
// The workspace shell
// ---------------------------------------------------------------------------

test('every working mode renders the mission rail, the mission banner and the mode rail', () => {
  for (const [mode, page] of MODE_PAGES) {
    const tree = <ConsoleView data={page} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
    assert.ok(elementWithTestId(tree, 'console-workspace'), `${mode}: the workspace renders`);
    assert.ok(elementWithTestId(tree, 'console-mission-rail'), `${mode}: the mission rail renders`);
    assert.ok(elementWithTestId(tree, 'console-banner'), `${mode}: the mission banner renders`);
    assert.ok(elementWithTestId(tree, 'console-mode-rail'), `${mode}: the mode rail renders`);
    assert.ok(elementWithTestId(tree, `console-mode-${mode}`), `${mode}: the mode content renders`);
    assert.ok(elementWithTestId(tree, 'console-inspector'), `${mode}: the inspector renders`);
  }
});

test('the mode rail marks exactly the active mode aria-current and links all five modes with the mission context', () => {
  for (const [mode, page] of MODE_PAGES) {
    const tree = <ConsoleView data={page} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
    const rail = elementWithTestId(tree, 'console-mode-rail');
    assert.ok(rail);
    const current = elementsWithAriaCurrent(rail);
    assert.equal(current.length, 1, `${mode}: exactly one aria-current mode link`);
    assert.equal(renderTreeText(current[0] ?? null), mode.charAt(0).toUpperCase() + mode.slice(1));
    const hrefs = linkHrefs(rail);
    for (const entry of ['direct', 'plan', 'research', 'results', 'control']) {
      assert.equal(
        hrefs.includes(`/console?mission=${MISSION_ID}&mode=${entry}`),
        true,
        `${mode}: the rail links ${entry}`,
      );
    }
  }
});

test('the mission rail links every mission with the current mode and marks the selected one aria-current', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const rail = elementWithTestId(tree, 'console-mission-rail');
  assert.ok(rail);
  const current = elementsWithAriaCurrent(rail);
  assert.equal(current.length, 1);
  const hrefs = linkHrefs(rail);
  assert.equal(hrefs.includes(`/console?mission=${MISSION_ID}&mode=plan`), true);
  const railText = renderTreeText(rail);
  assert.equal(railText.includes(MISSION_ID), false, 'the rail shows titles + lifecycle, not raw ids');
  assert.equal(railText.includes('draft'), true, 'the lifecycle state renders verbatim');
  assert.equal(railText.includes('v1'), true, 'the record version renders');
});

test('the console without a tenant scope renders the honest no-tenant rail', () => {
  const tree = (
    <ConsoleView
      data={consolePage({ mode: 'direct', data: DIRECT }, { scope: null, missions: null, selectedMissionId: null })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, 'console-mission-rail-no-tenant'));
  assert.equal(elementWithTestId(tree, 'console-mission-rail'), null);
});

test('a failed mission directory renders the honest load-failed rail, never a guessed list', () => {
  const tree = (
    <ConsoleView
      data={consolePage({ mode: 'direct', data: DIRECT }, { missions: null, missionsError: 'load-failed' })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const error = elementWithTestId(tree, 'console-mission-rail-error');
  assert.ok(error);
  assert.equal(renderTreeText(error).includes('failed explicitly'), true);
});

test('an empty mission directory renders the explicit empty state with the Missions link', () => {
  const tree = (
    <ConsoleView
      data={consolePage({ mode: 'direct', data: DIRECT }, { missions: [], selectedMissionId: null })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const empty = elementWithTestId(tree, 'console-mission-rail-empty');
  assert.ok(empty);
  assert.equal(linkHrefs(empty).includes('/missions'), true);
});

test('an unknown mission renders the honest unknown-mission banner — never fabricated mission data', async () => {
  const unknownDirect = read<ConsoleDirectData>(
    await executed.agentConsole.loadConsoleDirect('mission-does-not-exist', DEMO_SCOPE),
    'the unknown-mission direct read',
  );
  const tree = (
    <ConsoleView
      data={consolePage({ mode: 'direct', data: unknownDirect }, { selectedMissionId: 'mission-does-not-exist' })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const banner = elementWithTestId(tree, 'console-banner');
  assert.ok(banner);
  const text = renderTreeText(banner);
  assert.equal(text.includes('Unknown mission mission-does-not-exist'), true);
  assert.equal(text.includes('does not resolve in this tenant scope'), true);
});

test('the Direct mode without a mission renders the no-mission banner and no compose-plan form', async () => {
  const noMission = read<ConsoleDirectData>(await executed.agentConsole.loadConsoleDirect(null, DEMO_SCOPE), 'the no-mission direct read');
  const tree = (
    <ConsoleView
      data={consolePage({ mode: 'direct', data: noMission }, { selectedMissionId: null, missions: [] })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, 'console-banner-none'));
  assert.equal(elementWithTestId(tree, 'console-compose-plan-form'), null);
  assert.ok(elementWithTestId(tree, 'console-direct-form-none'), 'the honest no-form state renders');
});

// ---------------------------------------------------------------------------
// The Direct mode
// ---------------------------------------------------------------------------

test('the Direct mode renders the standings and readiness as the authorities hold them', () => {
  const tree = <ConsoleView data={directPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const standings = elementWithTestId(tree, 'console-direct-standings');
  assert.ok(standings);
  const standingsText = renderTreeText(standings);
  assert.equal(standingsText.includes('1'), true);
  assert.equal(DIRECT.standings.runsArmed, 1, 'fixture sanity: one armed run');
  assert.equal(DIRECT.readiness.intelligenceRecords, 1, 'fixture sanity: one intelligence record');
  const readiness = elementWithTestId(tree, 'console-direct-readiness');
  assert.ok(readiness);
  const readinessText = renderTreeText(readiness);
  assert.equal(readinessText.includes('Intelligence records'), true);
  assert.equal(readinessText.includes('Rights grants'), true);
  assert.equal(readinessText.includes('Experiments'), true);
  assert.equal(readinessText.includes('Plans'), true);
});

test('the Direct mode renders the compose-plan form WITH the mission field (the declaration needs it)', () => {
  const tree = <ConsoleView data={directPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const form = elementWithTestId(tree, 'console-compose-plan-form');
  assert.ok(form, 'the compose-plan form renders');
  assert.ok(elementWithTestId(tree, 'console-compose-plan-form-submit'));
  const formText = renderTreeText(form);
  assert.equal(formText.includes('marketing-planner-authority'), true, 'the routed authority is verbatim');
  assert.equal(formText.includes('The mission this plan serves'), true, 'the mission field renders');
  for (const field of ['console-intent-plan-id', 'console-intent-mission-id', 'console-intent-objective-alignment',
    'console-intent-platforms-json', 'console-intent-metric-expectations-json',
    'console-intent-experiment-expectations-json', 'console-intent-experiment-refs']) {
    assert.ok(elementWithTestId(tree, `console-intent-field-${field}`), `the ${field} input renders`);
  }
});

// ---------------------------------------------------------------------------
// The Plan mode
// ---------------------------------------------------------------------------

test('the Plan mode renders its honest empty states before anything is composed', async () => {
  const emptyPlan = read<ConsolePlanData>(await executed.agentConsole.loadConsolePlan('mission-none', DEMO_SCOPE), 'the empty plan read');
  const tree = (
    <ConsoleView
      data={consolePage(planPageData, { page: { mode: 'plan', data: emptyPlan, agents: null, agentsError: null } })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const plansEmpty = elementWithTestId(tree, 'console-plans-empty');
  assert.ok(plansEmpty);
  assert.equal(renderTreeText(plansEmpty).includes('No plans composed'), true);
  assert.ok(elementWithTestId(tree, 'console-strategies-empty'));
});

test('the composed plan renders its platforms, expectations with basis labels, boundary statement and digest', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const chain = elementWithTestId(tree, 'console-plan-chain-plan-render-1');
  assert.ok(chain);
  assert.equal(chain.type, 'details', 'the plan chain row is a keyboard-operable disclosure');
  const text = renderTreeText(chain);
  assert.equal(text.includes('mastodon'), true, 'the platform id renders');
  assert.equal(text.includes('The launch cohort is active there.'), true, 'the platform rationale renders');
  assert.equal(text.includes('qualified-reach'), true, 'the metric expectation renders');
  assert.equal(text.includes('10000'), true);
  assert.equal(text.includes('cited-evidence'), true, 'the basis label renders verbatim');
  const boundary = elementWithTestId(tree, 'console-plan-boundary-plan-render-1');
  assert.ok(boundary);
  assert.equal(
    renderTreeText(boundary).includes(PLAN.planChains[0]?.boundaryStatement ?? ''),
    true,
    'the boundary statement renders VERBATIM',
  );
  const digest = elementWithTestId(tree, 'console-plan-digest-plan-render-1');
  assert.ok(digest);
  assert.equal(renderTreeText(digest).includes(PLAN.planChains[0]?.recordDigest ?? ''), true);
});

test('the compiled strategy renders its organization, gates and honest EVD absence', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const strategy = elementWithTestId(tree, 'console-strategy-prod003-strategy:plan-render-1@v1');
  assert.ok(strategy);
  const text = renderTreeText(strategy);
  assert.equal(text.includes('generalist-baseline'), true, 'the organization name renders');
  assert.equal(text.includes('generalist'), true, 'the topology renders');
  assert.equal(text.includes('role-controller'), true, 'the roles render');
  assert.equal(text.includes('role-generalist'), true);
  assert.equal(text.includes('task-delegation'), true, 'the delegation edges render');
  assert.equal(text.includes('phase-review'), true, 'the phases render');
  assert.equal(text.includes('phase-execute'), true);
  assert.equal(text.includes('1000 USD ceiling'), true, 'the budget renders');
  assert.equal(text.includes('agents-registry#in-memory-double'), true, 'the AGT-003 validation receipt renders');
  const evd = elementWithTestId(tree, 'console-strategy-evd-none-prod003-strategy:plan-render-1@v1');
  assert.ok(evd);
  assert.equal(renderTreeText(evd).includes('not computed by the compiler'), true, 'no fabricated EVD');
  assert.equal(renderTreeText(strategy).includes('counterfactual'), true, 'the forecasts carry the counterfactual label');
});

test('the Plan mode renders the compile-strategy form and the agents registry context', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  assert.ok(elementWithTestId(tree, 'console-compile-strategy-form'));
  const submit = elementWithTestId(tree, 'console-compile-strategy-form-submit');
  assert.ok(submit);
  assert.equal(submit?.props.type, 'submit');
  assert.ok(elementWithTestId(tree, 'console-agent-body-body-analyst'), 'the agent bodies render');
  assert.ok(elementWithTestId(tree, 'console-agents-note'), 'the registry note renders');
});

test('a failed agents registry read degrades to the honest marker, never a fabricated registry', () => {
  const tree = (
    <ConsoleView
      data={consolePage({ ...planPageData, agents: null, agentsError: 'load-failed' })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const error = elementWithTestId(tree, 'console-agents-error');
  assert.ok(error);
  assert.equal(error.props.role, 'alert');
  assert.equal(elementWithTestId(tree, 'console-agent-body-body-analyst'), null);
});

// ---------------------------------------------------------------------------
// The Research mode
// ---------------------------------------------------------------------------

test('the Research mode renders its honest empty states and its real Lab links', async () => {
  const emptyResearch = read<ConsoleResearchData>(await pristine.agentConsole.loadConsoleResearch('mission-none', DEMO_SCOPE), 'the empty research read');
  const tree = (
    <ConsoleView data={consolePage({ mode: 'research', data: emptyResearch })} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  assert.ok(elementWithTestId(tree, 'console-intelligence-empty'));
  assert.ok(elementWithTestId(tree, 'console-experiments-empty'));
  const links = linkHrefs(elementWithTestId(tree, 'console-lab-links') ?? tree);
  for (const href of links) {
    assert.equal(href.startsWith('/lab'), true, `internal lab links only: ${href}`);
  }
});

test('the recorded intelligence renders its basis label and rights status verbatim; the experiment its status', () => {
  const tree = <ConsoleView data={researchPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const record = elementWithTestId(tree, 'console-intelligence-record-intel-1');
  assert.ok(record);
  const recordText = renderTreeText(record);
  assert.equal(recordText.includes('intel-1@v1'), true);
  assert.equal(recordText.includes('cited-evidence'), true, 'the §25 basis label renders verbatim');
  assert.equal(recordText.includes('observation'), true, 'the content kind renders');
  assert.equal(recordText.includes('rights: granted'), true, 'the rights status renders');
  const experiment = elementWithTestId(tree, 'console-experiment-exp-001');
  assert.ok(experiment);
  const experimentText = renderTreeText(experiment);
  assert.equal(experimentText.includes('active'), true, 'the binding status renders verbatim');
  assert.equal(experimentText.includes('Which platform wins the launch cohort?'), true);
});

test('the Research mode renders the create-experiment and record-intelligence forms with their authorities', () => {
  const tree = <ConsoleView data={researchPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  for (const form of ['console-create-experiment-form', 'console-record-intelligence-form']) {
    assert.ok(elementWithTestId(tree, form), `${form} renders`);
    const submit = elementWithTestId(tree, `${form}-submit`);
    assert.ok(submit, `${form} submits`);
    assert.equal(submit?.props.type, 'submit');
  }
  const text = renderTreeText(tree);
  assert.equal(text.includes('experiments-authority'), true);
  assert.equal(text.includes('product-intelligence-authority'), true);
  assert.equal(text.includes('fail-closed'), true, 'the rights-gate disclosure is up front');
});

// ---------------------------------------------------------------------------
// The Results mode
// ---------------------------------------------------------------------------

test('the Results mode renders its honest empty states', async () => {
  const emptyResults = read<ConsoleResultsData>(await executed.agentConsole.loadConsoleResults('mission-none', DEMO_SCOPE), 'the empty results read');
  const tree = (
    <ConsoleView data={consolePage({ mode: 'results', data: emptyResults })} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  assert.ok(elementWithTestId(tree, 'console-runs-empty'));
  assert.ok(elementWithTestId(tree, 'console-artifacts-empty'));
});

test('the armed run renders its lifecycle, honest waiting state, full trail, binding and artifacts', () => {
  const tree = <ConsoleView data={resultsPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const run = elementWithTestId(tree, 'console-run-run-plan-render-1-1');
  assert.ok(run);
  assert.equal(run.type, 'details', 'the run row is a keyboard-operable disclosure');
  const runText = renderTreeText(run);
  assert.equal(runText.includes('armed'), true, 'the lifecycle renders verbatim');
  assert.equal(runText.includes('run-created'), true, 'the §30 trail kinds render');
  assert.equal(runText.includes("awaiting authorization (nothing executes)"), true);
  assert.equal(runText.includes('experiment binding:'), true, 'the armed binding renders');
  assert.equal(runText.includes('exp-001'), true);
  const waiting = elementWithTestId(tree, 'console-run-waiting-run-plan-render-1-1');
  assert.ok(waiting);
  assert.equal(renderTreeText(waiting).includes('job-execution-transport'), true);
  const artifacts = elementWithTestId(tree, 'console-artifacts');
  assert.ok(artifacts);
  const artifactsText = renderTreeText(artifacts);
  assert.equal(artifactsText.includes('marketing-plan'), true);
  assert.equal(artifactsText.includes('compiled-strategy'), true);
});

// ---------------------------------------------------------------------------
// The Control mode
// ---------------------------------------------------------------------------

test('the Control mode renders its honest empty states', async () => {
  const emptyControl = read<ConsoleControlData>(await pristine.agentConsole.loadConsoleControl('mission-none', DEMO_SCOPE), 'the empty control read');
  const tree = (
    <ConsoleView data={consolePage({ mode: 'control', data: emptyControl })} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  assert.ok(elementWithTestId(tree, 'console-queue-empty'));
  assert.ok(elementWithTestId(tree, 'console-authorized-empty'));
  assert.ok(elementWithTestId(tree, 'console-grants-empty'));
});

test('a compiled run waits in the authorization queue; an armed run lands in authorized with its transport note', () => {
  const pendingTree = (
    <ConsoleView data={controlPage(CONTROL_PENDING)} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  const queue = elementWithTestId(pendingTree, 'console-authorization-queue');
  assert.ok(queue);
  const queueText = renderTreeText(queue);
  assert.equal(queueText.includes('run-plan-render-1-1'), true);
  assert.equal(queueText.includes('prod003-strategy:plan-render-1@v1'), true);
  assert.equal(elementWithTestId(pendingTree, 'console-queue-empty'), null);

  const executedTree = (
    <ConsoleView data={controlPage(CONTROL_EXECUTED)} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  const authorized = elementWithTestId(executedTree, 'console-authorized-runs');
  assert.ok(authorized);
  const authorizedText = renderTreeText(authorized);
  assert.equal(authorizedText.includes('run-plan-render-1-1'), true);
  assert.equal(authorizedText.includes('exp-001'), true, 'the bound experiment renders');
  assert.equal(authorizedText.includes('job-execution-transport'), true, 'the disclosed P2 boundary renders');
  const grants = elementWithTestId(executedTree, 'console-rights-grants');
  assert.ok(grants);
  assert.equal(renderTreeText(grants).includes('grant-analyze-1'), true);
  assert.equal(renderTreeText(grants).includes('analyze'), true);
});

test('the Control mode renders the grant, create-run and arm-run declaration forms', () => {
  const tree = <ConsoleView data={controlPage(CONTROL_EXECUTED)} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  for (const form of ['console-grant-rights-form', 'console-create-run-form', 'console-arm-run-form']) {
    assert.ok(elementWithTestId(tree, form), `${form} renders`);
    const submit = elementWithTestId(tree, `${form}-submit`);
    assert.ok(submit, `${form} submits`);
    assert.equal(submit?.props.type, 'submit');
  }
  const text = renderTreeText(tree);
  assert.equal(text.includes('rights-authority'), true);
  assert.equal(text.includes('automation-engine-authority'), true);
  assert.equal(text.includes('THE approval transition'), true, 'the arm gate is named up front');
});

// ---------------------------------------------------------------------------
// The intent forms pin + the operator-control discipline
// ---------------------------------------------------------------------------

test('all 7 intent forms render across the modes with their submits (the complete chain is declarable)', () => {
  const expectedForms: readonly [string, ConsoleRoutePageModel][] = [
    ['console-compose-plan-form', directPage()],
    ['console-compile-strategy-form', planPage()],
    ['console-create-experiment-form', researchPage()],
    ['console-record-intelligence-form', researchPage()],
    ['console-grant-rights-form', controlPage(CONTROL_EXECUTED)],
    ['console-create-run-form', controlPage(CONTROL_EXECUTED)],
    ['console-arm-run-form', controlPage(CONTROL_EXECUTED)],
  ];
  for (const [formId, page] of expectedForms) {
    const tree = <ConsoleView data={page} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
    assert.ok(elementWithTestId(tree, formId), `${formId} renders`);
    assert.ok(elementWithTestId(tree, `${formId}-submit`), `${formId} has its DECLARE submit`);
  }
});

test('the ONLY operator controls on the console surface are intent-form DECLARE submits (+ the Ask MOS composer entry)', () => {
  // The §6 universal-composer wave (UXR-WC) adds exactly ONE more control:
  // the direct-mode "Direct the work — ask MOS" entry. It is a DECLARE-path
  // affordance, not an execution control — it opens the shell-owned composer
  // whose confirm routes the SAME declaration through the SAME
  // onDeclareConsoleIntent callback (pinned in view-composer.test.tsx).
  for (const [, page] of MODE_PAGES) {
    const tree = <ConsoleView data={page} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
    for (const button of elementsWithTag(tree, 'button')) {
      const testId = button.props['data-testid'];
      const isIntentSubmit = typeof testId === 'string' && testId.endsWith('-submit');
      const isComposerEntry = testId === 'console-ask-mos';
      assert.equal(
        isIntentSubmit || isComposerEntry,
        true,
        `every button declares an intent or opens the composer: ${String(testId)}`,
      );
      if (isIntentSubmit) {
        assert.equal(button.props.type, 'submit', 'the intent control is a form submit');
      }
    }
  }
});

test('every navigation affordance on the console surface is a real internal link', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const hrefs = linkHrefs(tree);
  for (const href of hrefs) {
    assert.equal(
      href.startsWith('/console') || href.startsWith('/lab') || href.startsWith('/missions'),
      true,
      `internal links only: ${href}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The write-intent outcome panel
// ---------------------------------------------------------------------------

test('an executed receipt renders the authority echo with equal prominence', () => {
  const tree = (
    <ConsoleView
      data={planPage({ intentOutcome: EXECUTED_LEDGER })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  assert.ok(elementWithTestId(tree, 'console-intent-outcome'));
  const receipt = elementWithTestId(tree, 'console-intent-outcome-receipt');
  assert.ok(receipt);
  const text = renderTreeText(receipt);
  assert.equal(text.includes('Executed by rights-authority'), true);
  assert.equal(text.includes('grant-render-echo'), true, 'the record id echoes');
  assert.equal(text.includes('action analyze granted to identity-operator'), true, 'the authority summary echoes');
});

test('an authority rejection renders the verbatim code and message — never paraphrased into success', () => {
  const tree = (
    <ConsoleView
      data={researchPage({ intentOutcome: REJECTED_LEDGER })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const rejection = elementWithTestId(tree, 'console-intent-outcome-rejection');
  assert.ok(rejection);
  const text = renderTreeText(rejection);
  assert.equal(text.includes('Rejected by product-intelligence-authority'), true);
  assert.equal(text.includes('no-explicit-grant'), true, 'the authority code renders verbatim');
  assert.equal(text.includes('fail-closed'), true, 'the authority message renders verbatim');
  assert.equal(text.includes('Nothing was written'), true);
});

test('an unresolved receipt marker renders the honest not-found state; no marker renders no panel', () => {
  const notFoundTree = (
    <ConsoleView
      data={planPage({ intentOutcome: null, intentOutcomeError: 'console-intent-not-found' })}
      onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT}
    />
  );
  const unresolved = elementWithTestId(notFoundTree, 'console-intent-outcome-unresolved');
  assert.ok(unresolved);
  assert.equal(unresolved.props.role, 'status');
  assert.equal(renderTreeText(unresolved).includes('cannot tell and will not guess'), true);

  const quietTree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  assert.equal(elementWithTestId(quietTree, 'console-intent-outcome'), null);
});

// ---------------------------------------------------------------------------
// The right contextual inspector
// ---------------------------------------------------------------------------

test('the inspector follows the Direct mode: objective, criteria, constraints and standings', () => {
  const tree = <ConsoleView data={directPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const inspector = elementWithTestId(tree, 'console-inspector');
  assert.ok(inspector);
  assert.equal(inspector.type, 'details', 'the inspector is a collapsible disclosure');
  const text = renderTreeText(elementWithTestId(tree, 'console-inspector-direct') ?? tree);
  assert.equal(text.includes('Grow qualified reach for the console render pass.'), true, 'the objective renders');
  assert.equal(text.includes('qualified-reach'), true, 'the success criterion renders');
  assert.equal(text.includes('budget'), true, 'the constraint kind renders');
  assert.equal(text.includes('Hard ceiling 5000 EUR total.'), true);
  const standings = elementWithTestId(tree, 'console-inspector-standings');
  assert.ok(standings);
  assert.equal(renderTreeText(standings).includes('1 plans'), true);
});

test('the inspector follows the Plan mode: the selected plan and strategy detail', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  assert.ok(elementWithTestId(tree, 'console-inspector-plan'));
  assert.ok(elementWithTestId(tree, 'console-plan-detail-plan-render-1'), 'the selected plan detail renders');
  assert.ok(elementWithTestId(tree, 'console-plan-boundary-plan-render-1'), 'its boundary statement renders');
  assert.ok(elementWithTestId(tree, 'console-strategy-detail-prod003-strategy:plan-render-1@v1'));
});

test('the inspector follows the Research mode: citation basis and rights status', () => {
  const tree = <ConsoleView data={researchPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const basis = elementWithTestId(tree, 'console-inspector-citation-basis');
  assert.ok(basis);
  const basisText = renderTreeText(basis);
  assert.equal(basisText.includes('1 intelligence records'), true);
  assert.equal(basisText.includes('1 cited-evidence'), true);
  assert.equal(basisText.includes('0 counterfactual-forecast'), true);
  const rights = elementWithTestId(tree, 'console-inspector-rights-status');
  assert.ok(rights);
  assert.equal(renderTreeText(rights).includes('1 of 1'), true);
});

test('the inspector follows the Results mode: the selected run trail and ledger', () => {
  const tree = <ConsoleView data={resultsPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  assert.ok(elementWithTestId(tree, 'console-inspector-results'));
  assert.ok(elementWithTestId(tree, 'console-run-detail-run-plan-render-1-1'), 'the selected run detail renders');
  assert.ok(elementWithTestId(tree, 'console-run-trail-run-plan-render-1-1-run-plan-render-1-1-ev2'), 'the armed trail event renders');
  assert.ok(elementWithTestId(tree, 'console-run-binding-run-plan-render-1-1'));
});

test('the inspector follows the Control mode: pending authorization detail and grants', () => {
  const pendingTree = (
    <ConsoleView data={controlPage(CONTROL_PENDING)} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  const pendingDetail = elementWithTestId(pendingTree, 'console-inspector-pending');
  assert.ok(pendingDetail);
  const pendingText = renderTreeText(pendingDetail);
  assert.equal(pendingText.includes('run-plan-render-1-1'), true);
  assert.equal(pendingText.includes('prod003-strategy:plan-render-1@v1'), true);

  const executedTree = (
    <ConsoleView data={controlPage(CONTROL_EXECUTED)} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />
  );
  assert.ok(elementWithTestId(executedTree, 'console-inspector-pending-none'), 'the honest empty queue state');
  const grants = elementWithTestId(executedTree, 'console-inspector-grants');
  assert.ok(grants);
  assert.equal(renderTreeText(grants).includes('grant-analyze-1'), true);
});

// ---------------------------------------------------------------------------
// Responsive + accessibility pins
// ---------------------------------------------------------------------------

test('the workspace carries the responsive lg: markers on the rail and inspector regions', () => {
  const tree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const left = elementWithTestId(tree, 'console-left-region');
  assert.ok(left);
  assert.equal(String(left.props.className ?? '').includes('lg:w-56'), true, 'the mission rail narrows at lg');
  const right = elementWithTestId(tree, 'console-right-region');
  assert.ok(right);
  assert.equal(String(right.props.className ?? '').includes('lg:w-80'), true, 'the inspector takes the right region at lg');
  const center = elementWithTestId(tree, 'console-center-region');
  assert.ok(center);
  assert.equal(String(center.props.className ?? '').includes('flex-1'), true, 'the center region is preserved');
});

test('the workspace keeps semantic landmarks: nav rails, center section, inspector aside', () => {
  const tree = <ConsoleView data={directPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const tags = elementsWithTag(tree, 'nav').length;
  assert.equal(tags >= 2, true, 'the mission rail and mode rail are nav landmarks');
  assert.ok(elementsWithTag(tree, 'section').length >= 1, 'the center region is a section');
  assert.ok(elementsWithTag(tree, 'aside').length >= 1, 'the inspector region is an aside');
  const summary = elementsWithTag(tree, 'summary');
  assert.ok(summary.length >= 1, 'disclosure summaries are native and keyboard operable');
});

test('the plan chain and run rows render as native details/summary progressive disclosure', () => {
  const planTree = <ConsoleView data={planPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const chain = elementWithTestId(planTree, 'console-plan-chain-plan-render-1');
  assert.ok(chain);
  assert.equal(chain.type, 'details');
  const resultsTree = <ConsoleView data={resultsPage()} onDeclareConsoleIntent={NOOP_ON_DECLARE_CONSOLE_INTENT} />;
  const run = elementWithTestId(resultsTree, 'console-run-run-plan-render-1-1');
  assert.ok(run);
  assert.equal(run.type, 'details');
});
