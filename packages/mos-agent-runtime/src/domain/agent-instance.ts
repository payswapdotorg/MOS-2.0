/**
 * AgentInstance domain: record types and instantiation validation (AGT-002).
 *
 * Contract basis (spec/contracts/core-contracts-v2.0.yaml):
 *   AgentInstance.required = [bodyVersion, modelRef, runtimeRef, toolRefs,
 *     capabilityRefs]
 *
 * A BOUND instance record carries every required AgentInstance field
 * (runtime-pinned in tests against @mos/contracts
 * `CONTRACT_REQUIRED_FIELDS.AgentInstance`). Before binding — while the
 * instance is `instantiated` — `modelRef` and `runtimeRef` are absent BY
 * DESIGN: model and runtime selection happens exclusively behind the
 * {@link ../ports/model-runtime.port.js!ModelRuntimePort} (the single
 * model/runtime boundary; architecture lock rule 9: no second router).
 *
 * Instances are tenant-scoped mutable runtime state: records carry the
 * creating scope explicitly (policy `requireTenantScopeOnMutableArtifacts`),
 * lifecycle transitions return NEW frozen records, and cross-tenant access
 * fails closed without existence leaks.
 */

import type {
  CapabilityId,
  ModelRef,
  RuntimeRef,
  TenantScope,
  Timestamp,
  ToolRef,
  Version,
} from "@mos/contracts";
import type { AgentBodyId, AgentBodyRegistryPort } from "@mos/agents";
import { AgentRuntimeError } from "./errors.js";

/** Compile-time nominal brand for opaque instance ids (locally owned). */
declare const agentRuntimeBrand: unique symbol;

/** Opaque identifier of one agent runtime instance. */
export type AgentInstanceId = string & { readonly [agentRuntimeBrand]: "AgentInstanceId" };

/** Instance lifecycle: instantiate → bind (via the model boundary) → release. */
export type AgentInstanceLifecycleState = "instantiated" | "bound" | "released";

/**
 * One agent instance record. `modelRef`/`runtimeRef`/`boundAt` are set ONLY
 * from a {@link ../ports/model-runtime.port.js!ModelBinding} returned by the
 * single model boundary; there is no other code path that assigns them
 * (pinned by src/single-model-boundary.test.ts).
 */
export interface AgentInstanceRecord {
  readonly instanceId: AgentInstanceId;
  readonly bodyId: AgentBodyId;
  readonly bodyVersion: Version;
  readonly tenantScope: TenantScope;
  readonly lifecycle: AgentInstanceLifecycleState;
  /** Selected model — ONLY from a ModelRuntimePort binding. */
  readonly modelRef?: ModelRef;
  /** Selected runtime — ONLY from a ModelRuntimePort binding. */
  readonly runtimeRef?: RuntimeRef;
  readonly boundAt?: Timestamp;
  readonly toolRefs: readonly ToolRef[];
  readonly capabilityRefs: readonly CapabilityId[];
}

/**
 * A bound instance record: every required AgentInstance contract field is
 * present (`bodyVersion`, `modelRef`, `runtimeRef`, `toolRefs`,
 * `capabilityRefs`). The executor accepts exactly this state.
 */
export type BoundAgentInstance = AgentInstanceRecord &
  Required<Pick<AgentInstanceRecord, "modelRef" | "runtimeRef">> & {
    readonly lifecycle: "bound";
  };

/** Input to {@link ../ports/agent-instance-registry.port.js!AgentInstanceRegistry.instantiate}. */
export interface InstantiateAgentInstanceInput {
  readonly bodyId: AgentBodyId;
  readonly bodyVersion: Version;
  /**
   * Concrete tool bindings; defaults to the body's declared tools. Must be
   * a subset of the body's tools (fail-closed otherwise).
   */
  readonly toolRefs?: readonly ToolRef[];
  /**
   * Concrete capability bindings; defaults to the body's declared
   * capabilities. Must be a subset of the body's capabilities.
   */
  readonly capabilityRefs?: readonly CapabilityId[];
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonBlankStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: string[] = [];
  for (const item of value) {
    if (!isNonBlankString(item)) {
      return undefined;
    }
    items.push(item);
  }
  return items;
}

/**
 * Resolves and validates one instantiation input against the body
 * registry. Returns the resolved body record, the effective tool refs and
 * the effective capability refs. Fail-closed with named codes:
 * `invalid-agent-instance-input` (malformed input / unknown body version
 * surfaces as the agents package's own typed error),
 * `instance-tool-outside-body`, `instance-capability-outside-body`.
 */
export function resolveInstantiation(
  input: InstantiateAgentInstanceInput,
  bodyRegistry: AgentBodyRegistryPort,
): {
  readonly bodyTools: readonly ToolRef[];
  readonly bodyCapabilities: readonly CapabilityId[];
  readonly toolRefs: readonly ToolRef[];
  readonly capabilityRefs: readonly CapabilityId[];
} {
  if (!isNonBlankString(input?.bodyId)) {
    throw new AgentRuntimeError("invalid-agent-instance-input", "bodyId must be a non-blank string");
  }
  if (!Number.isInteger(input?.bodyVersion) || (input.bodyVersion as number) < 1) {
    throw new AgentRuntimeError("invalid-agent-instance-input", "bodyVersion must be an integer >= 1");
  }
  const toolRefs =
    input.toolRefs === undefined ? [] : nonBlankStringArray(input.toolRefs);
  if (toolRefs === undefined) {
    throw new AgentRuntimeError("invalid-agent-instance-input", "toolRefs must be an array of non-blank tool refs");
  }
  const capabilityRefs =
    input.capabilityRefs === undefined ? [] : nonBlankStringArray(input.capabilityRefs);
  if (capabilityRefs === undefined) {
    throw new AgentRuntimeError(
      "invalid-agent-instance-input",
      "capabilityRefs must be an array of non-blank capability ids",
    );
  }
  // Fail-closed body resolution (throws UnknownAgentBodyError from @mos/agents
  // naming the body and version).
  const body = bodyRegistry.require(input.bodyId, input.bodyVersion);
  const bodyTools = body.tools;
  const bodyCapabilities = body.capabilities;
  for (const toolRef of toolRefs) {
    if (!(bodyTools as readonly string[]).includes(toolRef)) {
      throw new AgentRuntimeError(
        "instance-tool-outside-body",
        `tool ${toolRef} is not declared by body ${input.bodyId as string} version ${input.bodyVersion as number}`,
      );
    }
  }
  for (const capabilityRef of capabilityRefs) {
    if (!(bodyCapabilities as readonly string[]).includes(capabilityRef)) {
      throw new AgentRuntimeError(
        "instance-capability-outside-body",
        `capability ${capabilityRef} is not declared by body ${input.bodyId as string} version ${input.bodyVersion as number}`,
      );
    }
  }
  // Cast once inside the validated boundary: every item is a non-blank string
  // confirmed against the body's branded declarations.
  return {
    bodyTools,
    bodyCapabilities,
    toolRefs: toolRefs.map((ref) => ref as ToolRef),
    capabilityRefs: capabilityRefs.map((ref) => ref as CapabilityId),
  };
}

/**
 * Freezes one instance record (records are immutable snapshots).
 *
 * W9-B ownership fix: `tenantScope` is CLONED before freezing — the caller
 * keeps its scope object and the stored record owns a private copy. Before
 * this fix the record embedded the caller's live scope object, so mutating
 * it after `instantiate`/`bind` changed the STORED record's tenant identity
 * in place (a post-hoc cross-tenant identity corruption — §31 fail). The
 * clone-then-freeze discipline is the established W4-B/W8-A pattern.
 */
export function freezeInstance(record: AgentInstanceRecord): AgentInstanceRecord {
  return Object.freeze({
    ...record,
    tenantScope: Object.freeze({ ...record.tenantScope }),
    toolRefs: Object.freeze([...record.toolRefs]),
    capabilityRefs: Object.freeze([...record.capabilityRefs]),
  });
}
