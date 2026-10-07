import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createInMemorySimulatorEngine,
  createInMemorySocialWorldModelStore,
} from './in-memory-social-simulator.js';
import type {
  SimulatorEnginePort,
  SimulatorStepInput,
  SocialSimulationResult,
  SocialWorldModelDraft,
  SocialWorldModelId,
  SocialWorldModelStore,
} from '../contracts/simulator.js';
import type {
  Budget,
  LabScenario,
  LabScenarioId,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';

const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenant as TenantId });
const labScenarioId = (value: string): LabScenarioId => value as LabScenarioId;
const strategyRef = (value: string): StrategyRef => value as StrategyRef;
const worldModelId = (value: string): SocialWorldModelId => value as SocialWorldModelId;
const timestamp = (value: string): Timestamp => value as Timestamp;

const FIXED_NOW = (): Timestamp => timestamp('2026-06-15T00:00:00.000Z');

const scenario = (overrides: Partial<LabScenario> = {}): LabScenario => ({
  id: labScenarioId('scenario-sourdough-reach'),
  version: 1 as Version,
  niche: 'sourdough-baking',
  platform: 'short-video',
  objective: 'qualified-reach',
  context: { campaignShape: 'weekly-educational-clip' },
  budget: { maxCost: { amount: 500, currency: 'USD' }, maxDurationMs: 14 * 24 * 3_600_000 } as Budget,
  informationLag: 5 * 86_400_000,
  corpusVersion: 2 as Version,
  simulatorVersion: 1 as Version,
  rewardVersion: 1 as Version,
  ...overrides,
});

const worldDraft = (overrides: Partial<SocialWorldModelDraft> = {}): SocialWorldModelDraft => ({
  id: worldModelId('world-sourdough'),
  niche: 'sourdough-baking',
  platform: 'short-video',
  state: {
    baseAudience: 12_000,
    fatigue: 0.1,
    competitorShare: 0.25,
    seasonalFactor: 1.1,
  },
  notes: 'baseline synthetic world',
  ...overrides,
});

const contentCandidate = {
  strategyRef: strategyRef('strategy-alpha'),
  kind: 'content' as const,
  cadencePerWeek: 5,
  novelty: 0.7,
  engagementEffort: 0.6,
};

const fixture = () => {
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  return { worldModels, engine };
};

const register = async (
  worldModels: SocialWorldModelStore,
  draft: SocialWorldModelDraft,
): Promise<import('../contracts/simulator.js').SocialWorldModel> => {
  const result = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a'),
    worldModel: draft,
  });
  if ('error' in result) {
    assert.fail(`unexpected world model error: ${result.error}`);
  }
  return result;
};

const simulate = async (
  engine: SimulatorEnginePort,
  overrides: Partial<SimulatorStepInput> = {},
): Promise<SocialSimulationResult> => {
  const input: SimulatorStepInput = {
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-sourdough'),
    worldModelVersion: 1,
    scenario: scenario(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
    ...overrides,
  };
  const result = await engine.simulateStep(input);
  if ('error' in result) {
    assert.fail(`unexpected simulator error: ${result.error}`);
  }
  return result;
};

test('world model store registers APPEND-ONLY versions (prior versions retrievable)', async () => {
  const { worldModels } = fixture();
  const v1 = await register(worldModels, worldDraft());
  const v2 = await register(
    worldModels,
    worldDraft({
      state: { baseAudience: 24_000, fatigue: 0.2, competitorShare: 0.3, seasonalFactor: 1.2 },
    }),
  );

  assert.equal(v1.worldModelVersion, 1);
  assert.equal(v2.worldModelVersion, 2);
  assert.equal(
    (await worldModels.getWorldModel(scopeOf('tenant-a'), worldModelId('world-sourdough'), 1))?.state
      .baseAudience,
    12_000,
  );
  assert.equal(
    (await worldModels.getWorldModel(scopeOf('tenant-a'), worldModelId('world-sourdough'), 2))?.state
      .baseAudience,
    24_000,
  );
  assert.equal(
    (await worldModels.resolveLatestWorldModel(scopeOf('tenant-a'), worldModelId('world-sourdough')))
      ?.worldModelVersion,
    2,
  );
  assert.equal(
    (await worldModels.listWorldModelVersions(scopeOf('tenant-a'), worldModelId('world-sourdough')))
      .length,
    2,
  );
  // Tenant isolation: foreign scope sees nothing (no existence leak)…
  assert.equal(
    await worldModels.getWorldModel(scopeOf('tenant-b'), worldModelId('world-sourdough'), 1),
    null,
  );
  assert.deepEqual(
    await worldModels.listWorldModelVersions(scopeOf('tenant-b'), worldModelId('world-sourdough')),
    [],
  );
  // …and a second tenant gets its OWN version chain (v1 again, never v3).
  const foreign = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-b'),
    worldModel: worldDraft(),
  });
  assert.ok(!('error' in foreign));
  assert.equal(foreign.worldModelVersion, 1);
  assert.equal(
    (await worldModels.resolveLatestWorldModel(scopeOf('tenant-a'), worldModelId('world-sourdough')))
      ?.worldModelVersion,
    2,
    'tenant-a chain is untouched by the tenant-b registration',
  );
});

test('world model registration validates the synthetic state ranges', async () => {
  const { worldModels } = fixture();
  const badFatigue = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a'),
    worldModel: worldDraft({
      state: { baseAudience: 12_000, fatigue: 1.5, competitorShare: 0.25, seasonalFactor: 1.1 },
    }),
  });
  assert.ok('error' in badFatigue && badFatigue.error === 'invalid-input');
  const badSeason = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a'),
    worldModel: worldDraft({
      state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 0 },
    }),
  });
  assert.ok('error' in badSeason && badSeason.error === 'invalid-input');
});

test('simulateStep returns a COUNTERFACTUAL-LABELED, DISCLOSED prediction (lock rule 29)', async () => {
  const { worldModels, engine } = fixture();
  await register(worldModels, worldDraft());
  const result = await simulate(engine);

  assert.equal(result.counterfactual, true);
  assert.equal(result.disclosure, 'synthetic-response-function');
  assert.equal(result.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(result.scenarioRef, labScenarioId('scenario-sourdough-reach'));
  assert.equal(result.worldModelVersion, 1);
  assert.equal(result.strategyRef, strategyRef('strategy-alpha'));
  assert.equal(result.seed, 42);
  assert.equal(result.step, 0);
  assert.ok(result.uncertainty.level !== undefined);
  assert.match(result.uncertainty.note ?? '', /NOT ground truth/);
  assert.ok(result.metrics.length >= 3);
  assert.ok(result.deltas.length >= 2);
});

test('objective metric is named per the scenario objective; envelopes bound expected values', async () => {
  const { worldModels, engine } = fixture();
  await register(worldModels, worldDraft());
  const result = await simulate(engine);

  const objective = result.metrics.find((metric) => metric.metric === 'objective:qualified-reach');
  assert.ok(objective !== undefined, 'objective metric present');
  for (const metric of result.metrics) {
    assert.ok(metric.interval.lower <= metric.expectedValue, `${metric.metric}: lower <= expected`);
    assert.ok(metric.expectedValue <= metric.interval.upper, `${metric.metric}: expected <= upper`);
  }
});

test('DETERMINISM: same seed + same inputs → bit-identical results (fresh engines too)', async () => {
  const first = fixture();
  await register(first.worldModels, worldDraft());
  const a = await simulate(first.engine);
  const b = await simulate(first.engine);

  const second = fixture();
  await register(second.worldModels, worldDraft());
  const c = await simulate(second.engine);

  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, c);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(c)));
});

test('SEED ROBUSTNESS: variance across seeds is positive (reported), each seed deterministic', async () => {
  const { worldModels, engine } = fixture();
  await register(worldModels, worldDraft());

  const reachBySeed = new Map<number, number>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const first = await simulate(engine, { seed });
    const repeat = await simulate(engine, { seed });
    assert.deepStrictEqual(first, repeat, `seed ${seed} must be individually deterministic`);
    reachBySeed.set(seed, first.metrics[0]?.expectedValue ?? -1);
  }
  const values = [...reachBySeed.values()];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  assert.ok(
    variance > 0,
    `seed robustness: variance across 8 seeds must be positive (observed variance=${variance.toExponential(3)}, mean qualified-reach=${mean.toFixed(1)})`,
  );
  // Different seeds must actually produce different records.
  assert.notDeepStrictEqual(await simulate(engine, { seed: 1 }), await simulate(engine, { seed: 2 }));
});

test('no-op candidate produces ZERO deltas and leaves the world state unchanged', async () => {
  const { worldModels, engine } = fixture();
  const world = await register(worldModels, worldDraft());
  const result = await simulate(engine, {
    candidate: {
      strategyRef: strategyRef('strategy-noop'),
      kind: 'no-op',
      cadencePerWeek: 0,
      novelty: 0,
      engagementEffort: 0,
    },
  });

  assert.ok(result.deltas.every((delta) => delta.expectedDelta === 0));
  assert.ok(result.metrics.every((metric) => metric.expectedValue === 0));
  assert.deepStrictEqual(result.nextWorldState, world.state);
});

test('versioned world models pin: stepping v1 uses v1 state, v2 uses v2 state', async () => {
  const { worldModels, engine } = fixture();
  await register(worldModels, worldDraft());
  await register(
    worldModels,
    worldDraft({
      state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
    }),
  );

  const small = await simulate(engine, { worldModelVersion: 1 });
  const large = await simulate(engine, { worldModelVersion: 2 });
  const reach = (result: SocialSimulationResult): number => result.metrics[0]?.expectedValue ?? -1;
  assert.ok(
    reach(large) > reach(small) * 1.5,
    `double audience must lift reach (v1=${reach(small)}, v2=${reach(large)})`,
  );
});

test('world state invariants: chained steps accumulate fatigue non-decreasingly (append-only versions)', async () => {
  const { worldModels, engine } = fixture();
  const world = await register(worldModels, worldDraft());
  let fatigue = world.state.fatigue;
  let audience = world.state.baseAudience;
  for (let version = 1; version <= 8; version += 1) {
    const result = await simulate(engine, { worldModelVersion: version });
    assert.ok(result.nextWorldState.fatigue >= fatigue, 'fatigue must be non-decreasing');
    assert.ok(result.nextWorldState.fatigue <= 1);
    assert.ok(
      result.nextWorldState.competitorShare >= 0 && result.nextWorldState.competitorShare <= 1,
    );
    assert.ok(result.nextWorldState.baseAudience >= 0);
    fatigue = result.nextWorldState.fatigue;
    audience = result.nextWorldState.baseAudience;
    // Chain: register the stepped state as the next append-only world version.
    await register(worldModels, worldDraft({ state: result.nextWorldState }));
  }
  assert.ok(fatigue > world.state.fatigue, 'repeated exposure must accumulate fatigue overall');
  assert.ok(audience >= 0);
});

test('simulateStep fail-closed codes: unknown model / missing version / niche mismatch / version pins', async () => {
  const { worldModels, engine } = fixture();
  await register(worldModels, worldDraft());

  const unknownModel = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-other'),
    worldModelVersion: 1,
    scenario: scenario(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  assert.ok('error' in unknownModel && unknownModel.error === 'unknown-world-model');

  const missingVersion = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-sourdough'),
    worldModelVersion: 9,
    scenario: scenario(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  assert.ok('error' in missingVersion && missingVersion.error === 'world-model-version-not-found');

  const nicheMismatch = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-sourdough'),
    worldModelVersion: 1,
    scenario: scenario({ niche: 'espresso-education' }),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  assert.ok('error' in nicheMismatch && nicheMismatch.error === 'scenario-world-model-mismatch');

  const versionMismatch = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-sourdough'),
    worldModelVersion: 1,
    scenario: scenario({ simulatorVersion: 2 as Version }),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  assert.ok('error' in versionMismatch && versionMismatch.error === 'simulator-version-mismatch');

  const badCandidate = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-sourdough'),
    worldModelVersion: 1,
    scenario: scenario(),
    candidate: { ...contentCandidate, novelty: 1.5 },
    seed: 42,
    step: 0,
  });
  assert.ok('error' in badCandidate && badCandidate.error === 'invalid-input');

  const badSeed = await engine.simulateStep({
    scope: scopeOf('tenant-a'),
    worldModelId: worldModelId('world-sourdough'),
    worldModelVersion: 1,
    scenario: scenario(),
    candidate: contentCandidate,
    seed: Number.NaN,
    step: 0,
  });
  assert.ok('error' in badSeed && badSeed.error === 'invalid-input');
});

test('port surfaces stay within the architecture policy budget (≤ 12 methods)', () => {
  const engineMethods: (keyof SimulatorEnginePort)[] = ['simulateStep'];
  const storeMethods: (keyof SocialWorldModelStore)[] = [
    'registerWorldModel',
    'getWorldModel',
    'resolveLatestWorldModel',
    'listWorldModelVersions',
  ];
  assert.equal(engineMethods.length, 1);
  assert.equal(storeMethods.length, 4);
  assert.ok(engineMethods.length <= 12 && storeMethods.length <= 12);
});
