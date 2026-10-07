/**
 * Public surface of `@mos/engines` (MOS v2.0 ENG-001..ENG-005).
 *
 * The EngineRegistry port with its fail-closed activation gate and
 * deterministic capability resolution (spec/mos-engine-policy-v2.0.yaml),
 * the EngineAdapter invoke contract (EngineJob + sandbox context →
 * EngineResult), the EngineRunner sandbox (ENG-003), the golden-corpus
 * benchmark stack (ENG-004) with its activation-evidence wiring, the
 * in-memory adapters, and the DISCLOSED test doubles.
 *
 * Runtime export count: 23 (9 factories — 4 in-memory adapters + 5
 * DISCLOSED test doubles, 3 error classes, 3 frozen constants, 8 pure
 * domain functions). The 12-public-method policy budget applies PER PORT —
 * every port here stays ≤ 3 methods (EngineRegistryPort 10,
 * EngineRunnerPort 2, BenchmarkCorpusRegistryPort 3, BenchmarkEvaluatorPort
 * 1, BenchmarkRunnerPort 1, JobEventSinkPort 1, EngineArtifactStorePort 2,
 * SandboxNetworkPort 1, EngineAdapter 1).
 */

// ---- Ports (ENG-001 registry, ENG-002 adapter, ENG-003 runner) ----
export type {
  EngineAssignmentRecord,
  EngineAssignmentVia,
  EngineRegistrationResult,
  EngineRegistryPort,
  EngineReplacementInput,
  EngineReplacementRecord,
  EngineResolution,
  EngineResolutionOptions,
  EngineTenantOverride,
  EngineVersionRollback,
} from "./ports/engine-registry.port.js";
export type { EngineAdapter } from "./ports/engine-adapter.port.js";
export type {
  EngineArtifactRecord,
  EngineArtifactStorePort,
  EngineJobSubmissionOptions,
  EngineRunnerPort,
  EngineSandboxContext,
  NetworkPolicy,
  PersistArtifactInput,
  SandboxNetworkPort,
} from "./ports/engine-runner.port.js";
export type {
  EngineJobLifecycleState,
  EngineRunObservabilityRecord,
  JobCompletedEvent,
  JobEvent,
  JobEventSinkPort,
  JobQueuedEvent,
  JobRunningEvent,
} from "./ports/job-event-sink.port.js";

// ---- Activation evidence chain (fail-closed gate) ----
export type {
  ActivationEvidenceKey,
  CapabilityContractTestEvidence,
  EngineActivationEvidence,
  EngineActivationEvidenceInput,
  EngineActivationResult,
  EvaluatorResultEvidence,
  GoldenCorpusBenchmarkEvidence,
  LicenseReviewEvidence,
  ManifestValidationEvidence,
  ProvenanceRecordEvidence,
  SecuritySandboxReviewEvidence,
} from "./domain/activation.js";
export { ACTIVATION_EVIDENCE_KEYS } from "./domain/activation.js";
export {
  activationFailedChecks,
  missingEvidenceItems,
} from "./domain/activation.js";

// ---- Deterministic resolution (policy tie-break) ----
export type {
  CompatibilityVerdict,
  EngineResolutionCandidate,
  LicenseCompatibility,
  TieBreakDimension,
} from "./domain/resolution.js";
export { TIE_BREAK_ORDER } from "./domain/resolution.js";
export {
  compareEngineCandidates,
  deriveLicenseCompatibility,
  firstDifferingDimension,
} from "./domain/resolution.js";

// ---- Sandbox policy (ENG-003 pure enforcement core) ----
export type { QuotaDimension, SandboxManifestFacets } from "./domain/sandbox-policy.js";
export { QUOTA_DIMENSIONS } from "./domain/sandbox-policy.js";

// ---- Errors ----
export { EngineRegistryError } from "./domain/errors.js";
export type { EngineRegistryErrorCode } from "./domain/errors.js";
export { EngineSandboxViolationError } from "./domain/errors.js";
export type { EngineSandboxErrorCode } from "./domain/errors.js";
export { BenchmarkError } from "./domain/errors.js";
export type { BenchmarkErrorCode } from "./domain/errors.js";

// ---- In-memory registry adapter (working, not a skeleton) ----
export type { InMemoryEngineRegistryOptions } from "./adapters/in-memory-engine-registry.js";
export { createInMemoryEngineRegistry } from "./adapters/in-memory-engine-registry.js";

// ---- In-memory runner sandbox (ENG-003) ----
export type {
  InMemoryEngineRunnerOptions,
} from "./adapters/in-memory-engine-runner.js";
export type { EngineRunnerTimers } from "./adapters/sandbox-seams.js";
export { createInMemoryEngineRunner } from "./adapters/in-memory-engine-runner.js";

// ---- Golden corpus / benchmark stack (ENG-004) ----
export type {
  BenchmarkCaseRun,
  BenchmarkCorpus,
  BenchmarkCorpusCase,
  BenchmarkCorpusRegistryPort,
  BenchmarkEvaluation,
  BenchmarkEvaluatorPort,
  BenchmarkRunInput,
  BenchmarkRunnerPort,
} from "./ports/benchmark.port.js";
export type {
  InMemoryBenchmarkRunnerOptions,
} from "./adapters/in-memory-benchmark-runner.js";
export { createInMemoryBenchmarkRunner } from "./adapters/in-memory-benchmark-runner.js";
export { createInMemoryBenchmarkCorpusRegistry } from "./adapters/in-memory-benchmark-corpus-registry.js";
export {
  benchmarkRecordViolations,
  goldenCorpusEvidenceFromBenchmark,
  worstLicenseReviewStatus,
} from "./domain/benchmark-evidence.js";

// ---- DISCLOSED test doubles (ENG-002 contract, ENG-003/004/005 mechanics) ----
export type { TestDoubleEngineAdapterOptions } from "./test-doubles/disclosed-test-double-adapter.js";
export { createTestDoubleEngineAdapter } from "./test-doubles/disclosed-test-double-adapter.js";
export type {
  InMemoryArtifactStore,
  InMemoryArtifactStoreOptions,
} from "./test-doubles/in-memory-artifact-store.js";
export { createInMemoryArtifactStore } from "./test-doubles/in-memory-artifact-store.js";
export type { InMemoryJobEventSink } from "./test-doubles/in-memory-job-event-sink.js";
export { createInMemoryJobEventSink } from "./test-doubles/in-memory-job-event-sink.js";
export type {
  NetworkAttemptMode,
  SandboxAwareTestAdapterOptions,
} from "./test-doubles/sandbox-aware-test-adapter.js";
export { createSandboxAwareTestAdapter } from "./test-doubles/sandbox-aware-test-adapter.js";
export type {
  DisclosedBenchmarkEvaluatorOptions,
} from "./test-doubles/disclosed-benchmark-evaluator.js";
export { createDisclosedBenchmarkEvaluator } from "./test-doubles/disclosed-benchmark-evaluator.js";
