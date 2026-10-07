import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryMissionRepository } from './in-memory-mission-repository.js';
import type { MissionRepository } from '../ports/mission-repository.js';
import type { MissionId, Mission, MissionRewardSpec } from '../domain/mission.js';
import type { StrategyRef, TenantId } from '@mos/contracts';

const tenantId = (value: string): TenantId => value as TenantId;
const missionId = (value: string): MissionId => value as MissionId;
const strategyRef = (value: string): StrategyRef => value as StrategyRef;

const createDeterministicClock = (): (() => string) => {
  const start = Date.UTC(2026, 0, 1);
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
};

const rewardSpec = (version: number): MissionRewardSpec => ({
  version,
  terms: [
    {
      metric: 'business-outcome',
      weight: 0.5,
      direction: 'maximize',
      definition: 'Signed-plan conversions attributed to the campaign, deduplicated by account.',
    },
    {
      metric: 'qualified-reach',
      weight: 0.3,
      direction: 'maximize',
      definition: 'Reach among accounts matching the ICP filter, measured per platform.',
    },
    {
      metric: 'cost',
      weight: 0.2,
      direction: 'minimize',
      definition: 'Total spend including human and engine acquisition costs.',
    },
  ],
});

const objective = {
  statement: 'Grow qualified signups for the Q4 podcast editing pilot',
  targetMetrics: [
    { metric: 'conversion' as const, target: '250', unit: 'count', horizon: '2026-12-31' },
    { metric: 'cost' as const, target: '4000', unit: 'EUR', horizon: null },
  ],
  constraints: [
    { kind: 'budget' as const, description: 'Hard ceiling 5000 EUR total.' },
    { kind: 'rights' as const, description: 'Only content with explicit rights grants.' },
  ],
};

const createInput = (overrides: { id?: string; tenant?: string } = {}) => ({
  scope: { tenantId: tenantId(overrides.tenant ?? 'tenant-a') },
  id: missionId(overrides.id ?? 'mission-1'),
  objective,
  rewardSpec: rewardSpec(1),
  strategyRefs: [strategyRef('strategy://baseline-noop'), strategyRef('strategy://clip-compilation')],
});

const expectMission = (result: Mission | { error: string }): Mission => {
  if ('error' in result) {
    assert.fail(`unexpected repository error: ${result.error}`);
  }
  return result;
};

test('createMission returns a frozen draft mission with structured objective + rewardSpec', () => {
  const repo: MissionRepository = createInMemoryMissionRepository({
    now: createDeterministicClock(),
  });
  const mission = expectMission(repo.createMission(createInput()));

  assert.equal(mission.id, missionId('mission-1'));
  assert.equal(mission.tenantId, tenantId('tenant-a'));
  assert.equal(mission.version, 1);
  assert.equal(mission.status, 'draft');
  assert.equal(mission.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(mission.updatedAt, '2026-01-01T00:00:00.000Z');

  // Structured objective (statement + target metrics + constraints) preserved.
  assert.equal(mission.objective.statement, objective.statement);
  assert.deepEqual(mission.objective.targetMetrics, objective.targetMetrics);
  assert.deepEqual(mission.objective.constraints, objective.constraints);

  // Mission-specific multi-term versioned rewardSpec (§21) preserved.
  assert.equal(mission.rewardSpec.version, 1);
  assert.equal(mission.rewardSpec.terms.length, 3);
  assert.equal(mission.rewardSpec.terms[2]?.metric, 'cost');
  assert.equal(mission.rewardSpec.terms[2]?.direction, 'minimize');

  assert.deepEqual(mission.strategyRefs, ['strategy://baseline-noop', 'strategy://clip-compilation']);

  // Frozen at every level.
  assert.ok(Object.isFrozen(mission));
  assert.ok(Object.isFrozen(mission.objective));
  assert.ok(Object.isFrozen(mission.objective.targetMetrics));
  assert.ok(Object.isFrozen(mission.rewardSpec));
  assert.ok(Object.isFrozen(mission.rewardSpec.terms));
  assert.ok(Object.isFrozen(mission.strategyRefs));
});

test('createMission rejects malformed objectives and reward specs', () => {
  const repo = createInMemoryMissionRepository();

  const blankStatement = repo.createMission({
    ...createInput(),
    objective: { ...objective, statement: '   ' },
  });
  assert.ok('error' in blankStatement && blankStatement.error === 'invalid-input');

  const noMetrics = repo.createMission({
    ...createInput(),
    objective: { ...objective, targetMetrics: [] },
  });
  assert.ok('error' in noMetrics && noMetrics.error === 'invalid-input');

  const noTerms = repo.createMission({
    ...createInput(),
    rewardSpec: { version: 1, terms: [] },
  });
  assert.ok('error' in noTerms && noTerms.error === 'invalid-input');

  const noDefinition = repo.createMission({
    ...createInput(),
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'quality', weight: 1, direction: 'maximize', definition: ' ' }],
    },
  });
  assert.ok('error' in noDefinition && noDefinition.error === 'invalid-input');

  const wrongStartVersion = repo.createMission({
    ...createInput(),
    rewardSpec: rewardSpec(2),
  });
  assert.ok('error' in wrongStartVersion && wrongStartVersion.error === 'invalid-input');

  const duplicate = repo.createMission(createInput());
  assert.ok(!('error' in duplicate));
  const dupAgain = repo.createMission(createInput());
  assert.ok('error' in dupAgain && dupAgain.error === 'duplicate-mission');
});

test('full lifecycle draft→active→completed→archived bumps version at every step', () => {
  const repo = createInMemoryMissionRepository({ now: createDeterministicClock() });
  const created = expectMission(repo.createMission(createInput()));
  const draftSnapshot = { ...created };

  const active = expectMission(repo.activateMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1')));
  assert.equal(active.status, 'active');
  assert.equal(active.version, 2);
  assert.equal(active.updatedAt, '2026-01-01T00:00:01.000Z');

  const completed = expectMission(
    repo.completeMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1')),
  );
  assert.equal(completed.status, 'completed');
  assert.equal(completed.version, 3);

  const archived = expectMission(
    repo.archiveMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1')),
  );
  assert.equal(archived.status, 'archived');
  assert.equal(archived.version, 4);

  // History is append-only: every prior record version stays retrievable and
  // byte-identical to its snapshot.
  const v1 = repo.getMission(missionId('mission-1'), 1);
  assert.ok(v1 !== null);
  assert.deepEqual(v1, draftSnapshot);
  assert.equal(v1.status, 'draft');
  for (const [version, status] of [
    [2, 'active'],
    [3, 'completed'],
    [4, 'archived'],
  ] as const) {
    const record = repo.getMission(missionId('mission-1'), version);
    assert.ok(record !== null);
    assert.equal(record.status, status);
  }
  const latest = repo.getMission(missionId('mission-1'));
  assert.ok(latest !== null && latest.version === 4);
  assert.equal(repo.getMission(missionId('mission-1'), 99), null);
});

test('invalid transitions are rejected (no skips, no backs, no re-runs)', () => {
  const repo = createInMemoryMissionRepository();
  assert.ok(!('error' in repo.createMission(createInput())));

  // draft → completed directly is a skip.
  const skip = repo.completeMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1'));
  assert.ok('error' in skip && skip.error === 'invalid-status-transition');

  // draft → archived directly is a skip.
  const skipArchive = repo.archiveMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1'));
  assert.ok('error' in skipArchive && skipArchive.error === 'invalid-status-transition');

  assert.ok(
    !('error' in repo.activateMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1'))),
  );
  // active → active is not a valid transition.
  const reActivate = repo.activateMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1'));
  assert.ok('error' in reActivate && reActivate.error === 'invalid-status-transition');

  // active → archived directly is a skip.
  const skipFromActive = repo.archiveMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1'));
  assert.ok('error' in skipFromActive && skipFromActive.error === 'invalid-status-transition');

  // Unknown mission.
  const unknown = repo.activateMission({ tenantId: tenantId('tenant-a') }, missionId('ghost'));
  assert.ok('error' in unknown && unknown.error === 'mission-not-found');
});

test('rewardSpec updates are draft-only and advance exactly one version', () => {
  const repo = createInMemoryMissionRepository({ now: createDeterministicClock() });
  expectMission(repo.createMission(createInput()));

  const updated = expectMission(
    repo.updateRewardSpec({ tenantId: tenantId('tenant-a') }, missionId('mission-1'), rewardSpec(2)),
  );
  assert.equal(updated.version, 2); // mission record version bumped…
  assert.equal(updated.rewardSpec.version, 2); // …and spec version moved 1 → 2.
  assert.equal(updated.status, 'draft');

  // Skipping a spec version is rejected.
  const skip = repo.updateRewardSpec(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
    rewardSpec(4),
  );
  assert.ok('error' in skip && skip.error === 'invalid-input');

  // Re-submitting the same spec version is rejected.
  const same = repo.updateRewardSpec(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
    rewardSpec(2),
  );
  assert.ok('error' in same && same.error === 'invalid-input');

  // After activation the mission is not editable.
  expectMission(repo.activateMission({ tenantId: tenantId('tenant-a') }, missionId('mission-1')));
  const locked = repo.updateRewardSpec(
    { tenantId: tenantId('tenant-a') },
    missionId('mission-1'),
    rewardSpec(3),
  );
  assert.ok('error' in locked && locked.error === 'mission-not-editable');
});

test('tenant scoping: mutations are cross-tenant-denied; lists never leak', () => {
  const repo = createInMemoryMissionRepository();
  expectMission(repo.createMission(createInput({ tenant: 'tenant-a', id: 'm-a' })));
  expectMission(repo.createMission(createInput({ tenant: 'tenant-b', id: 'm-b' })));

  const cross = repo.activateMission({ tenantId: tenantId('tenant-b') }, missionId('m-a'));
  assert.ok('error' in cross && cross.error === 'cross-tenant-reference');

  const crossSpec = repo.updateRewardSpec(
    { tenantId: tenantId('tenant-b') },
    missionId('m-a'),
    rewardSpec(2),
  );
  assert.ok('error' in crossSpec && crossSpec.error === 'cross-tenant-reference');

  // The failed cross-tenant attempt changed nothing.
  const untouched = repo.getMission(missionId('m-a'));
  assert.ok(untouched !== null && untouched.status === 'draft' && untouched.version === 1);

  const listA = repo.listMissions({ tenantId: tenantId('tenant-a') });
  const listB = repo.listMissions({ tenantId: tenantId('tenant-b') });
  const listUnknown = repo.listMissions({ tenantId: tenantId('tenant-unknown') });
  assert.deepEqual(listA.map((m) => m.id), [missionId('m-a')]);
  assert.deepEqual(listB.map((m) => m.id), [missionId('m-b')]);
  assert.deepEqual(listUnknown, []);

  // getMission returns records regardless of caller scope by design (reads
  // stay global-by-id with null misses — same convention as @mos/identity);
  // cross-tenant protection applies to MUTATIONS and list queries.
  const bMission = repo.getMission(missionId('m-b'));
  assert.ok(bMission !== null);
  const tenant: TenantId = bMission.tenantId;
  assert.equal(tenant, tenantId('tenant-b'));
});

test('the port exposes exactly the declared method set (no delete/update backdoors)', () => {
  const repo = createInMemoryMissionRepository();
  assert.deepEqual(Object.keys(repo).sort(), [
    'activateMission',
    'archiveMission',
    'completeMission',
    'createMission',
    'getMission',
    'listMissions',
    'updateRewardSpec',
  ]);
});

test('strategy refs default to empty and are preserved when provided', () => {
  const repo = createInMemoryMissionRepository();
  const withoutRefs = expectMission(
    repo.createMission({
      scope: { tenantId: tenantId('tenant-a') },
      id: missionId('mission-nostrat'),
      objective,
      rewardSpec: rewardSpec(1),
    }),
  );
  assert.deepEqual(withoutRefs.strategyRefs, []);

  const withRefs = expectMission(
    repo.createMission({
      scope: { tenantId: tenantId('tenant-a') },
      id: missionId('mission-strat'),
      objective,
      rewardSpec: rewardSpec(1),
      strategyRefs: [strategyRef('strategy://x')],
    }),
  );
  assert.deepEqual(withRefs.strategyRefs, ['strategy://x']);
});
