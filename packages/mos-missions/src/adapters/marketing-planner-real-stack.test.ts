/**
 * The W12-A marketing-planner REAL-STACK compat battery.
 *
 * The planner's three injected views are the REAL in-memory authorities:
 * the REAL mission repository (this package), the REAL product-intelligence
 * adapter (packages/mos-product-intelligence) and the REAL distribution
 * health surface (packages/mos-distribution) — composed end-to-end: real
 * mission → real evidence-linked intelligence records (fact + metric +
 * counterfactual forecast, cited as exact versions) → real provider-
 * confirmed restriction + real DERIVED suspected anomaly → a plan that
 * acknowledges the confirmed restriction and snapshots the suspected one.
 *
 * Runtime imports of the siblings use the RELATIVE BUILT-DIST paths (the
 * disclosed @mos/web / @mos/studio testing-seam pattern: the siblings'
 * exports maps point their runtime condition at untranspiled src/, which
 * node cannot execute); type imports stay on the package names (erased at
 * compile time). The sibling packages remain devDependencies — TYPE-ONLY
 * seams; the planner's own emitted code never imports them.
 *
 * The rights source inside the product-intelligence adapter is the same
 * DISCLOSED STRUCTURAL DOUBLE of `Pick<RightsRepository, 'getRights'>`
 * its own battery uses (the composition root wires the real one; a real
 * grant satisfies the same shape).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryMarketingPlanner } from './in-memory-marketing-planner.js';
import { createInMemoryMissionRepository } from './in-memory-mission-repository.js';
import type { ComposeMarketingPlanInput } from '../ports/marketing-planner.port.js';
import type { MarketingPlanId, MarketingPlanRecord } from '../domain/marketing-plan.js';
import type { MissionId } from '../domain/mission.js';
import type { ProductIntelligenceRecord } from '@mos/product-intelligence';
import type { ProductIntelligenceVersionRef } from '@mos/product-intelligence';
import type { HealthObservationId } from '@mos/distribution';
import type { IdentityRef, ProviderId, TenantId, TenantScope, Timestamp } from '@mos/contracts';

// REAL sibling authorities — relative built-dist runtime imports (disclosed).
import { createInMemoryProductIntelligence } from '../../../mos-product-intelligence/dist/index.js';
import { createInMemoryHealthSurface } from '../../../mos-distribution/dist/index.js';
import { deriveObservationAbsence } from '../../../mos-distribution/dist/index.js';
import type {
  InMemoryProductIntelligenceOptions,
} from '../../../mos-product-intelligence/dist/index.js';
import type { InMemoryHealthSurfaceOptions } from '../../../mos-distribution/dist/index.js';

const NOW = '2026-06-20T10:00:00.000Z' as Timestamp;
const tenantId = (value: string): TenantId => value as TenantId;
const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });
const planId = (value: string): MarketingPlanId => value as MarketingPlanId;
const missionId = (value: string): MissionId => value as MissionId;
const actor = (value: string): IdentityRef => value as IdentityRef;

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE of the product-intelligence rights
 * source (the `Pick<RightsRepository, 'getRights'>` view) — the same
 * fixture shape the product-intelligence battery uses.
 */
const rightsWith = (
  ...grants: readonly object[]
): InMemoryProductIntelligenceOptions['rights'] =>
  ({
    getRights: (ref: unknown): object | null =>
      grants.find((grant) => (grant as { readonly id?: unknown }).id === ref) ?? null,
  }) as unknown as InMemoryProductIntelligenceOptions['rights'];

const grantFixture = (id: string): object => ({
  id,
  tenantId: tenantId('tenant-a'),
  version: 1,
  scope: {
    actions: ['analyze'],
    subjectRefs: [
      'analytics://platform/reach-report-1',
      'analytics://platform/conversion-window',
      'transcript://studio/session-7',
      'model://forecasts/reach-ensemble-v3',
    ],
  },
  grantee: 'identity-analyst',
  sourceRefs: ['license://holder-v2/doc-9'],
  terms: { attributionRequired: false, commercialUseAllowed: true, derivationAllowed: true, notes: null },
  grantedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
});

test('compose through the REAL mission, product-intelligence and health authorities', async () => {
  // ---- the REAL mission authority ----
  const missions = createInMemoryMissionRepository({ now: () => NOW });
  const mission = missions.createMission({
    scope: scopeOf('tenant-a'),
    id: missionId('mission-1'),
    objective: {
      statement: 'Grow qualified signups for the Q4 podcast editing pilot',
      targetMetrics: [{ metric: 'conversion', target: '250', unit: 'count', horizon: '2026-12-31' }],
      constraints: [{ kind: 'budget', description: 'Hard ceiling 5000 EUR total.' }],
    },
    rewardSpec: {
      version: 1,
      terms: [
        { metric: 'conversion', weight: 0.6, direction: 'maximize', definition: 'Signups.' },
        { metric: 'cost', weight: 0.4, direction: 'minimize', definition: 'Total spend.' },
      ],
    },
  });
  assert.ok(!('error' in mission));

  // ---- the REAL product-intelligence authority (rights double inside it) ----
  const intelligence = createInMemoryProductIntelligence({
    rights: rightsWith(grantFixture('rights://analyze/product-course')),
    now: () => NOW,
  });
  const recordIntelligence = async (
    id: string,
    content: object,
    sourceKind: string,
    basis: object,
  ): Promise<ProductIntelligenceRecord> => {
    const result = await intelligence.recordProductIntelligence({
      scope: scopeOf('tenant-a'),
      id: id as ProductIntelligenceRecord['id'],
      subject: 'product://course/masterclass' as ProductIntelligenceRecord['subject'],
      content: content as ProductIntelligenceRecord['content'],
      source: { sourceKind, sourceRefs: ['analytics://platform/reach-report-1'] } as never,
      basis: basis as ProductIntelligenceRecord['basis'],
      rightsRef: 'rights://analyze/product-course' as never,
      recordedBy: 'identity-analyst' as never,
    });
    assert.ok(!('error' in result));
    return result;
  };
  const fact = await recordIntelligence(
    'pi-fact-1',
    {
      kind: 'product-fact',
      statement: 'the landing page leads with the three-format promise',
      evidenceRefs: ['analytics://platform/reach-report-1'],
    },
    'platform-analytics',
    { basis: 'cited-external-evidence', counterfactual: false, observedAt: NOW },
  );
  const metric = await recordIntelligence(
    'pi-metric-1',
    {
      kind: 'product-metric',
      metric: 'qualified-reach',
      value: 1200,
      unit: 'people',
      window: '2026-06-01..2026-06-30',
      evidenceRefs: ['analytics://platform/conversion-window'],
    },
    'platform-analytics',
    { basis: 'cited-external-evidence', counterfactual: false, observedAt: NOW },
  );
  const forecast = await recordIntelligence(
    'pi-forecast-1',
    {
      kind: 'product-observation',
      narrative: 'ensemble projects reach scaling sub-linearly beyond 5 posts/week',
      evidenceRefs: ['model://forecasts/reach-ensemble-v3'],
    },
    'forecast-model',
    {
      basis: 'counterfactual-forecast',
      counterfactual: true,
      methodNote: 'seed-swept ensemble mean over the declared world-model set',
    },
  );

  // ---- the REAL distribution health surface ----
  const healthOptions: InMemoryHealthSurfaceOptions = { now: () => NOW };
  const health = createInMemoryHealthSurface(healthOptions);
  const confirmed = health.recordConfirmedRestriction(scopeOf('tenant-a'), {
    restriction: {
      id: 'restriction://no-unattended-bursts' as never,
      scope: scopeOf('tenant-a'),
      channelRef: 'channel-provider-x' as never,
      providerId: 'provider-x' as ProviderId,
      observedAt: NOW,
      description: 'no unattended promotional bursts on this channel',
      recordedAt: NOW,
      source: 'provider-profile-statement',
    },
  });
  assert.ok(confirmed.ok);
  const confirmedId: HealthObservationId = confirmed.observation.id;
  const absence = deriveObservationAbsence({
    channelRef: 'channel-provider-x' as never,
    observations: [],
    windowMs: 3_600_000,
    evaluatedAt: NOW,
  });
  assert.notEqual(absence, null);
  const suspected = health.recordSuspectedAnomaly(scopeOf('tenant-a'), {
    derivation: absence!,
    providerId: 'provider-x' as ProviderId,
    source: 'health-derivation-runner',
  });
  assert.ok(suspected.ok);

  // ---- the planner over the three REAL views ----
  const planner = createInMemoryMarketingPlanner({
    missions,
    productIntelligence: intelligence,
    health,
    now: () => NOW,
  });
  const input: ComposeMarketingPlanInput = {
    scope: scopeOf('tenant-a'),
    id: planId('plan-1'),
    mission: { missionId: missionId('mission-1'), recordVersion: 1 },
    objectiveAlignment: 'Provider-X pilot driving conversion through cited reach evidence.',
    platforms: [
      {
        platform: 'provider-x' as ProviderId,
        rationale: 'Reach evidence is strongest on provider X.',
        evidence: [{ recordId: fact.id, version: fact.version } as ProductIntelligenceVersionRef],
        acknowledgedRestrictions: [confirmedId],
      },
    ],
    metricExpectations: [
      {
        metric: 'conversion',
        expectation: '120',
        unit: 'count',
        basis: { basis: 'cited-evidence', counterfactual: false, observedAt: NOW },
        evidence: [{ recordId: metric.id, version: metric.version } as ProductIntelligenceVersionRef],
      },
      {
        metric: 'qualified-reach',
        expectation: '8000',
        unit: 'people',
        basis: {
          basis: 'counterfactual-forecast',
          counterfactual: true,
          methodNote: 'seed-swept ensemble mean over the declared world-model set',
        },
        evidence: [
          { recordId: forecast.id, version: forecast.version } as ProductIntelligenceVersionRef,
        ],
      },
    ],
    experimentExpectations: [
      {
        question: 'Does long-form outperform short-form on provider X?',
        successCriterion: 'Qualified signups per 1k reach, +15% at 95% confidence.',
        evidence: [{ recordId: fact.id, version: fact.version } as ProductIntelligenceVersionRef],
      },
    ],
    composedBy: actor('identity-planner'),
    note: 'real-stack composition',
  };
  const plan: MarketingPlanRecord | { readonly error: string; readonly message: string } =
    await planner.composeMarketingPlan(input);
  assert.ok(!('error' in plan));

  // The plan cites the REAL mission version and REAL intelligence versions.
  assert.deepEqual(plan.mission, { missionId: missionId('mission-1'), recordVersion: 1 });
  assert.equal(plan.platforms[0]!.evidence[0]!.recordId, fact.id);
  assert.equal(plan.metricExpectations[0]!.evidence[0]!.recordId, metric.id);
  assert.equal(plan.metricExpectations[1]!.basis.counterfactual, true);

  // The acknowledged restriction is the REAL confirmed observation.
  const snapshot = plan.platforms[0]!.acknowledgedConfirmedRestrictions[0]!;
  assert.equal(snapshot.observationId, String(confirmedId));
  assert.equal(snapshot.description, 'no unattended promotional bursts on this channel');

  // The REAL derived suspected anomaly is snapshotted advisory-only.
  const suspicion = plan.platforms[0]!.suspectedAnomaliesAtComposition[0]!;
  assert.equal(suspicion.observationId, String(suspected.observation.id));
  assert.equal(suspicion.derivationRuleId, 'observation-absence');
  assert.equal(suspicion.suspectedNeverConfirmed, true);

  // Integrity + §30 over the real stack.
  const report = await planner.verifyMarketingPlanIntegrity(scopeOf('tenant-a'), planId('plan-1'));
  assert.equal(report!.status, 'intact');
  const log = planner.listMarketingPlanCompositionRecords(scopeOf('tenant-a'));
  assert.equal(log.length, 1);
  assert.equal(log[0]!.outcome, 'recorded');

  // The REAL mission authority is untouched by planning.
  assert.deepEqual(missions.listMissions(scopeOf('tenant-a')).length, 1);
  const missionAfter = missions.getMission(missionId('mission-1'));
  assert.equal(missionAfter!.status, 'draft');
  assert.equal(missionAfter!.version, 1);
});

test('a plan citing a MISSING intelligence version fails closed against the REAL authority', async () => {
  const missions = createInMemoryMissionRepository({ now: () => NOW });
  missions.createMission({
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
  const intelligence = createInMemoryProductIntelligence({
    rights: rightsWith(grantFixture('rights://analyze/product-course')),
    now: () => NOW,
  });
  const recorded = await intelligence.recordProductIntelligence({
    scope: scopeOf('tenant-a'),
    id: 'pi-fact-1' as ProductIntelligenceRecord['id'],
    subject: 'product://course/masterclass' as ProductIntelligenceRecord['subject'],
    content: {
      kind: 'product-fact',
      statement: 'the landing page leads with the three-format promise',
      evidenceRefs: ['analytics://platform/reach-report-1'],
    } as ProductIntelligenceRecord['content'],
    source: {
      sourceKind: 'platform-analytics',
      sourceRefs: ['analytics://platform/reach-report-1'],
    } as never,
    basis: { basis: 'cited-external-evidence', counterfactual: false, observedAt: NOW } as never,
    rightsRef: 'rights://analyze/product-course' as never,
    recordedBy: 'identity-analyst' as never,
  });
  assert.ok(!('error' in recorded));
  const planner = createInMemoryMarketingPlanner({
    missions,
    productIntelligence: intelligence,
    health: createInMemoryHealthSurface({ now: () => NOW }),
    now: () => NOW,
  });
  const failure = await planner.composeMarketingPlan({
    scope: scopeOf('tenant-a'),
    id: planId('plan-1'),
    mission: { missionId: missionId('mission-1'), recordVersion: 1 },
    objectiveAlignment: 'Provider-X pilot.',
    platforms: [
      {
        platform: 'provider-x' as ProviderId,
        rationale: 'Cites a version that does not exist.',
        evidence: [{ recordId: 'pi-fact-1' as never, version: 99 }],
      },
    ],
    metricExpectations: [
      {
        metric: 'conversion',
        expectation: '120',
        unit: 'count',
        basis: { basis: 'cited-evidence', counterfactual: false, observedAt: NOW },
        evidence: [{ recordId: 'pi-fact-1' as never, version: 1 }],
      },
    ],
    experimentExpectations: [
      {
        question: 'Does long-form outperform short-form?',
        successCriterion: '+15% at 95% confidence.',
        evidence: [{ recordId: 'pi-fact-1' as never, version: 1 }],
      },
    ],
    composedBy: actor('identity-planner'),
    note: null,
  });
  assert.ok('error' in failure);
  assert.equal(failure.error, 'evidence-citation-unresolvable');
  assert.equal(failure.cause?.error, 'citation-not-found');
  // The rejected attempt is still §30-recorded; nothing was stored.
  const log = planner.listMarketingPlanCompositionRecords(scopeOf('tenant-a'));
  assert.equal(log.length, 1);
  assert.equal(log[0]!.outcome, 'rejected');
  assert.equal(await planner.listMarketingPlans(scopeOf('tenant-a')).then((plans) => plans.length), 0);
});
