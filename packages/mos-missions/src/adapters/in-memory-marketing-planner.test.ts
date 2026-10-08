/**
 * The W12-A marketing-planner in-memory adapter battery — compose/revise
 * round-trips, mission-citation gates, fail-closed evidence resolution,
 * basis coherence, the health-respect battery, append-only versioning,
 * digest integrity, §30 composition observability, determinism.
 *
 * The cross-authority views here are DISCLOSED STRUCTURAL TEST DOUBLES of
 * the injected `Pick<...>` views (the @mos/product-intelligence testing
 * precedent): the real in-memory authorities are exercised end-to-end in
 * marketing-planner-real-stack.test.ts.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryMarketingPlanner } from './in-memory-marketing-planner.js';
import type { InMemoryMarketingPlannerOptions } from './in-memory-marketing-planner.js';
import type { MarketingPlannerPort } from '../ports/marketing-planner.port.js';
import type { ComposeMarketingPlanInput } from '../ports/marketing-planner.port.js';
import type { MarketingPlannerError } from '../ports/marketing-planner.port.js';
import type { MarketingPlanId, MarketingPlanRecord } from '../domain/marketing-plan.js';
import type { Mission, MissionId } from '../domain/mission.js';
import type { ProductIntelligenceError, ProductIntelligenceRecord } from '@mos/product-intelligence';
import type { ProductIntelligenceVersionRef } from '@mos/product-intelligence';
import type { HealthObservation, HealthObservationId } from '@mos/distribution';
import type { IdentityRef, ProviderId, TenantId, TenantScope, Timestamp } from '@mos/contracts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-06-20T10:00:00.000Z' as Timestamp;
const tenantId = (value: string): TenantId => value as TenantId;
const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });
const planId = (value: string): MarketingPlanId => value as MarketingPlanId;
const missionId = (value: string): MissionId => value as MissionId;
const actor = (value: string): IdentityRef => value as IdentityRef;
const platform = (value: string): ProviderId => value as ProviderId;
const observationId = (value: string): HealthObservationId => value as HealthObservationId;
const citation = (recordId: string, version: number): ProductIntelligenceVersionRef => ({
  recordId: recordId as ProductIntelligenceVersionRef['recordId'],
  version,
});

const missionFixture = (
  status: Mission['status'],
  tenant: string,
  overrides: { readonly id?: MissionId } = {},
): Mission => ({
  id: overrides.id ?? missionId('mission-1'),
  tenantId: tenantId(tenant),
  version: 1,
  objective: {
    statement: 'Grow qualified signups for the Q4 pilot',
    targetMetrics: [
      { metric: 'conversion', target: '250', unit: 'count', horizon: '2026-12-31' },
    ],
    constraints: [{ kind: 'budget', description: 'Hard ceiling 5000 EUR.' }],
  },
  rewardSpec: {
    version: 1,
    terms: [{ metric: 'conversion', weight: 1, direction: 'maximize', definition: 'Signups.' }],
  },
  strategyRefs: [],
  status,
  createdAt: NOW,
  updatedAt: NOW,
});

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE of the mission read view — a map of
 * (id, version) → mission. Only `getMission` exists (the authority battery
 * pins that this suffices).
 */
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

/** The default tenant-a mission plus a tenant-b sibling (for §31 probes). */
const bothTenantMissions = (): readonly Mission[] => [
  missionFixture('draft', 'tenant-a'),
  missionFixture('draft', 'tenant-b', { id: missionId('mission-b') }),
];

/** A minimal resolved product-intelligence record (structural double payload). */
const intelligenceRecord = (
  recordId: string,
  basisKind: 'cited-external-evidence' | 'counterfactual-forecast',
): ProductIntelligenceRecord =>
  ({
    id: recordId as ProductIntelligenceRecord['id'],
    version: 1,
    subject: 'product://course/masterclass' as ProductIntelligenceRecord['subject'],
    kind: 'product-fact',
    content: { kind: 'product-fact', statement: 'fact', evidenceRefs: ['analytics://x'] },
    source: { sourceKind: 'platform-analytics', sourceRefs: ['analytics://x'] },
    basis:
      basisKind === 'cited-external-evidence'
        ? { basis: 'cited-external-evidence', counterfactual: false, observedAt: NOW }
        : { basis: 'counterfactual-forecast', counterfactual: true, methodNote: 'model-x' },
  }) as unknown as ProductIntelligenceRecord;

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE of the product-intelligence citation
 * resolution view — a map of (recordId, version) → record.
 */
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
        const failure: ProductIntelligenceError = {
          error: 'citation-not-found',
          message: `citation does not resolve: ${String(cited.recordId)}@v${cited.version}`,
        };
        return failure;
      }
      resolved.push(found);
    }
    return resolved;
  },
});

/** A minimal provider-CONFIRMED restriction observation (structural double payload). */
const confirmedRestriction = (
  id: string,
  provider: string,
  overrides: { readonly restrictionRef?: string; readonly description?: string } = {},
): HealthObservation =>
  ({
    kind: 'provider-confirmed-restriction',
    id: observationId(id),
    scope: scopeOf('tenant-a'),
    providerId: platform(provider),
    channelRef: 'channel-1',
    restrictionRef: overrides.restrictionRef ?? `restriction://${id}`,
    observedAt: NOW,
    description: overrides.description ?? 'no unattended promo bursts',
    recordedAt: NOW,
    source: 'provider-profile',
  }) as unknown as HealthObservation;

/** A minimal SUSPECTED distribution anomaly observation (structural double payload). */
const suspectedAnomaly = (id: string, provider: string): HealthObservation =>
  ({
    kind: 'suspected-distribution-anomaly',
    id: observationId(id),
    scope: scopeOf('tenant-a'),
    providerId: platform(provider),
    channelRef: 'channel-1',
    derivation: {
      ruleId: 'observation-absence',
      channelRef: 'channel-1',
      windowMs: 3_600_000,
      evaluatedAt: NOW,
      examinedObservationIds: [],
      documented: 'declared rule text',
    },
    suspectedAt: NOW,
    recordedAt: NOW,
    source: 'health-derivation',
  }) as unknown as HealthObservation;

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE of the distribution health view — a
 * tenant-scoped list with the typed kind filter.
 */
const healthWith = (
  ...observations: readonly HealthObservation[]
): InMemoryMarketingPlannerOptions['health'] => ({
  listHealthObservations: (
    scope: TenantScope,
    filter?: { readonly providerId?: ProviderId; readonly kind?: HealthObservation['kind'] },
  ): readonly HealthObservation[] =>
    observations.filter(
      (observation) =>
        observation.scope.tenantId === scope.tenantId &&
        (filter?.providerId === undefined || observation.providerId === filter.providerId) &&
        (filter?.kind === undefined || observation.kind === filter.kind),
    ),
});

const plannerWith = (
  overrides: {
    readonly missions?: readonly Mission[];
    readonly intelligence?: readonly ProductIntelligenceRecord[];
    readonly health?: readonly HealthObservation[];
  } = {},
): MarketingPlannerPort =>
  createInMemoryMarketingPlanner({
    missions: missionsWith(
      ...(overrides.missions ?? [missionFixture('draft', 'tenant-a')]),
    ),
    productIntelligence: intelligenceWith(
      ...(overrides.intelligence ?? [
        intelligenceRecord('pi-fact-1', 'cited-external-evidence'),
        intelligenceRecord('pi-metric-1', 'cited-external-evidence'),
        intelligenceRecord('pi-obs-1', 'cited-external-evidence'),
      ]),
    ),
    health: healthWith(...(overrides.health ?? [])),
    now: () => NOW,
  });

const composeInput = (
  overrides: Partial<ComposeMarketingPlanInput> = {},
): ComposeMarketingPlanInput => ({
  scope: scopeOf('tenant-a'),
  id: planId('plan-1'),
  mission: { missionId: missionId('mission-1'), recordVersion: 1 },
  objectiveAlignment: 'Two-platform pilot driving conversion through cited reach evidence.',
  platforms: [
    {
      platform: platform('provider-x'),
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
  ...overrides,
});

const expectPlan = (
  result: MarketingPlanRecord | MarketingPlannerError,
): MarketingPlanRecord => {
  if ('error' in result) {
    assert.fail(`unexpected planner error: ${result.error} — ${result.message}`);
  }
  return result;
};

const expectError = (
  result: MarketingPlanRecord | MarketingPlannerError,
): MarketingPlannerError => {
  if (!('error' in result)) {
    assert.fail('expected a typed failure, got a record');
  }
  return result;
};

// ---------------------------------------------------------------------------
// Compose round-trips
// ---------------------------------------------------------------------------

test('composeMarketingPlan returns a frozen evidence-linked plan citing the mission version', async () => {
  const planner = plannerWith();
  const plan = expectPlan(await planner.composeMarketingPlan(composeInput()));

  assert.equal(plan.id, planId('plan-1'));
  assert.equal(plan.version, 1);
  assert.equal(plan.tenantId, tenantId('tenant-a'));
  assert.deepEqual(plan.mission, { missionId: missionId('mission-1'), recordVersion: 1 });
  assert.equal(plan.missionStatusAtComposition, 'draft');
  assert.equal(plan.composedAt, NOW);
  assert.equal(plan.supersedes, null);
  assert.equal(plan.planKind, 'marketing-mission-plan');
  assert.ok(plan.recordDigest.length > 0);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.platforms[0]!));
  assert.ok(Object.isFrozen(plan.metricExpectations[0]!.evidence));
  assert.deepEqual(plan.platforms[0]!.evidence, [citation('pi-fact-1', 1)]);
  assert.equal(plan.metricExpectations[0]!.basis.basis, 'cited-evidence');
  assert.equal(plan.metricExpectations[0]!.basis.counterfactual, false);
});

test('composeMarketingPlan stores a frozen copy of the caller scope (D4)', async () => {
  const planner = plannerWith();
  const scope: TenantScope = { tenantId: tenantId('tenant-a') };
  const plan = expectPlan(
    await planner.composeMarketingPlan(composeInput({ scope })),
  );
  const forgedScope = scope as { tenantId: TenantId };
  forgedScope.tenantId = tenantId('tenant-b');
  assert.equal(plan.tenantId, tenantId('tenant-a'));
  assert.equal((plan.scope as TenantScope).tenantId, tenantId('tenant-a'));
});

test('counterfactual-forecast expectations carry the literal counterfactual label', async () => {
  const planner = plannerWith();
  const plan = expectPlan(
    await planner.composeMarketingPlan(
      composeInput({
        metricExpectations: [
          {
            metric: 'qualified-reach',
            expectation: '5000',
            unit: 'people',
            basis: { basis: 'counterfactual-forecast', counterfactual: true, methodNote: 'ensemble-mean' },
            evidence: [citation('pi-obs-1', 1)],
          },
        ],
      }),
    ),
  );
  assert.equal(plan.metricExpectations[0]!.basis.basis, 'counterfactual-forecast');
  assert.equal(plan.metricExpectations[0]!.basis.counterfactual, true);
});

// ---------------------------------------------------------------------------
// Mission gates
// ---------------------------------------------------------------------------

test('an unresolvable mission citation fails closed with the typed reason', async () => {
  const planner = plannerWith();
  const failure = expectError(
    await planner.composeMarketingPlan(
      composeInput({ mission: { missionId: missionId('mission-x'), recordVersion: 1 } }),
    ),
  );
  assert.equal(failure.error, 'mission-citation-unresolvable');
});

test('an unknown mission record version fails closed (never latest-fallback)', async () => {
  const planner = plannerWith();
  const failure = expectError(
    await planner.composeMarketingPlan(
      composeInput({ mission: { missionId: missionId('mission-1'), recordVersion: 7 } }),
    ),
  );
  assert.equal(failure.error, 'mission-citation-unresolvable');
});

test('a cross-tenant mission citation is indistinguishable from unknown', async () => {
  const planner = plannerWith({ missions: [missionFixture('draft', 'tenant-b')] });
  const failure = expectError(await planner.composeMarketingPlan(composeInput()));
  assert.equal(failure.error, 'mission-citation-unresolvable');
});

test('completed and archived missions are not plannable; draft and active are', async () => {
  for (const status of ['completed', 'archived'] as const) {
    const planner = plannerWith({ missions: [missionFixture(status, 'tenant-a')] });
    const failure = expectError(await planner.composeMarketingPlan(composeInput()));
    assert.equal(failure.error, 'mission-not-plannable');
  }
  for (const status of ['draft', 'active'] as const) {
    const planner = plannerWith({ missions: [missionFixture(status, 'tenant-a')] });
    const plan = expectPlan(await planner.composeMarketingPlan(composeInput()));
    assert.equal(plan.missionStatusAtComposition, status);
  }
});

// ---------------------------------------------------------------------------
// Evidence fail-closure + basis coherence
// ---------------------------------------------------------------------------

test('an unresolvable evidence citation fails closed with the authority cause', async () => {
  const planner = plannerWith();
  const failure = expectError(
    await planner.composeMarketingPlan(
      composeInput({
        platforms: [
          {
            platform: platform('provider-x'),
            rationale: 'Backed by missing evidence.',
            evidence: [citation('pi-does-not-exist', 1)],
          },
        ],
      }),
    ),
  );
  assert.equal(failure.error, 'evidence-citation-unresolvable');
  assert.equal(failure.cause?.error, 'citation-not-found');
});

test('a cited-evidence expectation backed only by forecasts rejects (no fabricated basis)', async () => {
  const planner = plannerWith({
    intelligence: [
      intelligenceRecord('pi-fact-1', 'cited-external-evidence'),
      intelligenceRecord('pi-obs-1', 'cited-external-evidence'),
      intelligenceRecord('pi-forecast-1', 'counterfactual-forecast'),
    ],
  });
  const failure = expectError(
    await planner.composeMarketingPlan(
      composeInput({
        metricExpectations: [
          {
            metric: 'conversion',
            expectation: '120',
            unit: 'count',
            basis: { basis: 'cited-evidence', counterfactual: false, observedAt: NOW },
            evidence: [citation('pi-forecast-1', 1)],
          },
        ],
      }),
    ),
  );
  assert.equal(failure.error, 'basis-evidence-mismatch');
});

test('a runtime-forged cited-evidence basis literal rejects (double-cast guard)', async () => {
  const planner = plannerWith();
  const forged = {
    basis: 'cited-evidence',
    counterfactual: true,
    observedAt: NOW,
  } as unknown as ComposeMarketingPlanInput['metricExpectations'][number]['basis'];
  const failure = expectError(
    await planner.composeMarketingPlan(
      composeInput({
        metricExpectations: [
          {
            metric: 'conversion',
            expectation: '120',
            unit: 'count',
            basis: forged,
            evidence: [citation('pi-metric-1', 1)],
          },
        ],
      }),
    ),
  );
  assert.equal(failure.error, 'invalid-input');
  assert.match(failure.message, /counterfactual: false/);
});

// ---------------------------------------------------------------------------
// The health-respect battery
// ---------------------------------------------------------------------------

test('an acknowledged confirmed restriction snapshots the ACTUAL observation', async () => {
  const planner = plannerWith({
    health: [confirmedRestriction('health-1', 'provider-x')],
  });
  const plan = expectPlan(
    await planner.composeMarketingPlan(
      composeInput({
        platforms: [
          {
            platform: platform('provider-x'),
            rationale: 'Backed by reach evidence.',
            evidence: [citation('pi-fact-1', 1)],
            acknowledgedRestrictions: [observationId('health-1')],
          },
        ],
      }),
    ),
  );
  const snapshot = plan.platforms[0]!.acknowledgedConfirmedRestrictions[0]!;
  assert.equal(snapshot.observationId, 'health-1');
  assert.equal(snapshot.restrictionRef, 'restriction://health-1');
  assert.equal(snapshot.description, 'no unattended promo bursts');
  assert.equal(snapshot.acknowledged, true);
  assert.ok(Object.isFrozen(snapshot));
});

test('an unacknowledged confirmed restriction fails closed with the typed reason', async () => {
  const planner = plannerWith({
    health: [confirmedRestriction('health-1', 'provider-x')],
  });
  const failure = expectError(await planner.composeMarketingPlan(composeInput()));
  assert.equal(failure.error, 'platform-under-confirmed-restriction');
  assert.match(failure.message, /restriction:\/\/health-1/);
});

test('an acknowledgment citing a SUSPECTED anomaly rejects — suspected is never confirmed', async () => {
  const planner = plannerWith({
    health: [suspectedAnomaly('health-suspect-1', 'provider-x')],
  });
  const failure = expectError(
    await planner.composeMarketingPlan(
      composeInput({
        platforms: [
          {
            platform: platform('provider-x'),
            rationale: 'Backed by reach evidence.',
            evidence: [citation('pi-fact-1', 1)],
            acknowledgedRestrictions: [observationId('health-suspect-1')],
          },
        ],
      }),
    ),
  );
  assert.equal(failure.error, 'acknowledged-restriction-not-confirmed');
});

test('suspected anomalies never gate the plan — they snapshot as advisory, labeled never-confirmed', async () => {
  const planner = plannerWith({
    health: [suspectedAnomaly('health-suspect-1', 'provider-x')],
  });
  const plan = expectPlan(await planner.composeMarketingPlan(composeInput()));
  const snapshot = plan.platforms[0]!.suspectedAnomaliesAtComposition[0]!;
  assert.equal(snapshot.observationId, 'health-suspect-1');
  assert.equal(snapshot.derivationRuleId, 'observation-absence');
  assert.equal(snapshot.suspectedNeverConfirmed, true);
});

test('a confirmed restriction on ANOTHER provider never gates this platform', async () => {
  const planner = plannerWith({
    health: [confirmedRestriction('health-1', 'provider-y')],
  });
  const plan = expectPlan(await planner.composeMarketingPlan(composeInput()));
  assert.equal(plan.platforms[0]!.acknowledgedConfirmedRestrictions.length, 0);
});

test('a cross-tenant confirmed restriction never gates this tenant (§31)', async () => {
  const foreign = confirmedRestriction('health-foreign', 'provider-x');
  const planner = plannerWith({ missions: bothTenantMissions(), health: [foreign] });
  const plan = expectPlan(
    await planner.composeMarketingPlan(
      composeInput({
        scope: scopeOf('tenant-b'),
        mission: { missionId: missionId('mission-b'), recordVersion: 1 },
      }),
    ),
  );
  assert.equal(plan.platforms[0]!.acknowledgedConfirmedRestrictions.length, 0);
});

// ---------------------------------------------------------------------------
// Structural faults
// ---------------------------------------------------------------------------

test('duplicate platform choices and duplicate metric expectations reject', async () => {
  const planner = plannerWith();
  const duplicatePlatform = expectError(
    await planner.composeMarketingPlan(
      composeInput({
        platforms: [
          {
            platform: platform('provider-x'),
            rationale: 'One.',
            evidence: [citation('pi-fact-1', 1)],
          },
          {
            platform: platform('provider-x'),
            rationale: 'Two.',
            evidence: [citation('pi-fact-1', 1)],
          },
        ],
      }),
    ),
  );
  assert.equal(duplicatePlatform.error, 'invalid-input');
  assert.match(duplicatePlatform.message, /duplicate platform/);

  const duplicateMetric = expectError(
    await planner.composeMarketingPlan(
      composeInput({
        metricExpectations: [
          {
            metric: 'conversion',
            expectation: '120',
            unit: 'count',
            basis: { basis: 'cited-evidence', counterfactual: false, observedAt: NOW },
            evidence: [citation('pi-metric-1', 1)],
          },
          {
            metric: 'conversion',
            expectation: '150',
            unit: 'count',
            basis: { basis: 'cited-evidence', counterfactual: false, observedAt: NOW },
            evidence: [citation('pi-metric-1', 1)],
          },
        ],
      }),
    ),
  );
  assert.equal(duplicateMetric.error, 'invalid-input');
  assert.match(duplicateMetric.message, /duplicate metric/);
});

test('empty element sets and blank fields reject', async () => {
  const planner = plannerWith();
  const noPlatforms = expectError(
    await planner.composeMarketingPlan(composeInput({ platforms: [] })),
  );
  assert.equal(noPlatforms.error, 'invalid-input');
  const blankAlignment = expectError(
    await planner.composeMarketingPlan(composeInput({ objectiveAlignment: '   ' })),
  );
  assert.equal(blankAlignment.error, 'invalid-input');
  const noExperiments = expectError(
    await planner.composeMarketingPlan(composeInput({ experimentExpectations: [] })),
  );
  assert.equal(noExperiments.error, 'invalid-input');
});

test('a duplicate plan id in the same tenant rejects; another tenant may reuse the id', async () => {
  const planner = plannerWith({ missions: bothTenantMissions() });
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  const duplicate = expectError(await planner.composeMarketingPlan(composeInput()));
  assert.equal(duplicate.error, 'duplicate-marketing-plan');
  const otherTenant = expectPlan(
    await planner.composeMarketingPlan(
      composeInput({
        scope: scopeOf('tenant-b'),
        mission: { missionId: missionId('mission-b'), recordVersion: 1 },
      }),
    ),
  );
  assert.equal(otherTenant.tenantId, tenantId('tenant-b'));
});

// ---------------------------------------------------------------------------
// Reads: get / listVersions / listForMission / listPlans / integrity
// ---------------------------------------------------------------------------

test('reads are tenant-exact and version-addressable', async () => {
  const planner = plannerWith();
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  const found = await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'));
  assert.notEqual(found, null);
  const exactVersion = await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'), 1);
  assert.notEqual(exactVersion, null);
  assert.equal(
    await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'), 9),
    null,
  );
  assert.equal(await planner.getMarketingPlan(scopeOf('tenant-b'), planId('plan-1')), null);
  const versions = await planner.listMarketingPlanVersions(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(versions.length, 1);
  assert.equal(
    (await planner.listMarketingPlanVersions(scopeOf('tenant-b'), planId('plan-1'))).length,
    0,
  );
});

test('listMarketingPlansForMission returns only this tenant plans citing the mission, deterministic order', async () => {
  const planner = plannerWith({
    missions: [
      missionFixture('draft', 'tenant-a'),
      missionFixture('draft', 'tenant-a', { id: missionId('mission-2') }),
    ],
  });
  expectPlan(await planner.composeMarketingPlan(composeInput({ id: planId('plan-b') })));
  expectPlan(
    await planner.composeMarketingPlan(
      composeInput({
        id: planId('plan-a'),
        mission: { missionId: missionId('mission-2'), recordVersion: 1 },
      }),
    ),
  );
  const forMission1 = await planner.listMarketingPlansForMission(
    scopeOf('tenant-a'),
    missionId('mission-1'),
  );
  assert.deepEqual(
    forMission1.map((plan) => plan.id as string),
    ['plan-b'],
  );
  const all = await planner.listMarketingPlans(scopeOf('tenant-a'));
  assert.deepEqual(
    all.map((plan) => plan.id as string),
    ['plan-a', 'plan-b'],
  );
});

test('verifyMarketingPlanIntegrity reports intact records and null for unknown', async () => {
  const planner = plannerWith();
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  const report = await planner.verifyMarketingPlanIntegrity(scopeOf('tenant-a'), planId('plan-1'));
  assert.notEqual(report, null);
  assert.equal(report!.status, 'intact');
  assert.equal(report!.recordedDigest, report!.recomputedDigest);
  assert.equal(
    await planner.verifyMarketingPlanIntegrity(scopeOf('tenant-a'), planId('plan-x')),
    null,
  );
});

// ---------------------------------------------------------------------------
// Revision: append-only, optimistic concurrency, re-validation
// ---------------------------------------------------------------------------

test('reviseMarketingPlan appends the next version and never rewrites history', async () => {
  const planner = plannerWith();
  const v1 = expectPlan(await planner.composeMarketingPlan(composeInput()));
  const v2 = expectPlan(
    await planner.reviseMarketingPlan({
      scope: scopeOf('tenant-a'),
      supersedes: { planId: planId('plan-1'), version: 1 },
      mission: { missionId: missionId('mission-1'), recordVersion: 1 },
      objectiveAlignment: 'Revised alignment after new evidence.',
      platforms: [
        {
          platform: platform('provider-x'),
          rationale: 'Reach evidence is strongest on provider X.',
          evidence: [citation('pi-fact-1', 1)],
        },
      ],
      metricExpectations: [
        {
          metric: 'conversion',
          expectation: '150',
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
      revisedBy: actor('identity-planner'),
      note: 'post-review revision',
    }),
  );
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.supersedes, { planId: planId('plan-1'), version: 1 });
  assert.equal(v2.note, 'post-review revision');
  const rereadV1 = await planner.getMarketingPlan(scopeOf('tenant-a'), planId('plan-1'), 1);
  assert.deepEqual(rereadV1, v1);
  const versions = await planner.listMarketingPlanVersions(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[0], v1);
  assert.deepEqual(versions[1], v2);
  const reportV1 = await planner.verifyMarketingPlanIntegrity(
    scopeOf('tenant-a'),
    planId('plan-1'),
    1,
  );
  assert.equal(reportV1!.status, 'intact');
});

test('revise with a stale supersedes version fails closed (optimistic concurrency)', async () => {
  const planner = plannerWith();
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  const firstRevision = expectPlan(
    await planner.reviseMarketingPlan({
      ...revisionInput(),
    }),
  );
  assert.equal(firstRevision.version, 2);
  const stale = expectError(
    await planner.reviseMarketingPlan({
      ...revisionInput(),
      supersedes: { planId: planId('plan-1'), version: 1 },
    }),
  );
  assert.equal(stale.error, 'marketing-plan-version-conflict');
});

test('revise on an unknown chain fails closed; cross-tenant is indistinguishable', async () => {
  const planner = plannerWith();
  const notFound = expectError(
    await planner.reviseMarketingPlan({ ...revisionInput() }),
  );
  assert.equal(notFound.error, 'marketing-plan-not-found');
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  const foreign = expectError(
    await planner.reviseMarketingPlan({
      ...revisionInput(),
      scope: scopeOf('tenant-b'),
    }),
  );
  assert.equal(foreign.error, 'marketing-plan-not-found');
});

test('a revision re-runs the health battery against CURRENT observations', async () => {
  // A STATEFUL health view: a confirmed restriction APPEARS after v1 was
  // composed (the honest shape — health evolves between plan versions).
  const observations: HealthObservation[] = [];
  const planner = createInMemoryMarketingPlanner({
    missions: missionsWith(missionFixture('draft', 'tenant-a')),
    productIntelligence: intelligenceWith(
      intelligenceRecord('pi-fact-1', 'cited-external-evidence'),
      intelligenceRecord('pi-metric-1', 'cited-external-evidence'),
      intelligenceRecord('pi-obs-1', 'cited-external-evidence'),
    ),
    health: {
      listHealthObservations: (
        scope: TenantScope,
        filter?: { readonly providerId?: ProviderId; readonly kind?: HealthObservation['kind'] },
      ): readonly HealthObservation[] =>
        observations.filter(
          (observation) =>
            observation.scope.tenantId === scope.tenantId &&
            (filter?.providerId === undefined || observation.providerId === filter.providerId) &&
            (filter?.kind === undefined || observation.kind === filter.kind),
        ),
    },
    now: () => NOW,
  });
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  observations.push(confirmedRestriction('health-new', 'provider-x'));
  const failure = expectError(await planner.reviseMarketingPlan(revisionInput()));
  assert.equal(failure.error, 'platform-under-confirmed-restriction');
  // Acknowledging the NEW restriction lets the revision through.
  const revised = expectPlan(
    await planner.reviseMarketingPlan({
      ...revisionInput(),
      platforms: [
        {
          platform: platform('provider-x'),
          rationale: 'Reach evidence is strongest on provider X.',
          evidence: [citation('pi-fact-1', 1)],
          acknowledgedRestrictions: [observationId('health-new')],
        },
      ],
    }),
  );
  assert.equal(revised.version, 2);
  assert.equal(revised.platforms[0]!.acknowledgedConfirmedRestrictions[0]!.observationId, 'health-new');
});

const revisionInput = (): Parameters<MarketingPlannerPort['reviseMarketingPlan']>[0] => ({
  scope: scopeOf('tenant-a'),
  supersedes: { planId: planId('plan-1'), version: 1 },
  mission: { missionId: missionId('mission-1'), recordVersion: 1 },
  objectiveAlignment: 'Revised alignment after new evidence.',
  platforms: [
    {
      platform: platform('provider-x'),
      rationale: 'Reach evidence is strongest on provider X.',
      evidence: [citation('pi-fact-1', 1)],
    },
  ],
  metricExpectations: [
    {
      metric: 'conversion',
      expectation: '150',
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
  revisedBy: actor('identity-planner'),
  note: null,
});

// ---------------------------------------------------------------------------
// §30 composition observability
// ---------------------------------------------------------------------------

test('every attributable attempt appends a §30 composition record — success AND rejection', async () => {
  const planner = plannerWith();
  expectPlan(await planner.composeMarketingPlan(composeInput()));
  const rejection = expectError(
    await planner.composeMarketingPlan(composeInput({ objectiveAlignment: '  ' })),
  );
  assert.equal(rejection.error, 'invalid-input');
  expectPlan(await planner.reviseMarketingPlan(revisionInput()));
  const log = planner.listMarketingPlanCompositionRecords(scopeOf('tenant-a'));
  assert.equal(log.length, 3);
  assert.deepEqual(
    log.map((entry) => [entry.attempt, entry.outcome]),
    [
      ['compose', 'recorded'],
      ['compose', 'rejected'],
      ['revise', 'recorded'],
    ],
  );
  assert.equal(log[0]!.resultVersion, 1);
  assert.equal(log[0]!.failure, null);
  assert.equal(log[1]!.resultVersion, null);
  assert.equal(log[1]!.failure!.error, 'invalid-input');
  assert.equal(log[2]!.resultVersion, 2);
  assert.ok(log.every((entry) => entry.adapterSource === 'in-memory-marketing-planner'));
  assert.ok(log.every((entry) => entry.actor === actor('identity-planner')));
  assert.ok(log.every((entry) => entry.at === NOW));
  assert.ok(log.every((entry) => Object.isFrozen(entry)));
  const filtered = planner.listMarketingPlanCompositionRecords(scopeOf('tenant-a'), {
    attempt: 'revise',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]!.attempt, 'revise');
  assert.equal(
    planner.listMarketingPlanCompositionRecords(scopeOf('tenant-b')).length,
    0,
  );
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('identical inputs on fresh planners produce identical digests (determinism)', async () => {
  const first = expectPlan(await plannerWith().composeMarketingPlan(composeInput()));
  const second = expectPlan(await plannerWith().composeMarketingPlan(composeInput()));
  assert.equal(first.recordDigest, second.recordDigest);
  assert.equal(first.composedAt, second.composedAt);
});
