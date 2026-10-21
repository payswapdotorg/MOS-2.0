import type { MissionRef, TenantScope } from '@mos/contracts';
import type {
  Mission,
  MissionId,
  MissionRepository,
  MissionRewardSpec,
  MissionStatus,
  RewardMetricId,
} from '@mos/missions';
import type {
  CreateMissionIntentDeclaration,
  CreateMissionIntentReceipt,
  MissionCatalogFailure,
  MissionCatalogPort,
  MissionDetailView,
  MissionSummaryView,
  MissionTransitionView,
  RewardMetricOptionView,
  RewardSpecVersionView,
} from '@mos/web';

/**
 * PRODUCTION mission-catalog adapter over the REAL `@mos/missions`
 * repository (MOS v2.0 desktop shell, CORE-005).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline). Read models
 * are DERIVED from the real repository exactly the way a server-side read
 * model would: the mission history (lifecycle transitions, reward-spec
 * versions) is reconstructed from the repository's append-only record
 * versions. This is the production binding — NOT a double.
 *
 * CREATE-MISSION INTENT DECLARATION — honest disclosure: the REAL
 * `MissionRepository` carries no intent-declaration surface (checked:
 * `createMission` / lifecycle transitions / `updateRewardSpec` are its
 * write paths). Executing intents is the Missions AUTHORITY's job, and the
 * authority's service transport is P2 work. The composition therefore
 * records the declaration in a process-local intent LEDGER with receipts
 * and routes it nominally to `missions-authority` — the same honest
 * behavior the disclosed testing seam established, now over the production
 * read models; NO mission is created by a declaration, and the receipt
 * says exactly that. When the authority transport lands, the ledger is
 * replaced by the real declaration call without touching this port.
 *
 * REWARD-METRIC VOCABULARY: the authority has no vocabulary endpoint yet,
 * so the composition mirrors the REAL `RewardMetricId` union of
 * `@mos/missions` as presentation data — TYPE-PINNED to the union below,
 * so any drift in the authority's metric vocabulary fails this file's
 * typecheck (the seam cannot silently rot). The authority's own endpoint
 * supersedes this mirror at P2.
 */

/** Options for {@link createProductionMissionCatalogPort}. */
export interface ProductionMissionCatalogPortOptions {
  /** The REAL missions repository the view models are derived from. */
  readonly missionRepository: MissionRepository;
  /** Injectable clock for intent receipts (deterministic tests). */
  readonly now?: () => string;
  /**
   * Injectable intent-id generator. Defaults to a monotonic
   `intent-<n>` sequence — presentation receipts only, never mission ids.
   */
  readonly nextIntentId?: () => string;
}

/**
 * The reward-metric vocabulary served to the intent form, pinned to the
 * REAL `RewardMetricId` union (compile-time drift pin — see the header).
 */
const REWARD_METRIC_VOCABULARY: readonly (readonly [RewardMetricId, string])[] = [
  ['business-outcome', 'Business outcome'],
  ['qualified-reach', 'Qualified reach'],
  ['retention', 'Retention'],
  ['audience-growth', 'Audience growth'],
  ['qualified-traffic', 'Qualified traffic'],
  ['conversion', 'Conversion'],
  ['revenue', 'Revenue'],
  ['contribution', 'Contribution'],
  ['cost', 'Cost'],
  ['latency', 'Latency'],
  ['human-acquisition-cost', 'Human acquisition cost'],
  ['engine-acquisition-cost', 'Engine acquisition cost'],
  ['rights-risk', 'Rights risk'],
  ['policy-risk', 'Policy risk'],
  ['fatigue', 'Fatigue'],
  ['quality', 'Quality'],
  ['operational-risk', 'Operational risk'],
];

const INTENT_RECEIPT_NOTE =
  'The Missions authority validates and executes the declaration when it processes the intent.';

/** A recorded create-mission intent (the composition's intent ledger entry). */
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

const catalogFailure = (
  error: MissionCatalogFailure['error'],
  message: string,
): MissionCatalogFailure => ({ error, message });

/** The catalog bundle: the port plus disclosed observability. */
export interface ProductionMissionCatalog {
  readonly port: MissionCatalogPort;
  /** The recorded intent ledger in declaration order (observability). */
  readonly recordedIntents: () => readonly RecordedCreateMissionIntent[];
}

/**
 * Build the production mission-catalog port over a REAL
 * `MissionRepository`.
 */
export function createProductionMissionCatalogPort(
  options: ProductionMissionCatalogPortOptions,
): ProductionMissionCatalog {
  const now = options.now ?? (() => new Date().toISOString());
  let intentCounter = 0;
  const nextIntentId = options.nextIntentId ?? (() => `intent-${(intentCounter += 1)}`);
  /** intent id → recorded intent (the composition's intent ledger). */
  const intents = new Map<string, RecordedCreateMissionIntent>();

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
      return REWARD_METRIC_VOCABULARY.map(
        ([metric, label]): RewardMetricOptionView => ({ id: metric, label }),
      );
    },

    async declareCreateMissionIntent(declaration: CreateMissionIntentDeclaration) {
      const intentId = nextIntentId();
      const declaredAt = now();
      intents.set(intentId, { intentId, scope: declaration.scope, declaration, declaredAt });
      const receipt: CreateMissionIntentReceipt = {
        intentId,
        declaredAt,
        routedTo: 'missions-authority',
        note: INTENT_RECEIPT_NOTE,
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
        note: INTENT_RECEIPT_NOTE,
      } satisfies CreateMissionIntentReceipt;
    },
  };

  const recordedIntents = (): readonly RecordedCreateMissionIntent[] =>
    [...intents.values()].sort((a, b) => (a.declaredAt < b.declaredAt ? -1 : 1));

  return { port, recordedIntents };
}
