import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryTimeMachine } from './in-memory-time-machine.js';
import {
  createInMemorySimulatorEngine,
  createInMemorySocialWorldModelStore,
} from './in-memory-social-simulator.js';
import type {
  CreateBranchInput,
  HistoricalObservationDraft,
  TimeMachineBranchId,
  TimeMachinePort,
} from '../contracts/time-machine.js';
import type {
  HistoricalObservation,
  HistoricalObservationId,
  SimulationPrediction,
} from '../contracts/evidence.js';
import type {
  LabScenario,
  LabScenarioId,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';

const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenant as TenantId });
const timestamp = (value: string): Timestamp => value as Timestamp;
const observationId = (value: string): HistoricalObservationId => value as HistoricalObservationId;
const branchId = (value: string): TimeMachineBranchId => value as TimeMachineBranchId;
const labScenarioId = (value: string): LabScenarioId => value as LabScenarioId;
const strategyRef = (value: string): StrategyRef => value as StrategyRef;

const FIXED_NOW = (): Timestamp => timestamp('2026-06-15T12:00:00.000Z');
const DAY = 86_400_000;

const T0 = '2026-06-01T00:00:00.000Z';
const T2 = '2026-06-10T00:00:00.000Z';
const T4 = '2026-06-20T00:00:00.000Z';

const draft = (id: string, observedAt: string): HistoricalObservationDraft => ({
  id: observationId(`obs-${id}`),
  niche: 'sourdough-baking',
  platform: 'short-video',
  metrics: [{ metric: 'qualified-reach', value: 1_000, unit: 'people' }],
  observedAt: timestamp(observedAt),
  sourceRefs: [`src://platform/analytics/${id}`],
  regime: 'baseline',
});

const machineWithTimeline = async () => {
  const machine = createInMemoryTimeMachine({ now: FIXED_NOW });
  for (const observedAt of [T4, T0, T2]) {
    const result = await machine.appendHistoricalObservation({
      scope: scopeOf('tenant-a'),
      observation: draft(observedAt.slice(0, 10), observedAt),
    });
    if ('error' in result) {
      assert.fail(`unexpected append error: ${result.error}`);
    }
  }
  return machine;
};

const asArray = (result: readonly HistoricalObservation[] | { error: string }): readonly HistoricalObservation[] => {
  if ('error' in result && !Array.isArray(result)) {
    assert.fail(`unexpected replay error: ${String(result.error)}`);
  }
  return result as readonly HistoricalObservation[];
};

const createBranch = async (machine: TimeMachinePort, overrides: Partial<CreateBranchInput> = {}) => {
  const result = await machine.createBranch({
    scope: scopeOf('tenant-a'),
    forkPoint: timestamp(T2),
    intervention: {
      description: 'double posting cadence from June 10',
      changedParameters: { cadencePerWeek: 10 },
    },
    ...overrides,
  });
  if ('error' in result) {
    assert.fail(`unexpected branch error: ${result.error}`);
  }
  return result;
};

const tinyScenario = (): LabScenario => ({
  id: labScenarioId('scenario-tiny'),
  version: 1 as Version,
  niche: 'sourdough-baking',
  platform: 'short-video',
  objective: 'qualified-reach',
  context: {},
  budget: { maxCost: { amount: 1, currency: 'USD' }, maxDurationMs: DAY } as never,
  informationLag: 0,
  corpusVersion: 1 as Version,
  simulatorVersion: 1 as Version,
  rewardVersion: 1 as Version,
});

/** A genuine per-tenant simulator prediction (LAB-004 engine, FIXED_NOW clock). */
const genuinePrediction = async (tenant: string, seed: number): Promise<SimulationPrediction> => {
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  const registered = await worldModels.registerWorldModel({
    scope: scopeOf(tenant),
    worldModel: {
      id: 'world-sourdough' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 100, fatigue: 0, competitorShare: 0.1, seasonalFactor: 1 },
      notes: null,
    },
  });
  assert.ok(!('error' in registered));
  const stepped = await engine.simulateStep({
    scope: scopeOf(tenant),
    worldModelId: 'world-sourdough' as never,
    worldModelVersion: 1,
    scenario: tinyScenario(),
    candidate: {
      strategyRef: strategyRef(`strategy-${tenant}`),
      kind: 'content',
      cadencePerWeek: 1,
      novelty: 0.5,
      engagementEffort: 0.5,
    },
    seed,
    step: 0,
  });
  assert.ok(!('error' in stepped));
  return stepped;
};

// ---------------------------------------------------------------------------
// MODE 3: counterfactual branching
// ---------------------------------------------------------------------------

test('MODE 3 createBranch: machine-assigned NEW branch id, labeled counterfactual, auditable lineage', async () => {
  const machine = await machineWithTimeline();
  const parent = await createBranch(machine);
  const child = await createBranch(machine, { parentBranchId: parent.id, label: 'aggressive variant' });

  assert.notEqual(parent.id, child.id, 'branch ids must be machine-assigned and fresh');
  assert.equal(parent.parentBranchId, null, 'a root branch forks from the historical timeline');
  assert.equal(parent.counterfactual, true, 'LOCK 29: branches are counterfactual by construction');
  assert.equal(parent.forkPoint, T2);
  assert.equal(parent.intervention.changedParameters.cadencePerWeek, 10);
  assert.equal(child.parentBranchId, parent.id);
  assert.equal(child.label, 'aggressive variant');

  const branches = await machine.listBranches(scopeOf('tenant-a'));
  assert.deepEqual(branches.map((entry) => entry.id), [parent.id, child.id], 'creation order preserved');
  // Tenant isolation: foreign scope sees no branches (no existence leak).
  assert.equal(await machine.getBranch(scopeOf('tenant-b'), parent.id), null);
  assert.deepEqual(await machine.listBranches(scopeOf('tenant-b')), []);

  const unknownParent = await machine.createBranch({
    scope: scopeOf('tenant-a'),
    forkPoint: timestamp(T2),
    intervention: { description: 'x', changedParameters: {} },
    parentBranchId: branchId('cf-branch-999'),
  });
  assert.ok('error' in unknownParent && unknownParent.error === 'unknown-branch');
});

test('MODE 3 records REAL simulator predictions into a branch (counterfactual, labeled, isolated)', async () => {
  const machine = await machineWithTimeline();
  const stepped = await genuinePrediction('tenant-a', 7);

  const branch = await createBranch(machine);
  const recorded = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-a'),
    branchId: branch.id,
    prediction: stepped,
  });
  assert.ok(!('error' in recorded));
  assert.equal(recorded.counterfactual, true);
  assert.equal(recorded.branchId, branch.id);
  assert.deepStrictEqual(recorded.prediction, stepped, 'the prediction is preserved verbatim');

  // BRANCH ISOLATION: the branch record never enters the historical timeline
  // or any other branch.
  const timeline = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T4) }));
  assert.equal(timeline.length, 3);
  assert.ok(timeline.every((observation) => observation.counterfactual === false), 'replay never serves counterfactual records');
  const other = await createBranch(machine, { label: 'control' });
  const otherRecords = await machine.getBranchRecords(scopeOf('tenant-a'), other.id);
  assert.ok(!('error' in otherRecords) && otherRecords.length === 0, 'sibling branch sees no records');
  const branchRecords = await machine.getBranchRecords(scopeOf('tenant-a'), branch.id);
  assert.ok(!('error' in branchRecords) && branchRecords.length === 1);
});

test('MODE 3 runtime label re-validation: a double-cast non-counterfactual record is REJECTED (lock 29)', async () => {
  const machine = await machineWithTimeline();
  const branch = await createBranch(machine);
  // Simulate a caller defeating the compiler with a double cast: the record
  // claims to be a SimulationPrediction but is NOT counterfactual.
  const smuggled = {
    id: 'smuggled',
    version: 1,
    tenantId: scopeOf('tenant-a').tenantId,
    scenarioRef: 'scenario-x',
    worldModelVersion: 1,
    simulatorVersion: 1,
    strategyRef: 'strategy-x',
    seed: 1,
    step: 0,
    metrics: [],
    predictedAt: FIXED_NOW(),
    uncertainty: { level: 'low' },
    counterfactual: false, // <- historical-style record smuggled into a branch
    disclosure: 'synthetic-response-function',
  } as unknown as SimulationPrediction;

  const rejected = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-a'),
    branchId: branch.id,
    prediction: smuggled,
  });
  assert.ok(
    'error' in rejected && rejected.error === 'prediction-not-counterfactual',
    'a non-counterfactual record can never enter a counterfactual branch',
  );
});

test('MODE 3 fail-closed codes: unknown branch, tenant mismatch on prediction, malformed input', async () => {
  const machine = await machineWithTimeline();
  const branch = await createBranch(machine);
  const foreignPrediction = await genuinePrediction('tenant-b', 1);
  const tenantMismatch = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-a'),
    branchId: branch.id,
    prediction: foreignPrediction,
  });
  assert.ok('error' in tenantMismatch && tenantMismatch.error === 'prediction-tenant-mismatch');

  const unknownBranchRecords = await machine.getBranchRecords(scopeOf('tenant-a'), branchId('cf-branch-999'));
  assert.ok('error' in unknownBranchRecords && unknownBranchRecords.error === 'unknown-branch');

  const badIntervention = await machine.createBranch({
    scope: scopeOf('tenant-a'),
    forkPoint: timestamp(T2),
    intervention: { description: '   ', changedParameters: {} },
  });
  assert.ok('error' in badIntervention && badIntervention.error === 'invalid-input');
  const badForkPoint = await machine.createBranch({
    scope: scopeOf('tenant-a'),
    forkPoint: timestamp('yesterday-ish'),
    intervention: { description: 'intervention', changedParameters: {} },
  });
  assert.ok('error' in badForkPoint && badForkPoint.error === 'invalid-input');
});

test('BRANCH RECORD TENANT ISOLATION: a custom id factory reusing one branch id across tenants never mixes records', async () => {
  // Adversarial configuration: the injected nextBranchId factory mints the
  // SAME branch id in two tenants (the default factory is machine-global and
  // cannot). Branch records must still be scoped per (tenant, branch id) —
  // one tenant's predictions can never bleed into the other's branch.
  const machine = createInMemoryTimeMachine({
    now: FIXED_NOW,
    nextBranchId: () => branchId('shared-branch'),
  });
  const branchA = await machine.createBranch({
    scope: scopeOf('tenant-a'),
    forkPoint: timestamp(T0),
    intervention: { description: 'tenant-a variant', changedParameters: { cadencePerWeek: 5 } },
  });
  assert.ok(!('error' in branchA));
  const branchB = await machine.createBranch({
    scope: scopeOf('tenant-b'),
    forkPoint: timestamp(T0),
    intervention: { description: 'tenant-b variant', changedParameters: { cadencePerWeek: 9 } },
  });
  assert.ok(!('error' in branchB));
  assert.equal(branchA.id, branchB.id, 'fixture premise: both tenants own a branch with the same id');

  const predictionA = await genuinePrediction('tenant-a', 3);
  const predictionB = await genuinePrediction('tenant-b', 3);
  const recordedA = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-a'),
    branchId: branchA.id,
    prediction: predictionA,
  });
  assert.ok(!('error' in recordedA));
  const recordedB = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-b'),
    branchId: branchB.id,
    prediction: predictionB,
  });
  assert.ok(!('error' in recordedB));

  const recordsA = await machine.getBranchRecords(scopeOf('tenant-a'), branchA.id);
  const recordsB = await machine.getBranchRecords(scopeOf('tenant-b'), branchB.id);
  assert.ok(!('error' in recordsA) && !('error' in recordsB));
  assert.equal(recordsA.length, 1, 'tenant-a sees ONLY its own record');
  assert.equal(recordsB.length, 1, 'tenant-b sees ONLY its own record');
  assert.equal(
    (recordsA[0] as { prediction: SimulationPrediction }).prediction.tenantId,
    scopeOf('tenant-a').tenantId,
  );
  assert.equal(
    (recordsB[0] as { prediction: SimulationPrediction }).prediction.tenantId,
    scopeOf('tenant-b').tenantId,
  );
  assert.notDeepStrictEqual(
    (recordsA[0] as { prediction: SimulationPrediction }).prediction,
    (recordsB[0] as { prediction: SimulationPrediction }).prediction,
  );
});
