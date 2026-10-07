/**
 * ToolsPort — tool registration + invocation surface.
 *
 * MOS v2.0 (W0-B / BOOT-003). MOS-owned contract surface.
 * PORT INVARIANT: files under `src/ports/**` NEVER import `@zcode/*`.
 *
 * Architecture role: the ZCode substrate provides tool execution and
 * scheduling mechanics (substrate inventory, "Tools/permissions" row).
 * MOS capability/engine authorities decide which capabilities exist and how
 * engines are selected; this port exposes only the substrate mechanics:
 * register a tool descriptor + handler, list tools, invoke a tool. Tool
 * implementations live in MOS/engine adapter subtrees, never in domain
 * modules.
 */

import type { JsonValue } from "./rpc.port.ts";

/** Registered tool name (substrate-opaque identifier). */
export type ToolName = string;

/**
 * Minimal MOS-owned input schema descriptor. Intentionally a subset of
 * JSON Schema: `type: "object"` with declared properties and required
 * names. Full schema handling belongs to `@mos/contracts`.
 */
export interface ToolInputSchema {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

/** Descriptor of a registrable tool. */
export interface ToolDescriptor {
  readonly name: ToolName;
  readonly description?: string;
  readonly inputSchema: ToolInputSchema;
}

/** Request to invoke a registered tool. */
export interface ToolInvocationRequest {
  readonly toolName: ToolName;
  /** Invocation input; validated against the tool's inputSchema. */
  readonly input: JsonValue;
  readonly timeoutMs?: number;
}

/** Error detail reported on a failed invocation. */
export interface ToolInvocationError {
  readonly message: string;
  readonly code?: string;
}

/** Result of one tool invocation. */
export interface ToolInvocationResult {
  readonly toolName: ToolName;
  readonly ok: boolean;
  readonly output?: JsonValue;
  readonly error?: ToolInvocationError;
  readonly durationMs?: number;
}

/** Handler executed when the tool is invoked. */
export type ToolHandler = (input: JsonValue) => Promise<JsonValue>;

/** Tool registration + invocation surface over the substrate. */
export interface ToolsPort {
  registerTool(descriptor: ToolDescriptor, handler: ToolHandler): void;
  /** @returns whether a tool with that name was registered. */
  unregisterTool(toolName: ToolName): boolean;
  listTools(): readonly ToolDescriptor[];
  invokeTool(request: ToolInvocationRequest): Promise<ToolInvocationResult>;
}
