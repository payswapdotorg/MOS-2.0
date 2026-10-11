/** PROD-003 — strategy compiler barrel (§23/§18/§25). */
export type { Result } from './types.js';
export { ok, err } from './types.js';
export type {
  PlanVersionRef, ProductIntelligenceCitation, ExperimentRef, HealthStatus, ResolvedProductIntelligenceRecord,
  PlatformRole, MeasurementWindow, PlatformChoice, MetricSpec, PlanDeadline, DelayPolicy, PlanBudget,
  CounterfactualForecast, MarketingPlanView, DelegationEdgeType, DelegationEdge, AgentRoleSpec, MemoryScopeSpec,
  MemorySharingPolicy, OrgBudgets, StoppingConditionKind, StoppingCondition, TerminationPolicy, ToolGrant,
  ExecutionPhaseKind, ExecutionPhase, ExecutionOrdering, CommunicationPolicy, CriticSpec, TopologyShape,
  CompiledOrganizationCandidate, ComparatorKind, DeclaredComparator, PhaseDeadlinePressure, ExpectedValueOfDelay,
  AgentsValidationReceipt, AutomationRunSpec, CompiledStrategy, CompileRequest, ModelAssignmentDefaults, CompileOptions,
} from './types.js';
export type { CompilerRejection, CompilerRejectionName } from './rejections.js';
export { COMPILER_REJECTION_NAMES, isCompilerRejection, describeFault } from './rejections.js';
export type {
  RightsVerdict, RightsAuthorityPort, PlanUnresolved, PlanAuthorityPort, CitationsResolution,
  IntelligenceCitationsPort, ExperimentsUnresolved, RealExperimentBindingView, ExperimentsReadPort,
  AgentsRejection, AgentsAuthorityPort, ClockPort,
} from './ports.js';
export { describeExperimentsUnresolved } from './ports.js';
export type { TenantId } from './tenant.js';
export { isValidTenantId, sameTenant } from './tenant.js';
export { parseIso, addDays, daysBetween, toIso } from './dates.js';
export { validatePlanView } from './plan-validation.js';
export { deriveExecutionPhases, buildAutomationRunSpec } from './phases.js';
export type { OrganizationStyle, ResolvedModels } from './organization.js';
export {
  resolveModelAssignments, compileOrganization, withExecutionOrdering, validateCandidateSelfConsistency,
  DEFAULT_MAX_STEPS, DEFAULT_REVIEW_PHASE_DAYS, ROLE_BUDGET_SHARES, PLATFORM_ROLE_WEIGHTS,
} from './organization.js';
export { buildGeneralistBaseline, buildDeclaredComparators } from './comparators.js';
export type { EvdComputation } from './evd.js';
export { computeExpectedValueOfDelay } from './evd.js';
export type { StrategyCompilerDeps } from './compile.js';
export { StrategyCompiler, strategyIdFor } from './compile.js';
