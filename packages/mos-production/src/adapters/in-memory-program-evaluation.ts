/**
 * The DISCLOSED in-memory program evaluation double (LAB-016) — the seam
 * implementation behind `ProgramEvaluationPort` (the LAB-007-style
 * simulator/ensemble evaluation surface).
 *
 * NOT a claim about real production performance: this is a deterministic,
 * SELF-LABELING synthetic response function (the W5-B/LAB-004 disclosure
 * class). The composition root replaces it with the REAL LAB-007
 * `EnsemblePort.evaluateEnsemble` (the documented program→action mapping
 * + the LAB-015 delay EV) behind the SAME port type —
 * compat/program-search-compat.ts pins that wiring type-checks, and
 * compat/program-real-stack.test.ts exercises it at runtime.
 *
 * THE DOCUMENTED SYNTHETIC RESPONSE FUNCTION (deterministic given
 * (action, delayTerms, seed, surface versions)):
 *
 * ```
 * members        = 3 synthetic ensemble members
 * jitter_i       = ((mix(seed, 31·(i+1)) % 2001) − 1000)/1000 · memberSpread
 * memberReward_i = (A·novelty + B·engagement + C·cadence) · (1 + jitter_i)
 *                  with A = 4, B = 3, C = 0.5, memberSpread = 0.12
 * expectedReward = mean(memberReward_i)          (the no-op repost: 0 —
 *                  the zero-knob action produces no activity)
 * disagreement   = half the member-reward spread
 * interval       = expectedReward ± disagreement
 * EV of delay    = p·V − D − A_d   (the documented ev-delay-1 shape:
 *                  expected incremental value × success probability −
 *                  total delay cost − acquisition cost; the signed
 *                  quality impact is CARRIED on the candidate, never
 *                  monetized) with interval ± disagreement
 * version pins   = the double's declared surface versions (constants)
 * ```
 */

import type { UncertaintySummary } from "@mos/contracts";

import type {
  ProgramEvaluationPort,
  ProgramEvaluationRequest,
  ProgramEvaluationResult,
} from "../ports/program-evaluation.port.js";

const q = (value: number): number => Math.round(value * 1e10) / 1e10;

const mix = (seed: number, salt: number): number =>
  (Math.imul(seed ^ (0x9e3779b9 + salt), 0x85ebca6b) >>> 0) % 2001;

const MEAN_OF = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Options for {@link createInMemoryProgramEvaluation}. */
export interface InMemoryProgramEvaluationOptions {
  /** The ensemble id/version the double pins on every result. */
  readonly ensembleId?: string;
  readonly ensembleVersion?: number;
  /** The simulator/reward-spec versions the double pins. */
  readonly simulatorVersion?: number;
  readonly rewardSpecVersion?: number;
  /** Disclosed injection: deterministic rejections (fail-closed tests). */
  readonly reject?: (request: ProgramEvaluationRequest) => Error | null;
}

const uncertaintyFor = (relativeHalfWidth: number): UncertaintySummary["level"] => {
  if (relativeHalfWidth <= 0.1) return "low";
  if (relativeHalfWidth <= 0.3) return "moderate";
  return "high";
};

/** Creates the disclosed in-memory program evaluation double. */
export function createInMemoryProgramEvaluation(
  options: InMemoryProgramEvaluationOptions = {},
): ProgramEvaluationPort {
  const pins = {
    ensembleId: options.ensembleId ?? "ensemble:program-search-double",
    ensembleVersion: options.ensembleVersion ?? 1,
    simulatorVersion: options.simulatorVersion ?? 1,
    rewardSpecVersion: options.rewardSpecVersion ?? 1,
  };
  const MEMBER_SPREAD = 0.12;
  return {
    async evaluateProgram(
      request: ProgramEvaluationRequest,
    ): Promise<ProgramEvaluationResult> {
      const rejection = options.reject?.(request) ?? null;
      if (rejection !== null) {
        throw rejection;
      }
      const { action, delayTerms, seed } = request;
      const base =
        4 * clamp01(action.novelty) +
        3 * clamp01(action.engagementEffort) +
        0.5 * Math.max(0, action.cadencePerWeek);
      const memberRewards = [0, 1, 2].map((index) => {
        const jitter = (mix(seed, 31 * (index + 1)) - 1000) / 1000 * MEMBER_SPREAD;
        return q(base * (1 + jitter));
      });
      const expectedReward = q(MEAN_OF(memberRewards));
      const spread = q(Math.max(...memberRewards) - Math.min(...memberRewards));
      const disagreement = q(spread / 2);
      const ev =
        delayTerms.successProbability * delayTerms.expectedIncrementalValue -
        delayTerms.delayCost -
        delayTerms.acquisitionCost;
      const evValue = q(ev);
      return Object.freeze({
        expectedReward,
        interval: Object.freeze({
          lower: q(expectedReward - disagreement),
          upper: q(expectedReward + disagreement),
        }),
        disagreementHalfWidth: disagreement,
        uncertainty: Object.freeze({
          level: uncertaintyFor(
            expectedReward === 0
              ? disagreement === 0
                ? 0
                : 1
              : disagreement / Math.abs(expectedReward),
          ),
        }),
        expectedValueOfDelay: Object.freeze({
          value: evValue,
          interval: Object.freeze({
            lower: q(evValue - disagreement),
            upper: q(evValue + disagreement),
          }),
        }),
        ensembleId: pins.ensembleId,
        ensembleVersion: pins.ensembleVersion,
        simulatorVersion: pins.simulatorVersion,
        rewardSpecVersion: pins.rewardSpecVersion,
        counterfactual: true,
        disclosure: "disclosed-synthetic-ensemble-evaluation",
      });
    },
  };
}
