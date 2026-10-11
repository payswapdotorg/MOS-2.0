/** PROD-003 — §18 Expected Value of Delay from declared inputs only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, FIXED_NOW } from './fixtures.js';
import { deriveExecutionPhases } from '../strategy-compiler/phases.js';
import { computeExpectedValueOfDelay } from '../strategy-compiler/evd.js';

test('EVD is computed from declared durations and delay policy', () => {
  const plan = makePlan();
  const phases = deriveExecutionPhases(plan, 1);
  const computation = computeExpectedValueOfDelay(plan, phases, FIXED_NOW);
  assert.ok(computation !== undefined);
  if (computation === undefined) return;
  assert.equal(computation.evd.currency, 'USD');
  assert.equal(computation.evd.perDayDelayCost, 40);
  assert.equal(computation.evd.orderingBasis, 'evd-weighted');
  assert.ok(computation.evd.rationale.includes('no estimated numbers are invented'));
  // The fixture's video chain (3 produce + 1 review days) finishes far before
  // the 2030 platform deadline: zero expected delay on the happy fixture.
  assert.equal(computation.evd.totalExpectedDelayCost, 0);
  for (const entry of computation.evd.pressure) {
    assert.equal(entry.expectedDelayDays, 0);
    assert.equal(entry.expectedDelayCost, 0);
  }
});

test('EVD surfaces positive delay cost when a deadline is tight', () => {
  const plan = makePlan({
    deadlines: [{ deadlineId: 'video-due', dueAt: '2026-01-02T00:00:00.000Z', scope: 'platform', platformId: 'platform-video' }],
    delayPolicy: { currency: 'USD', perDayDelayCost: 40, haltOnDeadlinePassed: true },
  });
  const phases = deriveExecutionPhases(plan, 1);
  const computation = computeExpectedValueOfDelay(plan, phases, FIXED_NOW);
  assert.ok(computation !== undefined);
  if (computation === undefined) return;
  // Both the produce and publish phases of the video chain carry the platform
  // deadline: produce finishes day 3 (2 days late), publish day 4 (3 days late)
  // → (2 + 3) days × 40 = 200.
  assert.equal(computation.evd.totalExpectedDelayCost, 200);
  const producePressure = computation.evd.pressure.find((p) => p.phaseId === 'produce:platform-video');
  assert.ok(producePressure !== undefined);
  assert.equal(producePressure?.expectedDelayDays, 2);
  const videoPressure = computation.evd.pressure.find((p) => p.phaseId === 'publish:platform-video');
  assert.ok(videoPressure !== undefined);
  assert.equal(videoPressure?.expectedDelayDays, 3);
});

test('no deadlines → no EVD computation', () => {
  const plan = makePlan({ deadlines: [] });
  const phases = deriveExecutionPhases(plan, 1);
  assert.equal(computeExpectedValueOfDelay(plan, phases, FIXED_NOW), undefined);
});
