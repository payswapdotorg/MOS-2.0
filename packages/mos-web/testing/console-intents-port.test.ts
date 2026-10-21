import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';
import {
  declareConsoleIntentThroughPort,
  consoleIntentOutcomeHref,
} from '../dist/src/routes/console-intent-declaration.js';

/**
 * Console write-intent transport tests (the CONSOLE wave) over the
 * DISCLOSED testing double: the complete mission→evidence→plan→strategy→
 * run→approval chain executes against the double's real-shaped state
 * machine; the rights gate on intelligence recording fails closed with the
 * REAL product-intelligence code; the planner's citation discipline
 * mirrors the REAL codes; the arm gate mirrors the engine's verbatim
 * rejection names; ledger reads are tenant-scoped; the navigation outcome
 * targets the owning mode with the receipt marker.
 */

const NOW = '2026-10-22T12:00:00.000Z';

function freshComposition() {
  return createInMemoryMosWebComposition({ now: () => NOW });
}

function seedMission(composition: ReturnType<typeof freshComposition>): string {
  const created = composition.missionRepository.createMission({
    scope: { tenantId: 'tenant-demo' as never },
    id: 'mission-console-test' as never,
    objective: {
      statement: 'Grow qualified reach for the Ghana launch.',
      targetMetrics: [
        { metric: 'qualified-reach' as never, target: '10000', unit: 'count', horizon: null },
      ],
      constraints: [],
    } as never,
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: 'qualified-reach' as never,
          weight: 1,
          direction: 'maximize' as never,
          definition: 'Qualified reach among the launch cohort.',
        },
      ],
    } as never,
  });
  if ('error' in created) {
    throw new Error(`fixture mission seed failed: ${created.message}`);
  }
  return 'mission-console-test';
}

const PLATFORMS = JSON.stringify([
  { platform: 'mastodon', rationale: 'The launch cohort is active there.', evidence: [{ recordId: 'intel-1', version: 1 }] },
]);
const EXPECTATIONS = JSON.stringify([
  { metric: 'qualified-reach', expectation: '10000', unit: 'count', basis: { kind: 'cited-evidence' }, evidence: [{ recordId: 'intel-1', version: 1 }] },
]);
const EXPERIMENT_EXPECTATIONS = JSON.stringify([
  { question: 'Which platform wins the launch cohort?', successCriterion: 'Qualified reach > baseline at p < 0.05.', evidence: [{ recordId: 'intel-1', version: 1 }] },
]);

test('record-intelligence fails closed on the rights gate with the REAL authority code verbatim', async () => {
  const composition = freshComposition();
  const outcome = await declareConsoleIntentThroughPort(composition, {
    action: 'record-intelligence',
    recordId: 'intel-1',
    subjectJson: '{}',
    contentKindText: 'observation',
    contentJson: '{}',
    sourceJson: '{"sourceKind":"operator-declared"}',
    basisKindText: 'cited-evidence',
    citedCommerceObservationsJson: '[]',
    rightsRef: 'rights-ref-1',
    attributionText: '',
    noteText: '',
  });
  if (!('error' in outcome.record.outcome)) {
    assert.fail('recording intelligence without a rights grant must fail closed');
  }
  assert.equal(outcome.record.outcome.error, 'no-explicit-grant');
  assert.match(outcome.record.outcome.message, /fail-closed/);
  assert.equal(outcome.record.routedTo, 'product-intelligence-authority');
  assert.equal(outcome.record.action, 'record-intelligence');
});

test('the complete chain executes: grant → experiment → intelligence → plan → strategy → run → arm', async () => {
  const composition = freshComposition();
  const missionId = seedMission(composition);

  // 1. Grant analysis rights (the rights authority).
  const grant = await declareConsoleIntentThroughPort(composition, {
    action: 'grant-analysis-rights',
    grantId: 'grant-analyze-1',
    rightsHolderId: 'identity-operator',
    actionText: 'analyze',
    scopeJson: '{}',
    termsJson: '{}',
  });
  if ('error' in grant.record.outcome) {
    assert.fail(`grant should execute: ${grant.record.outcome.message}`);
  }
  assert.equal(grant.record.outcome.authorityEcho.recordId, 'grant-analyze-1');
  assert.equal(grant.record.routedTo, 'rights-authority');

  // 2. Create the REAL experiment.
  const experiment = await declareConsoleIntentThroughPort(composition, {
    action: 'create-experiment',
    experimentId: 'exp-001',
    questionText: 'Which platform wins the launch cohort?',
    successCriterionText: 'Qualified reach > baseline.',
    hypothesisJson: '{}',
    missionRefsText: missionId,
  });
  if ('error' in experiment.record.outcome) {
    assert.fail(`experiment should execute: ${experiment.record.outcome.message}`);
  }
  assert.equal(experiment.record.routedTo, 'experiments-authority');

  // 3. Record the intelligence the plan will cite (now the grant exists).
  const intelligence = await declareConsoleIntentThroughPort(composition, {
    action: 'record-intelligence',
    recordId: 'intel-1',
    subjectJson: '{}',
    contentKindText: 'observation',
    contentJson: '{}',
    sourceJson: '{"sourceKind":"operator-declared"}',
    basisKindText: 'cited-evidence',
    citedCommerceObservationsJson: '[]',
    rightsRef: 'grant-analyze-1',
    attributionText: '',
    noteText: '',
  });
  if ('error' in intelligence.record.outcome) {
    assert.fail(`intelligence should execute: ${intelligence.record.outcome.message}`);
  }
  assert.equal(intelligence.record.outcome.authorityEcho.recordId, 'intel-1');
  assert.equal(intelligence.record.outcome.authorityEcho.recordVersion, 1);

  // 4. Compose the plan (cites the recorded intelligence + experiment).
  const plan = await declareConsoleIntentThroughPort(composition, {
    action: 'compose-plan',
    planId: 'plan-ghana-1',
    missionId,
    objectiveAlignmentText: 'Serve the launch objective through evidence-linked platform choices.',
    platformsJson: PLATFORMS,
    metricExpectationsJson: EXPECTATIONS,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS,
    experimentRefsText: 'exp-001',
    noteText: '',
  });
  if ('error' in plan.record.outcome) {
    assert.fail(`plan should compose: ${plan.record.outcome.message}`);
  }
  assert.equal(plan.record.routedTo, 'marketing-planner-authority');
  assert.match(plan.record.outcome.authorityEcho.summary, /1 platforms, 1 metric expectations, 1 experiment refs/);

  // 5. Compile the strategy.
  const strategy = await declareConsoleIntentThroughPort(composition, {
    action: 'compile-strategy',
    planId: 'plan-ghana-1',
    planVersion: 0,
    principalText: 'identity-operator',
  });
  if ('error' in strategy.record.outcome) {
    assert.fail(`strategy should compile: ${strategy.record.outcome.message}`);
  }
  assert.equal(strategy.record.routedTo, 'strategy-compiler-authority');
  assert.match(strategy.record.outcome.authorityEcho.recordId, /^prod003-strategy:plan-ghana-1@v1$/);

  // 6. Create the run (lands 'compiled' — awaiting authorization).
  const run = await declareConsoleIntentThroughPort(composition, {
    action: 'create-run',
    strategyId: 'prod003-strategy:plan-ghana-1@v1',
  });
  if ('error' in run.record.outcome) {
    assert.fail(`run should create: ${run.record.outcome.message}`);
  }
  assert.equal(run.record.outcome.authorityEcho.lifecycleState, 'compiled');
  assert.match(run.record.outcome.authorityEcho.summary, /waits for authorization/);

  // 7. Arm the run (THE approval transition — the rights gate passes).
  const arm = await declareConsoleIntentThroughPort(composition, {
    action: 'arm-run',
    runId: 'run-plan-ghana-1-1',
    principalText: 'identity-operator',
  });
  if ('error' in arm.record.outcome) {
    assert.fail(`arm should execute: ${arm.record.outcome.message}`);
  }
  assert.equal(arm.record.outcome.authorityEcho.lifecycleState, 'armed');
  assert.match(arm.record.outcome.authorityEcho.summary, /waits on the job-execution transport/);

  // The read models carry what the authorities now hold.
  const direct = await composition.agentConsole.loadConsoleDirect(missionId, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  if ('error' in direct) {
    assert.fail('direct read should resolve');
  }
  assert.equal(direct.readiness.intelligenceRecords, 1);
  assert.equal(direct.readiness.rightsGrants, 1);
  assert.equal(direct.readiness.experiments, 1);
  assert.equal(direct.readiness.plans, 1);
  assert.equal(direct.standings.runsArmed, 1);
  assert.equal(direct.standings.runsAwaitingAuthorization, 0);

  const control = await composition.agentConsole.loadConsoleControl(missionId, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  if ('error' in control) {
    assert.fail('control read should resolve');
  }
  assert.equal(control.awaitingAuthorization.length, 0);
  assert.equal(control.authorized.length, 1);
  assert.equal(control.authorized[0]?.experimentId, 'exp-001');
  assert.equal(control.rightsGrants.length, 1);

  const results = await composition.agentConsole.loadConsoleResults(missionId, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  if ('error' in results) {
    assert.fail('results read should resolve');
  }
  assert.equal(results.runs.length, 1);
  assert.equal(results.runs[0]?.lifecycle, 'armed');
  assert.equal(results.runs[0]?.waitingOn, 'job-execution-transport');
  assert.equal(results.runs[0]?.trail.length, 2);
  assert.equal(results.artifacts.length, 2);
});

test('compose-plan mirrors the REAL planner codes: unknown mission and unresolvable citations', async () => {
  const composition = freshComposition();
  seedMission(composition);

  const unknownMission = await declareConsoleIntentThroughPort(composition, {
    action: 'compose-plan',
    planId: 'plan-x',
    missionId: 'mission-does-not-exist',
    objectiveAlignmentText: 'alignment',
    platformsJson: PLATFORMS,
    metricExpectationsJson: EXPECTATIONS,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS,
    experimentRefsText: 'exp-001',
    noteText: '',
  });
  if (!('error' in unknownMission.record.outcome)) {
    assert.fail('unknown mission must reject');
  }
  assert.equal(unknownMission.record.outcome.error, 'mission-citation-unresolvable');

  // With a real mission but NO recorded intelligence, the citations cannot
  // resolve — the planner's evidence discipline, verbatim.
  const noEvidence = await declareConsoleIntentThroughPort(composition, {
    action: 'compose-plan',
    planId: 'plan-x',
    missionId: 'mission-console-test',
    objectiveAlignmentText: 'alignment',
    platformsJson: PLATFORMS,
    metricExpectationsJson: EXPECTATIONS,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS,
    experimentRefsText: 'exp-001',
    noteText: '',
  });
  if (!('error' in noEvidence.record.outcome)) {
    assert.fail('unresolvable citations must reject');
  }
  assert.equal(noEvidence.record.outcome.error, 'evidence-citation-unresolvable');
});

test('arm mirrors the REAL engine rejection names verbatim (rights denial + illegal transition)', async () => {
  const composition = freshComposition();
  const missionId = seedMission(composition);

  // No grant at all → the engine's ARM_RIGHTS_DENIED name.
  await declareConsoleIntentThroughPort(composition, {
    action: 'grant-analysis-rights',
    grantId: 'grant-analyze-1',
    rightsHolderId: 'identity-operator',
    actionText: 'analyze',
    scopeJson: '{}',
    termsJson: '{}',
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'create-experiment',
    experimentId: 'exp-001',
    questionText: 'Q?',
    successCriterionText: 'C.',
    hypothesisJson: '{}',
    missionRefsText: missionId,
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'record-intelligence',
    recordId: 'intel-1',
    subjectJson: '{}',
    contentKindText: 'observation',
    contentJson: '{}',
    sourceJson: '{"sourceKind":"operator-declared"}',
    basisKindText: 'cited-evidence',
    citedCommerceObservationsJson: '[]',
    rightsRef: 'grant-analyze-1',
    attributionText: '',
    noteText: '',
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'compose-plan',
    planId: 'plan-1',
    missionId,
    objectiveAlignmentText: 'alignment',
    platformsJson: PLATFORMS,
    metricExpectationsJson: EXPECTATIONS,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS,
    experimentRefsText: 'exp-001',
    noteText: '',
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'compile-strategy',
    planId: 'plan-1',
    planVersion: 0,
    principalText: 'identity-operator',
  });
  await declareConsoleIntentThroughPort(composition, {
    action: 'create-run',
    strategyId: 'prod003-strategy:plan-1@v1',
  });

  // Arming an UNKNOWN run: typed rejection.
  const unknownRun = await declareConsoleIntentThroughPort(composition, {
    action: 'arm-run',
    runId: 'run-does-not-exist',
    principalText: 'identity-operator',
  });
  if (!('error' in unknownRun.record.outcome)) {
    assert.fail('unknown run must reject');
  }

  // Arm once (executes — the grant exists), then arm again: the engine's
  // ILLEGAL_TRANSITION name and message template, verbatim.
  await declareConsoleIntentThroughPort(composition, {
    action: 'arm-run',
    runId: 'run-plan-1-1',
    principalText: 'identity-operator',
  });
  const secondArm = await declareConsoleIntentThroughPort(composition, {
    action: 'arm-run',
    runId: 'run-plan-1-1',
    principalText: 'identity-operator',
  });
  if (!('error' in secondArm.record.outcome)) {
    assert.fail('re-arming an armed run must reject');
  }
  assert.equal(secondArm.record.outcome.error, 'ILLEGAL_TRANSITION');
  assert.match(
    secondArm.record.outcome.message,
    /illegal lifecycle transition armed → armed: arm\(\) is only legal from the compiled state/,
  );
});

test('declared-JSON parse failures carry the named shell-side code', async () => {
  const composition = freshComposition();
  const missionId = seedMission(composition);
  await declareConsoleIntentThroughPort(composition, {
    action: 'grant-analysis-rights',
    grantId: 'grant-analyze-1',
    rightsHolderId: 'identity-operator',
    actionText: 'analyze',
    scopeJson: '{}',
    termsJson: '{}',
  });
  const outcome = await declareConsoleIntentThroughPort(composition, {
    action: 'compose-plan',
    planId: 'plan-bad',
    missionId,
    objectiveAlignmentText: 'alignment',
    platformsJson: '{not json',
    metricExpectationsJson: EXPECTATIONS,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS,
    experimentRefsText: 'exp-001',
    noteText: '',
  });
  if (!('error' in outcome.record.outcome)) {
    assert.fail('malformed declared JSON must fail with the named code');
  }
  assert.equal(outcome.record.outcome.error, 'console-intent-json-invalid:platformsJson');
});

test('ledger reads are tenant-scoped and the outcome href targets the owning mode', async () => {
  const composition = freshComposition();
  const missionId = seedMission(composition);
  const grant = await declareConsoleIntentThroughPort(composition, {
    action: 'grant-analysis-rights',
    grantId: 'grant-analyze-1',
    rightsHolderId: 'identity-operator',
    actionText: 'analyze',
    scopeJson: '{}',
    termsJson: '{}',
  });
  const intentId = grant.record.intentId;

  const visible = await composition.consoleIntents.loadConsoleIntentLedgerRecord(intentId, {
    tenantId: 'tenant-demo' as never,
    workspaceId: 'ws_demo' as never,
  });
  assert.ok(visible !== null, 'the declaring scope reads its own ledger record');

  const crossTenant = await composition.consoleIntents.loadConsoleIntentLedgerRecord(intentId, {
    tenantId: 'tenant-other' as never,
  });
  assert.equal(crossTenant, null, 'another tenant resolves null — no existence leak');

  // The outcome href carries the owning mode + the mission context.
  const href = consoleIntentOutcomeHref({ record: grant.record }, missionId);
  assert.equal(href, `/console?mission=${missionId}&mode=control&receipt=${encodeURIComponent(intentId)}`);

  const armHref = consoleIntentOutcomeHref(
    {
      record: {
        intentId: 'console-intent-0009',
        action: 'arm-run',
        declaredAt: NOW,
        routedTo: 'automation-engine-authority',
        outcome: {
          intentId: 'console-intent-0009',
          action: 'arm-run',
          declaredAt: NOW,
          routedTo: 'automation-engine-authority',
          authorityEcho: { recordId: 'run-1', recordVersion: 2, lifecycleState: 'armed', summary: 'armed' },
        },
      },
    },
    null,
  );
  assert.equal(armHref, '/console?mode=control&receipt=console-intent-0009');
});
