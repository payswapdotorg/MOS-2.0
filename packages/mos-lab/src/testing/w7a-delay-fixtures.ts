import type { AgentOrganizationId } from '@mos/agents';
import type {
  CapabilityRequirement,
  EngineId,
  HumanProductionTaskId,
  TransformId,
} from '@mos/contracts';
import type {
  DelayDecisionModel,
  DelayEstimateDerivation,
  DelayDimensionName,
  DelayOptionKind,
  DelayOptionTarget,
} from '../contracts/delay-economics.js';
import { FIXED_NOW, scopeOf } from './w5a-transform-fixtures.js';

/**
 * INTERNAL W7-A test fixtures (LAB-015 tests). NOT exported from the package
 * index — test scaffolding only, never production surface.
 *
 * The numbers are chosen so the declared formula's outputs are EXACTLY
 * representable in floating point (the formula-pin tests assert exact
 * equality, not tolerance): the wait option yields EV 550 USD over interval
 * [390, 710], the retry / substitute-engine pair shares EV 500 with
 * different interval widths (the deterministic tie-break), and the full
 * ten-option declaration set produces a known total ranking.
 */

export { FIXED_NOW, scopeOf };

// ---------------------------------------------------------------------------
// Derivations (the provenance vocabulary)
// ---------------------------------------------------------------------------

export const ensembleDerivation = (
  overrides: {
    readonly ensembleId?: string;
    readonly ensembleVersion?: number;
    readonly note?: string;
  } = {},
): DelayEstimateDerivation => ({
  kind: 'ensemble-output',
  ensembleId: (overrides.ensembleId ?? 'ensemble-reach') as never,
  ensembleVersion: overrides.ensembleVersion ?? 1,
  note: overrides.note ?? 'the LAB-007 ensemble prediction of this estimate',
});

export const historicalDerivation = (
  note = 'observed across the recorded corpus analytics exports (LAB-008 basis rows)',
): DelayEstimateDerivation => ({
  kind: 'historical-observation',
  note,
});

export const assumptionDerivation = (
  note = 'declared planning assumption — stated, never silently defaulted',
): DelayEstimateDerivation => ({
  kind: 'declared-assumption',
  note,
});

// ---------------------------------------------------------------------------
// One complete §18 dimension model
// ---------------------------------------------------------------------------

export interface DelayModelOverrides {
  readonly estimate?: number;
  readonly interval?: readonly [number, number];
  readonly probability?: number;
  readonly waitMs?: number;
  readonly perUnitTime?: number;
  readonly unitMs?: number;
  readonly acquisition?: number;
  readonly acquisitionKind?: 'human-acquisition-cost' | 'engine-acquisition-cost';
  readonly qualityImpact?: number;
  readonly rewardSpecVersion?: number;
  readonly valueDerivation?: DelayEstimateDerivation;
  readonly waitDerivation?: DelayEstimateDerivation;
  readonly acquisitionDerivation?: DelayEstimateDerivation;
  readonly probabilityDerivation?: DelayEstimateDerivation;
  readonly qualityDerivation?: DelayEstimateDerivation;
  readonly alternativeKinds?: readonly DelayOptionKind[];
}

/**
 * One complete seven-dimension §18 model. Defaults: V=1000 USD [800, 1200],
 * p=0.8, wait=10 000 ms, delay cost 20 USD per 1 000 ms (D=200), A=50 USD,
 * quality impact +0.1, alternatives = the three next-preferred options.
 */
export const delayModel = (overrides: DelayModelOverrides = {}): DelayDecisionModel => ({
  expectedIncrementalValue: {
    estimate: { amount: overrides.estimate ?? 1000, currency: 'USD' },
    interval: {
      lower: overrides.interval?.[0] ?? 800,
      upper: overrides.interval?.[1] ?? 1200,
    },
    rewardSpecVersion: overrides.rewardSpecVersion ?? 1,
    derivation: overrides.valueDerivation ?? ensembleDerivation(),
  },
  estimatedWait: {
    waitMs: overrides.waitMs ?? 10_000,
    derivation: overrides.waitDerivation ?? historicalDerivation(),
  },
  delayCost: {
    perUnitTime: { amount: overrides.perUnitTime ?? 20, currency: 'USD' },
    unitMs: overrides.unitMs ?? 1_000,
    source: {
      kind: 'declared-budget',
      note: 'the production budget declares a 20 USD/second holding price for this dependency',
    },
  },
  acquisitionCost: {
    kind: overrides.acquisitionKind ?? 'human-acquisition-cost',
    estimate: { amount: overrides.acquisition ?? 50, currency: 'USD' },
    derivation: overrides.acquisitionDerivation ?? assumptionDerivation(),
  },
  successProbability: {
    probability: overrides.probability ?? 0.8,
    derivation: overrides.probabilityDerivation ?? ensembleDerivation(),
  },
  qualityImpact: {
    declared: overrides.qualityImpact ?? 0.1,
    derivation: overrides.qualityDerivation ?? assumptionDerivation(),
  },
  alternativePaths: {
    ordered: (overrides.alternativeKinds ?? ['retry', 'substitute-engine', 'abandon']).map(
      (optionKind, index) => ({ order: index + 1, optionKind }),
    ),
  },
});

// ---------------------------------------------------------------------------
// Substitution targets (BY REFERENCE only)
// ---------------------------------------------------------------------------

export const engineTarget = (overrides: { readonly engineId?: string; readonly engineVersion?: number } = {}): DelayOptionTarget => ({
  kind: 'engine',
  engineId: (overrides.engineId ?? 'engine:alt-video-transcode') as EngineId,
  engineVersion: overrides.engineVersion ?? 3,
});

export const capabilityTarget = (
  overrides: { readonly capabilityId?: string; readonly version?: number } = {},
): DelayOptionTarget => ({
  kind: 'capability',
  requirement: {
    capabilityId: (overrides.capabilityId ?? 'capability:video-transcode') as CapabilityRequirement['capabilityId'],
    version: (overrides.version ?? 2) as CapabilityRequirement['version'],
  },
});

export const providerTarget = (
  overrides: { readonly providerId?: string; readonly providerVersion?: number } = {},
): DelayOptionTarget => ({
  kind: 'provider',
  providerId: (overrides.providerId ?? 'provider:arena') as never,
  providerVersion: overrides.providerVersion ?? 4,
});

export const organizationTarget = (
  overrides: { readonly organizationId?: string; readonly organizationVersion?: number } = {},
): DelayOptionTarget => ({
  kind: 'organization',
  organizationId: (overrides.organizationId ?? 'organization:lean-reaction-crew') as AgentOrganizationId,
  organizationVersion: overrides.organizationVersion ?? 2,
});

export const transformTarget = (
  overrides: { readonly definitionId?: string; readonly definitionVersion?: number } = {},
): DelayOptionTarget => ({
  kind: 'transform',
  definitionId: (overrides.definitionId ?? 'transform:clip-to-reaction') as TransformId,
  definitionVersion: overrides.definitionVersion ?? 5,
});

export const humanTaskTarget = (
  taskId = 'human-task:reaction-voiceover',
): DelayOptionTarget => ({
  kind: 'human-task',
  taskId: taskId as HumanProductionTaskId,
});

export const reducedScopeTarget = (): DelayOptionTarget => ({
  kind: 'reduced-scope',
  reduction: {
    dropped: ['the multi-angle capture pass', 'the licensed music bed'],
    remaining: 'single-angle reaction with the house music bed only',
  },
});

export const noTarget = (): DelayOptionTarget => ({ kind: 'none' });

/** The §18 dimension names in track order (the named-failure sweep). */
export const DELAY_DIMENSION_NAMES: readonly DelayDimensionName[] = [
  'expected-incremental-value',
  'estimated-wait',
  'delay-cost',
  'acquisition-cost',
  'success-probability',
  'quality-impact',
  'alternative-paths',
];
