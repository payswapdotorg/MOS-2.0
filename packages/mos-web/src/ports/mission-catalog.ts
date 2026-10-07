import type { MissionRef, TenantId, TenantScope, WorkspaceId } from '@mos/contracts';

/**
 * Mission catalog view port (UX-001).
 *
 * The Missions surface reads mission state and declares create-mission
 * INTENT through this port — and does nothing else. The web package holds no
 * mission business logic: no reward computation, no lifecycle transitions, no
 * validation. Those live in the Missions authority (`@mos/missions` /
 * CORE-005); the composition seam
 * (`testing/in-memory-mission-catalog.ts`) adapts the real domain repository
 * into these presentation-shaped view models, and a server-side composition
 * replaces it behind the same port later.
 *
 * The port is async because the production binding is a service call.
 */

/** Mission lifecycle states as presented (mirrors the Missions authority). */
export type MissionLifecycleStateView = 'draft' | 'active' | 'completed' | 'archived';

/** A mission as it appears in the Missions list. */
export interface MissionSummaryView {
  readonly missionId: MissionRef;
  /** Presentation title derived from the objective statement by the adapter. */
  readonly title: string;
  readonly lifecycleState: MissionLifecycleStateView;
  /** Mission record version (mutations bump it; history is append-only). */
  readonly recordVersion: number;
  /** Version of the mission-specific reward spec currently in force (spec §21). */
  readonly rewardSpecVersion: number;
  /** One-line presentation summary of the reward spec, e.g. `3 reward terms · spec v2`. */
  readonly rewardSpecSummary: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId | null;
  /** ISO-8601 timestamp of the last mutation. */
  readonly updatedAt: string;
}

/** One lifecycle transition as reconstructed from the append-only version history. */
export interface MissionTransitionView {
  /**
   * `'created'` marks the first record version; otherwise the state the
   * mission transitioned out of. (Named `fromState`, not `from`, so the
   * frozen boundary harness's import tokenizer never misreads the type
   * annotation as an export-from specifier.)
   */
  readonly fromState: MissionLifecycleStateView | 'created';
  readonly to: MissionLifecycleStateView;
  /** Record version that introduced the transition. */
  readonly recordVersion: number;
  /** ISO-8601 timestamp of the record version. */
  readonly at: string;
}

/** Direction of a reward term as presented (value terms maximize, cost terms minimize). */
export type RewardDirectionView = 'maximize' | 'minimize';

/** One declared reward term as presented. */
export interface RewardTermView {
  readonly metric: string;
  readonly direction: RewardDirectionView;
  readonly weight: number;
  readonly definition: string;
}

/** One version of the mission's reward spec, listed in the detail view. */
export interface RewardSpecVersionView {
  readonly specVersion: number;
  readonly terms: readonly RewardTermView[];
}

/** A measurable target metric attached to the mission objective. */
export interface ObjectiveMetricView {
  readonly metric: string;
  readonly target: string;
  readonly unit: string;
  readonly horizon: string | null;
}

/** A constraint the mission operates under. */
export interface MissionConstraintView {
  readonly kind: string;
  readonly description: string;
}

/** The full mission detail presentation: objective, history and reward versions. */
export interface MissionDetailView {
  readonly summary: MissionSummaryView;
  readonly objectiveStatement: string;
  readonly targetMetrics: readonly ObjectiveMetricView[];
  readonly constraints: readonly MissionConstraintView[];
  /** Lifecycle transitions in order, derived from record version history. */
  readonly transitions: readonly MissionTransitionView[];
  /** Reward spec versions in order — reward changes are explicit and traceable. */
  readonly rewardSpecVersions: readonly RewardSpecVersionView[];
  /** Strategy references associated with the mission (opaque strings). */
  readonly strategyRefs: readonly string[];
}

/** A selectable reward metric option for the create-mission intent form. */
export interface RewardMetricOptionView {
  readonly id: string;
  readonly label: string;
}

/** One reward term as declared through the create-mission intent form. */
export interface CreateMissionIntentTermDeclaration {
  readonly metric: string;
  readonly direction: RewardDirectionView;
  readonly weight: number;
  readonly definition: string;
}

/**
 * A declared intention to create a mission. This is INTENT, not a mission:
 * the shell hands the declaration to the owning domain through the port and
 * records nothing itself. Validation, lifecycle and reward-spec rules are the
 * Missions authority's job when the intent is executed.
 */
export interface CreateMissionIntentDeclaration {
  readonly scope: TenantScope;
  readonly objectiveStatement: string;
  readonly rewardTerms: readonly CreateMissionIntentTermDeclaration[];
}

/** Receipt for a recorded create-mission intent. */
export interface CreateMissionIntentReceipt {
  readonly intentId: string;
  /** ISO-8601 timestamp at which the composition recorded the intent. */
  readonly declaredAt: string;
  /** The authority the intent is routed to. */
  readonly routedTo: 'missions-authority';
  /** Presentation note shown with the receipt. */
  readonly note: string;
}

/** Typed failure shapes for the catalog port. */
export type MissionCatalogFailure =
  | { readonly error: 'mission-catalog-unavailable'; readonly message: string }
  | { readonly error: 'mission-not-found'; readonly message: string };

/** The declared Missions view surface (read + intent declaration only). */
export interface MissionCatalogPort {
  /** Latest record version of every mission visible in a tenant scope. */
  listMissionSummaries(
    scope: TenantScope,
  ): Promise<readonly MissionSummaryView[] | MissionCatalogFailure>;

  /** Full mission detail, or `mission-not-found` for unknown/cross-tenant ids. */
  loadMissionDetail(
    missionId: MissionRef,
    scope: TenantScope,
  ): Promise<MissionDetailView | MissionCatalogFailure>;

  /** Reward metric vocabulary for the intent form (served by the domain). */
  loadRewardMetricVocabulary(): Promise<readonly RewardMetricOptionView[] | MissionCatalogFailure>;

  /**
   * Declare the intent to create a mission. Records the declaration through
   * the owning domain and returns a receipt; it does NOT create a mission.
   */
  declareCreateMissionIntent(
    declaration: CreateMissionIntentDeclaration,
  ): Promise<CreateMissionIntentReceipt | MissionCatalogFailure>;

  /** Load the receipt of a previously declared intent (redirect-after-declare). */
  loadCreateMissionIntentReceipt(
    intentId: string,
    scope: TenantScope,
  ): Promise<CreateMissionIntentReceipt | null | MissionCatalogFailure>;
}
