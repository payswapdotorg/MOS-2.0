import type { StrategyRef, TenantScope } from '@mos/contracts';
import type {
  Mission,
  MissionId,
  MissionObjective,
  MissionRewardSpec,
  MissionStatus,
} from '../domain/mission.js';

/**
 * Repository port for the MOS missions domain (CORE-005).
 *
 * Scope objects are passed explicitly on every mutating call — there is no
 * ambient "current tenant" (architecture policy:
 * `requireTenantScopeOnMutableArtifacts`).
 *
 * Failure model: mutating operations return either the resulting record or a
 * typed {@link MissionRepositoryError} value (result union, no thrown
 * subclasses) — the `@mos/identity` convention. Reads use `null` /
 * empty-array misses so cross-tenant existence never leaks.
 *
 * Lifecycle is a STRICT forward chain `draft → active → completed → archived`:
 * each named transition validates its predecessor and rejects everything else
 * with `invalid-status-transition`. There is no back-transition and no skip.
 *
 * History: every mutation returns a NEW frozen record (version + 1); the
 * repository keeps prior record versions retrievable by `(id, version)` —
 * mission history is append-only (see the in-memory adapter).
 */
export interface MissionRepository {
  /**
   * Create a mission (status `draft`, record version 1, reward spec version
   * must be 1). Fails with `invalid-input` (blank statement, empty objective
   * target metrics, malformed reward terms) or `duplicate-mission`.
   */
  createMission(input: CreateMissionInput): Mission | MissionRepositoryError;

  /**
   * Fetch a mission by id — latest record version by default, an exact record
   * version when given — or `null` when unknown.
   */
  getMission(id: MissionId, version?: number): Mission | null;

  /**
   * Transition `draft → active`. Fails with `mission-not-found`,
   * `cross-tenant-reference` or `invalid-status-transition`.
   */
  activateMission(scope: TenantScope, id: MissionId): Mission | MissionRepositoryError;

  /**
   * Transition `active → completed`. Same failure codes as
   * {@link activateMission}.
   */
  completeMission(scope: TenantScope, id: MissionId): Mission | MissionRepositoryError;

  /**
   * Transition `completed → archived`. Same failure codes as
   * {@link activateMission}.
   */
  archiveMission(scope: TenantScope, id: MissionId): Mission | MissionRepositoryError;

  /**
   * Replace the mission's reward spec (draft missions only). The new spec's
   * `version` must be exactly current+1 — versioned contracts move forward
   * one step at a time (`requireExplicitVersionedContracts`). Bumps the
   * mission record version. Fails with `mission-not-found`,
   * `cross-tenant-reference`, `invalid-input` or `mission-not-editable`.
   */
  updateRewardSpec(
    scope: TenantScope,
    id: MissionId,
    rewardSpec: MissionRewardSpec,
  ): Mission | MissionRepositoryError;

  /**
   * List the latest record version of every mission visible in a tenant scope.
   * Empty array for an unknown tenant scope (no existence leak).
   */
  listMissions(scope: TenantScope): readonly Mission[];
}

export interface CreateMissionInput {
  readonly scope: TenantScope;
  readonly id: MissionId;
  readonly objective: MissionObjective;
  readonly rewardSpec: MissionRewardSpec;
  readonly strategyRefs?: readonly StrategyRef[];
}

/** Machine-readable failure codes returned by mutating operations. */
export type MissionRepositoryErrorCode =
  | 'invalid-input'
  | 'duplicate-mission'
  | 'mission-not-found'
  | 'mission-not-editable'
  | 'invalid-status-transition'
  | 'cross-tenant-reference';

/**
 * Typed failure value. Use `'error' in result` to discriminate against the
 * success record (success records never carry an `error` field).
 */
export interface MissionRepositoryError {
  readonly error: MissionRepositoryErrorCode;
  readonly message: string;
}

export type { MissionStatus };
