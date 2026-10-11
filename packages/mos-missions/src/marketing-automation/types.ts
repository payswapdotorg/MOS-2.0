/**
 * PROD-003 — marketing automation surface types (§24/§26/§30).
 *
 * The engine is a pure reducer over durable events: it emits EFFECTS (enqueue
 * durable job / dispatch through the production binding surface / record
 * experiment evidence) and ingests EVENTS. All I/O lives at the host seam —
 * there are no synchronous-HTTP durable claims anywhere in this module.
 */
import type { PlanVersionRef, MeasurementWindow, CounterfactualForecast, MetricSpec, ExperimentRef, AutomationRunSpec } from '../strategy-compiler/types.js';
import type { RealExperimentBindingView } from '../strategy-compiler/ports.js';

// ---------- lifecycle (§26 durable path) ----------
export type AutomationLifecycleState = 'compiled' | 'armed' | 'running' | 'measured' | 'closed' | 'halted';

// ---------- budget ----------
export interface BudgetEntry {
  readonly amount: number;
  readonly note: string;
  readonly at: string;
  readonly phaseId: string;
}

export interface BudgetLedger {
  readonly currency: string;
  readonly ceiling: number;
  readonly spent: number;
  readonly entries: readonly BudgetEntry[];
}

// ---------- publish actions through the boundary ----------
export type PublishActionStatus = 'pending' | 'dispatched' | 'accepted' | 'denied';

export interface PublishAction {
  readonly actionId: string;
  readonly platformId: string;
  readonly channel: string;
  readonly status: PublishActionStatus;
  /** binding receipt and transport receipt, `|`-joined when accepted. */
  readonly receipt?: string;
  readonly denial?: { readonly reason: string; readonly attribution: string };
}

export interface CollectedMetric {
  readonly metricId: string;
  readonly value: number;
  readonly collectedAt: string;
}

// ---------- typed halts (never silent truncation) ----------
export type TypedHaltReason = 'BUDGET_EXHAUSTED' | 'DEADLINE_PASSED' | 'DISTRIBUTION_DENIED' | 'JOB_FAILURE' | 'EVIDENCE_RECORDING_FAILED' | 'MAX_STEPS_EXCEEDED';

export interface TypedHalt {
  readonly reason: TypedHaltReason;
  /** Verbatim where an authority denied; descriptive for policy halts. */
  readonly attribution: string;
  readonly detail: string;
  readonly ledgerSnapshot?: { readonly spent: number; readonly ceiling: number; readonly currency: string };
  readonly haltedAt: string;
}

// ---------- §30 trail ----------
export type TrailEventKind =
  | 'run-created' | 'armed' | 'job-enqueued' | 'job-completed' | 'job-failed'
  | 'distribution-dispatched' | 'distribution-accepted' | 'distribution-denied'
  | 'budget-spent' | 'measurement-collected' | 'measured' | 'evidence-recorded' | 'closed' | 'halted';

export interface TrailEvent {
  readonly eventId: string;
  readonly at: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly kind: TrailEventKind;
  readonly detail: string;
  /** Job events enrich the §30 trail with their provenance. */
  readonly provenance?: { readonly jobId?: string; readonly actionId?: string; readonly authority?: string };
}

// ---------- the durable run state ----------
export interface AutomationRunState {
  readonly runId: string;
  readonly strategyId: string;
  readonly tenantId: string;
  readonly strategySourcePlan: PlanVersionRef;
  readonly missionSummary: string;
  readonly spec: AutomationRunSpec;
  readonly metrics: readonly MetricSpec[];
  /** Counterfactual labels survive compilation and ride into evidence. */
  readonly forecasts: readonly CounterfactualForecast[];
  readonly experimentRefs: readonly ExperimentRef[];
  readonly experimentBinding: RealExperimentBindingView | undefined;
  readonly lifecycle: AutomationLifecycleState;
  readonly ledger: BudgetLedger;
  readonly actions: readonly PublishAction[];
  readonly contentRefs: Readonly<Record<string, string>>;
  readonly collectedMetrics: readonly CollectedMetric[];
  readonly completedMeasureWindows: readonly string[];
  readonly trail: readonly TrailEvent[];
  readonly halt: TypedHalt | undefined;
  readonly evidenceReceipt: EvidenceReceiptView | undefined;
  readonly deadline: { readonly dueAt: string; readonly haltOnPassed: boolean } | undefined;
  readonly maxSteps: number;
  readonly stepCount: number;
}

// ---------- effects (executed by the durable host against real ports) ----------
export type DurableJobKind = 'automation-publish-window' | 'automation-measure-window';

export interface DurableJobSpec {
  readonly kind: DurableJobKind;
  readonly runId: string;
  readonly tenantId: string;
  readonly phaseId: string;
  readonly scheduledFor: string;
  readonly payload: Readonly<Record<string, string>>;
}

export interface DistributionRequest {
  readonly runId: string;
  readonly tenantId: string;
  readonly platformId: string;
  readonly channel: string;
  readonly actionId: string;
  readonly contentRef: string;
  readonly policyContext: Readonly<Record<string, string>>;
}

export type DistributionOutcome =
  | { readonly kind: 'accepted'; readonly actionId: string; readonly bindingReceipt: string; readonly transportReceipt: string }
  | { readonly kind: 'denied'; readonly actionId: string; readonly reason: string; readonly attribution: string };

export type AutomationEffect =
  | { readonly kind: 'enqueue-job'; readonly job: DurableJobSpec }
  | { readonly kind: 'dispatch-distribution'; readonly request: DistributionRequest }
  | { readonly kind: 'record-evidence'; readonly submission: ExperimentEvidenceSubmission };

// ---------- events (ingested by the reducer; job events come from the durable queue) ----------
export type AutomationEvent =
  | { readonly kind: 'job-enqueued'; readonly runId: string; readonly jobId: string; readonly phaseId: string }
  | { readonly kind: 'job-completed'; readonly runId: string; readonly jobId: string; readonly phaseId: string; readonly payload?: Readonly<Record<string, string>> }
  | { readonly kind: 'job-failed'; readonly runId: string; readonly jobId: string; readonly phaseId: string; readonly reason: string; readonly attribution: string }
  | { readonly kind: 'distribution-accepted'; readonly runId: string; readonly actionId: string; readonly bindingReceipt: string; readonly transportReceipt: string }
  | { readonly kind: 'distribution-denied'; readonly runId: string; readonly actionId: string; readonly reason: string; readonly attribution: string }
  | { readonly kind: 'measurement-collected'; readonly runId: string; readonly metricId: string; readonly value: number; readonly collectedAt: string }
  | { readonly kind: 'evidence-recorded'; readonly runId: string; readonly evidenceId: string; readonly recordedAt: string }
  | { readonly kind: 'evidence-recording-failed'; readonly runId: string; readonly reason: string; readonly attribution: string };

// ---------- experiment evidence (criterion 6, PROD-002 discipline) ----------
export interface RunOutcome {
  readonly metricId: string;
  readonly value: number;
  readonly target: number;
  readonly window: MeasurementWindow;
  readonly collectedAt: string;
}

export interface ExperimentEvidenceSubmission {
  readonly kind: 'automation-run-evidence';
  readonly experimentId: string;
  readonly bindingId: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly strategyId: string;
  readonly sourcePlan: PlanVersionRef;
  /** Evidence is only ever submitted from the measured state. */
  readonly lifecycleAtSubmission: 'measured';
  /** Comparators remain declared — results belong to the experiments authority. */
  readonly comparatorStatus: 'declared';
  readonly outcomes: readonly RunOutcome[];
  readonly counterfactualForecasts: readonly CounterfactualForecast[];
}

export interface EvidenceReceiptView {
  readonly evidenceId: string;
  readonly experimentId: string;
  readonly recordedAt: string;
}

// ---------- engine outcomes ----------
export interface ArmOutcome {
  readonly state: AutomationRunState;
  readonly effects: readonly AutomationEffect[];
}

export interface StepOutcome {
  readonly state: AutomationRunState;
  readonly effects: readonly AutomationEffect[];
}
