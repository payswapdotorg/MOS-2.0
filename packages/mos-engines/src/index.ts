/**
 * Public surface of `@mos/engines` (MOS v2.0 ENG-001 + ENG-002).
 *
 * The EngineRegistry port with its fail-closed activation gate and
 * deterministic capability resolution (spec/mos-engine-policy-v2.0.yaml),
 * the EngineAdapter invoke contract (EngineJob → EngineResult), the
 * in-memory registry adapter, the DISCLOSED test-double adapter, and the
 * pure domain functions behind the gate and the tie-break.
 *
 * Export budget: 10 runtime exports (2 factories, 1 error class, 2 frozen
 * constants, 5 pure domain functions) — within the architecture policy
 * budget of 12 public functions. Everything else is type-only.
 */

// ---- Ports (ENG-001 registry, ENG-002 adapter) ----
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

// ---- Errors ----
export { EngineRegistryError } from "./domain/errors.js";
export type { EngineRegistryErrorCode } from "./domain/errors.js";

// ---- In-memory registry adapter (working, not a skeleton) ----
export type { InMemoryEngineRegistryOptions } from "./adapters/in-memory-engine-registry.js";
export { createInMemoryEngineRegistry } from "./adapters/in-memory-engine-registry.js";

// ---- DISCLOSED test double (ENG-002 contract demonstration) ----
export type { TestDoubleEngineAdapterOptions } from "./test-doubles/disclosed-test-double-adapter.js";
export { createTestDoubleEngineAdapter } from "./test-doubles/disclosed-test-double-adapter.js";
