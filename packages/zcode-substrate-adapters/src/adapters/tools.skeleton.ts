/**
 * ToolsPort adapter skeleton — DISCLOSED INTERFACE-STAGE STUB.
 *
 * MOS v2.0 (W0-B / BOOT-003). This is NOT a working adapter. The ZCode tool
 * registration/invocation mechanics binding is scheduled for follow-up work
 * item AGT-001 (Agent Body), which declares the tools an agent body may
 * invoke (tool refs flow into AgentRuntimeSpec.toolRefs). Until then this
 * skeleton throws {@link SubstrateAdapterNotBoundError} on construct and on
 * every method. Never represent this object as a working ToolsPort.
 */

import { SubstrateAdapterNotBoundError } from "../errors.ts";
import type {
  ToolDescriptor,
  ToolHandler,
  ToolInvocationRequest,
  ToolInvocationResult,
  ToolsPort,
} from "../ports/tools.port.ts";

const PORT_NAME = "ToolsPort";
const BINDING_WORK_ITEM = "AGT-001 (Agent Body)";

function notBound(): never {
  throw new SubstrateAdapterNotBoundError(
    PORT_NAME,
    BINDING_WORK_ITEM,
    "The ZCode tool registration/invocation binding is not implemented in W0-B; only the MOS-owned port contract ships at this stage.",
  );
}

export class UnboundToolsAdapter implements ToolsPort {
  constructor() {
    notBound();
  }

  registerTool(_descriptor: ToolDescriptor, _handler: ToolHandler): void {
    notBound();
  }

  unregisterTool(_toolName: string): boolean {
    return notBound();
  }

  listTools(): readonly ToolDescriptor[] {
    return notBound();
  }

  invokeTool(_request: ToolInvocationRequest): Promise<ToolInvocationResult> {
    return notBound();
  }
}
