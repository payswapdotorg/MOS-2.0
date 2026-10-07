import type { TenantId } from '@mos/identity';

/**
 * Mission domain types (CORE-005).
 *
 * Aligned to the architecture, not to a single frozen contract (the contracts
 * YAML has no `Mission` record; missions are referenced BY other contracts —
 * `RealExperimentBinding.missionRef`, `LabScenario`-adjacent flows — and the
 * reward model is specified by architecture §21). `@mos/contracts` (CORE-001)
 * is not in this branch base; types are defined locally and switch to
 * `@mos/contracts` at TL reconciliation (Wave 2).
 */

declare const missionIdBrand: unique symbol;

/** Unique identifier of a mission (stable across all its record versions). */
export type MissionId = string & { readonly [missionIdBrand]: true };

/** Mission lifecycle: strict forward chain (architecture/backlog CORE-005). */
export type MissionStatus = 'draft' | 'active' | 'completed' | 'archived';

/**
 * The metric vocabulary of the multi-term reward model (architecture §21).
 * Reward is mission-specific and versioned; vanity metrics never silently
 * replace the declared objective.
 */
export type RewardMetricId =
  | 'business-outcome'
  | 'qualified-reach'
  | 'retention'
  | 'audience-growth'
  | 'qualified-traffic'
  | 'conversion'
  | 'revenue'
  | 'contribution'
  | 'cost'
  | 'latency'
  | 'human-acquisition-cost'
  | 'engine-acquisition-cost'
  | 'rights-risk'
  | 'policy-risk'
  | 'fatigue'
  | 'quality'
  | 'operational-risk';

/** Direction of a reward term: value terms are maximized, cost/risk terms minimized. */
export type RewardDirection = 'maximize' | 'minimize';

/**
 * One term of the multi-term reward model. `definition` is a precise,
 * human-readable statement of what counts — "qualified reach" is only as good
 * as its definition, so it is mandatory, never defaulted.
 */
export interface RewardTerm {
  readonly metric: RewardMetricId;
  readonly weight: number;
  readonly direction: RewardDirection;
  readonly definition: string;
}

/**
 * A mission's reward specification — versioned independently of the mission
 * record version: the spec has its own monotonic `version` (starts at 1) so
 * reward changes are explicit and traceable, never silent (§21). Updating the
 * spec requires the next spec version exactly (no skipping, no regressions).
 */
export interface MissionRewardSpec {
  readonly version: number;
  readonly terms: readonly RewardTerm[];
}

/** A measurable target attached to the objective. */
export interface ObjectiveMetric {
  /** The metric the target is expressed in (same vocabulary as reward terms). */
  readonly metric: RewardMetricId;
  /** Target value as a string (preserves precision and units semantics). */
  readonly target: string;
  /** Unit of the target (e.g. `count`, `ratio`, `EUR`, `seconds`). */
  readonly unit: string;
  /** Optional ISO-8601 time horizon for the target, or `null`. */
  readonly horizon: string | null;
}

/** A constraint the mission operates under. */
export interface MissionConstraint {
  readonly kind:
    | 'budget'
    | 'policy'
    | 'rights'
    | 'quality'
    | 'brand-safety'
    | 'latency'
    | 'other';
  readonly description: string;
}

/**
 * The mission's declared objective — structured, not a free-text blob:
 * statement + measurable target metrics + explicit constraints.
 */
export interface MissionObjective {
  /** The declared business objective in one statement. */
  readonly statement: string;
  readonly targetMetrics: readonly ObjectiveMetric[];
  readonly constraints: readonly MissionConstraint[];
}

/**
 * A mission: the declared objective plus its versioned, mission-specific
 * reward spec, associated strategies, and lifecycle state.
 *
 * Records are immutable snapshots: every mutation (lifecycle transition or
 * reward-spec update) bumps `version` and `updatedAt`; history is preserved by
 * the repository as append-only record versions. `rewardSpec.version` is the
 * spec-local version and moves only through `updateRewardSpec`.
 *
 * Tenant-scoped by requirement: `tenantId` is carried explicitly.
 */
export interface Mission {
  readonly id: MissionId;
  readonly tenantId: TenantId;
  /** Mission record version; starts at 1, bumped on every mutation. */
  readonly version: number;
  readonly objective: MissionObjective;
  /** Mission-specific, independently versioned reward spec (§21). */
  readonly rewardSpec: MissionRewardSpec;
  /** References to strategies associated with the mission (opaque refs). */
  readonly strategyRefs: readonly string[];
  readonly status: MissionStatus;
  /** ISO-8601 timestamp of creation. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last mutation. */
  readonly updatedAt: string;
}
