/**
 * Agent-stack seams (LAB-013) — the mirrored @mos/agents /
 * @mos/agent-runtime port surfaces.
 *
 * The frozen module registry gives `production` the dependencies
 * [contracts, content, rights, policy] — `agents` and `agent-runtime` are
 * NOT among them, so the runtime module graph of this package cannot import
 * those packages. Pawns are still REAL agent instances: these seams mirror
 * the real ports field-for-field from the SAME @mos/contracts brands, and
 * `compat/agent-stack-compat.ts` pins that the REAL packages satisfy them
 * with ZERO adapters (mutual assignability, no casts) — the composition
 * root wires the real registries behind these seams unchanged, and
 * `compat/pawn-real-stack.test.ts` runs whole pawn lifecycles through the
 * REAL packages over them.
 *
 * What is mirrored, and why each is assignable to the real port:
 * - `PawnBodyRegistryPort` — the @mos/agents `AgentBodyRegistryPort` verbatim
 *   (5 methods; `AgentBodyId` derived from the contract exactly as the
 *   agents package derives it — identical brands).
 * - `PawnInstanceRecord` — a structural SUPERSET-view of the real
 *   `AgentInstanceRecord` (every shared field identical; `instanceId`
 *   unbranded so the real branded ids assign into it; see
 *   contracts/pawn-ids.ts).
 * - `PawnInstanceRegistryPort` — the @mos/agent-runtime
 *   `AgentInstanceRegistry` verbatim over the record view (5 methods).
 * - `PawnModelRuntimePort` — THE single model/runtime boundary
 *   (`ModelRuntimePort` verbatim: `bindModel` only — model selection exists
 *   NOWHERE else; pinned by src/no-second-runtime.test.ts).
 * - `PawnInstanceExecutorPort` — the `InstanceExecutorPort` execution
 *   surface (outcome minus the instance id echo; substrate-shaped input /
 *   events / usage / finish-reason unions mirrored exactly).
 *
 * In-memory implementations of these seams are DISCLOSED DOUBLES
 * (adapters/in-memory-agent-stack.ts) with the same fail-closed semantics;
 * the real adapters replace them at the composition root behind the same
 * types.
 */

import type {
  AgentBody,
  CapabilityId,
  ModelRef,
  RuntimeRef,
  TenantScope,
  Timestamp,
  ToolRef,
  Version,
} from "@mos/contracts";

import type { PawnAgentBodyId, PawnInstanceId } from "../contracts/pawn-ids.js";

// ---------------------------------------------------------------------------
// Body registry seam (mirror of @mos/agents AgentBodyRegistryPort)
// ---------------------------------------------------------------------------

/** Registry of immutable, versioned agent body contracts (mirror). 5 methods. */
export interface PawnBodyRegistryPort {
  /**
   * Registers one immutable agent body record (validated fail-closed
   * against the frozen AgentBody manifest; duplicate id+version and
   * non-monotonic versions are typed errors; a body edit is a NEW version).
   */
  register(body: AgentBody): void;

  /** Resolves one exact version, or `undefined` when unknown (fail-closed). */
  get(bodyId: PawnAgentBodyId, version: Version): AgentBody | undefined;

  /** Resolves the latest registered version, or `undefined` when unknown. */
  getLatest(bodyId: PawnAgentBodyId): AgentBody | undefined;

  /** Fail-closed resolution; throws naming the body when unknown. */
  require(bodyId: PawnAgentBodyId, version?: Version): AgentBody;

  /** All registered versions of one body, ascending; empty when unknown. */
  listVersions(bodyId: PawnAgentBodyId): readonly Version[];
}

// ---------------------------------------------------------------------------
// Instance record + registry seam (mirror of @mos/agent-runtime)
// ---------------------------------------------------------------------------

/** Instance lifecycle: instantiate → bind (via the model boundary) → release. */
export type PawnInstanceLifecycleState = "instantiated" | "bound" | "released";

/**
 * One agent instance record (structural view of the real
 * `AgentInstanceRecord`). `modelRef`/`runtimeRef` exist ONLY from a model
 * boundary binding — there is no other assignment path.
 */
export interface PawnInstanceRecord {
  readonly instanceId: PawnInstanceId;
  readonly bodyId: PawnAgentBodyId;
  readonly bodyVersion: Version;
  readonly tenantScope: TenantScope;
  readonly lifecycle: PawnInstanceLifecycleState;
  /** Selected model — ONLY from a model-runtime boundary binding. */
  readonly modelRef?: ModelRef;
  /** Selected runtime — ONLY from a model-runtime boundary binding. */
  readonly runtimeRef?: RuntimeRef;
  readonly boundAt?: Timestamp;
  readonly toolRefs: readonly ToolRef[];
  readonly capabilityRefs: readonly CapabilityId[];
}

/** Input to {@link PawnInstanceRegistryPort.instantiate} (mirror). */
export interface InstantiatePawnInstanceInput {
  readonly bodyId: PawnAgentBodyId;
  readonly bodyVersion: Version;
  /** Concrete tool bindings; defaults to the body's tools (subset-checked). */
  readonly toolRefs?: readonly ToolRef[];
  /** Concrete capability bindings; defaults to the body's capabilities. */
  readonly capabilityRefs?: readonly CapabilityId[];
}

/** Agent instance lifecycle registry (mirror of AgentInstanceRegistry). 5 methods. */
export interface PawnInstanceRegistryPort {
  /**
   * Creates one instance of a registered body version under a tenant scope
   * (`instantiated` state — no model selected yet; tool/capability
   * bindings must be subsets of the body's declarations).
   */
  instantiate(scope: TenantScope, input: InstantiatePawnInstanceInput): PawnInstanceRecord;

  /**
   * Requests a model binding THROUGH the single model boundary and records
   * the returned binding. `requestedModelRef` is a PREFERENCE the boundary
   * may honor or override — never a selection. Released instances fail
   * closed; re-binding a bound instance is allowed (interchangeability).
   */
  bind(
    scope: TenantScope,
    instanceId: PawnInstanceId,
    requestedModelRef?: ModelRef,
  ): PawnInstanceRecord;

  /** Releases one instance (terminal; the record retains its last binding). */
  release(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord;

  /** One instance record, or `undefined` when unknown/foreign-tenant. */
  get(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord | undefined;

  /** All instance records for the tenant (insertion order). */
  list(scope: TenantScope): readonly PawnInstanceRecord[];
}

// ---------------------------------------------------------------------------
// THE single model/runtime boundary (mirror of ModelRuntimePort)
// ---------------------------------------------------------------------------

/** A request for one model binding for one agent body version (mirror). */
export interface PawnModelBindingRequest {
  readonly tenantScope: TenantScope;
  readonly bodyId: PawnAgentBodyId;
  readonly bodyVersion: Version;
  /** Caller preference only — the boundary may honor or override it. */
  readonly requestedModelRef?: ModelRef;
}

/** One model binding, decided ONLY by the boundary implementation (mirror). */
export interface PawnModelBinding {
  readonly modelRef: ModelRef;
  readonly runtimeRef: RuntimeRef;
  readonly boundAt: Timestamp;
}

/**
 * THE single model/runtime boundary (mirror of `ModelRuntimePort`) — the
 * only place model selection happens (lock rule 9). One public method.
 */
export interface PawnModelRuntimePort {
  /**
   * Binds a model for one agent body version. Fail-closed:
   * `no-model-requested` / `unknown-model`.
   */
  bindModel(request: PawnModelBindingRequest): PawnModelBinding;
}

// ---------------------------------------------------------------------------
// Instance executor seam (mirror of InstanceExecutorPort)
// ---------------------------------------------------------------------------

/** JSON value shape that can cross the execution boundary (substrate mirror). */
export type PawnExecutionJsonValue =
  | null
  | boolean
  | number
  | string
  | PawnExecutionJsonValue[]
  | { readonly [key: string]: PawnExecutionJsonValue };

/** Input to one agent execution: free text or structured JSON (mirror). */
export type PawnInstanceExecutionInput = string | PawnExecutionJsonValue;

/** Why an agent execution finished (substrate vocabulary mirror). */
export type PawnAgentExecutorFinishReason =
  | "completed"
  | "stopped"
  | "budget-exhausted"
  | "timeout"
  | "error";

/** One chronological execution event (substrate vocabulary mirror). */
export type PawnAgentExecutorEvent =
  | { readonly type: "execution.started"; readonly occurredAt: string }
  | { readonly type: "text.delta"; readonly occurredAt: string; readonly text: string }
  | {
      readonly type: "tool.invoked";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly input?: PawnExecutionJsonValue;
    }
  | {
      readonly type: "tool.result";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly ok: boolean;
      readonly output?: PawnExecutionJsonValue;
    }
  | { readonly type: "execution.error"; readonly occurredAt: string; readonly message: string }
  | {
      readonly type: "execution.completed";
      readonly occurredAt: string;
      readonly finishReason: PawnAgentExecutorFinishReason;
    };

/** Resource usage reported for one agent execution (substrate mirror). */
export interface PawnAgentExecutorUsage {
  readonly steps?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
}

/** Outcome of one agent execution (the real outcome minus the id echo). */
export interface PawnAgentExecutorOutcome {
  /** Final textual output produced by the runtime. */
  readonly output: string;
  readonly finishReason: PawnAgentExecutorFinishReason;
  /** Complete chronological event log of the execution. */
  readonly events: readonly PawnAgentExecutorEvent[];
  readonly usage: PawnAgentExecutorUsage;
}

/** Executes bound agent instances (mirror of InstanceExecutorPort). 1 method. */
export interface PawnInstanceExecutorPort {
  /**
   * Executes one BOUND agent instance with the given input. Fail-closed:
   * `instance-not-bound` for unbound/released instances; typed errors
   * otherwise (mirroring the real executor's failure policy).
   */
  execute(
    instance: PawnInstanceRecord,
    input: PawnInstanceExecutionInput,
  ): Promise<PawnAgentExecutorOutcome>;
}
