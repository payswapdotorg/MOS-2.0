import type { TenantId, Timestamp } from '@mos/contracts';
import type {
  LabRewardSpecFixture,
  LearnedStrategyCandidateFixture,
  OrganizationSearchResultFixture,
  RankedOrganizationCandidateFixture,
  WorldModelEnsembleFixture,
} from './lab-fixture-strategy-shapes.js';
import { strategyRefOf } from './lab-fixture-corpus.js';
import { REACH_SCENARIO } from './lab-fixture-support.js';

/**
 * REAL-shaped LAB-007..010 fixture RECORDS (the Lab workspace composition
 * seam): the world-model ensembles the strategy surfaces evaluate through
 * (member world-model versions pinned exactly), the versioned
 * mission-compatible reward specs (explicit metric-source bindings, §21),
 * the learned strategy candidates (LAB-009 — simulation experience only,
 * counterfactual-labeled, with full learning traces), and the §23 agent
 * organization search results (LAB-010 — the three-way comparison
 * structurally present on every result).
 *
 * Coherence pins: `ensemble-reach-primary` v3 members are
 * (wm-sim-primary v4, wm-sim-pessimistic v2) and `ensemble-reach-pessimistic`
 * v2 members are (wm-sim-pessimistic v3, wm-sim-alt v5) — the member
 * world-model versions the LAB-017 benchmark provenance pins cite; the
 * learned candidate `learned-remix-2` IS the benchmark's 'remix-2'
 * candidate (same action knobs, producer pin strategy-learning v3).
 */

const T0: TenantId = 'tenant-demo' as never;
const T_OTHER: TenantId = 'tenant-other' as never;

const ts = (day: string): Timestamp => `2026-${day}T12:00:00.000Z` as never;

// ——— LAB-007: the world-model ensembles ———

export const FIXTURE_ENSEMBLES: readonly WorldModelEnsembleFixture[] = [
  {
    id: 'ensemble-reach-primary' as never,
    version: 3 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    members: [
      { id: 'member-primary', worldModelId: 'wm-sim-primary', worldModelVersion: 4, notes: 'primary response function' },
      { id: 'member-pessimistic', worldModelId: 'wm-sim-pessimistic', worldModelVersion: 2, notes: 'conservative second opinion' },
    ],
    weightingPolicy: { id: 'weight-uniform-v1', version: 1, kind: 'uniform' },
    status: 'active',
    createdAt: ts('03-09'),
    notes: 'ensemble v3: the evaluation stack every reach benchmark and strategy run cites',
    disclosure: 'synthetic-ensemble-of-disclosed-response-functions',
  },
  {
    id: 'ensemble-reach-pessimistic' as never,
    version: 2 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    members: [
      { id: 'member-launch-pessimistic', worldModelId: 'wm-sim-pessimistic', worldModelVersion: 3 },
      { id: 'member-alt', worldModelId: 'wm-sim-alt', worldModelVersion: 5 },
    ],
    weightingPolicy: { id: 'weight-uniform-v1', version: 1, kind: 'uniform' },
    status: 'frozen',
    createdAt: ts('03-10'),
    notes: 'frozen conservative ensemble the launch benchmark sweeps over',
    disclosure: 'synthetic-ensemble-of-disclosed-response-functions',
  },
];

// ——— LAB-008/009: the declared reward specs ———

/** The reward spec v2 the reach scenario pins (rewardVersion 2). */
export const FIXTURE_REWARD_SPECS: readonly LabRewardSpecFixture[] = [
  {
    version: 2,
    terms: [
      {
        metric: 'qualified-reach',
        weight: 1,
        direction: 'maximize',
        definition: 'Reach among accounts that engaged with any sourdough clip this quarter.',
        metricSource: 'qualified-reach',
      },
      {
        metric: 'fatigue',
        weight: 0.25,
        direction: 'minimize',
        definition: 'Modeled audience fatigue accumulated over the simulated horizon.',
        metricSource: 'fatigue',
      },
      {
        metric: 'cost',
        weight: 0.5,
        direction: 'minimize',
        definition: 'Simulated production + engine cost of executing the candidate program.',
        metricSource: 'cost',
      },
    ],
  },
];

// ——— LAB-009: the learned strategy candidates ———

export const FIXTURE_LEARNED_CANDIDATES: readonly LearnedStrategyCandidateFixture[] = [
  {
    id: 'learned-remix-2' as never,
    tenantId: T0,
    candidate: {
      strategyRef: strategyRefOf('strategy:learned-remix-2'),
      kind: 'repost',
      cadencePerWeek: 2,
      novelty: 0.35,
      engagementEffort: 0.6,
    },
    horizonSteps: 12,
    trace: {
      iterations: [
        {
          iteration: 1,
          evaluated: [
            {
              candidate: {
                strategyRef: strategyRefOf('strategy:clip-daily-5'),
                kind: 'content',
                cadencePerWeek: 5,
                novelty: 0.7,
                engagementEffort: 0.4,
              },
              estimatedReward: 12.4,
              interval: { lower: 10.1, upper: 14.8 },
            },
            {
              candidate: {
                strategyRef: strategyRefOf('strategy:learned-remix-2'),
                kind: 'repost',
                cadencePerWeek: 2,
                novelty: 0.35,
                engagementEffort: 0.6,
              },
              estimatedReward: 13.1,
              interval: { lower: 11.2, upper: 15.0 },
            },
          ],
          chosen: {
            strategyRef: strategyRefOf('strategy:learned-remix-2'),
            kind: 'repost',
            cadencePerWeek: 2,
            novelty: 0.35,
            engagementEffort: 0.6,
          },
          improvement: 0.7,
          improved: true,
          costs: { simulatedSteps: 240, cumulativeSimulatedSteps: 240 },
        },
        {
          iteration: 2,
          evaluated: [
            {
              candidate: {
                strategyRef: strategyRefOf('strategy:learned-remix-2'),
                kind: 'repost',
                cadencePerWeek: 2,
                novelty: 0.35,
                engagementEffort: 0.6,
              },
              estimatedReward: 13.1,
              interval: { lower: 11.2, upper: 15.0 },
            },
            {
              candidate: {
                strategyRef: strategyRefOf('strategy:learned-remix-3'),
                kind: 'repost',
                cadencePerWeek: 3,
                novelty: 0.4,
                engagementEffort: 0.65,
              },
              estimatedReward: 13.0,
              interval: { lower: 11.0, upper: 15.1 },
            },
          ],
          chosen: {
            strategyRef: strategyRefOf('strategy:learned-remix-2'),
            kind: 'repost',
            cadencePerWeek: 2,
            novelty: 0.35,
            engagementEffort: 0.6,
          },
          improvement: 0,
          improved: false,
          costs: { simulatedSteps: 240, cumulativeSimulatedSteps: 480 },
        },
        {
          iteration: 3,
          evaluated: [
            {
              candidate: {
                strategyRef: strategyRefOf('strategy:learned-remix-2'),
                kind: 'repost',
                cadencePerWeek: 2,
                novelty: 0.35,
                engagementEffort: 0.6,
              },
              estimatedReward: 13.1,
              interval: { lower: 11.2, upper: 15.0 },
            },
            {
              candidate: {
                strategyRef: strategyRefOf('strategy:learned-remix-1'),
                kind: 'repost',
                cadencePerWeek: 1,
                novelty: 0.3,
                engagementEffort: 0.55,
              },
              estimatedReward: 12.2,
              interval: { lower: 10.4, upper: 14.1 },
            },
          ],
          chosen: {
            strategyRef: strategyRefOf('strategy:learned-remix-2'),
            kind: 'repost',
            cadencePerWeek: 2,
            novelty: 0.35,
            engagementEffort: 0.6,
          },
          improvement: 0,
          improved: false,
          costs: { simulatedSteps: 240, cumulativeSimulatedSteps: 720 },
        },
      ],
      stoppingReason: 'plateau-detected',
      stoppingDetail: 'two consecutive iterations without improvement above the declared plateauTolerance 0.5',
      totalSimulatedSteps: 720,
      finalEstimate: {
        reward: 13.1,
        interval: { lower: 11.2, upper: 15.0 },
        uncertainty: { level: 'moderate', note: 'ensemble-member disagreement carried through the trace' },
      },
    },
    provenance: {
      ensembleId: 'ensemble-reach-primary' as never,
      ensembleVersion: 3,
      memberWorldModelVersions: [4, 2],
      simulatorVersion: 4,
      rewardSpecVersion: 2,
      seed: 23,
      iterationCount: 3,
      stoppingReason: 'plateau-detected',
      parentStrategyRef: strategyRefOf('strategy:clip-daily-5'),
      learnedAt: ts('03-17'),
    },
    counterfactual: true,
    disclosure: 'learned-in-simulation',
    labOnly:
      'learned from simulation experience only — a lab candidate, never a deployment decision; the real-experiment boundary (§24) is untouched',
  },
];

/** The scenario the strategy fixtures evaluate under (exported for the double). */
export const STRATEGY_SCENARIO_PIN = {
  scenarioRef: REACH_SCENARIO.id as string,
  ensembleId: 'ensemble-reach-primary',
  ensembleVersion: 3,
} as const;
