import type { UncertaintySummary } from '@mos/contracts';
import type {
  LabRewardMetricId,
  LabRewardSpec,
  LabRewardTerm,
} from '../contracts/reward.js';

/**
 * INTERNAL reward computation support for the LAB-008 (off-policy
 * evaluation) and LAB-009 (strategy learning) adapters. NOT exported from
 * the package index — implementation detail, not surface.
 *
 * The reward of a program under a {@link LabRewardSpec} is the signed
 * weighted sum over the spec's terms, each term drawing its value from a
 * DECLARED concrete metric source:
 *
 * ```
 * R = Σ_j sign(d_j) · w_j · v_j        sign(maximize) = +1, sign(minimize) = −1
 * ```
 *
 * A term's `metricSource` must resolve in EXACTLY ONE of the evaluation
 * context's value domains — the ensemble-predicted METRICS, the
 * ensemble-predicted metric DELTAS, or (LAB-008 only) the observed
 * historical metric means. A source that resolves nowhere fails closed
 * (`reward-term-not-derivable`); a source that resolves in more than one
 * domain fails closed (`reward-term-ambiguous`) — the binding is explicit,
 * never silent (§21: vanity metrics never silently replace the declared
 * objective).
 */

/** The value domains a term source can resolve against. */
export interface RewardValueDomains {
  /** Ensemble-predicted metric expected values, by metric name. */
  readonly predictedMetrics: ReadonlyMap<string, number>;
  /** Ensemble-predicted metric deltas, by metric name. */
  readonly predictedDeltas: ReadonlyMap<string, number>;
  /** Observed historical metric means, by metric name (LAB-008; empty for LAB-009). */
  readonly observedMeans?: ReadonlyMap<string, number>;
}

/** Where a term's value came from. */
export type RewardTermSource =
  | 'predicted-metric'
  | 'predicted-delta'
  | 'observed';

/** One resolved term: value + provenance. */
export interface ResolvedRewardTerm {
  readonly term: LabRewardTerm;
  readonly source: RewardTermSource;
  readonly value: number;
}

export type RewardResolutionFailure =
  | { readonly failure: 'reward-term-not-derivable'; readonly metricSource: string }
  | { readonly failure: 'reward-term-ambiguous'; readonly metricSource: string };

const REWARD_METRIC_IDS: ReadonlySet<string> = new Set<LabRewardMetricId>([
  'business-outcome',
  'qualified-reach',
  'retention',
  'audience-growth',
  'qualified-traffic',
  'conversion',
  'revenue',
  'contribution',
  'cost',
  'latency',
  'human-acquisition-cost',
  'engine-acquisition-cost',
  'rights-risk',
  'policy-risk',
  'fatigue',
  'quality',
  'operational-risk',
]);

const isBlank = (value: string): boolean => value.trim().length === 0;

/** Structural validation of a reward spec (null = valid). */
export const validateRewardSpec = (spec: LabRewardSpec): string | null => {
  if (spec === null || typeof spec !== 'object') {
    return 'rewardSpec must be an object';
  }
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    return 'rewardSpec.version must be an integer >= 1';
  }
  if (!Array.isArray(spec.terms) || spec.terms.length === 0) {
    return 'rewardSpec.terms must be a non-empty array';
  }
  for (let index = 0; index < spec.terms.length; index += 1) {
    const term = spec.terms[index];
    const where = `rewardSpec.terms[${index}]`;
    if (!REWARD_METRIC_IDS.has(term.metric)) {
      return `${where}: metric must be one of the §21 reward metric ids (got: ${String(term.metric)})`;
    }
    if (typeof term.weight !== 'number' || !Number.isFinite(term.weight) || term.weight <= 0) {
      return `${where}: weight must be a finite number > 0`;
    }
    if (term.direction !== 'maximize' && term.direction !== 'minimize') {
      return `${where}: direction must be maximize | minimize`;
    }
    if (typeof term.definition !== 'string' || isBlank(term.definition)) {
      return `${where}: definition must be a non-empty string`;
    }
    if (typeof term.metricSource !== 'string' || isBlank(term.metricSource)) {
      return `${where}: metricSource must be a non-empty string`;
    }
  }
  return null;
};

/** Resolve one term's source against the value domains.
 *
 * PRECEDENCE (documented): within the predicted domain the METRIC LEVEL
 * takes precedence over the metric DELTA when a name exists in both (the
 * LAB-004 engine emits per-step levels and deltas under shared names);
 * ambiguity is flagged only when a name resolves in BOTH the predicted and
 * the observed domains (a caller must disambiguate explicitly — §21). */
export const resolveRewardTerm = (
  term: LabRewardTerm,
  domains: RewardValueDomains,
): ResolvedRewardTerm | RewardResolutionFailure => {
  const name = term.metricSource;
  const inMetrics = domains.predictedMetrics.has(name);
  const inDeltas = domains.predictedDeltas.has(name);
  const inObserved = domains.observedMeans?.has(name) ?? false;
  const inPredicted = inMetrics || inDeltas;
  if (!inPredicted && !inObserved) {
    return { failure: 'reward-term-not-derivable', metricSource: name };
  }
  if (inPredicted && inObserved) {
    return { failure: 'reward-term-ambiguous', metricSource: name };
  }
  if (inMetrics) {
    return { term, source: 'predicted-metric', value: domains.predictedMetrics.get(name) as number };
  }
  if (inDeltas) {
    return { term, source: 'predicted-delta', value: domains.predictedDeltas.get(name) as number };
  }
  return { term, source: 'observed', value: (domains.observedMeans as Map<string, number>).get(name) as number };
};

/**
 * Compute the reward value of one evaluation context (one (seed, step) — or
 * any pre-averaged context): the signed weighted sum over resolved terms.
 * Fails closed on the first non-derivable/ambiguous term.
 */
export const computeRewardValue = (
  spec: LabRewardSpec,
  domains: RewardValueDomains,
): { readonly reward: number; readonly resolved: readonly ResolvedRewardTerm[] } | RewardResolutionFailure => {
  const resolved: ResolvedRewardTerm[] = [];
  let reward = 0;
  for (const term of spec.terms) {
    const outcome = resolveRewardTerm(term, domains);
    if ('failure' in outcome) {
      return outcome;
    }
    resolved.push(outcome);
    reward += (term.direction === 'maximize' ? 1 : -1) * term.weight * outcome.value;
  }
  return { reward, resolved };
};

/** Mean of a non-empty numeric list (NaN-safe: callers guarantee non-empty). */
export const meanOf = (values: readonly number[]): number => {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
};

/** Half the (max − min) spread of a list (0 for a single value). */
export const halfSpreadOf = (values: readonly number[]): number => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return (max - min) / 2;
};

/**
 * Map a relative half-width to the §22 uncertainty level using the same
 * thresholds as parametric-support.uncertaintyFor: < 5% low, < 15%
 * moderate, else high.
 */
export const uncertaintyLevelForRelativeHalfWidth = (
  expectedValue: number,
  halfWidth: number,
): UncertaintySummary['level'] => {
  const magnitude = Math.abs(expectedValue);
  const relative =
    magnitude === 0 ? (halfWidth === 0 ? 0 : 1) : halfWidth / magnitude;
  return relative < 0.05 ? 'low' : relative < 0.15 ? 'moderate' : 'high';
};
