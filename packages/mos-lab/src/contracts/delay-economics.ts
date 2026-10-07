import type { AgentOrganizationId } from '@mos/agents';
import type {
  CapabilityRequirement,
  EngineId,
  HumanProductionTaskId,
  Milliseconds,
  MoneyAmount,
  ProviderId,
  TransformId,
} from '@mos/contracts';
import type { PredictionInterval } from './evidence.js';
import type { WorldModelEnsembleId } from './ensemble.js';

/**
 * Production Delay Economics — the §18 tracked dimensions and the TEN
 * decision options (LAB-015).
 *
 * Basis: spec/mos-architecture-v2.0.md §18 (THE EXPECTED VALUE OF DELAY IS A
 * FIRST-CLASS PRODUCTION STRATEGY VARIABLE; waiting is a decision variable;
 * track: expected incremental value, estimated wait, delay cost, acquisition
 * cost, probability of success, quality impact, alternative paths; the Lab
 * may wait / retry / substitute engine / substitute capability or provider /
 * switch organization / switch transform / reduce scope / proceed without
 * human / abandon; abandoned branches remain auditable and may be learning
 * data), §2 (the complete loop — delay-expectation in program search;
 * accept/treat/retry/substitute/abandon), §21 (reward is mission-specific,
 * versioned; human/engine acquisition cost are reward dimensions),
 * architecture lock rules 24 (human production is explicit and economically
 * bounded), 25 (expected value of delay is part of production strategy
 * search) and 26 (human waiting may be abandoned when delay cost dominates
 * expected incremental value).
 *
 * DESIGN CALL (W7-A): the §18 estimate surface is DECLARED, PROVENANCE-
 * CARRYING and never invented — every estimate ({@link DelayEstimateDerivation})
 * cites its derivation (ensemble output / historical observation / declared
 * assumption); an estimate without provenance is rejected with a typed error
 * naming the dimension. The substitution options reference the REAL surfaces
 * (engine registry vocabulary, capability refs, organization descriptors,
 * transform definitions, human tasks) BY REFERENCE ONLY — the engine registry
 * vocabulary here is the `@mos/contracts` `EngineId` brand, capability refs
 * are `@mos/contracts` `CapabilityRequirement`s, organization descriptors are
 * `AgentOrganizationId`s, transforms are `TransformId`s at an exact version
 * and human tasks are `HumanProductionTaskId`s; nothing executes, nothing
 * resolves, nothing instantiates (§24 boundary untouched).
 */

declare const delayAnalysisIdBrand: unique symbol;

/** Unique identifier of one delay decision analysis record. */
export type DelayDecisionAnalysisId = string & {
  readonly [delayAnalysisIdBrand]: true;
};

declare const delayAbandonmentIdBrand: unique symbol;

/** Unique identifier of one abandoned-path audit record. */
export type DelayAbandonmentRecordId = string & {
  readonly [delayAbandonmentIdBrand]: true;
};

// ---------------------------------------------------------------------------
// The TEN §18 options (the Lab's decision vocabulary)
// ---------------------------------------------------------------------------

/**
 * The ten §18 decision options: the §18 nine (wait, retry, substitute
 * engine, substitute capability/provider, switch organization, switch
 * transform, reduce scope, proceed without human, abandon) PLUS the NO-OP
 * BASELINE dimension already in the program space (§7 / lock rule 5 —
 * "do nothing" is always an evaluable alternative; `CandidateProgramStrategy`
 * carries the same first-class `no-op` kind).
 */
export type DelayOptionKind =
  | 'no-op'
  | 'wait'
  | 'retry'
  | 'substitute-engine'
  | 'substitute-capability-provider'
  | 'switch-organization'
  | 'switch-transform'
  | 'reduce-scope'
  | 'proceed-without-human'
  | 'abandon';

/**
 * The ten option kinds in §18 order (no-op baseline first). Analysis lines
 * are always emitted in THIS order; the ranked comparison orders by the
 * declared ranking policy instead.
 */
export const DELAY_OPTION_KINDS: readonly DelayOptionKind[] = Object.freeze([
  'no-op',
  'wait',
  'retry',
  'substitute-engine',
  'substitute-capability-provider',
  'switch-organization',
  'switch-transform',
  'reduce-scope',
  'proceed-without-human',
  'abandon',
] as const);

/** The §18 tracked-dimension names (named failures cite these). */
export type DelayDimensionName =
  | 'expected-incremental-value'
  | 'estimated-wait'
  | 'delay-cost'
  | 'acquisition-cost'
  | 'success-probability'
  | 'quality-impact'
  | 'alternative-paths';

// ---------------------------------------------------------------------------
// Estimate provenance (§18 — never invented precision)
// ---------------------------------------------------------------------------

/**
 * The derivation an estimate MUST cite (§18: never invented precision).
 * Exactly three honest kinds: a LAB-007 ensemble output (cited by ensemble
 * id + exact version), a historical observation (the citation note names the
 * observation records), or a declared assumption (the note states it). A
 * missing or malformed derivation is a typed
 * `estimate-without-provenance` failure naming the dimension.
 */
export type DelayEstimateDerivation =
  | {
      readonly kind: 'ensemble-output';
      /** The LAB-007 ensemble that produced the estimate (exact version). */
      readonly ensembleId: WorldModelEnsembleId;
      readonly ensembleVersion: number;
      /** Non-blank citation note (what the ensemble produced). */
      readonly note: string;
    }
  | {
      readonly kind: 'historical-observation';
      /** Non-blank note citing the observation records behind the estimate. */
      readonly note: string;
    }
  | {
      readonly kind: 'declared-assumption';
      /** Non-blank note stating the assumption (an assumption is honest, silence is not). */
      readonly note: string;
    };

/** The source of a delay-cost estimate (a declared per-unit-time price needs a source). */
export type DelayCostSourceKind =
  | 'declared-budget'
  | 'historical-observation'
  | 'declared-assumption';

/**
 * The declared source of the delay cost: the production budget's declared
 * opportunity/holding price, a historical observation, or a stated
 * assumption — always cited, never silent.
 */
export interface DelayCostSource {
  readonly kind: DelayCostSourceKind;
  /** Non-blank source citation. */
  readonly note: string;
}

// ---------------------------------------------------------------------------
// The seven §18 tracked dimensions — each an explicit typed record
// ---------------------------------------------------------------------------

/**
 * Dimension 1 — expected incremental value: the reward-spec-denominated
 * estimate of what the dependency's resolution is worth, with its
 * uncertainty interval carried in the LAB-007/008 discipline
 * ({@link PredictionInterval}) and the §21 reward spec version the estimate
 * is denominated in (pinned against the decision context's active reward
 * spec — a mismatch fails closed).
 */
export interface DelayExpectedIncrementalValue {
  /** The point estimate (money; may be negative — value is not assumed positive). */
  readonly estimate: MoneyAmount;
  /** Uncertainty interval on the estimate (lower ≤ estimate ≤ upper, finite). */
  readonly interval: PredictionInterval;
  /** The §21 reward spec version this estimate is denominated in (integer ≥ 1). */
  readonly rewardSpecVersion: number;
  readonly derivation: DelayEstimateDerivation;
}

/**
 * Dimension 2 — estimated wait: how long the option's resolution takes
 * (finite ≥ 0 ms), with its derivation.
 */
export interface DelayEstimatedWait {
  readonly waitMs: Milliseconds;
  readonly derivation: DelayEstimateDerivation;
}

/**
 * Dimension 3 — delay cost: the per-unit-time cost of waiting, the time unit
 * it is priced over (finite > 0 ms) and the declared SOURCE of the price.
 */
export interface DelayCostEstimate {
  /** Cost per `unitMs` of waiting (money, ≥ 0). */
  readonly perUnitTime: MoneyAmount;
  /** The time unit the per-unit price is denominated in (finite > 0 ms). */
  readonly unitMs: Milliseconds;
  readonly source: DelayCostSource;
}

/**
 * Dimension 4 — acquisition cost: the §21 human/engine acquisition cost of
 * obtaining the option's outcome. `kind` mirrors the §21 reward metric
 * vocabulary (`human-acquisition-cost` / `engine-acquisition-cost`).
 */
export interface DelayAcquisitionCost {
  readonly kind: 'human-acquisition-cost' | 'engine-acquisition-cost';
  /** The estimate (money, ≥ 0). */
  readonly estimate: MoneyAmount;
  readonly derivation: DelayEstimateDerivation;
}

/**
 * Dimension 5 — probability of success: the DECLARED estimate in [0, 1] with
 * its provenance — never invented precision (a bare number without a
 * derivation is rejected naming this dimension).
 */
export interface DelaySuccessProbability {
  /** Probability the option resolves successfully, in [0, 1]. */
  readonly probability: number;
  readonly derivation: DelayEstimateDerivation;
}

/**
 * Dimension 6 — quality impact: the declared SIGNED quality impact estimate
 * of taking the option (dimensionless; the declared policy carries it on
 * every analysis line and never monetizes it — monetizing a dimensionless
 * quality estimate would be invented precision).
 */
export interface DelayQualityImpact {
  /** Signed quality impact (finite; negative = quality degrades). */
  readonly declared: number;
  readonly derivation: DelayEstimateDerivation;
}

/**
 * Dimension 7 — alternative paths: ORDERED references to the other decision
 * options (each resolves to that option's own analysis line with its own
 * estimates inside the same analysis). Self-references, duplicates,
 * non-ascending orders and unknown option kinds are rejected naming this
 * dimension.
 */
export interface DelayAlternativePaths {
  /** 1-based strictly ascending preference order over the alternative options. */
  readonly ordered: readonly DelayAlternativePathRef[];
}

/** One alternative-path reference (an ordered pointer at another option kind). */
export interface DelayAlternativePathRef {
  /** 1-based preference order (strictly ascending across the list). */
  readonly order: number;
  /** The alternative option's kind — never the declaring option's own kind. */
  readonly optionKind: DelayOptionKind;
}

/**
 * The §18 tracked-dimension model: ALL SEVEN dimensions as explicit typed
 * records. Every applicable option declares its own complete model; a
 * missing or malformed dimension fails closed naming it.
 */
export interface DelayDecisionModel {
  readonly expectedIncrementalValue: DelayExpectedIncrementalValue;
  readonly estimatedWait: DelayEstimatedWait;
  readonly delayCost: DelayCostEstimate;
  readonly acquisitionCost: DelayAcquisitionCost;
  readonly successProbability: DelaySuccessProbability;
  readonly qualityImpact: DelayQualityImpact;
  readonly alternativePaths: DelayAlternativePaths;
}

// ---------------------------------------------------------------------------
// Substitution targets (BY REFERENCE only — the real surfaces' vocabulary)
// ---------------------------------------------------------------------------

/**
 * A declared scope reduction (the `reduce-scope` option's target): what is
 * dropped and what remains. A declaration, never an evaluated artifact —
 * the reduced program is re-evaluated through the owning surfaces.
 */
export interface DelayScopeReduction {
  /** What the reduction drops (non-empty; each entry non-blank). */
  readonly dropped: readonly string[];
  /** What remains after the reduction (non-blank). */
  readonly remaining: string;
}

/**
 * The target a decision option points at, BY REFERENCE ONLY:
 * - `engine` — engine registry vocabulary (`@mos/contracts` `EngineId` + exact version);
 * - `capability` — a `@mos/contracts` `CapabilityRequirement` (capability id + exact version);
 * - `provider` — the INTEG-001 `ConnectorProvider` vocabulary (`ProviderId` + exact version);
 * - `organization` — an organization descriptor reference (`AgentOrganizationId` + exact version);
 * - `transform` — a transform definition at an EXACT version (LAB-011 registry vocabulary);
 * - `human-task` — a human production task reference (LAB-014);
 * - `reduced-scope` — the declared scope reduction;
 * - `none` — the options that need no target (no-op / wait / retry / abandon).
 */
export type DelayOptionTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'engine'; readonly engineId: EngineId; readonly engineVersion: number }
  | { readonly kind: 'capability'; readonly requirement: CapabilityRequirement }
  | {
      readonly kind: 'provider';
      readonly providerId: ProviderId;
      readonly providerVersion: number;
    }
  | {
      readonly kind: 'organization';
      readonly organizationId: AgentOrganizationId;
      readonly organizationVersion: number;
    }
  | {
      readonly kind: 'transform';
      readonly definitionId: TransformId;
      readonly definitionVersion: number;
    }
  | { readonly kind: 'human-task'; readonly taskId: HumanProductionTaskId }
  | { readonly kind: 'reduced-scope'; readonly reduction: DelayScopeReduction };

// ---------------------------------------------------------------------------
// Compile-time vocabulary pins
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** The ten-option §18 vocabulary must stay intact (drift breaks the analysis). */
type _DelayOptionVocabularyHasTenKinds = Expect<
  Equal<
    DelayOptionKind,
    | 'no-op'
    | 'wait'
    | 'retry'
    | 'substitute-engine'
    | 'substitute-capability-provider'
    | 'switch-organization'
    | 'switch-transform'
    | 'reduce-scope'
    | 'proceed-without-human'
    | 'abandon'
  >
>;
/** The seven §18 tracked dimensions must stay intact. */
type _DelayModelCarriesAllSevenDimensions = Expect<
  Equal<
    keyof DelayDecisionModel,
    | 'expectedIncrementalValue'
    | 'estimatedWait'
    | 'delayCost'
    | 'acquisitionCost'
    | 'successProbability'
    | 'qualityImpact'
    | 'alternativePaths'
  >
>;
/** Acquisition cost stays §21 human/engine only (no silent third kind). */
type _AcquisitionKindsMirrorTheRewardVocabulary = Expect<
  Equal<
    DelayAcquisitionCost['kind'],
    'human-acquisition-cost' | 'engine-acquisition-cost'
  >
>;
/** Provenance is structurally required on every estimate record. */
type _EveryEstimateRecordCarriesADerivation = Expect<
  Equal<DelayExpectedIncrementalValue['derivation'], DelayEstimateDerivation>
>;
type _WaitEstimatesAlwaysCarryADerivation = Expect<
  Equal<DelayEstimatedWait['derivation'], DelayEstimateDerivation>
>;
type _AcquisitionCostsAlwaysCarryADerivation = Expect<
  Equal<DelayAcquisitionCost['derivation'], DelayEstimateDerivation>
>;
type _SuccessProbabilitiesAlwaysCarryADerivation = Expect<
  Equal<DelaySuccessProbability['derivation'], DelayEstimateDerivation>
>;
type _QualityImpactsAlwaysCarryADerivation = Expect<
  Equal<DelayQualityImpact['derivation'], DelayEstimateDerivation>
>;
