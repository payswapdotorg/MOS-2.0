/**
 * The SIXTEEN §7 production search dimensions (LAB-016).
 *
 * Basis: spec/mos-architecture-v2.0.md §7 ("The Lab searches the full
 * production program, not only ideas. Candidate dimensions:
 * source/reference; no-op/repost; transform chain; transform parameters;
 * production modality; organization; pawn agents; model assignment;
 * engine portfolio; human participation; capability acquisition;
 * quality thresholds; cost; latency; expected value of delay;
 * stopping/substitution policy. THE NO-OP PATH IS ALWAYS A VALID
 * BASELINE."), architecture lock rule 5 (no-op/repost is a first-class
 * strategy/transform candidate) and rule 25 (expected value of delay is
 * part of production strategy search).
 *
 * The frozen SIXTEEN-member vocabulary below is the declared search
 * dimension set of the production program search. Every candidate program
 * declares ALL SIXTEEN dimensions explicitly (no silent defaults) and the
 * per-candidate fingerprint records one deterministic signature per
 * dimension; the dimensions whose fingerprints differ between parent and
 * child are exactly the dimensions a generation step varied (provenance).
 *
 * Dimension mapping onto the composed canonical `ProductionRequest`
 * (CORE-001): sourceArtifacts (source/reference), the no-op baseline
 * (synthesized always — §7 pin), transformGraphRef (transform chain +
 * parameters), studioFormat (production modality), organizationRef
 * (organization + pawn agents + model assignment), capabilityRequirements
 * (engine portfolio + capability acquisition), humanTasks (human
 * participation), acceptanceCriteria (quality thresholds), budget (cost),
 * deadline + delayPolicy (latency + expected value of delay). The
 * stopping/substitution policy is carried on the candidate (the canonical
 * contract has no field for it — the documented canonical-drop precedent).
 */

// ---------------------------------------------------------------------------
// The sixteen §7 dimensions (frozen vocabulary)
// ---------------------------------------------------------------------------

/**
 * The sixteen §7 production program search dimensions, in frozen spec
 * declaration order.
 */
export type ProgramSearchDimension =
  | "source-reference"
  | "no-op-repost"
  | "transform-chain"
  | "transform-parameters"
  | "production-modality"
  | "organization"
  | "pawn-agents"
  | "model-assignment"
  | "engine-portfolio"
  | "human-participation"
  | "capability-acquisition"
  | "quality-thresholds"
  | "cost"
  | "latency"
  | "expected-value-of-delay"
  | "stopping-substitution-policy";

/** The sixteen dimensions in frozen §7 declaration order. */
export const PROGRAM_SEARCH_DIMENSIONS: readonly ProgramSearchDimension[] = Object.freeze([
  "source-reference",
  "no-op-repost",
  "transform-chain",
  "transform-parameters",
  "production-modality",
  "organization",
  "pawn-agents",
  "model-assignment",
  "engine-portfolio",
  "human-participation",
  "capability-acquisition",
  "quality-thresholds",
  "cost",
  "latency",
  "expected-value-of-delay",
  "stopping-substitution-policy",
] as const);

// ---------------------------------------------------------------------------
// The sixteen-dimension feature fingerprint
// ---------------------------------------------------------------------------

/**
 * The per-dimension feature fingerprint: one deterministic string signature
 * per §7 dimension, derived from the candidate program (see
 * adapters/program-fingerprint.ts). Two candidates with equal fingerprints
 * are THE SAME POINT in the sixteen-dimension search space (dedup); the
 * dimensions whose fingerprints differ between parent and child are exactly
 * the dimensions a generation step varied (provenance).
 */
export interface ProgramFeatureFingerprint {
  readonly "source-reference": string;
  readonly "no-op-repost": string;
  readonly "transform-chain": string;
  readonly "transform-parameters": string;
  readonly "production-modality": string;
  readonly organization: string;
  readonly "pawn-agents": string;
  readonly "model-assignment": string;
  readonly "engine-portfolio": string;
  readonly "human-participation": string;
  readonly "capability-acquisition": string;
  readonly "quality-thresholds": string;
  readonly cost: string;
  readonly latency: string;
  readonly "expected-value-of-delay": string;
  readonly "stopping-substitution-policy": string;
}

// ---------------------------------------------------------------------------
// Compile-time pins (the frozen vocabulary cannot drift)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** The §7 dimension vocabulary has exactly SIXTEEN members (frozen). */
type _Section7HasExactlySixteenDimensions = Expect<
  Equal<
    ProgramSearchDimension,
    | "source-reference"
    | "no-op-repost"
    | "transform-chain"
    | "transform-parameters"
    | "production-modality"
    | "organization"
    | "pawn-agents"
    | "model-assignment"
    | "engine-portfolio"
    | "human-participation"
    | "capability-acquisition"
    | "quality-thresholds"
    | "cost"
    | "latency"
    | "expected-value-of-delay"
    | "stopping-substitution-policy"
  >
>;

/** Every dimension has a fingerprint key (no untracked dimension). */
type _EveryDimensionIsFingerprinted = Expect<
  Equal<keyof ProgramFeatureFingerprint, ProgramSearchDimension>
>;

/** The frozen order lists every dimension exactly once (compile-time). */
export const _dimensionOrderCoversAll: readonly ProgramSearchDimension[] =
  PROGRAM_SEARCH_DIMENSIONS;
