/**
 * AgentBody, AgentInstance and AgentOrganization contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   AgentBody.required = [id, version, roleContract, inputContract,
 *     outputContract, tools, permissions, memory, communication,
 *     actionInterface, capabilities, budget, latency, evaluator, safety]
 *   AgentInstance.required = [bodyVersion, modelRef, runtimeRef, toolRefs,
 *     capabilityRefs]
 *   AgentOrganization.required = [id, version, nodes, edges,
 *     modelAssignments, memoryPolicy, budgetPolicy, terminationPolicy,
 *     evaluator]
 *
 * Basis: spec/mos-architecture-v2.0.md §5 (Agent Body = reusable MOS-owned
 * role/tool/permission/memory contract; Agent Instance = body + selected
 * model through the existing model/runtime boundary + tools/capabilities;
 * Agent Organization = a graph of bodies/instances and
 * communication/delegation edges that can be searched and versioned), §9
 * (pawn agents: a pawn may invoke deterministic engines and does not need
 * to be an LLM; no pawn may introduce a second agent runtime or model
 * router), §23 (organization search), AGENTS.md safety list.
 *
 * AGT-001..003 (@mos/agents, @mos/agent-runtime) implement against these
 * types.
 */

import type {
  AgentBodyId,
  AgentOrganizationId,
  Budget,
  CapabilityId,
  EvaluatorRef,
  JsonSchemaObject,
  LatencyModel,
  ModelRef,
  PermissionRef,
  RuntimeRef,
  ToolRef,
  Version,
} from "./value-types.js";

// ---------------------------------------------------------------------------
// AgentBody
// ---------------------------------------------------------------------------

/** What a role contract states: the role's summary and its duties. */
export interface AgentRoleContract {
  readonly summary: string;
  readonly duties: readonly string[];
}

/** Memory scope an agent body is allowed to use. */
export type MemoryScope = "none" | "session" | "persistent";

/** Memory policy for one agent body. */
export interface MemoryPolicy {
  readonly scope: MemoryScope;
}

/** Communication policy for one agent body. */
export interface CommunicationPolicy {
  readonly mayInitiate: boolean;
  readonly allowedTopics: readonly string[];
}

/**
 * Safety prohibitions (AGENTS.md "Safety" / spec §2 disallowed strategies).
 * Open union: the frozen list is enumerated; additional prohibitions are
 * string-labeled.
 */
export type SafetyProhibition =
  | "fake-engagement"
  | "coordinated-inauthentic-behavior"
  | "anti-abuse-bypass"
  | "impersonation"
  | "fabricated-testimonials"
  | "deceptive-attribution"
  | "rights-circumvention"
  | (string & {});

/** Safety policy attached to an agent body. */
export interface SafetyPolicy {
  readonly prohibitions: readonly SafetyProhibition[];
}

/**
 * A reusable MOS-owned role/tool/permission/memory contract. Bodies never
 * pin concrete models or runtimes — that is the AgentInstance boundary
 * (AGT-002: one model/runtime boundary, interchangeable models, no second
 * router).
 */
export interface AgentBody {
  readonly id: AgentBodyId;
  readonly version: Version;
  readonly roleContract: AgentRoleContract;
  readonly inputContract: JsonSchemaObject;
  readonly outputContract: JsonSchemaObject;
  readonly tools: readonly ToolRef[];
  readonly permissions: readonly PermissionRef[];
  readonly memory: MemoryPolicy;
  readonly communication: CommunicationPolicy;
  readonly actionInterface: JsonSchemaObject;
  readonly capabilities: readonly CapabilityId[];
  readonly budget: Budget;
  readonly latency: LatencyModel;
  readonly evaluator: EvaluatorRef;
  readonly safety: SafetyPolicy;
}

// ---------------------------------------------------------------------------
// AgentInstance
// ---------------------------------------------------------------------------

/**
 * An Agent Body bound to one selected model through the existing
 * model/runtime boundary. Projected exactly as the frozen contract list:
 * the body is referenced by its version (`bodyVersion`) and the instance
 * adds the model, runtime, concrete tool bindings and capability bindings.
 */
export interface AgentInstance {
  readonly bodyVersion: Version;
  readonly modelRef: ModelRef;
  readonly runtimeRef: RuntimeRef;
  readonly toolRefs: readonly ToolRef[];
  readonly capabilityRefs: readonly CapabilityId[];
}

// ---------------------------------------------------------------------------
// AgentOrganization
// ---------------------------------------------------------------------------

/** One organization node: a named slot occupied by one agent body. */
export interface AgentOrganizationNode {
  readonly nodeId: string;
  readonly bodyId: AgentBodyId;
}

/** Organization edge kinds (spec §5: communication/delegation edges). */
export type AgentOrganizationEdgeKind =
  | "communication"
  | "delegation"
  | (string & {});

/** One organization edge between two nodes. */
export interface AgentOrganizationEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: AgentOrganizationEdgeKind;
}

/** Model assignment for one organization node (AGT-002 boundary). */
export interface ModelAssignment {
  readonly nodeId: string;
  readonly modelRef: ModelRef;
}

/** Budget policy: organization-wide cap plus per-node cap. */
export interface BudgetPolicy {
  readonly organization: Budget;
  readonly perNode: Budget;
}

/** Termination policy for an organization run. */
export interface TerminationPolicy {
  readonly maxIterations: number;
  readonly timeoutMs: number;
}

/**
 * A versioned, searchable graph of agent bodies with model assignments and
 * communication/delegation edges (spec §23: organization search is a Lab
 * search dimension). Organizations are versioned contracts — a Studio
 * session loads an exact version explicitly supplied by the caller.
 */
export interface AgentOrganization {
  readonly id: AgentOrganizationId;
  readonly version: Version;
  readonly nodes: readonly AgentOrganizationNode[];
  readonly edges: readonly AgentOrganizationEdge[];
  readonly modelAssignments: readonly ModelAssignment[];
  readonly memoryPolicy: MemoryPolicy;
  readonly budgetPolicy: BudgetPolicy;
  readonly terminationPolicy: TerminationPolicy;
  readonly evaluator: EvaluatorRef;
}
