/**
 * AgentRuntimePort — lifecycle + execution surface for MOS agent execution.
 *
 * MOS v2.0 (W0-B / BOOT-003). MOS-owned contract surface.
 * PORT INVARIANT: files under `src/ports/**` NEVER import `@zcode/*`.
 *
 * Architecture role: MOS wraps the ZCode AgentRuntime substrate (see
 * `docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md`, "Agent runtime" row)
 * behind this narrow port. MOS domain code (agent-runtime module,
 * `mos-agent-runtime`, depends on `zcode-substrate-adapters` per the module
 * registry) programs against these MOS-owned types only; it must never
 * import ZCode runtime internals directly.
 *
 * Semantics (start / execute-with-events / stop):
 * - `start` provisions a runtime instance from a MOS {@link AgentRuntimeSpec}
 *   (agent body reference, optional model reference resolved by the model
 *   boundary — never a provider SDK import, optional tool refs, budget).
 * - `execute` runs one input through a started runtime, streaming execution
 *   events to `onEvent` while they occur and returning the final result
 *   plus usage. Event delivery ordering is guaranteed to match the returned
 *   `events` log order.
 * - `stop` terminates a started runtime; further executes reject.
 */

import type { JsonValue } from "./rpc.port.ts";

/** Opaque runtime instance identifier assigned by the adapter. */
export type AgentRuntimeId = string;

/** Input to an agent execution: free text or structured JSON. */
export type AgentExecutionInput = string | JsonValue;

/** Execution budget constraints enforced by the runtime. */
export interface AgentExecutionBudget {
  readonly maxSteps?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

/** Specification used to start an agent runtime instance. */
export interface AgentRuntimeSpec {
  /** Reference to a versioned MOS AgentBody contract (AGT-001). */
  readonly agentBodyRef: string;
  /**
   * Reference to a model binding resolved through the single MOS model
   * boundary (AGT-002). Never a provider SDK name — provider identity is
   * resolved behind the boundary, not by substrate adapters.
   */
  readonly modelRef?: string;
  /** Tool references the runtime may invoke (see ToolsPort). */
  readonly toolRefs?: readonly string[];
  /** Permission scope the runtime executes under (see PermissionsPort). */
  readonly permissionScope?: string;
  /** Optional system-level instructions for the runtime. */
  readonly instructions?: string;
  readonly budget?: AgentExecutionBudget;
}

/** Handle to a started runtime. */
export interface AgentRuntimeHandle {
  readonly runtimeId: AgentRuntimeId;
  readonly spec: AgentRuntimeSpec;
}

/** Why an execution finished. */
export type AgentFinishReason =
  | "completed"
  | "stopped"
  | "budget-exhausted"
  | "timeout"
  | "error";

/** Streaming execution event (MOS-owned envelope, chronological). */
export type AgentExecutionEvent =
  | { readonly type: "execution.started"; readonly occurredAt: string }
  | { readonly type: "text.delta"; readonly occurredAt: string; readonly text: string }
  | {
      readonly type: "tool.invoked";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly input?: JsonValue;
    }
  | {
      readonly type: "tool.result";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly ok: boolean;
      readonly output?: JsonValue;
    }
  | { readonly type: "execution.error"; readonly occurredAt: string; readonly message: string }
  | {
      readonly type: "execution.completed";
      readonly occurredAt: string;
      readonly finishReason: AgentFinishReason;
    };

/** One execution request against a started runtime. */
export interface AgentExecutionRequest {
  readonly runtimeId: AgentRuntimeId;
  readonly input: AgentExecutionInput;
  /** Per-execution budget override (tightens the runtime budget). */
  readonly budget?: AgentExecutionBudget;
}

/** Resource usage reported for one execution. */
export interface AgentExecutionUsage {
  readonly steps?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
}

/** Final result of one execution. */
export interface AgentExecutionResult {
  readonly runtimeId: AgentRuntimeId;
  /** Final textual output produced by the runtime. */
  readonly output: string;
  readonly finishReason: AgentFinishReason;
  /** Complete chronological event log (same events delivered to onEvent). */
  readonly events: readonly AgentExecutionEvent[];
  readonly usage: AgentExecutionUsage;
}

/** Streaming listener invoked during execution. */
export type AgentEventListener = (event: AgentExecutionEvent) => void;

/** Result of stopping a runtime. */
export interface AgentRuntimeStopResult {
  readonly runtimeId: AgentRuntimeId;
  readonly stopped: boolean;
}

/** Lifecycle + execution surface for MOS agent execution. */
export interface AgentRuntimePort {
  start(spec: AgentRuntimeSpec): Promise<AgentRuntimeHandle>;
  execute(request: AgentExecutionRequest, onEvent?: AgentEventListener): Promise<AgentExecutionResult>;
  stop(runtimeId: AgentRuntimeId): Promise<AgentRuntimeStopResult>;
}
