import type {
  LabScenario,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type { SimulationPrediction } from './evidence.js';
import type { StrategyActionCandidate } from './simulator.js';

/**
 * User/creator/competition dynamics contracts (LAB-005): versioned
 * tenant-scoped {@link DynamicsModel} population records (user archetypes,
 * creator archetypes, competitor behavior profiles), the world
 * {@link DynamicsState} they respond in, and the deterministic, seeded
 * {@link DynamicsStepPort}.
 *
 * Basis: spec/mos-architecture-v2.0.md §20 (user/creator/competition
 * dynamics), §21 (reward combines fatigue/audience-growth dimension inputs —
 * modeled here explicitly as synthetic quantities), §22 (uncertainty on
 * population responses), spec/mos-effective-backlog-v2.0.md LAB-005 (deps
 * LAB-004 ✓).
 *
 * DISCLOSURE: the in-memory adapter behind {@link DynamicsStepPort} is a
 * DETERMINISTIC SYNTHETIC PARAMETRIC MODEL — fatigue accumulation, audience
 * growth/decay and competitive displacement are modeled quantities with
 * seeded noise, not measurements of a real population. Every step result is
 * a {@link SimulationPrediction} (`counterfactual: true`, disclosed) and can
 * never be stored or returned where a `HistoricalObservation` is required
 * (lock rule 29).
 */

declare const dynamicsModelIdBrand: unique symbol;

/** Unique identifier of a dynamics model record. */
export type DynamicsModelId = string & {
  readonly [dynamicsModelIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Dynamics model (versioned, tenant-scoped population records)
// ---------------------------------------------------------------------------

/** Population segment kinds modeled by a dynamics model. */
export type DynamicsPopulationKind =
  | 'user-archetype'
  | 'creator-archetype'
  | 'competitor-profile';

/**
 * One population segment: an archetype or competitor behavior profile with
 * its population share and the synthetic trait knobs (all in [0, 1]) the
 * disclosed dynamics adapter consumes.
 */
export interface PopulationSegment {
  /** Segment identifier — unique within its model. */
  readonly id: string;
  readonly kind: DynamicsPopulationKind;
  readonly label: string;
  /** Population share in (0, 1]; user+creator shares should sum to ~1. */
  readonly share: number;
  /** How strongly repeated exposure fatigues this segment (0..1). */
  readonly fatigueSensitivity: number;
  /** How strongly the segment rewards novelty (0..1). */
  readonly noveltySeeking: number;
  /** Baseline propensity to engage (0..1). */
  readonly engagementPropensity: number;
  /** `competitor-profile` segments only: competitive aggressiveness (0..1). */
  readonly aggressiveness?: number;
}

/**
 * A dynamics model record: the population/agent-type description of one
 * (niche, platform) world — user archetypes, creator archetypes and
 * competitor behavior profiles — under a tenant scope.
 *
 * Dynamics models are versioned and append-only (the store assigns
 * `version = latest + 1`; prior versions stay retrievable). The record is
 * synthetic model content (disclosed), never historical evidence.
 */
export interface DynamicsModel {
  readonly id: DynamicsModelId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  /** Population segments (non-empty; ids unique; exactly one kind each). */
  readonly populations: readonly PopulationSegment[];
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  /** DISCLOSURE: synthetic parametric population model — not observed reality. */
  readonly disclosure: 'synthetic-parametric-dynamics-model';
}

/** Draft of a dynamics model version being registered (version assigned by the store). */
export interface DynamicsModelDraft {
  readonly id: DynamicsModelId;
  readonly niche: string;
  readonly platform: string;
  readonly populations: readonly PopulationSegment[];
  readonly notes?: string | null;
}

/** Register one dynamics model version (append-only) under a tenant scope. */
export interface RegisterDynamicsModelInput {
  readonly scope: TenantScope;
  readonly dynamicsModel: DynamicsModelDraft;
}

/**
 * Versioned, tenant-scoped dynamics model registry (3 methods ≤ 12 policy
 * budget). Append-only: registration appends `version + 1` per model id.
 */
export interface DynamicsModelStore {
  /** Append a new immutable dynamics model version. Fails with `invalid-input`. */
  registerDynamicsModel(
    input: RegisterDynamicsModelInput,
  ): Promise<DynamicsModel | DynamicsError>;

  /** Fetch one dynamics model version, or `null` when unknown in this tenant scope. */
  getDynamicsModel(
    scope: TenantScope,
    id: DynamicsModelId,
    version: number,
  ): Promise<DynamicsModel | null>;

  /** List dynamics model versions visible in the tenant scope, oldest first. */
  listDynamicsModelVersions(
    scope: TenantScope,
    id: DynamicsModelId,
  ): Promise<readonly DynamicsModel[]>;
}

// ---------------------------------------------------------------------------
// Dynamics state (population-resolved world state)
// ---------------------------------------------------------------------------

/** Per-segment dynamics state. */
export interface DynamicsSegmentState {
  readonly segmentId: string;
  /**
   * Accumulated audience fatigue in [0, 1] — NON-DECREASING under repeated
   * exposure (the monotonicity property is test-pinned): the modeled
   * dynamics never reduce fatigue within a run.
   */
  readonly fatigue: number;
  /** Audience affinity in [0, 1] (grows with engaging actions). */
  readonly affinity: number;
}

/**
 * The population-resolved world state the dynamics step advances: audience
 * size, per-segment fatigue/affinity, aggregate competitor share and the
 * step index. This is the segment-granular companion of the social world
 * model's aggregate state (LAB-004) — same three dimensions, population
 * resolution.
 */
export interface DynamicsState {
  /** Simulated audience size (>= 0). */
  readonly audienceSize: number;
  /** One entry per dynamics-model segment (ids match exactly, no extras). */
  readonly segmentStates: readonly DynamicsSegmentState[];
  /** Aggregate competitor audience share in [0, 1]. */
  readonly competitorShare: number;
  /** Current step index (>= 0). */
  readonly step: number;
}

// ---------------------------------------------------------------------------
// Dynamics step port
// ---------------------------------------------------------------------------

/**
 * The population response of one dynamics step: audience growth/decay,
 * fatigue accumulation (non-negative by construction), competitive
 * displacement and the novelty effect — all synthetic modeled quantities
 * with uncertainty (spec §20/§22).
 */
export interface PopulationResponse {
  /** Audience change this step (growth minus decay minus displacement; may be negative). */
  readonly audienceDelta: number;
  /** Fatigue added this step — ALWAYS >= 0 (monotone fatigue accumulation). */
  readonly fatigueDelta: number;
  /** Audience lost to competitors this step (>= 0). */
  readonly competitiveDisplacement: number;
  /** Signed novelty effect on engagement response (novelty × seeking − baseline). */
  readonly noveltyEffect: number;
}

/** One deterministic dynamics step request. `seed` is REQUIRED (never null). */
export interface DynamicsStepInput {
  readonly scope: TenantScope;
  /** The population model governing the response (versioned record). */
  readonly dynamicsModel: DynamicsModel;
  /** Current world state (must cover exactly the model's segments). */
  readonly state: DynamicsState;
  readonly candidate: StrategyActionCandidate;
  /** Determinism seed — same seed + same inputs → identical results. */
  readonly seed: number;
  /** Step index (>= 0; must equal `state.step`). */
  readonly step: number;
  /** The scenario the step belongs to (carries the version pins). */
  readonly scenario: LabScenario;
}

/**
 * The result of one dynamics step: a {@link SimulationPrediction} (labeled
 * `counterfactual: true`, disclosed synthetic) extended with the next
 * population-resolved state and the population response. `worldModelVersion`
 * carries the dynamics model's version (the population world model the
 * prediction was produced under).
 */
export interface DynamicsStepResult extends SimulationPrediction {
  readonly nextState: DynamicsState;
  readonly response: PopulationResponse;
}

/** Machine-readable failure codes for dynamics operations. */
export type DynamicsErrorCode =
  | 'invalid-input'
  | 'state-segment-mismatch'
  | 'simulator-version-mismatch';

/** Typed failure value (result union, the MOS domain convention). */
export interface DynamicsError {
  readonly error: DynamicsErrorCode;
  readonly message: string;
}

/**
 * The user/creator/competition dynamics engine (LAB-005): deterministic,
 * seeded stepping of a population model. Fatigue accumulates MONOTONICALLY
 * (never decreases within a run, test-pinned); audience grows with engaging
 * action and decays with fatigue; competitors displace audience in
 * proportion to their share and aggressiveness.
 */
export interface DynamicsStepPort {
  /**
   * Step the population dynamics once. Fails with `invalid-input` (bad
   * candidate/seed/state), `state-segment-mismatch` (state segments do not
   * match the model exactly) or `simulator-version-mismatch`.
   */
  step(input: DynamicsStepInput): Promise<DynamicsStepResult | DynamicsError>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rule 29)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _DynamicsResultIsAlwaysCounterfactual = Expect<
  Equal<DynamicsStepResult['counterfactual'], true>
>;
type _DynamicsResultIsAPrediction = Expect<
  Equal<IsAssignable<DynamicsStepResult, SimulationPrediction>, true>
>;
type _DynamicsResultNeverOccupiesAHistoricalSlot = Expect<
  Equal<
    IsAssignable<DynamicsStepResult, import('./evidence.js').HistoricalObservation>,
    false
  >
>;
