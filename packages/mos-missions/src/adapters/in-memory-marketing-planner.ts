/**
 * The in-memory marketing-planner adapter (MARKETING-001, W12-A).
 *
 * W12-A DISCLOSURE — A PLANNER, NOT AN AUTHORITY OVER MISSIONS. This
 * adapter composes evidence-linked marketing plans and records them as
 * versioned tenant-scoped append-only digest-sealed records. The plan's
 * mission linkage is a VERSIONED CITATION resolved through the injected
 * mission READ view (`Pick<MissionRepository, 'getMission'>`): this
 * adapter never creates, transitions or re-specs a mission (no second
 * Mission authority — pinned by the authority battery). Evidence resolves
 * through the product-intelligence authority's fail-closed versioned
 * citation resolution; provider-CONFIRMED restrictions are acknowledged
 * from the distribution health surface's ACTUAL observations (compliant
 * maneuvers only — a plan element under an unacknowledged confirmed
 * restriction fails closed with the typed reason); SUSPECTED anomalies are
 * snapshotted as advisory data and NEVER treated as confirmed.
 *
 * APPEND-ONLY BY CONSTRUCTION: `composeMarketingPlan` starts a chain at
 * version 1; `reviseMarketingPlan` appends the next version after the
 * full fail-closed battery re-runs against CURRENT evidence and health.
 * There is NO update-or-delete surface; prior versions stay retrievable
 * and bit-for-bit immutable. Every attributable attempt (success OR typed
 * rejection) appends a §30 composition record — there is no unrecorded
 * path.
 *
 * W9-B/W10-B disciplines by construction: plan chains are keyed by JSON
 * array keys (injective over `(tenant, plan id)` — hostile
 * delimiter-laden tenant ids can never alias another tenant's chain);
 * listings compare the STORED record's tenant EXACTLY; stored records are
 * clone-then-deep-frozen (own-property-safe — `__proto__`-carrying
 * payloads stay inert); the record owns a FROZEN COPY of the caller's
 * scope; every numeric input passes a finite/integer guard; the
 * acknowledged-vs-confirmed comparisons are element-wise over ids.
 *
 * Ephemeral process-local scaffold (durable persistence is TL-owned). The
 * cross-authority views (`@mos/product-intelligence`, `@mos/distribution`)
 * are injected — TYPE-ONLY imports, zero runtime coupling (the disclosed
 * devDependencies exist solely so the type-level seams resolve; the
 * emitted code never imports the sibling packages).
 */

import type { TenantScope, Timestamp } from '@mos/contracts';
import type {
  MarketingPlanCompositionRecord,
  MarketingPlanId,
  MarketingPlanRecord,
  MissionCitation,
  PlannedPlatform,
} from '../domain/marketing-plan.js';
import type {
  ComposeMarketingPlanInput,
  MarketingCompositionFilter,
  MarketingPlannerError,
  MarketingPlannerHealthSource,
  MarketingPlannerIntelligenceSource,
  MarketingPlannerMissionSource,
  MarketingPlannerPort,
  MarketingPlanIntegrityReport,
  ReviseMarketingPlanInput,
} from '../ports/marketing-planner.port.js';
import { marketingPlannerFailure } from '../ports/marketing-planner.port.js';
import type { Mission } from '../domain/mission.js';
import type { ProposedPlanContent } from './marketing-plan-validation.js';
import { runMarketingPlanBattery } from './marketing-planner-battery.js';
import { cloneDeep, deepFreeze, digestOf } from './marketing-planner-support.js';

/** Options for {@link createInMemoryMarketingPlanner}. */
export interface InMemoryMarketingPlannerOptions {
  /** The mission READ view (the planner's only mission surface). */
  readonly missions: MarketingPlannerMissionSource;
  /** The product-intelligence citation-resolution view (§25). */
  readonly productIntelligence: MarketingPlannerIntelligenceSource;
  /** The distribution health observation view (HEALTH-001). */
  readonly health: MarketingPlannerHealthSource;
  /** Injectable clock for deterministic `composedAt` / `at` stamps. */
  readonly now?: () => Timestamp;
}

/** The honest self-label of this disclosed in-memory adapter (§30 provenance). */
export const IN_MEMORY_MARKETING_PLANNER_SOURCE = 'in-memory-marketing-planner';

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The deterministic digest of one plan record payload (sans digest field). */
export const marketingPlanDigestOf = (record: MarketingPlanRecord): string => {
  const payload: Record<string, unknown> = { ...record };
  delete payload.recordDigest;
  return digestOf(payload);
};

export function createInMemoryMarketingPlanner(
  options: InMemoryMarketingPlannerOptions,
): MarketingPlannerPort {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);

  /**
   * Plan chains keyed by JSON array `[tenantId, planId]` (W9-B D1:
   * injective over the tuple — a hostile tenant id containing ANY
   * delimiter can never alias another tenant's chain).
   */
  const chains = new Map<string, MarketingPlanRecord[]>();
  /** The tenant-scoped §30 composition log (ascending append order). */
  const compositionLog: MarketingPlanCompositionRecord[] = [];
  /** Per-tenant §30 attempt counters (deterministic ids). */
  const attemptCounters = new Map<string, number>();

  const chainKey = (scope: TenantScope, id: string): string =>
    JSON.stringify([scope.tenantId as string, id as string]);

  const chainOf = (scope: TenantScope, id: string): readonly MarketingPlanRecord[] =>
    chains.get(chainKey(scope, id)) ?? [];

  const latestOf = (chain: readonly MarketingPlanRecord[]): MarketingPlanRecord | null =>
    chain.length === 0 ? null : chain[chain.length - 1]!;

  const appendComposition = (
    scope: TenantScope,
    planId: MarketingPlanId,
    attempt: 'compose' | 'revise',
    outcome: 'recorded' | 'rejected',
    resultVersion: number | null,
    failure: { readonly error: string; readonly message: string } | null,
    mission: MissionCitation | null,
    actor: ComposeMarketingPlanInput['composedBy'],
  ): void => {
    const tenant = scope.tenantId as string;
    const attemptNumber = (attemptCounters.get(tenant) ?? 0) + 1;
    attemptCounters.set(tenant, attemptNumber);
    const record: MarketingPlanCompositionRecord = deepFreeze(
      cloneDeep({
        id: String(attemptNumber),
        scope: Object.freeze({ ...scope }),
        planId,
        attempt,
        outcome,
        resultVersion,
        failure,
        mission,
        actor,
        at: now(),
        adapterSource: IN_MEMORY_MARKETING_PLANNER_SOURCE,
      }),
    ) as MarketingPlanCompositionRecord;
    compositionLog.push(record);
  };

  const assembleRecord = (
    scope: TenantScope,
    id: MarketingPlanId,
    version: number,
    missionRecord: Mission,
    content: ProposedPlanContent,
    platforms: readonly PlannedPlatform[],
    composedBy: ComposeMarketingPlanInput['composedBy'],
    supersedes: { readonly planId: MarketingPlanId; readonly version: number } | null,
    note: string | null,
  ): MarketingPlanRecord => {
    const draft: Omit<MarketingPlanRecord, 'recordDigest'> & { recordDigest: string } = {
      id,
      version: version as MarketingPlanRecord['version'],
      tenantId: scope.tenantId,
      scope: Object.freeze({ ...scope }),
      mission: content.mission,
      missionStatusAtComposition: missionRecord.status,
      objectiveAlignment: content.objectiveAlignment,
      platforms,
      metricExpectations: content.metricExpectations,
      experimentExpectations: content.experimentExpectations,
      composedBy,
      composedAt: now(),
      supersedes,
      note,
      recordDigest: 'pending',
      planKind: 'marketing-mission-plan',
      disclosure: 'evidence-linked-mission-cited-marketing-plan',
      boundaryStatement:
        'this plan cites its mission through the mission authority and creates no parallel mission record; platform and expectation evidence resolves through product-intelligence versioned citations; provider-confirmed restrictions are acknowledged from observable health records while suspected anomalies stay advisory, never confirmed (MARKETING-001; §25/§31)',
    };
    const digest = marketingPlanDigestOf(draft);
    const sealed: MarketingPlanRecord = { ...draft, recordDigest: digest };
    return deepFreeze(cloneDeep(sealed)) as MarketingPlanRecord;
  };

  return {
    async composeMarketingPlan(
      input: ComposeMarketingPlanInput,
    ): Promise<MarketingPlanRecord | MarketingPlannerError> {
      const content: ProposedPlanContent & { readonly note?: string | null } = {
        mission: input.mission,
        objectiveAlignment: input.objectiveAlignment,
        platforms: input.platforms,
        metricExpectations: input.metricExpectations,
        experimentExpectations: input.experimentExpectations,
        note: input.note,
      };
      const battery = await runMarketingPlanBattery(options, input.scope, content);
      if (!battery.ok) {
        appendComposition(
          input.scope,
          input.id,
          'compose',
          'rejected',
          null,
          { error: battery.error.error, message: battery.error.message },
          input.mission,
          input.composedBy,
        );
        return battery.error;
      }
      if (chainOf(input.scope, input.id as string).length > 0) {
        const error = marketingPlannerFailure(
          'duplicate-marketing-plan',
          `marketing plan already exists: ${input.id}`,
        );
        appendComposition(
          input.scope,
          input.id,
          'compose',
          'rejected',
          null,
          { error: error.error, message: error.message },
          input.mission,
          input.composedBy,
        );
        return error;
      }
      const record = assembleRecord(
        input.scope,
        input.id,
        1,
        battery.missionRecord,
        content,
        battery.platforms,
        input.composedBy,
        null,
        input.note ?? null,
      );
      chains.set(chainKey(input.scope, input.id as string), [record]);
      appendComposition(
        input.scope,
        input.id,
        'compose',
        'recorded',
        1,
        null,
        input.mission,
        input.composedBy,
      );
      return record;
    },

    async reviseMarketingPlan(
      input: ReviseMarketingPlanInput,
    ): Promise<MarketingPlanRecord | MarketingPlannerError> {
      const content: ProposedPlanContent & { readonly note?: string | null } = {
        mission: input.mission,
        objectiveAlignment: input.objectiveAlignment,
        platforms: input.platforms,
        metricExpectations: input.metricExpectations,
        experimentExpectations: input.experimentExpectations,
        note: input.note,
      };
      const reject = (error: MarketingPlannerError): MarketingPlannerError => {
        appendComposition(
          input.scope,
          input.supersedes.planId,
          'revise',
          'rejected',
          null,
          { error: error.error, message: error.message },
          input.mission,
          input.revisedBy,
        );
        return error;
      };
      if (
        typeof input.supersedes.planId !== 'string' ||
        input.supersedes.planId.trim().length === 0 ||
        typeof input.supersedes.version !== 'number' ||
        !Number.isInteger(input.supersedes.version) ||
        input.supersedes.version < 1
      ) {
        return reject(
          marketingPlannerFailure(
            'invalid-input',
            'supersedes must carry a non-blank planId and an integer version >= 1',
          ),
        );
      }
      const chain = chains.get(chainKey(input.scope, input.supersedes.planId as string));
      const latest = chain === undefined ? null : latestOf(chain);
      if (latest === null) {
        return reject(
          marketingPlannerFailure(
            'marketing-plan-not-found',
            `marketing plan does not exist in this tenant scope: ${input.supersedes.planId}`,
          ),
        );
      }
      if (input.supersedes.version !== latest.version) {
        return reject(
          marketingPlannerFailure(
            'marketing-plan-version-conflict',
            `supersedes.version must be the chain's latest: expected ${latest.version}, got ${input.supersedes.version}`,
          ),
        );
      }
      const battery = await runMarketingPlanBattery(options, input.scope, content);
      if (!battery.ok) {
        return reject(battery.error);
      }
      const record = assembleRecord(
        input.scope,
        input.supersedes.planId,
        latest.version + 1,
        battery.missionRecord,
        content,
        battery.platforms,
        input.revisedBy,
        { planId: input.supersedes.planId, version: input.supersedes.version },
        input.note ?? null,
      );
      chain!.push(record);
      appendComposition(
        input.scope,
        input.supersedes.planId,
        'revise',
        'recorded',
        record.version,
        null,
        input.mission,
        input.revisedBy,
      );
      return record;
    },

    async getMarketingPlan(
      scope: TenantScope,
      id: MarketingPlanId,
      version?: number,
    ): Promise<MarketingPlanRecord | null> {
      const chain = chainOf(scope, id as string);
      if (chain.length === 0) {
        return null;
      }
      if (version === undefined) {
        return latestOf(chain);
      }
      return chain.find((record) => record.version === version) ?? null;
    },

    async listMarketingPlanVersions(
      scope: TenantScope,
      id: MarketingPlanId,
    ): Promise<readonly MarketingPlanRecord[]> {
      return [...chainOf(scope, id as string)];
    },

    async listMarketingPlansForMission(
      scope: TenantScope,
      missionId: MissionCitation['missionId'],
    ): Promise<readonly MarketingPlanRecord[]> {
      const latest: MarketingPlanRecord[] = [];
      for (const chain of chains.values()) {
        const newest = latestOf(chain);
        if (
          newest !== null &&
          newest.tenantId === scope.tenantId &&
          newest.mission.missionId === missionId
        ) {
          latest.push(newest);
        }
      }
      return latest.sort((a, b) => compareStrings(a.id as string, b.id as string));
    },

    async listMarketingPlans(scope: TenantScope): Promise<readonly MarketingPlanRecord[]> {
      const latest: MarketingPlanRecord[] = [];
      for (const chain of chains.values()) {
        const newest = latestOf(chain);
        if (newest !== null && newest.tenantId === scope.tenantId) {
          latest.push(newest);
        }
      }
      return latest.sort((a, b) => compareStrings(a.id as string, b.id as string));
    },

    async verifyMarketingPlanIntegrity(
      scope: TenantScope,
      id: MarketingPlanId,
      version?: number,
    ): Promise<MarketingPlanIntegrityReport | null> {
      const chain = chainOf(scope, id as string);
      const record = (
        version === undefined ? latestOf(chain) : chain.find((entry) => entry.version === version)
      ) ?? null;
      if (record === null) {
        return null;
      }
      const recomputed = marketingPlanDigestOf(record);
      return {
        planId: record.id,
        version: record.version,
        status: recomputed === record.recordDigest ? 'intact' : 'tampered',
        recordedDigest: record.recordDigest,
        recomputedDigest: recomputed,
      };
    },

    listMarketingPlanCompositionRecords(
      scope: TenantScope,
      filter?: MarketingCompositionFilter,
    ): readonly MarketingPlanCompositionRecord[] {
      return compositionLog.filter(
        (record) =>
          record.scope.tenantId === scope.tenantId &&
          (filter?.planId === undefined || record.planId === filter.planId) &&
          (filter?.attempt === undefined || record.attempt === filter.attempt),
      );
    },
  };
}
