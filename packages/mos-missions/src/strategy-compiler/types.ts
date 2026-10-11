/**
 * PROD-003 — shared domain types for the strategy compiler (§23/§18/§25).
 *
 * Honesty pins carried at the TYPE level:
 * - CounterfactualForecast.label is the literal 'counterfactual' — an unlabeled
 *   forecast is unrepresentable in compiled output (§25).
 * - DeclaredComparator.status is the literal 'declared' — a comparator can never
 *   carry a result (§23 always-compare discipline; enforced-as-result is unrepresentable).
 */

// ---------- result discipline (typed failures, never thrown fabrication) ----------
export type Result<T, R> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly rejection: R };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<R>(rejection: R): Result<never, R> {
  return { ok: false, rejection };
}

// ---------- references ----------
export interface PlanVersionRef {
  readonly kind: 'marketing-plan';
  readonly planId: string;
  readonly version: number;
}

export interface ProductIntelligenceCitation {
  readonly kind: 'product-intelligence-citation';
  readonly recordId: string;
  readonly recordVersion: number;
}

export interface ExperimentRef {
  readonly kind: 'experiment-ref';
  readonly experimentId: string;
}

// ---------- product-intelligence (consumed, never synthesized — §25) ----------
export type HealthStatus = 'provider-CONFIRMED' | 'provider-reported' | 'stale' | 'unconfirmed';

export interface ResolvedProductIntelligenceRecord {
  readonly kind: 'product-intelligence-record';
  readonly recordId: string;
  readonly recordVersion: number;
  readonly summary: string;
  /** MARKETING-001 health-respect discipline: platform choices ride provider-CONFIRMED only. */
  readonly healthStatus: HealthStatus;
}

// ---------- the plan view the compiler consumes (MARKETING-001 output shape) ----------
export type PlatformRole = 'primary' | 'secondary' | 'amplify';

export interface MeasurementWindow {
  readonly opensAt: string;
  readonly closesAt: string;
}

export interface PlatformChoice {
  readonly platformId: string;
  readonly role: PlatformRole;
  readonly citation: ProductIntelligenceCitation;
  readonly channels: readonly string[];
  /** §18 EVD input — plan-declared; the compiler never invents durations. */
  readonly declaredProductionDays: number;
  /** Budget-enforcement input — plan-declared per-action cost. */
  readonly declaredCostPerAction: number;
  readonly modelPreference?: string;
}

export interface MetricSpec {
  readonly metricId: string;
  readonly platformId: string;
  readonly target: number;
  readonly window: MeasurementWindow;
}

export interface PlanDeadline {
  readonly deadlineId: string;
  readonly dueAt: string;
  readonly scope: 'mission' | 'platform' | 'metric';
  readonly platformId?: string;
  readonly metricId?: string;
}

export interface DelayPolicy {
  readonly currency: string;
  readonly perDayDelayCost: number;
  readonly haltOnDeadlinePassed: boolean;
}

export interface PlanBudget {
  readonly currency: string;
  readonly totalCeiling: number;
}

export interface CounterfactualForecast {
  /** Brand: unlabeled forecasts are unrepresentable; the port boundary re-checks at runtime. */
  readonly label: 'counterfactual';
  readonly forecastId: string;
  readonly metricId: string;
  readonly scenario: string;
  readonly value: number;
  readonly basis: ProductIntelligenceCitation;
}

export interface MarketingPlanView {
  readonly kind: 'marketing-plan';
  readonly planId: string;
  readonly version: number;
  readonly tenantId: string;
  readonly missionSummary: string;
  readonly platformChoices: readonly PlatformChoice[];
  readonly metrics: readonly MetricSpec[];
  readonly experimentRefs: readonly ExperimentRef[];
  readonly counterfactualForecasts: readonly CounterfactualForecast[];
  readonly budget: PlanBudget;
  readonly deadlines: readonly PlanDeadline[];
  readonly delayPolicy?: DelayPolicy;
  readonly modelPreferences?: Readonly<Record<string, string>>;
}

// ---------- §23 organization candidate (all eleven dimensions) ----------
export type DelegationEdgeType =
  | 'task-delegation'
  | 'review-request'
  | 'review-verdict'
  | 'measurement-delegation'
  | 'evidence-report'
  | 'escalation';

export interface DelegationEdge {
  readonly edgeId: string;
  readonly fromRoleId: string;
  readonly toRoleId: string;
  readonly type: DelegationEdgeType;
  readonly purpose: string;
}

export interface AgentRoleSpec {
  readonly roleId: string;
  readonly title: string;
  readonly responsibilities: readonly string[];
  /** Never fabricated: plan-declared preference or caller-supplied default (else typed rejection). */
  readonly modelId: string;
  readonly memoryScopes: readonly string[];
}

export interface MemoryScopeSpec {
  readonly scopeId: string;
  readonly kind: 'shared' | 'isolated';
  readonly description: string;
}

export interface MemorySharingPolicy {
  readonly sharedScopes: readonly MemoryScopeSpec[];
  readonly isolationRule: 'per-role-scratch-isolated';
}

export interface OrgBudgets {
  readonly currency: string;
  readonly orgCeiling: number;
  readonly perRole: Readonly<Record<string, number>>;
}

export type StoppingConditionKind = 'budget-exhausted' | 'deadline-passed' | 'objective-met' | 'distribution-denied';

export type StoppingCondition =
  | { readonly kind: 'budget-exhausted'; readonly currency: string }
  | { readonly kind: 'deadline-passed'; readonly deadlineId: string }
  | { readonly kind: 'objective-met'; readonly signal: string }
  | { readonly kind: 'distribution-denied'; readonly attribution: string };

export interface TerminationPolicy {
  readonly maxSteps: number;
  readonly haltConditions: readonly StoppingCondition[];
  readonly closeConditions: readonly StoppingCondition[];
}

export interface ToolGrant {
  readonly toolId: string;
  readonly grantedToRoleId: string;
  readonly scope: string;
  readonly kind: 'distribution-binding' | 'measurement' | 'evidence-recorder' | 'scheduler';
}

export type ExecutionPhaseKind = 'produce' | 'review' | 'publish' | 'measure' | 'record-evidence';

export interface ExecutionPhase {
  readonly phaseId: string;
  readonly kind: ExecutionPhaseKind;
  readonly roleId: string;
  readonly platformId?: string;
  readonly metricId?: string;
  readonly dependsOn: readonly string[];
  readonly declaredDurationDays: number;
  readonly deadlineId?: string;
}

export interface ExecutionOrdering {
  readonly orderingBasis: 'plan-declared' | 'evd-weighted';
  readonly phases: readonly ExecutionPhase[];
  readonly rationale: string;
}

export interface CommunicationPolicy {
  readonly channel: 'mission-trail';
  readonly messageDiscipline: 'typed-events-only';
  readonly description: string;
}

export interface CriticSpec {
  readonly roleId: string;
  readonly reviewsPhaseKinds: readonly ExecutionPhaseKind[];
  readonly vetoOn: 'policy-violation' | 'quality-threshold';
}

export type TopologyShape = 'single-agent' | 'star-controller' | 'pipeline' | 'hierarchical';

export interface CompiledOrganizationCandidate {
  readonly name: string;
  readonly tenantId: string;
  readonly topology: TopologyShape;
  readonly roles: readonly AgentRoleSpec[];
  readonly delegationEdges: readonly DelegationEdge[];
  readonly memorySharing: MemorySharingPolicy;
  readonly budgets: OrgBudgets;
  readonly termination: TerminationPolicy;
  readonly toolAllocation: readonly ToolGrant[];
  readonly communication: CommunicationPolicy;
  readonly critics: readonly CriticSpec[];
  readonly executionOrdering: ExecutionOrdering;
  readonly sourcePlan: PlanVersionRef;
}

// ---------- §23 always-compare comparators (declared, never enforced) ----------
export type ComparatorKind = 'generalist-single-agent-baseline' | 'hand-designed';

export interface DeclaredComparator {
  readonly comparatorId: string;
  readonly kind: ComparatorKind;
  readonly description: string;
  readonly organization: CompiledOrganizationCandidate;
  readonly evdNote?: string;
  /** Literal pin: declared metadata only — a result field is unrepresentable here. */
  readonly status: 'declared';
  /** Comparators are NOT run through the AGT-003 registry: no enforced claims. */
  readonly validationStatus: 'declared-unvalidated';
}

// ---------- §18 Expected Value of Delay ----------
export interface PhaseDeadlinePressure {
  readonly phaseId: string;
  readonly deadlineId: string;
  readonly dueAt: string;
  readonly declaredDurationDays: number;
  readonly scheduledFinishDay: number;
  readonly expectedDelayDays: number;
  readonly expectedDelayCost: number;
}

export interface ExpectedValueOfDelay {
  readonly currency: string;
  readonly perDayDelayCost: number;
  readonly totalExpectedDelayCost: number;
  readonly pressure: readonly PhaseDeadlinePressure[];
  readonly orderingBasis: 'evd-weighted';
  readonly rationale: string;
}

// ---------- authority receipts ----------
export interface AgentsValidationReceipt {
  readonly accepted: true;
  readonly authorityRecord: string;
}

// ---------- the compiled artifact ----------
export interface AutomationRunSpec {
  readonly budget: PlanBudget;
  readonly perActionCosts: Readonly<Record<string, number>>;
  readonly platformChannels: Readonly<Record<string, readonly string[]>>;
  readonly metricWindows: Readonly<Record<string, MeasurementWindow>>;
  readonly missionDeadline: PlanDeadline | undefined;
  readonly haltOnDeadlinePassed: boolean;
  readonly publishWindows: readonly { readonly platformId: string; readonly opensInDays: number }[];
}

export interface CompiledStrategy {
  readonly strategyId: string;
  readonly kind: 'compiled-strategy';
  readonly tenantId: string;
  /** Criterion 2: the compiled artifact cites its source plan version exactly. */
  readonly sourcePlan: PlanVersionRef;
  readonly missionSummary: string;
  readonly organization: CompiledOrganizationCandidate;
  readonly organizationValidation: AgentsValidationReceipt;
  readonly comparators: readonly DeclaredComparator[];
  readonly expectedValueOfDelay?: ExpectedValueOfDelay;
  readonly forecasts: readonly CounterfactualForecast[];
  readonly intelligenceProvenance: readonly ResolvedProductIntelligenceRecord[];
  readonly experimentRefs: readonly ExperimentRef[];
  readonly metrics: readonly MetricSpec[];
  readonly automationRunSpec: AutomationRunSpec;
  readonly lifecycle: 'compiled';
  readonly compiledAt: string;
}

// ---------- compile inputs ----------
export interface CompileRequest {
  readonly planRef: PlanVersionRef;
  readonly tenantId: string;
  readonly principal: string;
}

export interface ModelAssignmentDefaults {
  readonly controller?: string;
  readonly critic?: string;
  readonly analyst?: string;
  readonly producer?: string;
  readonly generalist?: string;
}

export interface CompileOptions {
  readonly modelDefaults?: ModelAssignmentDefaults;
  readonly handDesignedComparators?: readonly CompiledOrganizationCandidate[];
  readonly maxStepsDefault?: number;
  readonly phaseDurations?: { readonly reviewDays?: number };
}
