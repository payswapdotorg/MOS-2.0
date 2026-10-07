import type {
  Mission,
  MissionId,
  MissionRepository,
  MissionRewardSpec,
  MissionStatus,
} from '@mos/missions';
import type { MissionRef, TenantScope } from '@mos/contracts';
import type {
  CreateMissionIntentDeclaration,
  CreateMissionIntentReceipt,
  MissionCatalogFailure,
  MissionCatalogPort,
  MissionDetailView,
  MissionLifecycleStateView,
  MissionSummaryView,
  MissionTransitionView,
  RewardMetricOptionView,
  RewardSpecVersionView,
} from '../dist/src/ports/mission-catalog.js';

/**
 * DISCLOSED in-memory double for the {@link MissionCatalogPort}
 * (UX-001).
 *
 * Composition seam (OUTSIDE `src/`): adapts the REAL `@mos/missions`
 * repository (`MissionRepository`, CORE-005) into the Missions surface's
 * presentation-shaped view models. Read models are derived — the mission
 * history (lifecycle transitions, reward-spec versions) is RECONSTRUCTED
 * from the repository's append-only record versions, exactly the way a
 * server-side read model would. The create-mission intent declaration is
 * RECORDED here (an intent ledger with receipts) and routed nominally to
 * `missions-authority` — the double does NOT execute the intent (no mission
 * is created), because executing intents is the authority's job, not the
 * composition double's.
 *
 * Ephemeral scaffold, NOT production: the production composition binds the
 * port over the MOS service transport without touching the port or views.
 */

/** Options for {@link createInMemoryMissionCatalogPort}. */
export interface InMemoryMissionCatalogPortOptions {
  /** The REAL missions repository the view models are derived from. */
  readonly missionRepository: MissionRepository;
  /** Injectable clock for intent receipts (deterministic tests). */
  readonly now?: () => string;
  /**
   * Injectable intent-id generator. Defaults to a monotonic
   * `intent-<n>` sequence — presentation receipts only, never mission ids.
   */
  readonly nextIntentId?: () => string;
}

/**
 * The reward-metric vocabulary served to the intent form. DISCLOSED test
 * fixture: it mirrors the `RewardMetricId` union of `@mos/missions` as data
 * for presentation; the authority's own vocabulary endpoint supersedes it
 * when the production composition lands (the port stays unchanged).
 */
const REWARD_METRIC_VOCABULARY: readonly RewardMetricOptionView[] = [
  { id: 'business-outcome', label: 'Business outcome' },
  { id: 'qualified-reach', label: 'Qualified reach' },
  { id: 'retention', label: 'Retention' },
  { id: 'audience-growth', label: 'Audience growth' },
  { id: 'qualified-traffic', label: 'Qualified traffic' },
  { id: 'conversion', label: 'Conversion' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'cost', label: 'Cost' },
  { id: 'latency', label: 'Latency' },
  { id: 'human-acquisition-cost', label: 'Human acquisition cost' },
  { id: 'engine-acquisition-cost', label: 'Engine acquisition cost' },
  { id: 'rights-risk', label: 'Rights risk' },
  { id: 'policy-risk', label: 'Policy risk' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'quality', label: 'Quality' },
  { id: 'operational-risk', label: 'Operational risk' },
];

/** A recorded create-mission intent (the double's intent ledger entry). */
export interface RecordedCreateMissionIntent {
  readonly intentId: string;
  readonly scope: TenantScope;
  readonly declaration: CreateMissionIntentDeclaration;
  readonly declaredAt: string;
}

/** Derive the presentation title from the objective statement. */
function missionTitle(objectiveStatement: string): string {
  const firstSentence = objectiveStatement.split(/(?<=[.!?])\s/)[0] ?? objectiveStatement;
  // Trailing sentence punctuation is not part of a title.
  const title = firstSentence.trim().replace(/[.!?]+$/, '');
  return title.length > 0 ? title : 'Untitled mission';
}

/** One-line reward-spec presentation summary, e.g. `3 terms · spec v2`. */
function rewardSpecSummary(spec: MissionRewardSpec): string {
  const terms = spec.terms.length === 1 ? '1 reward term' : `${spec.terms.length} reward terms`;
  return `${terms} · spec v${spec.version}`;
}

/** Presentation view of a mission record. */
function missionSummaryView(mission: Mission): MissionSummaryView {
  return {
    missionId: mission.id,
    title: missionTitle(mission.objective.statement),
    lifecycleState: mission.status,
    recordVersion: mission.version,
    rewardSpecVersion: mission.rewardSpec.version,
    rewardSpecSummary: rewardSpecSummary(mission.rewardSpec),
    tenantId: mission.tenantId,
    workspaceId: null,
    updatedAt: mission.updatedAt,
  };
}

/**
 * Build the in-memory mission-catalog port over a REAL `MissionRepository`.
 */
export function createInMemoryMissionCatalogPort(
  options: InMemoryMissionCatalogPortOptions,
): InMemoryMissionCatalogDouble {
  const now = options.now ?? (() => new Date().toISOString());
  let intentCounter = 0;
  const nextIntentId =
    options.nextIntentId ?? (() => `intent-${(intentCounter += 1)}`);
  /** intent id → recorded intent (the disclosed intent ledger). */
  const intents = new Map<string, RecordedCreateMissionIntent>();

  const catalogFailure = (
    error: MissionCatalogFailure['error'],
    message: string,
  ): MissionCatalogFailure => ({ error, message });

  /**
   * Walk the append-only record versions of a mission (latest backwards)
   * into presentation history. The repository keeps every version
   * retrievable by `(id, version)`.
   */
  const detailFromChain = (mission: Mission): MissionDetailView => {
    const versions: Mission[] = [];
    for (let version = 1; version <= mission.version; version += 1) {
      const record = options.missionRepository.getMission(mission.id, version);
      if (record === null) {
        break;
      }
      versions.push(record);
    }
    // If the walk could not reach the latest version (defensive), the
    // latest record still completes the chain.
    const walkedTo = versions.length > 0 ? versions[versions.length - 1] : undefined;
    if (walkedTo === undefined || walkedTo.version !== mission.version) {
      versions.push(mission);
    }

    const transitions: MissionTransitionView[] = [];
    let previous: MissionStatus | 'created' = 'created';
    for (const record of versions) {
      if (previous !== record.status) {
        transitions.push({
          fromState: previous,
          to: record.status,
          recordVersion: record.version,
          at: record.updatedAt,
        });
      }
      previous = record.status;
    }

    const rewardSpecVersions: RewardSpecVersionView[] = [];
    for (const record of versions) {
      const latest = rewardSpecVersions[rewardSpecVersions.length - 1];
      if (latest === undefined || latest.specVersion !== record.rewardSpec.version) {
        rewardSpecVersions.push({
          specVersion: record.rewardSpec.version,
          terms: record.rewardSpec.terms.map((term) => ({
            metric: term.metric,
            direction: term.direction,
            weight: term.weight,
            definition: term.definition,
          })),
        });
      }
    }

    const latestRecord: Mission = versions.at(-1) ?? mission;
    return {
      summary: missionSummaryView(latestRecord),
      objectiveStatement: latestRecord.objective.statement,
      targetMetrics: latestRecord.objective.targetMetrics.map((metric) => ({
        metric: metric.metric,
        target: metric.target,
        unit: metric.unit,
        horizon: metric.horizon,
      })),
      constraints: latestRecord.objective.constraints.map((constraint) => ({
        kind: constraint.kind,
        description: constraint.description,
      })),
      transitions,
      rewardSpecVersions,
      strategyRefs: [...latestRecord.strategyRefs],
    };
  };

  const port: MissionCatalogPort = {
    async listMissionSummaries(scope: TenantScope) {
      const missions = options.missionRepository.listMissions(scope);
      return missions.map(missionSummaryView);
    },

    async loadMissionDetail(missionId: MissionRef, scope: TenantScope) {
      const mission = options.missionRepository.getMission(missionId as MissionId);
      if (mission === null || mission.tenantId !== scope.tenantId) {
        // Unknown OR cross-tenant: the same explicit miss — no existence
        // leak across tenant boundaries (spec §31).
        return catalogFailure(
          'mission-not-found',
          `no mission ${missionId} is visible in this tenant scope`,
        );
      }
      return detailFromChain(mission);
    },

    async loadRewardMetricVocabulary() {
      return REWARD_METRIC_VOCABULARY;
    },

    async declareCreateMissionIntent(declaration: CreateMissionIntentDeclaration) {
      const intentId = nextIntentId();
      const declaredAt = now();
      intents.set(intentId, {
        intentId,
        scope: declaration.scope,
        declaration,
        declaredAt,
      });
      const receipt: CreateMissionIntentReceipt = {
        intentId,
        declaredAt,
        routedTo: 'missions-authority',
        note: 'The Missions authority validates and executes the declaration when it processes the intent.',
      };
      return receipt;
    },

    async loadCreateMissionIntentReceipt(intentId: string, scope: TenantScope) {
      const recorded = intents.get(intentId);
      if (recorded === undefined || recorded.scope.tenantId !== scope.tenantId) {
        return null;
      }
      return {
        intentId: recorded.intentId,
        declaredAt: recorded.declaredAt,
        routedTo: 'missions-authority',
        note: 'The Missions authority validates and executes the declaration when it processes the intent.',
      } satisfies CreateMissionIntentReceipt;
    },
  };

  const recordedIntents = (): readonly RecordedCreateMissionIntent[] =>
    [...intents.values()].sort((a, b) => (a.declaredAt < b.declaredAt ? -1 : 1));

  return { port, recordedIntents };
}

/** The catalog double bundle: the port plus disclosed test observability. */
export interface InMemoryMissionCatalogDouble {
  readonly port: MissionCatalogPort;
  /**
   * The recorded intent ledger in declaration order (disclosed observability
   * for tests — production bindings do not carry this surface).
   */
  readonly recordedIntents: () => readonly RecordedCreateMissionIntent[];
}

/**
 * The lifecycle-state presentation vocabulary (used by view tests to check
 * every state renders its badge).
 */
export const MISSION_LIFECYCLE_STATES: readonly MissionLifecycleStateView[] = [
  'draft',
  'active',
  'completed',
  'archived',
];
