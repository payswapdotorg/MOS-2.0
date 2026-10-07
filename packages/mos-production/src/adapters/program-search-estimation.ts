/**
 * INTERNAL candidate estimation for the production program search
 * (LAB-016) — NOT exported from the package index.
 *
 * Mirrors the W5-B estimation discipline: the candidate's DOCUMENTED
 * synthetic action mapping is evaluated through the program evaluation
 * seam (LAB-007-style ensemble evaluation — the disclosed double here;
 * the REAL lab ensemble at the composition root) over the policy's
 * evaluation seeds:
 *
 * ```
 * knobs           = the documented mapping below (pure function of the
 *                   candidate's declared dimensions)
 * estimate        = mean over seeds of expectedReward(seam(action, terms))
 * ε_ens           = mean over seeds of disagreementHalfWidth
 * ε_seed          = half the per-seed-estimate spread
 * interval        = estimate ± (ε_ens + ε_seed)
 * EV of delay     = mean over seeds of the seam's EV value (§2 first-class
 *                   variable, LAB-015 carried); interval = the conservative
 *                   [min(lower) − ε_seed, max(upper) + ε_seed]
 * consumption     = seeds seam evaluations per candidate evaluation
 * ```
 *
 * THE DOCUMENTED SYNTHETIC ACTION MAPPING (disclosed — never a claim about
 * real production performance):
 * ```
 * cadencePerWeek  = isNoopRepost ? 0 : 1 + min(chainDepth, 5)
 *                   + (studio|hybrid modality ? 1 : 0)
 * novelty         = isNoopRepost ? 0 : clamp01(0.12·chainDepth
 *                          + 0.08·distinctPresets
 *                          + 0.06·pawnCount + 0.05·humanTaskCount)
 * engagement      = isNoopRepost ? 0 : clamp01(0.15·humanTaskCount + 0.05·pawnCount
 *                          + 0.04·portfolioSize)
 * ```
 * The no-op baseline maps to the ZERO-KNOB repost action — cadence 0,
 * novelty 0, engagement 0 (the LAB-004 first-class `no-op` action kind:
 * a no-op produces no activity — the simulator REJECTS a no-op action with
 * cadence ≠ 0, so the mapping keeps the frozen action contract).
 */

import type { UncertaintySummary } from "@mos/contracts";

import type { ProgramEvaluationPort } from "../ports/program-evaluation.port.js";
import type { ProgramSimulationAction } from "../ports/program-evaluation.port.js";
import type { ProgramCandidateEvaluation } from "../contracts/program-search.js";
import type { ProductionProgramSearchError } from "../contracts/program-search.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import type { ProgramSearchContext } from "./program-search-validation.js";

const q = (value: number): number => Math.round(value * 1e10) / 1e10;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const meanOf = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

/** Deterministic evaluation seeds (the W5-B/LAB-009 derivation). */
export const evaluationSeedsOf = (seed: number, seedCount: number): number[] => {
  const seeds: number[] = [];
  for (let index = 0; index < seedCount; index += 1) {
    const mixed = Math.imul(seed ^ (0x9e3779b9 + 101 * (index + 1)), 0x85ebca6b) >>> 0;
    seeds.push((mixed % 2147483647) + 1);
  }
  return seeds;
};

/** The documented synthetic action mapping of one candidate program. */
export function programSimulationActionOf(
  context: ProgramSearchContext,
  candidate: CandidateProgram,
): ProgramSimulationAction {
  if (candidate.isNoopBaseline) {
    // The ZERO-KNOB repost action (LAB-004's first-class `no-op` kind:
    // a no-op produces no activity — the simulator rejects cadence ≠ 0).
    return Object.freeze({
      strategyRef: context.input.strategyRef,
      isNoopRepost: true,
      cadencePerWeek: 0,
      novelty: 0,
      engagementEffort: 0,
    });
  }
  const chainDepth = candidate.transformChain.length;
  const distinctPresets = new Set(
    candidate.transformChain.map((step) => step.parameterPreset),
  ).size;
  const pawnCount = candidate.pawnAgents.length;
  const humanTaskCount = candidate.humanTasks.length;
  const portfolioSize = candidate.enginePortfolio.length;
  return Object.freeze({
    strategyRef: context.input.strategyRef,
    isNoopRepost: false,
    cadencePerWeek:
      1 +
      Math.min(chainDepth, 5) +
      (candidate.modality === "studio" || candidate.modality === "hybrid" ? 1 : 0),
    novelty: q(
      clamp01(
        0.12 * chainDepth +
          0.08 * distinctPresets +
          0.06 * pawnCount +
          0.05 * humanTaskCount,
      ),
    ),
    engagementEffort: q(
      clamp01(0.15 * humanTaskCount + 0.05 * pawnCount + 0.04 * portfolioSize),
    ),
  });
}

const uncertaintyLevelFor = (relativeHalfWidth: number): UncertaintySummary["level"] => {
  if (relativeHalfWidth <= 0.1) return "low";
  if (relativeHalfWidth <= 0.3) return "moderate";
  return "high";
};

const fail = (
  error: ProductionProgramSearchError["error"],
  message: string,
): ProductionProgramSearchError => ({ error, message });

/** The evaluation seam one search estimates through. */
export interface ProgramEstimationSeam {
  readonly evaluation: ProgramEvaluationPort;
}

/** One candidate estimate: the §22 evaluation + the seam's surface pins. */
export interface ProgramCandidateEstimate {
  readonly evaluation: ProgramCandidateEvaluation;
  readonly pins: ProgramSurfacePins;
}

/**
 * Estimate one candidate: expected reward + §22 uncertainty set + the §2
 * EV of delay + the seam's surface version pins (same seam → same pins
 * for every candidate of one search; recorded per-candidate in
 * provenance). Fails closed on seam rejections (`evaluation-failed`).
 */
export async function estimateProgramCandidate(
  seam: ProgramEstimationSeam,
  context: ProgramSearchContext,
  candidate: CandidateProgram,
  evaluationSeeds: readonly number[],
): Promise<ProgramCandidateEstimate | ProductionProgramSearchError> {
  const action = programSimulationActionOf(context, candidate);
  const delayTerms = candidate.delayExpectation;
  const perSeedExpected: number[] = [];
  const perSeedDisagreement: number[] = [];
  const perSeedEv: number[] = [];
  let evLower = Number.POSITIVE_INFINITY;
  let evUpper = Number.NEGATIVE_INFINITY;
  const surface: { pins: ProgramSurfacePins | null } = { pins: null };
  for (const evaluationSeed of evaluationSeeds) {
    let result;
    try {
      result = await seam.evaluation.evaluateProgram({
        scope: context.input.scope,
        action,
        delayTerms,
        seed: evaluationSeed,
      });
    } catch (error) {
      return fail(
        "evaluation-failed",
        `the program evaluation seam rejected the candidate (seed ${evaluationSeed}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    perSeedExpected.push(result.expectedReward);
    perSeedDisagreement.push(result.disagreementHalfWidth);
    perSeedEv.push(result.expectedValueOfDelay.value);
    evLower = Math.min(evLower, result.expectedValueOfDelay.interval.lower);
    evUpper = Math.max(evUpper, result.expectedValueOfDelay.interval.upper);
    surface.pins = {
      ensembleId: result.ensembleId,
      ensembleVersion: result.ensembleVersion,
      simulatorVersion: result.simulatorVersion,
      rewardSpecVersion: result.rewardSpecVersion,
    };
  }
  const estimate = q(meanOf(perSeedExpected));
  const epsilonEnsemble = q(meanOf(perSeedDisagreement));
  const spread = perSeedExpected.length === 0 ? 0 : Math.max(...perSeedExpected) - Math.min(...perSeedExpected);
  const epsilonSeed = q(spread / 2);
  const halfWidth = q(epsilonEnsemble + epsilonSeed);
  const evValue = q(meanOf(perSeedEv));
  const evaluation: ProgramCandidateEvaluation = Object.freeze({
    expectedReward: estimate,
    interval: Object.freeze({
      lower: q(estimate - halfWidth),
      upper: q(estimate + halfWidth),
    }),
    uncertainty: Object.freeze({
      level: uncertaintyLevelFor(
        estimate === 0 ? (halfWidth === 0 ? 0 : 1) : halfWidth / Math.abs(estimate),
      ),
    }),
    disagreementHalfWidth: epsilonEnsemble,
    seedRobustness: Object.freeze({
      seeds: [...evaluationSeeds],
      perSeedExpected: perSeedExpected.map((v) => q(v)),
      spread: q(spread),
      halfSpread: epsilonSeed,
    }),
    expectedValueOfDelay: Object.freeze({
      value: evValue,
      interval: Object.freeze({
        lower: q(evLower - epsilonSeed),
        upper: q(evUpper + epsilonSeed),
      }),
    }),
    seamEvaluationsConsumed: evaluationSeeds.length,
    counterfactual: true,
    disclosure: "ensemble-evaluated-simulation-estimate",
  });
  if (surface.pins === null) {
    return fail("evaluation-failed", "the program evaluation seam produced no evaluations");
  }
  return { evaluation, pins: surface.pins };
}

/** The surface version pins of the evaluation seam (provenance). */
export interface ProgramSurfacePins {
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
}
