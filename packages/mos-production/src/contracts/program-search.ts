/**
 * Production program search policy, budget, input and evaluation contracts
 * (LAB-016, §7). Split from program-search-result.ts to respect the
 * contract file line budget (the W3-A/W5-A split precedent).
 *
 * Basis: spec/mos-architecture-v2.0.md §7 (the sixteen candidate
 * dimensions; the no-op path is ALWAYS a valid baseline), §2 (the complete
 * loop — delay-expectation in program search), §22 (uncertainty before
 * deployment-ready selection: expected value, uncertainty interval, model
 * disagreement — ensemble-evaluated, never ground truth), §24 (the
 * real-world boundary — the search output is a ranked lab-labeled
 * candidate set, NEVER a deployment decision), lock rule 25 (expected
 * value of delay is part of production strategy search).
 *
 * Determinism: the search is deterministic given (inputs, seed, policy
 * version) — the declared versioned policy carries every vocabulary the
 * mutation operators cycle through, so the same inputs + seed + policy
 * version always produce a bit-identical result (test-pinned).
 */

import type {
  ArtifactRef,
  HumanProductionTaskId,
  JsonSchemaObject,
  MissionRef,
  ModelRef,
  RightsContext,
  StudioFormatId,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
} from "@mos/contracts";

import type {
  CandidateProgram,
  ProgramCandidateOrigin,
  ProgramDelayTerms,
  ProgramProductionModality,
} from "./program-candidate.js";
import type { PawnEngineToolBinding } from "./pawn-role.js";

// ---------------------------------------------------------------------------
// Search policy (declared, versioned — the W5-B pattern)
// ---------------------------------------------------------------------------

/**
 * The declared pruning rule. `none`: no dominance claims. `interval-dominance`:
 * an evaluated candidate whose interval UPPER bound is strictly below the
 * incumbent's interval LOWER bound is certainly worse than the incumbent's
 * worst case under current evidence — it stays RANKED (comparison
 * transparency) but is marked `pruned` in its provenance and is never
 * eligible as a generation parent.
 */
export type ProgramPruningRule = "none" | "interval-dominance";

/**
 * The declared search policy — vocabularies, pruning and stopping, all
 * versioned together. The search is deterministic given (inputs, seed,
 * policy.version).
 */
export interface ProductionProgramSearchPolicy {
  /** Declared policy version (v1 = 1). Mismatches the runtime's fail closed. */
  readonly version: number;
  /** Transform-chain length cap (>= 1). */
  readonly maxChainSteps: number;
  /** Parameter preset vocabulary (dimension 4; non-empty, unique). */
  readonly parameterPresetVocabulary: readonly string[];
  /** Production modality vocabulary (dimension 5; non-empty, unique). */
  readonly modalityVocabulary: readonly ProgramProductionModality[];
  /**
   * Model vocabulary (dimension 8; non-empty) — the single-boundary
   * vocabulary, declared DATA ONLY: the search never resolves a model
   * (lock rule 9 — no second router, structurally pinned).
   */
  readonly modelVocabulary: readonly ModelRef[];
  /** Engine portfolio vocabulary (dimension 9; non-empty, exact versions). */
  readonly engineVocabulary: readonly PawnEngineToolBinding[];
  /** Quality floor ladder (dimension 12; non-empty, ascending, in [0, 1]). */
  readonly qualityFloorLadder: readonly number[];
  /** Budget mutation scale factor (dimension 13; > 1). */
  readonly budgetScaleFactor: number;
  /** Expected-duration ladder in ms (dimension 14; non-empty, ascending). */
  readonly expectedDurationLadderMs: readonly number[];
  /** Delay maxWaitMs ladder in ms (dimension 15; non-empty, ascending). */
  readonly waitHorizonLadderMs: readonly number[];
  /** Stopping-policy retry cap (dimension 16; >= 1). */
  readonly maxRetriesCap: number;
  /** Evaluation seeds per candidate (>= 2 — seed robustness requires two). */
  readonly seedCount: number;
  /** Consecutive non-improving generations tolerated (>= 1). */
  readonly plateauWindow: number;
  /** Minimum reward improvement that counts as progress (>= 0). */
  readonly improvementTolerance: number;
  readonly pruning: ProgramPruningRule;
}

// ---------------------------------------------------------------------------
// Search budget (evaluations / iterations)
// ---------------------------------------------------------------------------

/**
 * The declared search budget: candidate evaluations + generation
 * iterations (the prompt's "budget = evaluations/iterations").
 */
export interface ProductionProgramSearchBudget {
  /** Total candidate evaluations the whole search may consume (>= floor). */
  readonly maxCandidateEvaluations: number;
  /** Hard cap on generation iterations (>= 1). */
  readonly maxIterations: number;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * One caller-declared hand-designed program seed — compared alongside the
 * no-op baseline and the generated candidates (every dimension explicit,
 * validated fail-closed; `isNoopBaseline: true` is a typed rejection —
 * only the search synthesizes the baseline).
 */
export interface DeclaredCandidateProgram {
  readonly candidate: CandidateProgram;
}

/** One production program search request. `seed` is REQUIRED. */
export interface ProductionProgramSearchInput {
  readonly scope: TenantScope;
  /** The mission this search serves (ref only — the mission authority owns it). */
  readonly missionRef: MissionRef;
  /** The strategy the composed requests cite (ref only). */
  readonly strategyRef: StrategyRef;
  /** Objective statement carried onto every composed request (non-blank). */
  readonly objective: string;
  /** Dimension 1 (GIVEN): the source artifact references (non-empty). */
  readonly sourceArtifactRefs: readonly ArtifactRef[];
  /** The rights frame under which every composed request runs. */
  readonly rightsContext: RightsContext;
  /** Output contract the returned artifact must satisfy (repost contract too). */
  readonly returnContract: JsonSchemaObject;
  /** Studio-format vocabulary the modality dimension varies over (non-empty). */
  readonly studioFormatVocabulary: readonly StudioFormatId[];
  /** LAB-014 human production task refs (BY REFERENCE ONLY; may be empty). */
  readonly humanTaskVocabulary: readonly HumanProductionTaskId[];
  /** The declared delay expectations the generated programs inherit (provenance-cited). */
  readonly delayExpectation: CandidateProgram["delayExpectation"];
  /** Deadline anchor for the latency ladder (ISO-8601; deadlines = anchor + duration). */
  readonly deadlineAnchor: Timestamp;
  /** Base program budget (dimension 13 seed; scaled by mutations). */
  readonly baseBudget: CandidateProgram["budget"];
  /** Quality evaluator the composed acceptance criteria cite. */
  readonly qualityEvaluatorRef: CandidateProgram["qualityThresholds"]["evaluatorRef"];
  /** Base substitution preference (dimension 16 seed; rotated by mutations). */
  readonly substitutionPreference: CandidateProgram["stoppingPolicy"]["substitutionPreference"];
  /** The caller's hand-designed program seeds (compared alongside baseline + generated). */
  readonly handDesigned?: readonly DeclaredCandidateProgram[];
  readonly policy: ProductionProgramSearchPolicy;
  readonly budget: ProductionProgramSearchBudget;
  readonly seed: number;
}

// ---------------------------------------------------------------------------
// Per-candidate evaluation (§22 uncertainty set + the §2 delay variable)
// ---------------------------------------------------------------------------

/** A closed prediction interval [lower, upper] (§22 discipline). */
export interface ProgramInterval {
  readonly lower: number;
  readonly upper: number;
}

/** §22 seed robustness: how a candidate's estimate moves across seeds. */
export interface ProgramSeedRobustness {
  readonly seeds: readonly number[];
  /** Mean reward per evaluation seed (aligned with `seeds`). */
  readonly perSeedExpected: readonly number[];
  /** max − min over per-seed estimates. */
  readonly spread: number;
  readonly halfSpread: number;
}

/**
 * The first-class §2 delay-expectation variable of one candidate: the
 * EV-of-delay VALUE with its §22 interval — the LAB-015 analysis carried
 * through the evaluation seam (computed under the seam's declared
 * versioned formula, never by the search itself).
 */
export interface ProgramExpectedValueOfDelay {
  readonly value: number;
  readonly interval: ProgramInterval;
}

/**
 * The §22-labeled evaluation of one candidate program (all
 * counterfactual): expected reward, interval, ensemble disagreement, seed
 * robustness and the §2 EV of delay, produced through the
 * simulator/ensemble evaluation seam (LAB-007-style).
 */
export interface ProgramCandidateEvaluation {
  readonly expectedReward: number;
  readonly interval: ProgramInterval;
  readonly uncertainty: UncertaintySummary;
  /** Half the member-reward spread (model disagreement — never hidden). */
  readonly disagreementHalfWidth: number;
  readonly seedRobustness: ProgramSeedRobustness;
  /** THE §2 FIRST-CLASS VARIABLE (LAB-015 carried). */
  readonly expectedValueOfDelay: ProgramExpectedValueOfDelay;
  /** Evaluations the seam actually consumed for this candidate. */
  readonly seamEvaluationsConsumed: number;
  /** LOCK RULE 29 PIN: ensemble-evaluated simulation estimate, never evidence. */
  readonly counterfactual: true;
  readonly disclosure: "ensemble-evaluated-simulation-estimate";
}

// ---------------------------------------------------------------------------
// Failure model (typed result union — the MOS domain convention)
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for the production program search. */
export type ProductionProgramSearchErrorCode =
  | "invalid-input"
  | "invalid-policy"
  | "invalid-candidate"
  | "model-assignment-for-deterministic-pawn"
  | "caller-claimed-no-op-baseline"
  | "organization-unresolved"
  | "transform-unresolved"
  | "no-op-transform-in-chain"
  | "human-task-outside-vocabulary"
  | "uncovered-capability-requirement"
  | "engine-binding-missing"
  | "budget-below-mandated-floor"
  | "evaluation-failed";

/** Typed failure value (result union, the MOS domain convention). */
export interface ProductionProgramSearchError {
  readonly error: ProductionProgramSearchErrorCode;
  readonly message: string;
}

// Re-exports used by the port/result contracts (one import site per type).
export type {
  CandidateProgram,
  ProgramCandidateOrigin,
  ProgramDelayTerms,
};
export type { TenantId };
