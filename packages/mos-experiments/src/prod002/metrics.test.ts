import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFormula, isSupportedConfidenceLevel, normalMeanInterval, supportedConfidenceLevels, wilsonInterval } from './index.js';

test('wilson interval attaches an interval to a platform-said proportion (8/10 at 95%)', () => {
  const result = wilsonInterval(8, 10, 0.95);
  if (!result.ok) {
    assert.fail(`expected ok, got ${result.error.code}: ${result.error.message}`);
  }
  const estimate = result.value;
  assert.equal(estimate.point, 0.8);
  assert.equal(estimate.method, 'wilson-score');
  assert.equal(estimate.confidenceLevel, 0.95);
  assert.ok(estimate.lower < estimate.point && estimate.point < estimate.upper);
  assert.ok(estimate.lower > 0.489 && estimate.lower < 0.491, `lower ${estimate.lower}`);
  assert.ok(estimate.upper > 0.942 && estimate.upper < 0.944, `upper ${estimate.upper}`);
  assert.ok(estimate.lower >= 0 && estimate.upper <= 1);
});

test('wilson rejects zero trials with E_INSUFFICIENT_SAMPLE', () => {
  const result = wilsonInterval(1, 0, 0.95);
  if (result.ok) assert.fail('expected failure');
  assert.equal(result.error.code, 'E_INSUFFICIENT_SAMPLE');
});

test('wilson rejects successes outside [0, trials] with E_METRIC_DATA_MISMATCH', () => {
  const result = wilsonInterval(11, 10, 0.95);
  if (result.ok) assert.fail('expected failure');
  assert.equal(result.error.code, 'E_METRIC_DATA_MISMATCH');
});

test('wilson rejects unsupported confidence levels with E_UNSUPPORTED_CONFIDENCE', () => {
  const result = wilsonInterval(5, 10, 0.937);
  if (result.ok) assert.fail('expected failure');
  assert.equal(result.error.code, 'E_UNSUPPORTED_CONFIDENCE');
  assert.deepEqual(result.error.details.supported, supportedConfidenceLevels());
});

test('wilson at the zero-success edge stays within [0,1]', () => {
  const result = wilsonInterval(0, 10, 0.95);
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  assert.ok(result.value.lower < 0.001, `lower ${result.value.lower}`);
  assert.ok(result.value.upper > 0.2, `upper ${result.value.upper}`);
  assert.ok(result.value.upper <= 1);
});

test('normal-approximation mean interval over platform-said values', () => {
  const result = normalMeanInterval([1, 2, 3, 4, 5], 0.95);
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  const estimate = result.value;
  assert.equal(estimate.point, 3);
  assert.equal(estimate.method, 'normal-approximation');
  assert.ok(estimate.lower > 1.614 && estimate.lower < 1.6141, `lower ${estimate.lower}`);
  assert.ok(estimate.upper > 4.3859 && estimate.upper < 4.3861, `upper ${estimate.upper}`);
  assert.ok(estimate.lower < estimate.point && estimate.point < estimate.upper);
});

test('mean interval rejects samples below two with E_INSUFFICIENT_SAMPLE', () => {
  for (const values of [[5], []] as const) {
    const result = normalMeanInterval([...values], 0.95);
    if (result.ok) assert.fail('expected failure');
    assert.equal(result.error.code, 'E_INSUFFICIENT_SAMPLE');
  }
});

test('mean interval rejects non-finite values with E_METRIC_DATA_MISMATCH', () => {
  const result = normalMeanInterval([1, Number.NaN], 0.95);
  if (result.ok) assert.fail('expected failure');
  assert.equal(result.error.code, 'E_METRIC_DATA_MISMATCH');
});

test('zero-variance sample collapses the interval onto the point', () => {
  const result = normalMeanInterval([5, 5, 5], 0.95);
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  assert.equal(result.value.lower, 5);
  assert.equal(result.value.upper, 5);
});

test('formula registry: known refs resolve, unknown refs do not', () => {
  const proportion = findFormula('proportion.wilson@1');
  assert.ok(proportion !== null);
  assert.equal(proportion.family, 'proportion');
  assert.ok(findFormula('health.non-healthy-incidence.wilson@1') !== null);
  assert.ok(findFormula('made.up@1') === null);
});

test('supported confidence levels are explicit and closed', () => {
  assert.ok(supportedConfidenceLevels().length >= 5);
  assert.equal(isSupportedConfidenceLevel(0.95), true);
  assert.equal(isSupportedConfidenceLevel(0.937), false);
});
