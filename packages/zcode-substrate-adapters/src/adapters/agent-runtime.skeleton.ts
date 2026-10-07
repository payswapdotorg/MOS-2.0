/**
 * AgentRuntimePort adapter skeleton — DISCLOSED INTERFACE-STAGE STUB.
 *
 * MOS v2.0 (W0-B / BOOT-003). This is NOT a working adapter. It exists so
 * that the port surface is importable and constructible-checkable now,
 * while the actual ZCode AgentRuntime binding is scheduled for follow-up
 * work item AGT-002 (Agent Instance / Model Boundary; depends on AGT-001
 * Agent Body). Constructing it — or invoking any method — throws
 * {@link SubstrateAdapterNotBoundError} naming the binding work item.
 * Never represent this object as a working AgentRuntimePort.
 */

import { SubstrateAdapterNotBoundError } from "../errors.ts";
import type {
  AgentEventListener,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentRuntimeHandle,
  AgentRuntimePort,
  AgentRuntimeSpec,
  AgentRuntimeStopResult,
} from "../ports/agent-runtime.port.ts";

const PORT_NAME = "AgentRuntimePort";
const BINDING_WORK_ITEM = "AGT-002 (Agent Instance / Model Boundary)";

function notBound(): never {
  throw new SubstrateAdapterNotBoundError(
    PORT_NAME,
    BINDING_WORK_ITEM,
    "The ZCode AgentRuntime execution binding (start/execute-with-events/stop) is not implemented in W0-B; only the MOS-owned port contract ships at this stage.",
  );
}

export class UnboundAgentRuntimeAdapter implements AgentRuntimePort {
  constructor() {
    notBound();
  }

  start(_spec: AgentRuntimeSpec): Promise<AgentRuntimeHandle> {
    return notBound();
  }

  execute(
    _request: AgentExecutionRequest,
    _onEvent?: AgentEventListener,
  ): Promise<AgentExecutionResult> {
    return notBound();
  }

  stop(_runtimeId: string): Promise<AgentRuntimeStopResult> {
    return notBound();
  }
}
