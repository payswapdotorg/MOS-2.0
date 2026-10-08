/**
 * INTERNAL fail-closed battery for the W12-A marketing-planner adapter.
 * NOT exported from the package index — implementation detail, not surface.
 *
 * THE shared validation battery both compose and revise run against
 * CURRENT evidence and health, over the injected cross-authority views:
 *
 * 1. structural validation (marketing-plan-validation.ts);
 * 2. mission-citation resolution through the mission READ view — the exact
 *    cited version must resolve AND belong to the caller's tenant
 *    (cross-tenant ≡ unknown — no existence leak), and the mission must be
 *    in a plannable status (draft/active);
 * 3. evidence resolution through the product-intelligence authority's
 *    fail-closed versioned-citation resolution (the deduplicated union of
 *    every platform/expectation citation must resolve — never a fabricated
 *    basis);
 * 4. basis coherence — a cited-evidence metric expectation backed only by
 *    counterfactual-forecast records rejects;
 * 5. the health battery per platform — every acknowledged restriction must
 *    be an ACTUAL provider-CONFIRMED restriction observation of that
 *    provider in this tenant scope, and every confirmed restriction on
 *    that provider must be acknowledged (compliant maneuvers only);
 *    SUSPECTED anomalies never gate and snapshot advisory-only.
 */

import type { TenantScope } from '@mos/contracts';
import type {
  HealthObservation,
  ProviderConfirmedRestrictionObservation,
  SuspectedDistributionAnomalyObservation,
} from '@mos/distribution';
import type { ProductIntelligenceRecord, ProductIntelligenceVersionRef } from '@mos/product-intelligence';
import type {
  PlannedExperimentExpectation,
  PlannedMetricExpectation,
  PlannedPlatform,
} from '../domain/marketing-plan.js';
import type {
  MarketingPlannerError,
  MarketingPlannerHealthSource,
  MarketingPlannerIntelligenceSource,
  MarketingPlannerMissionSource,
} from '../ports/marketing-planner.port.js';
import { marketingPlannerFailure } from '../ports/marketing-planner.port.js';
import type { Mission } from '../domain/mission.js';
import type { ProposedPlanContent } from './marketing-plan-validation.js';
import { validateProposedPlanStructure } from './marketing-plan-validation.js';

/** The mission statuses a plan may be composed for. */
const PLANNABLE_STATUSES: readonly Mission['status'][] = ['draft', 'active'];

const isConfirmed = (
  observation: HealthObservation,
): observation is ProviderConfirmedRestrictionObservation =>
  observation.kind === 'provider-confirmed-restriction';

const isSuspected = (
  observation: HealthObservation,
): observation is SuspectedDistributionAnomalyObservation =>
  observation.kind === 'suspected-distribution-anomaly';

const citationKey = (citation: ProductIntelligenceVersionRef): string =>
  JSON.stringify([String(citation.recordId), citation.version]);

/** The validated material a successful battery run returns. */
export interface MarketingPlanBatteryOk {
  readonly ok: true;
  readonly missionRecord: Mission;
  readonly platforms: readonly PlannedPlatform[];
  readonly metricExpectations: readonly PlannedMetricExpectation[];
  readonly experimentExpectations: readonly PlannedExperimentExpectation[];
}

export type MarketingPlanBatteryResult =
  | MarketingPlanBatteryOk
  | { readonly ok: false; readonly error: MarketingPlannerError };

/** The injected cross-authority views the battery runs over. */
export interface MarketingPlanBatteryViews {
  readonly missions: MarketingPlannerMissionSource;
  readonly productIntelligence: MarketingPlannerIntelligenceSource;
  readonly health: MarketingPlannerHealthSource;
}

/** Run the full fail-closed battery; nothing is recorded on failure. */
export const runMarketingPlanBattery = async (
  views: MarketingPlanBatteryViews,
  scope: TenantScope,
  content: ProposedPlanContent,
): Promise<MarketingPlanBatteryResult> => {
  const structural = validateProposedPlanStructure(content);
  if (structural !== null) {
    return { ok: false, error: structural };
  }
  const citedMission = views.missions.getMission(
    content.mission.missionId,
    content.mission.recordVersion,
  );
  if (citedMission === null || citedMission.tenantId !== scope.tenantId) {
    return {
      ok: false,
      error: marketingPlannerFailure(
        'mission-citation-unresolvable',
        `mission citation does not resolve in this tenant scope: ${
          content.mission.missionId
        }@v${content.mission.recordVersion}`,
      ),
    };
  }
  if (!PLANNABLE_STATUSES.includes(citedMission.status)) {
    return {
      ok: false,
      error: marketingPlannerFailure(
        'mission-not-plannable',
        `mission ${content.mission.missionId} is '${citedMission.status}' — only draft/active missions take plans`,
      ),
    };
  }

  const allCitations: ProductIntelligenceVersionRef[] = [];
  for (const choice of content.platforms) {
    allCitations.push(...choice.evidence);
  }
  for (const expectation of content.metricExpectations) {
    allCitations.push(...expectation.evidence);
  }
  for (const expectation of content.experimentExpectations) {
    allCitations.push(...expectation.evidence);
  }
  const seen = new Set<string>();
  const deduplicated: ProductIntelligenceVersionRef[] = [];
  for (const citation of allCitations) {
    const key = citationKey(citation);
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(citation);
    }
  }
  const resolved = await views.productIntelligence.resolveProductIntelligenceCitations(
    scope,
    deduplicated,
  );
  if ('error' in resolved) {
    return {
      ok: false,
      error: marketingPlannerFailure(
        'evidence-citation-unresolvable',
        `plan evidence failed versioned-citation resolution: ${resolved.message}`,
        { error: resolved.error, message: resolved.message },
      ),
    };
  }
  const resolvedByKey = new Map<string, ProductIntelligenceRecord>(
    deduplicated.map((citation, index) => [citationKey(citation), resolved[index]!]),
  );

  for (const expectation of content.metricExpectations) {
    if (expectation.basis.basis === 'cited-evidence') {
      const hasCitedExternalEvidence = expectation.evidence.some(
        (citation) =>
          resolvedByKey.get(citationKey(citation))?.basis.basis === 'cited-external-evidence',
      );
      if (!hasCitedExternalEvidence) {
        return {
          ok: false,
          error: marketingPlannerFailure(
            'basis-evidence-mismatch',
            `metric expectation ${expectation.metric} claims cited evidence but cites only counterfactual-forecast records`,
          ),
        };
      }
    }
  }

  const platforms: PlannedPlatform[] = [];
  for (const choice of content.platforms) {
    const confirmed = views.health
      .listHealthObservations(scope, {
        providerId: choice.platform,
        kind: 'provider-confirmed-restriction',
      })
      .filter(isConfirmed);
    const suspected = views.health
      .listHealthObservations(scope, {
        providerId: choice.platform,
        kind: 'suspected-distribution-anomaly',
      })
      .filter(isSuspected);
    const acknowledged = new Set(
      (choice.acknowledgedRestrictions ?? []).map((id) => String(id)),
    );
    const confirmedIds = new Set(confirmed.map((observation) => String(observation.id)));
    for (const id of acknowledged) {
      if (!confirmedIds.has(id)) {
        return {
          ok: false,
          error: marketingPlannerFailure(
            'acknowledged-restriction-not-confirmed',
            `platform ${choice.platform}: acknowledged restriction ${id} is not a provider-confirmed restriction observation of this provider in this tenant scope`,
          ),
        };
      }
    }
    const unacknowledged = confirmed.filter(
      (observation) => !acknowledged.has(String(observation.id)),
    );
    if (unacknowledged.length > 0) {
      return {
        ok: false,
        error: marketingPlannerFailure(
          'platform-under-confirmed-restriction',
          `platform ${choice.platform} is under ${unacknowledged.length} unacknowledged provider-confirmed restriction(s): ${unacknowledged
            .map((observation) => String(observation.restrictionRef))
            .join(', ')} — acknowledge them or exclude the platform`,
        ),
      };
    }
    platforms.push({
      platform: choice.platform,
      rationale: choice.rationale,
      evidence: choice.evidence,
      acknowledgedConfirmedRestrictions: confirmed.map((observation) => ({
        observationId: String(observation.id),
        providerId: observation.providerId,
        channelRef: String(observation.channelRef),
        restrictionRef: String(observation.restrictionRef),
        observedAt: observation.observedAt,
        description: observation.description,
        source: observation.source,
        acknowledged: true,
      })),
      suspectedAnomaliesAtComposition: suspected.map((observation) => ({
        observationId: String(observation.id),
        providerId: observation.providerId,
        channelRef: String(observation.channelRef),
        derivationRuleId: observation.derivation.ruleId,
        suspectedAt: observation.suspectedAt,
        source: observation.source,
        suspectedNeverConfirmed: true,
      })),
    });
  }

  return {
    ok: true,
    missionRecord: citedMission,
    platforms,
    metricExpectations: content.metricExpectations,
    experimentExpectations: content.experimentExpectations,
  };
};
