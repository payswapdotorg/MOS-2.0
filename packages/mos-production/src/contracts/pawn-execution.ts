/**
 * The pawn execution record (LAB-013) — §30 observability + audit trace.
 *
 * Basis: spec/mos-architecture-v2.0.md §30 (every production action records
 * request/run/session id, contract version, actor, organization version,
 * engine version, capability version, artifact refs, cost/latency,
 * failure/warning, provenance, evaluation result) and §9 (pawns may invoke
 * deterministic engines — every invocation is an EngineJob submitted
 * THROUGH the runner seam and recorded here as an EngineJob ref).
 *
 * Records are append-only immutable snapshots (deep-frozen by the runtime):
 * an execution history never rewrites, and a failed execution is still a
 * recorded production action (the failure is data, not an absence).
 */

import type {
  ArtifactRef,
  EngineId,
  EngineJobFailure,
  EngineJobId,
  EngineWarning,
  CapabilityId,
  EvaluatorRef,
  Milliseconds,
  ModelRef,
  MoneyAmount,
  RunProvenance,
  RuntimeRef,
  TenantId,
  Timestamp,
  TransformId,
  Version,
  JsonObject,
} from "@mos/contracts";

import type { TransformApplicationCitation, PawnExecutionActor, PawnOrganizationCitation } from "./pawn-task.js";
import type { PawnAgentBodyId, PawnExecutionId, PawnInstanceId } from "./pawn-ids.js";
import type { PawnTransformKind, TransformPawnKind } from "./pawn-role.js";

// ---------------------------------------------------------------------------
// Engine invocations (through the runner seam)
// ---------------------------------------------------------------------------

/**
 * One deterministic engine invocation recorded as an EngineJob ref: the
 * exact capability/engine identity, the typed failure when the run failed
 * (the runner's typed vocabulary passes through VERBATIM — code, message,
 * retriable), outputs, metrics, warnings, run provenance, duration and cost
 * from the EngineResult.
 */
export interface PawnEngineInvocationRecord {
  readonly jobId: EngineJobId;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly lifecycle: "succeeded" | "failed";
  /** The runner's typed failure, verbatim; `null` on success. */
  readonly failure: EngineJobFailure | null;
  readonly warnings: readonly EngineWarning[];
  readonly outputArtifactRefs: readonly ArtifactRef[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly provenance: RunProvenance | null;
  readonly durationMs: Milliseconds;
  readonly cost: MoneyAmount | null;
}

// ---------------------------------------------------------------------------
// Agent-instance execution (through the executor seam — LLM-flavored pawns)
// ---------------------------------------------------------------------------

/**
 * The agent-execution usage mirror (substrate-shaped, identical unions to
 * the real executor vocabulary — compat-pinned).
 */
export interface PawnAgentExecutionUsage {
  readonly steps?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
}

/** Why an agent execution finished (substrate vocabulary mirror). */
export type PawnAgentFinishReason =
  | "completed"
  | "stopped"
  | "budget-exhausted"
  | "timeout"
  | "error";

/** One chronological agent-execution event (substrate vocabulary mirror). */
export type PawnAgentExecutionEvent =
  | { readonly type: "execution.started"; readonly occurredAt: string }
  | { readonly type: "text.delta"; readonly occurredAt: string; readonly text: string }
  | {
      readonly type: "tool.invoked";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly input?: unknown;
    }
  | {
      readonly type: "tool.result";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly ok: boolean;
      readonly output?: unknown;
    }
  | { readonly type: "execution.error"; readonly occurredAt: string; readonly message: string }
  | {
      readonly type: "execution.completed";
      readonly occurredAt: string;
      readonly finishReason: PawnAgentFinishReason;
    };

/**
 * One agent-instance execution through the instance-executor seam: the
 * final output, the finish reason, the usage and the complete chronological
 * event log (§30 provenance of the model-bound run).
 */
export interface PawnAgentExecutionRecord {
  readonly finishReason: PawnAgentFinishReason;
  readonly output: string;
  readonly usage: PawnAgentExecutionUsage;
  readonly events: readonly PawnAgentExecutionEvent[];
}

// ---------------------------------------------------------------------------
// Model binding provenance (LLM-flavored pawns only)
// ---------------------------------------------------------------------------

/**
 * The model binding of the executing instance — the ONLY source of
 * `modelRef`/`runtimeRef` on the record, decided by the single
 * model-runtime boundary (never by this package). `null` for deterministic
 * pawns: they carry NO model binding (pinned).
 */
export interface PawnModelBindingRecord {
  readonly modelRef: ModelRef;
  readonly runtimeRef: RuntimeRef;
  readonly boundAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Rights verdict
// ---------------------------------------------------------------------------

/** The pre-execution rights-gate verdict recorded on every execution. */
export interface PawnRightsVerdictRecord {
  readonly verdict: "granted" | "denied";
  /** The verbatim @mos/rights denial reason, or `null` when granted. */
  readonly denialReason: string | null;
  /** The explicit grant that authorized the execution, or `null`. */
  readonly grantRef: string | null;
  /** Number of rights subjects evaluated (one per input artifact). */
  readonly subjectsEvaluated: number;
}

// ---------------------------------------------------------------------------
// Typed execution failure
// ---------------------------------------------------------------------------

/** Failures of the recorded production action (caller errors are thrown, not recorded). */
export type PawnExecutionFailureCode =
  /** An llm-flavored pawn was executed without a model binding. */
  | "pawn-instance-not-bound"
  /** The pre-execution rights gate denied the transform application. */
  | "rights-denied"
  /** A deterministic engine invocation failed (typed runner failure inside). */
  | "engine-invocation-failed"
  /** The agent-instance execution failed (non-completed finish or typed error). */
  | "agent-execution-failed";

/** The typed failure of one pawn execution (§30 failure/warning). */
export interface PawnExecutionFailure {
  readonly code: PawnExecutionFailureCode;
  readonly message: string;
  /** Verbatim detail: rights denial reason, runner failure code, or finish reason. */
  readonly detail: string | null;
  /** Retriability passthrough (engine failures carry the runner's flag). */
  readonly retriable: boolean;
}

// ---------------------------------------------------------------------------
// Audit trace
// ---------------------------------------------------------------------------

/** Chronological audit event types of one pawn execution. */
export type PawnExecutionAuditEventType =
  | "execution-started"
  | "transform-resolved"
  | "artifacts-resolved"
  | "rights-evaluated"
  | "engine-job-submitted"
  | "engine-job-completed"
  | "engine-job-failed"
  | "agent-execution-started"
  | "agent-execution-completed"
  | "execution-completed"
  | "execution-failed";

/** One audit trace entry (append-only, chronological). */
export interface PawnExecutionAuditEvent {
  readonly type: PawnExecutionAuditEventType;
  readonly occurredAt: Timestamp;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// Evaluation result (§30)
// ---------------------------------------------------------------------------

/**
 * The §30 evaluation result of one execution: the pawn body's declared
 * evaluator ref plus the recorded engine metrics (aggregated from the
 * engine invocations; empty for pure-agent executions — computed evaluation
 * of outputs is later-wave work behind the declared evaluator, disclosed).
 */
export interface PawnExecutionEvaluation {
  readonly evaluator: EvaluatorRef;
  readonly engineMetrics: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** Lifecycle of one recorded pawn execution (a completed action). */
export type PawnExecutionLifecycleState = "succeeded" | "failed";

/**
 * One recorded pawn execution: the complete §30 production-action record.
 * Every field of the §30 list is explicit — see the file docblock mapping.
 */
export interface PawnExecutionRecord {
  /** Run id (§30 request/run/session id). */
  readonly executionId: PawnExecutionId;
  /** Contract version of this record shape (§30 contract version). */
  readonly contractVersion: "pawn-execution/1";
  readonly tenantId: TenantId;
  /** §30 actor (the requesting principal — also the rights grantee). */
  readonly actor: PawnExecutionActor;
  readonly pawnKind: TransformPawnKind;
  /** Session id of the §2 sense: the executing agent instance. */
  readonly instanceId: PawnInstanceId;
  readonly bodyId: PawnAgentBodyId;
  readonly bodyVersion: Version;
  /** Model binding provenance — `null` for deterministic pawns (pinned). */
  readonly modelBinding: PawnModelBindingRecord | null;
  /** §30 organization version citation, or `null` when standalone. */
  readonly organization: PawnOrganizationCitation | null;
  /** The transform application this execution applied. */
  readonly transformApplication: TransformApplicationCitation;
  /** Resolved transform kind (the definition's declared kind). */
  readonly transformKind: PawnTransformKind;
  readonly parameters: JsonObject;
  readonly seed: number | null;
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly outputArtifactRefs: readonly ArtifactRef[];
  /** Engine invocations as EngineJob refs (through the runner seam). */
  readonly engineInvocations: readonly PawnEngineInvocationRecord[];
  /** Agent-instance execution (llm-flavored pawns; `null` otherwise). */
  readonly agentExecution: PawnAgentExecutionRecord | null;
  /** Pre-execution rights-gate verdict. */
  readonly rights: PawnRightsVerdictRecord;
  readonly lifecycle: PawnExecutionLifecycleState;
  readonly failure: PawnExecutionFailure | null;
  readonly warnings: readonly EngineWarning[];
  /** §30 cost — summed engine costs (single currency; warning on mixes). */
  readonly cost: MoneyAmount;
  /** §30 latency — wall-clock duration of the execution. */
  readonly durationMs: Milliseconds;
  /** §30 evaluation result. */
  readonly evaluation: PawnExecutionEvaluation;
  /** Append-only chronological audit trace. */
  readonly auditTrace: readonly PawnExecutionAuditEvent[];
  readonly startedAt: Timestamp;
  readonly completedAt: Timestamp;
  /** The transform definition cited (§30 transform/engine versions context). */
  readonly transformDefinitionId: TransformId;
  readonly transformDefinitionVersion: Version;
}
