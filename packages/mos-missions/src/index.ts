/**
 * Public surface of `@mos/missions` (MOS v2.0 CORE-005).
 *
 * Exports the domain/port types plus the single runtime factory
 * `createInMemoryMissionRepository`. No helper constructors, error classes, or
 * internals are exposed.
 *
 * Cross-package usage note: this package imports `@mos/identity` type-only
 * (`TenantId`, `TenantScope`); runtime wiring happens at the composition root.
 */

export type {
  Mission,
  MissionConstraint,
  MissionId,
  MissionObjective,
  MissionRewardSpec,
  MissionStatus,
  ObjectiveMetric,
  RewardDirection,
  RewardMetricId,
  RewardTerm,
} from './domain/mission.js';
export type {
  CreateMissionInput,
  MissionRepository,
  MissionRepositoryError,
  MissionRepositoryErrorCode,
} from './ports/mission-repository.js';
export type { TenantId, TenantScope } from '@mos/identity';
export type { InMemoryMissionRepositoryOptions } from './adapters/in-memory-mission-repository.js';

export { createInMemoryMissionRepository } from './adapters/in-memory-mission-repository.js';
