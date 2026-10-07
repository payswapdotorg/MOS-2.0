import type {
  JsonSchemaObject,
  LabScenario,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type { SimulationPrediction } from './evidence.js';

/**
 * Social Simulator contracts (LAB-004): the versioned social world model, the
 * strategy action candidate shape consumed by the simulator, and the
 * deterministic, seed-required {@link SimulatorEnginePort}.
 *
 * Basis: spec/mos-architecture-v2.0.md §20 (social world model; simulator
 * outputs are synthetic and counterfactual), §22 (uncertainty envelopes,
 * seed robustness), spec/mos-effective-backlog-v2.0.md LAB-004 (deps
 * LAB-002 ✓). The frozen `LabScenario` contract (@mos/contracts, CORE-001)
 * carries the exact `corpusVersion` / `simulatorVersion` / `rewardVersion`
 * pins and the Time Machine `informationLag` for reproducible runs.
 *
 * DISCLOSURE (carried on every result record): the in-memory adapter behind
 * this port is a DETERMINISTIC SYNTHETIC RESPONSE FUNCTION — parametric
 * equations with seeded noise. It is a real generative model in the sense
 * that it computes simulated quantities deterministically from inputs, but
 * it is NOT a real platform model and its outputs are never ground truth.
 * LAB-007 (world model ensemble) and LAB-016 (calibration) build on this
 * seam.
 */

declare const socialWorldModelIdBrand: unique symbol;

/** Unique identifier of a social world model record. */
export type SocialWorldModelId = string & {
  readonly [socialWorldModelIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Social world model (versioned, append-only)
// ---------------------------------------------------------------------------

/**
 * The simulated social environment state: the aggregate synthetic quantities
 * the response function reads and advances. These are the same three
 * dimensions LAB-005's population-resolved `DynamicsState` models at segment
 * granularity (audience, fatigue, competitor share) — deliberately
 * composable for the LAB-007 world model ensemble.
 */
export interface SocialWorldModelState {
  /** Simulated reachable audience baseline (synthetic count, >= 0). */
  readonly baseAudience: number;
  /** Accumulated audience fatigue in [0, 1] (grows with repeated exposure). */
  readonly fatigue: number;
  /** Aggregate competitor audience share in [0, 1]. */
  readonly competitorShare: number;
  /** Seasonal/environment multiplier (> 0). */
  readonly seasonalFactor: number;
  /** Opaque additional synthetic knobs (carried verbatim, never interpreted). */
  readonly parameters?: JsonSchemaObject;
}

/**
 * A social world model record: the simulated social environment state for
 * one (niche, platform) pair, under a tenant scope.
 *
 * `worldModelVersion` is the exact version a `LabRun.worldModelVersion`
 * (frozen contracts YAML) points at. World models are APPEND-ONLY: the store
 * assigns `worldModelVersion = latest + 1` and prior versions stay
 * retrievable, so simulations are reproducible against the exact world
 * model version they declared.
 *
 * The record itself is synthetic (a model artifact, not an observation); the
 * `disclosure` field states that explicitly so a world model can never be
 * presented as historical evidence either.
 */
export interface SocialWorldModel {
  readonly id: SocialWorldModelId;
  /** Version a LabRun pins as `worldModelVersion` (append-only chain). */
  readonly worldModelVersion: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly state: SocialWorldModelState;
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  /** DISCLOSURE: synthetic parametric world model — not observed reality. */
  readonly disclosure: 'synthetic-parametric-world-model';
}

/** Draft of a world model version being registered (version assigned by the store). */
export interface SocialWorldModelDraft {
  readonly id: SocialWorldModelId;
  readonly niche: string;
  readonly platform: string;
  readonly state: SocialWorldModelState;
  readonly notes?: string | null;
}

/** Register one world model version (append-only) under a tenant scope. */
export interface RegisterWorldModelInput {
  readonly scope: TenantScope;
  readonly worldModel: SocialWorldModelDraft;
}

/**
 * Versioned, tenant-scoped social world model registry (4 methods ≤ 12
 * policy budget). Append-only: registration appends `worldModelVersion + 1`
 * per world model id; existing versions are never mutated or deleted.
 */
export interface SocialWorldModelStore {
  /** Append a new immutable world model version. Fails with `invalid-input`. */
  registerWorldModel(
    input: RegisterWorldModelInput,
  ): Promise<SocialWorldModel | SimulatorError>;

  /** Fetch one world model version, or `null` when unknown in this tenant scope. */
  getWorldModel(
    scope: TenantScope,
    id: SocialWorldModelId,
    worldModelVersion: number,
  ): Promise<SocialWorldModel | null>;

  /** Fetch the latest world model version, or `null` when unknown in this tenant scope. */
  resolveLatestWorldModel(
    scope: TenantScope,
    id: SocialWorldModelId,
  ): Promise<SocialWorldModel | null>;

  /** List world model versions visible in the tenant scope, oldest first. */
  listWorldModelVersions(
    scope: TenantScope,
    id: SocialWorldModelId,
  ): Promise<readonly SocialWorldModel[]>;
}

// ---------------------------------------------------------------------------
// Strategy action candidate (sim-specific, local)
// ---------------------------------------------------------------------------

/**
 * Strategy candidate kinds the simulator accepts. `no-op` and `repost` are
 * FIRST-CLASS candidates (architecture lock rule 5: no-op/repost is a
 * first-class strategy/transform candidate) — a no-op produces no simulated
 * activity and leaves the world state unchanged; a repost carries damped
 * novelty.
 */
export type StrategyActionKind = 'content' | 'repost' | 'no-op';

/**
 * The action/strategy candidate the simulator steps: the opaque canonical
 * `StrategyRef` plus the synthetic action-intensity knobs the disclosed
 * parametric response function consumes. These knobs are SIM-SPECIFIC LOCAL
 * types — they are response-function parameters, not canonical contract
 * fields.
 */
export interface StrategyActionCandidate {
  readonly strategyRef: StrategyRef;
  readonly kind: StrategyActionKind;
  /** Publishing cadence per week (>= 0, finite). */
  readonly cadencePerWeek: number;
  /** Content novelty in [0, 1]. */
  readonly novelty: number;
  /** Engagement effort (replying/community work) in [0, 1]. */
  readonly engagementEffort: number;
}

// ---------------------------------------------------------------------------
// Simulator engine port
// ---------------------------------------------------------------------------

/** One deterministic simulator step request. `seed` is REQUIRED (never null). */
export interface SimulatorStepInput {
  readonly scope: TenantScope;
  readonly worldModelId: SocialWorldModelId;
  /** Exact world model version to step (resolved through the store). */
  readonly worldModelVersion: number;
  /** The scenario the step belongs to (carries the version pins + objective). */
  readonly scenario: LabScenario;
  readonly candidate: StrategyActionCandidate;
  /** Determinism seed — same seed + same inputs → identical results. */
  readonly seed: number;
  /** Step index (>= 0). */
  readonly step: number;
}

/** One simulated platform-state metric delta with its uncertainty envelope. */
export interface SimulatedMetricDelta {
  readonly metric: string;
  readonly expectedDelta: number;
  readonly interval: { readonly lower: number; readonly upper: number };
  readonly unit: string;
}

/**
 * The result of one simulator step: a {@link SimulationPrediction} (labeled
 * `counterfactual: true`, disclosed synthetic) extended with the simulated
 * platform state deltas (reach/engagement-style synthetic quantities for the
 * scenario's objective) and the next world state.
 *
 * Because this extends `SimulationPrediction`, it is assignable everywhere a
 * prediction is expected and NOWHERE a `HistoricalObservation` is required
 * (lock rule 29 — pinned by the compile-time assertions at the bottom).
 */
export interface SocialSimulationResult extends SimulationPrediction {
  /** Simulated per-step metric deltas (synthetic, disclosed). */
  readonly deltas: readonly SimulatedMetricDelta[];
  /** World state after applying the step. */
  readonly nextWorldState: SocialWorldModelState;
}

/** Machine-readable failure codes for simulator operations. */
export type SimulatorErrorCode =
  | 'invalid-input'
  | 'unknown-world-model'
  | 'world-model-version-not-found'
  | 'scenario-world-model-mismatch'
  | 'simulator-version-mismatch';

/** Typed failure value (result union, the MOS domain convention). */
export interface SimulatorError {
  readonly error: SimulatorErrorCode;
  readonly message: string;
}

/**
 * The social simulator engine (LAB-004): deterministic, seed-required
 * stepping of a scenario against a versioned world model.
 *
 * Determinism contract: `simulateStep` is a PURE function of its inputs —
 * the same (world model version, scenario, candidate, seed, step) always
 * produces bit-identical results, in the same process or a fresh one. The
 * in-memory adapter is a DISCLOSED deterministic synthetic response function
 * (parametric equations + seeded noise), never a real platform model.
 */
export interface SimulatorEnginePort {
  /**
   * Step the simulator once. Fails with `invalid-input` (bad candidate/seed/
   * step), `unknown-world-model`, `world-model-version-not-found`,
   * `scenario-world-model-mismatch` (niche/platform disagreement between the
   * scenario and the world model) or `simulator-version-mismatch` (the
   * scenario was not declared against this simulator version).
   */
  simulateStep(input: SimulatorStepInput): Promise<SocialSimulationResult | SimulatorError>;
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

type _SimulationResultIsAlwaysCounterfactual = Expect<
  Equal<SocialSimulationResult['counterfactual'], true>
>;
type _SimulationResultIsAPrediction = Expect<
  Equal<IsAssignable<SocialSimulationResult, SimulationPrediction>, true>
>;
type _SimulationResultNeverOccupiesAHistoricalSlot = Expect<
  Equal<IsAssignable<SocialSimulationResult, import('./evidence.js').HistoricalObservation>, false>
>;
