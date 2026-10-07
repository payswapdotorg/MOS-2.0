import type {
  DelayDecisionPolicy,
  DelayEvComputation,
} from '../contracts/delay-policy.js';
import type {
  DelayOptionAnalysisLine,
  DelayRankedOption,
} from '../contracts/delay-decision.js';
import type { IntervalOverlapDeclaration } from '../contracts/organization-search.js';
import type { DelayDecisionModel } from '../contracts/delay-economics.js';

/**
 * INTERNAL pure computation for the LAB-015 delay decision surface — the
 * DECLARED VERSIONED policy's EV-of-delay formula (`ev-delay-1`) and the
 * declared deterministic ranking. Implements EXACTLY the formula stated in
 * {@link DELAY_DECISION_POLICY_V1.formulaDocument} — there is no other math
 * in this package for the EV of delay. NOT exported from the index.
 */

/**
 * Quantize a computed money amount to 1e-10 (the declared policy's
 * floating-point discipline — identical inputs produce bit-identical
 * outputs even when intermediate products carry representation noise).
 */
const quantize = (value: number): number => Math.round(value * 1e10) / 1e10;

/**
 * Compute the expected value of delay for one option's dimension model
 * under the declared versioned policy — the formula's exact terms are
 * recorded so the computation is auditable term-by-term:
 *
 *   EV = p × V − D − A
 *   D  = delayCost.perUnitTime.amount × (estimatedWait.waitMs / delayCost.unitMs)
 *   EV.lower = p × V.interval.lower − D − A ; EV.upper = p × V.interval.upper − D − A
 *
 * The currency of every money term must already have been validated to be
 * ONE currency (the caller validates; a mismatch never reaches this pure
 * function). Quality impact is CARRIED on the line, never monetized.
 */
export const computeOptionEv = (
  policy: DelayDecisionPolicy,
  dimensions: DelayDecisionModel,
): DelayEvComputation => {
  const p = dimensions.successProbability.probability;
  const value = dimensions.expectedIncrementalValue;
  const currency = value.estimate.currency;
  const waitUnits = dimensions.estimatedWait.waitMs / dimensions.delayCost.unitMs;
  const delayCostTotal = quantize(dimensions.delayCost.perUnitTime.amount * waitUnits);
  const acquisition = dimensions.acquisitionCost.estimate.amount;
  const ev = quantize(p * value.estimate.amount - delayCostTotal - acquisition);
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    formula: policy.formula,
    formulaDocument: policy.formulaDocument,
    terms: {
      successProbability: p,
      expectedIncrementalValue: value.estimate,
      delayCost: { amount: delayCostTotal, currency },
      acquisitionCost: dimensions.acquisitionCost.estimate,
    },
    expectedValueOfDelay: { amount: ev, currency },
    interval: {
      lower: quantize(p * value.interval.lower - delayCostTotal - acquisition),
      upper: quantize(p * value.interval.upper - delayCostTotal - acquisition),
    },
  };
};

/** The EV interval's half-width (the ranking's first tie-break key). */
const halfWidthOf = (ev: DelayEvComputation): number => (ev.interval.upper - ev.interval.lower) / 2;

/**
 * Rank the APPLICABLE analysis lines under the declared ranking policy —
 * the deterministic total order: EV descending → interval half-width
 * ascending → option kind ascending (the W5-B discipline). The rank-1 line
 * is the declared recommendation; every other ranked option carries its
 * interval-overlap-with-leader declaration (declared, never hidden).
 */
export const rankApplicableLines = (
  lines: readonly DelayOptionAnalysisLine[],
): readonly DelayRankedOption[] => {
  const applicable = lines.filter((line) => line.applicable && line.ev !== null);
  const ordered = [...applicable].sort((left, right) => {
    const evDelta = right.ev!.expectedValueOfDelay.amount - left.ev!.expectedValueOfDelay.amount;
    if (evDelta !== 0) {
      return evDelta;
    }
    const widthDelta = halfWidthOf(left.ev!) - halfWidthOf(right.ev!);
    if (widthDelta !== 0) {
      return widthDelta;
    }
    return left.optionKind < right.optionKind ? -1 : left.optionKind > right.optionKind ? 1 : 0;
  });
  const leader = ordered[0] ?? null;
  return ordered.map((line, index) => ({
    rank: index + 1,
    optionKind: line.optionKind,
    target: line.target!,
    ev: line.ev!,
    intervalOverlapWithLeader:
      leader === null || index === 0
        ? null
        : overlapsWithLeader(line.ev!, leader.ev!),
  }));
};

/**
 * The interval-overlap declaration vs the rank-1 option (the W5-B
 * discipline — when an option's EV interval overlaps the leader's, that is
 * DECLARED, never hidden).
 */
const overlapsWithLeader = (
  ev: DelayEvComputation,
  leaderEv: DelayEvComputation,
): IntervalOverlapDeclaration => {
  const overlaps = ev.interval.lower <= leaderEv.interval.upper && leaderEv.interval.lower <= ev.interval.upper;
  return {
    overlaps,
    note: overlaps
      ? 'the option\'s EV interval overlaps the rank-1 option\'s interval — the ranking order between them is not evidence of a real difference'
      : 'the option\'s EV interval does not overlap the rank-1 option\'s interval',
  };
};
