/**
 * The W12-A marketing-planner AUTHORITY-DISCIPLINE battery.
 *
 * Pins the backlog acceptance "no second Mission authority" structurally:
 * the planner port owns no mission-lifecycle verb; the mission view needs
 * exactly `getMission` (a hostile view whose other methods throw proves
 * none is ever called); composing plans never creates or mutates a mission
 * in the REAL mission repository; the plan record carries the mission as
 * a CITATION only. Also pins the port method budget, the package runtime
 * export surface, and the verbatim boundary statement.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryMarketingPlanner } from './in-memory-marketing-planner.js';
import { createInMemoryMissionRepository } from './in-memory-mission-repository.js';
import type { InMemoryMarketingPlannerOptions } from './in-memory-marketing-planner.js';
import type { MarketingPlannerPort } from '../ports/marketing-planner.port.js';
import type { ComposeMarketingPlanInput } from '../ports/marketing-planner.port.js';
import type { MarketingPlanId, MarketingPlanRecord } from '../domain/marketing-plan.js';
import type { Mission, MissionId } from '../domain/mission.js';
import type { ProductIntelligenceError, ProductIntelligenceRecord } from '@mos/product-intelligence';
import type { ProductIntelligenceVersionRef } from '@mos/product-intelligence';
import type { IdentityRef, TenantId, TenantScope, Timestamp } from '@mos/contracts';
import * as packageIndex from '../index.js';

const NOW = '2026-06-20T10:00:00.000Z' as Timestamp;
const tenantId = (value: string): TenantId => value as TenantId;
const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });
const planId = (value: string): MarketingPlanId => value as MarketingPlanId;
const missionId = (value: string): MissionId => value as MissionId;
const actor = (value: string): IdentityRef => value as IdentityRef;
const citation = (recordId: string, version: number): ProductIntelligenceVersionRef => ({
  recordId: recordId as ProductIntelligenceVersionRef['recordId'],
  version,
});

/** A minimal resolved product-intelligence record (structural double payload). */
const intelligenceRecord = (recordId: string): ProductIntelligenceRecord =>
  ({
    id: recordId as ProductIntelligenceRecord['id'],
    version: 1,
    basis: { basis: 'cited-external-evidence', counterfactual: false, observedAt: NOW },
  }) as unknown as ProductIntelligenceRecord;

/** DISCLOSED STRUCTURAL DOUBLE of the intelligence citation-resolution view. */
const intelligenceWith = (
  ...records: readonly ProductIntelligenceRecord[]
): InMemoryMarketingPlannerOptions['productIntelligence'] => ({
  resolveProductIntelligenceCitations: async (
    _scope: TenantScope,
    citations: readonly ProductIntelligenceVersionRef[],
  ): Promise<readonly ProductIntelligenceRecord[] | ProductIntelligenceError> => {
    const resolved: ProductIntelligenceRecord[] = [];
    for (const cited of citations) {
      const found = records.find(
        (record) => String(record.id) === String(cited.recordId) && record.version === cited.version,
      );
      if (found === undefined) {
        return {
          error: 'citation-not-found',
          message: `citation does not resolve: ${String(cited.recordId)}`,
        };
      }
      resolved.push(found);
    }
    return resolved;
  },
});

/** DISCLOSED STRUCTURAL DOUBLE of the health view (empty log). */
const emptyHealth: InMemoryMarketingPlannerOptions['health'] = {
  listHealthObservations: () => [],
};

const composeInput = (): ComposeMarketingPlanInput => ({
  scope: scopeOf('tenant-a'),
  id: planId('plan-1'),
  mission: { missionId: missionId('mission-1'), recordVersion: 1 },
  objectiveAlignment: 'Two-platform pilot driving conversion through cited reach evidence.',
  platforms: [
    {
      platform: 'provider-x' as ComposeMarketingPlanInput['platforms'][number]['platform'],
      rationale: 'Reach evidence is strongest on provider X.',
      evidence: [citation('pi-fact-1', 1)],
    },
  ],
  metricExpectations: [
    {
      metric: 'conversion',
      expectation: '120',
      unit: 'count',
      basis: { basis: 'cited-evidence', counterfactual: false, observedAt: NOW },
      evidence: [citation('pi-metric-1', 1)],
    },
  ],
  experimentExpectations: [
    {
      question: 'Does long-form outperform short-form on provider X?',
      successCriterion: 'Qualified signups per 1k reach, +15% at 95% confidence.',
      evidence: [citation('pi-obs-1', 1)],
    },
  ],
  composedBy: actor('identity-planner'),
  note: null,
});

// ---------------------------------------------------------------------------
// Port surface + vocabulary discipline
// ---------------------------------------------------------------------------

test('the planner port surface is exactly the eight declared methods (≤ 12 budget)', () => {
  const planner = createInMemoryMarketingPlanner({
    missions: { getMission: () => null },
    productIntelligence: intelligenceWith(),
    health: emptyHealth,
    now: () => NOW,
  });
  assert.deepEqual(Object.keys(planner).sort(), [
    'composeMarketingPlan',
    'getMarketingPlan',
    'listMarketingPlanCompositionRecords',
    'listMarketingPlanVersions',
    'listMarketingPlans',
    'listMarketingPlansForMission',
    'reviseMarketingPlan',
    'verifyMarketingPlanIntegrity',
  ]);
  assert.ok(Object.keys(planner).length <= 12);
});

test('no mission-lifecycle verb appears anywhere on the planner surface', () => {
  const planner = createInMemoryMarketingPlanner({
    missions: { getMission: () => null },
    productIntelligence: intelligenceWith(),
    health: emptyHealth,
    now: () => NOW,
  });
  const methodNames = Object.keys(planner);
  const banned = [
    'createMission',
    'activateMission',
    'completeMission',
    'archiveMission',
    'updateRewardSpec',
  ];
  for (const name of methodNames) {
    for (const verb of banned) {
      assert.ok(
        !name.toLowerCase().includes(verb.toLowerCase()),
        `planner surface must never carry the mission-authority verb '${verb}' (found '${name}')`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The mission read view is the ONLY mission surface
// ---------------------------------------------------------------------------

test('a mission view with ONLY getMission suffices for the full compose cycle', async () => {
  const mission: Mission = {
    id: missionId('mission-1'),
    tenantId: tenantId('tenant-a'),
    version: 1,
    objective: {
      statement: 'Grow qualified signups.',
      targetMetrics: [{ metric: 'conversion', target: '250', unit: 'count', horizon: null }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'conversion', weight: 1, direction: 'maximize', definition: 'Signups.' }],
    },
    strategyRefs: [],
    status: 'draft',
    createdAt: NOW,
    updatedAt: NOW,
  };
  let getMissionCalls = 0;
  const viewOnly: InMemoryMarketingPlannerOptions['missions'] = {
    getMission: (id: MissionId, version?: number): Mission | null => {
      getMissionCalls += 1;
      return id === mission.id && (version === undefined || version === mission.version)
        ? mission
        : null;
    },
  };
  const planner = createInMemoryMarketingPlanner({
    missions: viewOnly,
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: emptyHealth,
    now: () => NOW,
  });
  const plan = await planner.composeMarketingPlan(composeInput());
  assert.ok(!('error' in plan));
  assert.equal(getMissionCalls, 1);
});

test('a HOSTILE mission view whose other methods throw proves none is ever called', async () => {
  const mission: Mission = {
    id: missionId('mission-1'),
    tenantId: tenantId('tenant-a'),
    version: 1,
    objective: {
      statement: 'Grow qualified signups.',
      targetMetrics: [{ metric: 'conversion', target: '250', unit: 'count', horizon: null }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'conversion', weight: 1, direction: 'maximize', definition: 'Signups.' }],
    },
    strategyRefs: [],
    status: 'draft',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const hostile = {
    getMission: (): Mission | null => mission,
    createMission: (): never => {
      throw new Error('planner must never call createMission');
    },
    activateMission: (): never => {
      throw new Error('planner must never call activateMission');
    },
    completeMission: (): never => {
      throw new Error('planner must never call completeMission');
    },
    archiveMission: (): never => {
      throw new Error('planner must never call archiveMission');
    },
    updateRewardSpec: (): never => {
      throw new Error('planner must never call updateRewardSpec');
    },
    listMissions: (): never => {
      throw new Error('planner must never call listMissions');
    },
  };
  const planner = createInMemoryMarketingPlanner({
    missions: hostile,
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: emptyHealth,
    now: () => NOW,
  });
  const plan = await planner.composeMarketingPlan(composeInput());
  assert.ok(!('error' in plan));
  const revised = await planner.reviseMarketingPlan({
    scope: scopeOf('tenant-a'),
    supersedes: { planId: planId('plan-1'), version: 1 },
    mission: { missionId: missionId('mission-1'), recordVersion: 1 },
    objectiveAlignment: 'Revised alignment.',
    platforms: composeInput().platforms,
    metricExpectations: composeInput().metricExpectations,
    experimentExpectations: composeInput().experimentExpectations,
    revisedBy: actor('identity-planner'),
    note: null,
  });
  assert.ok(!('error' in revised));
});

// ---------------------------------------------------------------------------
// The REAL mission authority is never touched by planning
// ---------------------------------------------------------------------------

test('composing plans never creates or mutates a mission in the REAL repository', async () => {
  const repo = createInMemoryMissionRepository({ now: () => NOW });
  const mission = repo.createMission({
    scope: scopeOf('tenant-a'),
    id: missionId('mission-1'),
    objective: {
      statement: 'Grow qualified signups.',
      targetMetrics: [{ metric: 'conversion', target: '250', unit: 'count', horizon: null }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'conversion', weight: 1, direction: 'maximize', definition: 'Signups.' }],
    },
  });
  assert.ok(!('error' in mission));
  const missionBefore = JSON.stringify(repo.getMission(missionId('mission-1')));
  const listingsBefore = JSON.stringify(repo.listMissions(scopeOf('tenant-a')));

  const planner = createInMemoryMarketingPlanner({
    missions: repo,
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: emptyHealth,
    now: () => NOW,
  });
  const plan = await planner.composeMarketingPlan(composeInput());
  assert.ok(!('error' in plan));
  const revision = await planner.reviseMarketingPlan({
    scope: scopeOf('tenant-a'),
    supersedes: { planId: planId('plan-1'), version: 1 },
    mission: { missionId: missionId('mission-1'), recordVersion: 1 },
    objectiveAlignment: 'Revised alignment.',
    platforms: composeInput().platforms,
    metricExpectations: composeInput().metricExpectations,
    experimentExpectations: composeInput().experimentExpectations,
    revisedBy: actor('identity-planner'),
    note: null,
  });
  assert.ok(!('error' in revision));

  assert.equal(JSON.stringify(repo.getMission(missionId('mission-1'))), missionBefore);
  assert.equal(JSON.stringify(repo.listMissions(scopeOf('tenant-a'))), listingsBefore);
});

test('the plan record carries the mission as a CITATION only — no mission state copy', async () => {
  const mission: Mission = {
    id: missionId('mission-1'),
    tenantId: tenantId('tenant-a'),
    version: 1,
    objective: {
      statement: 'Grow qualified signups.',
      targetMetrics: [{ metric: 'conversion', target: '250', unit: 'count', horizon: null }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'conversion', weight: 1, direction: 'maximize', definition: 'Signups.' }],
    },
    strategyRefs: [],
    status: 'draft',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const scoped = createInMemoryMarketingPlanner({
    missions: { getMission: () => mission },
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: emptyHealth,
    now: () => NOW,
  });
  const plan = await scoped.composeMarketingPlan(composeInput());
  assert.ok(!('error' in plan));
  const record: MarketingPlanRecord = plan;
  assert.deepEqual(Object.keys(record.mission).sort(), ['missionId', 'recordVersion']);
  assert.ok(!('rewardSpec' in record));
  assert.ok(!('objective' in record));
  assert.ok(!('strategyRefs' in record));
});

// ---------------------------------------------------------------------------
// Boundary statement + package runtime surface
// ---------------------------------------------------------------------------

test('every record carries the verbatim no-second-authority boundary statement', async () => {
  const mission: Mission = {
    id: missionId('mission-1'),
    tenantId: tenantId('tenant-a'),
    version: 1,
    objective: {
      statement: 'Grow qualified signups.',
      targetMetrics: [{ metric: 'conversion', target: '250', unit: 'count', horizon: null }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'conversion', weight: 1, direction: 'maximize', definition: 'Signups.' }],
    },
    strategyRefs: [],
    status: 'draft',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const planner: MarketingPlannerPort = createInMemoryMarketingPlanner({
    missions: { getMission: () => mission },
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: emptyHealth,
    now: () => NOW,
  });
  const expected =
    'this plan cites its mission through the mission authority and creates no parallel mission record; platform and expectation evidence resolves through product-intelligence versioned citations; provider-confirmed restrictions are acknowledged from observable health records while suspected anomalies stay advisory, never confirmed (MARKETING-001; §25/§31)';
  const v1 = await planner.composeMarketingPlan(composeInput());
  assert.ok(!('error' in v1));
  assert.equal(v1.boundaryStatement, expected);
  assert.equal(v1.disclosure, 'evidence-linked-mission-cited-marketing-plan');
  const v2 = await planner.reviseMarketingPlan({
    scope: scopeOf('tenant-a'),
    supersedes: { planId: planId('plan-1'), version: 1 },
    mission: { missionId: missionId('mission-1'), recordVersion: 1 },
    objectiveAlignment: 'Revised alignment.',
    platforms: composeInput().platforms,
    metricExpectations: composeInput().metricExpectations,
    experimentExpectations: composeInput().experimentExpectations,
    revisedBy: actor('identity-planner'),
    note: null,
  });
  assert.ok(!('error' in v2));
  assert.equal(v2.boundaryStatement, expected);
});

test('the package runtime export surface is exactly the three disclosed runtime exports', () => {
  const runtimeExports = Object.keys(packageIndex).sort();
  assert.deepEqual(runtimeExports, [
    'IN_MEMORY_MARKETING_PLANNER_SOURCE',
    'createInMemoryMarketingPlanner',
    'createInMemoryMissionRepository',
  ]);
});
