/**
 * Substrate-bound InstanceExecutor adapter (AGT-002).
 *
 * The production executor path: drives the substrate AgentRuntimePort
 * (start → execute → stop) for one bound agent instance. The port type is
 * the pinned mirror `SubstrateAgentRuntimePort` (see
 * ../types/substrate-agent-runtime.ts for why a mirror is used and how
 * compat/ pins zero drift against @mos/substrate-adapters).
 *
 * Binding the REAL Zcode AgentRuntime substrate is future work (the W0-B
 * adapter is a disclosed skeleton that throws SubstrateAdapterNotBoundError —
 * exercised by compat/substrate-skeleton.test.ts against the real package).
 * Until then this executor is bound in tests to the disclosed in-memory
 * substrate double (../test-doubles/in-memory-agent-runtime-double.ts)
 * implementing the SAME port. No model selection happens here: the
 * instance's port-issued modelRef is passed through into the substrate
 * spec.
 *
 * Failure policy (fail-closed, typed): unbound instances and malformed
 * input are rejected before any substrate call; EVERY substrate failure
 * (start, execute or stop) surfaces as `substrate-execution-failed` with
 * the original error message preserved (phase-named), except
 * AgentRuntimeError, which passes through unchanged. When execute fails,
 * stop is still attempted (best-effort cleanup) so a started runtime is not
 * leaked, without masking the original failure.
 */

import { AgentRuntimeError } from "../domain/errors.js";
import type { AgentInstanceRecord } from "../domain/agent-instance.js";
import type { AgentInstanceExecutionInput, AgentInstanceExecutionOutcome } from "../ports/instance-executor.port.js";
import type { InstanceExecutorPort } from "../ports/instance-executor.port.js";
import type { SubstrateAgentRuntimePort, SubstrateAgentRuntimeSpec } from "../types/substrate-agent-runtime.js";

/**
 * Body-reference convention used on substrate runtime specs:
 * `<bodyId>@<bodyVersion>` — the versioned MOS AgentBody reference.
 */
export function agentBodyRef(instance: AgentInstanceRecord): string {
  return `${instance.bodyId as string}@${instance.bodyVersion as number}`;
}

function wrapSubstrateFailure(
  phase: "start" | "execute" | "stop",
  error: unknown,
  instance: AgentInstanceRecord,
): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) {
    return error;
  }
  return new AgentRuntimeError(
    "substrate-execution-failed",
    `substrate ${phase} failed for instance ${instance.instanceId as string}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/**
 * Creates an {@link InstanceExecutorPort} bound to a substrate
 * AgentRuntimePort. Inject the real adapter (when bound) or the disclosed
 * in-memory double in tests.
 */
export function createSubstrateInstanceExecutor(
  substratePort: SubstrateAgentRuntimePort,
): InstanceExecutorPort {
  const executor: InstanceExecutorPort = {
    async execute(
      instance: AgentInstanceRecord,
      input: AgentInstanceExecutionInput,
    ): Promise<AgentInstanceExecutionOutcome> {
      if (
        instance.lifecycle !== "bound" ||
        instance.modelRef === undefined ||
        instance.runtimeRef === undefined
      ) {
        throw new AgentRuntimeError(
          "instance-not-bound",
          `Agent instance ${instance.instanceId as string} is not bound to a model — request a binding through the model boundary first`,
        );
      }
      if (typeof input !== "string" && (typeof input !== "object" || input === null)) {
        throw new AgentRuntimeError(
          "invalid-execution-input",
          "execution input must be a string or a JSON value object/array",
        );
      }
      const spec: SubstrateAgentRuntimeSpec = {
        agentBodyRef: agentBodyRef(instance),
        // Pass-through ONLY: the port-issued model reference flows into the
        // substrate spec; the executor never selects a model.
        modelRef: instance.modelRef,
        toolRefs: [...instance.toolRefs],
      };
      let handle;
      try {
        handle = await substratePort.start(spec);
      } catch (error) {
        throw wrapSubstrateFailure("start", error, instance);
      }
      let result;
      try {
        result = await substratePort.execute({
          runtimeId: handle.runtimeId,
          input,
        });
      } catch (error) {
        // Best-effort cleanup: stop the started runtime, never masking the
        // original failure (a stop failure during the error path is ignored).
        await substratePort.stop(handle.runtimeId).catch(() => undefined);
        throw wrapSubstrateFailure("execute", error, instance);
      }
      try {
        await substratePort.stop(handle.runtimeId);
      } catch (error) {
        throw wrapSubstrateFailure("stop", error, instance);
      }
      return {
        instanceId: instance.instanceId,
        output: result.output,
        finishReason: result.finishReason,
        events: result.events,
        usage: result.usage,
      };
    },
  };
  return executor;
}
