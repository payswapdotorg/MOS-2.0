/**
 * Transform pawn vocabulary (LAB-013, architecture §9).
 *
 * Basis: spec/mos-architecture-v2.0.md §9 (Transform Pawns are specialized
 * Agent Instances; the example list of ten pawns; a pawn may invoke
 * deterministic engines and does not need to be an LLM; no pawn may
 * introduce a second agent runtime or model router) and §5 (the thirteen
 * frozen transform kinds).
 *
 * The transform-kind union below is the PRODUCTION-side projection of the
 * frozen §5 thirteen (the authority is the architecture spec, projected by
 * both `@mos/lab` (LAB-011 `TransformKind`) and this package).
 * `compat/transform-source-compat.ts` pins the two projections mutually
 * assignable so neither side can drift.
 */

import type {
  CapabilityId,
  EngineId,
  Version,
} from "@mos/contracts";

// ---------------------------------------------------------------------------
// The ten §9 pawn kinds
// ---------------------------------------------------------------------------

/**
 * The ten transform pawn roles of architecture §9 (the frozen example list,
 * verbatim): Clip Selection, Hook Extraction, Reaction Composition, Podcast
 * Interviewer, Question Designer, Scene/Layout, Editor, Caption, Dubbing,
 * Quality Critic.
 */
export type TransformPawnKind =
  | "clip-selection"
  | "hook-extraction"
  | "reaction-composition"
  | "podcast-interviewer"
  | "question-designer"
  | "scene-layout"
  | "editor"
  | "caption"
  | "dubbing"
  | "quality-critic";

/** The ten §9 pawn kinds in declaration order (frozen). */
export const TRANSFORM_PAWN_KINDS: readonly TransformPawnKind[] = Object.freeze([
  "clip-selection",
  "hook-extraction",
  "reaction-composition",
  "podcast-interviewer",
  "question-designer",
  "scene-layout",
  "editor",
  "caption",
  "dubbing",
  "quality-critic",
] as const);

// ---------------------------------------------------------------------------
// The thirteen §5 transform kinds (production projection)
// ---------------------------------------------------------------------------

/**
 * The thirteen frozen transform kinds (architecture §5: no-op/repost, clip,
 * crop/reframe, remix, compilation, reaction, podcast, translation/dubbing,
 * voiceover, stylization/anime, AI-generated content, human contribution,
 * hybrid composition). Mirrors `@mos/lab`'s `TransformKind` — pinned
 * mutually assignable by `compat/transform-source-compat.ts`.
 */
export type PawnTransformKind =
  | "no-op-repost"
  | "clip"
  | "crop-reframe"
  | "remix"
  | "compilation"
  | "reaction"
  | "podcast"
  | "translation-dubbing"
  | "voiceover"
  | "stylization-anime"
  | "ai-generated"
  | "human-contribution"
  | "hybrid";

/** The thirteen frozen transform kinds in §5 declaration order. */
export const PAWN_TRANSFORM_KINDS: readonly PawnTransformKind[] = Object.freeze([
  "no-op-repost",
  "clip",
  "crop-reframe",
  "remix",
  "compilation",
  "reaction",
  "podcast",
  "translation-dubbing",
  "voiceover",
  "stylization-anime",
  "ai-generated",
  "human-contribution",
  "hybrid",
] as const);

// ---------------------------------------------------------------------------
// Model flavor
// ---------------------------------------------------------------------------

/**
 * Whether a pawn's execution path involves a model binding at all.
 *
 * - `"deterministic"`: the pawn applies transforms by invoking deterministic
 *   engines through the EngineRunnerPort seam. It NEVER binds a model —
 *   `bindPawnModel` refuses with a typed failure (§9: "a pawn may invoke
 *   deterministic engines and does not need to be an LLM", pinned).
 * - `"llm-flavored"`: the pawn executes as a bound agent instance through
 *   the instance-executor seam — the model is assigned ONLY through THE
 *   single model-runtime boundary (lock rule 9). An llm-flavored pawn may
 *   ALSO invoke deterministic engines (e.g. transcribe first, then
 *   generate) — engine invocations still go through the runner seam.
 */
export type PawnModelFlavor = "deterministic" | "llm-flavored";

// ---------------------------------------------------------------------------
// Deterministic engine tool bindings
// ---------------------------------------------------------------------------

/**
 * One deterministic engine tool binding: the exact capability + engine
 * citation an {@link ../ports/engine-runner.port.js!PawnEngineRunnerPort}
 * submission needs (capability id pinned to its contract version, engine id
 * pinned to its exact version). Pawns declare these as their tool refs —
 * tool refs are DATA, and every engine invocation is submitted THROUGH THE
 * RUNNER (never a direct adapter call; pinned structurally).
 */
export interface PawnEngineToolBinding {
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
}

// ---------------------------------------------------------------------------
// The transform-domain role contract
// ---------------------------------------------------------------------------

/**
 * The transform-domain role contract of one pawn: which transform kinds it
 * serves, which capabilities it can satisfy, which deterministic engines it
 * is bound to (through the runner), and whether its execution path is
 * model-flavored.
 *
 * The canonical {@link AgentBody} `roleContract` ({@summary, duties}) of the
 * pawn's agent body carries the human-readable projection of this role; the
 * machine-checkable dimensions live HERE, on the production-side record, and
 * are enforced at execution time (a task citing a transform kind the pawn
 * does not serve fails closed with a typed error naming both).
 */
export interface TransformPawnRoleContract {
  /** Which of the ten §9 pawn roles this is (unique per registered body). */
  readonly pawnKind: TransformPawnKind;
  /** Transform kinds this pawn serves (non-empty subset of the thirteen). */
  readonly servedTransformKinds: readonly PawnTransformKind[];
  /** Capability requirements this pawn can satisfy (non-empty). */
  readonly servedCapabilities: readonly CapabilityId[];
  /** Deterministic engine tool bindings (may be empty for pure-agent pawns). */
  readonly engineTools: readonly PawnEngineToolBinding[];
  /** Whether the pawn's execution path involves a model binding. */
  readonly modelFlavor: PawnModelFlavor;
}
