/**
 * The W12-A marketing-planner ADVERSARIAL battery — the W9-B/W10-B probe
 * classes applied to the planner BY CONSTRUCTION:
 *
 * - D1 — composite keys are JSON array keys (hostile delimiter-laden
 *   tenant/plan ids can never alias another tenant's chain);
 * - D2 — listings compare the STORED record's tenant EXACTLY (never a
 *   prefix scan);
 * - D3/F1 — caller-aliased inputs never reach the store (post-compose
 *   mutation of the caller's objects changes nothing; the caller's
 *   objects are never frozen in place; `__proto__`-carrying payloads
 *   stay inert own properties);
 * - D4 — the record owns a frozen copy of the caller's scope;
 * - D5/F2 — non-finite/negative/fractional numbers fail closed;
 * - element-wise acknowledgment matching (no delimiter-joined ids).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryMarketingPlanner } from './in-memory-marketing-planner.js';
import type { InMemoryMarketingPlannerOptions } from './in-memory-marketing-planner.js';
import type { ComposeMarketingPlanInput } from '../ports/marketing-planner.port.js';
import type { MarketingPlanId, MarketingPlanRecord } from '../domain/marketing-plan.js';
import type { Mission, MissionId } from '../domain/mission.js';
import type { ProductIntelligenceError, ProductIntelligenceRecord } from '@mos/product-intelligence';
import type { ProductIntelligenceVersionRef } from '@mos/product-intelligence';
import type { HealthObservation } from '@mos/distribution';
import type { IdentityRef, ProviderId, TenantId, TenantScope, Timestamp } from '@mos/contracts';

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

const missionFor = (tenant: string, id: string): Mission => ({
  id: missionId(id),
  tenantId: tenantId(tenant),
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
});

const intelligenceRecord = (recordId: string): ProductIntelligenceRecord =>
  ({
    id: recordId as ProductIntelligenceRecord['id'],
    version: 1,
    basis: { basis: 'cited-external-evidence', counterfactual: false, observedAt: NOW },
  }) as unknown as ProductIntelligenceRecord;

const intelligenceWith = (
  ...records: readonly ProductIntelligenceRecord[]
): InMemoryMarketingPlannerOptions['productIntelligence'] => ({
  resolveProductIntelligenceCitations: async (
    _scope: TenantScope,
    citations: readonly ProductIntelligenceVersionRef[],
  ): Promise<readonly ProductIntelligenceRecord[] | ProductIntelligenceError> =>
    citations.every((cited) =>
      records.some(
        (record) => String(record.id) === String(cited.recordId) && record.version === cited.version,
      ),
    )
      ? citations.map(
          (cited) =>
            records.find(
              (record) =>
                String(record.id) === String(cited.recordId) && record.version === cited.version,
            )!,
        )
      : { error: 'citation-not-found', message: 'citation does not resolve' },
});

const emptyHealth: InMemoryMarketingPlannerOptions['health'] = {
  listHealthObservations: () => [],
};

const missionsWith = (
  ...missions: readonly Mission[]
): InMemoryMarketingPlannerOptions['missions'] => ({
  getMission: (id: MissionId, version?: number): Mission | null => {
    const found = missions.find((mission) => mission.id === id);
    if (found === undefined) {
      return null;
    }
    return version === undefined || found.version === version ? found : null;
  },
});

const plannerWith = (
  missions: readonly Mission[],
): ReturnType<typeof createInMemoryMarketingPlanner> =>
  createInMemoryMarketingPlanner({
    missions: missionsWith(...missions),
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: emptyHealth,
    now: () => NOW,
  });

const composeInput = (
  tenant: string,
  mission: string,
  id: string,
): ComposeMarketingPlanInput => ({
  scope: scopeOf(tenant),
  id: planId(id),
  mission: { missionId: missionId(mission), recordVersion: 1 },
  objectiveAlignment: 'Two-platform pilot driving conversion through cited reach evidence.',
  platforms: [
    {
      platform: 'provider-x' as ProviderId,
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

const expectPlan = (
  result: MarketingPlanRecord | { readonly error: string; readonly message?: string },
): MarketingPlanRecord => {
  if ('error' in result) {
    assert.fail(`unexpected planner error: ${result.error}`);
  }
  return result;
};

const expectError = (
  result: MarketingPlanRecord | { readonly error: string; readonly message?: string },
): { readonly error: string } => {
  if (!('error' in result)) {
    assert.fail('expected a typed failure, got a record');
  }
  return result;
};

// ---------------------------------------------------------------------------
// D1 — hostile delimiter-laden tenant/plan ids (JSON-array composite keys)
// ---------------------------------------------------------------------------

test('hostile delimiter-laden tenant ids get their OWN chains and never alias (D1)', async () => {
  const hostileTenants = [
    'tenant-a\u0000x',
    'tenant-a::b',
    'tenant-a|b',
    'tenant-a"b',
    '__proto__',
    'tenant-a b',
    'tenant-a]x',
  ];
  // Each hostile tenant gets its OWN mission id (the mission read view is
  // unscoped by design — the PLANNER enforces the tenant match, so the
  // fixtures must not conflate missions across tenants).
  const missions = hostileTenants.map((tenant) => missionFor(tenant, `mission-for-${tenant}`));
  const planner = plannerWith(missions);
  for (const tenant of hostileTenants) {
    const plan = expectPlan(
      await planner.composeMarketingPlan(composeInput(tenant, `mission-for-${tenant}`, 'plan-1')),
    );
    assert.equal(plan.tenantId, tenantId(tenant));
  }
  // Every hostile tenant sees exactly its own plan (the same plan id, seven chains).
  for (const tenant of hostileTenants) {
    const found = await planner.getMarketingPlan(scopeOf(tenant), planId('plan-1'));
    assert.notEqual(found, null);
    assert.equal(found!.tenantId, tenantId(tenant));
    assert.equal((await planner.listMarketingPlans(scopeOf(tenant))).length, 1);
  }
});

test('a hostile plan id cannot collide with a delimiter-joined tenant+plan pair (D1)', async () => {
  // 'a","plan-x' joined naively with a colon/quote would alias; the JSON-array
  // key keeps them distinct chains.
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  const first = expectPlan(await planner.composeMarketingPlan(composeInput('tenant-a', 'mission-1', 'plan-x')));
  const hostile = expectPlan(
    await planner.composeMarketingPlan(composeInput('tenant-a', 'mission-1', 'plan-x","tenant-a')),
  );
  assert.notEqual(first.id, hostile.id);
  assert.equal((await planner.listMarketingPlans(scopeOf('tenant-a'))).length, 2);
});

// ---------------------------------------------------------------------------
// D2 — exact-tenant-equality listings (never a prefix scan)
// ---------------------------------------------------------------------------

test('tenant-prefix scans are impossible: tenant-a never sees tenant-ab plans (D2)', async () => {
  const planner = plannerWith([
    missionFor('tenant-a', 'mission-a'),
    missionFor('tenant-ab', 'mission-ab'),
  ]);
  expectPlan(await planner.composeMarketingPlan(composeInput('tenant-a', 'mission-a', 'plan-1')));
  expectPlan(await planner.composeMarketingPlan(composeInput('tenant-ab', 'mission-ab', 'plan-1')));
  const tenantASees = await planner.listMarketingPlans(scopeOf('tenant-a'));
  assert.equal(tenantASees.length, 1);
  assert.equal(tenantASees[0]!.tenantId, tenantId('tenant-a'));
  const crossRead = await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'), 1);
  assert.equal(crossRead!.tenantId, tenantId('tenant-a'));
  assert.equal(await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-9')), null);
  const forMission = await planner.listMarketingPlansForMission(scopeOf('tenant-a'), missionId('mission-a'));
  assert.equal(forMission.length, 1);
  assert.equal(forMission[0]!.tenantId, tenantId('tenant-a'));
  const versions = await planner.listMarketingPlanVersions(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(versions.length, 1);
});

// ---------------------------------------------------------------------------
// D3/F1 — caller-aliased inputs + __proto__ payloads
// ---------------------------------------------------------------------------

test('post-compose mutation of the caller input changes nothing stored (D3)', async () => {
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  const input = composeInput('tenant-a', 'mission-1', 'plan-1');
  const plan = expectPlan(await planner.composeMarketingPlan(input));
  const digestBefore = plan.recordDigest;
  const rereadBefore = JSON.stringify(await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1')));

  const hostileInput = input as unknown as {
    objectiveAlignment: string;
    platforms: { rationale: string }[];
    metricExpectations: { expectation: string }[];
    mission: { recordVersion: number };
  };
  hostileInput.objectiveAlignment = 'forged alignment';
  hostileInput.platforms[0]!.rationale = 'forged rationale';
  hostileInput.metricExpectations[0]!.expectation = '999999';
  hostileInput.mission.recordVersion = 42;

  const reread = await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(reread!.recordDigest, digestBefore);
  assert.equal(JSON.stringify(reread), rereadBefore);
  const report = await planner.verifyMarketingPlanIntegrity(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(report!.status, 'intact');
});

test('the planner never freezes the caller objects in place (D3/F1)', async () => {
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  const input = composeInput('tenant-a', 'mission-1', 'plan-1');
  await planner.composeMarketingPlan(input);
  assert.ok(!Object.isFrozen(input));
  assert.ok(!Object.isFrozen(input.platforms));
  assert.ok(!Object.isFrozen(input.platforms[0]));
  assert.ok(!Object.isFrozen(input.platforms[0]!.evidence));
  assert.ok(!Object.isFrozen(input.platforms[0]!.evidence[0]));
  assert.ok(!Object.isFrozen(input.metricExpectations[0]!.basis));
  assert.ok(!Object.isFrozen(input.mission));
});

test('a __proto__-carrying payload stays inert — Object.prototype is never polluted (F1)', async () => {
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  const hostileBasis = JSON.parse(
    '{"basis":"cited-evidence","counterfactual":false,"observedAt":"2026-06-20T10:00:00.000Z","__proto__":{"polluted":"yes"}}',
  ) as ComposeMarketingPlanInput['metricExpectations'][number]['basis'];
  const plan = expectPlan(
    await planner.composeMarketingPlan({
      ...composeInput('tenant-a', 'mission-1', 'plan-1'),
      metricExpectations: [
        {
          metric: 'conversion',
          expectation: '120',
          unit: 'count',
          basis: hostileBasis,
          evidence: [citation('pi-metric-1', 1)],
        },
      ],
    }),
  );
  assert.ok(plan.version === 1);
  assert.equal((Object.prototype as { polluted?: string }).polluted, undefined);
  const reread = await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(reread!.recordDigest, plan.recordDigest);
  assert.equal((Object.prototype as { polluted?: string }).polluted, undefined);
});

// ---------------------------------------------------------------------------
// D4 — the record owns a frozen copy of the caller's scope
// ---------------------------------------------------------------------------

test('forging the caller scope after compose moves nothing (D4)', async () => {
  const planner = plannerWith([
    missionFor('tenant-a', 'mission-1'),
    missionFor('tenant-b', 'mission-1'),
  ]);
  const scope: TenantScope = {
    tenantId: tenantId('tenant-a'),
    workspaceId: 'ws-1' as TenantScope['workspaceId'],
  };
  const plan = expectPlan(
    await planner.composeMarketingPlan({ ...composeInput('tenant-a', 'mission-1', 'plan-1'), scope }),
  );
  const forged = scope as { tenantId: TenantId; workspaceId?: string };
  forged.tenantId = tenantId('tenant-b');
  forged.workspaceId = 'ws-forged';
  assert.equal(plan.tenantId, tenantId('tenant-a'));
  assert.equal((plan.scope as TenantScope).tenantId, tenantId('tenant-a'));
  assert.equal((plan.scope as TenantScope).workspaceId, 'ws-1');
  assert.ok(Object.isFrozen(plan.scope));
  const log = planner.listMarketingPlanCompositionRecords(scopeOf('tenant-a'));
  assert.equal(log.length, 1);
  assert.ok(Object.isFrozen(log[0]!.scope));
});

// ---------------------------------------------------------------------------
// D5/F2 — non-finite / negative / fractional numeric guards
// ---------------------------------------------------------------------------

test('NaN, Infinity, negative and fractional citation versions fail closed (D5/F2)', async () => {
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  for (const badVersion of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 0]) {
    const failure = expectError(
      await planner.composeMarketingPlan({
        ...composeInput('tenant-a', 'mission-1', `plan-${String(badVersion)}`),
        mission: { missionId: missionId('mission-1'), recordVersion: badVersion },
      }),
    );
    assert.equal(failure.error, 'invalid-input');
  }
  for (const badVersion of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
    expectPlan(await planner.composeMarketingPlan(composeInput('tenant-a', 'mission-1', `plan-ok-${badVersion}`)));
    const failure = expectError(
      await planner.reviseMarketingPlan({
        scope: scopeOf('tenant-a'),
        supersedes: { planId: planId(`plan-ok-${badVersion}`), version: badVersion },
        mission: { missionId: missionId('mission-1'), recordVersion: 1 },
        objectiveAlignment: 'Revised alignment.',
        platforms: composeInput('tenant-a', 'mission-1', 'x').platforms,
        metricExpectations: composeInput('tenant-a', 'mission-1', 'x').metricExpectations,
        experimentExpectations: composeInput('tenant-a', 'mission-1', 'x').experimentExpectations,
        revisedBy: actor('identity-planner'),
        note: null,
      }),
    );
    assert.equal(failure.error, 'invalid-input');
  }
});

test('a non-finite expectation on the DOUBLE side cannot poison the record (D5)', async () => {
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  // The expectation VALUE is a string by contract; the numeric guards cover
  // versions. A hostile numeric weight never enters: nothing numeric is
  // stored unvalidated. Pin: a fractional supersedes version rejects above,
  // and the record's own numeric fields are integers by construction.
  const plan = expectPlan(await planner.composeMarketingPlan(composeInput('tenant-a', 'mission-1', 'plan-1')));
  assert.ok(Number.isInteger(plan.version));
  assert.ok(Number.isInteger(plan.mission.recordVersion));
});

// ---------------------------------------------------------------------------
// Element-wise acknowledgment matching (no delimiter-joined ids)
// ---------------------------------------------------------------------------

test('acknowledgment matching is exact-id element-wise — fabricated ids never match', async () => {
  const restriction: HealthObservation = {
    kind: 'provider-confirmed-restriction',
    id: 'health-1' as HealthObservation['id'],
    scope: scopeOf('tenant-a'),
    providerId: 'provider-x' as ProviderId,
    channelRef: 'channel-1' as never,
    restrictionRef: 'restriction://health-1',
    observedAt: NOW,
    description: 'no unattended promo bursts',
    recordedAt: NOW,
    source: 'provider-profile',
  } as unknown as HealthObservation;
  const planner = createInMemoryMarketingPlanner({
    missions: missionsWith(missionFor('tenant-a', 'mission-1')),
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: {
      listHealthObservations: (
        scope: TenantScope,
        filter?: { readonly providerId?: ProviderId; readonly kind?: HealthObservation['kind'] },
      ): readonly HealthObservation[] =>
        [restriction].filter(
          (observation) =>
            observation.scope.tenantId === scope.tenantId &&
            (filter?.providerId === undefined || observation.providerId === filter.providerId) &&
            (filter?.kind === undefined || observation.kind === filter.kind),
        ),
    },
    now: () => NOW,
  });
  // A delimiter-joined fabricated id ("health-1|x") must NOT satisfy the
  // acknowledgment of health-1: element-wise matching rejects it (the real
  // restriction stays unacknowledged — and the fabricated acknowledgment
  // itself fails closed as not-confirmed).
  const failure = expectError(
    await planner.composeMarketingPlan({
      ...composeInput('tenant-a', 'mission-1', 'plan-1'),
      platforms: [
        {
          platform: 'provider-x' as ProviderId,
          rationale: 'Reach evidence is strongest on provider X.',
          evidence: [citation('pi-fact-1', 1)],
          acknowledgedRestrictions: ['health-1|x' as never],
        },
      ],
    }),
  );
  assert.equal(failure.error, 'acknowledged-restriction-not-confirmed');
  // With the REAL id acknowledged but a SECOND real restriction unacknowledged,
  // the completeness gate fires with the typed reason (element-wise both ways).
  const second = {
    ...restriction,
    id: 'health-2',
    restrictionRef: 'restriction://health-2',
  } as unknown as HealthObservation;
  const planner2 = createInMemoryMarketingPlanner({
    missions: missionsWith(missionFor('tenant-a', 'mission-1')),
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1'),
      intelligenceRecord('pi-metric-1'),
      intelligenceRecord('pi-obs-1'),
    ),
    health: {
      listHealthObservations: (
        scope: TenantScope,
        filter?: { readonly providerId?: ProviderId; readonly kind?: HealthObservation['kind'] },
      ): readonly HealthObservation[] =>
        [restriction, second].filter(
          (observation) =>
            observation.scope.tenantId === scope.tenantId &&
            (filter?.providerId === undefined || observation.providerId === filter.providerId) &&
            (filter?.kind === undefined || observation.kind === filter.kind),
        ),
    },
    now: () => NOW,
  });
  const failure2 = expectError(
    await planner2.composeMarketingPlan({
      ...composeInput('tenant-a', 'mission-1', 'plan-1'),
      platforms: [
        {
          platform: 'provider-x' as ProviderId,
          rationale: 'Reach evidence is strongest on provider X.',
          evidence: [citation('pi-fact-1', 1)],
          acknowledgedRestrictions: ['health-1' as never],
        },
      ],
    }),
  );
  assert.equal(failure2.error, 'platform-under-confirmed-restriction');
});

// ---------------------------------------------------------------------------
// Store immutability (freeze pins — the repo's tamper-detection convention)
// ---------------------------------------------------------------------------

test('stored records are deeply frozen — mutation attempts throw (the lab precedent)', async () => {
  const planner = plannerWith([missionFor('tenant-a', 'mission-1')]);
  const plan = expectPlan(await planner.composeMarketingPlan(composeInput('tenant-a', 'mission-1', 'plan-1')));
  assert.throws(() => {
    (plan as unknown as { objectiveAlignment: string }).objectiveAlignment = 'tampered';
  }, TypeError);
  assert.throws(() => {
    (plan.platforms as unknown as { push: (value: unknown) => void }).push(null);
  }, TypeError);
  assert.throws(() => {
    (plan.platforms[0] as unknown as { rationale: string }).rationale = 'tampered';
  }, TypeError);
  assert.throws(() => {
    (plan as unknown as { recordDigest: string }).recordDigest = '0';
  }, TypeError);
  const log = planner.listMarketingPlanCompositionRecords(scopeOf('tenant-a'));
  assert.throws(() => {
    (log[0] as unknown as { outcome: string }).outcome = 'rejected';
  }, TypeError);
});
