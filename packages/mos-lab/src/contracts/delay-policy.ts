import type { MoneyAmount } from '@mos/contracts';
import type { PredictionInterval } from './evidence.js';

/**
 * The DECLARED VERSIONED delay-decision policy (LAB-015, §18) — the EV-of-
 * delay computation as DOCUMENTED, VERSIONED policy, never hidden math.
 *
 * Basis: spec/mos-architecture-v2.0.md §18 (the Expected Value of Delay is a
 * first-class production strategy variable; waiting is a decision variable),
 * §22 (uncertainty intervals carried on estimates), architecture lock rule
 * 25 (expected value of delay is part of production strategy search).
 *
 * The shipped {@link DELAY_DECISION_POLICY_V1} documents the exact formula;
 * the in-memory adapter implements EXACTLY this document (nothing else in
 * the package computes the EV of delay), and every analysis records the
 * policy snapshot that produced it — so a policy change is a VERSION change
 * and historical analyses stay interpretable.
 */

// ---------------------------------------------------------------------------
// The declared ranking policy
// ---------------------------------------------------------------------------

/**
 * The declared ranking policy: uncertainty-aware with a deterministic total
 * order (the W5-B discipline) — primary key the expected value of delay
 * (descending), first tie-break the interval half-width (ascending — between
 * two equally-valued options the LESS uncertain one ranks first), final
 * tie-break the option kind (ascending — a stable total order over the ten
 * kinds, so identical inputs always produce identical rankings).
 */
export interface DelayRankingPolicy {
  readonly kind: 'uncertainty-aware-deterministic';
  /** Primary: expected value of delay, descending. */
  readonly primary: 'expected-value-of-delay-desc';
  /** Tie-break 1: EV interval half-width, ascending (uncertainty-aware). */
  readonly tieBreakOne: 'interval-half-width-asc';
  /** Tie-break 2: option kind, ascending (deterministic total order). */
  readonly tieBreakTwo: 'option-kind-asc';
}

// ---------------------------------------------------------------------------
// The declared versioned policy
// ---------------------------------------------------------------------------

/**
 * The declared versioned delay-decision policy. `formula` identifies the
 * exact computation; `formulaDocument` states it in full; `ranking` declares
 * the deterministic ranking; `qualityImpactPolicy` declares how the quality
 * dimension is treated (carried, never monetized). A policy change is a
 * VERSION change — analyses record the snapshot of the policy that produced
 * them, so historical analyses stay interpretable.
 */
export interface DelayDecisionPolicy {
  /** Policy identity (stable across its versions). */
  readonly id: string;
  /** Policy-local monotonic version — policy evolution is explicit and traceable. */
  readonly version: number;
  readonly formula: 'ev-delay-1';
  /** The full documented formula (verbatim; the adapter implements exactly this). */
  readonly formulaDocument: string;
  readonly ranking: DelayRankingPolicy;
  readonly qualityImpactPolicy: 'carried-not-monetized';
  /**
   * Declared floating-point discipline: computed money amounts are quantized
   * to 1e-10 (the LAB-004 knob discipline) so identical inputs produce
   * bit-identical outputs.
   */
  readonly quantization: 'quantized-to-1e-10';
}

/**
 * The shipped policy v1. DOCUMENTED FORMULA (`ev-delay-1`):
 *
 * ```
 * EV(option) = p × V − D − A
 *   p = successProbability.probability                      (dimensionless, [0, 1])
 *   V = expectedIncrementalValue.estimate.amount            (money, currency C)
 *   D = delayCost.perUnitTime.amount × (estimatedWait.waitMs / delayCost.unitMs)
 *                                                            (money, C — the total
 *                                                             delay cost over the
 *                                                             estimated wait)
 *   A = acquisitionCost.estimate.amount                     (money, C)
 *
 * Uncertainty (§22, the LAB-007/008 interval discipline):
 *   EV.lower = p × V.interval.lower − D − A
 *   EV.upper = p × V.interval.upper − D − A
 *
 * All money terms (V, D, A) must share ONE currency — a currency mismatch
 * fails closed rather than inventing an exchange rate. Quality impact is
 * CARRIED on every analysis line as a declared dimension and is NOT
 * monetized (monetizing a dimensionless quality estimate would be invented
 * precision); it is available to downstream consumers (§19 evaluation,
 * LAB-016 program search) as a declared dimension. Computed amounts are
 * quantized to 1e-10 for floating-point stability.
 * ```
 */
export const DELAY_DECISION_POLICY_V1: DelayDecisionPolicy = Object.freeze({
  id: 'mos-delay-decision-policy',
  version: 1,
  formula: 'ev-delay-1',
  formulaDocument: [
    'EV(option) = p × V − D − A',
    '  p = successProbability.probability (dimensionless, [0, 1])',
    '  V = expectedIncrementalValue.estimate.amount (money, currency C)',
    '  D = delayCost.perUnitTime.amount × (estimatedWait.waitMs / delayCost.unitMs) — the total delay cost over the estimated wait (money, C)',
    '  A = acquisitionCost.estimate.amount (money, C)',
    'Uncertainty (§22, the LAB-007/008 interval discipline):',
    '  EV.lower = p × V.interval.lower − D − A',
    '  EV.upper = p × V.interval.upper − D − A',
    'All money terms (V, D, A) must share ONE currency — a currency mismatch fails closed.',
    'Quality impact is carried as a declared dimension and is NOT monetized (never invented precision).',
    'Computed amounts are quantized to 1e-10 for floating-point stability.',
  ].join('\n'),
  ranking: Object.freeze({
    kind: 'uncertainty-aware-deterministic',
    primary: 'expected-value-of-delay-desc',
    tieBreakOne: 'interval-half-width-asc',
    tieBreakTwo: 'option-kind-asc',
  }),
  qualityImpactPolicy: 'carried-not-monetized',
  quantization: 'quantized-to-1e-10',
} satisfies DelayDecisionPolicy);

// ---------------------------------------------------------------------------
// The EV computation record (auditable term-by-term)
// ---------------------------------------------------------------------------

/** The exact term values the formula consumed (auditable, never implicit). */
export interface DelayEvTerms {
  /** p — the success probability term (dimensionless). */
  readonly successProbability: number;
  /** V — the expected incremental value term (money). */
  readonly expectedIncrementalValue: MoneyAmount;
  /** D — the TOTAL delay cost over the estimated wait (money). */
  readonly delayCost: MoneyAmount;
  /** A — the acquisition cost term (money). */
  readonly acquisitionCost: MoneyAmount;
}

/**
 * The expected value of delay computation for one option: the policy
 * snapshot (id + version + formula + verbatim document), the exact terms,
 * the point EV and the carried uncertainty interval (§22 discipline — the
 * point estimate always lies inside the interval).
 */
export interface DelayEvComputation {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly formula: 'ev-delay-1';
  /** The verbatim formula document of the policy that produced this. */
  readonly formulaDocument: string;
  readonly terms: DelayEvTerms;
  /** EV = p × V − D − A (money; the declared formula's point output). */
  readonly expectedValueOfDelay: MoneyAmount;
  /** Carried uncertainty interval on the EV (§22 — LAB-007/008 discipline). */
  readonly interval: PredictionInterval;
}
