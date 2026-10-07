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

/** ADVERSARIAL fixture: observations appended in SHUFFLED time order. */
const T0 = '2026-06-01T00:00:00.000Z';
const T1 = '2026-06-05T00:00:00.000Z';
const T2 = '2026-06-10T00:00:00.000Z';
const T2_PLUS_1MS = '2026-06-10T00:00:00.001Z'; // 1 ms after the T-L cutoff
const T3 = '2026-06-15T00:00:00.000Z';
const T4 = '2026-06-20T00:00:00.000Z';
/** Append order deliberately shuffled: [T3, T0, T4, T1, T2+1ms, T2]. */
const APPEND_ORDER: readonly string[] = [T3, T0, T4, T1, T2_PLUS_1MS, T2];

const draft = (id: string, observedAt: string): HistoricalObservationDraft => ({
  id: observationId(`obs-${id}`),
  niche: 'sourdough-baking',
  platform: 'short-video',
  metrics: [
    {
      metric: 'qualified-reach',
      value: 1_000 + (id.charCodeAt(id.length - 1) % 13),
      unit: 'people',
    },
  ],
  observedAt: timestamp(observedAt),
  sourceRefs: [`src://platform/analytics/${id}`],
  regime: 'baseline',
});

const machineWithTimeline = async () => {
  const machine = createInMemoryTimeMachine({ now: FIXED_NOW });
  for (const observedAt of APPEND_ORDER) {
    const id = observedAt.slice(0, 19).replaceAll(/[T:-]/g, '') + observedAt.slice(20, 23);
    const result = await machine.appendHistoricalObservation({
      scope: scopeOf('tenant-a'),
      observation: draft(id, observedAt),
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

// ---------------------------------------------------------------------------
// Historical timeline: append-only + immutable
// ---------------------------------------------------------------------------

test('historical timeline: append assigns version/tenant, duplicates rejected, records FROZEN', async () => {
  const machine = await machineWithTimeline();
  const first = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-a'),
    observation: draft('dup', T0),
  });
  assert.ok(!('error' in first));
  assert.equal(first.version, 1);
  assert.equal(first.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(first.counterfactual, false, 'LOCK 29: timeline records are never counterfactual');

  const duplicate = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-a'),
    observation: draft('dup', T0),
  });
  assert.ok('error' in duplicate && duplicate.error === 'duplicate-observation');

  // APPEND-ONLY + IMMUTABLE (test-pinned): stored records are deep-frozen —
  // even in-memory mutation attempts throw in strict-mode ESM.
  assert.throws(() => {
    (first as unknown as { niche: string }).niche = 'tampered';
  }, TypeError);
  assert.throws(() => {
    (first.metrics as unknown as { push: (value: unknown) => void }).push({ metric: 'x' });
  }, TypeError);
  assert.equal(first.niche, 'sourdough-baking');
});

test('the Time Machine port exposes NO method that can rewrite or remove history (structural immutability)', () => {
  const machine = createInMemoryTimeMachine();
  const surface = Object.keys(machine) as (keyof TimeMachinePort)[];
  assert.deepEqual([...surface].sort(), [
    'appendHistoricalObservation',
    'createBranch',
    'getBranch',
    'getBranchRecords',
    'listBranches',
    'recordBranchPrediction',
    'replayDelayedInformation',
    'replayHistorical',
  ]);
  assert.equal(surface.length, 8);
  assert.ok(surface.length <= 12, 'architecture policy: maxPublicMethods');
  for (const method of surface) {
    assert.ok(
      !/update|delete|remove|rewrite|mutate|edit|patch/i.test(String(method)),
      `history-mutating method name forbidden on the Time Machine surface: ${String(method)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// MODE 1: historical replay (≤ T only)
// ---------------------------------------------------------------------------

test('MODE 1 historical replay: serves strictly observations ≤ T, ascending, append order irrelevant', async () => {
  const machine = await machineWithTimeline();
  const atT2 = asArray(
    await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T2) }),
  );
  assert.deepEqual(
    atT2.map((observation) => observation.observedAt),
    [T0, T1, T2],
    'replay at T2 sees exactly the observations at or before T2 — never T2+1ms/T3/T4',
  );
  const atT1 = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T1) }));
  assert.deepEqual(atT1.map((observation) => observation.observedAt), [T0, T1]);
  const beforeAll = asArray(
    await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp('2026-05-01T00:00:00.000Z') }),
  );
  assert.deepEqual(beforeAll, []);
  // Filters + limit compose with the cutoff.
  const limited = asArray(
    await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T4), limit: 2 }),
  );
  assert.equal(limited.length, 2);
});

// ---------------------------------------------------------------------------
// MODE 2: delayed-information replay (LEAKAGE PREVENTION, adversarial)
// ---------------------------------------------------------------------------

test('MODE 2 delayed replay (LEAKAGE PREVENTION): nothing newer than T-L is ever visible', async () => {
  const machine = await machineWithTimeline();
  // T = 2026-06-15, L = 5 days → cutoff = 2026-06-10 (T2). The T2+1ms record
  // is an ADVERSARIAL boundary probe one millisecond past the cutoff.
  const visible = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-a'), {
      asOf: timestamp(T3),
      lagMs: 5 * DAY,
    }),
  );
  assert.deepEqual(
    visible.map((observation) => observation.observedAt),
    [T0, T1, T2],
    'visible set is exactly the records available BY T-L (inclusive cutoff, no 1ms leak)',
  );
  for (const observation of visible) {
    assert.ok(Date.parse(observation.observedAt) <= Date.parse(T3) - 5 * DAY);
  }

  // Every observation strictly newer than T-L must be invisible — checked
  // across a sweep of lag values (adversarial: append order is shuffled).
  for (const lagDays of [0, 1, 3, 5, 9, 14, 30]) {
    const sweep = asArray(
      await machine.replayDelayedInformation(scopeOf('tenant-a'), {
        asOf: timestamp(T3),
        lagMs: lagDays * DAY,
      }),
    );
    const cutoff = Date.parse(T3) - lagDays * DAY;
    for (const observation of sweep) {
      assert.ok(
        Date.parse(observation.observedAt) <= cutoff,
        `leakage: observation at ${observation.observedAt} visible under lag ${lagDays}d (cutoff ${new Date(cutoff).toISOString()})`,
      );
    }
  }

  // lag 0 degenerates to exact historical replay at T.
  const zeroLag = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-a'), { asOf: timestamp(T3), lagMs: 0 }),
  );
  const plain = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T3) }));
  assert.deepEqual(zeroLag, plain);
  // A lag exceeding all history hides everything.
  const hugeLag = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-a'), { asOf: timestamp(T3), lagMs: 365 * DAY }),
  );
  assert.deepEqual(hugeLag, []);
});

test('MODE 2 rejects malformed queries fail-closed (negative lag, bad asOf)', async () => {
  const machine = await machineWithTimeline();
  const negativeLag = await machine.replayDelayedInformation(scopeOf('tenant-a'), {
    asOf: timestamp(T3),
    lagMs: -1,
  });
  assert.ok('error' in negativeLag && negativeLag.error === 'invalid-input');
  const badAsOf = await machine.replayDelayedInformation(scopeOf('tenant-a'), {
    asOf: timestamp('not-a-timestamp'),
    lagMs: 0,
  });
  assert.ok('error' in badAsOf && badAsOf.error === 'invalid-input');
  const badLimit = await machine.replayHistorical(scopeOf('tenant-a'), {
    asOf: timestamp(T3),
    limit: 0,
  });
  assert.ok('error' in badLimit && badLimit.error === 'invalid-input');
});

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
  // Integration: a genuine prediction from the LAB-004 simulator engine.
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  const registered = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a'),
    worldModel: {
      id: 'world-sourdough' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: null,
    },
  });
  assert.ok(!('error' in registered));
  const scenario: LabScenario = {
    id: labScenarioId('scenario-sourdough-reach'),
    version: 1 as Version,
    niche: 'sourdough-baking',
    platform: 'short-video',
    objective: 'qualified-reach',
    context: {},
    budget: { maxCost: { amount: 500, currency: 'USD' }, maxDurationMs: DAY } as never,
    informationLag: 5 * DAY,
    corpusVersion: 2 as Version,
    simulatorVersion: 1 as Version,
    rewardVersion: 1 as Version,
  };
  const stepped = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: 'world-sourdough' as never,
    worldModelVersion: 1,
    scenario,
    candidate: { strategyRef: strategyRef('strategy-branch'), kind: 'content', cadencePerWeek: 10, novelty: 0.8, engagementEffort: 0.5 },
    seed: 7,
    step: 0,
  });
  assert.ok(!('error' in stepped));

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
  assert.equal(timeline.length, APPEND_ORDER.length);
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
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  // Register the same world model shape under BOTH tenants (separate
  // append-only chains) so the tenant-b prediction is genuine.
  for (const tenant of ['tenant-a', 'tenant-b']) {
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
  }
  const scenarioTiny: LabScenario = {
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
  };
  const foreignPrediction = await engine.simulateStep({
    scope: scopeOf('tenant-b'),
    worldModelId: 'world-sourdough' as never,
    worldModelVersion: 1,
    scenario: scenarioTiny,
    candidate: { strategyRef: strategyRef('strategy-x'), kind: 'content', cadencePerWeek: 1, novelty: 0.5, engagementEffort: 0.5 },
    seed: 1,
    step: 0,
  });
  assert.ok(!('error' in foreignPrediction));
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

test('tenant scoping: foreign tenants observe an empty timeline (no existence leak)', async () => {
  const machine = await machineWithTimeline();
  const foreign = asArray(
    await machine.replayHistorical(scopeOf('tenant-b'), { asOf: timestamp(T4) }),
  );
  assert.deepEqual(foreign, []);
  const foreignDelayed = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-b'), { asOf: timestamp(T4), lagMs: DAY }),
  );
  assert.deepEqual(foreignDelayed, []);
  // Appending under tenant-b does not disturb tenant-a's timeline.
  const appended = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-b'),
    observation: draft('tenant-b-only', T1),
  });
  assert.ok(!('error' in appended));
  const stillSix = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T4) }));
  assert.equal(stillSix.length, APPEND_ORDER.length);
  const tenantBSeesOwn = asArray(await machine.replayHistorical(scopeOf('tenant-b'), { asOf: timestamp(T4) }));
  assert.deepEqual(tenantBSeesOwn.map((observation) => observation.observedAt), [T1]);
});

test('observation drafts validate fail-closed (metrics, sources, timestamp, regime)', async () => {
  const machine = createInMemoryTimeMachine();
  const cases: readonly Partial<HistoricalObservationDraft>[] = [
    { metrics: [] },
    { metrics: [{ metric: '', value: 1, unit: 'people' }] },
    { metrics: [{ metric: 'reach', value: Number.POSITIVE_INFINITY, unit: 'people' }] },
    { sourceRefs: [] },
    { sourceRefs: [''] },
    { observedAt: timestamp('soon') },
    { regime: '' },
  ];
  for (const overrides of cases) {
    const result = await machine.appendHistoricalObservation({
      scope: scopeOf('tenant-a'),
      observation: { ...draft('bad', T0), ...overrides } as HistoricalObservationDraft,
    });
    assert.ok('error' in result && result.error === 'invalid-input', `draft ${JSON.stringify(overrides)} must be rejected`);
  }
});
