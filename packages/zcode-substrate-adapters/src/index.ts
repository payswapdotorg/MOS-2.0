/**
 * @mos/substrate-adapters — public surface.
 *
 * MOS v2.0 (W0-B / BOOT-003). Narrow MOS-owned ports over the ZCode
 * substrate. See README.md for what is REAL vs interface-stage.
 *
 * Export budget: the six port modules below are the port contract surface;
 * beyond the ports this package exports exactly 8 symbols (3 adapter
 * factories, 4 disclosed skeletons, 1 error class), within the architecture
 * policy budget of 12.
 */

// ---- Port contract surface (src/ports/** — never imports @zcode/*) ----
export * from "./ports/agent-runtime.port.ts";
export * from "./ports/session-events.port.ts";
export * from "./ports/permissions.port.ts";
export * from "./ports/tools.port.ts";
export * from "./ports/rpc.port.ts";
export * from "./ports/object-storage.port.ts";

// ---- Errors ----
export { SubstrateAdapterNotBoundError } from "./errors.ts";

// ---- Working adapters (REAL, usable now) ----
export {
  createInMemoryObjectStorage,
  createFileObjectStorage,
} from "./adapters/in-memory-object-storage.adapter.ts";
export { createZcodeChannelRpcPort } from "./adapters/zcode-rpc.adapter.ts";

// ---- Interface-stage skeletons (disclosed stubs — throw on any use) ----
export { UnboundAgentRuntimeAdapter } from "./adapters/agent-runtime.skeleton.ts";
export { UnboundSessionEventsAdapter } from "./adapters/session-events.skeleton.ts";
export { UnboundPermissionsAdapter } from "./adapters/permissions.skeleton.ts";
export { UnboundToolsAdapter } from "./adapters/tools.skeleton.ts";
