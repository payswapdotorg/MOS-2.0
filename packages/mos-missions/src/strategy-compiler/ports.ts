/**
 * PROD-003 — compile-time authority ports.
 *
 * The compiler depends ONLY on these narrow ports (each well under the 12-method
 * house limit). Real authorities (@mos/agents, @mos/experiments, MARKETING-001's
 * plan registry and citation discipline) are bound by
 * src/authority-adapters/bind.ts.
 */
import type { PlanVersionRef, ProductIntelligenceCitation, MarketingPlanView, ResolvedProductIntelligenceRecord, ExperimentRef, CompiledOrganizationCandidate, AgentsValidationReceipt } from './types.js';

export type RightsVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string; readonly attribution: string; readonly authority: string };

export interface RightsAuthorityPort {
  /** Rights gate precedes compilation (§27). */
  checkCompileRight(input: { readonly tenantId: string; readonly principal: string; readonly planRef: PlanVersionRef }): Promise<RightsVerdict>;
  /** Rights gate precedes arming a run (§27). */
  checkRunRight(input: { readonly tenantId: string; readonly principal: string; readonly strategyId: string }): Promise<RightsVerdict>;
}

export type PlanUnresolved =
  | { readonly kind: 'plan-not-found'; readonly planId: string; readonly version: number }
  | { readonly kind: 'plan-tenant-mismatch'; readonly planTenantId: string; readonly requestedTenantId: string }
  | { readonly kind: 'plan-shape-invalid'; readonly issue: string };

export interface PlanAuthorityPort {
  /** Resolves a REAL versioned MARKETING-001 marketing plan (criterion 2). */
  resolveMarketingPlan(ref: PlanVersionRef, tenantId: string): Promise<MarketingPlanView | PlanUnresolved>;
}

export type CitationsResolution =
  | { readonly kind: 'resolved'; readonly records: readonly ResolvedProductIntelligenceRecord[] }
  | { readonly kind: 'unresolved'; readonly recordId: string; readonly issue: string }
  | { readonly kind: 'authority-unavailable'; readonly issue: string };

export interface IntelligenceCitationsPort {
  /** The established resolveProductIntelligenceCitations discipline (§25: consume, never become). */
  resolveProductIntelligenceCitations(citations: readonly ProductIntelligenceCitation[], tenantId: string): Promise<CitationsResolution>;
}

export type ExperimentsUnresolved =
  | { readonly kind: 'experiment-not-found'; readonly experimentId: string }
  | { readonly kind: 'binding-inactive'; readonly experimentId: string; readonly status: string }
  | { readonly kind: 'experiment-tenant-mismatch'; readonly experimentId: string; readonly bindingTenantId: string }
  | { readonly kind: 'authority-unavailable'; readonly issue: string };

export function describeExperimentsUnresolved(unresolved: ExperimentsUnresolved): string {
  switch (unresolved.kind) {
    case 'experiment-not-found':
      return `experiment ${unresolved.experimentId} not found`;
    case 'binding-inactive':
      return `binding for ${unresolved.experimentId} is not active (status: ${unresolved.status})`;
    case 'experiment-tenant-mismatch':
      return `binding for ${unresolved.experimentId} belongs to tenant ${unresolved.bindingTenantId}`;
    case 'authority-unavailable':
      return `experiments authority unavailable: ${unresolved.issue}`;
  }
}

export interface RealExperimentBindingView {
  readonly kind: 'real-experiment-binding';
  readonly experimentId: string;
  readonly bindingId: string;
  readonly tenantId: string;
  readonly status: 'active';
}

export interface ExperimentsReadPort {
  /** BRIDGE-003 RealExperimentBinding resolution (criterion 6). */
  resolveExperimentBinding(ref: ExperimentRef, tenantId: string): Promise<RealExperimentBindingView | ExperimentsUnresolved>;
}

export interface AgentsRejection {
  readonly accepted: false;
  /** AGT-003's named rejection — verbatim. */
  readonly rejectionName: string;
  readonly detail: string;
  readonly authorityRecord: string;
}

export interface AgentsAuthorityPort {
  /** AGT-003 registry validation of the compiled organization (criterion 3). */
  validateOrganization(candidate: CompiledOrganizationCandidate): Promise<AgentsValidationReceipt | AgentsRejection>;
}

export interface ClockPort {
  now(): Date;
}
