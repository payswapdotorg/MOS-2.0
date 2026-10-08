import type { BenchmarkCandidate, RobustnessPolicy } from '../contracts/robust-benchmark.js';
import { BENCHMARK_NOOP_STRATEGY_REF } from '../contracts/robust-benchmark.js';
import { validateStrategyActionCandidate } from './parametric-support.js';

/**
 * INTERNAL structural validation for the LAB-017 in-memory robust
 * marketing benchmark — the fail-closed gate in front of every run. NOT
 * exported from the package index.
 *
 * Everything here is DECLARED-policy validation: the robustness policy
 * (seed budget, world-model set, sweep dimensions, aggregation rule, frozen
 * tie-break), the benchmark candidates (key uniqueness is the CALLER's
 * loop; per-candidate shape is here), and the synthesized no-op baseline's
 * reserved identity (a caller may never claim it — the W8-B discipline).
 */

const isBlank = (value: string): boolean => value.trim().length === 0;

/** The synthesized no-op baseline's candidate key (reserved — callers may not claim it). */
export const NOOP_BASELINE_KEY = 'no-op-baseline';

/** The synthesized no-op baseline (§7/lock rule 5 — always evaluated, never caller-supplied). */
export const noopBaselineCandidate = (): BenchmarkCandidate => ({
  key: NOOP_BASELINE_KEY,
  action: {
    strategyRef: BENCHMARK_NOOP_STRATEGY_REF,
    kind: 'no-op',
    cadencePerWeek: 0,
    novelty: 0,
    engagementEffort: 0,
  },
  horizonSteps: 1,
  source: {
    origin: 'no-op-baseline',
    producerPins: [],
    note: 'synthesized by the robust marketing benchmark itself (§7: the no-op path is always a valid baseline)',
  },
  label: 'no-op baseline (synthesized)',
});

/** `true` when the fault text marks a caller claim on the benchmark's no-op baseline identity. */
export const isNoopBaselineClaim = (fault: string): boolean =>
  fault.includes('reserved for the benchmark') || fault.includes('never caller-supplied');

/** Structural validation of the DECLARED robustness policy (null = valid). */
export const validateRobustnessPolicy = (policy: RobustnessPolicy): string | null => {
  if (policy === null || typeof policy !== 'object') {
    return 'policy must be an object';
  }
  if (typeof policy.id !== 'string' || isBlank(policy.id)) {
    return 'policy.id must be a non-empty string';
  }
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    return 'policy.version must be an integer >= 1';
  }
  if (!Number.isInteger(policy.seedBudget) || policy.seedBudget < 2) {
    return 'policy.seedBudget must be an integer >= 2 (seed robustness needs two seeds)';
  }
  if (!Array.isArray(policy.worldModelSet) || policy.worldModelSet.length === 0) {
    return 'policy.worldModelSet must be a non-empty array';
  }
  const seenPairs = new Set<string>();
  const seenLabels = new Set<string>();
  for (let index = 0; index < policy.worldModelSet.length; index += 1) {
    const ref = policy.worldModelSet[index];
    const where = `policy.worldModelSet[${index}]`;
    if (typeof ref.ensembleId !== 'string' || isBlank(ref.ensembleId)) {
      return `${where}: ensembleId must be a non-empty string`;
    }
    if (!Number.isInteger(ref.ensembleVersion) || ref.ensembleVersion < 1) {
      return `${where}: ensembleVersion must be an integer >= 1`;
    }
    if (typeof ref.label !== 'string' || isBlank(ref.label)) {
      return `${where}: label must be a non-empty string`;
    }
    const pair = `${ref.ensembleId}@${ref.ensembleVersion}`;
    if (seenPairs.has(pair)) {
      return `${where}: duplicate world-model set entry ${pair}`;
    }
    seenPairs.add(pair);
    if (seenLabels.has(ref.label)) {
      return `${where}: duplicate label "${ref.label}" (world-model labels are unique)`;
    }
    seenLabels.add(ref.label);
  }
  if (!Array.isArray(policy.sweepDimensions) || policy.sweepDimensions.length === 0) {
    return 'policy.sweepDimensions must be a non-empty array';
  }
  const dimensions = new Set<string>();
  for (const dimension of policy.sweepDimensions) {
    if (dimension !== 'seed' && dimension !== 'world-model') {
      return `policy.sweepDimensions entries must be seed | world-model (got: ${String(dimension)})`;
    }
    if (dimensions.has(dimension)) {
      return `policy.sweepDimensions carries a duplicate entry: ${dimension}`;
    }
    dimensions.add(dimension);
  }
  if (!dimensions.has('seed')) {
    return 'policy.sweepDimensions must include seed (§22 seed robustness is mandatory)';
  }
  if (dimensions.has('world-model') && policy.worldModelSet.length < 2) {
    return 'policy.sweepDimensions includes world-model but the world-model set has fewer than two entries';
  }
  if (policy.aggregation !== 'pooled-mean' && policy.aggregation !== 'worst-world-mean') {
    return 'policy.aggregation must be pooled-mean | worst-world-mean';
  }
  if (policy.tieBreak !== 'expected-desc-halfwidth-asc-key-asc') {
    return 'policy.tieBreak must be expected-desc-halfwidth-asc-key-asc (frozen vocabulary for v1)';
  }
  if (typeof policy.note !== 'string' || isBlank(policy.note)) {
    return 'policy.note must be a non-empty rationale string';
  }
  return null;
};

/** Structural validation of one benchmark candidate (null = valid). */
export const validateBenchmarkCandidate = (
  candidate: BenchmarkCandidate,
  where: string,
): string | null => {
  if (candidate === null || typeof candidate !== 'object') {
    return `${where}: candidate must be an object`;
  }
  if (typeof candidate.key !== 'string' || isBlank(candidate.key)) {
    return `${where}: key must be a non-empty string`;
  }
  if (candidate.key === NOOP_BASELINE_KEY) {
    return `${where}: key "${NOOP_BASELINE_KEY}" is reserved for the benchmark's synthesized no-op baseline`;
  }
  const actionFault = validateStrategyActionCandidate(candidate.action);
  if (actionFault !== null) {
    return `${where} (key "${candidate.key}"): ${actionFault}`;
  }
  if (candidate.action.strategyRef === BENCHMARK_NOOP_STRATEGY_REF) {
    return `${where} (key "${candidate.key}"): the action carries the benchmark's synthesized no-op strategy ref — the baseline is never caller-supplied`;
  }
  if (!Number.isInteger(candidate.horizonSteps) || candidate.horizonSteps < 1) {
    return `${where} (key "${candidate.key}"): horizonSteps must be an integer >= 1`;
  }
  const source = candidate.source;
  const origins: readonly string[] = [
    'hand-designed',
    'learned-strategy',
    'organization-search',
    'production-search',
    'no-op-baseline',
  ];
  if (!origins.includes(source.origin)) {
    return `${where} (key "${candidate.key}"): source.origin must be one of the benchmark candidate origins`;
  }
  if (source.origin === 'no-op-baseline') {
    return `${where} (key "${candidate.key}"): source.origin no-op-baseline is reserved for the benchmark's synthesized baseline`;
  }
  if (typeof source.note !== 'string' || isBlank(source.note)) {
    return `${where} (key "${candidate.key}"): source.note must be a non-empty provenance string`;
  }
  if (!Array.isArray(source.producerPins)) {
    return `${where} (key "${candidate.key}"): source.producerPins must be an array`;
  }
  for (let index = 0; index < source.producerPins.length; index += 1) {
    const pin = source.producerPins[index];
    if (typeof pin.surface !== 'string' || isBlank(pin.surface)) {
      return `${where} (key "${candidate.key}"): source.producerPins[${index}].surface must be a non-empty string`;
    }
    if (!Number.isInteger(pin.version) || pin.version < 1) {
      return `${where} (key "${candidate.key}"): source.producerPins[${index}].version must be an integer >= 1`;
    }
  }
  if (
    candidate.label !== undefined &&
    candidate.label !== null &&
    typeof candidate.label !== 'string'
  ) {
    return `${where} (key "${candidate.key}"): label must be a string or null`;
  }
  return null;
};
