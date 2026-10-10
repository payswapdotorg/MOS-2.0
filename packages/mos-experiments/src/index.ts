/**
 * @mos/experiments — BRIDGE-003: the real-experiment/evidence/learning
 * authority (MOS v2.0 §24 boundary chain, final segments).
 *
 * Registry topology (spec/mos-module-registry-v2.0.yaml, FROZEN):
 * root packages/mos-experiments · owner worker-c · authority
 * real-experiment-evidence-learning · dependencies [contracts, missions,
 * production, distribution, jobs] (exact — package.json matches).
 *
 * Public surface (see the README for the full map):
 * - contracts: the binding request + typed failure model, the experiment
 *   record family + the frozen RealExperimentBinding projection, the
 *   evidence + outcome record families, the declared seams (lab candidate,
 *   policy/rights gates, distribution observations), the 12-method
 *   authority port, the compile-time pins;
 * - adapters: the disclosed in-memory authority + the disclosed gate
 *   doubles (the REAL authority twins live in the compat battery);
 * - testing: deterministic fixtures + the REAL distribution adapter.
 */

// ---- Contracts: identifiers ----
export type { ExperimentId, ExperimentAuditId, ExperimentObservationId } from "./contracts/ids.js";
export { experimentObservationIdOf, experimentJobKeyOf } from "./contracts/ids.js";

// ---- Contracts: boundary vocabulary ----
export {
  REAL_EXPERIMENT_BOUNDARY_STATEMENT,
  EXPERIMENT_LIFECYCLE_STATUSES,
  TERMINAL_EXPERIMENT_STATUSES,
  EXPERIMENT_JOB_CONTRACT_VERSION,
  EXPERIMENT_JOB_KIND,
  EXPERIMENT_JOB_RETRY_POLICY,
} from "./contracts/experiment-boundary.js";
export type {
  ExperimentLifecycleStatus,
  TerminalExperimentStatus,
  ExperimentMeasurementContext,
  ExperimentJobCitation,
} from "./contracts/experiment-boundary.js";

// ---- Contracts: the lab-candidate seam (the consumed LAB-017 surface) ----
export type {
  LabCandidateCitation,
  LabCandidateExpectations,
  LabCandidateSnapshot,
  LabCandidateReaderPort,
} from "./contracts/lab-candidate-seam.js";

// ---- Contracts: the authority seams ----
export type {
  ExperimentMissionSource,
  ExperimentMissionLinkage,
  ExperimentPolicyRuleVersionRef,
  ExperimentPolicyCheckRequest,
  ExperimentPolicyVerdict,
  ExperimentPolicyGatePort,
  ExperimentRightsFrameRequest,
  ExperimentRightsFrameResolution,
  ExperimentRightsFrameVerdict,
  ExperimentRightsGatePort,
  DistributionObservationSource,
  ExperimentJobQueue,
} from "./contracts/authority-seams.js";

// ---- Contracts: the binding request + failure model ----
export type {
  RealExperimentBindingRequest,
  RealExperimentBindingFailure,
  RealExperimentBindingOutcome,
} from "./contracts/binding-request.js";

// ---- Contracts: the experiment record family + frozen projection ----
export type {
  ExperimentLabCandidateSegment,
  ExperimentPolicyGateSegment,
  ExperimentRightsGateSegment,
  ExperimentProductionSegment,
  ExperimentDistributionSegment,
  ExperimentAnalysisCitation,
  ExperimentAbandonmentSnapshot,
  ExperimentClosureSegment,
  RealExperimentRecord,
  RealExperimentBindingAuditRecord,
  RealExperimentBindingFailureStage,
  RealExperimentBinding,
} from "./contracts/experiment-record.js";
export { canonicalRealExperimentBinding } from "./contracts/experiment-record.js";

// ---- Contracts: the evidence family ----
export type {
  ExperimentObservationCitation,
  ExperimentEvidenceUncertainty,
  DeclaredMeasurementWindowRecord,
  MeasuredExperimentEvidence,
  ExperimentEvidenceRecord,
  ExperimentEvidenceCitation,
} from "./contracts/evidence.js";
export { EXPERIMENT_EVIDENCE_UNCERTAINTY_NOTE } from "./contracts/evidence.js";

// ---- Contracts: the outcome family ----
export type {
  ExperimentObservedMetricMean,
  ExperimentOutcomeConclusion,
  ExperimentOutcomeRecord,
  ExperimentOutcomeObservation,
} from "./contracts/outcome.js";

// ---- Contracts: the authority port ----
export type {
  RealExperimentAuthorityPort,
  ExperimentJobClaim,
  AdvanceMeasurementFailure,
  AdvanceMeasurementOutcome,
  AnalyseOutcomeFailure,
  CloseExperimentFailure,
  ExperimentClosureInput,
  ExperimentIntegrityReport,
} from "./contracts/authority-port.js";

// ---- Adapters: the disclosed in-memory authority + gate doubles ----
export { createInMemoryRealExperimentAuthority } from "./adapters/in-memory-experiment-authority.js";
export type { InMemoryRealExperimentAuthorityOptions } from "./adapters/in-memory-experiment-authority.js";
export { createInMemoryLabCandidateReader } from "./adapters/in-memory-gate-doubles.js";
export type { InMemoryLabCandidateReaderOptions } from "./adapters/in-memory-gate-doubles.js";
export { createInMemoryExperimentPolicyGate } from "./adapters/in-memory-gate-doubles.js";
export type { InMemoryExperimentPolicyGateOptions } from "./adapters/in-memory-gate-doubles.js";
export { createInMemoryExperimentRightsGate } from "./adapters/in-memory-gate-doubles.js";
export type { InMemoryExperimentRightsGateOptions } from "./adapters/in-memory-gate-doubles.js";
export { createInMemoryDistributionObservationSource } from "./adapters/in-memory-gate-doubles.js";
export type { InMemoryDistributionObservationSourceOptions } from "./adapters/in-memory-gate-doubles.js";

// ---- Testing: REAL adapters + fixtures (the composition seam) ----
export { createRealDistributionObservationSource } from "./testing/real-authority-adapters.js";
export type { RealDistributionObservationSourceOptions } from "./testing/real-authority-adapters.js";
