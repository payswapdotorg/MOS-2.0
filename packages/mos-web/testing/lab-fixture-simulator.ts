import type { TenantId, Timestamp, UncertaintySummary } from '@mos/contracts';
import type {
  CounterfactualBranchFixture,
  CounterfactualBranchRecordFixture,
  DynamicsModelFixture,
  HistoricalObservationFixture,
  SocialSimulationResultFixture,
  SocialWorldModelFixture,
} from './lab-fixture-workspace-shapes.js';
import { strategyRefOf } from './lab-fixture-corpus.js';

/**
 * REAL-shaped LAB-004/005/006 fixture RECORDS (the Lab workspace composition
 * seam): the versioned social world models, the population-resolved
 * dynamics model, the deterministic seed-required simulation runs
 * (counterfactual: true, disclosed synthetic), the MEASURED historical
 * observations (counterfactual: false — lock rule 29), and the Time
 * Machine's counterfactual branches with their recorded predictions.
 *
 * The world-model version pins stay coherent with the LAB-017 fixtures:
 * `wm-sim-primary` reaches version 4 and `wm-sim-pessimistic` version 3 —
 * the member versions the `ensemble-reach-primary` pins cite.
 */

const T0: TenantId = 'tenant-demo' as never;
const T_OTHER: TenantId = 'tenant-other' as never;

const ts = (day: string): Timestamp => `2026-${day}T12:00:00.000Z` as never;

const UNCERTAINTY: UncertaintySummary = {
  level: 'moderate',
  note: 'seeded synthetic response function over the pinned world model version',
};

// ——— LAB-004: the social world models (append-only version chains) ———

export const FIXTURE_WORLD_MODELS: readonly SocialWorldModelFixture[] = [
  {
    id: 'wm-sim-primary' as never,
    worldModelVersion: 3 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    state: { baseAudience: 42000, fatigue: 0.18, competitorShare: 0.22, seasonalFactor: 1.05 },
    createdAt: ts('02-05'),
    notes: 'primary world model v3: post-holiday audience baseline',
    disclosure: 'synthetic-parametric-world-model',
  },
  {
    id: 'wm-sim-primary' as never,
    worldModelVersion: 4 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    state: { baseAudience: 46500, fatigue: 0.22, competitorShare: 0.24, seasonalFactor: 1.08 },
    createdAt: ts('03-05'),
    notes: 'primary world model v4: the version every reach-scenario run pins',
    disclosure: 'synthetic-parametric-world-model',
  },
  {
    id: 'wm-sim-pessimistic' as never,
    worldModelVersion: 2 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    state: { baseAudience: 31000, fatigue: 0.35, competitorShare: 0.38, seasonalFactor: 0.96 },
    createdAt: ts('02-06'),
    notes: 'pessimistic world model v2: the ensemble-reach-primary second member',
    disclosure: 'synthetic-parametric-world-model',
  },
  {
    id: 'wm-sim-pessimistic' as never,
    worldModelVersion: 3 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    state: { baseAudience: 29500, fatigue: 0.38, competitorShare: 0.41, seasonalFactor: 0.95 },
    createdAt: ts('03-06'),
    notes: 'pessimistic world model v3: launch-week competitive pressure',
    disclosure: 'synthetic-parametric-world-model',
  },
  {
    id: 'wm-other-901' as never,
    worldModelVersion: 1 as never,
    tenantId: T_OTHER,
    niche: 'home-espresso',
    platform: 'short-video',
    state: { baseAudience: 9000, fatigue: 0.1, competitorShare: 0.3, seasonalFactor: 1 },
    createdAt: ts('03-07'),
    notes: null,
    disclosure: 'synthetic-parametric-world-model',
  },
];

// ——— LAB-005: the population-resolved dynamics model ———

export const FIXTURE_DYNAMICS_MODELS: readonly DynamicsModelFixture[] = [
  {
    id: 'dyn-sourdough-segments' as never,
    version: 2 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    populations: [
      {
        id: 'seg-home-bakers',
        kind: 'user',
        label: 'Home bakers',
        share: 0.72,
        fatigueSensitivity: 0.6,
        noveltySeeking: 0.55,
        engagementPropensity: 0.4,
      },
      {
        id: 'seg-creator-educators',
        kind: 'creator',
        label: 'Creator educators',
        share: 0.18,
        fatigueSensitivity: 0.3,
        noveltySeeking: 0.8,
        engagementPropensity: 0.65,
      },
      {
        id: 'seg-kit-competitors',
        kind: 'competitor-profile',
        label: 'Starter-kit competitors',
        share: 0.1,
        fatigueSensitivity: 0.2,
        noveltySeeking: 0.4,
        engagementPropensity: 0.5,
        aggressiveness: 0.7,
      },
    ],
    createdAt: ts('03-08'),
    notes: 'dynamics model v2: segment-resolved fatigue + competitor pressure',
    disclosure: 'synthetic-parametric-dynamics-model',
  },
];

// ——— LAB-004: the simulation runs (seed-required, counterfactual) ———

export const FIXTURE_SIMULATION_RUNS: readonly SocialSimulationResultFixture[] = [
  {
    id: 'simrun-001' as never,
    version: 1 as never,
    tenantId: T0,
    scenarioRef: 'scenario-reach-sourdough',
    worldModelVersion: 4 as never,
    simulatorVersion: 4 as never,
    strategyRef: strategyRefOf('strategy:clip-daily-5'),
    seed: 11,
    step: 3,
    metrics: [
      {
        metric: 'qualified-reach',
        expectedValue: 18200,
        interval: { lower: 16400, upper: 19900 },
        unit: 'accounts',
      },
      {
        metric: 'engagement-rate',
        expectedValue: 0.062,
        interval: { lower: 0.051, upper: 0.073 },
        unit: 'ratio',
      },
    ],
    predictedAt: ts('03-16'),
    uncertainty: UNCERTAINTY,
    counterfactual: true,
    disclosure: 'synthetic-response-function',
    deltas: [
      {
        metric: 'qualified-reach',
        expectedDelta: 1450,
        interval: { lower: 980, upper: 1930 },
        unit: 'accounts',
      },
    ],
    nextWorldState: { baseAudience: 46800, fatigue: 0.27, competitorShare: 0.24, seasonalFactor: 1.08 },
  },
  {
    id: 'simrun-002' as never,
    version: 1 as never,
    tenantId: T0,
    scenarioRef: 'scenario-reach-sourdough',
    worldModelVersion: 4 as never,
    simulatorVersion: 4 as never,
    strategyRef: strategyRefOf('strategy:learned-remix-2'),
    seed: 23,
    step: 6,
    metrics: [
      {
        metric: 'qualified-reach',
        expectedValue: 15900,
        interval: { lower: 14100, upper: 17700 },
        unit: 'accounts',
      },
      {
        metric: 'fatigue',
        expectedValue: 0.19,
        interval: { lower: 0.14, upper: 0.24 },
        unit: 'ratio',
      },
    ],
    predictedAt: ts('03-17'),
    uncertainty: UNCERTAINTY,
    counterfactual: true,
    disclosure: 'synthetic-response-function',
    deltas: [
      {
        metric: 'qualified-reach',
        expectedDelta: 820,
        interval: { lower: 410, upper: 1240 },
        unit: 'accounts',
      },
    ],
    nextWorldState: { baseAudience: 46600, fatigue: 0.23, competitorShare: 0.25, seasonalFactor: 1.08 },
  },
  {
    id: 'simrun-003' as never,
    version: 1 as never,
    tenantId: T0,
    scenarioRef: 'scenario-launch-starterkit',
    worldModelVersion: 3 as never,
    simulatorVersion: 4 as never,
    strategyRef: strategyRefOf('strategy:noop-launch'),
    seed: 7,
    step: 2,
    metrics: [
      {
        metric: 'qualified-reach',
        expectedValue: 9800,
        interval: { lower: 9100, upper: 10500 },
        unit: 'accounts',
      },
    ],
    predictedAt: ts('03-18'),
    uncertainty: { level: 'low', note: 'the no-op candidate leaves the world state unchanged' },
    counterfactual: true,
    disclosure: 'synthetic-response-function',
    deltas: [],
    nextWorldState: { baseAudience: 31000, fatigue: 0.35, competitorShare: 0.38, seasonalFactor: 0.96 },
  },
];

// ——— LAB-006: the historical timeline (MEASURED reality — lock rule 29) ———

export const FIXTURE_HISTORICAL_OBSERVATIONS: readonly HistoricalObservationFixture[] = [
  {
    id: 'obs-001' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    metrics: [
      { metric: 'qualified-reach', value: 12100, unit: 'accounts' },
      { metric: 'engagement-rate', value: 0.055, unit: 'ratio' },
    ],
    observedAt: ts('02-01'),
    sourceRefs: ['https://example.org/hb-analytics/week-05-export'],
    regime: 'organic-baseline',
    counterfactual: false,
  },
  {
    id: 'obs-002' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    metrics: [{ metric: 'qualified-reach', value: 13400, unit: 'accounts' }],
    observedAt: ts('02-15'),
    sourceRefs: ['https://example.org/hb-analytics/week-07-export'],
    regime: 'organic-baseline',
    counterfactual: false,
  },
  {
    id: 'obs-003' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    metrics: [
      { metric: 'qualified-reach', value: 10800, unit: 'accounts' },
      { metric: 'fatigue', value: 0.31, unit: 'ratio' },
    ],
    observedAt: ts('03-14'),
    sourceRefs: ['https://example.org/hb-analytics/week-11-export'],
    regime: 'launch-week',
    counterfactual: false,
  },
  {
    id: 'obs-004' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    metrics: [{ metric: 'qualified-reach', value: 11600, unit: 'accounts' }],
    observedAt: ts('03-19'),
    sourceRefs: ['https://example.org/hb-analytics/week-12-export'],
    regime: 'launch-week',
    counterfactual: false,
  },
  {
    id: 'obs-other-901' as never,
    version: 1 as never,
    tenantId: T_OTHER,
    niche: 'home-espresso',
    platform: 'short-video',
    metrics: [{ metric: 'qualified-reach', value: 2100, unit: 'accounts' }],
    observedAt: ts('03-15'),
    sourceRefs: ['https://example.org/espresso/week-11'],
    regime: 'organic-baseline',
    counterfactual: false,
  },
];

// ——— LAB-006: the counterfactual branches (mode 3) ———

export const FIXTURE_BRANCHES: readonly CounterfactualBranchFixture[] = [
  {
    id: 'branch-cf-001' as never,
    version: 1 as never,
    tenantId: T0,
    parentBranchId: null,
    forkPoint: ts('03-01'),
    intervention: {
      description: 'Double the posting cadence of the clip-daily-5 strategy from the historical timeline.',
      changedParameters: { cadencePerWeek: 10, novelty: 0.7 },
    },
    label: 'double-cadence',
    createdAt: ts('03-16'),
    counterfactual: true,
  },
  {
    id: 'branch-cf-002' as never,
    version: 1 as never,
    tenantId: T0,
    parentBranchId: 'branch-cf-001' as never,
    forkPoint: ts('03-05'),
    intervention: {
      description: 'Halve the novelty of the doubled-cadence branch to test fatigue sensitivity.',
      changedParameters: { novelty: 0.35 },
    },
    label: 'low-novelty-child',
    createdAt: ts('03-17'),
    counterfactual: true,
  },
];

export const FIXTURE_BRANCH_RECORDS: readonly CounterfactualBranchRecordFixture[] = [
  {
    id: 'brec-001' as never,
    branchId: 'branch-cf-001' as never,
    prediction: {
      id: 'bpred-001' as never,
      version: 1 as never,
      tenantId: T0,
      scenarioRef: 'scenario-reach-sourdough',
      worldModelVersion: 4 as never,
      simulatorVersion: 4 as never,
      strategyRef: strategyRefOf('strategy:clip-daily-10'),
      seed: 31,
      step: 4,
      metrics: [
        {
          metric: 'qualified-reach',
          expectedValue: 21400,
          interval: { lower: 18800, upper: 24000 },
          unit: 'accounts',
        },
        {
          metric: 'fatigue',
          expectedValue: 0.42,
          interval: { lower: 0.33, upper: 0.51 },
          unit: 'ratio',
        },
      ],
      predictedAt: ts('03-16'),
      uncertainty: UNCERTAINTY,
      counterfactual: true,
      disclosure: 'synthetic-response-function',
    },
    recordedAt: ts('03-16'),
    counterfactual: true,
  },
  {
    id: 'brec-002' as never,
    branchId: 'branch-cf-002' as never,
    prediction: {
      id: 'bpred-002' as never,
      version: 1 as never,
      tenantId: T0,
      scenarioRef: 'scenario-reach-sourdough',
      worldModelVersion: 4 as never,
      simulatorVersion: 4 as never,
      strategyRef: strategyRefOf('strategy:clip-daily-10-low-novelty'),
      seed: 43,
      step: 4,
      metrics: [
        {
          metric: 'qualified-reach',
          expectedValue: 17600,
          interval: { lower: 15300, upper: 19900 },
          unit: 'accounts',
        },
      ],
      predictedAt: ts('03-17'),
      uncertainty: UNCERTAINTY,
      counterfactual: true,
      disclosure: 'synthetic-response-function',
    },
    recordedAt: ts('03-17'),
    counterfactual: true,
  },
];

/**
 * The Time Machine replay declaration the workspace double serves: at T
 * (asOf) under lag L — ONLY information available by T−L is visible
 * (lock rule 30). The 7-day lag withholds obs-004 (2026-03-19) and
 * obs-003 (2026-03-14) from the delayed view at T=2026-03-20: visible are
 * observations with observedAt <= 2026-03-13.
 */
export const FIXTURE_TIME_MACHINE_DECLARATION = {
  asOf: '2026-03-20T00:00:00.000Z',
  lagMs: 604_800_000,
} as const;
