/**
 * PRODUCTION Agent Console binding tests (the CONSOLE wave) — the
 * node-side battery over the REAL composition root:
 *
 *  - the complete seven-step chain EXECUTES against the REAL authority
 *    runtimes (grant → experiment → intelligence → plan → strategy →
 *    run → arm) with receipts echoing REAL records;
 *  - record-intelligence WITHOUT a grant FAILS CLOSED with the REAL §25
 *    authority's `no-explicit-grant` code VERBATIM;
 *  - compose-plan with unresolvable citations fails with the REAL
 *    planner's `evidence-citation-unresolvable` code VERBATIM;
 *  - compile-strategy over an unknown plan rejects with the honest
 *    not-found verdict;
 *  - arm rejections relay the REAL engine's verbatim names
 *    (ILLEGAL_TRANSITION on re-arming; a missing experiment binding);
 *  - the read models project the REAL state after the chain (the armed
 *    run in Control, the trail in Results, the artifacts in Plan);
 *  - tenant isolation: another scope's ledger read resolves to `null`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TenantScope } from '@mos/contracts';
import type { ConsoleIntentFailure, ConsoleIntentReceipt, ConsoleIntentResult } from '@mos/web';
import type {
  EnsembleMember,
  SocialWorldModelDraft,
  WorldModelEnsembleDraft,
} from '@mos/lab';
import { createProductionMosWebComposition } from '../out/compose-production-mos-web.js';

const NOW = () => '2026-10-22T12:00:00.000Z';

function scopeOf(tenantId: string): TenantScope {
  return { tenantId: tenantId as never };
}

const asReceipt = (result: ConsoleIntentResult): ConsoleIntentReceipt => {
  assert.ok(!('error' in result), `expected a receipt, got: ${JSON.stringify(result)}`);
  return result;
};

const asFailure = (result: ConsoleIntentResult): ConsoleIntentFailure => {
  assert.ok('error' in result, `expected a failure, got: ${JSON.stringify(result)}`);
  return result;
};

/** Seed one ACTIVE mission through the REAL repository. */
function seedActiveMission(
  composition: ReturnType<typeof createProductionMosWebComposition>,
  missionId: string,
): string {
  const created = composition.missionRepository.createMission({
    scope: { tenantId: 'tenant-local' as never },
    id: missionId as never,
    objective: {
      statement: `Grow qualified reach for ${missionId}.`,
      targetMetrics: [
        { metric: 'qualified-reach' as never, target: '10000', unit: 'count', horizon: null },
      ],
      constraints: [
        { kind: 'budget', description: 'USD 1000' } as never,
      ],
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
  const activated = composition.missionRepository.activateMission(
    { tenantId: 'tenant-local' as never },
    missionId as never,
  );
  if ('error' in activated) {
    throw new Error(`fixture mission activation failed: ${activated.message}`);
  }
  return missionId;
}

const SCOPE = scopeOf('tenant-local');
const MISSION_ID = 'mission-console-prod';
const NICHE = 'device-local-research';
const PLATFORM = 'short-video';

const FULL_COVERAGE = {
  cadencePerWeek: { min: 0, max: 14 },
  novelty: { min: 0, max: 1 },
  engagementEffort: { min: 0, max: 1 },
};

const LAB_SCENARIO_JSON = JSON.stringify({
  id: 'scenario-console-v1',
  version: 1,
  niche: NICHE,
  platform: PLATFORM,
  objective: 'qualified-reach',
  context: { campaignShape: 'weekly-educational-clip' },
  budget: { maxCost: { amount: 500, currency: 'USD' }, maxDurationMs: 1_209_600_000 },
  informationLag: 0,
  corpusVersion: 1,
  simulatorVersion: 1,
  rewardVersion: 1,
});

const LAB_REWARD_JSON = JSON.stringify({
  version: 1,
  terms: [
    {
      metric: 'qualified-reach',
      weight: 1,
      direction: 'maximize',
      definition: 'qualified reach predicted by the ensemble (people per step)',
      metricSource: 'qualified-reach',
    },
  ],
});

const LAB_POLICY_JSON = JSON.stringify({
  id: 'policy-console-robust-reach',
  version: 1,
  seedBudget: 2,
  worldModelSet: [{ ensembleId: 'ensemble-console-1', ensembleVersion: 1, label: 'primary' }],
  sweepDimensions: ['seed'],
  aggregation: 'pooled-mean',
  tieBreak: 'expected-desc-halfwidth-asc-key-asc',
  note: 'declared policy for the console binding battery',
});

const BENCHMARK_CANDIDATES_JSON = JSON.stringify([
  {
    key: 'candidate-mastodon-weekly',
    action: {
      strategyRef: 'strategy:console-mastodon-weekly',
      kind: 'content',
      cadencePerWeek: 5,
      novelty: 0.7,
      engagementEffort: 0.6,
    },
    horizonSteps: 4,
    source: {
      origin: 'hand-designed',
      producerPins: [],
      note: 'the console battery declared candidate (Mastodon weekly educational clip)',
    },
    label: 'Mastodon weekly educational clip',
  },
]);

/** Register the REAL lab world models + ensemble + benchmark chain the experiment cites. */
async function seedConsoleLabBenchmark(
  composition: ReturnType<typeof createProductionMosWebComposition>,
): Promise<void> {
  const scope = scopeOf(composition.scope.tenantId);
  const drafts: readonly SocialWorldModelDraft[] = [
    {
      id: 'world-console-a' as never,
      niche: NICHE,
      platform: PLATFORM,
      state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'console benchmark member A',
    },
    {
      id: 'world-console-b' as never,
      niche: NICHE,
      platform: PLATFORM,
      state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'console benchmark member B',
    },
  ];
  for (const worldModel of drafts) {
    const registered = await composition.labRuntime.worldModels.registerWorldModel({
      scope,
      worldModel,
    });
    assert.ok(!('error' in registered), `world model registration failed: ${JSON.stringify(registered)}`);
  }
  const members: readonly EnsembleMember[] = [
    { id: 'member-a', worldModelId: 'world-console-a' as never, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
    { id: 'member-b', worldModelId: 'world-console-b' as never, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
  ];
  const ensembleDraft: WorldModelEnsembleDraft = {
    id: 'ensemble-console-1' as never,
    niche: NICHE,
    platform: PLATFORM,
    members,
    weightingPolicy: {
      id: 'policy-console-uniform',
      version: 1,
      kind: 'uniform',
      note: 'uniform member weights — the console binding battery',
    },
    notes: 'registered for the console binding battery',
  };
  const ensemble = await composition.labRuntime.ensemble.registerEnsemble({
    scope,
    ensemble: ensembleDraft,
  });
  assert.ok(!('error' in ensemble), `ensemble registration failed: ${JSON.stringify(ensemble)}`);

  const benchmark = await composition.labIntents.declareRunBenchmark({
    action: 'run-benchmark',
    benchmarkId: 'bench-console-1',
    seedsText: '11,22',
    scenarioJson: LAB_SCENARIO_JSON,
    candidatesJson: BENCHMARK_CANDIDATES_JSON,
    rewardSpecJson: LAB_REWARD_JSON,
    policyJson: LAB_POLICY_JSON,
  });
  assert.ok(!('error' in benchmark), `benchmark run failed: ${JSON.stringify(benchmark)}`);
  assert.equal(benchmark.authorityEcho.recordId, 'bench-console-1');
}

// The declared fixtures (the DECLARED-JSON texts the intents carry).
const PLATFORMS_JSON = JSON.stringify([
  {
    platform: 'mastodon',
    rationale: 'The launch cohort is active there.',
    evidence: [{ recordId: 'intel-console-1', version: 1 }],
    role: 'primary',
    channels: ['organic-post'],
    declaredProductionDays: 7,
    declaredCostPerAction: 0.5,
  },
]);
const METRICS_JSON = JSON.stringify([
  {
    metric: 'qualified-reach',
    expectation: '10000',
    unit: 'count',
    basis: { basis: 'cited-evidence', counterfactual: false, observedAt: '2026-10-20T00:00:00.000Z' },
    evidence: [{ recordId: 'intel-console-1', version: 1 }],
    platformId: 'mastodon',
    window: { opensAt: '2026-10-23T00:00:00.000Z', closesAt: '2026-11-06T00:00:00.000Z' },
  },
]);
const EXPERIMENT_EXPECTATIONS_JSON = JSON.stringify([
  {
    question: 'Which platform wins the launch cohort?',
    successCriterion: 'Qualified reach above the counterfactual baseline.',
    evidence: [{ recordId: 'intel-console-1', version: 1 }],
  },
]);

/** Runs the evidence+plan+strategy+run+arm tail of the chain (assumes the grant + experiment + intelligence exist). */
async function declareTail(
  composition: ReturnType<typeof createProductionMosWebComposition>,
  planId: string,
): Promise<{ readonly strategyId: string; readonly runId: string }> {
  const plan = await composition.consoleIntents.declareComposePlan({
    action: 'compose-plan',
    planId,
    missionId: MISSION_ID,
    objectiveAlignmentText: 'Serve the launch objective through evidence-linked platform choices.',
    platformsJson: PLATFORMS_JSON,
    metricExpectationsJson: METRICS_JSON,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS_JSON,
    experimentRefsText: 'exp-console-1',
    noteText: '',
  });
  const planReceipt = asReceipt(plan);
  assert.equal(planReceipt.authorityEcho.recordId, planId);

  const compile = await composition.consoleIntents.declareCompileStrategy({
    action: 'compile-strategy',
    planId,
    planVersion: 0,
    principalText: 'principal-console',
  });
  const compileReceipt = asReceipt(compile);
  const strategyId = compileReceipt.authorityEcho.recordId;
  assert.match(strategyId, /^prod003-strategy:/);

  const run = await composition.consoleIntents.declareCreateRun({
    action: 'create-run',
    strategyId,
  });
  const runReceipt = asReceipt(run);
  const runId = runReceipt.authorityEcho.recordId;
  assert.equal(runReceipt.authorityEcho.lifecycleState, 'compiled');

  const arm = await composition.consoleIntents.declareArmRun({
    action: 'arm-run',
    runId,
    principalText: 'principal-console',
  });
  const armReceipt = asReceipt(arm);
  assert.equal(armReceipt.authorityEcho.lifecycleState, 'armed');
  return { strategyId, runId };
}

test('record-intelligence without a grant fails closed with the REAL §25 code verbatim', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  seedActiveMission(composition, MISSION_ID);
  const result = await composition.consoleIntents.declareRecordIntelligence({
    action: 'record-intelligence',
    recordId: 'intel-console-1',
    subjectJson: JSON.stringify('subject-launch-cohort'),
    contentKindText: 'observation',
    contentJson: JSON.stringify({
      narrative: 'The launch cohort discusses payment education weekly.',
      evidenceRefs: ['evidence-cohort-discussion'],
      basis: { observedAt: '2026-10-20T00:00:00.000Z' },
    }),
    sourceJson: JSON.stringify({ sourceKind: 'human-report', sourceRefs: ['operator-declaration'] }),
    basisKindText: 'cited-evidence',
    citedCommerceObservationsJson: '[]',
    rightsRef: 'grant-analyze-console',
    attributionText: '',
    noteText: '',
  });
  const failure = asFailure(result);
  assert.equal(failure.error, 'no-explicit-grant');
  assert.equal(failure.routedTo, 'product-intelligence-authority');
});

test('compose-plan with unresolvable citations fails with the REAL planner code verbatim', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  seedActiveMission(composition, MISSION_ID);
  const result = await composition.consoleIntents.declareComposePlan({
    action: 'compose-plan',
    planId: 'plan-unresolvable',
    missionId: MISSION_ID,
    objectiveAlignmentText: 'alignment',
    platformsJson: PLATFORMS_JSON,
    metricExpectationsJson: METRICS_JSON,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS_JSON,
    experimentRefsText: 'exp-console-1',
    noteText: '',
  });
  const failure = asFailure(result);
  assert.equal(failure.error, 'evidence-citation-unresolvable');
  assert.equal(failure.routedTo, 'marketing-planner-authority');
});

test('compile-strategy over an unknown plan rejects honestly', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const result = await composition.consoleIntents.declareCompileStrategy({
    action: 'compile-strategy',
    planId: 'plan-does-not-exist',
    planVersion: 0,
    principalText: 'principal-console',
  });
  const failure = asFailure(result);
  assert.equal(failure.error, 'marketing-plan-not-found');
});

test('the complete chain executes against the REAL runtimes and the read models project it', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  seedActiveMission(composition, MISSION_ID);
  await seedConsoleLabBenchmark(composition);

  // 1. Grant analysis rights — the REAL rights repository.
  const grant = asReceipt(
    await composition.consoleIntents.declareGrantAnalysisRights({
      action: 'grant-analysis-rights',
      grantId: 'grant-analyze-console',
      rightsHolderId: 'principal-console',
      actionText: 'analyze',
      scopeJson: JSON.stringify({ subjectRefs: ['subject-launch-cohort', 'evidence-cohort-discussion', 'operator-declaration'], sourceRefs: ['operator-declaration'] }),
      termsJson: JSON.stringify({ attributionRequired: false, commercialUse: false, redistribution: false }),
    }),
  );
  assert.equal(grant.routedTo, 'rights-authority');
  assert.equal(grant.authorityEcho.recordId, 'grant-analyze-console');

  // 2. Record the intelligence — the REAL §25 authority (gate passes now).
  const intelligence = asReceipt(
    await composition.consoleIntents.declareRecordIntelligence({
      action: 'record-intelligence',
      recordId: 'intel-console-1',
      subjectJson: JSON.stringify('subject-launch-cohort'),
      contentKindText: 'observation',
      contentJson: JSON.stringify({
        narrative: 'The launch cohort discusses payment education weekly.',
        evidenceRefs: ['evidence-cohort-discussion'],
        basis: { observedAt: '2026-10-20T00:00:00.000Z' },
      }),
      sourceJson: JSON.stringify({ sourceKind: 'human-report', sourceRefs: ['operator-declaration'] }),
      basisKindText: 'cited-evidence',
      citedCommerceObservationsJson: '[]',
      rightsRef: 'grant-analyze-console',
      attributionText: '',
      noteText: '',
    }),
  );
  assert.equal(intelligence.routedTo, 'product-intelligence-authority');
  assert.equal(intelligence.authorityEcho.recordVersion, 1);

  // 3. Create the experiment — the REAL BRIDGE-003 authority (needs the lab
  //    benchmark candidate + declared publication + mission linkage).
  const experimentResult = await composition.consoleIntents.declareCreateExperiment({
    action: 'create-experiment',
    experimentId: 'exp-console-1',
    questionText: 'Which platform wins the launch cohort?',
    successCriterionText: 'Qualified reach above the counterfactual baseline.',
    hypothesisJson: JSON.stringify({
      labCandidate: {
        benchmarkId: 'bench-console-1',
        benchmarkVersion: 1,
        candidateKey: 'candidate-mastodon-weekly',
      },
      policy: [{ id: 'policy:console-experiment-launch', version: 1 }],
      rightsFrame: { rightsRefs: ['grant-analyze-console'], consentRefs: [] },
      production: {
        searchResult: {
          id: 'search-console-1',
          ranked: [
            {
              rank: 1,
              candidate: {
                isNoopBaseline: false,
                label: 'Mastodon weekly educational clip',
                transformChain: [{ definitionId: 'transform:console-weekly-clip', definitionVersion: 1 }],
              },
              request: {
                id: 'request-console-1',
                version: 1,
                scope: { tenantId: 'tenant-local' },
              },
            },
          ],
        },
        selectedRank: 1,
      },
      distribution: {
        publicationId: 'pub-console-1',
        expectedArtifact: { artifactId: 'artifact-console-1', version: 1 },
      },
      measurement: {
        windowStart: '2026-10-23T00:00:00.000Z',
        windowEnd: '2026-11-06T00:00:00.000Z',
        niche: 'device-local-research',
        regime: 'baseline',
      },
    }),
    missionRefsText: MISSION_ID,
  });
  const experiment = asReceipt(experimentResult);
  assert.equal(experiment.routedTo, 'experiments-authority');
  assert.equal(experiment.authorityEcho.recordId, 'exp-console-1');

  // 4–7. The tail: plan → strategy → run → arm.
  const { strategyId, runId } = await declareTail(composition, 'plan-console-1');

  // The READ MODELS project the REAL state.
  const control = await composition.agentConsole.loadConsoleControl(MISSION_ID, SCOPE);
  assert.ok(!('error' in control));
  assert.equal(control.awaitingAuthorization.length, 0);
  assert.equal(control.authorized.length, 1);
  assert.equal(control.authorized[0]?.runId, runId);
  assert.equal(control.authorized[0]?.experimentId, 'exp-console-1');
  assert.ok(control.rightsGrants.some((g) => g.grantId === 'grant-analyze-console' && g.action.includes('analyze')));

  const results = await composition.agentConsole.loadConsoleResults(MISSION_ID, SCOPE);
  assert.ok(!('error' in results));
  assert.equal(results.runs.length, 1);
  assert.equal(results.runs[0]?.lifecycle, 'armed');
  assert.equal(results.runs[0]?.waitingOn, 'job-execution-transport');
  assert.ok(results.runs[0] !== undefined && results.runs[0].trail.some((e) => e.kind === 'armed'));
  assert.ok(results.artifacts.some((a) => a.id === 'plan-console-1' && a.kind === 'marketing-plan'));
  assert.ok(results.artifacts.some((a) => a.id === strategyId && a.kind === 'compiled-strategy'));

  const planView = await composition.agentConsole.loadConsolePlan(MISSION_ID, SCOPE);
  assert.ok(!('error' in planView));
  assert.equal(planView.planChains.length, 1);
  assert.equal(planView.planChains[0]?.boundaryStatement?.includes('MARKETING-001'), true);
  assert.equal(planView.strategies.length, 1);
  assert.ok(planView.strategies[0] !== undefined);
  assert.equal(planView.strategies[0].organization.roles.length > 0, true);
  assert.equal(planView.strategies[0].organization.phases.length > 0, true);
  assert.match(planView.strategies[0].organizationValidation.authorityRecord, /^agents-registry:/);

  const direct = await composition.agentConsole.loadConsoleDirect(MISSION_ID, SCOPE);
  assert.ok(!('error' in direct));
  assert.equal(direct.readiness.intelligenceRecords, 1);
  assert.equal(direct.readiness.rightsGrants, 1);
  assert.equal(direct.readiness.plans, 1);
  assert.equal(direct.standings.runsArmed, 1);

  const research = await composition.agentConsole.loadConsoleResearch(MISSION_ID, SCOPE);
  assert.ok(!('error' in research));
  assert.equal(research.intelligenceRecords.length, 1);
  assert.equal(research.experiments.length, 1);
  assert.ok(research.labLinks.length >= 5);

  const agents = await composition.agentConsole.loadConsoleAgents(SCOPE);
  assert.ok(!('error' in agents));
  assert.equal(agents.agentBodies.length, 5);
  assert.ok(agents.bodiesNote !== null);
});

test('re-arming an armed run relays the REAL engine rejection verbatim', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  seedActiveMission(composition, MISSION_ID);
  await seedConsoleLabBenchmark(composition);
  asReceipt(
    await composition.consoleIntents.declareGrantAnalysisRights({
      action: 'grant-analysis-rights',
      grantId: 'grant-analyze-console',
      rightsHolderId: 'principal-console',
      actionText: 'analyze',
      scopeJson: JSON.stringify({ subjectRefs: ['subject-launch-cohort', 'evidence-cohort-discussion', 'operator-declaration'], sourceRefs: ['operator-declaration'] }),
      termsJson: JSON.stringify({ attributionRequired: false, commercialUse: false, redistribution: false }),
    }),
  );
  asReceipt(
    await composition.consoleIntents.declareRecordIntelligence({
      action: 'record-intelligence',
      recordId: 'intel-console-1',
      subjectJson: JSON.stringify('subject-launch-cohort'),
      contentKindText: 'observation',
      contentJson: JSON.stringify({
        narrative: 'The launch cohort discusses payment education weekly.',
        evidenceRefs: ['evidence-cohort-discussion'],
        basis: { observedAt: '2026-10-20T00:00:00.000Z' },
      }),
      sourceJson: JSON.stringify({ sourceKind: 'human-report', sourceRefs: ['operator-declaration'] }),
      basisKindText: 'cited-evidence',
      citedCommerceObservationsJson: '[]',
      rightsRef: 'grant-analyze-console',
      attributionText: '',
      noteText: '',
    }),
  );
  asReceipt(
    await composition.consoleIntents.declareCreateExperiment({
      action: 'create-experiment',
      experimentId: 'exp-console-1',
      questionText: 'Q?',
      successCriterionText: 'C.',
      hypothesisJson: JSON.stringify({
        labCandidate: { benchmarkId: 'bench-console-1', benchmarkVersion: 1, candidateKey: 'candidate-mastodon-weekly' },
        policy: [{ id: 'policy:console-experiment-launch', version: 1 }],
        rightsFrame: { rightsRefs: ['grant-analyze-console'], consentRefs: [] },
        production: {
        searchResult: {
          id: 'search-console-1',
          ranked: [
            {
              rank: 1,
              candidate: {
                isNoopBaseline: false,
                label: 'Mastodon weekly educational clip',
                transformChain: [{ definitionId: 'transform:console-weekly-clip', definitionVersion: 1 }],
              },
              request: {
                id: 'request-console-1',
                version: 1,
                scope: { tenantId: 'tenant-local' },
              },
            },
          ],
        },
        selectedRank: 1,
      },
        distribution: { publicationId: 'pub-console-1', expectedArtifact: { artifactId: 'artifact-console-1', version: 1 } },
        measurement: { windowStart: '2026-10-23T00:00:00.000Z', windowEnd: '2026-11-06T00:00:00.000Z', niche: 'device-local-research', regime: 'baseline' },
      }),
      missionRefsText: MISSION_ID,
    }),
  );
  const { runId } = await declareTail(composition, 'plan-console-2');
  const secondArm = await composition.consoleIntents.declareArmRun({
    action: 'arm-run',
    runId,
    principalText: 'principal-console',
  });
  const failure = asFailure(secondArm);
  assert.equal(failure.error, 'ILLEGAL_TRANSITION');
  assert.match(failure.message, /illegal lifecycle transition armed → armed/);
});

test('ledger reads are tenant-scoped (cross-tenant ids resolve to null)', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const grant = asReceipt(
    await composition.consoleIntents.declareGrantAnalysisRights({
      action: 'grant-analysis-rights',
      grantId: 'grant-analyze-console',
      rightsHolderId: 'principal-console',
      actionText: 'analyze',
      scopeJson: JSON.stringify({ subjectRefs: ['s'], sourceRefs: ['o'] }),
      termsJson: JSON.stringify({ attributionRequired: false, commercialUse: false, redistribution: false }),
    }),
  );
  const visible = await composition.consoleIntents.loadConsoleIntentLedgerRecord(
    grant.intentId,
    SCOPE,
  );
  assert.ok(visible !== null);
  const crossTenant = await composition.consoleIntents.loadConsoleIntentLedgerRecord(
    grant.intentId,
    scopeOf('tenant-other'),
  );
  assert.equal(crossTenant, null);
});

test('declared-JSON parse failures carry the named shell-side code', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  seedActiveMission(composition, MISSION_ID);
  const result = await composition.consoleIntents.declareComposePlan({
    action: 'compose-plan',
    planId: 'plan-bad',
    missionId: MISSION_ID,
    objectiveAlignmentText: 'alignment',
    platformsJson: '{not json',
    metricExpectationsJson: METRICS_JSON,
    experimentExpectationsJson: EXPERIMENT_EXPECTATIONS_JSON,
    experimentRefsText: 'exp-console-1',
    noteText: '',
  });
  const failure = asFailure(result);
  assert.equal(failure.error, 'console-intent-json-invalid:platformsJson');
});
