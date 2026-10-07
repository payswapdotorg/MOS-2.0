/**
 * Program evaluation seam (LAB-016) — the simulator/ensemble evaluation
 * surface (LAB-007-style §22 uncertainty) the program search evaluates
 * candidates through.
 *
 * Architecture §22 (before deployment-ready selection: use ensemble
 * models; report expected value, uncertainty interval, model
 * disagreement) + §2 (delay-expectation in program search) + §18 (the EV
 * of delay is a first-class production strategy variable — the LAB-015
 * analysis carried here as the §2 delay-expectation variable).
 *
 * The frozen module registry does NOT make `lab` a production dependency,
 * so the evaluation arrives through this narrow seam. The composition root
 * maps the candidate program onto the simulator action knobs and calls the
 * REAL LAB-007 `EnsemblePort.evaluateEnsemble` behind it (the documented
 * synthetic mapping lives at the composition seam —
 * compat/program-search-compat.ts pins that the real ensemble prediction
 * satisfies this seam's §22 output shape, and that the LAB-015
 * `DelayDecisionModel` maps onto the seam's delay terms).
 *
 * The EV OF DELAY is computed BY THE SEAM under its own declared versioned
 * formula (the documented ev-delay-1 shape: EV = p·V − D − A with D the
 * total delay cost over the estimated wait and A the acquisition cost;
 * quality impact CARRIED, never monetized) — the search itself never
 * computes a delay EV (no formula duplication, no drift hazard).
 *
 * The in-memory double (adapters/in-memory-program-evaluation.ts) is a
 * DISCLOSED double: a deterministic, self-labeling synthetic response
 * function — never a claim about real production performance.
 */

import type { StrategyRef, TenantScope, UncertaintySummary } from "@mos/contracts";

import type { ProgramDelayTerms } from "../contracts/program-candidate.js";

// ---------------------------------------------------------------------------
// Input: the mapped simulator action + the carried delay terms
// ---------------------------------------------------------------------------

/**
 * The documented synthetic action mapping of one candidate program onto
 * the simulator knobs (the LAB-004 `StrategyActionCandidate` shape — the
 * W5-B mapping precedent). The mapping itself lives at the composition
 * seam (adapters/program-search-estimation.ts derives the knobs from the
 * candidate's declared dimensions with the documented formulas).
 */
export interface ProgramSimulationAction {
  readonly strategyRef: StrategyRef;
  /** Whether the mapped action is the no-op repost (zero knobs). */
  readonly isNoopRepost: boolean;
  /** Publishing cadence per week (>= 0, finite). */
  readonly cadencePerWeek: number;
  /** Content novelty in [0, 1]. */
  readonly novelty: number;
  /** Engagement effort (replying/community work) in [0, 1]. */
  readonly engagementEffort: number;
}

/** One deterministic program evaluation request. `seed` is REQUIRED. */
export interface ProgramEvaluationRequest {
  readonly scope: TenantScope;
  readonly action: ProgramSimulationAction;
  /** The candidate's declared §18 delay terms (the EV-of-delay inputs — LAB-015 carried). */
  readonly delayTerms: ProgramDelayTerms;
  readonly seed: number;
}

// ---------------------------------------------------------------------------
// Output: the §22 set + the §2 delay variable + surface version pins
// ---------------------------------------------------------------------------

/** A closed prediction interval [lower, upper]. */
export interface ProgramEvaluationInterval {
  readonly lower: number;
  readonly upper: number;
}

/**
 * The §22-labeled evaluation of one candidate program under one seed (all
 * counterfactual): the expected reward with its interval, the ensemble
 * disagreement (never hidden), and the §2 EV OF DELAY with its interval —
 * plus the VERSION PINS of the surfaces that produced the numbers.
 */
export interface ProgramEvaluationResult {
  readonly expectedReward: number;
  readonly interval: ProgramEvaluationInterval;
  readonly disagreementHalfWidth: number;
  readonly uncertainty: UncertaintySummary;
  /** THE §2 DELAY-EXPECTATION VARIABLE (LAB-015 carried, first-class). */
  readonly expectedValueOfDelay: {
    readonly value: number;
    readonly interval: ProgramEvaluationInterval;
  };
  /** Version pins of the producing surfaces (ensemble/simulator/reward). */
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  /** LOCK RULE 29 PIN: counterfactual ensemble-evaluated estimate. */
  readonly counterfactual: true;
  readonly disclosure: "disclosed-synthetic-ensemble-evaluation";
}

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

/**
 * The program evaluation seam (LAB-007-style): evaluates one candidate
 * program's mapped action under one seed. One public method (≤ 12 policy
 * budget). Implementations MUST be deterministic given (request, their
 * own declared surface versions).
 */
export interface ProgramEvaluationPort {
  /**
   * Evaluate one candidate program. Failures surface as REJECTIONS
   * (thrown typed errors — `evaluation-failed` at the search boundary);
   * the seam itself never invents numbers.
   */
  evaluateProgram(request: ProgramEvaluationRequest): Promise<ProgramEvaluationResult>;
}
