import type { UncertaintySummary } from '@mos/contracts';
import type { StrategyActionCandidate } from '../contracts/simulator.js';

/**
 * INTERNAL support helpers for the lab's in-memory adapters — the disclosed
 * deterministic synthetic parametric adapters (LAB-004 simulator + LAB-005
 * dynamics) and the shared clone/freeze ownership helpers of the versioned
 * stores (LAB-011+). NOT exported from the package index — these are
 * implementation details, not surface.
 *
 * Everything here is pure and deterministic: the seeded PRNG is the ONLY
 * source of pseudo-randomness in the lab's synthetic response functions, so
 * identical seeds always reproduce identical streams (spec §22 seed
 * robustness is testable against exactly these functions).
 */

/**
 * Deterministic seeded PRNG (mulberry32). Returns floats in [0, 1).
 * `seed >>> 0` handles negative seeds; identical seeds → identical streams.
 */
export const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Mix a seed with a step index into a fresh deterministic seed. */
export const mixStepSeed = (seed: number, step: number): number =>
  (seed ^ Math.imul(step + 1, 0x9e3779b1)) >>> 0;

/** Clamp a number into [lower, upper]. */
export const clamp = (value: number, lower: number, upper: number): number =>
  Math.min(upper, Math.max(lower, value));

/** Clamp a number into [0, 1]. */
export const clamp01 = (value: number): number => clamp(value, 0, 1);

/** `true` when the value is a finite number inside [0, 1]. */
export const isUnitInterval = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** `true` when the value is a finite non-negative number. */
export const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** `true` for a string that is empty or whitespace-only. */
export const isBlankString = (value: string): boolean => value.trim().length === 0;

/** `true` for a non-null, non-array object (the JSON-object shape guard). */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `true` for an integer ≥ 1 (record versions, artifact versions). */
export const isPositiveInteger = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * Derive the §22 uncertainty summary for one synthetic quantity from the
 * relative half-width of its envelope: < 5% → low, < 15% → moderate, else
 * high. Deterministic — derived from the computed spread, never from noise.
 */
export const uncertaintyFor = (
  expectedValue: number,
  halfWidth: number,
  note: string,
): UncertaintySummary => {
  const magnitude = Math.abs(expectedValue);
  const relative = magnitude === 0 ? (halfWidth === 0 ? 0 : 1) : halfWidth / magnitude;
  const level: UncertaintySummary['level'] =
    relative < 0.05 ? 'low' : relative < 0.15 ? 'moderate' : 'high';
  return { level, note };
};

/**
 * Validate a strategy action candidate (shared by the simulator and dynamics
 * adapters). Returns a failure message, or `null` when the candidate is
 * well-formed. A `no-op` candidate must carry zero cadence (nothing happens
 * by definition), and no candidate may carry out-of-range knobs.
 */
export const validateStrategyActionCandidate = (
  candidate: StrategyActionCandidate,
): string | null => {
  if (typeof candidate.strategyRef !== 'string' || candidate.strategyRef.length === 0) {
    return 'candidate.strategyRef must be a non-empty string';
  }
  if (
    candidate.kind !== 'content' &&
    candidate.kind !== 'repost' &&
    candidate.kind !== 'no-op'
  ) {
    return `candidate.kind must be one of content | repost | no-op (got: ${String(candidate.kind)})`;
  }
  if (!isFiniteNonNegative(candidate.cadencePerWeek)) {
    return 'candidate.cadencePerWeek must be a finite number >= 0';
  }
  if (!isUnitInterval(candidate.novelty)) {
    return 'candidate.novelty must be a number in [0, 1]';
  }
  if (!isUnitInterval(candidate.engagementEffort)) {
    return 'candidate.engagementEffort must be a number in [0, 1]';
  }
  if (candidate.kind === 'no-op' && candidate.cadencePerWeek !== 0) {
    return 'a no-op candidate must carry cadencePerWeek = 0 (no-op produces no activity)';
  }
  return null;
};

/**
 * Deterministically derive a prediction record id from the inputs that
 * produced it (pure value semantics: identical inputs → identical record
 * ids, so determinism tests can compare whole records with deep equality).
 */
export const predictionId = (
  prefix: string,
  parts: readonly (string | number)[],
): string => `${prefix}:${parts.join(':')}`;

/**
 * Recursively freeze a record (arrays and nested plain objects included).
 * Used by the append-only stores so history is immutable even against
 * in-memory mutation attempts (strict-mode ESM throws on writes).
 */
export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
};

/**
 * Recursively clone a JSON-shaped value (plain objects, arrays, primitives)
 * into fresh structures. Used by the in-memory stores for CLONE-THEN-FREEZE
 * ownership semantics: caller-supplied records are never frozen or retained
 * in place, so a stored version can never mutate data the caller still owns
 * (the W4-B mos-jobs ownership lesson, applied from the start here).
 */
export const cloneDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDeep(entry)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = cloneDeep(entry);
    }
    return copy as unknown as T;
  }
  return value;
};
