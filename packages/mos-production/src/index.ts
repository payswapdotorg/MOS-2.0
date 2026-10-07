/**
 * Public surface of `@mos/production` (MOS v2.0 LAB-013 — first slice of
 * the production authority).
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
 * Registry discipline: `production`'s frozen module dependencies are
 * [contracts, content, rights, policy] — the runtime module graph imports
 * @mos/contracts (types + guards) and @mos/content/@mos/rights TYPE-ONLY;
 * the agent/agent-runtime/engine/lab surfaces are mirrored port seams
 * (compat-pinned against the real packages) with disclosed in-memory
 * doubles. The testing composition seam (src/testing) wires the REAL rights
 * evaluation rule and the REAL content repository by relative dist path.
 *
 * Export budget: 9 runtime factories + 1 pure helper (engineToolRef) + 1
 * frozen constant (TRANSFORM_PAWN_BODIES) + 1 error class — 12 runtime
 * exports, within the architecture policy budget. Port method budgets:
 * PawnExecutionPort 10, TransformPawnOrganizationPort 3, body registry
 * seam 5, instance registry seam 5, model boundary 1, executor 1, engine
 * runner 1, transform source 1, artifact source 1, rights gate 1 — all
 * ≤ 12.
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
