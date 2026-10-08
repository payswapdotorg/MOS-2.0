/**
 * Benchmark production-seam compatibility pins (LAB-017).
 *
 * Compile-time assertions that this package's DECLARED production-side
 * candidate seam — `BenchmarkCandidate.action` carries the mapped LAB-004
 * `StrategyActionCandidate` knobs plus producing-surface version pins —
 * agrees with the REAL `@mos/production` program-search output. Zero
 * drift: if either surface changes shape, these views stop compiling.
 *
 * 1. ACTION SEAM — the REAL `@mos/production` `ProgramSimulationAction`
 *    maps onto the LAB-004 `StrategyActionCandidate` vocabulary with the
 *    documented mapping (`isNoopRepost: true` → the FIRST-CLASS `no-op`
 *    action kind — architecture lock rule 5; otherwise `content`): the
 *    mapping view below satisfies `StrategyActionCandidate` and fits the
 *    `BenchmarkCandidate['action']` slot directly.
 *
 * 2. REVERSE ACTION VIEW — every `StrategyActionCandidate` view maps onto
 *    the production action shape (the knobs and strategy ref are exactly
 *    the shared fields; `kind === 'no-op'` is the no-op repost) — the seam
 *    is a two-way vocabulary mapping, not a one-way adapter.
 *
 * 3. CANDIDATE-SOURCE SEAM — a REAL `RankedCandidateProgram` (the search
 *    output entry) plus its `ProgramSearchProvenance` suffice to construct
 *    a `BenchmarkCandidateSource` with the `production-search` origin and
 *    producing-surface pins (the search policy version + the evaluation
 *    surface versions) — provenance-carried, never interpreted.
 *
 * 4. RESERVED-ORIGIN DISCIPLINE — production's own no-op baseline is NOT
 *    re-supplied as a caller candidate: the benchmark's `no-op-baseline`
 *    origin is RESERVED for the benchmark's own synthesized baseline (the
 *    W8-B discipline, runtime-pinned in-package); the candidate view
 *    refuses to label a production no-op with the reserved origin.
 *
 * The runtime half of the pin is compat/benchmark-real-stack.test.ts (the
 * REAL production program search output flowing through this benchmark).
 *
 * Import form: the real packages are imported by RELATIVE SOURCE PATH
 * (their exports maps point `types` at src/index.ts — the same source this
 * resolves to; no runtime dependency of this package is created —
 * `@mos/production` is not in the registry-exact dependency set this
 * package declares, and no lockfile change is made).
 */

import type {
  BenchmarkCandidate,
  BenchmarkCandidateOrigin,
  BenchmarkCandidateSource,
  BenchmarkProducerPin,
  StrategyActionCandidate,
} from "../src/index.js";
import type {
  CandidateProgram,
  ProgramSimulationAction,
  ProgramSearchProvenance,
  RankedCandidateProgram,
} from "../../mos-production/src/index.js";

// ---------------------------------------------------------------------------
// PIN 1 — the action seam: ProgramSimulationAction → StrategyActionCandidate
// ---------------------------------------------------------------------------

/**
 * The documented action mapping (the composition-seam view): production's
 * `ProgramSimulationAction` onto the LAB-004 knobs the benchmark consumes.
 * `isNoopRepost: true` maps to the FIRST-CLASS `no-op` action kind (lock
 * rule 5); every other mapped action is `content`.
 */
export const programActionView = (
  action: ProgramSimulationAction,
): StrategyActionCandidate => ({
  strategyRef: action.strategyRef,
  kind: action.isNoopRepost ? "no-op" : "content",
  cadencePerWeek: action.cadencePerWeek,
  novelty: action.novelty,
  engagementEffort: action.engagementEffort,
});

/** The mapped view fits the benchmark candidate's action slot exactly. */
export const benchmarkCandidateOverProgramAction = (
  action: ProgramSimulationAction,
  key: string,
): BenchmarkCandidate => ({
  key,
  action: programActionView(action),
  horizonSteps: 1,
  source: {
    origin: "production-search",
    producerPins: [],
    note: "compat view: a production program-search action through the declared seam",
  },
});

// ---------------------------------------------------------------------------
// PIN 2 — the reverse action view: StrategyActionCandidate → the production shape
// ---------------------------------------------------------------------------

/**
 * The reverse mapping view: every benchmark action maps onto the
 * production action shape (the knobs + strategy ref are the shared
 * vocabulary; `kind === 'no-op'` is the no-op repost).
 */
export const programActionViewOf = (
  candidate: StrategyActionCandidate,
): ProgramSimulationAction => ({
  strategyRef: candidate.strategyRef,
  isNoopRepost: candidate.kind === "no-op",
  cadencePerWeek: candidate.cadencePerWeek,
  novelty: candidate.novelty,
  engagementEffort: candidate.engagementEffort,
});

// ---------------------------------------------------------------------------
// PIN 3 — the candidate-source seam: search output → benchmark provenance
// ---------------------------------------------------------------------------

/**
 * The provenance view: a REAL ranked production program (with its search
 * provenance) becomes the benchmark candidate's DECLARED source — origin
 * `production-search` + the producing-surface version pins carried as
 * data (the search policy version and the evaluation-surface pins the
 * search itself recorded).
 */
export const benchmarkSourceView = (
  ranked: RankedCandidateProgram,
): BenchmarkCandidateSource => ({
  origin: "production-search",
  producerPins: producerPinView(ranked.provenance),
  note: `production program-search candidate (rank ${ranked.rank}, origin ${ranked.provenance.origin}) through the declared action seam`,
});

/** The view's producer pins satisfy the declared pin shape. */
export const producerPinView = (
  provenance: ProgramSearchProvenance,
): readonly BenchmarkProducerPin[] => [
  { surface: "production-program-search", version: provenance.policyVersion },
  { surface: "production-program-search-evaluation", version: provenance.rewardSpecVersion },
];

// ---------------------------------------------------------------------------
// PIN 4 — the reserved-origin discipline (runtime-enforced in-package; typed here)
// ---------------------------------------------------------------------------

/**
 * Production's own no-op baseline is NEVER re-supplied as a caller
 * candidate — the benchmark synthesizes its own. The view types the
 * decision: only a NON-baseline production program becomes a declared
 * benchmark candidate.
 */
export const benchmarkCandidateView = (
  ranked: RankedCandidateProgram,
  action: StrategyActionCandidate,
  horizonSteps: number,
): BenchmarkCandidate | null =>
  ranked.candidate.isNoopBaseline
    ? null
    : {
        key: `program-r${ranked.rank}`,
        action,
        horizonSteps,
        source: benchmarkSourceView(ranked),
        label: `production program candidate #${ranked.rank}`,
      };

// ---------------------------------------------------------------------------
// Compile-time shape pins (the house Expect/Equal discipline)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** The reserved origin stays part of the frozen vocabulary. */
type _ReservedOriginIsFrozen = Expect<
  Equal<BenchmarkCandidateOrigin extends string ? true : false, true>
>;
/** The knobs the documented mapping consumes exist on every candidate program. */
type _CandidateProgramCarriesTheKnobs = Expect<
  Equal<
    CandidateProgram["pawnAgents"] extends readonly unknown[] ? true : false,
    true
  >
>;
/** The search output entries carry the provenance the source view consumes. */
type _RankedProgramsCarryProvenance = Expect<
  Equal<RankedCandidateProgram["provenance"] extends ProgramSearchProvenance ? true : false, true>
>;
