import type { LabScenario, StrategyRef, TenantScope } from '@mos/contracts';
import type { WorldModelEnsembleId } from './ensemble.js';
import type { LabRewardSpec } from './reward.js';
import type { StrategyActionCandidate } from './simulator.js';

/**
 * Robust Marketing Benchmark contracts (LAB-017) — the §22 uncertainty
 * discipline AS A BENCHMARK over candidate programs/strategies.
 *
 * Basis: spec/mos-architecture-v2.0.md §22 (before deployment-ready
 * selection: use ensemble models; report expected value, uncertainty
 * interval, model disagreement, OOD distance, calibration, novelty/regime
 * risk, seed robustness; SIMULATOR OUTPUTS ARE NEVER TREATED AS GROUND
 * TRUTH), §20 (robust benchmark is a Lab capability), §19 (§489 — the
 * benchmark informs the Lab's accept/reject/treat vocabulary; it is not
 * that vocabulary), §21 (versioned mission-specific reward), §7 (program
 * candidates; THE NO-OP PATH IS ALWAYS A VALID BASELINE), §24 (real-world
 * boundary — benchmark output informs SELECTION, it is NOT deployment
 * evidence), lock rules 5/29/32.
 *
 * WHAT THIS SURFACE IS: `MarketingBenchmarkPort.run` evaluates a DECLARED
 * candidate set under a DECLARED VERSIONED {@link RobustnessPolicy} —
 * multi-seed sweeps (seed robustness), a multi-world-model set
 * (cross-world spread + per-world member disagreement), expected value +
 * uncertainty interval per candidate, OOD/novelty-regime signals against
 * the members' DECLARED coverage, and the no-op baseline ALWAYS present —
 * and appends the frozen result as a versioned, tenant-scoped, append-only
 * record with full provenance (which simulator/ensemble/world-model
 * versions, which seeds, which reward spec version produced every number).
 *
 * CALIBRATION SURFACE (the LAB-018 seam): every record carries the
 * calibration fields as DECLARED PENDING REALITY — never a number. LAB-018
 * (online calibration) later records the simulation-to-reality prediction
 * error for these predictions by APPENDING new records; this benchmark's
 * frozen records are never rewritten (historical evidence is never
 * rewritten).
 *
 * PRODUCTION-SIDE CANDIDATES (declared seam, documented): the frozen
 * module registry does not make this package depend on `@mos/production`
 * at build time, so production program-search candidates arrive through
 * the DECLARED ACTION SEAM — the benchmark candidate carries the mapped
 * LAB-004 {@link StrategyActionCandidate} knobs (production's
 * `ProgramSimulationAction` maps onto them with the documented
 * isNoopRepost → first-class `no-op` kind mapping) plus producing-surface
 * version pins. compat/benchmark-production-compat.ts pins the seam
 * compile-time against the real `@mos/production` types; the runtime half
 * runs the REAL production search output through this benchmark.
 *
 * DISCLOSURE: evaluation runs through the LAB-007 `EnsemblePort` whose
 * members execute the disclosed deterministic synthetic response
 * functions — benchmark numbers are SIMULATED estimates, never ground
 * truth (§22), and never deployment evidence (§24).
 */

declare const robustBenchmarkIdBrand: unique symbol;

/**
 * Unique identifier of one benchmark record chain. Records append per
 * (tenant, benchmark id) — `version` is assigned by the store.
 */
export type RobustBenchmarkId = string & {
  readonly [robustBenchmarkIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Benchmark candidates (the declared candidate set + the no-op baseline)
// ---------------------------------------------------------------------------

/**
 * Where a benchmark candidate came from. `no-op-baseline` is reserved for
 * the benchmark's OWN synthesized baseline — a CALLER-supplied candidate
 * declaring it fails closed (`caller-claimed-noop-baseline`), mirroring the
 * W8-B program-search discipline (the baseline is synthesized, never
 * caller-claimable).
 */
export type BenchmarkCandidateOrigin =
  | 'hand-designed'
  | 'learned-strategy'
  | 'organization-search'
  | 'production-search'
  | 'no-op-baseline';

/**
 * One producing-surface version pin: which surface (and which version of
 * it) produced the candidate — e.g. the production program-search policy
 * version, the strategy-learner trace, the organization-search policy.
 * Carried as provenance, never interpreted.
 */
export interface BenchmarkProducerPin {
  readonly surface: string;
  readonly version: number;
}

/**
 * The declared source of one benchmark candidate (provenance-carried).
 * `producerPins` may be empty for hand-designed candidates; `note` is
 * mandatory (a candidate without stated provenance is rejected).
 */
export interface BenchmarkCandidateSource {
  readonly origin: BenchmarkCandidateOrigin;
  readonly producerPins: readonly BenchmarkProducerPin[];
  readonly note: string;
}

/**
 * One candidate under benchmark: the mapped simulator action (the LAB-004
 * knobs — the declared production seam), the simulated horizon, the
 * declared source and a unique key (the deterministic ranking tie-break
 * input). The benchmark itself adds the no-op baseline; the caller never
 * supplies it.
 */
export interface BenchmarkCandidate {
  /** Unique non-blank key within the run (duplicate keys fail closed). */
  readonly key: string;
  readonly action: StrategyActionCandidate;
  /** Simulated horizon in steps (>= 1). */
  readonly horizonSteps: number;
  readonly source: BenchmarkCandidateSource;
  readonly label?: string | null;
}

/**
 * The strategy ref of the benchmark's SYNTHESIZED no-op baseline. A caller
 * candidate whose action carries this ref (or whose source claims the
 * `no-op-baseline` origin) is rejected fail-closed — the baseline is
 * always the benchmark's own.
 */
export const BENCHMARK_NOOP_STRATEGY_REF: StrategyRef =
  'strategy:benchmark-no-op-baseline' as StrategyRef;

// ---------------------------------------------------------------------------
// Robustness policy (DECLARED, versioned, deterministic)
// ---------------------------------------------------------------------------

/** The declared robustness sweep dimensions (frozen vocabulary). */
export type BenchmarkSweepDimension = 'seed' | 'world-model';

/** The frozen sweep-dimension vocabulary (policy-declared, validated). */
export const BENCHMARK_SWEEP_DIMENSIONS: readonly BenchmarkSweepDimension[] = Object.freeze([
  'seed',
  'world-model',
] as const);

/**
 * The declared aggregation rule: how the per-(world, seed, step) cell
 * rewards aggregate into the reported expected value.
 * - `pooled-mean` — the mean over ALL cells (worlds pooled);
 * - `worst-world-mean` — the WORST world-model's mean (the conservative
 *   floor under world-model disagreement — a candidate that only wins in
 *   one world cannot hide it).
 */
export type BenchmarkAggregationRule = 'pooled-mean' | 'worst-world-mean';

/**
 * One world-model set entry: one ensemble pinned at an EXACT version (the
 * multi-world-model axis). EVERY candidate is evaluated under EVERY entry
 * (the cross-candidate fairness pin).
 */
export interface BenchmarkWorldModelRef {
  readonly ensembleId: WorldModelEnsembleId;
  readonly ensembleVersion: number;
  /** Declared label, unique within the set (e.g. `primary`/`pessimistic`). */
  readonly label: string;
}

/**
 * The DECLARED VERSIONED robustness policy: seed budget, world-model set,
 * sweep dimensions, aggregation rule and the frozen deterministic
 * tie-break. Deterministic given (candidates, policy version, seeds) —
 * the same inputs always produce the bit-identical benchmark record.
 *
 * Validation fails closed: `seedBudget` >= 2 (seed robustness needs two
 * seeds); `worldModelSet` non-empty with no duplicate (ensemble, version)
 * pairs and unique non-blank labels; `sweepDimensions` must include
 * `seed` (mandatory §22 axis) and `world-model` requires >= 2 world-model
 * refs; `aggregation` and `tieBreak` must be in their vocabularies.
 */
export interface RobustnessPolicy {
  readonly id: string;
  readonly version: number;
  /** How many seeds every candidate is swept over (>= 2; run seeds must match exactly). */
  readonly seedBudget: number;
  /** The declared world-model set (>= 1 ensemble at an exact version each). */
  readonly worldModelSet: readonly BenchmarkWorldModelRef[];
  readonly sweepDimensions: readonly BenchmarkSweepDimension[];
  readonly aggregation: BenchmarkAggregationRule;
  /**
   * The declared deterministic ranking tie-break. Frozen vocabulary for
   * policy v1: expected reward DESC → interval half-width ASC → key ASC.
   */
  readonly tieBreak: 'expected-desc-halfwidth-asc-key-asc';
  /** Mandatory rationale (never blank). */
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Run input
// ---------------------------------------------------------------------------

/**
 * One robust marketing benchmark run request. `seeds` is the FAIRNESS PIN
 * input: exactly `policy.seedBudget` distinct finite seeds, applied to
 * EVERY candidate identically (no per-candidate seed cherry-picking is
 * even expressible). `rewardSpec.version` must equal
 * `scenario.rewardVersion`. Reward terms resolve in the PREDICTED metric
 * and delta domains only — this is the simulation-side benchmark;
 * observed-domain terms fail closed (LAB-008 owns the historical-basis
 * estimate).
 */
export interface MarketingBenchmarkInput {
  readonly scope: TenantScope;
  /** Benchmark record chain identity (versions append per (tenant, id)). */
  readonly benchmarkId: RobustBenchmarkId;
  readonly scenario: LabScenario;
  /** The declared candidate set (may be empty — the no-op baseline still runs). */
  readonly candidates: readonly BenchmarkCandidate[];
  readonly rewardSpec: LabRewardSpec;
  readonly policy: RobustnessPolicy;
  readonly seeds: readonly number[];
}

// ---------------------------------------------------------------------------
// Failure model
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for the robust marketing benchmark. */
export type RobustBenchmarkErrorCode =
  | 'invalid-input'
  | 'invalid-candidate'
  | 'duplicate-candidate-key'
  | 'caller-claimed-noop-baseline'
  | 'seed-budget-mismatch'
  | 'unknown-ensemble'
  | 'ensemble-version-not-found'
  | 'scenario-ensemble-mismatch'
  | 'reward-version-mismatch'
  | 'reward-term-not-derivable'
  | 'reward-term-ambiguous'
  | 'ensemble-evaluation-failed';

/** Typed failure value (result union, the MOS domain convention). */
export interface RobustBenchmarkError {
  readonly error: RobustBenchmarkErrorCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Compile-time pins (architecture lock rules 5/29/32)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

/** The action seam is EXACTLY the LAB-004 candidate shape (both directions). */
type _BenchmarkActionsAcceptASimulatorCandidate = Expect<
  Equal<IsAssignable<StrategyActionCandidate, BenchmarkCandidate['action']>, true>
>;
type _SimulatorCandidatesAcceptABenchmarkAction = Expect<
  Equal<IsAssignable<BenchmarkCandidate['action'], StrategyActionCandidate>, true>
>;
/** The no-op origin stays part of the frozen vocabulary (synthesis-reserved). */
type _NoopBaselineOriginIsReserved = Expect<
  Equal<IsAssignable<'no-op-baseline', BenchmarkCandidateOrigin>, true>
>;
/** The tie-break vocabulary stays frozen (a v1 single value, versioned). */
type _TieBreakIsFrozen = Expect<
  Equal<RobustnessPolicy['tieBreak'], 'expected-desc-halfwidth-asc-key-asc'>
>;
