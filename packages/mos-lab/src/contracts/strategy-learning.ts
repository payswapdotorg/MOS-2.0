import type {
  LabScenario,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
} from '@mos/contracts';
import type {
  HistoricalObservation,
  PredictionInterval,
} from './evidence.js';
import type { WorldModelEnsembleId } from './ensemble.js';
import type {
  CandidateProgramDescriptor,
  LabRewardSpec,
} from './reward.js';

/**
 * Sequential Strategy Learning contracts (LAB-009): learn/improve strategy
 * sequences FROM SIMULATION EXPERIENCE ONLY.
 *
 * Basis: spec/mos-architecture-v2.0.md §20 (sequential simulator learning),
 * §21 (versioned reward), §22 (uncertainty before deployment-ready
 * selection), §24 (real-world boundary), lock rule 29 (historical evidence
 * and counterfactual predictions are distinct).
 *
 * THE LEARNER STAYS INSIDE THE LAB: outputs are counterfactual-labeled
 * candidates for organization/program search (LAB-010/012, later waves) —
 * never deployment decisions. The §24 boundary is untouched: there is no
 * publication surface, no provider call, no experiment write anywhere in
 * this module (the port cannot leave the lab).
 *
 * DETERMINISM: `seed` is REQUIRED — the same (initial program, seed,
 * ensemble version, reward spec, stopping policy) always produces a
 * bit-identical learning trace (test-pinned).
 *
 * STOPPING POLICY: explicit and declared ({@link LearningStoppingPolicy}) —
 * iteration cap, simulated-step budget and plateau detection are caller
 * declarations, never heuristic-silent defaults. The delay-expectation
 * first-class variable (§2) appears only as the declared
 * `simulatedSteps` cost dimension of the trace — production delay
 * economics is LAB-015's domain and is NOT forced here.
 *
 * DISCLOSURE: learning runs on the LAB-007 ensemble whose members are
 * disclosed deterministic synthetic response functions — the learned
 * candidate is a SIMULATED artifact, counterfactual-labeled with full
 * provenance of which simulator/ensemble versions produced it.
 */

declare const learnedStrategyCandidateIdBrand: unique symbol;

/** Unique identifier of a learned strategy candidate record. */
export type LearnedStrategyCandidateId = string & {
  readonly [learnedStrategyCandidateIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Stopping policy (declared, not heuristic-silent)
// ---------------------------------------------------------------------------

/**
 * The declared stopping policy. All three mechanisms are explicit caller
 * declarations:
 * - `maxIterations` — hard iteration cap;
 * - `maxSimulatedSteps` — member-step budget (every ensemble member step
 *   executed by the learner costs 1; validated to cover at least one full
 *   iteration);
 * - `plateauWindow`/`plateauTolerance` — `plateauWindow` consecutive
 *   iterations without an improvement above `plateauTolerance` stop the
 *   run with `plateau-detected`.
 */
export interface LearningStoppingPolicy {
  readonly maxIterations: number;
  readonly maxSimulatedSteps: number;
  /** Consecutive non-improving iterations tolerated (>= 1). */
  readonly plateauWindow: number;
  /** Minimum absolute reward improvement that counts as progress (>= 0). */
  readonly plateauTolerance: number;
}

// ---------------------------------------------------------------------------
// Learning trace
// ---------------------------------------------------------------------------

/** One evaluated variant (the incumbent or one neighbor) in one iteration. */
export interface VariantEvaluation {
  readonly candidate: import('./reward.js').CandidateProgramStrategy;
  readonly estimatedReward: number;
  readonly interval: PredictionInterval;
}

/** The declared cost dimensions of one iteration (§2 delay-economics seam). */
export interface IterationCostDimensions {
  /** Member steps executed this iteration (variants × seeds × horizon × members). */
  readonly simulatedSteps: number;
  readonly cumulativeSimulatedSteps: number;
}

/** One learning-trace iteration: what was tried, estimated, and chosen. */
export interface LearningTraceIteration {
  readonly iteration: number;
  /** All variants evaluated this iteration (incumbent first, then neighbors). */
  readonly evaluated: readonly VariantEvaluation[];
  /** The chosen variant (best improving neighbor, else the incumbent). */
  readonly chosen: import('./reward.js').CandidateProgramStrategy;
  /** Chosen estimate − incumbent estimate (0 when nothing improved). */
  readonly improvement: number;
  readonly improved: boolean;
  readonly costs: IterationCostDimensions;
}

/** Why the learner stopped — always one of the DECLARED mechanisms. */
export type LearningStopReason =
  | 'budget-exhausted'
  | 'iteration-cap-reached'
  | 'plateau-detected';

/** The full learning trace: per-iteration estimates + the stopping record. */
export interface LearningTrace {
  readonly iterations: readonly LearningTraceIteration[];
  readonly stoppingReason: LearningStopReason;
  readonly stoppingDetail: string;
  /** Total member steps consumed by the whole run. */
  readonly totalSimulatedSteps: number;
  /** Final incumbent estimate (null only when zero iterations ran). */
  readonly finalEstimate: {
    readonly reward: number;
    readonly interval: PredictionInterval;
    readonly uncertainty: UncertaintySummary;
  } | null;
}

// ---------------------------------------------------------------------------
// Learned candidate (counterfactual, full provenance, stays in the lab)
// ---------------------------------------------------------------------------

/**
 * The provenance of a learned strategy candidate: EVERY versioned input that
 * produced it — the ensemble id/version, the member world-model versions,
 * the simulator version every member executed under, the reward spec
 * version, the seed, the parent strategy and the stopping record.
 */
export interface LearningProvenance {
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  /** Member world-model versions (aligned with the ensemble member order). */
  readonly memberWorldModelVersions: readonly number[];
  /** Simulator version every member executed under (scenario-pinned). */
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  readonly seed: number;
  readonly iterationCount: number;
  readonly stoppingReason: LearningStopReason;
  /** The initial program's strategyRef the learning started from. */
  readonly parentStrategyRef: StrategyRef;
  readonly learnedAt: Timestamp;
}

/**
 * A learned strategy candidate: a COUNTERFACTUAL artifact produced entirely
 * inside the lab from simulation experience. It is a candidate for
 * organization/program search — never a deployment decision, never
 * historical evidence, and there is no surface through which it can be
 * published (§24 boundary untouched).
 */
export interface LearnedStrategyCandidate {
  readonly id: LearnedStrategyCandidateId;
  readonly tenantId: TenantId;
  readonly candidate: import('./reward.js').CandidateProgramStrategy;
  readonly horizonSteps: number;
  readonly trace: LearningTrace;
  readonly provenance: LearningProvenance;
  /** LOCK RULE 29 PIN: counterfactual — never historical evidence. */
  readonly counterfactual: true;
  readonly disclosure: 'learned-in-simulation';
  /** §24 boundary statement carried on the record. */
  readonly labOnly:
    'learned from simulation experience only — a lab candidate, never a deployment decision; the real-experiment boundary (§24) is untouched';
}

// ---------------------------------------------------------------------------
// Input + failure model + port
// ---------------------------------------------------------------------------

/** One sequential strategy learning run request. `seed` is REQUIRED. */
export interface StrategyLearningInput {
  readonly scope: TenantScope;
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  readonly scenario: LabScenario;
  /** Reward spec whose `version` MUST equal `scenario.rewardVersion`. */
  readonly rewardSpec: LabRewardSpec;
  /** The program learning starts from (its candidate is iteration-0's incumbent). */
  readonly initialProgram: CandidateProgramDescriptor;
  readonly seed: number;
  readonly stoppingPolicy: LearningStoppingPolicy;
}

/** Machine-readable failure codes for strategy learning. */
export type StrategyLearningErrorCode =
  | 'invalid-input'
  | 'unknown-ensemble'
  | 'ensemble-version-not-found'
  | 'reward-version-mismatch'
  | 'reward-term-not-derivable'
  | 'ensemble-evaluation-failed';

/** Typed failure value (result union, the MOS domain convention). */
export interface StrategyLearningError {
  readonly error: StrategyLearningErrorCode;
  readonly message: string;
}

/**
 * The sequential strategy learning port (LAB-009) — a single method (≤ 12
 * policy budget). Learning uses the LAB-007 ensemble ONLY (simulation
 * experience; no Time Machine access — the learner never touches recorded
 * history), a versioned mission-compatible reward spec and a declared
 * stopping policy. Outputs are counterfactual-labeled candidates with the
 * full learning trace.
 */
export interface StrategyLearningPort {
  /**
   * Learn a strategy candidate from simulation experience. Fails closed
   * with `invalid-input`, `unknown-ensemble`,
   * `ensemble-version-not-found`, `reward-version-mismatch`,
   * `reward-term-not-derivable` (a reward term's metricSource resolves to
   * no ensemble-predicted metric) or `ensemble-evaluation-failed`.
   */
  learnStrategy(
    input: StrategyLearningInput,
  ): Promise<LearnedStrategyCandidate | StrategyLearningError>;
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

type _LearnedCandidatesAreAlwaysCounterfactual = Expect<
  Equal<LearnedStrategyCandidate['counterfactual'], true>
>;
type _LearnedCandidatesNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<LearnedStrategyCandidate, HistoricalObservation>, false>
>;
type _HistoricalObservationsNeverOccupyALearnedSlot = Expect<
  Equal<IsAssignable<HistoricalObservation, LearnedStrategyCandidate>, false>
>;
type _TracesAlwaysRecordAStopReason = Expect<
  Equal<LearningTrace['stoppingReason'], LearningStopReason>
>;
