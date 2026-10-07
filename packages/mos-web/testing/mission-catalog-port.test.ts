/**
 * MissionCatalogPort contract tests (UX-001) over the DISCLOSED composition
 * double, which adapts the REAL `@mos/missions` repository (CORE-005) into
 * the shell's presentation view models.
 *
 * These tests pin the VIEW-MODEL contract: what the Missions surface may
 * read (summaries, detail, reward vocabulary), what it may declare
 * (create-mission INTENT, recorded with a receipt — never executed), and
 * how the double fails closed (unknown + cross-tenant ids are the same
 * explicit miss; no existence leaks, spec §31).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MissionId, MissionRepository, MissionRewardSpec } from '@mos/missions';
import type { StrategyRef, TenantId } from '@mos/contracts';
import { createInMemoryMissionRepository } from '../../mos-missions/dist/index.js';
import { createInMemoryMissionCatalogPort, MISSION_LIFECYCLE_STATES } from './in-memory-mission-catalog.js';
import type { MissionDetailView, MissionSummaryView } from '../dist/src/ports/mission-catalog.js';

const tenantId = (value: string): TenantId => value as TenantId;
const missionId = (value: string): MissionId => value as MissionId;
const strategyRef = (value: string): StrategyRef => value as StrategyRef;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0);
  let tick = 0;
  return () => new Date(start + tick++ * 60_000).toISOString();
};

const rewardSpec = (version: number): MissionRewardSpec => ({
  version,
  terms: [
    {
      metric: 'qualified-reach',
      weight: 0.7,
      direction: 'maximize',
      definition: 'Reach among accounts matching the ICP filter, measured per platform.',
    },
    {
      metric: 'cost',
      weight: 0.3,
      direction: 'minimize',
      definition: 'Total spend including human and engine acquisition costs.',
    },
  ],
});

const objective = {
  statement:
    'Grow qualified reach of the developer audience in Q3. Do it without fatigue or rights risk.',
  targetMetrics: [
    { metric: 'qualified-reach' as const, target: '250000', unit: 'count', horizon: '2026-09-30' },
    { metric: 'cost' as const, target: '4000', unit: 'EUR', horizon: null },
  ],
  constraints: [
    { kind: 'budget' as const, description: 'Hard ceiling 5000 EUR total.' },
    { kind: 'rights' as const, description: 'Only content with explicit rights grants.' },
  ],
};

interface Fixture {
  readonly repository: MissionRepository;
  readonly port: ReturnType<typeof createInMemoryMissionCatalogPort>['port'];
  readonly recordedIntents: () => readonly unknown[];
}

const createFixture = (): Fixture => {
  const repository = createInMemoryMissionRepository({ now: createDeterministicClock() });
  const double = createInMemoryMissionCatalogPort({
    missionRepository: repository,
    // The double's intent receipts get their OWN deterministic clock (tick 0
    // = 2026-01-01T12:00:00.000Z) so receipt timestamps are pinned.
    now: createDeterministicClock(),
  });
  return { repository, port: double.port, recordedIntents: double.recordedIntents };
};

const seedMission = (fixture: Fixture, id: string, tenant = 'tenant-a'): string => {
  const result = fixture.repository.createMission({
    scope: { tenantId: tenantId(tenant) },
    id: missionId(id),
    objective,
    rewardSpec: rewardSpec(1),
    strategyRefs: [strategyRef('strategy://baseline-noop')],
  });
  if ('error' in result) {
    assert.fail(`fixture seed failed: ${result.error}`);
  }
  return id;
};

const expectSummaries = async (fixture: Fixture, tenant: string): Promise<MissionSummaryView[]> => {
  const result = await fixture.port.listMissionSummaries({ tenantId: tenantId(tenant) });
  if ('error' in result) {
    assert.fail(`unexpected catalog failure: ${result.error}`);
  }
  return [...result];
};

const expectDetail = async (
  fixture: Fixture,
  id: string,
  tenant: string,
): Promise<MissionDetailView> => {
  const result = await fixture.port.loadMissionDetail(missionId(id), {
    tenantId: tenantId(tenant),
  });
  if ('error' in result) {
    assert.fail(`unexpected catalog failure: ${result.error}`);
  }
  return result;
};

test('listMissionSummaries derives the latest visible records as view models', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1');
  seedMission(fixture, 'mission-2');
  const otherTenantMission = fixture.repository.createMission({
    scope: { tenantId: tenantId('tenant-b') },
    id: missionId('mission-b1'),
    objective,
    rewardSpec: rewardSpec(1),
  });
  if ('error' in otherTenantMission) {
    assert.fail('fixture seed failed');
  }

  const summaries = await expectSummaries(fixture, 'tenant-a');
  assert.equal(summaries.length, 2);
  const ids = summaries.map((summary) => summary.missionId).sort();
  assert.deepEqual(ids, ['mission-1', 'mission-2']);
});

test('a summary carries the presentation fields of the UX-001 list row', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1');
  const activated = fixture.repository.activateMission(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
  );
  if ('error' in activated) {
    assert.fail(`fixture transition failed: ${activated.error}`);
  }

  const summaries = await expectSummaries(fixture, 'tenant-a');
  const summary = summaries[0];
  if (!summary) {
    assert.fail('expected a summary');
  }
  assert.equal(summary.missionId, 'mission-1');
  assert.equal(summary.title, 'Grow qualified reach of the developer audience in Q3');
  assert.equal(summary.lifecycleState, 'active');
  assert.equal(summary.recordVersion, 2);
  assert.equal(summary.rewardSpecVersion, 1);
  assert.equal(summary.rewardSpecSummary, '2 reward terms · spec v1');
  assert.equal(summary.tenantId, tenantId('tenant-a'));
  assert.equal(summary.workspaceId, null);
  assert.equal(summary.updatedAt, activated.updatedAt);
});

test('every mission lifecycle state is a presentation vocabulary member', () => {
  assert.deepEqual(MISSION_LIFECYCLE_STATES, ['draft', 'active', 'completed', 'archived']);
});

test('loadMissionDetail reconstructs lifecycle transitions from the append-only history', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1');
  const activated = fixture.repository.activateMission(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
  );
  if ('error' in activated) {
    assert.fail('fixture transition failed');
  }
  const completed = fixture.repository.completeMission(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
  );
  if ('error' in completed) {
    assert.fail('fixture transition failed');
  }

  const detail = await expectDetail(fixture, 'mission-1', 'tenant-a');
  assert.deepEqual(
    detail.transitions.map((transition) => ({
      from: transition.fromState,
      to: transition.to,
      version: transition.recordVersion,
    })),
    [
      { from: 'created', to: 'draft', version: 1 },
      { from: 'draft', to: 'active', version: 2 },
      { from: 'active', to: 'completed', version: 3 },
    ],
  );
  assert.equal(detail.transitions[2]?.at, completed.updatedAt);
  assert.equal(detail.summary.lifecycleState, 'completed');
});

test('loadMissionDetail presents the objective, metrics, constraints and strategy refs', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1');

  const detail = await expectDetail(fixture, 'mission-1', 'tenant-a');
  assert.equal(detail.objectiveStatement, objective.statement);
  assert.deepEqual(
    detail.targetMetrics.map((metric) => ({
      metric: metric.metric,
      target: metric.target,
      unit: metric.unit,
      horizon: metric.horizon,
    })),
    [
      { metric: 'qualified-reach', target: '250000', unit: 'count', horizon: '2026-09-30' },
      { metric: 'cost', target: '4000', unit: 'EUR', horizon: null },
    ],
  );
  assert.deepEqual(
    detail.constraints.map((constraint) => ({
      kind: constraint.kind,
      description: constraint.description,
    })),
    [
      { kind: 'budget', description: 'Hard ceiling 5000 EUR total.' },
      { kind: 'rights', description: 'Only content with explicit rights grants.' },
    ],
  );
  assert.deepEqual(detail.strategyRefs, ['strategy://baseline-noop']);
});

test('reward spec versions are listed after updateRewardSpec — explicit and traceable', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1');
  const updated = fixture.repository.updateRewardSpec(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
    {
      version: 2,
      terms: [
        {
          metric: 'conversion',
          weight: 1,
          direction: 'maximize',
          definition: 'Qualified conversions only.',
        },
      ],
    },
  );
  if ('error' in updated) {
    assert.fail(`fixture reward update failed: ${updated.error}`);
  }

  const detail = await expectDetail(fixture, 'mission-1', 'tenant-a');
  assert.equal(detail.rewardSpecVersions.length, 2);
  assert.equal(detail.rewardSpecVersions[0]?.specVersion, 1);
  assert.equal(detail.rewardSpecVersions[0]?.terms.length, 2);
  assert.equal(detail.rewardSpecVersions[1]?.specVersion, 2);
  assert.equal(detail.rewardSpecVersions[1]?.terms[0]?.metric, 'conversion');
  assert.equal(detail.rewardSpecVersions[1]?.terms[0]?.direction, 'maximize');
  assert.equal(detail.rewardSpecVersions[1]?.terms[0]?.weight, 1);
  assert.equal(detail.summary.rewardSpecVersion, 2);
  assert.equal(detail.summary.rewardSpecSummary, '1 reward term · spec v2');
});

test('unknown and cross-tenant mission ids are the same explicit miss (no existence leak)', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1', 'tenant-a');

  const unknown = await fixture.port.loadMissionDetail(missionId('mission-unknown'), {
    tenantId: tenantId('tenant-a'),
  });
  assert.ok('error' in unknown);
  assert.equal(unknown.error, 'mission-not-found');
  assert.equal(unknown.message.length > 0, true);

  const crossTenant = await fixture.port.loadMissionDetail(missionId('mission-1'), {
    tenantId: tenantId('tenant-b'),
  });
  assert.ok('error' in crossTenant);
  assert.equal(crossTenant.error, 'mission-not-found');
  assert.equal(unknown.message.length > 0, true);
});

test('an unknown tenant scope lists nothing (empty, not an error, not a leak)', async () => {
  const fixture = createFixture();
  seedMission(fixture, 'mission-1');
  const summaries = await expectSummaries(fixture, 'tenant-unknown');
  assert.deepEqual(summaries, []);
});

test('loadRewardMetricVocabulary serves the domain reward metric vocabulary', async () => {
  const fixture = createFixture();
  const vocabulary = await fixture.port.loadRewardMetricVocabulary();
  if ('error' in vocabulary) {
    assert.fail(`unexpected vocabulary failure: ${vocabulary.error}`);
  }
  assert.equal(vocabulary.length >= 10, true);
  const ids = vocabulary.map((option) => option.id);
  for (const expected of ['qualified-reach', 'cost', 'revenue', 'rights-risk', 'fatigue']) {
    assert.equal(ids.includes(expected), true, `vocabulary must include ${expected}`);
  }
  for (const option of vocabulary) {
    assert.equal(option.label.length > 0, true);
  }
});

test('declareCreateMissionIntent records a receipt and does NOT create a mission', async () => {
  const fixture = createFixture();
  const before = await expectSummaries(fixture, 'tenant-a');
  assert.equal(before.length, 0);

  const receipt = await fixture.port.declareCreateMissionIntent({
    scope: { tenantId: tenantId('tenant-a') },
    objectiveStatement: 'Launch the MOS podcast pilot with clean rights.',
    rewardTerms: [
      {
        metric: 'qualified-reach',
        direction: 'maximize',
        weight: 1,
        definition: 'Reach among developer accounts matching the ICP filter.',
      },
    ],
  });
  if ('error' in receipt) {
    assert.fail(`unexpected declaration failure: ${receipt.error}`);
  }
  assert.equal(receipt.routedTo, 'missions-authority');
  assert.equal(receipt.intentId, 'intent-1');
  assert.equal(receipt.declaredAt, '2026-01-01T12:00:00.000Z');
  assert.equal(receipt.note.length > 0, true);

  // The double RECORDS the intent; executing it is the authority's job.
  const after = await expectSummaries(fixture, 'tenant-a');
  assert.equal(after.length, 0, 'declaring intent must not create a mission');
  const ledger = fixture.recordedIntents();
  assert.equal(ledger.length, 1);
});

test('the recorded intent ledger keeps the declaration payload for the authority', async () => {
  const fixture = createFixture();
  await fixture.port.declareCreateMissionIntent({
    scope: { tenantId: tenantId('tenant-a') },
    objectiveStatement: 'First objective.',
    rewardTerms: [
      { metric: 'revenue', direction: 'maximize', weight: 0.6, definition: 'Attributed revenue.' },
    ],
  });
  await fixture.port.declareCreateMissionIntent({
    scope: { tenantId: tenantId('tenant-a') },
    objectiveStatement: 'Second objective.',
    rewardTerms: [
      { metric: 'cost', direction: 'minimize', weight: 0.4, definition: 'Total spend.' },
    ],
  });

  const ledger = fixture.recordedIntents() as readonly {
    intentId: string;
    declaration: { objectiveStatement: string };
  }[];
  assert.deepEqual(ledger.map((entry) => entry.intentId), ['intent-1', 'intent-2']);
  assert.equal(ledger[0]?.declaration.objectiveStatement, 'First objective.');
  assert.equal(ledger[1]?.declaration.objectiveStatement, 'Second objective.');
});

test('intent receipts are loadable and tenant-scoped; unknown receipts are null', async () => {
  const fixture = createFixture();
  const receipt = await fixture.port.declareCreateMissionIntent({
    scope: { tenantId: tenantId('tenant-a') },
    objectiveStatement: 'Launch the pilot.',
    rewardTerms: [
      { metric: 'revenue', direction: 'maximize', weight: 1, definition: 'Attributed revenue.' },
    ],
  });
  if ('error' in receipt) {
    assert.fail('unexpected declaration failure');
  }

  const loaded = await fixture.port.loadCreateMissionIntentReceipt('intent-1', {
    tenantId: tenantId('tenant-a'),
  });
  assert.ok(loaded !== null && !('error' in loaded));
  assert.equal(loaded.intentId, 'intent-1');

  const crossTenant = await fixture.port.loadCreateMissionIntentReceipt('intent-1', {
    tenantId: tenantId('tenant-b'),
  });
  assert.equal(crossTenant, null, 'receipts never leak across tenants');

  const unknown = await fixture.port.loadCreateMissionIntentReceipt('intent-404', {
    tenantId: tenantId('tenant-a'),
  });
  assert.equal(unknown, null);
});

test('custom intent ids and clocks are injectable (deterministic tests)', async () => {
  const repository = createInMemoryMissionRepository({ now: createDeterministicClock() });
  const double = createInMemoryMissionCatalogPort({
    missionRepository: repository,
    now: () => '2027-01-01T00:00:00.000Z',
    nextIntentId: () => 'intent-fixed',
  });
  const receipt = await double.port.declareCreateMissionIntent({
    scope: { tenantId: tenantId('tenant-a') },
    objectiveStatement: 'Deterministic objective.',
    rewardTerms: [
      { metric: 'revenue', direction: 'maximize', weight: 1, definition: 'Attributed revenue.' },
    ],
  });
  if ('error' in receipt) {
    assert.fail('unexpected declaration failure');
  }
  assert.equal(receipt.intentId, 'intent-fixed');
  assert.equal(receipt.declaredAt, '2027-01-01T00:00:00.000Z');
});
