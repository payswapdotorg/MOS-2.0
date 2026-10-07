/**
 * Public surface of `@mos/agent-runtime` (MOS v2.0 AGT-002).
 *
 * The agent instance lifecycle (instantiate → bind → release), THE SINGLE
 * MODEL/RUNTIME BOUNDARY (ModelRuntimePort — the only place model selection
 * happens; architecture lock rule 9), and the InstanceExecutorPort bound to
 * the substrate AgentRuntimePort (pinned mirror of @mos/substrate-adapters).
 *
 * Export budget: 4 runtime factories (in-memory instance registry, in-memory
 * model runtime, substrate executor, disclosed substrate double) + 1 error
 * class + 1 pure helper (agentBodyRef) — 6 runtime exports, within the
 * architecture policy budget of 12. Port method budget: 5 (instance
 * registry) + 1 (ModelRuntimePort.bindModel) + 1 (executor.execute) = 7
 * public methods, within the policy limit.
 */

// ---- Ports ----
export type {
  AgentInstanceExecutionInput,
  AgentInstanceExecutionOutcome,
  InstanceExecutorPort,
} from "./ports/instance-executor.port.js";
export type {
  ModelBinding,
  ModelBindingRequest,
  ModelRuntimePort,
} from "./ports/model-runtime.port.js";
export type { AgentInstanceRegistry } from "./ports/agent-instance-registry.port.js";

// ---- Agent instance domain ----
export type {
  AgentInstanceId,
  AgentInstanceLifecycleState,
  AgentInstanceRecord,
  BoundAgentInstance,
  InstantiateAgentInstanceInput,
} from "./domain/agent-instance.js";
export type { AgentRuntimeErrorCode } from "./domain/errors.js";
export { AgentRuntimeError } from "./domain/errors.js";

// ---- Substrate port mirror (pinned to @mos/substrate-adapters by compat/) ----
export type {
  SubstrateAgentEventListener,
  SubstrateAgentExecutionBudget,
  SubstrateAgentExecutionEvent,
  SubstrateAgentExecutionInput,
  SubstrateAgentExecutionRequest,
  SubstrateAgentExecutionResult,
  SubstrateAgentExecutionUsage,
  SubstrateAgentFinishReason,
  SubstrateAgentRuntimeHandle,
  SubstrateAgentRuntimeId,
  SubstrateAgentRuntimePort,
  SubstrateAgentRuntimeSpec,
  SubstrateAgentRuntimeStopResult,
  SubstrateJsonValue,
} from "./types/substrate-agent-runtime.js";

// ---- In-memory adapters ----
export type { InMemoryAgentInstanceRegistryOptions } from "./adapters/in-memory-agent-instance-registry.js";
export { createInMemoryAgentInstanceRegistry } from "./adapters/in-memory-agent-instance-registry.js";
export type { CatalogModel, InMemoryModelRuntimeOptions } from "./adapters/in-memory-model-runtime.js";
export { createInMemoryModelRuntime } from "./adapters/in-memory-model-runtime.js";

// ---- Substrate executor binding ----
export { agentBodyRef, createSubstrateInstanceExecutor } from "./adapters/substrate-instance-executor.js";

// ---- DISCLOSED test double (substrate AgentRuntimePort) ----
export type {
  InMemoryAgentRuntimeSubstrateDouble,
  InMemoryAgentRuntimeSubstrateDoubleOptions,
  RecordedRuntime,
} from "./test-doubles/in-memory-agent-runtime-double.js";
export { createInMemoryAgentRuntimeSubstrateDouble } from "./test-doubles/in-memory-agent-runtime-double.js";
