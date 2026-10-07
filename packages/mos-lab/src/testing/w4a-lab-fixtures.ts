import type {
  Budget,
  LabScenario,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type {
  EnsembleMember,
  EnsemblePort,
  EnsembleWeightingPolicy,
  WorldModelEnsemble,
  WorldModelEnsembleDraft,
  WorldModelEnsembleId,
} from '../contracts/ensemble.js';
import type {
  HistoricalObservationDraft,
  TimeMachinePort,
} from '../contracts/time-machine.js';
import type {
  HistoricalObservationId,
  ObservedMetric,
} from '../contracts/evidence.js';
import type {
  LabRewardSpec,
  LabRewardTerm,
} from '../contracts/reward.js';
import type { SocialWorldModelDraft, SocialWorldModelId } from '../contracts/simulator.js';
import { createInMemoryEnsemble } from '../adapters/in-memory-ensemble.js';
import {
  createInMemorySimulatorEngine,
  createInMemorySocialWorldModelStore,
} from '../adapters/in-memory-social-simulator.js';
import { createInMemoryTimeMachine } from '../adapters/in-memory-time-machine.js';

/**
 * INTERNAL W4-A test fixtures (LAB-007/008/009 tests). NOT exported from
 * the package index — test scaffolding only, never production surface.
 *
 * The fixture world models differ ONLY in `baseAudience` (12k vs 24k), so
 * ensemble member disagreement on the reach metrics is structural and
 * hand-checkable: with shared (seed, step) noise the member expected values
 * differ exactly through the audience factor.
 */

export const FIXED_NOW = (): Timestamp =>
  '2026-06-15T12:00:00.000Z' as Timestamp;

export const scopeOf = (tenant: string): TenantScope => ({
  tenantId: tenant as TenantId,
});

const strategyRef = (value: string): StrategyRef => value as StrategyRef;
const worldModelId = (value: string): SocialWorldModelId => value as SocialWorldModelId;
const observationId = (value: string): HistoricalObservationId =>
  value as HistoricalObservationId;

export const DAY = 86_400_000;

/** The scenario all W4-A fixtures run under (rewardVersion 1, lag 5 days). */
export const scenarioOf = (overrides: Partial<LabScenario> = {}): LabScenario => ({
  id: 'scenario-sourdough-reach' as never,
  version: 1 as Version,
  niche: 'sourdough-baking',
  platform: 'short-video',
  objective: 'qualified-reach',
  context: { campaignShape: 'weekly-educational-clip' },
  budget: {
    maxCost: { amount: 500, currency: 'USD' },
    maxDurationMs: 14 * DAY,
  } as Budget,
  informationLag: 5 * DAY,
  corpusVersion: 2 as Version,
  simulatorVersion: 1 as Version,
  rewardVersion: 1 as Version,
  ...overrides,
});

export const contentCandidate = {
  strategyRef: strategyRef('strategy-alpha'),
  kind: 'content' as const,
  cadencePerWeek: 5,
  novelty: 0.7,
  engagementEffort: 0.6,
};

export const noopCandidate = {
  strategyRef: strategyRef('strategy-noop'),
  kind: 'no-op' as const,
  cadencePerWeek: 0,
  novelty: 0.5,
  engagementEffort: 0.5,
};

export const worldDraftA = (): SocialWorldModelDraft => ({
  id: worldModelId('world-a'),
  niche: 'sourdough-baking',
  platform: 'short-video',
  state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: 'member A synthetic world (audience 12k)',
});

export const worldDraftB = (): SocialWorldModelDraft => ({
  id: worldModelId('world-b'),
  niche: 'sourdough-baking',
  platform: 'short-video',
  state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: 'member B synthetic world (audience 24k)',
});

export const uniformPolicy = (): EnsembleWeightingPolicy => ({
  id: 'policy-uniform-reach',
  version: 1,
  kind: 'uniform',
  note: 'equal member weight — an explicit declared choice',
});

export const weightedPolicy = (): EnsembleWeightingPolicy => ({
  id: 'policy-weighted-reach',
  version: 2,
  kind: 'declared-member-weights',
  note: 'operator-declared member weights (v2 of the policy)',
});

/** Full-coverage declaration (cadence [0,14], novelty/effort [0,1]). */
export const fullCoverage = () => ({
  cadencePerWeek: { min: 0, max: 14 },
  novelty: { min: 0, max: 1 },
  engagementEffort: { min: 0, max: 1 },
});

/** Narrow cadence coverage [0,3] — the OOD fixture (cadence 5 is outside). */
export const narrowCoverage = () => ({
  cadencePerWeek: { min: 0, max: 3 },
  novelty: { min: 0, max: 1 },
  engagementEffort: { min: 0, max: 1 },
});

export const memberA = (overrides: Partial<EnsembleMember> = {}): EnsembleMember => ({
  id: 'member-a',
  worldModelId: worldModelId('world-a'),
  worldModelVersion: 1,
  coverage: fullCoverage(),
  notes: null,
  ...overrides,
});

export const memberB = (overrides: Partial<EnsembleMember> = {}): EnsembleMember => ({
  id: 'member-b',
  worldModelId: worldModelId('world-b'),
  worldModelVersion: 1,
  coverage: narrowCoverage(),
  notes: null,
  ...overrides,
});

export const ensembleId = (value = 'ensemble-reach'): WorldModelEnsembleId =>
  value as WorldModelEnsembleId;

/** Register a two-member uniform ensemble over world-a v1 + world-b v1. */
export const ensembleStack = async (options: {
  readonly policy?: EnsembleWeightingPolicy;
  readonly members?: readonly EnsembleMember[];
  readonly ensembleId?: WorldModelEnsembleId;
} = {}): Promise<{
  readonly ensemble: EnsemblePort;
  readonly registered: WorldModelEnsemble;
  /** The world model store the members resolve through (extra worlds registrable). */
  readonly worldModels: ReturnType<typeof createInMemorySocialWorldModelStore>;
  /** The simulator engine the ensemble evaluates members through. */
  readonly engine: ReturnType<typeof createInMemorySimulatorEngine>;
}> => {
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  for (const draft of [worldDraftA(), worldDraftB()]) {
    const result = await worldModels.registerWorldModel({
      scope: scopeOf('tenant-a'),
      worldModel: draft,
    });
    if ('error' in result) {
      throw new Error(`fixture world model registration failed: ${result.error}`);
    }
  }
  const ensemble = createInMemoryEnsemble({ simulator: engine, now: FIXED_NOW });
  const draft: WorldModelEnsembleDraft = {
    id: options.ensembleId ?? ensembleId(),
    niche: 'sourdough-baking',
    platform: 'short-video',
    members: options.members ?? [memberA(), memberB()],
    weightingPolicy: options.policy ?? uniformPolicy(),
    notes: 'fixture ensemble',
  };
  const registered = await ensemble.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: draft,
  });
  if ('error' in registered) {
    throw new Error(`fixture ensemble registration failed: ${registered.error}`);
  }
  return { ensemble, registered, worldModels, engine };
};

/** A one-term reward spec: maximize the predicted qualified-reach metric. */
export const reachRewardSpec = (
  overrides: { readonly version?: number; readonly extraTerms?: readonly LabRewardTerm[] } = {},
): LabRewardSpec => ({
  version: overrides.version ?? 1,
  terms: [
    {
      metric: 'qualified-reach',
      weight: 1,
      direction: 'maximize',
      definition: 'qualified reach predicted by the ensemble (people per step)',
      metricSource: 'qualified-reach',
    },
    ...(overrides.extraTerms ?? []),
  ],
});

/** Observation draft factory for the OPE history fixtures. */
export const observationDraft = (
  id: string,
  observedAt: string,
  metrics: readonly ObservedMetric[],
): HistoricalObservationDraft => ({
  id: observationId(`obs-${id}`),
  niche: 'sourdough-baking',
  platform: 'short-video',
  metrics,
  observedAt: observedAt as Timestamp,
  sourceRefs: [`src://platform/analytics/${id}`],
  regime: 'baseline',
});

/** Seed a Time Machine with the given (id, observedAt, metrics) rows. */
export const timeMachineWith = async (
  rows: readonly {
    readonly id: string;
    readonly observedAt: string;
    readonly metrics: readonly ObservedMetric[];
  }[],
  options: { readonly now?: () => Timestamp } = {},
): Promise<TimeMachinePort> => {
  const machine = createInMemoryTimeMachine({ now: options.now ?? FIXED_NOW });
  for (const row of rows) {
    const result = await machine.appendHistoricalObservation({
      scope: scopeOf('tenant-a'),
      observation: observationDraft(row.id, row.observedAt, row.metrics),
    });
    if ('error' in result) {
      throw new Error(`fixture observation append failed: ${result.error}`);
    }
  }
  return machine;
};

/** Standard OPE history: 3 lagged observations (baseline-reach 1000/1400/1800). */
export const OPE_AS_OF = '2026-06-30T00:00:00.000Z' as Timestamp;
export const OPE_LAGGED = [
  { id: 'd20', observedAt: '2026-06-20T00:00:00.000Z', metrics: [{ metric: 'baseline-reach', value: 1_000, unit: 'people' }] },
  { id: 'd22', observedAt: '2026-06-22T00:00:00.000Z', metrics: [{ metric: 'baseline-reach', value: 1_400, unit: 'people' }] },
  { id: 'd24', observedAt: '2026-06-24T00:00:00.000Z', metrics: [{ metric: 'baseline-reach', value: 1_800, unit: 'people' }] },
] as const;
/** Observations INSIDE (T−L, T] — beyond the lag, never visible to the OPE. */
export const OPE_BEYOND_LAG = [
  { id: 'd26', observedAt: '2026-06-26T00:00:00.000Z', metrics: [{ metric: 'baseline-reach', value: 999_999, unit: 'people' }] },
  { id: 'd28', observedAt: '2026-06-28T00:00:00.000Z', metrics: [{ metric: 'baseline-reach', value: 999_999, unit: 'people' }] },
] as const;
