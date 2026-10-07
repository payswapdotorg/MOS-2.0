/**
 * PawnExecutionPort (LAB-013) — the pawn lifecycle + execution surface.
 *
 * PAWNS ARE AGENT INSTANCES (§9): this port instantiates them through the
 * agent-stack instance-registry seam, binds models ONLY for llm-flavored
 * pawns through THE single model-runtime boundary (deterministic pawns
 * carry NO model binding — refused with a typed failure, pinned), executes
 * declared tasks through the instance-executor seam + the engine runner
 * seam, and records every execution append-only with full §30
 * observability.
 *
 * 10 public methods (architecture policy budget: 12). Organization
 * composition lives on the sibling {@link ./pawn-organization.port.js}
 * (3 methods) so each port stays inside its own budget.
 */

import type { ModelRef, TenantScope, ToolRef, CapabilityId, Version } from "@mos/contracts";

import type { PawnAgentBodyId, PawnExecutionId, PawnInstanceId } from "../contracts/pawn-ids.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";
import type { TransformPawnTask } from "../contracts/pawn-task.js";
import type { PawnExecutionRecord } from "../contracts/pawn-execution.js";
import type { TransformPawnKind } from "../contracts/pawn-role.js";
import type { PawnInstanceRecord } from "./agent-stack.ports.js";

/** Input to {@link PawnExecutionPort.instantiatePawn}: kind or exact body citation. */
export interface InstantiatePawnInput {
  /** Cites the pawn kind (resolved to its latest registered body version). */
  readonly pawnKind?: TransformPawnKind;
  /** Cites an exact registered pawn body (mutually exclusive with pawnKind). */
  readonly bodyId?: PawnAgentBodyId;
  readonly bodyVersion?: Version;
  /** Concrete tool bindings; defaults to the body's tools (subset-checked). */
  readonly toolRefs?: readonly ToolRef[];
  /** Concrete capability bindings; defaults to the body's capabilities. */
  readonly capabilityRefs?: readonly CapabilityId[];
}

/** The pawn lifecycle + execution surface. 10 public methods. */
export interface PawnExecutionPort {
  /**
   * Registers one transform pawn body: validates the pawn record (canonical
   * AgentBody manifest + role coherence), registers the agent body through
   * the body-registry seam, and indexes the transform-domain role.
   * Fail-closed with typed errors (`invalid-pawn-body`,
   * `duplicate-pawn-body`).
   */
  registerPawnBody(pawn: TransformPawnBody): void;

  /** The registered pawn bodies (registration order). */
  listPawnBodies(): readonly TransformPawnBody[];

  /**
   * Instantiates one pawn as a REAL agent instance (through the
   * instance-registry seam) under a tenant scope — `instantiated` state, NO
   * model selected. Only REGISTERED pawn bodies instantiate here
   * (`pawn-body-not-registered` otherwise).
   */
  instantiatePawn(scope: TenantScope, input: InstantiatePawnInput): PawnInstanceRecord;

  /**
   * Requests a model binding for one llm-flavored pawn instance THROUGH the
   * single model boundary (delegated to the instance registry seam, which
   * owns the boundary — this port carries no model-selection surface).
   * Deterministic pawns are REFUSED with `no-model-binding-for-deterministic-pawn`
   * (pinned: they never carry a model binding).
   */
  bindPawnModel(
    scope: TenantScope,
    instanceId: PawnInstanceId,
    requestedModelRef?: ModelRef,
  ): PawnInstanceRecord;

  /** Releases one pawn instance (terminal). */
  releasePawn(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord;

  /** One pawn instance record, or `undefined` when unknown/foreign-tenant. */
  getPawnInstance(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord | undefined;

  /** All pawn instance records for the tenant (insertion order). */
  listPawnInstances(scope: TenantScope): readonly PawnInstanceRecord[];

  /**
   * Executes one declared task against a pawn instance and appends the §30
   * execution record (append-only, immutable). Caller errors are thrown
   * typed (no record); production-action failures (rights denial, typed
   * engine failure, agent-execution failure, unbound llm instance) are
   * RECORDED on a failed record.
   */
  executePawn(scope: TenantScope, task: TransformPawnTask): Promise<PawnExecutionRecord>;

  /** One execution record, or `undefined` when unknown/foreign-tenant. */
  getPawnExecution(scope: TenantScope, executionId: PawnExecutionId): PawnExecutionRecord | undefined;

  /** All execution records for the tenant (append-only order). */
  listPawnExecutions(scope: TenantScope): readonly PawnExecutionRecord[];
}
