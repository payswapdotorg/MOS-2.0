/**
 * InstanceExecutorPort (AGT-002) — agent execution through the substrate.
 *
 * Executes a BOUND agent instance against the substrate AgentRuntimePort
 * (see ../types/substrate-agent-runtime.ts — the pinned mirror of
 * @mos/substrate-adapters' AgentRuntimePort; compatibility is asserted by
 * compat/substrate-port-compat.ts and the real-package integration runs in
 * compat/substrate-skeleton.test.ts).
 *
 * The executor performs NO model selection: it forwards the instance's
 * port-issued modelRef inside the substrate runtime spec (pass-through
 * only — pinned by src/single-model-boundary.test.ts). Executing an
 * unbound instance fails closed (`instance-not-bound`).
 */

import type { AgentInstanceRecord } from "../domain/agent-instance.js";
import type {
  SubstrateAgentExecutionEvent,
  SubstrateAgentExecutionInput,
  SubstrateAgentExecutionUsage,
  SubstrateAgentFinishReason,
} from "../types/substrate-agent-runtime.js";

/** Input to one execution: free text or structured JSON (substrate shape). */
export type AgentInstanceExecutionInput = SubstrateAgentExecutionInput;

/** Outcome of one execution of one bound agent instance. */
export interface AgentInstanceExecutionOutcome {
  readonly instanceId: AgentInstanceRecord["instanceId"];
  /** Final textual output produced by the runtime. */
  readonly output: string;
  readonly finishReason: SubstrateAgentFinishReason;
  /** Complete chronological event log of the execution. */
  readonly events: readonly SubstrateAgentExecutionEvent[];
  readonly usage: SubstrateAgentExecutionUsage;
}

/** Executes bound agent instances. One public method. */
export interface InstanceExecutorPort {
  /**
   * Executes one bound agent instance with the given input. Fail-closed:
   * `instance-not-bound` for unbound/released instances,
   * `invalid-execution-input` for malformed input; substrate failures
   * propagate as `substrate-execution-failed` or as the substrate adapter's
   * own typed error (e.g. SubstrateAdapterNotBoundError from the disclosed
   * W0-B skeleton — see compat/substrate-skeleton.test.ts).
   */
  execute(
    instance: AgentInstanceRecord,
    input: AgentInstanceExecutionInput,
  ): Promise<AgentInstanceExecutionOutcome>;
}
