import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';
import { isFiniteNumber } from './util.js';

/** §22: every estimate carries an interval — bare point estimates are forbidden by construction. */
export interface IntervalEstimate {
  readonly point: number;
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: number;
  readonly method: 'wilson-score' | 'normal-approximation';
}

export interface MetricDefinition {
  readonly metricKey: string;
  /** Declared formula reference — unknown refs are typed failures, never silently computed. */
  readonly formulaRef: string;
  readonly confidenceLevel: number;
  readonly description: string;
}

export type FormulaFamily = 'proportion' | 'mean' | 'health-incidence';

export interface FormulaDescriptor {
  readonly formulaRef: string;
  readonly family: FormulaFamily;
  readonly intervalMethod: 'wilson-score' | 'normal-approximation';
  readonly description: string;
}

export const BUILT_IN_FORMULAS: readonly FormulaDescriptor[] = [
  {
    formulaRef: 'proportion.wilson@1',
    family: 'proportion',
    intervalMethod: 'wilson-score',
    description: 'Pooled proportion of platform-said successes over trials with a Wilson score interval.',
  },
  {
    formulaRef: 'mean.normal@1',
    family: 'mean',
    intervalMethod: 'normal-approximation',
    description: 'Mean of platform-said values with a normal-approximation interval from the sample standard error.',
  },
  {
    formulaRef: 'health.non-healthy-incidence.wilson@1',
    family: 'health-incidence',
    intervalMethod: 'wilson-score',
    description: 'Incidence of platform-SAID non-healthy provider status, stratified by HEALTH-001 restriction class (provider-CONFIRMED and SUSPECTED are never pooled).',
  },
];

export function findFormula(formulaRef: string): FormulaDescriptor | null {
  for (const formula of BUILT_IN_FORMULAS) {
    if (formula.formulaRef === formulaRef) return formula;
  }
  return null;
}

/** Exact two-sided z-scores for the supported confidence levels (deterministic — no inverse-CDF approximation). */
const CONFIDENCE_LEVELS: readonly { readonly level: number; readonly z: number }[] = [
  { level: 0.8, z: 1.2815515655446004 },
  { level: 0.9, z: 1.6448536269514722 },
  { level: 0.95, z: 1.959963984540054 },
  { level: 0.98, z: 2.3263478740408408 },
  { level: 0.99, z: 2.5758293035489004 },
  { level: 0.995, z: 2.807033768344509 },
];

export function supportedConfidenceLevels(): readonly number[] {
  return CONFIDENCE_LEVELS.map((entry) => entry.level);
}

function zForConfidence(level: number): number | null {
  for (const entry of CONFIDENCE_LEVELS) {
    if (entry.level === level) return entry.z;
  }
  return null;
}

export function isSupportedConfidenceLevel(level: number): boolean {
  return zForConfidence(level) !== null;
}

/** Wilson score interval (no continuity correction) for a platform-said proportion. */
export function wilsonInterval(successes: number, trials: number, confidenceLevel: number): Result<IntervalEstimate, Failure> {
  if (!Number.isInteger(trials) || trials < 1) {
    return err(failure('E_INSUFFICIENT_SAMPLE', `trials must be an integer >= 1 (got ${String(trials)})`, { trials }));
  }
  if (!Number.isInteger(successes) || successes < 0 || successes > trials) {
    return err(failure('E_METRIC_DATA_MISMATCH', `successes must be an integer in [0, trials] (got ${String(successes)}/${String(trials)})`, { successes, trials }));
  }
  const z = zForConfidence(confidenceLevel);
  if (z === null) {
    return err(failure('E_UNSUPPORTED_CONFIDENCE', `confidence level ${String(confidenceLevel)} is not one of the supported levels`, { requested: confidenceLevel, supported: supportedConfidenceLevels() }));
  }
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const spread = (z / denominator) * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  if (!isFiniteNumber(center) || !isFiniteNumber(spread)) {
    return err(failure('E_METRIC_DATA_MISMATCH', 'wilson interval degenerated to a non-finite value', { successes, trials }));
  }
  return ok({
    point: p,
    lower: Math.max(0, center - spread),
    upper: Math.min(1, center + spread),
    confidenceLevel,
    method: 'wilson-score',
  });
}

/** Normal-approximation interval for the mean of platform-said values (n >= 2 — a lone value cannot carry an interval). */
export function normalMeanInterval(values: readonly number[], confidenceLevel: number): Result<IntervalEstimate, Failure> {
  if (values.length < 2) {
    return err(failure('E_INSUFFICIENT_SAMPLE', `a mean interval requires at least 2 values (got ${String(values.length)})`, { sampleSize: values.length }));
  }
  for (const value of values) {
    if (!isFiniteNumber(value)) {
      return err(failure('E_METRIC_DATA_MISMATCH', `all values must be finite numbers (got ${String(value)})`, {}));
    }
  }
  const z = zForConfidence(confidenceLevel);
  if (z === null) {
    return err(failure('E_UNSUPPORTED_CONFIDENCE', `confidence level ${String(confidenceLevel)} is not one of the supported levels`, { requested: confidenceLevel, supported: supportedConfidenceLevels() }));
  }
  const n = values.length;
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / n;
  let squaredDeviation = 0;
  for (const value of values) squaredDeviation += (value - mean) * (value - mean);
  const sampleVariance = Math.max(0, squaredDeviation / (n - 1));
  const standardError = Math.sqrt(sampleVariance / n);
  const halfWidth = z * standardError;
  return ok({ point: mean, lower: mean - halfWidth, upper: mean + halfWidth, confidenceLevel, method: 'normal-approximation' });
}
