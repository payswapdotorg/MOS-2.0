import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryTimeMachine } from './in-memory-time-machine.js';
import type {
  HistoricalObservationDraft,
  TimeMachinePort,
} from '../contracts/time-machine.js';
import type {
  HistoricalObservation,
  HistoricalObservationId,
} from '../contracts/evidence.js';
import type { TenantId, TenantScope, Timestamp } from '@mos/contracts';

const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenant as TenantId });
const timestamp = (value: string): Timestamp => value as Timestamp;
const observationId = (value: string): HistoricalObservationId => value as HistoricalObservationId;

const FIXED_NOW = (): Timestamp => timestamp('2026-06-15T12:00:00.000Z');
const DAY = 86_400_000;

/** ADVERSARIAL fixture: observations appended in SHUFFLED time order. */
const T0 = '2026-06-01T00:00:00.000Z';
const T1 = '2026-06-05T00:00:00.000Z';
const T2 = '2026-06-10T00:00:00.000Z';
const T2_PLUS_1MS = '2026-06-10T00:00:00.001Z'; // 1 ms after the T-L cutoff
const T3 = '2026-06-15T00:00:00.000Z';
const T4 = '2026-06-20T00:00:00.000Z';
/** Append order deliberately shuffled: [T3, T0, T4, T1, T2+1ms, T2]. */
const APPEND_ORDER: readonly string[] = [T3, T0, T4, T1, T2_PLUS_1MS, T2];

const draft = (id: string, observedAt: string): HistoricalObservationDraft => ({
  id: observationId(`obs-${id}`),
  niche: 'sourdough-baking',
  platform: 'short-video',
  metrics: [
    {
      metric: 'qualified-reach',
      value: 1_000 + (id.charCodeAt(id.length - 1) % 13),
      unit: 'people',
    },
  ],
  observedAt: timestamp(observedAt),
  sourceRefs: [`src://platform/analytics/${id}`],
  regime: 'baseline',
});

const machineWithTimeline = async () => {
  const machine = createInMemoryTimeMachine({ now: FIXED_NOW });
  for (const observedAt of APPEND_ORDER) {
    const id = observedAt.slice(0, 19).replaceAll(/[T:-]/g, '') + observedAt.slice(20, 23);
    const result = await machine.appendHistoricalObservation({
      scope: scopeOf('tenant-a'),
      observation: draft(id, observedAt),
    });
    if ('error' in result) {
      assert.fail(`unexpected append error: ${result.error}`);
    }
  }
  return machine;
};

const asArray = (result: readonly HistoricalObservation[] | { error: string }): readonly HistoricalObservation[] => {
  if ('error' in result && !Array.isArray(result)) {
    assert.fail(`unexpected replay error: ${String(result.error)}`);
  }
  return result as readonly HistoricalObservation[];
};

// ---------------------------------------------------------------------------
// Historical timeline: append-only + immutable
// ---------------------------------------------------------------------------

test('historical timeline: append assigns version/tenant, duplicates rejected, records FROZEN', async () => {
  const machine = await machineWithTimeline();
  const first = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-a'),
    observation: draft('dup', T0),
  });
  assert.ok(!('error' in first));
  assert.equal(first.version, 1);
  assert.equal(first.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(first.counterfactual, false, 'LOCK 29: timeline records are never counterfactual');

  const duplicate = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-a'),
    observation: draft('dup', T0),
  });
  assert.ok('error' in duplicate && duplicate.error === 'duplicate-observation');

  // APPEND-ONLY + IMMUTABLE (test-pinned): stored records are deep-frozen —
  // even in-memory mutation attempts throw in strict-mode ESM.
  assert.throws(() => {
    (first as unknown as { niche: string }).niche = 'tampered';
  }, TypeError);
  assert.throws(() => {
    (first.metrics as unknown as { push: (value: unknown) => void }).push({ metric: 'x' });
  }, TypeError);
  assert.equal(first.niche, 'sourdough-baking');
});

test('the Time Machine port exposes NO method that can rewrite or remove history (structural immutability)', () => {
  const machine = createInMemoryTimeMachine();
  const surface = Object.keys(machine) as (keyof TimeMachinePort)[];
  assert.deepEqual([...surface].sort(), [
    'appendHistoricalObservation',
    'createBranch',
    'getBranch',
    'getBranchRecords',
    'listBranches',
    'recordBranchPrediction',
    'replayDelayedInformation',
    'replayHistorical',
  ]);
  assert.equal(surface.length, 8);
  assert.ok(surface.length <= 12, 'architecture policy: maxPublicMethods');
  for (const method of surface) {
    assert.ok(
      !/update|delete|remove|rewrite|mutate|edit|patch/i.test(String(method)),
      `history-mutating method name forbidden on the Time Machine surface: ${String(method)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// MODE 1: historical replay (≤ T only)
// ---------------------------------------------------------------------------

test('MODE 1 historical replay: serves strictly observations ≤ T, ascending, append order irrelevant', async () => {
  const machine = await machineWithTimeline();
  const atT2 = asArray(
    await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T2) }),
  );
  assert.deepEqual(
    atT2.map((observation) => observation.observedAt),
    [T0, T1, T2],
    'replay at T2 sees exactly the observations at or before T2 — never T2+1ms/T3/T4',
  );
  const atT1 = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T1) }));
  assert.deepEqual(atT1.map((observation) => observation.observedAt), [T0, T1]);
  const beforeAll = asArray(
    await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp('2026-05-01T00:00:00.000Z') }),
  );
  assert.deepEqual(beforeAll, []);
  // Filters + limit compose with the cutoff.
  const limited = asArray(
    await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T4), limit: 2 }),
  );
  assert.equal(limited.length, 2);
});

// ---------------------------------------------------------------------------
// MODE 2: delayed-information replay (LEAKAGE PREVENTION, adversarial)
// ---------------------------------------------------------------------------

test('MODE 2 delayed replay (LEAKAGE PREVENTION): nothing newer than T-L is ever visible', async () => {
  const machine = await machineWithTimeline();
  // T = 2026-06-15, L = 5 days → cutoff = 2026-06-10 (T2). The T2+1ms record
  // is an ADVERSARIAL boundary probe one millisecond past the cutoff.
  const visible = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-a'), {
      asOf: timestamp(T3),
      lagMs: 5 * DAY,
    }),
  );
  assert.deepEqual(
    visible.map((observation) => observation.observedAt),
    [T0, T1, T2],
    'visible set is exactly the records available BY T-L (inclusive cutoff, no 1ms leak)',
  );
  for (const observation of visible) {
    assert.ok(Date.parse(observation.observedAt) <= Date.parse(T3) - 5 * DAY);
  }

  // Every observation strictly newer than T-L must be invisible — checked
  // across a sweep of lag values (adversarial: append order is shuffled).
  for (const lagDays of [0, 1, 3, 5, 9, 14, 30]) {
    const sweep = asArray(
      await machine.replayDelayedInformation(scopeOf('tenant-a'), {
        asOf: timestamp(T3),
        lagMs: lagDays * DAY,
      }),
    );
    const cutoff = Date.parse(T3) - lagDays * DAY;
    for (const observation of sweep) {
      assert.ok(
        Date.parse(observation.observedAt) <= cutoff,
        `leakage: observation at ${observation.observedAt} visible under lag ${lagDays}d (cutoff ${new Date(cutoff).toISOString()})`,
      );
    }
  }

  // lag 0 degenerates to exact historical replay at T.
  const zeroLag = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-a'), { asOf: timestamp(T3), lagMs: 0 }),
  );
  const plain = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T3) }));
  assert.deepEqual(zeroLag, plain);
  // A lag exceeding all history hides everything.
  const hugeLag = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-a'), { asOf: timestamp(T3), lagMs: 365 * DAY }),
  );
  assert.deepEqual(hugeLag, []);
});

test('MODE 2 rejects malformed queries fail-closed (negative lag, bad asOf)', async () => {
  const machine = await machineWithTimeline();
  const negativeLag = await machine.replayDelayedInformation(scopeOf('tenant-a'), {
    asOf: timestamp(T3),
    lagMs: -1,
  });
  assert.ok('error' in negativeLag && negativeLag.error === 'invalid-input');
  const badAsOf = await machine.replayDelayedInformation(scopeOf('tenant-a'), {
    asOf: timestamp('not-a-timestamp'),
    lagMs: 0,
  });
  assert.ok('error' in badAsOf && badAsOf.error === 'invalid-input');
  const badLimit = await machine.replayHistorical(scopeOf('tenant-a'), {
    asOf: timestamp(T3),
    limit: 0,
  });
  assert.ok('error' in badLimit && badLimit.error === 'invalid-input');
});

// ---------------------------------------------------------------------------
// Tenant scoping + draft validation
// ---------------------------------------------------------------------------

test('tenant scoping: foreign tenants observe an empty timeline (no existence leak)', async () => {
  const machine = await machineWithTimeline();
  const foreign = asArray(
    await machine.replayHistorical(scopeOf('tenant-b'), { asOf: timestamp(T4) }),
  );
  assert.deepEqual(foreign, []);
  const foreignDelayed = asArray(
    await machine.replayDelayedInformation(scopeOf('tenant-b'), { asOf: timestamp(T4), lagMs: DAY }),
  );
  assert.deepEqual(foreignDelayed, []);
  // Appending under tenant-b does not disturb tenant-a's timeline.
  const appended = await machine.appendHistoricalObservation({
    scope: scopeOf('tenant-b'),
    observation: draft('tenant-b-only', T1),
  });
  assert.ok(!('error' in appended));
  const stillSix = asArray(await machine.replayHistorical(scopeOf('tenant-a'), { asOf: timestamp(T4) }));
  assert.equal(stillSix.length, APPEND_ORDER.length);
  const tenantBSeesOwn = asArray(await machine.replayHistorical(scopeOf('tenant-b'), { asOf: timestamp(T4) }));
  assert.deepEqual(tenantBSeesOwn.map((observation) => observation.observedAt), [T1]);
});

test('observation drafts validate fail-closed (metrics, sources, timestamp, regime)', async () => {
  const machine = createInMemoryTimeMachine();
  const cases: readonly Partial<HistoricalObservationDraft>[] = [
    { metrics: [] },
    { metrics: [{ metric: '', value: 1, unit: 'people' }] },
    { metrics: [{ metric: 'reach', value: Number.POSITIVE_INFINITY, unit: 'people' }] },
    { sourceRefs: [] },
    { sourceRefs: [''] },
    { observedAt: timestamp('soon') },
    { regime: '' },
  ];
  for (const overrides of cases) {
    const result = await machine.appendHistoricalObservation({
      scope: scopeOf('tenant-a'),
      observation: { ...draft('bad', T0), ...overrides } as HistoricalObservationDraft,
    });
    assert.ok('error' in result && result.error === 'invalid-input', `draft ${JSON.stringify(overrides)} must be rejected`);
  }
});
