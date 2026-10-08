/**
 * Public surface of `@mos/missions` (MOS v2.0 CORE-005 + MARKETING-001).
 *
 * Exports the mission domain/port types, the single mission runtime
 * factory `createInMemoryMissionRepository`, and (W12-A / MARKETING-001)
 * the marketing-planner domain/port types plus its disclosed in-memory
 * factory `createInMemoryMarketingPlanner`. No helper constructors, error
 * classes, or internals are exposed.
 *
 * Cross-package usage note (W2-A / RECONCILE-A): this package imports the
 * shared vocabulary type-only from `@mos/contracts` (`TenantId`,
 * `TenantScope`, `StrategyRef`, and `MissionId` = the contracts
 * `MissionRef`); runtime wiring happens at the composition root.
 *
 * MARKETING-001 seam note (W12-A): the planner's cross-authority views
 * (`@mos/product-intelligence`, `@mos/distribution`) are imported
 * TYPE-ONLY and injected at runtime — the registry dependency set of the
 * missions module is unchanged ([contracts, identity]); the two
 * devDependencies exist solely so the type-level seams resolve, and the
 * emitted code never imports the sibling packages.
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
export type { TenantId, TenantScope } from '@mos/contracts';
export type { InMemoryMissionRepositoryOptions } from './adapters/in-memory-mission-repository.js';

export { createInMemoryMissionRepository } from './adapters/in-memory-mission-repository.js';

export type {
  CitedExpectationBasis,
  ConfirmedRestrictionSnapshot,
  CounterfactualForecastBasis,
  ExpectationBasis,
  MarketingCompositionId,
  MarketingPlanCompositionFailure,
  MarketingPlanCompositionRecord,
  MarketingPlanId,
  MarketingPlanRecord,
  MissionCitation,
  PlannedExperimentExpectation,
  PlannedMetricExpectation,
  PlannedPlatform,
  SuspectedAnomalySnapshot,
} from './domain/marketing-plan.js';
export type {
  ComposeMarketingPlanInput,
  ExperimentExpectationInput,
  MarketingCompositionFilter,
  MarketingPlannerError,
  MarketingPlannerErrorCode,
  MarketingPlannerErrorCause,
  MarketingPlannerHealthSource,
  MarketingPlannerIntelligenceSource,
  MarketingPlannerMissionSource,
  MarketingPlannerPort,
  MarketingPlanIntegrityReport,
  MetricExpectationInput,
  PlatformChoiceInput,
  ReviseMarketingPlanInput,
} from './ports/marketing-planner.port.js';
export type { InMemoryMarketingPlannerOptions } from './adapters/in-memory-marketing-planner.js';

export {
  createInMemoryMarketingPlanner,
  IN_MEMORY_MARKETING_PLANNER_SOURCE,
} from './adapters/in-memory-marketing-planner.js';
