import type { AgentOrganizationId } from '@mos/agents';
import type {
  CapabilityRequirement,
  EngineId,
  HumanProductionTaskId,
  TenantScope,
  Timestamp,
  TransformId,
} from '@mos/contracts';
import type {
  DelayDecisionContext,
  DelayEvaluationInput,
} from '../contracts/delay-decision.js';
import type {
  DelayDecisionAnalysisId,
  DelayAbandonmentRecordId,
  DelayEstimateDerivation,
  DelayOptionKind,
  DelayOptionTarget,
} from '../contracts/delay-economics.js';
import type { DelayLearningRelevantOutcome } from '../contracts/delay-abandonment.js';
import { DELAY_OPTION_KINDS } from '../contracts/delay-economics.js';
import { scopeOf } from './w5a-transform-fixtures.js';
import {
  delayModel,
  engineTarget,
  capabilityTarget,
  historicalDerivation,
  organizationTarget,
  transformTarget,
  humanTaskTarget,
  reducedScopeTarget,
  noTarget,
} from './w7a-delay-fixtures.js';
import type { DelayModelOverrides } from './w7a-delay-fixtures.js';

/**
 * INTERNAL W7-A test fixtures, part two (LAB-015 tests) — the ten-option
 * declaration set, the state references, complete evaluation inputs, the
 * learning-relevant outcomes and the known full ranking. NOT exported from
 * the package index — test scaffolding only, never production surface.
 *
 * The numbers are chosen so the declared formula's outputs are EXACTLY
 * representable in floating point (the formula-pin tests assert exact
 * equality, not tolerance): the wait option yields EV 550 USD over interval
 * [390, 710], the retry / substitute-engine pair shares EV 500 with
 * different interval widths (the deterministic tie-break), and the full
 * ten-option declaration set produces a known total ranking.
 */

// ---------------------------------------------------------------------------
// The ten-option declaration set (a known full ranking)
// ---------------------------------------------------------------------------

interface OptionSpec {
  readonly model: DelayModelOverrides;
  readonly target: DelayOptionTarget;
  readonly applicable?: boolean;
}

/**
 * The ten option specifications. The EV column below is the exact output of
 * the declared `ev-delay-1` formula for these numbers:
 *
 *   wait 550 · switch-transform 532.5 · reduce-scope 530 · retry 500 (hw 140)
 *   · substitute-engine 500 (hw 150) · substitute-capability-provider 450
 *   · switch-organization 360 · proceed-without-human 200 · no-op 0
 *   · abandon −100
 */
const OPTION_SPECS: Record<DelayOptionKind, OptionSpec> = {
  'no-op': {
    model: {
      estimate: 0,
      interval: [0, 0],
      probability: 1,
      waitMs: 0,
      perUnitTime: 0,
      acquisition: 0,
      qualityImpact: 0,
      alternativeKinds: ['wait', 'reduce-scope'],
    },
    target: noTarget(),
  },
  wait: {
    model: {
      estimate: 1000,
      interval: [800, 1200],
      probability: 0.8,
      waitMs: 10_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 50,
      qualityImpact: 0.3,
      alternativeKinds: ['retry', 'substitute-engine', 'abandon'],
    },
    target: noTarget(),
  },
  retry: {
    model: {
      estimate: 900,
      interval: [700, 1100],
      probability: 0.7,
      waitMs: 5_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 30,
      qualityImpact: 0.05,
      alternativeKinds: ['wait', 'substitute-engine'],
    },
    target: noTarget(),
  },
  'substitute-engine': {
    model: {
      estimate: 960,
      interval: [760, 1160],
      probability: 0.75,
      waitMs: 8_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 60,
      acquisitionKind: 'engine-acquisition-cost',
      qualityImpact: -0.05,
      alternativeKinds: ['wait', 'substitute-capability-provider'],
    },
    target: engineTarget(),
  },
  'substitute-capability-provider': {
    model: {
      estimate: 700,
      interval: [500, 900],
      probability: 0.9,
      waitMs: 4_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 100,
      qualityImpact: -0.1,
      alternativeKinds: ['substitute-engine', 'switch-organization'],
    },
    target: capabilityTarget(),
  },
  'switch-organization': {
    model: {
      estimate: 1200,
      interval: [900, 1500],
      probability: 0.6,
      waitMs: 12_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 120,
      qualityImpact: -0.2,
      alternativeKinds: ['switch-transform', 'reduce-scope'],
    },
    target: organizationTarget(),
  },
  'switch-transform': {
    model: {
      estimate: 850,
      interval: [650, 1050],
      probability: 0.85,
      waitMs: 6_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 70,
      qualityImpact: 0,
      alternativeKinds: ['wait', 'reduce-scope'],
    },
    target: transformTarget(),
  },
  'reduce-scope': {
    model: {
      estimate: 600,
      interval: [400, 800],
      probability: 0.95,
      waitMs: 2_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 0,
      qualityImpact: -0.15,
      alternativeKinds: ['wait', 'abandon'],
    },
    target: reducedScopeTarget(),
  },
  'proceed-without-human': {
    model: {
      estimate: 500,
      interval: [300, 700],
      probability: 0.7,
      waitMs: 3_000,
      perUnitTime: 20,
      unitMs: 1_000,
      acquisition: 90,
      qualityImpact: -0.4,
      alternativeKinds: ['wait', 'abandon'],
    },
    target: humanTaskTarget(),
  },
  abandon: {
    model: {
      estimate: -100,
      interval: [-200, 0],
      probability: 1,
      waitMs: 0,
      perUnitTime: 0,
      acquisition: 0,
      qualityImpact: -0.5,
      alternativeKinds: ['wait', 'reduce-scope'],
    },
    target: noTarget(),
  },
};

/** The complete ten-option decision context (all applicable by default). */
export const decisionContext = (
  overrides: {
    readonly dependency?: string;
    readonly rewardSpecVersion?: number;
    readonly deadline?: Timestamp | null;
    /** Make specific options inapplicable (the named reason is generated). */
    readonly inapplicable?: readonly DelayOptionKind[];
    /** Per-option model overrides for specific options. */
    readonly modelOverrides?: Partial<Record<DelayOptionKind, DelayModelOverrides>>;
    /** Substitute a specific option's target wholesale. */
    readonly targetOverrides?: Partial<Record<DelayOptionKind, DelayOptionTarget>>;
  } = {},
): DelayDecisionContext => ({
  dependency: overrides.dependency ?? 'human voiceover for the reaction-format episode',
  rewardSpecVersion: overrides.rewardSpecVersion ?? 1,
  deadline: overrides.deadline ?? ('2026-06-20T12:00:00.000Z' as Timestamp),
  options: DELAY_OPTION_KINDS.map((optionKind) => {
    const spec = OPTION_SPECS[optionKind];
    const inapplicable = overrides.inapplicable?.includes(optionKind) ?? false;
    return {
      optionKind,
      applicable: inapplicable ? false : (spec.applicable ?? true),
      inapplicableReason: inapplicable
        ? `the ${optionKind} option is not available in this decision context (fixture declaration)`
        : null,
      target:
        overrides.targetOverrides?.[optionKind] ?? spec.target,
      dimensions: inapplicable
        ? null
        : delayModel({
            ...spec.model,
            ...overrides.modelOverrides?.[optionKind],
            rewardSpecVersion: overrides.rewardSpecVersion ?? 1,
          }),
    };
  }),
});

/** The state references the decision is evaluated against. */
export const stateRefs = (
  overrides: { readonly scopeStatement?: string } = {},
): DelayEvaluationInput['stateRefs'] => ({
  humanTaskId: 'human-task:reaction-voiceover' as HumanProductionTaskId,
  engineId: 'engine:video-transcode' as EngineId,
  engineVersion: 2,
  capability: {
    capabilityId: 'capability:video-transcode' as CapabilityRequirement['capabilityId'],
    version: 2 as CapabilityRequirement['version'],
  },
  providerId: 'provider:arena' as never,
  providerVersion: 4,
  organizationId: 'organization:standard-reaction-crew' as AgentOrganizationId,
  organizationVersion: 1,
  transformId: 'transform:clip-to-reaction' as TransformId,
  transformVersion: 5,
  scopeStatement:
    overrides.scopeStatement ??
    'the reaction-format episode production program (episode 12, niche sourdough-baking, platform short-video)',
});

/** A complete evaluation input (id, pinned policy version v1, fixed seed). */
export const evaluationInput = (
  overrides: {
    readonly id?: string;
    readonly scope?: TenantScope;
    readonly policyVersion?: number;
    readonly seed?: number | null;
    readonly dependency?: string;
    readonly rewardSpecVersion?: number;
    readonly deadline?: Timestamp | null;
    readonly inapplicable?: readonly DelayOptionKind[];
    readonly modelOverrides?: Partial<Record<DelayOptionKind, DelayModelOverrides>>;
    readonly targetOverrides?: Partial<Record<DelayOptionKind, DelayOptionTarget>>;
    readonly scopeStatement?: string;
  } = {},
): DelayEvaluationInput => ({
  scope: overrides.scope ?? scopeOf('tenant-a'),
  id: (overrides.id ?? 'delay-analysis:reaction-voiceover-1') as DelayDecisionAnalysisId,
  policyVersion: overrides.policyVersion ?? 1,
  seed: overrides.seed ?? 7,
  stateRefs: stateRefs({ scopeStatement: overrides.scopeStatement }),
  context: decisionContext({
    dependency: overrides.dependency,
    rewardSpecVersion: overrides.rewardSpecVersion,
    deadline: overrides.deadline,
    inapplicable: overrides.inapplicable,
    modelOverrides: overrides.modelOverrides,
    targetOverrides: overrides.targetOverrides,
  }),
});

/** A learning-relevant outcome recorded when later known. */
export const learningOutcome = (
  overrides: { readonly outcome?: string; readonly observedAt?: Timestamp; readonly derivation?: DelayEstimateDerivation } = {},
): DelayLearningRelevantOutcome => ({
  observedAt: overrides.observedAt ?? ('2026-06-25T09:30:00.000Z' as Timestamp),
  outcome: overrides.outcome ?? 'the human dependency resolved two days later at accepted quality',
  derivation: overrides.derivation ?? historicalDerivation('the delivery event recorded on the human production task'),
});

/** A abandonment record id for tests. */
export const abandonmentRecordId = (
  value = 'delay-abandonment:reaction-voiceover-1',
): DelayAbandonmentRecordId => value as DelayAbandonmentRecordId;

/** The known full ranking of the ten-option fixture (see OPTION_SPECS). */
export const EXPECTED_FULL_RANKING: readonly DelayOptionKind[] = [
  'wait',
  'switch-transform',
  'reduce-scope',
  'retry',
  'substitute-engine',
  'substitute-capability-provider',
  'switch-organization',
  'proceed-without-human',
  'no-op',
  'abandon',
];
