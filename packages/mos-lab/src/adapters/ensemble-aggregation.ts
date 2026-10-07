import type { UncertaintySummary } from '@mos/contracts';
import type {
  EnsembleDisagreement,
  EnsembleMember,
  EnsembleOodSignal,
  MemberOodVerdict,
  MemberPrediction,
  MetricDisagreement,
} from '../contracts/ensemble.js';
import type { PredictedMetric } from '../contracts/evidence.js';
import type {
  SimulatedMetricDelta,
  StrategyActionCandidate,
} from '../contracts/simulator.js';
import { uncertaintyLevelForRelativeHalfWidth } from './reward-computation.js';

/** Map a RELATIVE half-width (already normalized) to the §22 level. */
const relativeToLevel = (
  relative: number,
): UncertaintySummary['level'] =>
  uncertaintyLevelForRelativeHalfWidth(relative === 0 ? 0 : 1, relative);

/**
 * INTERNAL pure aggregation math for the LAB-007 in-memory ensemble
 * evaluator. NOT exported from the package index.
 *
 * AGGREGATION FORMULA (documented, deterministic — no noise beyond what the
 * members already carry; all members execute under the SAME (seed, step)
 * noise stream so the member spread reflects MODEL differences, not noise
 * draws; seed robustness is measured separately by the multi-seed sweep):
 *
 * ```
 * w_i                 = effective member weights (policy-resolved, Σw_i = 1)
 * E[m]                = Σ_i w_i · E_i[m]                     (weighted mean)
 * spread[m]           = max_i E_i[m] − min_i E_i[m]          (MODEL DISAGREEMENT)
 * L[m]                = min(Σ_i w_i · l_i[m], E[m] − spread[m]/2)
 * U[m]                = max(Σ_i w_i · u_i[m], E[m] + spread[m]/2)
 * ```
 *
 * The interval is forced to COVER the member expected-value spread —
 * weighting can never hide model disagreement (§22). The same formulas
 * apply to metric deltas. Metrics present in only some members are dropped
 * from aggregation and NAMED in `nonUniversalMetrics` (visible, not
 * silent).
 */

/** One aggregated metric row (expected + interval + unit). */
interface NumericSpread {
  readonly expected: number;
  readonly lower: number;
  readonly upper: number;
  readonly memberExpected: readonly number[];
  readonly spread: number;
}

const weightedAggregate = (
  rows: readonly { expected: number; lower: number; upper: number }[],
  weights: readonly number[],
): NumericSpread => {
  let expected = 0;
  let lower = 0;
  let upper = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < rows.length; index += 1) {
    const weight = weights[index] as number;
    const row = rows[index] as { expected: number; lower: number; upper: number };
    expected += weight * row.expected;
    lower += weight * row.lower;
    upper += weight * row.upper;
    if (row.expected < min) min = row.expected;
    if (row.expected > max) max = row.expected;
  }
  const spread = max - min;
  return {
    expected,
    lower: Math.min(lower, expected - spread / 2),
    upper: Math.max(upper, expected + spread / 2),
    memberExpected: rows.map((row) => row.expected),
    spread,
  };
};

/** Names present in EVERY member (order preserved from the first member). */
const universalNames = (
  perMember: readonly (readonly string[])[],
): string[] => {
  const [first] = perMember;
  if (!first) return [];
  return first.filter((name) => perMember.every((names) => names.includes(name)));
};

/** Names present in some but not all members (sorted, visible in the output). */
const nonUniversalNames = (
  perMember: readonly (readonly string[])[],
): string[] => {
  const all = new Set<string>();
  for (const names of perMember) {
    for (const name of names) {
      all.add(name);
    }
  }
  const universal = new Set(universalNames(perMember));
  return [...all].filter((name) => !universal.has(name)).sort();
};

/** The full aggregation of member predictions into the §22 summary pieces. */
export const aggregateEnsembleMembers = (
  memberPredictions: readonly MemberPrediction[],
): {
  readonly metrics: readonly PredictedMetric[];
  readonly deltas: readonly SimulatedMetricDelta[];
  readonly disagreement: EnsembleDisagreement;
  readonly nonUniversalMetrics: readonly string[];
  readonly uncertainty: UncertaintySummary;
} => {
  const weights = memberPredictions.map((member) => member.effectiveWeight);

  const metricNames = universalNames(
    memberPredictions.map((member) => member.prediction.metrics.map((m) => m.metric)),
  );
  const deltaNames = universalNames(
    memberPredictions.map((member) => member.prediction.deltas.map((d) => d.metric)),
  );

  const metrics: PredictedMetric[] = [];
  const deltaRows: SimulatedMetricDelta[] = [];
  const disagreements: MetricDisagreement[] = [];
  let worstRelativeHalfWidth = 0;

  for (const name of metricNames) {
    const rows = memberPredictions.map((member) => {
      const metric = member.prediction.metrics.find((m) => m.metric === name);
      return {
        expected: metric?.expectedValue ?? 0,
        lower: metric?.interval.lower ?? 0,
        upper: metric?.interval.upper ?? 0,
      };
    });
    const aggregate = weightedAggregate(rows, weights);
    const unit = (memberPredictions[0]?.prediction.metrics.find((m) => m.metric === name))?.unit ?? '';
    metrics.push({
      metric: name,
      expectedValue: aggregate.expected,
      interval: { lower: aggregate.lower, upper: aggregate.upper },
      unit,
    });
    disagreements.push({
      metric: name,
      unit,
      memberExpected: aggregate.memberExpected,
      spread: aggregate.spread,
      halfSpread: aggregate.spread / 2,
    });
    const halfWidth = (aggregate.upper - aggregate.lower) / 2;
    const relative =
      Math.abs(aggregate.expected) === 0
        ? halfWidth === 0 ? 0 : 1
        : halfWidth / Math.abs(aggregate.expected);
    if (relative > worstRelativeHalfWidth) worstRelativeHalfWidth = relative;
  }

  for (const name of deltaNames) {
    const rows = memberPredictions.map((member) => {
      const delta = member.prediction.deltas.find((d) => d.metric === name);
      return {
        expected: delta?.expectedDelta ?? 0,
        lower: delta?.interval.lower ?? 0,
        upper: delta?.interval.upper ?? 0,
      };
    });
    const aggregate = weightedAggregate(rows, weights);
    const unit = (memberPredictions[0]?.prediction.deltas.find((d) => d.metric === name))?.unit ?? '';
    deltaRows.push({
      metric: name,
      expectedDelta: aggregate.expected,
      interval: { lower: aggregate.lower, upper: aggregate.upper },
      unit,
    });
    disagreements.push({
      metric: name,
      unit,
      memberExpected: aggregate.memberExpected,
      spread: aggregate.spread,
      halfSpread: aggregate.spread / 2,
    });
    const halfWidth = (aggregate.upper - aggregate.lower) / 2;
    const relative =
      Math.abs(aggregate.expected) === 0
        ? halfWidth === 0 ? 0 : 1
        : halfWidth / Math.abs(aggregate.expected);
    if (relative > worstRelativeHalfWidth) worstRelativeHalfWidth = relative;
  }

  const nonUniversalMetrics = [
    ...nonUniversalNames(memberPredictions.map((member) => member.prediction.metrics.map((m) => m.metric))),
    ...nonUniversalNames(memberPredictions.map((member) => member.prediction.deltas.map((d) => d.metric))),
  ];

  const level = relativeToLevel(worstRelativeHalfWidth);
  const uncertainty: UncertaintySummary = {
    level,
    note: 'ensemble aggregate of disclosed synthetic response functions — NOT ground truth (§22); interval forced to cover the member spread (model disagreement always visible)',
  };
  const worstDisagreementRelative = disagreements.reduce((worst, row) => {
    const mean = row.memberExpected.reduce((sum, value) => sum + value, 0) / row.memberExpected.length;
    const relative = Math.abs(mean) === 0 ? (row.halfSpread === 0 ? 0 : 1) : row.halfSpread / Math.abs(mean);
    return relative > worst ? relative : worst;
  }, 0);

  return {
    metrics,
    deltas: deltaRows,
    disagreement: {
      perMetric: disagreements,
      summary: {
        level: relativeToLevel(worstDisagreementRelative),
        note: 'model disagreement = member expected-value spread (max − min), reported per metric — never hidden by weighting',
      },
    },
    nonUniversalMetrics,
    uncertainty,
  };
};

/**
 * OOD/novelty signal: per-dimension normalized distance of the candidate's
 * knobs from each member's DECLARED coverage box (distance 0 inside; else
 * the gap to the nearest bound normalized by max(box width, 1)); members
 * without a coverage declaration are `undeclared` (disclosed seam). The
 * ensemble-level signal is FLAGGED when any member is out of coverage —
 * never a silent extrapolation.
 */
export const computeOodSignal = (
  members: readonly EnsembleMember[],
  candidate: StrategyActionCandidate,
): EnsembleOodSignal => {
  const distance = (
    box: { readonly min: number; readonly max: number },
    value: number,
  ): number => {
    if (value >= box.min && value <= box.max) {
      return 0;
    }
    const gap = Math.min(Math.abs(value - box.min), Math.abs(value - box.max));
    const span = Math.max(box.max - box.min, 1);
    return gap / span;
  };

  const perMember: MemberOodVerdict[] = members.map((member) => {
    if (!member.coverage) {
      return {
        memberId: member.id,
        verdict: 'undeclared',
        distances: { cadencePerWeek: 0, novelty: 0, engagementEffort: 0 },
        maxDistance: 0,
      };
    }
    const distances = {
      cadencePerWeek: distance(member.coverage.cadencePerWeek, candidate.cadencePerWeek),
      novelty: distance(member.coverage.novelty, candidate.novelty),
      engagementEffort: distance(member.coverage.engagementEffort, candidate.engagementEffort),
    };
    const maxDistance = Math.max(distances.cadencePerWeek, distances.novelty, distances.engagementEffort);
    return {
      memberId: member.id,
      verdict: maxDistance > 0 ? 'out-of-declared-coverage' : 'in-coverage',
      distances,
      maxDistance,
    };
  });

  const anyOut = perMember.some((verdict) => verdict.verdict === 'out-of-declared-coverage');
  const anyUndeclared = perMember.some((verdict) => verdict.verdict === 'undeclared');
  return {
    status: anyOut
      ? 'out-of-declared-coverage'
      : anyUndeclared
        ? 'partially-undeclared'
        : 'in-coverage',
    flagged: anyOut,
    perMember,
  };
};
