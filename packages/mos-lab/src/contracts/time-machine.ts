import type {
  JsonSchemaObject,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type {
  HistoricalObservation,
  HistoricalObservationId,
  ObservedMetric,
  SimulationPrediction,
} from './evidence.js';

/**
 * Time Machine contracts (LAB-006): the append-only immutable historical
 * timeline and the THREE replay/branching modes of spec §20 —
 *
 * 1. HISTORICAL REPLAY — `replayHistorical` serves `HistoricalObservation`
 *    records strictly by `observedAt <= T`;
 * 2. DELAYED-INFORMATION REPLAY — `replayDelayedInformation` serves, at T
 *    under lag L (milliseconds), only records with `observedAt <= T - L`:
 *    records newer than T-L are NEVER visible (architecture lock rule 30 —
 *    leakage prevention, adversarially test-pinned);
 * 3. COUNTERFACTUAL BRANCHING — `createBranch` forks the world state at a
 *    point in time under an intervention, returning a NEW branch id; branch
 *    predictions are `SimulationPrediction` records (counterfactual, labeled)
 *    and can NEVER masquerade as historical evidence (lock rule 29 — type +
 *    label enforced).
 *
 * The historical timeline is APPEND-ONLY and immutable: there is no update
 * or delete method on the port at all (structural immutability), appended
 * records are deep-frozen, and duplicate ids are rejected. The branch
 * registry is versioned and auditable (full branch lineage with parent
 * links, fork points and interventions).
 *
 * Lag units: `LabScenario.informationLag` (@mos/contracts) is consumed as
 * MILLISECONDS by this module; `lagMs` below uses the same unit.
 */

declare const timeMachineBranchIdBrand: unique symbol;

/** Unique identifier of a counterfactual branch. */
export type TimeMachineBranchId = string & {
  readonly [timeMachineBranchIdBrand]: true;
};

/** Unique identifier of a counterfactual branch record. */
declare const branchRecordIdBrand: unique symbol;
export type BranchRecordId = string & {
  readonly [branchRecordIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Mode 1 + 2: historical / delayed-information replay
// ---------------------------------------------------------------------------

/**
 * Historical replay query: serve the tenant's historical observations with
 * `observedAt <= asOf` (T), optionally filtered by niche/platform, ordered
 * by `observedAt` ascending (ties broken by id), optionally limited.
 */
export interface HistoricalTimelineQuery {
  /** T — the replay point in time. */
  readonly asOf: Timestamp;
  readonly niche?: string;
  readonly platform?: string;
  /** Positive result limit (optional). */
  readonly limit?: number;
}

/**
 * Delayed-information replay query (mode 2): at `asOf` (T) under lag
 * `lagMs` (L >= 0), the agent sees ONLY information available by T-L —
 * records with `observedAt > T - L` are never visible (lock rule 30).
 * `lagMs: 0` degenerates to exact historical replay at T.
 */
export interface DelayedInformationQuery extends HistoricalTimelineQuery {
  /** Information lag L in milliseconds (>= 0, finite). */
  readonly lagMs: number;
}

/** Draft of a historical observation being appended (id + evidence fields only). */
export interface HistoricalObservationDraft {
  readonly id: HistoricalObservationId;
  readonly niche: string;
  readonly platform: string;
  readonly metrics: readonly ObservedMetric[];
  readonly observedAt: Timestamp;
  readonly sourceRefs: readonly string[];
  readonly regime?: string;
}

/** Append one historical observation to the tenant timeline (append-only). */
export interface AppendHistoricalObservationInput {
  readonly scope: TenantScope;
  readonly observation: HistoricalObservationDraft;
}

// ---------------------------------------------------------------------------
// Mode 3: counterfactual branching
// ---------------------------------------------------------------------------

/**
 * The intervention that defines a counterfactual branch: what was changed
 * relative to the parent world (free-form description + structured changed
 * parameters, e.g. strategy parameter overrides or world-state overrides).
 */
export interface TimeMachineIntervention {
  readonly description: string;
  readonly changedParameters: JsonSchemaObject;
}

/** Create a counterfactual branch (the machine assigns the NEW branch id). */
export interface CreateBranchInput {
  readonly scope: TenantScope;
  /**
   * World-state fork point T: the branch is seeded from the historical
   * timeline as of T (the timeline itself is never touched). Branch
   * simulations start from this state.
   */
  readonly forkPoint: Timestamp;
  readonly intervention: TimeMachineIntervention;
  /** Parent branch (defaults to `null` = forked from the historical timeline). */
  readonly parentBranchId?: TimeMachineBranchId;
  readonly label?: string | null;
}

/**
 * A counterfactual branch: a fork of the world state at `forkPoint` under
 * an `intervention`, with an auditable lineage (parent branch, or `null`
 * when forked from the historical timeline itself). Branches are immutable
 * audit records — they are never rewritten, only listed and read.
 *
 * LOCK RULE 29 PIN: a branch is counterfactual by construction
 * (`counterfactual: true` literal) and can never be stored, returned or
 * mistaken for historical evidence.
 */
export interface CounterfactualBranch {
  readonly id: TimeMachineBranchId;
  readonly version: Version;
  readonly tenantId: TenantId;
  /** `null` when forked from the historical timeline; otherwise the parent branch. */
  readonly parentBranchId: TimeMachineBranchId | null;
  readonly forkPoint: Timestamp;
  readonly intervention: TimeMachineIntervention;
  readonly label: string | null;
  readonly createdAt: Timestamp;
  /** LOCK RULE 29 PIN: counterfactual — never historical evidence. */
  readonly counterfactual: true;
}

/**
 * One record inside a counterfactual branch: a {@link SimulationPrediction}
 * (counterfactual, labeled, disclosed synthetic) produced by a simulator
 * under this branch. The `prediction` field's type IS `SimulationPrediction`,
 * so a `HistoricalObservation` can never be recorded into a branch
 * (compile-time), and the runtime re-validates `counterfactual === true`
 * (double-cast proof).
 */
export interface CounterfactualBranchRecord {
  readonly id: BranchRecordId;
  readonly branchId: TimeMachineBranchId;
  readonly prediction: SimulationPrediction;
  readonly recordedAt: Timestamp;
  /** LOCK RULE 29 PIN: branch records are counterfactual, never historical. */
  readonly counterfactual: true;
}

/** Record one simulator prediction into a counterfactual branch. */
export interface RecordBranchPredictionInput {
  readonly scope: TenantScope;
  readonly branchId: TimeMachineBranchId;
  readonly prediction: SimulationPrediction;
}

// ---------------------------------------------------------------------------
// Failure model + port
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for Time Machine operations. */
export type TimeMachineErrorCode =
  | 'invalid-input'
  | 'duplicate-observation'
  | 'unknown-branch'
  | 'prediction-tenant-mismatch'
  | 'prediction-not-counterfactual';

/** Typed failure value (result union, the MOS domain convention). */
export interface TimeMachineError {
  readonly error: TimeMachineErrorCode;
  readonly message: string;
}

/**
 * The Time Machine (LAB-006) — 8 public methods (≤ 12 policy budget).
 *
 * THE THREE MODES (spec §20):
 * - `replayHistorical` — mode 1 (observations ≤ T only);
 * - `replayDelayedInformation` — mode 2 (at T under lag L: only information
 *   available by T-L; future-information leakage is FORBIDDEN — lock rule 30);
 * - `createBranch` / `recordBranchPrediction` / `getBranch*` — mode 3
 *   (counterfactual branching with type- and label-separated outputs).
 *
 * STRUCTURAL IMMUTABILITY: the port exposes NO method that can rewrite or
 * remove a historical observation or a branch — the timeline and the branch
 * registry are append-only by construction.
 */
export interface TimeMachinePort {
  /**
   * Append one historical observation (the ONLY way data enters the
   * timeline). Fails with `invalid-input` or `duplicate-observation`.
   */
  appendHistoricalObservation(
    input: AppendHistoricalObservationInput,
  ): Promise<HistoricalObservation | TimeMachineError>;

  /**
   * MODE 1 — historical replay: observations with `observedAt <= asOf`,
   * ascending by `observedAt` (ties by id). Unknown/foreign tenants observe
   * an empty timeline (no existence leak). Fails with `invalid-input` when
   * `asOf`/filters/`limit` are malformed (fail-closed named codes).
   */
  replayHistorical(
    scope: TenantScope,
    query: HistoricalTimelineQuery,
  ): Promise<readonly HistoricalObservation[] | TimeMachineError>;

  /**
   * MODE 2 — delayed-information replay: at `asOf` under lag `lagMs`, only
   * observations with `observedAt <= asOf - lagMs` are visible. Records with
   * `observedAt > asOf - lagMs` are NEVER returned, regardless of append
   * order (lock rule 30 — leakage prevention). Fails with `invalid-input`
   * when `asOf`/`lagMs`/filters/`limit` are malformed.
   */
  replayDelayedInformation(
    scope: TenantScope,
    query: DelayedInformationQuery,
  ): Promise<readonly HistoricalObservation[] | TimeMachineError>;

  /**
   * MODE 3 — counterfactual branching: fork the world state at `forkPoint`
   * under an intervention and return the NEW branch (machine-assigned id).
   * Fails with `invalid-input` or `unknown-branch` (parent does not resolve
   * in this tenant scope).
   */
  createBranch(
    input: CreateBranchInput,
  ): Promise<CounterfactualBranch | TimeMachineError>;

  /** Fetch one branch, or `null` when unknown in this tenant scope. */
  getBranch(
    scope: TenantScope,
    branchId: TimeMachineBranchId,
  ): Promise<CounterfactualBranch | null>;

  /** List the tenant's branches in creation order (auditable lineage). */
  listBranches(scope: TenantScope): Promise<readonly CounterfactualBranch[]>;

  /**
   * Record one simulator prediction into a branch. The prediction must be a
   * counterfactual `SimulationPrediction` belonging to this tenant; fails
   * with `unknown-branch`, `prediction-tenant-mismatch` or
   * `prediction-not-counterfactual` (runtime label re-validation).
   */
  recordBranchPrediction(
    input: RecordBranchPredictionInput,
  ): Promise<CounterfactualBranchRecord | TimeMachineError>;

  /**
   * List the prediction records of one branch in recording order. Fails
   * with `unknown-branch` (unknown and cross-tenant are indistinguishable).
   */
  getBranchRecords(
    scope: TenantScope,
    branchId: TimeMachineBranchId,
  ): Promise<readonly CounterfactualBranchRecord[] | TimeMachineError>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 29/30)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _BranchesAreAlwaysCounterfactual = Expect<
  Equal<CounterfactualBranch['counterfactual'], true>
>;
type _BranchRecordsAreAlwaysCounterfactual = Expect<
  Equal<CounterfactualBranchRecord['counterfactual'], true>
>;
type _BranchRecordsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<CounterfactualBranchRecord, HistoricalObservation>, false>
>;
type _HistoricalObservationsCannotBeRecordedIntoBranches = Expect<
  Equal<IsAssignable<HistoricalObservation, SimulationPrediction>, false>
>;
type _BranchRecordsNeverOccupyABranchSlot = Expect<
  Equal<IsAssignable<CounterfactualBranchRecord, CounterfactualBranch>, false>
>;
