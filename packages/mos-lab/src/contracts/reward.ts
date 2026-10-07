import type { StrategyRef } from '@mos/contracts';
import type { StrategyActionCandidate } from './simulator.js';

/**
 * Mission-compatible reward vocabulary + candidate program descriptors for
 * LAB-008 (offline/off-policy evaluation) and LAB-009 (sequential strategy
 * learning).
 *
 * Basis: spec/mos-architecture-v2.0.md §21 (reward is mission-specific and
 * versioned; it can combine business outcome, qualified reach, retention,
 * audience growth, qualified traffic, conversion, revenue/contribution, cost,
 * latency, human/engine acquisition cost, rights/policy risk, fatigue,
 * quality, operational risk; vanity metrics never silently replace the
 * declared objective), §22 (uncertainty before deployment-ready selection).
 *
 * DESIGN CALL (W4-A, disclosed): `@mos/missions` owns the canonical
 * `MissionRewardSpec` (CORE-005), but the missions module is NOT among the
 * lab module's registry dependencies (spec/mos-module-registry-v2.0.yaml:
 * lab → contracts/content/production/agents/capabilities/engines/jobs). The
 * lab therefore declares a STRUCTURALLY COMPATIBLE local reward spec whose
 * metric vocabulary mirrors the missions `RewardMetricId` union exactly; the
 * composition root wires a real `@mos/missions` reward spec into this shape
 * (each term additionally declares the concrete metric SOURCE it draws its
 * value from — an explicit binding, never a silent mapping).
 */

// ---------------------------------------------------------------------------
// Reward metric vocabulary (§21 — mirrors @mos/missions RewardMetricId)
// ---------------------------------------------------------------------------

/**
 * The §21 reward metric vocabulary. This union mirrors the missions module's
 * `RewardMetricId` EXACTLY (17 metrics) so a mission reward spec maps onto a
 * {@link LabRewardSpec} term-for-term at the composition seam.
 */
export type LabRewardMetricId =
  | 'business-outcome'
  | 'qualified-reach'
  | 'retention'
  | 'audience-growth'
  | 'qualified-traffic'
  | 'conversion'
  | 'revenue'
  | 'contribution'
  | 'cost'
  | 'latency'
  | 'human-acquisition-cost'
  | 'engine-acquisition-cost'
  | 'rights-risk'
  | 'policy-risk'
  | 'fatigue'
  | 'quality'
  | 'operational-risk';

/** Direction of a reward term: value terms are maximized, cost/risk terms minimized. */
export type LabRewardDirection = 'maximize' | 'minimize';

/**
 * One term of the lab reward model.
 *
 * Beyond the mission-shaped fields (metric, weight, direction, mandatory
 * definition — "qualified reach" is only as good as its definition), a lab
 * term MUST declare `metricSource`: the concrete metric identifier this term
 * draws its value from during evaluation — an ensemble-predicted metric name
 * (e.g. `qualified-reach`, `objective:<objective>`, `fatigue`) or an observed
 * historical metric name (LAB-008). The binding is EXPLICIT: a term whose
 * source resolves nowhere fails the evaluation closed (`reward-term-not-
 * derivable`), and a source that resolves ambiguously (both predicted and
 * observed) fails closed too — vanity metrics never silently replace the
 * declared objective (§21).
 */
export interface LabRewardTerm {
  readonly metric: LabRewardMetricId;
  /** Positive finite weight (relative scale; any positive value is valid). */
  readonly weight: number;
  readonly direction: LabRewardDirection;
  /** Precise human-readable definition of what counts (mandatory, never defaulted). */
  readonly definition: string;
  /** Concrete predicted/observed metric id this term's value comes from. */
  readonly metricSource: string;
}

/**
 * A reward specification for lab evaluation — versioned independently so
 * reward changes are explicit and traceable, never silent (§21). The version
 * is pinned against `LabScenario.rewardVersion` by every consumer
 * (LAB-008/LAB-009 fail closed with `reward-version-mismatch`).
 */
export interface LabRewardSpec {
  /** Spec-local monotonic version (must equal the scenario's `rewardVersion`). */
  readonly version: number;
  /** Non-empty term list; terms are validated (positive weights, sources declared). */
  readonly terms: readonly LabRewardTerm[];
}

// ---------------------------------------------------------------------------
// Candidate program descriptor (LAB-008/LAB-009 shared input shape)
// ---------------------------------------------------------------------------

/**
 * A candidate program under evaluation/learning: the opaque canonical
 * `StrategyRef` plus the sim-local action knobs (`StrategyActionCandidate`)
 * and the simulated horizon in steps. This is the program descriptor LAB-008
 * scores against recorded history and LAB-009 improves through simulation.
 */
export interface CandidateProgramDescriptor {
  readonly candidate: CandidateProgramStrategy;
  /** Simulated horizon in steps (>= 1). */
  readonly horizonSteps: number;
  /** Optional human label (provenance-friendly, never interpreted). */
  readonly label?: string | null;
}

/**
 * The strategy action candidate shape consumed by program descriptors. This
 * re-declares the LAB-004 `StrategyActionCandidate` surface structurally so
 * the LAB-008/009 contracts do not import the simulator contract module
 * (both shapes are validated by the same shared validator; the composition
 * root passes the same objects through both surfaces).
 */
export interface CandidateProgramStrategy {
  readonly strategyRef: StrategyRef;
  readonly kind: 'content' | 'repost' | 'no-op';
  /** Publishing cadence per week (>= 0, finite). */
  readonly cadencePerWeek: number;
  /** Content novelty in [0, 1]. */
  readonly novelty: number;
  /** Engagement effort in [0, 1]. */
  readonly engagementEffort: number;
}

// ---------------------------------------------------------------------------
// Compile-time vocabulary pins
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

/** The 17-metric §21 vocabulary must stay intact (drift breaks the missions seam). */
type _RewardVocabularyHasSeventeenMetrics = Expect<
  Equal<
    LabRewardMetricId,
    | 'business-outcome'
    | 'qualified-reach'
    | 'retention'
    | 'audience-growth'
    | 'qualified-traffic'
    | 'conversion'
    | 'revenue'
    | 'contribution'
    | 'cost'
    | 'latency'
    | 'human-acquisition-cost'
    | 'engine-acquisition-cost'
    | 'rights-risk'
    | 'policy-risk'
    | 'fatigue'
    | 'quality'
    | 'operational-risk'
  >
>;
/** A reward term without a metricSource must not typecheck (explicit binding). */
type _RewardTermsAlwaysDeclareASource = Expect<
  Equal<LabRewardTerm['metricSource'], string>
>;
/** Direction stays binary (no silent default direction). */
type _RewardDirectionIsBinary = Expect<
  Equal<LabRewardDirection, 'maximize' | 'minimize'>
>;
/** CandidateProgramStrategy is structurally the LAB-004 candidate shape (both directions). */
type _ProgramStrategyAcceptsASimulatorCandidate = Expect<
  Equal<IsAssignable<StrategyActionCandidate, CandidateProgramStrategy>, true>
>;
type _SimulatorCandidateAcceptsAProgramStrategy = Expect<
  Equal<IsAssignable<CandidateProgramStrategy, StrategyActionCandidate>, true>
>;
