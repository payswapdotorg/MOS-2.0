import type {
  LabScenario,
  LabScenarioId,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
  Version,
} from '@mos/contracts';
import type {
  HistoricalObservation,
  SimulationPrediction,
} from './evidence.js';
import type {
  SimulatedMetricDelta,
  SocialSimulationResult,
  SocialWorldModelId,
  StrategyActionCandidate,
} from './simulator.js';

/**
 * World Model Ensemble contracts (LAB-007): versioned, tenant-scoped,
 * append-only ensembles of world-model version members whose evaluation
 * aggregates member predictions into distributional predictions with the
 * full §22 uncertainty set — expected value, uncertainty interval, MODEL
 * DISAGREEMENT (member spread), seed robustness (multi-seed sweep) and an
 * OOD/novelty signal against member-declared coverage.
 *
 * Basis: spec/mos-architecture-v2.0.md §20 (response/world-model ensemble),
 * §22 (ensemble models, expected value, interval, disagreement, OOD
 * distance, calibration, novelty/regime risk, seed robustness; simulator
 * outputs are never ground truth), lock rules 29/32.
 *
 * CALIBRATION PLACEHOLDER: §22 lists calibration, but calibration numbers
 * are LAB-018 (online calibration) territory — every ensemble prediction
 * carries a {@link CalibrationPlaceholder} with declared provenance text; NO
 * calibration numbers are computed or implied here (never faked).
 *
 * DISCLOSURE: members execute through the LAB-004 SimulatorEnginePort, whose
 * in-memory adapter is a disclosed deterministic synthetic response function
 * — the ENG-004 dependency (benchmark-grade versioned model execution) is
 * modeled by deterministic doubles, never claimed as calibrated platform
 * models. Ensemble outputs stay counterfactual `SimulationPrediction`s.
 */

declare const worldModelEnsembleIdBrand: unique symbol;

/** Unique identifier of a world model ensemble. */
export type WorldModelEnsembleId = string & {
  readonly [worldModelEnsembleIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Weighting policy (explicit and versioned — no silent defaults)
// ---------------------------------------------------------------------------

/**
 * The ensemble's weighting policy: EXPLICIT and VERSIONED. `uniform` weights
 * all members equally (an explicitly declared choice — never a silent
 * default); `declared-member-weights` uses member-declared weights (every
 * member must declare one). Either way the member spread stays visible in
 * `disagreement` — weighting can never hide model disagreement (§22).
 */
export interface EnsembleWeightingPolicy {
  /** Policy identity (stable across its versions). */
  readonly id: string;
  /** Policy-local monotonic version — policy evolution is explicit and traceable. */
  readonly version: number;
  readonly kind: 'uniform' | 'declared-member-weights';
  /** Why this weighting was chosen (mandatory rationale). */
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Members + declared coverage (OOD seam)
// ---------------------------------------------------------------------------

/** One dimension of a member's declared input-coverage box. */
export interface CoverageRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The input domain a member DECLARES it was built/validated on (a disclosed
 * seam: a declaration, not a verified property — out-of-coverage inputs are
 * FLAGGED instead of silently extrapolated).
 */
export interface MemberCoverage {
  readonly cadencePerWeek: CoverageRange;
  readonly novelty: CoverageRange;
  readonly engagementEffort: CoverageRange;
}

/**
 * One ensemble member: a world-model version reference (LAB-004 append-only
 * chain) with optional declared weight + coverage. Structural validation at
 * registration; world-model existence enforced fail-closed at evaluation.
 */
export interface EnsembleMember {
  /** Member id, unique within the ensemble. */
  readonly id: string;
  readonly worldModelId: SocialWorldModelId;
  /** Exact world-model version this member pins (append-only chain). */
  readonly worldModelVersion: number;
  /** Declared weight (> 0); REQUIRED iff the policy is `declared-member-weights`. */
  readonly weight?: number;
  /** Declared input coverage; absent members are OOD-undeclared (disclosed). */
  readonly coverage?: MemberCoverage;
  readonly notes?: string | null;
}

// ---------------------------------------------------------------------------
// Ensemble records (versioned, tenant-scoped, append-only)
// ---------------------------------------------------------------------------

/**
 * A world model ensemble version: an immutable snapshot of the membership
 * and weighting policy. Registration creates version 1; member addition
 * appends the next version (prior versions stay retrievable); freezing
 * appends a `frozen` version blocking further additions. Records are
 * deep-frozen — there is no update or delete method on the port.
 */
export interface WorldModelEnsemble {
  readonly id: WorldModelEnsembleId;
  /** Ensemble version (append-only chain per (tenant, ensemble id)). */
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  /** Membership snapshot (>= 2 members — empty/single are structurally rejected). */
  readonly members: readonly EnsembleMember[];
  readonly weightingPolicy: EnsembleWeightingPolicy;
  /** `frozen` versions refuse further member additions (append-only finality). */
  readonly status: 'active' | 'frozen';
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  /** DISCLOSURE: aggregate of disclosed synthetic response functions. */
  readonly disclosure: 'synthetic-ensemble-of-disclosed-response-functions';
}

/** Draft of the ensemble's first version (version assigned by the store). */
export interface WorldModelEnsembleDraft {
  readonly id: WorldModelEnsembleId;
  readonly niche: string;
  readonly platform: string;
  readonly members: readonly EnsembleMember[];
  readonly weightingPolicy: EnsembleWeightingPolicy;
  readonly notes?: string | null;
}

/** Register a new ensemble (creates version 1). */
export interface RegisterEnsembleInput {
  readonly scope: TenantScope;
  readonly ensemble: WorldModelEnsembleDraft;
}

/** Append one member as a NEW ensemble version (append-only composition). */
export interface AddEnsembleMemberInput {
  readonly scope: TenantScope;
  readonly ensembleId: WorldModelEnsembleId;
  readonly member: EnsembleMember;
}

// ---------------------------------------------------------------------------
// Evaluation outputs (§22 uncertainty set)
// ---------------------------------------------------------------------------

/** Calibration placeholder carried on every ensemble prediction (never a number). */
export interface CalibrationPlaceholder {
  readonly status: 'not-calibrated';
  readonly provenance:
    'calibration is LAB-018 (online calibration) — no calibration numbers are computed or implied by the ensemble';
}

/** OOD verdict for one member against its declared coverage. */
export interface MemberOodVerdict {
  readonly memberId: string;
  /** `undeclared` when the member declared no coverage (disclosed seam). */
  readonly verdict: 'in-coverage' | 'out-of-declared-coverage' | 'undeclared';
  /** Per-dimension normalized out-of-box distances (0 = inside). */
  readonly distances: {
    readonly cadencePerWeek: number;
    readonly novelty: number;
    readonly engagementEffort: number;
  };
  /** Max normalized distance over the dimensions (0 = in coverage). */
  readonly maxDistance: number;
}

/** Ensemble-level OOD/novelty signal: flagged when any member declares the
 * input out of its coverage — a LOUD signal, never silent extrapolation. */
export interface EnsembleOodSignal {
  /** `partially-undeclared` = no member is OOD but some declared no coverage. */
  readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
  readonly flagged: boolean;
  readonly perMember: readonly MemberOodVerdict[];
}

/** Model disagreement for one aggregated metric: the member expected-value spread. */
export interface MetricDisagreement {
  readonly metric: string;
  readonly unit: string;
  /** Per-member expected values (aligned with the member order). */
  readonly memberExpected: readonly number[];
  /** max − min over member expected values — ALWAYS reported, never hidden. */
  readonly spread: number;
  readonly halfSpread: number;
}

/** Aggregate model disagreement across the aggregated metrics. */
export interface EnsembleDisagreement {
  readonly perMetric: readonly MetricDisagreement[];
  /** Worst relative half-spread across metrics (conservative summary). */
  readonly summary: UncertaintySummary;
}

/** One member's prediction inside an ensemble evaluation (full fidelity). */
export interface MemberPrediction {
  readonly memberId: string;
  readonly worldModelId: SocialWorldModelId;
  readonly worldModelVersion: number;
  /** Effective weight after policy resolution + normalization (sums to 1). */
  readonly effectiveWeight: number;
  readonly prediction: SocialSimulationResult;
}

/**
 * An ensemble prediction: a counterfactual `SimulationPrediction` (never a
 * `HistoricalObservation` — lock rule 29) aggregating member predictions
 * with the §22 uncertainty set. `worldModelVersion` carries the ENSEMBLE
 * version (member world-model versions are enumerated in
 * `memberPredictions`); `simulatorVersion` is the scenario-pinned version.
 */
export interface EnsemblePrediction extends SimulationPrediction {
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly weightingPolicy: EnsembleWeightingPolicy;
  readonly memberPredictions: readonly MemberPrediction[];
  /** Aggregate disagreement (member spread) — always visible (§22). */
  readonly disagreement: EnsembleDisagreement;
  /** OOD/novelty signal vs declared member coverage (§22). */
  readonly ood: EnsembleOodSignal;
  /** Carried to LAB-018 — provenance-declared, never a number. */
  readonly calibration: CalibrationPlaceholder;
  /** Aggregate metric deltas (same aggregation as `metrics`). */
  readonly deltas: readonly SimulatedMetricDelta[];
  /** Metrics present in only some members (dropped from aggregation, visible). */
  readonly nonUniversalMetrics: readonly string[];
}

/** One deterministic ensemble evaluation request (seed REQUIRED). */
export interface EnsembleEvaluationInput {
  readonly scope: TenantScope;
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly scenario: LabScenario;
  readonly candidate: StrategyActionCandidate;
  readonly seed: number;
  readonly step: number;
}

/** Per-metric seed robustness sweep result. */
export interface SeedRobustnessMetricSweep {
  readonly metric: string;
  readonly unit: string;
  /** Aggregate expected value per seed (aligned with the sweep's seed order). */
  readonly expectedBySeed: readonly number[];
  readonly min: number;
  readonly max: number;
  /** max − min across seeds (spread / |mean| below). */
  readonly spread: number;
  /** spread / |mean of expectedBySeed| (0 when both are 0). */
  readonly relativeSpread: number;
}

/**
 * A multi-seed robustness sweep record (§22 seed robustness): how much the
 * ensemble's aggregate predictions move across seeds. Counterfactual and
 * disclosed — simulation-derived diagnostics, never historical evidence.
 */
export interface SeedRobustnessSweep {
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly scenarioRef: LabScenarioId;
  readonly strategyRef: StrategyRef;
  readonly seeds: readonly number[];
  readonly step: number;
  readonly perMetric: readonly SeedRobustnessMetricSweep[];
  readonly summary: UncertaintySummary;
  /** LOCK RULE 29 PIN: simulation-derived diagnostic, never historical evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'synthetic-response-function';
}

// ---------------------------------------------------------------------------
// Failure model + port
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for ensemble operations. */
export type EnsembleErrorCode =
  | 'invalid-input'
  | 'unknown-ensemble'
  | 'ensemble-version-not-found'
  | 'ensemble-frozen'
  | 'duplicate-member'
  | 'scenario-ensemble-mismatch'
  | 'member-evaluation-failed';

/** Typed failure value (result union, the MOS domain convention). */
export interface EnsembleError {
  readonly error: EnsembleErrorCode;
  readonly message: string;
}

/**
 * The World Model Ensemble port (LAB-007) — 8 public methods (≤ 12 policy
 * budget): append-only composition (register/add/freeze), version reads
 * (get/resolveLatest/list) and evaluation (evaluateEnsemble,
 * runSeedRobustnessSweep). Ensemble versions are immutable snapshots; the
 * only mutations are APPENDS. All evaluation outputs are counterfactual
 * `SimulationPrediction`s with the full §22 set where computable
 * (calibration carried as a declared placeholder).
 */
export interface EnsemblePort {
  /** Register a new ensemble (version 1). Fails `invalid-input` (incl. < 2 members). */
  registerEnsemble(input: RegisterEnsembleInput): Promise<WorldModelEnsemble | EnsembleError>;
  /** Append a member as a NEW version. Fails `unknown-ensemble`/`ensemble-frozen`/`duplicate-member`/`invalid-input`. */
  addEnsembleMember(input: AddEnsembleMemberInput): Promise<WorldModelEnsemble | EnsembleError>;
  /** Freeze the latest version (appends a `frozen` version). Fails `unknown-ensemble`/`invalid-input` when already frozen. */
  freezeEnsemble(
    scope: TenantScope,
    ensembleId: WorldModelEnsembleId,
  ): Promise<WorldModelEnsemble | EnsembleError>;
  /** Fetch one ensemble version, or `null` when unknown in this tenant scope. */
  getEnsemble(
    scope: TenantScope,
    id: WorldModelEnsembleId,
    version: number,
  ): Promise<WorldModelEnsemble | null>;
  /** Fetch the latest ensemble version, or `null` when unknown in this tenant scope. */
  resolveLatestEnsemble(
    scope: TenantScope,
    id: WorldModelEnsembleId,
  ): Promise<WorldModelEnsemble | null>;
  /** List ensemble versions visible in the tenant scope, oldest first. */
  listEnsembleVersions(
    scope: TenantScope,
    id: WorldModelEnsembleId,
  ): Promise<readonly WorldModelEnsemble[]>;
  /**
   * Evaluate the ensemble once: run every member through the simulator and
   * aggregate. Fails `invalid-input`, `unknown-ensemble`,
   * `ensemble-version-not-found`, `scenario-ensemble-mismatch` or
   * `member-evaluation-failed` (underlying engine error, member named).
   */
  evaluateEnsemble(
    input: EnsembleEvaluationInput,
  ): Promise<EnsemblePrediction | EnsembleError>;
  /**
   * Sweep the aggregate across seeds (>= 2 required). Same failure codes as
   * `evaluateEnsemble`.
   */
  runSeedRobustnessSweep(
    input: EnsembleEvaluationInput & { readonly seeds: readonly number[] },
  ): Promise<SeedRobustnessSweep | EnsembleError>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 29/32)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _EnsemblePredictionsAreAlwaysCounterfactual = Expect<
  Equal<EnsemblePrediction['counterfactual'], true>
>;
type _EnsemblePredictionsAreSimulationPredictions = Expect<
  Equal<IsAssignable<EnsemblePrediction, SimulationPrediction>, true>
>;
type _EnsemblePredictionsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<EnsemblePrediction, HistoricalObservation>, false>
>;
type _SeedSweepsAreAlwaysCounterfactual = Expect<
  Equal<SeedRobustnessSweep['counterfactual'], true>
>;
type _SeedSweepsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<SeedRobustnessSweep, HistoricalObservation>, false>
>;
type _CalibrationPlaceholderIsNeverANumber = Expect<
  Equal<CalibrationPlaceholder['status'], 'not-calibrated'>
>;
