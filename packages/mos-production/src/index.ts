/**
 * Public surface of `@mos/production` (MOS v2.0 — LAB-013 Transform Pawn
 * Agents + LAB-016 Production Program Search).
 *
 * The ten §9 transform pawn bodies as REAL AgentInstances: bodies
 * registered through the agent-stack body-registry seam with
 * transform-domain role contracts and deterministic engine tool bindings;
 * the PawnExecutionPort lifecycle (instantiate → bind (model ONLY for
 * llm-flavored pawns, through THE single model-runtime boundary) → execute
 * → release) with append-only §30 execution records; engine invocations as
 * EngineJob refs through the EngineRunnerPort seam (typed failures pass
 * through); TransformPawnOrganization composition over the @mos/contracts
 * organization types; a rights gate over the REAL injected evaluateRights.
 *
 * LAB-016 (§7): the ProductionProgramSearchPort searches the FULL
 * production program over the SIXTEEN declared candidate dimensions —
 * ranked, uncertainty-labeled, counterfactual candidate sets with the
 * no-op/repost baseline structurally present on every result (never a
 * deployment decision — §24). Candidate programs compose canonical
 * CORE-001 ProductionRequests (required fields complete by construction);
 * lab-side surfaces arrive through DECLARED PORT SEAMS (catalog,
 * organization source, evaluation) with disclosed doubles.
 *
 * Registry discipline: `production`'s frozen module dependencies are
 * [contracts, content, rights, policy] — the runtime module graph imports
 * @mos/contracts (types + guards) and @mos/content/@mos/rights TYPE-ONLY;
 * the agent/agent-runtime/engine/lab surfaces are mirrored port seams
 * (compat-pinned against the real packages) with disclosed in-memory
 * doubles. The testing composition seams (src/testing) wire the REAL rights
 * evaluation rule and the REAL content repository by relative dist path.
 *
 * Export budget: 13 runtime factories + 1 pure helper (engineToolRef) + 5
 * frozen constants (PAWN_TRANSFORM_KINDS, TRANSFORM_PAWN_KINDS,
 * TRANSFORM_PAWN_BODIES, PROGRAM_SEARCH_DIMENSIONS, NO_OP_PROGRAM_REFS) +
 * 1 error class — 20 runtime exports. Port method budgets: PawnExecution
 * Port 10, TransformPawnOrganizationPort 3, body registry seam 5, instance
 * registry seam 5, model boundary 1, executor 1, engine runner 1, transform
 * source 1, artifact source 1, rights gate 1, program search 1, program
 * evaluation 1, program organization source 1, program transform catalog 1
 * — all ≤ 12.
 */

// ---- Contracts: pawn vocabulary ----
export type {
  PawnModelFlavor,
  PawnEngineToolBinding,
  PawnTransformKind,
  TransformPawnKind,
  TransformPawnRoleContract,
} from "./contracts/pawn-role.js";
export { PAWN_TRANSFORM_KINDS, TRANSFORM_PAWN_KINDS } from "./contracts/pawn-role.js";

// ---- Contracts: pawn body ----
export type { TransformPawnBody, TransformPawnBodyRef } from "./contracts/pawn-body.js";
export { engineToolRef } from "./contracts/pawn-body.js";

// ---- Contracts: task ----
export type {
  PawnExecutionActor,
  PawnOrganizationCitation,
  TransformApplicationCitation,
  TransformPawnTask,
} from "./contracts/pawn-task.js";

// ---- Contracts: execution record (§30) ----
export type {
  PawnAgentExecutionEvent,
  PawnAgentExecutionRecord,
  PawnAgentExecutionUsage,
  PawnAgentFinishReason,
  PawnEngineInvocationRecord,
  PawnExecutionAuditEvent,
  PawnExecutionAuditEventType,
  PawnExecutionEvaluation,
  PawnExecutionFailure,
  PawnExecutionFailureCode,
  PawnExecutionLifecycleState,
  PawnExecutionRecord,
  PawnModelBindingRecord,
  PawnRightsVerdictRecord,
} from "./contracts/pawn-execution.js";

// ---- Contracts: organization ----
export type {
  ComposeTransformPawnOrganizationInput,
  PawnOrganizationEdgeKind,
  PawnOrganizationRejectionReason,
  TransformPawnOrganizationEdgeInput,
  TransformPawnOrganizationNodeInput,
  TransformPawnOrganizationRecord,
  TransformPawnModelAssignmentInput,
} from "./contracts/pawn-organization.js";

// ---- Derived identifiers ----
export type {
  PawnAgentBodyId,
  PawnAgentOrganizationId,
  PawnExecutionId,
  PawnInstanceId,
} from "./contracts/pawn-ids.js";

// ---- Ports: the pawn surfaces ----
export type {
  InstantiatePawnInput,
  PawnExecutionPort,
} from "./ports/pawn-execution.port.js";
export type { TransformPawnOrganizationPort } from "./ports/pawn-organization.port.js";

// ---- Ports: the mirrored seams (compat-pinned against the real packages) ----
export type {
  InstantiatePawnInstanceInput,
  PawnAgentExecutorEvent,
  PawnAgentExecutorFinishReason,
  PawnAgentExecutorOutcome,
  PawnAgentExecutorUsage,
  PawnBodyRegistryPort,
  PawnExecutionJsonValue,
  PawnInstanceExecutionInput,
  PawnInstanceExecutorPort,
  PawnInstanceLifecycleState,
  PawnInstanceRecord,
  PawnInstanceRegistryPort,
  PawnModelBinding,
  PawnModelBindingRequest,
  PawnModelRuntimePort,
} from "./ports/agent-stack.ports.js";
export type {
  PawnEngineJobSubmissionOptions,
  PawnEngineRunnerPort,
} from "./ports/engine-runner.port.js";
export type {
  PawnTransformSourcePort,
  ResolvedPawnTransform,
} from "./ports/transform-source.port.js";
export type {
  PawnArtifactSourcePort,
  PawnResolvedArtifact,
} from "./ports/artifact-source.port.js";
export type {
  PawnRightsCheckRequest,
  PawnRightsGatePort,
  PawnRightsGateVerdict,
} from "./ports/rights-gate.port.js";

// ---- The ten §9 pawn bodies ----
export { TRANSFORM_PAWN_BODIES } from "./bodies/transform-pawn-bodies.js";

// ---- Errors ----
export { PawnExecutionError } from "./domain/errors.js";
export type { PawnExecutionErrorCode } from "./domain/errors.js";

// ---- Disclosed in-memory doubles (the seam implementations) ----
export {
  createInMemoryPawnBodyRegistry,
  createInMemoryPawnInstanceExecutor,
  createInMemoryPawnInstanceRegistry,
  createInMemoryPawnModelRuntime,
} from "./adapters/in-memory-agent-stack.js";
export type {
  InMemoryPawnBodyRegistryOptions,
  InMemoryPawnExecutorOptions,
  InMemoryPawnInstanceRegistryOptions,
  PawnCatalogModel,
} from "./adapters/in-memory-agent-stack.js";
export { createInMemoryEngineRunner } from "./adapters/in-memory-engine-runner.js";
export type {
  InMemoryEngineRunnerDouble,
  InMemoryEngineRunnerOptions,
  InMemoryRunnerRoute,
  RecordedEngineSubmission,
} from "./adapters/in-memory-engine-runner.js";
export { createInMemoryTransformSource } from "./adapters/in-memory-transform-source.js";
export type {
  InMemoryTransformSourceDouble,
  InMemoryTransformSourceOptions,
  PawnTransformDefinitionSeed,
} from "./adapters/in-memory-transform-source.js";
export { createInMemoryPawnRightsGate } from "./adapters/in-memory-pawn-rights-gate.js";
export type {
  InMemoryPawnRightsGate,
  InMemoryPawnRightsGateOptions,
  PawnRightsEvaluator,
} from "./adapters/in-memory-pawn-rights-gate.js";

// ---- The pawn execution runtime + organization registry ----
export { createInMemoryPawnExecutionRuntime } from "./adapters/in-memory-pawn-execution.js";
export type {
  InMemoryPawnExecutionRuntime,
  InMemoryPawnExecutionRuntimeOptions,
  PawnOrganizationSource,
} from "./adapters/in-memory-pawn-execution.js";
export { createInMemoryPawnOrganizationRegistry } from "./adapters/in-memory-pawn-organization.js";
export type { InMemoryPawnOrganizationRegistryOptions } from "./adapters/in-memory-pawn-organization.js";

// ---- Contracts: the sixteen §7 program search dimensions (LAB-016) ----
export type {
  ProgramFeatureFingerprint,
  ProgramSearchDimension,
} from "./contracts/program-dimensions.js";
export { PROGRAM_SEARCH_DIMENSIONS } from "./contracts/program-dimensions.js";

// ---- Contracts: the candidate program ----
export type {
  CandidateProgram,
  ProgramAcquisitionMode,
  ProgramCapabilityAcquisition,
  ProgramCandidateOrigin,
  ProgramDelayExpectation,
  ProgramDelayExpectationProvenance,
  ProgramDelayTerms,
  ProgramModelAssignment,
  ProgramOrganizationCitation,
  ProgramProductionModality,
  ProgramQualityThresholds,
  ProgramStoppingSubstitutionPolicy,
  ProgramTransformStep,
} from "./contracts/program-candidate.js";
export { NO_OP_PROGRAM_REFS } from "./contracts/program-candidate.js";

// ---- Contracts: the program search (policy/input/evaluation/failure) ----
export type {
  DeclaredCandidateProgram,
  ProductionProgramSearchBudget,
  ProductionProgramSearchError,
  ProductionProgramSearchErrorCode,
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
  ProgramCandidateEvaluation,
  ProgramExpectedValueOfDelay,
  ProgramInterval,
  ProgramPruningRule,
  ProgramSeedRobustness,
} from "./contracts/program-search.js";

// ---- Contracts: the program search result + port ----
export type {
  ProductionProgramSearchPort,
  ProductionProgramSearchResult,
  ProductionProgramSearchResultId,
  ProgramBaselineComparison,
  ProgramIntervalOverlapDeclaration,
  ProgramSearchBudgetRecord,
  ProgramSearchProvenance,
  ProgramSearchStopReason,
  ProgramSearchStopping,
  RankedCandidateProgram,
} from "./contracts/program-search-result.js";

// ---- Ports: the program search seams (compat-pinned against the real packages) ----
export type {
  ProgramTransformCatalogPort,
} from "./ports/program-transform-catalog.port.js";
export type {
  ProgramOrganizationDescriptor,
  ProgramOrganizationExecutionOrdering,
  ProgramOrganizationSourcePort,
} from "./ports/program-organization-source.port.js";
export type {
  ProgramEvaluationInterval,
  ProgramEvaluationPort,
  ProgramEvaluationRequest,
  ProgramEvaluationResult,
  ProgramSimulationAction,
} from "./ports/program-evaluation.port.js";

// ---- The program search runtime + its disclosed seam doubles ----
export { createInMemoryProgramSearch } from "./adapters/in-memory-program-search.js";
export type { InMemoryProgramSearchOptions } from "./adapters/in-memory-program-search.js";
export { createInMemoryProgramTransformCatalog } from "./adapters/in-memory-program-transform-catalog.js";
export type {
  InMemoryProgramTransformCatalogDouble,
  InMemoryProgramTransformCatalogOptions,
  ProgramTransformCatalogSeed,
} from "./adapters/in-memory-program-transform-catalog.js";
export { createInMemoryProgramOrganizationSource } from "./adapters/in-memory-program-organization-source.js";
export type {
  InMemoryProgramOrganizationSourceDouble,
  InMemoryProgramOrganizationSourceOptions,
} from "./adapters/in-memory-program-organization-source.js";
export { createInMemoryProgramEvaluation } from "./adapters/in-memory-program-evaluation.js";
export type { InMemoryProgramEvaluationOptions } from "./adapters/in-memory-program-evaluation.js";
