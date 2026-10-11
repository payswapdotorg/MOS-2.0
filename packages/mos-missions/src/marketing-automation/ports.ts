/**
 * PROD-003 — runtime authority ports for the automation surface.
 * Real bindings (@mos/jobs JobQueuePort, PROD-001 production binding surface,
 * @mos/experiments evidence chain) live in src/authority-adapters/bind.ts.
 */
import type { DurableJobSpec, DistributionRequest, DistributionOutcome, ExperimentEvidenceSubmission, EvidenceReceiptView } from './types.js';

export type JobEnqueueOutcome = { readonly jobId: string } | { readonly kind: 'rejected'; readonly reason: string };
export type EvidenceWriteOutcome = EvidenceReceiptView | { readonly kind: 'rejected'; readonly reason: string };

/** §26: automation runs ride the REAL @mos/jobs JobQueuePort via enqueue effects. */
export interface JobsAuthorityPort {
  enqueue(spec: DurableJobSpec): Promise<JobEnqueueOutcome>;
}

/**
 * §24: distribution actions go through PROD-001's binding surface ONLY.
 * A denial means ZERO transport calls (by the boundary's own contract) and the
 * automation never holds any other path to a social provider.
 */
export interface DistributionBoundaryPort {
  dispatch(request: DistributionRequest): Promise<DistributionOutcome>;
}

/** Criterion 6: run outcomes become experiment evidence through the experiments authority. */
export interface ExperimentsEvidencePort {
  recordEvidence(submission: ExperimentEvidenceSubmission): Promise<EvidenceWriteOutcome>;
}

/** §26 durable persistence of run state. */
export interface RunStateStorePort {
  save(state: import('./types.js').AutomationRunState): Promise<void>;
  load(runId: string, tenantId: string): Promise<import('./types.js').AutomationRunState | undefined>;
}
