import type { TenantScope } from '@mos/contracts';
import type {
  MarketingPlanView,
  PlanAuthorityPort,
  PlanUnresolved,
  PlanVersionRef,
  PlatformChoice,
  PlatformRole,
  MetricSpec,
  CounterfactualForecast,
  PlanDeadline,
  MissionRepository,
  MarketingPlannerPort,
  MarketingPlanRecord,
  ProductIntelligenceCitation,
} from '@mos/missions';
import type { ProductIntelligenceVersionRef } from '../../mos-product-intelligence/dist/index.js';

/**
 * The plan→view bridge (the CONSOLE wave, Worker C — the TL's D7 decision):
 * the PlanAuthorityPort binding that projects a REAL MARKETING-001 plan
 * RECORD + the composition's DECLARED plan-linkage ledger entry + the cited
 * MISSION record into the MarketingPlanView the PROD-003 compiler consumes.
 *
 * WHY THE BRIDGE EXISTS (disclosed): MarketingPlanRecord carries NO
 * experiment ids, no per-platform compile dimensions (role / channels /
 * declared production days / cost per action) and no metric windows — the
 * compiler's view shape requires them. The compose-plan declaration's
 * DECLARED JSON carries those dimensions alongside the planner's own
 * PlatformChoiceInput / MetricExpectationInput fields, and the composition
 * records them in the plan-linkage ledger at compose time (planId →
 * experimentRefs + platform views + metric windows — per-load in-process
 * state exactly like the wave-21 intent ledger, DISCLOSED). The bridge then
 * derives every view field honestly:
 *  - `missionSummary` — from the cited mission record (the mission
 *    authority's own objective statement);
 *  - `platformChoices` — the record's platforms + the DECLARED per-platform
 *    dimensions (role / channels / days / cost / model preference) and the
 *    platform's first product-intelligence citation;
 *  - `metrics` — the record's metric expectations + the DECLARED windows,
 *    with the target derived from the declared expectation value;
 *  - `experimentRefs` — the DECLARED experiment refs (the D7 linkage: the
 *    real experiments the plan's expectations are decided by; the
 *    compiler's own experiments gate then validates them fail-closed);
 *  - `counterfactualForecasts` — the record's counterfactual-basis metric
 *    expectations (the method note is the scenario, the declared value the
 *    forecast value, the first citation the basis — §22 labels verbatim);
 *  - `budget` — derived from the cited MISSION's budget constraint (the
 *    strict `<ISO-4217> <amount>` grammar; unparsable/absent ⇒ the typed
 *    plan-shape-invalid issue, never a fabricated ceiling);
 *  - `deadlines` — derived from the cited mission's target-metric horizons
 *    (mission-scope deadlines; the compile-time future check stays the
 *    compiler's own);
 *  - `delayPolicy` / `modelPreferences` — optional, omitted (the compile
 *    intent supplies the disclosed standard model defaults; EVD runs on
 *    the declared deadlines with the documented no-delay-policy default).
 *
 * A plan whose linkage ledger entry is missing (composed through the
 * composition's runtime observability rather than the intent) resolves as
 * `plan-shape-invalid` with the named issue — never a fabricated view.
 */

// ---------------------------------------------------------------------------
// The DECLARED plan-linkage ledger (per-load in-process state — disclosed)
// ---------------------------------------------------------------------------

/** The declared per-platform compile dimensions of one platform choice. */
export interface DeclaredPlatformView {
  readonly role: PlatformRole;
  readonly channels: readonly string[];
  readonly declaredProductionDays: number;
  readonly declaredCostPerAction: number;
  readonly modelPreference?: string;
}

/** The declared measurement window of one metric expectation. */
export interface DeclaredMetricView {
  readonly platformId: string;
  readonly window: { readonly opensAt: string; readonly closesAt: string };
}

/** One plan's declared linkage entry (recorded at compose-plan success). */
export interface PlanLinkage {
  readonly experimentRefs: readonly string[];
  readonly platformViews: ReadonlyMap<string, DeclaredPlatformView>;
  readonly metricViews: ReadonlyMap<string, DeclaredMetricView>;
}

/** The plan-linkage ledger (planId → the declared linkage entry). */
export interface PlanLinkageLedger {
  /** Record one plan's declared linkage (compose-plan success only). */
  record(planId: string, linkage: PlanLinkage): void;
  /** Read one plan's declared linkage, or `undefined` when none recorded. */
  get(planId: string): PlanLinkage | undefined;
}

/** Build the composition-local plan-linkage ledger. */
export function createPlanLinkageLedger(): PlanLinkageLedger {
  const entries = new Map<string, PlanLinkage>();
  return {
    record(planId, linkage) {
      entries.set(planId, linkage);
    },
    get(planId) {
      return entries.get(planId);
    },
  };
}

// ---------------------------------------------------------------------------
// The mission-derived budget + deadlines (honest derivations, disclosed)
// ---------------------------------------------------------------------------

/** Parse one mission budget constraint (`<ISO-4217> <amount>`) or `null`. */
export function missionBudgetOf(
  mission: { readonly objective: { readonly constraints: readonly { readonly kind: string; readonly description: string }[] } } | null,
): { readonly currency: string; readonly totalCeiling: number } | null {
  if (mission === null) {
    return null;
  }
  for (const constraint of mission.objective.constraints) {
    if (constraint.kind !== 'budget') {
      continue;
    }
    const match = /^([A-Za-z]{3})\s+([0-9]+(?:\.[0-9]+)?)$/.exec(constraint.description.trim());
    if (match !== null) {
      return { currency: match[1]!, totalCeiling: Number(match[2]) };
    }
  }
  return null;
}

/** The mission-scope deadlines from the mission's target-metric horizons. */
export function missionDeadlinesOf(
  mission: {
    readonly objective: {
      readonly targetMetrics: readonly {
        readonly metric: string;
        readonly horizon: string | null;
      }[];
    };
  } | null,
): readonly PlanDeadline[] {
  if (mission === null) {
    return [];
  }
  const deadlines: PlanDeadline[] = [];
  for (const metric of mission.objective.targetMetrics) {
    if (metric.horizon === null || metric.horizon.trim() === '') {
      continue;
    }
    deadlines.push({
      deadlineId: `mission-horizon:${metric.metric}`,
      dueAt: metric.horizon,
      scope: 'mission',
    });
  }
  return deadlines;
}

// ---------------------------------------------------------------------------
// The PlanAuthorityPort bridge
// ---------------------------------------------------------------------------

/** The citation helper: the first evidence ref of a plan element. */
const citationOf = (
  evidence: readonly ProductIntelligenceVersionRef[],
): ProductIntelligenceCitation => ({
  kind: 'product-intelligence-citation',
  recordId: String(evidence[0]?.recordId ?? ''),
  recordVersion: Number(evidence[0]?.version ?? 0),
});

/** Build the plan→view bridge over the REAL planner + the linkage ledger. */
export function createPlanAuthorityBridge(options: {
  readonly scope: TenantScope;
  readonly planner: MarketingPlannerPort;
  readonly missions: MissionRepository;
  readonly linkage: PlanLinkageLedger;
}): PlanAuthorityPort {
  const { scope, planner, missions, linkage } = options;

  return {
    async resolveMarketingPlan(
      ref: PlanVersionRef,
      tenantId: string,
    ): Promise<MarketingPlanView | PlanUnresolved> {
      const record = await planner.getMarketingPlan(
        { tenantId: tenantId as never } as TenantScope,
        ref.planId as never,
        ref.version,
      );
      if (record === null) {
        return { kind: 'plan-not-found', planId: ref.planId, version: ref.version };
      }
      if (String(record.tenantId) !== tenantId) {
        return {
          kind: 'plan-tenant-mismatch',
          planTenantId: String(record.tenantId),
          requestedTenantId: tenantId,
        };
      }
      const entry = linkage.get(ref.planId);
      if (entry === undefined) {
        return {
          kind: 'plan-shape-invalid',
          issue:
            'the plan carries no DECLARED experiment linkage — compose the plan through the console intent so the declared experiment refs and per-platform compile dimensions are ledgered (never fabricated)',
        };
      }
      void scope;
      return planViewOf(record, entry, missions);
    },
  };
}

/** Project record + linkage + mission into the compiler's MarketingPlanView. */
export function planViewOf(
  record: MarketingPlanRecord,
  entry: PlanLinkage,
  missions: MissionRepository,
): MarketingPlanView | PlanUnresolved {
  // The mission record the plan cites (append-only, still resolvable).
  const mission = missions.getMission(record.mission.missionId, record.mission.recordVersion);
  const missionSummary =
    mission === null
      ? `mission ${String(record.mission.missionId)}@v${record.mission.recordVersion} (citation no longer resolvable)`
      : `${String(mission.id)} — ${mission.objective.statement}`;

  // The platform choices: the record's platforms + the DECLARED dimensions.
  const platformChoices: PlatformChoice[] = [];
  for (const platform of record.platforms) {
    const view = entry.platformViews.get(String(platform.platform));
    if (view === undefined) {
      return {
        kind: 'plan-shape-invalid',
        issue: `platform ${String(platform.platform)} carries no declared compile dimensions (role / channels / production days / cost per action) — the linkage ledger has no entry for it`,
      };
    }
    platformChoices.push({
      platformId: String(platform.platform),
      role: view.role,
      citation: citationOf(platform.evidence),
      channels: [...view.channels],
      declaredProductionDays: view.declaredProductionDays,
      declaredCostPerAction: view.declaredCostPerAction,
      ...(view.modelPreference !== undefined ? { modelPreference: view.modelPreference } : {}),
    });
  }

  // The metrics: the record's expectations + the DECLARED windows/targets.
  const metrics: MetricSpec[] = [];
  const forecasts: CounterfactualForecast[] = [];
  for (const expectation of record.metricExpectations) {
    const view = entry.metricViews.get(String(expectation.metric));
    if (view === undefined) {
      return {
        kind: 'plan-shape-invalid',
        issue: `metric ${String(expectation.metric)} carries no declared measurement window — the linkage ledger has no entry for it`,
      };
    }
    const target = Number(expectation.expectation);
    if (!Number.isFinite(target)) {
      return {
        kind: 'plan-shape-invalid',
        issue: `metric ${String(expectation.metric)} declares a non-numeric expectation value ("${expectation.expectation}") — the compile target is underivable`,
      };
    }
    metrics.push({
      metricId: String(expectation.metric),
      platformId: view.platformId,
      target,
      window: { opensAt: view.window.opensAt, closesAt: view.window.closesAt },
    });
    if (expectation.basis.basis === 'counterfactual-forecast') {
      forecasts.push({
        label: 'counterfactual',
        forecastId: `forecast:${String(expectation.metric)}`,
        metricId: String(expectation.metric),
        scenario: expectation.basis.methodNote,
        value: target,
        basis: citationOf(expectation.evidence),
      });
    }
  }

  // The budget: derived from the cited mission's own budget constraint.
  const budget = missionBudgetOf(mission);
  if (budget === null) {
    return {
      kind: 'plan-shape-invalid',
      issue: `the cited mission ${String(record.mission.missionId)}@v${record.mission.recordVersion} declares no parsable budget constraint (the documented '<ISO-4217> <amount>' grammar) — the plan budget ceiling is underivable and never fabricated`,
    };
  }

  return {
    kind: 'marketing-plan',
    planId: String(record.id),
    version: record.version,
    tenantId: String(record.tenantId),
    missionSummary,
    platformChoices,
    metrics,
    experimentRefs: entry.experimentRefs.map((experimentId) => ({
      kind: 'experiment-ref',
      experimentId,
    })),
    counterfactualForecasts: forecasts,
    budget,
    deadlines: missionDeadlinesOf(mission),
  };
}
