/**
 * DISCLOSED in-memory test double of the substrate AgentRuntimePort
 * (AGT-002).
 *
 * Deterministic, inspection-friendly substitute for the real ZCode
 * AgentRuntime binding (which is future work — the W0-B adapter is a
 * disclosed skeleton). Implements the SAME port contract
 * (SubstrateAgentRuntimePort — pinned to @mos/substrate-adapters by
 * compat/): start provisions `rt-<n>`, execute emits a deterministic
 * event log and echoes the input, stop seals the runtime (further executes
 * reject, matching the port contract).
 *
 * Every started spec is recorded so tests can assert exactly what the
 * executor forwarded (body ref, model ref, tool refs) — the end-to-end
 * proof that the port-issued model flows into the substrate spec.
 */

import type {
  SubstrateAgentExecutionEvent,
  SubstrateAgentExecutionInput,
  SubstrateAgentExecutionResult,
  SubstrateAgentRuntimeHandle,
  SubstrateAgentRuntimePort,
  SubstrateAgentRuntimeSpec,
  SubstrateAgentRuntimeStopResult,
} from "../types/substrate-agent-runtime.js";

/** Options for the in-memory substrate double. */
export interface InMemoryAgentRuntimeSubstrateDoubleOptions {
  /**
   * Deterministic output producer (default: `echo:<input>` for string
   * input, `json:<serialized>` for structured input).
   */
  readonly respondWith?: (
    input: SubstrateAgentExecutionInput,
    spec: SubstrateAgentRuntimeSpec,
  ) => string;
  /** Injectable clock for event timestamps (default: fixed epoch). */
  readonly now?: () => string;
}

/** One recorded runtime of the double. */
export interface RecordedRuntime {
  readonly runtimeId: string;
  readonly spec: SubstrateAgentRuntimeSpec;
  readonly stopped: boolean;
  readonly executions: readonly string[];
}

/** The double: a substrate AgentRuntimePort plus inspection surface. */
export interface InMemoryAgentRuntimeSubstrateDouble {
  readonly port: SubstrateAgentRuntimePort;
  /** Every started runtime spec, in start order. */
  readonly startedSpecs: readonly SubstrateAgentRuntimeSpec[];
  /** All runtimes by runtimeId (with stop state and execution inputs). */
  readonly runtimes: readonly RecordedRuntime[];
}

/**
 * Creates a DISCLOSED in-memory substrate AgentRuntimePort test double.
 * Not a production adapter — never represent it as a working ZCode
 * AgentRuntime binding.
 */
export function createInMemoryAgentRuntimeSubstrateDouble(
  options: InMemoryAgentRuntimeSubstrateDoubleOptions = {},
): InMemoryAgentRuntimeSubstrateDouble {
  const now = options.now ?? (() => "1970-01-01T00:00:00.000Z");
  const startedSpecs: SubstrateAgentRuntimeSpec[] = [];
  const runtimes = new Map<string, { spec: SubstrateAgentRuntimeSpec; stopped: boolean; executions: string[] }>();
  let nextRuntime = 1;

  function respond(input: SubstrateAgentExecutionInput, spec: SubstrateAgentRuntimeSpec): string {
    if (options.respondWith !== undefined) {
      return options.respondWith(input, spec);
    }
    return typeof input === "string"
      ? `echo:${input}`
      : `json:${JSON.stringify(input)}`;
  }

  const port: SubstrateAgentRuntimePort = {
    async start(spec: SubstrateAgentRuntimeSpec): Promise<SubstrateAgentRuntimeHandle> {
      const runtimeId = `rt-${nextRuntime}`;
      nextRuntime += 1;
      startedSpecs.push(spec);
      runtimes.set(runtimeId, { spec, stopped: false, executions: [] });
      return { runtimeId, spec };
    },

    async execute(
      request: Parameters<SubstrateAgentRuntimePort["execute"]>[0],
      _onEvent?: Parameters<SubstrateAgentRuntimePort["execute"]>[1],
    ): Promise<SubstrateAgentExecutionResult> {
      const runtime = runtimes.get(request.runtimeId);
      if (runtime === undefined) {
        throw new Error(`runtime ${request.runtimeId} was never started`);
      }
      if (runtime.stopped) {
        throw new Error(`runtime ${request.runtimeId} is stopped and rejects further executions`);
      }
      runtime.executions.push(typeof request.input === "string" ? request.input : JSON.stringify(request.input));
      const output = respond(request.input, runtime.spec);
      const events: SubstrateAgentExecutionEvent[] = [
        { type: "execution.started", occurredAt: now() },
        { type: "text.delta", occurredAt: now(), text: output },
        { type: "execution.completed", occurredAt: now(), finishReason: "completed" },
      ];
      return {
        runtimeId: request.runtimeId,
        output,
        finishReason: "completed",
        events,
        usage: { steps: 1, outputTokens: output.length, durationMs: 1 },
      };
    },

    async stop(runtimeId: string): Promise<SubstrateAgentRuntimeStopResult> {
      const runtime = runtimes.get(runtimeId);
      if (runtime === undefined) {
        return { runtimeId, stopped: false };
      }
      runtime.stopped = true;
      return { runtimeId, stopped: true };
    },
  };

  const double: InMemoryAgentRuntimeSubstrateDouble = {
    port,
    get startedSpecs(): readonly SubstrateAgentRuntimeSpec[] {
      return startedSpecs;
    },
    get runtimes(): readonly RecordedRuntime[] {
      return [...runtimes.entries()].map(([runtimeId, runtime]) => ({
        runtimeId,
        spec: runtime.spec,
        stopped: runtime.stopped,
        executions: [...runtime.executions],
      }));
    },
  };
  return double;
}
