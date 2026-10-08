import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Timestamp } from '@mos/contracts';
import { createTimeMachineRealityReader } from './time-machine-reality-reader.js';
import { createInMemoryTimeMachine } from './in-memory-time-machine.js';
import type { HistoricalObservationId } from '../contracts/evidence.js';
import {
  FIXED_NOW,
  observationDraft,
  scopeOf,
  timeMachineWith,
} from '../testing/w4a-lab-fixtures.js';

const AS_OF_LATE = '2026-07-01T00:00:00.000Z' as Timestamp;
const AS_OF_EARLY = '2026-06-21T00:00:00.000Z' as Timestamp;

const observationId = (value: string): HistoricalObservationId => value as HistoricalObservationId;

// ---------------------------------------------------------------------------
// The real-surface composition adapter over the LAB-006 mode-1 replay
// ---------------------------------------------------------------------------

test('an observation on the timeline resolves when observedAt <= asOf', async () => {
  const machine = await timeMachineWith([
    { id: 'r1', observedAt: '2026-06-20T00:00:00.000Z', metrics: [{ metric: 'qualified-reach', value: 100, unit: 'people' }] },
    { id: 'r2', observedAt: '2026-06-22T00:00:00.000Z', metrics: [{ metric: 'qualified-reach', value: 200, unit: 'people' }] },
  ]);
  const reader = createTimeMachineRealityReader({ machine, asOf: AS_OF_LATE });

  const first = await reader.getObservation(scopeOf('tenant-a'), observationId('obs-r1'));
  assert.notEqual(first, null);
  assert.equal(first?.id, observationId('obs-r1'));
  assert.equal(first?.counterfactual, false);
  assert.deepEqual(first?.metrics, [{ metric: 'qualified-reach', value: 100, unit: 'people' }]);
  assert.equal(first?.regime, 'baseline');

  const second = await reader.getObservation(scopeOf('tenant-a'), observationId('obs-r2'));
  assert.notEqual(second, null);
  assert.equal(second?.counterfactual, false);
});

test('a FUTURE observation never resolves (observedAt > asOf → null, no leak)', async () => {
  const machine = await timeMachineWith([
    { id: 'r2', observedAt: '2026-06-22T00:00:00.000Z', metrics: [{ metric: 'qualified-reach', value: 200, unit: 'people' }] },
  ]);
  const reader = createTimeMachineRealityReader({ machine, asOf: AS_OF_EARLY });

  const observation = await reader.getObservation(scopeOf('tenant-a'), observationId('obs-r2'));
  assert.equal(observation, null);
});

test('unknown ids and foreign tenants resolve null (no existence leak)', async () => {
  const machine = await timeMachineWith([
    { id: 'r1', observedAt: '2026-06-20T00:00:00.000Z', metrics: [{ metric: 'qualified-reach', value: 100, unit: 'people' }] },
  ]);
  const reader = createTimeMachineRealityReader({ machine, asOf: AS_OF_LATE });

  assert.equal(
    await reader.getObservation(scopeOf('tenant-a'), observationId('obs-void')),
    null,
  );
  assert.equal(
    await reader.getObservation(scopeOf('tenant-b'), observationId('obs-r1')),
    null,
  );
});

test('the reader serves the machine OWN frozen records (bit-for-bit immutable)', async () => {
  const machine = createInMemoryTimeMachine({ now: FIXED_NOW });
  const appended = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-a'),
    observation: observationDraft('r1', '2026-06-20T00:00:00.000Z', [
      { metric: 'qualified-reach', value: 120, unit: 'people' },
    ]),
  });
  if ('error' in appended) {
    assert.fail(`unexpected append error: ${appended.error}`);
  }

  const reader = createTimeMachineRealityReader({ machine, asOf: AS_OF_LATE });
  const served = await reader.getObservation(scopeOf('tenant-a'), observationId('obs-r1'));
  assert.notEqual(served, null);
  assert.deepEqual(served, appended);
  assert.equal(Object.isFrozen(served), true);
  assert.throws(() => {
    (
      served as unknown as {
        metrics: { metric: string; value: number; unit: string }[];
      }
    ).metrics.push({
      metric: 'forged',
      value: 1,
      unit: 'people',
    });
  }, TypeError);
});
