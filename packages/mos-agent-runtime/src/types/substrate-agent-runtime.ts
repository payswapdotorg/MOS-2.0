/**
 * Pinned mirror of the substrate AgentRuntimePort contract surface.
 *
 * These types are a field-for-field mirror of
 * `packages/zcode-substrate-adapters/src/ports/agent-runtime.port.ts`
 * (W0-B / BOOT-003 — the MOS-owned substrate port). The mirror exists for
 * one reason, disclosed here and pinned by `compat/`:
 *
 * The substrate adapters package is a typecheck-only source package (its
 * `exports` map points at `src/index.ts`, and its sources import each other
 * with `.ts` specifiers under `allowImportingTsExtensions`). An EMITTING
 * `moduleResolution: nodenext` consumer (this package: `tsc -b` to `dist/`)
 * cannot compile those sources — TypeScript reports TS5097 ("An import
 * path can only end with a '.ts' extension") on every internal import.
 * Making the substrate package consumable by emitting packages (for
 * example, shipping declaration output) is outside this wave's package
 * ownership; tracked for the Tech Lead.
 *
 * Until then: the executor binds to `SubstrateAgentRuntimePort` (below),
 * which is asserted MUTUALLY ASSIGNABLE with the real
 * `@mos/substrate-adapters` `AgentRuntimePort` by
 * `compat/substrate-port-compat.ts` (compiled by `tsconfig.compat.json`
 * in this package's test script — zero-drift pin), and the runtime
 * integration with the real package (including its disclosed
 * `UnboundAgentRuntimeAdapter` skeleton fail-closed path) is exercised by
 * `compat/substrate-skeleton.test.ts` (run directly by Node's
 * type-stripping loader, which CAN load the source-exported package).
 */

/** JSON value shape that can safely cross a transport boundary (mirror). */
export type SubstrateJsonValue =
  | null
  | boolean
  | number
  | string
  | SubstrateJsonValue[]
  | { readonly [key: string]: SubstrateJsonValue };

/** Opaque runtime instance identifier assigned by the adapter (mirror). */
export type SubstrateAgentRuntimeId = string;

/** Input to an agent execution: free text or structured JSON (mirror). */
export type SubstrateAgentExecutionInput = string | SubstrateJsonValue;

/** Execution budget constraints enforced by the runtime (mirror). */
export interface SubstrateAgentExecutionBudget {
  readonly maxSteps?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

/** Specification used to start an agent runtime instance (mirror). */
export interface SubstrateAgentRuntimeSpec {
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
  readonly budget?: SubstrateAgentExecutionBudget;
}

/** Handle to a started runtime (mirror). */
export interface SubstrateAgentRuntimeHandle {
  readonly runtimeId: SubstrateAgentRuntimeId;
  readonly spec: SubstrateAgentRuntimeSpec;
}

/** Why an execution finished (mirror). */
export type SubstrateAgentFinishReason =
  | "completed"
  | "stopped"
  | "budget-exhausted"
  | "timeout"
  | "error";

/** Streaming execution event (MOS-owned envelope, chronological; mirror). */
export type SubstrateAgentExecutionEvent =
  | { readonly type: "execution.started"; readonly occurredAt: string }
  | { readonly type: "text.delta"; readonly occurredAt: string; readonly text: string }
  | {
      readonly type: "tool.invoked";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly input?: SubstrateJsonValue;
    }
  | {
      readonly type: "tool.result";
      readonly occurredAt: string;
      readonly toolName: string;
      readonly ok: boolean;
      readonly output?: SubstrateJsonValue;
    }
  | { readonly type: "execution.error"; readonly occurredAt: string; readonly message: string }
  | {
      readonly type: "execution.completed";
      readonly occurredAt: string;
      readonly finishReason: SubstrateAgentFinishReason;
    };

/** One execution request against a started runtime (mirror). */
export interface SubstrateAgentExecutionRequest {
  readonly runtimeId: SubstrateAgentRuntimeId;
  readonly input: SubstrateAgentExecutionInput;
  /** Per-execution budget override (tightens the runtime budget). */
  readonly budget?: SubstrateAgentExecutionBudget;
}

/** Resource usage reported for one execution (mirror). */
export interface SubstrateAgentExecutionUsage {
  readonly steps?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
}

/** Final result of one execution (mirror). */
export interface SubstrateAgentExecutionResult {
  readonly runtimeId: SubstrateAgentRuntimeId;
  /** Final textual output produced by the runtime. */
  readonly output: string;
  readonly finishReason: SubstrateAgentFinishReason;
  /** Complete chronological event log (same events delivered to onEvent). */
  readonly events: readonly SubstrateAgentExecutionEvent[];
  readonly usage: SubstrateAgentExecutionUsage;
}

/** Streaming listener invoked during execution (mirror). */
export type SubstrateAgentEventListener = (event: SubstrateAgentExecutionEvent) => void;

/** Result of stopping a runtime (mirror). */
export interface SubstrateAgentRuntimeStopResult {
  readonly runtimeId: SubstrateAgentRuntimeId;
  readonly stopped: boolean;
}

/**
 * Lifecycle + execution surface for MOS agent execution — mirror of the
 * `@mos/substrate-adapters` `AgentRuntimePort` (W0-B / BOOT-003).
 *
 * - `start` provisions a runtime instance from a MOS agent-runtime spec
 *   (agent body reference, model reference resolved by the model boundary,
 *   tool refs, budget);
 * - `execute` runs one input through a started runtime, streaming events;
 * - `stop` terminates a started runtime; further executes reject.
 */
export interface SubstrateAgentRuntimePort {
  start(spec: SubstrateAgentRuntimeSpec): Promise<SubstrateAgentRuntimeHandle>;
  execute(
    request: SubstrateAgentExecutionRequest,
    onEvent?: SubstrateAgentEventListener,
  ): Promise<SubstrateAgentExecutionResult>;
  stop(runtimeId: SubstrateAgentRuntimeId): Promise<SubstrateAgentRuntimeStopResult>;
}
