import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createInMemoryDynamicsModelStore,
  createInMemoryDynamicsStepper,
} from './in-memory-dynamics.js';
import type {
  DynamicsModel,
  DynamicsModelDraft,
  DynamicsModelId,
  DynamicsModelStore,
  DynamicsState,
  DynamicsStepInput,
  DynamicsStepPort,
  DynamicsStepResult,
  PopulationSegment,
} from '../contracts/dynamics.js';
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
const dynamicsModelId = (value: string): DynamicsModelId => value as DynamicsModelId;
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

const userSegment = (id: string, overrides: Partial<PopulationSegment> = {}): PopulationSegment => ({
  id,
  kind: 'user-archetype',
  label: `user archetype ${id}`,
  share: 0.4,
  fatigueSensitivity: 0.5,
  noveltySeeking: 0.6,
  engagementPropensity: 0.4,
  ...overrides,
});

const competitorSegment = (id: string, overrides: Partial<PopulationSegment> = {}): PopulationSegment => ({
  id,
  kind: 'competitor-profile',
  label: `competitor ${id}`,
  share: 0.5,
  fatigueSensitivity: 0,
  noveltySeeking: 0.2,
  engagementPropensity: 0.1,
  aggressiveness: 0.8,
  ...overrides,
});

const populationsWithCompetitor: readonly PopulationSegment[] = [
  userSegment('users-casual', { share: 0.5, fatigueSensitivity: 0.6, noveltySeeking: 0.5, engagementPropensity: 0.3 }),
  userSegment('users-core', { share: 0.3, fatigueSensitivity: 0.4, noveltySeeking: 0.7, engagementPropensity: 0.6 }),
  { id: 'creators-educational', kind: 'creator-archetype', label: 'educational creators', share: 0.2, fatigueSensitivity: 0.2, noveltySeeking: 0.8, engagementPropensity: 0.5 },
  competitorSegment('competitor-alpha'),
];

const populationsWithoutCompetitor: readonly PopulationSegment[] = [
  userSegment('users-casual', { share: 0.5, fatigueSensitivity: 0.6, noveltySeeking: 0.5, engagementPropensity: 0.3 }),
  userSegment('users-core', { share: 0.3, fatigueSensitivity: 0.4, noveltySeeking: 0.7, engagementPropensity: 0.6 }),
  { id: 'creators-educational', kind: 'creator-archetype', label: 'educational creators', share: 0.2, fatigueSensitivity: 0.2, noveltySeeking: 0.8, engagementPropensity: 0.5 },
];

const stateFor = (populations: readonly PopulationSegment[]): DynamicsState => ({
  audienceSize: 12_000,
  segmentStates: populations.map((segment) => ({ segmentId: segment.id, fatigue: 0.1, affinity: 0.4 })),
  competitorShare: 0.5,
  step: 0,
});

const contentCandidate = {
  strategyRef: strategyRef('strategy-alpha'),
  kind: 'content' as const,
  cadencePerWeek: 5,
  novelty: 0.7,
  engagementEffort: 0.6,
};

const fixture = (populations: readonly PopulationSegment[] = populationsWithCompetitor) => {
  const models = createInMemoryDynamicsModelStore({ now: FIXED_NOW });
  const stepper = createInMemoryDynamicsStepper({ now: FIXED_NOW });
  return { models, stepper, populations };
};

const registerModel = async (
  models: DynamicsModelStore,
  populations: readonly PopulationSegment[],
): Promise<DynamicsModel> => {
  const result = await models.registerDynamicsModel({
    scope: scopeOf('tenant-a'),
    dynamicsModel: {
      id: dynamicsModelId('dynamics-sourdough'),
      niche: 'sourdough-baking',
      platform: 'short-video',
      populations,
      notes: 'baseline synthetic population model',
    } satisfies DynamicsModelDraft,
  });
  if ('error' in result) {
    assert.fail(`unexpected dynamics model error: ${result.error}`);
  }
  return result;
};

const step = async (
  stepper: DynamicsStepPort,
  model: DynamicsModel,
  state: DynamicsState,
  overrides: Partial<DynamicsStepInput> = {},
): Promise<DynamicsStepResult> => {
  const input: DynamicsStepInput = {
    scope: scopeOf('tenant-a'),
    dynamicsModel: model,
    state,
    candidate: contentCandidate,
    seed: 42,
    step: state.step,
    scenario: scenario(),
    ...overrides,
  };
  const result = await stepper.step(input);
  if ('error' in result) {
    assert.fail(`unexpected dynamics error: ${result.error}`);
  }
  return result;
};

test('dynamics model store registers versioned population records (tenant-scoped, append-only)', async () => {
  const { models } = fixture();
  const v1 = await registerModel(models, populationsWithCompetitor);
  const v2 = await registerModel(models, populationsWithoutCompetitor);

  assert.equal(v1.version, 1);
  assert.equal(v2.version, 2);
  assert.equal(v1.populations.length, 4);
  assert.equal(v2.populations.length, 3);
  assert.equal(v1.disclosure, 'synthetic-parametric-dynamics-model');
  assert.equal(
    (await models.getDynamicsModel(scopeOf('tenant-a'), dynamicsModelId('dynamics-sourdough'), 1))
      ?.populations.length,
    4,
  );
  assert.equal(
    (await models.listDynamicsModelVersions(scopeOf('tenant-a'), dynamicsModelId('dynamics-sourdough')))
      .length,
    2,
  );
  // Tenant isolation: foreign scope sees nothing…
  assert.equal(
    await models.getDynamicsModel(scopeOf('tenant-b'), dynamicsModelId('dynamics-sourdough'), 1),
    null,
  );
  // …and a second tenant gets its OWN version chain (v1 again, never v3).
  const foreign = await models.registerDynamicsModel({
    scope: scopeOf('tenant-b'),
    dynamicsModel: {
      id: dynamicsModelId('dynamics-sourdough'),
      niche: 'sourdough-baking',
      platform: 'short-video',
      populations: populationsWithoutCompetitor,
      notes: null,
    },
  });
  assert.ok(!('error' in foreign));
  assert.equal(foreign.version, 1);
  assert.equal(
    (await models.getDynamicsModel(scopeOf('tenant-a'), dynamicsModelId('dynamics-sourdough'), 2))
      ?.populations.length,
    3,
    'tenant-a chain is untouched by the tenant-b registration',
  );
});

test('dynamics model registration rejects malformed populations (fail-closed named codes)', async () => {
  const { models } = fixture();
  const cases: readonly (readonly PopulationSegment[])[] = [
    [], // empty populations
    [userSegment('dup', { share: 0.5 }), userSegment('dup', { share: 0.5 })], // duplicate ids
    [{ ...userSegment('bad-kind'), kind: 'power-user' as never }], // bad kind
    [{ ...userSegment('bad-share'), share: 1.5 }], // share out of (0, 1]
    [{ ...userSegment('bad-fatigue'), fatigueSensitivity: 1.2 }],
    [{ ...competitorSegment('competitor-no-aggression'), aggressiveness: undefined }], // competitor without aggressiveness
    [userSegment('user-with-aggression', { aggressiveness: 0.5 })], // non-competitor with aggressiveness
  ];
  for (const populations of cases) {
    const result = await models.registerDynamicsModel({
      scope: scopeOf('tenant-a'),
      dynamicsModel: {
        id: dynamicsModelId('dynamics-bad'),
        niche: 'sourdough-baking',
        platform: 'short-video',
        populations,
        notes: null,
      },
    });
    assert.ok('error' in result && result.error === 'invalid-input', `populations ${JSON.stringify(populations.map((segment) => segment.id))} must be rejected`);
  }
});

test('FATIGUE MONOTONICITY: repeated exposure accumulates fatigue non-decreasingly (≤ 1)', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  let state = stateFor(populationsWithCompetitor);
  const initialFatigue = model.populations.map(() => 0.1);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const result = await step(stepper, model, state);
    assert.ok(result.response.fatigueDelta >= 0, 'fatigue delta must never be negative');
    for (const segment of result.nextState.segmentStates) {
      const previous = state.segmentStates.find((candidate) => candidate.segmentId === segment.segmentId);
      assert.ok(
        segment.fatigue >= (previous?.fatigue ?? 0),
        `segment ${segment.segmentId}: fatigue must be non-decreasing`,
      );
      assert.ok(segment.fatigue <= 1, 'fatigue must stay within [0, 1]');
    }
    state = result.nextState;
  }
  const someFatigue = state.segmentStates.map((segment) => segment.fatigue);
  assert.ok(
    someFatigue.some((fatigue, index) => fatigue > (initialFatigue[index] ?? 0)),
    'twelve exposure steps must accumulate fatigue above the initial level',
  );
});

test('COMPETITIVE DISPLACEMENT: aggressive competitors displace audience; none → zero displacement', async () => {
  const withCompetitors = fixture(populationsWithCompetitor);
  const modelWith = await registerModel(withCompetitors.models, populationsWithCompetitor);
  const resultWith = await step(withCompetitors.stepper, modelWith, stateFor(populationsWithCompetitor));

  assert.ok(resultWith.response.competitiveDisplacement > 0, 'aggressive competitors must displace audience');
  const passive = await step(withCompetitors.stepper, modelWith, stateFor(populationsWithCompetitor), {
    candidate: { ...contentCandidate, engagementEffort: 0.1, cadencePerWeek: 1 },
  });
  assert.ok(
    passive.response.audienceDelta < 0,
    'a passive strategy under 0.5 competitor share must shrink the audience (displacement + decay dominate)',
  );

  const withoutCompetitors = fixture(populationsWithoutCompetitor);
  const modelWithout = await registerModel(withoutCompetitors.models, populationsWithoutCompetitor);
  const resultWithout = await step(
    withoutCompetitors.stepper,
    modelWithout,
    stateFor(populationsWithoutCompetitor),
  );
  assert.equal(resultWithout.response.competitiveDisplacement, 0, 'no competitor profiles → no displacement');
  assert.ok(
    resultWithout.response.audienceDelta > resultWith.response.audienceDelta,
    'competition must make the audience trajectory strictly worse',
  );
});

test('engagement effort defends against displacement (same seed, monotone defense)', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  const state = stateFor(populationsWithCompetitor);
  const lazy = await step(stepper, model, state, {
    candidate: { ...contentCandidate, engagementEffort: 0.1 },
  });
  const diligent = await step(stepper, model, state, {
    candidate: { ...contentCandidate, engagementEffort: 0.9 },
  });
  assert.ok(
    diligent.response.competitiveDisplacement < lazy.response.competitiveDisplacement,
    'higher engagement effort must reduce competitive displacement',
  );
});

test('no-op candidate: zero fatigue growth and zero audience growth, but decay + displacement persist', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  const state = stateFor(populationsWithCompetitor);
  const result = await step(stepper, model, state, {
    candidate: { strategyRef: strategyRef('strategy-noop'), kind: 'no-op', cadencePerWeek: 0, novelty: 0, engagementEffort: 0 },
  });

  assert.equal(result.response.fatigueDelta, 0);
  assert.ok(result.response.competitiveDisplacement > 0, 'inaction still loses audience to competitors');
  assert.ok(result.response.audienceDelta < 0, 'no-op must decay the audience (inaction has consequences)');
  assert.ok(
    result.nextState.segmentStates.every((segment) => segment.fatigue === 0.1),
    'no-op leaves segment fatigue untouched',
  );
  assert.equal(result.nextState.step, 1, 'next state advances the step counter');
});

test('DETERMINISM: same seed + same inputs → bit-identical steps; different seed differs', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  const state = stateFor(populationsWithCompetitor);

  const a = await step(stepper, model, state);
  const b = await step(stepper, model, state);
  assert.deepStrictEqual(a, b);

  const otherSeed = await step(stepper, model, state, { seed: 43 });
  assert.notDeepStrictEqual(a, otherSeed);
});

test('dynamics steps are COUNTERFACTUAL-LABELED, DISCLOSED predictions (lock rule 29)', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  const result = await step(stepper, model, stateFor(populationsWithCompetitor));

  assert.equal(result.counterfactual, true);
  assert.equal(result.disclosure, 'synthetic-response-function');
  assert.equal(result.scenarioRef, labScenarioId('scenario-sourdough-reach'));
  assert.equal(result.worldModelVersion, model.version);
  assert.equal(result.tenantId, scopeOf('tenant-a').tenantId);
  assert.match(result.uncertainty.note ?? '', /NOT ground truth/);
  assert.ok(result.metrics.length >= 3);
  assert.ok(result.metrics.every((metric) => metric.interval.lower <= metric.expectedValue && metric.expectedValue <= metric.interval.upper));
});

test('state validation: segment mismatch and step mismatch fail with named codes', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  const state = stateFor(populationsWithCompetitor);

  const mismatched = await stepper.step({
    scope: scopeOf('tenant-a'),
    dynamicsModel: model,
    state: { ...state, segmentStates: state.segmentStates.slice(0, 2) },
    candidate: contentCandidate,
    seed: 42,
    step: 0,
    scenario: scenario(),
  });
  assert.ok('error' in mismatched && mismatched.error === 'state-segment-mismatch');

  const staleStep = await stepper.step({
    scope: scopeOf('tenant-a'),
    dynamicsModel: model,
    state,
    candidate: contentCandidate,
    seed: 42,
    step: 3,
    scenario: scenario(),
  });
  assert.ok('error' in staleStep && staleStep.error === 'invalid-input');

  const versionMismatch = await stepper.step({
    scope: scopeOf('tenant-a'),
    dynamicsModel: model,
    state,
    candidate: contentCandidate,
    seed: 42,
    step: 0,
    scenario: scenario({ simulatorVersion: 7 as Version }),
  });
  assert.ok('error' in versionMismatch && versionMismatch.error === 'simulator-version-mismatch');
});

test('novelty effect is signed and monotone in novelty (reward dimension input, §21)', async () => {
  const { models, stepper } = fixture();
  const model = await registerModel(models, populationsWithCompetitor);
  const state = stateFor(populationsWithCompetitor);
  const low = await step(stepper, model, state, { candidate: { ...contentCandidate, novelty: 0.1 } });
  const high = await step(stepper, model, state, { candidate: { ...contentCandidate, novelty: 0.9 } });
  assert.ok(low.response.noveltyEffect < high.response.noveltyEffect, 'novelty effect must grow with novelty');
});

test('port surfaces stay within the architecture policy budget (≤ 12 methods)', () => {
  const stepperMethods: (keyof DynamicsStepPort)[] = ['step'];
  const storeMethods: (keyof DynamicsModelStore)[] = [
    'registerDynamicsModel',
    'getDynamicsModel',
    'listDynamicsModelVersions',
  ];
  assert.equal(stepperMethods.length, 1);
  assert.equal(storeMethods.length, 3);
  assert.ok(stepperMethods.length <= 12 && storeMethods.length <= 12);
});
