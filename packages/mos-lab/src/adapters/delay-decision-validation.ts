import type {
  DelayDecisionError,
} from '../contracts/delay-decision-port.js';
import type {
  DelayDimensionName,
  DelayEstimateDerivation,
  DelayDecisionModel,
  DelayOptionKind,
} from '../contracts/delay-economics.js';
import { isBlankString, isFiniteNonNegative, isPlainObject, isPositiveInteger, isUnitInterval } from './parametric-support.js';
import { DELAY_OPTION_KINDS } from '../contracts/delay-economics.js';

/**
 * INTERNAL structural validation for the LAB-015 delay decision surface —
 * part one: estimate provenance (the never-invented-precision gate), the
 * money/interval primitives and the SEVEN §18 tracked dimensions (the W6-A
 * shared-validator precedent — one validator, no drift). NOT exported from
 * the package index.
 *
 * Every failure is NAMED: dimension failures carry the §18 dimension name,
 * option failures carry the option kind. Estimates without provenance are
 * rejected (`estimate-without-provenance`) — never invented precision.
 */

/** INTERNAL: the failure shape (named dimension / option). */
export interface DelayValidationFailure {
  readonly error: DelayDecisionError['error'];
  readonly message: string;
  readonly dimension?: DelayDimensionName;
  readonly option?: DelayOptionKind;
}

/** INTERNAL: the failure builder (named dimension / option). */
export const delayValidationFail = (
  error: DelayDecisionError['error'],
  message: string,
  extra?: { dimension?: DelayDimensionName; option?: DelayOptionKind },
): DelayValidationFailure => ({ error, message, ...extra });

const fail = delayValidationFail;

// ---------------------------------------------------------------------------
// Estimate provenance (the never-invented-precision gate)
// ---------------------------------------------------------------------------

/** Validate one derivation record; `null` = valid. `label` names the estimate. */
export const derivationProblem = (
  derivation: unknown,
  label: string,
): { readonly message: string } | null => {
  if (!isPlainObject(derivation) || typeof derivation.kind !== 'string') {
    return { message: `${label} cites no derivation` };
  }
  if (derivation.kind === 'ensemble-output') {
    if (typeof derivation.ensembleId !== 'string' || isBlankString(derivation.ensembleId)) {
      return { message: 'an ensemble-output derivation must cite a non-blank ensemble id' };
    }
    if (!isPositiveInteger(derivation.ensembleVersion)) {
      return { message: 'an ensemble-output derivation must cite an exact ensemble version (integer >= 1)' };
    }
  }
  if (typeof derivation.note !== 'string' || isBlankString(derivation.note)) {
    return { message: `${label} must carry a non-blank note citing its derivation` };
  }
  if (
    derivation.kind !== 'ensemble-output' &&
    derivation.kind !== 'historical-observation' &&
    derivation.kind !== 'declared-assumption'
  ) {
    return {
      message: `the ${label} derivation kind must be ensemble-output | historical-observation | declared-assumption (got: ${String(derivation.kind)})`,
    };
  }
  return null;
};

/** Extract every ensemble-output derivation from a model (resolution input). */
export const ensembleDerivationsOf = (
  model: DelayDecisionModel,
): readonly { derivation: DelayEstimateDerivation; dimension: DelayDimensionName }[] => {
  const entries: { derivation: DelayEstimateDerivation; dimension: DelayDimensionName }[] = [
    { derivation: model.expectedIncrementalValue.derivation, dimension: 'expected-incremental-value' },
    { derivation: model.estimatedWait.derivation, dimension: 'estimated-wait' },
    { derivation: model.acquisitionCost.derivation, dimension: 'acquisition-cost' },
    { derivation: model.successProbability.derivation, dimension: 'success-probability' },
    { derivation: model.qualityImpact.derivation, dimension: 'quality-impact' },
  ];
  return entries.filter((entry) => entry.derivation.kind === 'ensemble-output');
};

// ---------------------------------------------------------------------------
// Money + interval primitives
// ---------------------------------------------------------------------------

const moneyProblem = (
  value: unknown,
  label: string,
  dimension: DelayDimensionName,
  option: DelayOptionKind,
  nonNegative: boolean,
): DelayValidationFailure | null => {
  if (!isPlainObject(value) || typeof value.amount !== 'number' || !Number.isFinite(value.amount)) {
    return fail('invalid-dimension', `${label} must be a finite money amount`, { dimension, option });
  }
  if (nonNegative && value.amount < 0) {
    return fail('invalid-dimension', `${label} must be >= 0 (a cost is never negative)`, { dimension, option });
  }
  if (typeof value.currency !== 'string' || isBlankString(value.currency)) {
    return fail('invalid-dimension', `${label} must carry a non-blank currency (ISO-4217)`, { dimension, option });
  }
  return null;
};

const intervalProblem = (
  interval: unknown,
  estimate: number,
  dimension: DelayDimensionName,
  option: DelayOptionKind,
): DelayValidationFailure | null => {
  if (!isPlainObject(interval)) {
    return fail('invalid-interval', `the ${dimension} uncertainty interval must be { lower, upper }`, { dimension, option });
  }
  const { lower, upper } = interval as { lower?: unknown; upper?: unknown };
  if (typeof lower !== 'number' || typeof upper !== 'number' || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    return fail('invalid-interval', 'the uncertainty interval bounds must be finite numbers', { dimension, option });
  }
  if (lower > upper) {
    return fail('invalid-interval', `the ${dimension} interval is inverted (lower > upper)`, { dimension, option });
  }
  if (estimate < lower || estimate > upper) {
    return fail('invalid-interval', `the ${dimension} point estimate must lie inside its interval`, { dimension, option });
  }
  return null;
};

// ---------------------------------------------------------------------------
// The seven tracked dimensions (named failures per dimension)
// ---------------------------------------------------------------------------

/**
 * Validate one option's complete §18 dimension model. `null` = valid. Each
 * failure names BOTH the option and the §18 dimension.
 */
export const dimensionModelProblem = (
  model: unknown,
  option: DelayOptionKind,
  contextRewardSpecVersion: number,
): DelayValidationFailure | null => {
  if (!isPlainObject(model)) {
    return fail('invalid-option-declaration', `the applicable option "${option}" declares no dimension model`, { option });
  }
  const record = model as Record<string, unknown>;

  // 1. expected incremental value
  if (!isPlainObject(record.expectedIncrementalValue)) {
    return fail('missing-dimension', 'the expected-incremental-value dimension is missing', { dimension: 'expected-incremental-value', option });
  }
  const value = record.expectedIncrementalValue as Record<string, unknown>;
  const valueMoney = moneyProblem(value.estimate, 'the expected incremental value estimate', 'expected-incremental-value', option, false);
  if (valueMoney !== null) {
    return valueMoney;
  }
  const valueEstimate = (value.estimate as { amount: number }).amount;
  const valueInterval = intervalProblem(value.interval, valueEstimate, 'expected-incremental-value', option);
  if (valueInterval !== null) {
    return valueInterval;
  }
  if (!isPositiveInteger(value.rewardSpecVersion)) {
    return fail('invalid-dimension', 'the expected incremental value must pin an integer reward spec version (>= 1)', { dimension: 'expected-incremental-value', option });
  }
  if (value.rewardSpecVersion !== contextRewardSpecVersion) {
    return fail('reward-spec-mismatch', `the expected incremental value is denominated in reward spec version ${String(value.rewardSpecVersion)} but the decision context pins ${String(contextRewardSpecVersion)}`, { dimension: 'expected-incremental-value', option });
  }
  const valueDerivation = derivationProblem(value.derivation, 'the expected-incremental-value estimate');
  if (valueDerivation !== null) {
    return fail('estimate-without-provenance', valueDerivation.message, { dimension: 'expected-incremental-value', option });
  }

  // 2. estimated wait
  if (!isPlainObject(record.estimatedWait)) {
    return fail('missing-dimension', 'the estimated-wait dimension is missing', { dimension: 'estimated-wait', option });
  }
  const wait = record.estimatedWait as Record<string, unknown>;
  if (!isFiniteNonNegative(wait.waitMs)) {
    return fail('invalid-dimension', 'the estimated wait must be a finite number of milliseconds >= 0', { dimension: 'estimated-wait', option });
  }
  const waitDerivation = derivationProblem(wait.derivation, 'the estimated-wait estimate');
  if (waitDerivation !== null) {
    return fail('estimate-without-provenance', waitDerivation.message, { dimension: 'estimated-wait', option });
  }

  // 3. delay cost
  if (!isPlainObject(record.delayCost)) {
    return fail('missing-dimension', 'the delay-cost dimension is missing', { dimension: 'delay-cost', option });
  }
  const delayCost = record.delayCost as Record<string, unknown>;
  const delayCostMoney = moneyProblem(delayCost.perUnitTime, 'the delay cost per unit time', 'delay-cost', option, true);
  if (delayCostMoney !== null) {
    return delayCostMoney;
  }
  if (typeof delayCost.unitMs !== 'number' || !Number.isFinite(delayCost.unitMs) || delayCost.unitMs <= 0) {
    return fail('invalid-dimension', 'the delay cost time unit must be a finite number of milliseconds > 0', { dimension: 'delay-cost', option });
  }
  if (!isPlainObject(delayCost.source) || typeof (delayCost.source as Record<string, unknown>).kind !== 'string' || isBlankString((delayCost.source as Record<string, unknown>).kind as string)) {
    return fail('invalid-dimension', 'the delay cost must declare its source kind', { dimension: 'delay-cost', option });
  }
  const source = delayCost.source as Record<string, unknown>;
  if (source.kind !== 'declared-budget' && source.kind !== 'historical-observation' && source.kind !== 'declared-assumption') {
    return fail('invalid-dimension', `the delay cost source kind must be declared-budget | historical-observation | declared-assumption (got: ${String(source.kind)})`, { dimension: 'delay-cost', option });
  }
  if (typeof source.note !== 'string' || isBlankString(source.note)) {
    return fail('invalid-dimension', 'the delay cost source must carry a non-blank note (a price is always cited, never silent)', { dimension: 'delay-cost', option });
  }

  // 4. acquisition cost
  if (!isPlainObject(record.acquisitionCost)) {
    return fail('missing-dimension', 'the acquisition-cost dimension is missing', { dimension: 'acquisition-cost', option });
  }
  const acquisition = record.acquisitionCost as Record<string, unknown>;
  if (acquisition.kind !== 'human-acquisition-cost' && acquisition.kind !== 'engine-acquisition-cost') {
    return fail('invalid-dimension', 'the acquisition cost kind must be human-acquisition-cost | engine-acquisition-cost (§21)', { dimension: 'acquisition-cost', option });
  }
  const acquisitionMoney = moneyProblem(acquisition.estimate, 'the acquisition cost estimate', 'acquisition-cost', option, true);
  if (acquisitionMoney !== null) {
    return acquisitionMoney;
  }
  const acquisitionDerivation = derivationProblem(acquisition.derivation, 'the acquisition-cost estimate');
  if (acquisitionDerivation !== null) {
    return fail('estimate-without-provenance', acquisitionDerivation.message, { dimension: 'acquisition-cost', option });
  }

  // 5. success probability
  if (!isPlainObject(record.successProbability)) {
    return fail('missing-dimension', 'the success-probability dimension is missing', { dimension: 'success-probability', option });
  }
  const probability = record.successProbability as Record<string, unknown>;
  if (!isUnitInterval(probability.probability)) {
    return fail('invalid-dimension', 'the success probability must be a finite number in [0, 1]', { dimension: 'success-probability', option });
  }
  const probabilityDerivation = derivationProblem(probability.derivation, 'the success-probability estimate');
  if (probabilityDerivation !== null) {
    return fail('estimate-without-provenance', probabilityDerivation.message, { dimension: 'success-probability', option });
  }

  // 6. quality impact
  if (!isPlainObject(record.qualityImpact)) {
    return fail('missing-dimension', 'the quality-impact dimension is missing', { dimension: 'quality-impact', option });
  }
  const quality = record.qualityImpact as Record<string, unknown>;
  if (typeof quality.declared !== 'number' || !Number.isFinite(quality.declared)) {
    return fail('invalid-dimension', 'the declared quality impact must be a finite signed number', { dimension: 'quality-impact', option });
  }
  const qualityDerivation = derivationProblem(quality.derivation, 'the quality-impact declaration');
  if (qualityDerivation !== null) {
    return fail('estimate-without-provenance', qualityDerivation.message, { dimension: 'quality-impact', option });
  }

  // 7. alternative paths
  if (!isPlainObject(record.alternativePaths)) {
    return fail('missing-dimension', 'the alternative-paths dimension is missing', { dimension: 'alternative-paths', option });
  }
  const alternativePaths = record.alternativePaths as Record<string, unknown>;
  if (!Array.isArray(alternativePaths.ordered)) {
    return fail('invalid-dimension', 'the alternative paths must be an ordered list of option references', { dimension: 'alternative-paths', option });
  }
  let previousOrder = 0;
  for (const entry of alternativePaths.ordered as unknown[]) {
    if (!isPlainObject(entry)) {
      return fail('invalid-dimension', 'every alternative path entry must be { order, optionKind }', { dimension: 'alternative-paths', option });
    }
    const ref = entry as Record<string, unknown>;
    const order = ref.order as number;
    if (!isPositiveInteger(order) || order <= previousOrder) {
      return fail('invalid-dimension', 'alternative path orders must be 1-based and strictly ascending', { dimension: 'alternative-paths', option });
    }
    previousOrder = order;
    if (typeof ref.optionKind !== 'string' || !DELAY_OPTION_KINDS.includes(ref.optionKind as DelayOptionKind)) {
      return fail('invalid-dimension', `an alternative path references an unknown option kind: ${String(ref.optionKind)}`, { dimension: 'alternative-paths', option });
    }
    if (ref.optionKind === option) {
      return fail('invalid-dimension', 'an alternative path may never reference the declaring option itself', { dimension: 'alternative-paths', option });
    }
  }

  // Currency consistency across the money terms (V, D, A — ONE currency;
  // a mismatch never invents an exchange rate)
  const currency = (value.estimate as { currency: string }).currency;
  const delayCurrency = (delayCost.perUnitTime as { currency: string }).currency;
  const acquisitionCurrency = (acquisition.estimate as { currency: string }).currency;
  if (delayCurrency !== currency || acquisitionCurrency !== currency) {
    return fail(
      'currency-mismatch',
      `the option "${option}" mixes currencies (${currency} / ${delayCurrency} / ${acquisitionCurrency}) — every money term must share ONE currency`,
      { option },
    );
  }
  return null;
};

