/**
 * PRODUCTION lab-intents binding tests (UX-003 wave 3, second half) — the
 * node-side battery over the REAL composition root:
 *
 *  - a fresh composition starts with a ZERO-record lab-intent ledger;
 *  - registerWorldModel EXECUTES against the REAL LAB-004 store (receipt
 *    with recordVersion 1) and the world model then appears in the
 *    labSimulator READ MODEL (the section port the shell presents);
 *  - simulateStep over the registered world model EXECUTES (seed + step
 *    echoed in the receipt, counterfactual discipline visible);
 *  - ingest WITHOUT a rights grant FAILS CLOSED with the corpus
 *    authority's rights verdict VERBATIM (`no-explicit-grant`);
 *  - runBenchmark with an EMPTY declared candidate set EXECUTES (the
 *    no-op baseline runs — the receipt summary says so) and the benchmark
 *    read model lists the frozen record;
 *  - recordCalibrationError against that frozen benchmark record EXECUTES
 *    (the runBenchmark → recordCalibrationError chain, over one reality
 *    observation seeded through the disclosed in-memory reader's own
 *    registration path);
 *  - searchOrganizations with no ensemble registered rejects with the
 *    authority's `unknown-ensemble` code VERBATIM;
 *  - tenant isolation: another scope's ledger read resolves to `null`;
 *  - declared-JSON parse failures are the named
 *    `lab-intent-json-invalid:<field>` codes, pinned against @mos/web's
 *    REAL exported constants (the seam redeclares the literals — a drift
 *    in the web package fails here instead of shipping);
 *  - the corpus snapshot declaration honestly reports the underivable
 *    corpus id as `lab-intent-missing-input` (never a fabricated
 *    namespace).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TenantScope } from '@mos/contracts';
import type { LabIntentFailure, LabIntentReceipt, LabIntentResult } from '@mos/web';
import type {
  EnsembleMember,
  HistoricalObservationDraft,
  SocialWorldModelDraft,
  WorldModelEnsembleDraft,
} from '@mos/lab';
import {
  LAB_INTENT_JSON_INVALID_PREFIX,
  LAB_INTENT_MISSING_INPUT,
} from '../../mos-web/dist/src/ports/lab-intents.js';
import { createProductionMosWebComposition } from '../out/compose-production-mos-web.js';

const NOW = () => '2026-10-17T00:00:00.000Z';

function scopeOf(tenantId: string): TenantScope {
  return { tenantId: tenantId as never };
}

const asReceipt = (result: LabIntentResult): LabIntentReceipt => {
  assert.ok(!('error' in result), `expected a receipt, got: ${JSON.stringify(result)}`);
  return result;
};

const asFailure = (result: LabIntentResult): LabIntentFailure => {
  assert.ok('error' in result, `expected a failure, got: ${JSON.stringify(result)}`);
  return result;
};

// ---------------------------------------------------------------------------
// The declared fixtures (the DECLARED-JSON texts the intents carry)
// ---------------------------------------------------------------------------

const NICHE = 'device-local-research';
const PLATFORM = 'short-video';

const SCENARIO_JSON = JSON.stringify({
  id: 'scenario-intent-v1',
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

const REWARD_SPEC_JSON = JSON.stringify({
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

const WORLD_STATE_JSON = JSON.stringify({
  baseAudience: 12_000,
  fatigue: 0.1,
  competitorShare: 0.25,
  seasonalFactor: 1.1,
});

const CANDIDATE_JSON = JSON.stringify({
  strategyRef: 'strategy:intent-alpha',
  kind: 'content',
  cadencePerWeek: 5,
  novelty: 0.7,
  engagementEffort: 0.6,
});

const BENCH_POLICY_JSON = JSON.stringify({
  id: 'policy-intent-robust-reach',
  version: 1,
  seedBudget: 2,
  worldModelSet: [{ ensembleId: 'ensemble-intent-v1', ensembleVersion: 1, label: 'primary' }],
  sweepDimensions: ['seed'],
  aggregation: 'pooled-mean',
  tieBreak: 'expected-desc-halfwidth-asc-key-asc',
  note: 'declared policy for the intent-transport battery: 2-seed sweep over one ensemble',
});

const FULL_COVERAGE = {
  cadencePerWeek: { min: 0, max: 14 },
  novelty: { min: 0, max: 1 },
  engagementEffort: { min: 0, max: 1 },
};

/**
 * Authority-side setup: register two REAL world models + one REAL two-member
 * ensemble into the composition's benchmark stack (the disclosed
 * labRuntime observability) — the same registration paths the @mos/lab
 * battery drives; nothing here is a fixture record, every write goes
 * through the REAL runtime methods.
 */
async function registerBenchmarkEnsemble(
  composition: ReturnType<typeof createProductionMosWebComposition>,
): Promise<void> {
  const scope = scopeOf(composition.scope.tenantId);
  const drafts: readonly SocialWorldModelDraft[] = [
    {
      id: 'world-bench-a' as never,
      niche: NICHE,
      platform: PLATFORM,
      state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'benchmark member A (registered through the composition authority transport)',
    },
    {
      id: 'world-bench-b' as never,
      niche: NICHE,
      platform: PLATFORM,
      state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'benchmark member B (registered through the composition authority transport)',
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
    { id: 'member-a', worldModelId: 'world-bench-a' as never, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
    { id: 'member-b', worldModelId: 'world-bench-b' as never, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
  ];
  const ensembleDraft: WorldModelEnsembleDraft = {
    id: 'ensemble-intent-v1' as never,
    niche: NICHE,
    platform: PLATFORM,
    members,
    weightingPolicy: {
      id: 'policy-intent-uniform',
      version: 1,
      kind: 'uniform',
      note: 'uniform member weights — an explicit declared choice for the intent battery',
    },
    notes: 'registered through the composition authority transport for the intent battery',
  };
  const ensemble = await composition.labRuntime.ensemble.registerEnsemble({
    scope,
    ensemble: ensembleDraft,
  });
  assert.ok(!('error' in ensemble), `ensemble registration failed: ${JSON.stringify(ensemble)}`);
}

/**
 * Reality-side setup: seed ONE historical observation through the disclosed
 * in-memory reality reader's own registration path (the runtime's `seed`
 * method — the double's documented write path; the production adapter
 * resolves the same refs against the real evidence authority).
 */
function seedOneRealityObservation(
  composition: ReturnType<typeof createProductionMosWebComposition>,
): void {
  const reality = composition.labRuntime.reality as unknown as {
    seed(input: { scope: TenantScope; observation: HistoricalObservationDraft }): void;
  };
  const observation: HistoricalObservationDraft = {
    id: 'obs-intent-1' as never,
    niche: NICHE,
    platform: PLATFORM,
    metrics: [{ metric: 'qualified-reach', value: 950, unit: 'people' }],
    observedAt: '2026-10-16T00:00:00.000Z' as never,
    sourceRefs: ['src://platform/analytics/intent-1'],
    regime: 'baseline',
  };
  reality.seed({ scope: scopeOf(composition.scope.tenantId), observation });
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------

test('a fresh composition starts with a ZERO-record lab-intent ledger', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  assert.equal(await composition.labIntents.loadLabIntentLedgerRecord('lab-intent-0001', scope), null);
  assert.equal(await composition.labIntents.loadLabIntentLedgerRecord('lab-intent-9999', scope), null);
});

test('registerWorldModel executes against the REAL store and appears in the labSimulator read model', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);

  const receipt = asReceipt(
    await composition.labIntents.declareRegisterWorldModel({
      action: 'register-world-model',
      worldModelId: 'world-intent-a',
      niche: NICHE,
      platform: PLATFORM,
      notesText: 'registered through the production lab-intent transport',
      stateJson: WORLD_STATE_JSON,
    }),
  );
  assert.equal(receipt.intentId, 'lab-intent-0001');
  assert.equal(receipt.action, 'register-world-model');
  assert.equal(receipt.declaredAt, NOW());
  assert.equal(receipt.routedTo, 'lab-simulator-authority');
  assert.equal(receipt.authorityEcho.recordId, 'world-intent-a');
  assert.equal(receipt.authorityEcho.recordVersion, 1);
  assert.match(receipt.authorityEcho.summary, /world model world-intent-a registered at version 1/);
  assert.match(receipt.authorityEcho.summary, /counterfactual/);

  // The REAL store holds the record (append-only chain, version 1).
  const stored = await composition.labWorkspaceRuntime.worldModels.getWorldModel(
    scope,
    'world-intent-a' as never,
    1,
  );
  assert.ok(stored !== null, 'the world model is stored in the REAL LAB-004 store');
  assert.equal(stored?.worldModelVersion, 1);
  assert.equal(stored?.disclosure, 'synthetic-parametric-world-model');

  // The READ MODEL presents it (the section port the shell renders).
  const overview = await composition.labSimulator.loadSimulatorOverview(scope);
  assert.ok(!('error' in overview));
  const listed = overview.worldModels.find((view) => view.worldModelId === 'world-intent-a');
  assert.ok(listed !== null, 'the registered world model appears in the simulator read model');
  assert.equal(listed?.worldModelVersion, 1);
  assert.equal(listed?.counterfactual, true);
  assert.equal(listed?.disclosure, 'synthetic-parametric-world-model');
  assert.equal(listed?.state.baseAudience, 12_000);

  // The ledger record loads back with the executed outcome.
  const ledgerRecord = await composition.labIntents.loadLabIntentLedgerRecord(
    receipt.intentId,
    scope,
  );
  assert.ok(ledgerRecord !== null);
  assert.equal(ledgerRecord?.outcome, receipt);
});

test('simulateStep over the registered world model executes (seed + step echoed, counterfactual)', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);

  const registered = asReceipt(
    await composition.labIntents.declareRegisterWorldModel({
      action: 'register-world-model',
      worldModelId: 'world-intent-step',
      niche: NICHE,
      platform: PLATFORM,
      notesText: 'the world model the step intent runs against',
      stateJson: WORLD_STATE_JSON,
    }),
  );
  assert.equal(registered.authorityEcho.recordVersion, 1);

  const receipt = asReceipt(
    await composition.labIntents.declareSimulateStep({
      action: 'simulate-step',
      worldModelId: 'world-intent-step',
      worldModelVersion: 1,
      seed: 4242,
      step: 3,
      scenarioJson: SCENARIO_JSON,
      candidateJson: CANDIDATE_JSON,
    }),
  );
  assert.equal(receipt.action, 'simulate-step');
  assert.equal(receipt.routedTo, 'lab-simulator-authority');
  // The authority echo names the RECORD the authority produced: the
  // simulation prediction's deterministic id
  // (`sim:<worldModel>:<version>:<strategyRef>:<seed>:<step>`), version 1.
  assert.equal(receipt.authorityEcho.recordId, 'sim:world-intent-step:1:strategy:intent-alpha:4242:3');
  assert.equal(receipt.authorityEcho.recordVersion, 1);
  assert.match(receipt.authorityEcho.summary, /seed 4242/);
  assert.match(receipt.authorityEcho.summary, /step 3/);
  assert.match(receipt.authorityEcho.summary, /counterfactual/);
  assert.match(receipt.authorityEcho.summary, /never measured evidence/);
});

test('ingest without a rights grant fails CLOSED with the authority rights verdict verbatim', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);

  const failure = asFailure(
    await composition.labIntents.declareIngestReferenceDocument({
      action: 'ingest-reference-document',
      documentId: 'refdoc-intent-1',
      niche: NICHE,
      platform: PLATFORM,
      modality: 'text',
      artifactId: 'artifact-intent-1',
      sourceRefsText: 'src://platform/post/123',
      acquiredAt: '2026-10-17T00:00:00.000Z',
      rightsRef: 'grant-none',
      provenanceRef: 'prov-intent-1',
    }),
  );
  assert.equal(failure.action, 'ingest-reference-document');
  assert.equal(failure.routedTo, 'lab-corpus-authority');
  // The corpus authority's own code + message, VERBATIM.
  assert.equal(failure.error, 'no-explicit-grant');
  assert.equal(
    failure.message,
    'rightsRef does not resolve to an explicit active rights grant: grant-none (object-store/URL accessibility never implies rights)',
  );

  // Nothing was ingested: the read model stays honestly empty.
  assert.deepEqual(await composition.labCorpus.listCorpusSummaries(scope), []);

  // The failed declaration is still ledger-recorded (the attempt + verdict).
  const ledgerRecord = await composition.labIntents.loadLabIntentLedgerRecord(
    failure.intentId,
    scope,
  );
  assert.ok(ledgerRecord !== null);
  assert.equal(ledgerRecord?.outcome, failure);
});

test('runBenchmark with an empty candidate set executes — the no-op baseline runs', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  await registerBenchmarkEnsemble(composition);

  const receipt = asReceipt(
    await composition.labIntents.declareRunBenchmark({
      action: 'run-benchmark',
      benchmarkId: 'bench-intent-v1',
      seedsText: '11,22',
      scenarioJson: SCENARIO_JSON,
      candidatesJson: '[]',
      rewardSpecJson: REWARD_SPEC_JSON,
      policyJson: BENCH_POLICY_JSON,
    }),
  );
  assert.equal(receipt.action, 'run-benchmark');
  assert.equal(receipt.routedTo, 'lab-benchmark-authority');
  assert.equal(receipt.authorityEcho.recordId, 'bench-intent-v1');
  assert.equal(receipt.authorityEcho.recordVersion, 1);
  assert.match(receipt.authorityEcho.summary, /0 declared candidates/);
  assert.match(receipt.authorityEcho.summary, /no-op baseline/);

  // The frozen record really exists (the REAL benchmark read path).
  const record = await composition.labRuntime.benchmark.getBenchmarkRecord(
    scope,
    'bench-intent-v1' as never,
    1,
  );
  assert.ok(record !== null, 'the frozen benchmark record exists at version 1');
  assert.equal(record?.comparison.noopBaseline.key, 'no-op-baseline');
  assert.deepEqual(record?.seeds, [11, 22]);

  // The benchmark digest LISTING degrades fail-closed on the disclosed
  // wave-20 gap (the lab scenario registry read model is not bound, so a
  // record citing a scenario the projection cannot resolve does not get a
  // projected summary — never a fabricated one). The record itself is
  // fully readable through the REAL benchmark port above.
  const summaries = await composition.labBenchmark.listBenchmarkSummaries(scope);
  assert.ok('error' in summaries);
  if ('error' in summaries) {
    assert.equal(summaries.error, 'lab-benchmark-unavailable');
    assert.match(summaries.message, /scenario registry read model is not bound/);
  }
});

test('recordCalibrationError executes against the frozen benchmark record (the chain)', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const scope = scopeOf(composition.scope.tenantId);
  await registerBenchmarkEnsemble(composition);
  seedOneRealityObservation(composition);

  const benchmarkReceipt = asReceipt(
    await composition.labIntents.declareRunBenchmark({
      action: 'run-benchmark',
      benchmarkId: 'bench-intent-v1',
      seedsText: '11,22',
      scenarioJson: SCENARIO_JSON,
      candidatesJson: '[]',
      rewardSpecJson: REWARD_SPEC_JSON,
      policyJson: BENCH_POLICY_JSON,
    }),
  );
  assert.equal(benchmarkReceipt.authorityEcho.recordVersion, 1);

  const receipt = asReceipt(
    await composition.labIntents.declareRecordCalibrationError({
      action: 'record-calibration-error',
      calibrationId: 'calib-intent-v1',
      predictionJson: JSON.stringify({
        benchmarkId: 'bench-intent-v1',
        benchmarkVersion: 1,
        candidateKey: 'no-op-baseline',
      }),
      observationRefsJson: JSON.stringify(['obs-intent-1']),
      rewardSpecJson: REWARD_SPEC_JSON,
      functionalJson: JSON.stringify({
        id: 'calib-signed-error-v1',
        version: 1,
        note: 'declared v1 functional for the intent-transport battery',
      }),
      noteText: 'the runBenchmark → recordCalibrationError chain over the REAL runtimes',
    }),
  );
  assert.equal(receipt.action, 'record-calibration-error');
  assert.equal(receipt.routedTo, 'lab-calibration-authority');
  assert.equal(receipt.authorityEcho.recordId, 'calib-intent-v1');
  assert.equal(receipt.authorityEcho.recordVersion, 1);
  assert.match(receipt.authorityEcho.summary, /bench-intent-v1 v1/);
  assert.match(receipt.authorityEcho.summary, /no-op-baseline/);
  assert.match(receipt.authorityEcho.summary, /1 observation/);

  // The frozen benchmark record is UNCHANGED (calibration appends only).
  const benchmark = await composition.labRuntime.benchmark.getBenchmarkRecord(
    scope,
    'bench-intent-v1' as never,
    1,
  );
  assert.ok(benchmark !== null);

  // The calibration READ MODEL lists the chain (the section port).
  const chains = await composition.labCalibration.listCalibrationChains(scope);
  assert.ok(!('error' in chains));
  assert.equal(chains.length, 1);
});

test('searchOrganizations with no ensemble registered rejects with the authority code verbatim', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });

  // The §23 comparison mandate requires structurally valid baseline +
  // hand-designed candidates BEFORE the ensemble resolves — the declaration
  // carries a complete valid set so the ONLY missing thing is the ensemble.
  const candidatesJson = JSON.stringify({
    baseline: {
      organization: {
        id: 'org-generalist',
        version: 1,
        tenantId: composition.scope.tenantId,
        nodes: [{ nodeId: 'agent-1', role: 'generalist', bodyId: 'body-generalist' }],
        edges: [],
        modelAssignments: [{ nodeId: 'agent-1', modelRef: 'mos-model:standard' }],
        memoryPolicy: { scope: 'session', sharing: 'isolated' },
        budgetPolicy: {
          organization: { maxCost: { amount: 500, currency: 'USD' }, maxDurationMs: 1_209_600_000 },
          perNode: { maxCost: { amount: 500, currency: 'USD' }, maxDurationMs: 1_209_600_000 },
        },
        terminationPolicy: { maxIterations: 4, timeoutMs: 60_000 },
        evaluator: 'evaluator:lab:org-search@1',
      },
      features: {
        criticNodeIds: [],
        toolAllocation: { perNode: [{ nodeId: 'agent-1', toolRefs: ['tool-research'] }] },
        executionOrdering: 'sequential',
      },
      origin: 'generalist-single-agent-baseline',
    },
    handDesigned: {
      organization: {
        id: 'org-hand-designed',
        version: 2,
        tenantId: composition.scope.tenantId,
        nodes: [
          { nodeId: 'planner', role: 'planner', bodyId: 'body-planner' },
          { nodeId: 'writer', role: 'writer', bodyId: 'body-writer' },
          { nodeId: 'critic', role: 'critic', bodyId: 'body-critic' },
        ],
        edges: [
          { fromNodeId: 'planner', toNodeId: 'writer', kind: 'delegates-to' },
          { fromNodeId: 'writer', toNodeId: 'planner', kind: 'reports-to' },
          { fromNodeId: 'writer', toNodeId: 'critic', kind: 'communicates-with' },
        ],
        modelAssignments: [
          { nodeId: 'planner', modelRef: 'mos-model:strong' },
          { nodeId: 'writer', modelRef: 'mos-model:standard' },
          { nodeId: 'critic', modelRef: 'mos-model:fast' },
        ],
        memoryPolicy: { scope: 'session', sharing: 'shared' },
        budgetPolicy: {
          organization: { maxCost: { amount: 900, currency: 'USD' }, maxDurationMs: 1_209_600_000 },
          perNode: { maxCost: { amount: 300, currency: 'USD' }, maxDurationMs: 432_000_000 },
        },
        terminationPolicy: { maxIterations: 6, timeoutMs: 120_000 },
        evaluator: 'evaluator:lab:org-search@1',
      },
      features: {
        criticNodeIds: ['critic'],
        toolAllocation: {
          perNode: [
            { nodeId: 'planner', toolRefs: ['tool-research', 'tool-analytics'] },
            { nodeId: 'writer', toolRefs: ['tool-drafting'] },
          ],
        },
        executionOrdering: 'staged',
      },
      origin: 'hand-designed',
    },
  });
  const policyJson = JSON.stringify({
    maxMemberSteps: 4_000,
    pruning: 'none',
    maxGenerations: 3,
    plateauWindow: 2,
    improvementTolerance: 1,
    horizonSteps: 3,
    seedCount: 2,
    roleVocabulary: ['planner', 'writer', 'critic', 'researcher', 'editor', 'generalist'],
    modelVocabulary: ['mos-model:standard', 'mos-model:strong', 'mos-model:fast'],
    toolVocabulary: ['tool-research', 'tool-analytics', 'tool-drafting', 'tool-render'],
    budgetScaleFactor: 1.5,
    stoppingIterationDelta: 2,
    evaluationReferences: {
      cadencePerAgentPerWeek: 4,
      fullBudgetAmount: 1_000,
      fullToolsPerNode: 2,
      referenceIterations: 8,
    },
  });

  const failure = asFailure(
    await composition.labIntents.declareSearchOrganizations({
      action: 'search-organizations',
      ensembleId: 'ensemble-unknown-v1',
      ensembleVersion: 1,
      seed: 424_242,
      scenarioJson: SCENARIO_JSON,
      rewardSpecJson: REWARD_SPEC_JSON,
      candidatesJson,
      policyJson,
    }),
  );
  assert.equal(failure.action, 'search-organizations');
  assert.equal(failure.routedTo, 'lab-organization-search-authority');
  // The authority's own code + message, VERBATIM.
  assert.equal(failure.error, 'unknown-ensemble');
  assert.equal(
    failure.message,
    'no ensemble ensemble-unknown-v1 visible in this tenant scope',
  );
});

test('tenant isolation: another scope lab-intent ledger read resolves to null', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const receipt = asReceipt(
    await composition.labIntents.declareRegisterWorldModel({
      action: 'register-world-model',
      worldModelId: 'world-intent-isolated',
      niche: NICHE,
      platform: PLATFORM,
      notesText: '',
      stateJson: WORLD_STATE_JSON,
    }),
  );
  const ownScope = scopeOf(composition.scope.tenantId);
  const otherScope = scopeOf('tenant-other');
  assert.ok((await composition.labIntents.loadLabIntentLedgerRecord(receipt.intentId, ownScope)) !== null);
  assert.equal(await composition.labIntents.loadLabIntentLedgerRecord(receipt.intentId, otherScope), null);
});

test('simulateStep with malformed scenario JSON fails with the named parse code', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const failure = asFailure(
    await composition.labIntents.declareSimulateStep({
      action: 'simulate-step',
      worldModelId: 'world-intent-any',
      worldModelVersion: 1,
      seed: 1,
      step: 0,
      scenarioJson: '{not-json',
      candidateJson: CANDIDATE_JSON,
    }),
  );
  assert.equal(failure.action, 'simulate-step');
  assert.equal(failure.routedTo, 'lab-simulator-authority');
  // The shell-side parse code, pinned against @mos/web's REAL constant.
  assert.equal(failure.error, `${LAB_INTENT_JSON_INVALID_PREFIX}:scenarioJson`);
  assert.equal(failure.error, 'lab-intent-json-invalid:scenarioJson');
  assert.match(failure.message, /scenarioJson/);
  assert.match(failure.message, /could not be parsed/);
});

test('the corpus snapshot declaration honestly reports the underivable corpus id', async () => {
  const composition = createProductionMosWebComposition({ now: NOW });
  const failure = asFailure(
    await composition.labIntents.declareSnapshotCorpusVersion({
      action: 'snapshot-corpus-version',
      documentRefsText: 'refdoc-a,refdoc-b',
    }),
  );
  assert.equal(failure.action, 'snapshot-corpus-version');
  assert.equal(failure.routedTo, 'lab-corpus-authority');
  assert.equal(failure.error, LAB_INTENT_MISSING_INPUT);
  assert.equal(failure.error, 'lab-intent-missing-input');
  assert.match(failure.message, /corpusId/);
});

test('the shell-side failure-code literals stay pinned to @mos/web\'s exported constants', () => {
  assert.equal(LAB_INTENT_JSON_INVALID_PREFIX, 'lab-intent-json-invalid');
  assert.equal(LAB_INTENT_MISSING_INPUT, 'lab-intent-missing-input');
});
