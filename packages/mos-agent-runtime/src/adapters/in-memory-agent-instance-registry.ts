/**
 * In-memory AgentInstanceRegistry adapter (AGT-002).
 *
 * Working adapter (not a skeleton): the instance lifecycle
 * (instantiate → bind → release) over an injected body registry
 * (@mos/agents) and THE single model boundary ({@link ModelRuntimePort}).
 *
 * The registry performs NO model selection of its own: `bind` forwards the
 * request to the port and records the returned binding — the only source
 * of `modelRef`/`runtimeRef`/`boundAt` on instance records (pinned by
 * src/single-model-boundary.test.ts).
 *
 * Records are frozen snapshots; lifecycle transitions return new records.
 * Cross-tenant access fails closed without existence leaks. Instance ids
 * are assigned deterministically (`prefix-<n>`, default `agent-instance`).
 */

import type { TenantScope } from "@mos/contracts";
import type { AgentBodyRegistryPort } from "@mos/agents";

import { AgentRuntimeError } from "../domain/errors.js";
import type {
  AgentInstanceId,
  AgentInstanceRecord,
  InstantiateAgentInstanceInput,
} from "../domain/agent-instance.js";
import { freezeInstance, resolveInstantiation } from "../domain/agent-instance.js";
import type { ModelRuntimePort } from "../ports/model-runtime.port.js";
import type { AgentInstanceRegistry } from "../ports/agent-instance-registry.port.js";

/** Options for the in-memory agent instance registry. */
export interface InMemoryAgentInstanceRegistryOptions {
  /** Body registry used to resolve and validate bodies at instantiation. */
  readonly bodyRegistry: AgentBodyRegistryPort;
  /** THE single model boundary — required; without it nothing can bind. */
  readonly modelRuntime: ModelRuntimePort;
  /** Instance id prefix (default `agent-instance`). */
  readonly instanceIdPrefix?: string;
}

/**
 * Creates an in-memory {@link AgentInstanceRegistry} adapter.
 */
export function createInMemoryAgentInstanceRegistry(
  options: InMemoryAgentInstanceRegistryOptions,
): AgentInstanceRegistry {
  if (
    options?.modelRuntime === undefined ||
    typeof options.modelRuntime.bindModel !== "function"
  ) {
    // No ModelRuntimePort ⇒ no path to a bound instance. Pinned by
    // src/single-model-boundary.test.ts.
    throw new AgentRuntimeError(
      "missing-model-boundary",
      "modelRuntime (THE single model/runtime boundary) is required — an instance registry cannot exist without it",
    );
  }
  const prefix = options.instanceIdPrefix ?? "agent-instance";
  /** instanceId (string key) → current frozen record. */
  const byId = new Map<string, AgentInstanceRecord>();
  const order: AgentInstanceId[] = [];
  let nextSequence = 1;

  function mustGetInstance(
    scope: TenantScope,
    instanceId: AgentInstanceId,
  ): AgentInstanceRecord {
    const record = byId.get(instanceId as string);
    if (
      record === undefined ||
      (record.tenantScope.tenantId as string) !== (scope.tenantId as string)
    ) {
      throw new AgentRuntimeError(
        "unknown-agent-instance",
        `Unknown agent instance: ${instanceId as string} (not registered for this tenant)`,
      );
    }
    return record;
  }

  const registry: AgentInstanceRegistry = {
    instantiate(scope: TenantScope, input: InstantiateAgentInstanceInput): AgentInstanceRecord {
      const resolved = resolveInstantiation(input, options.bodyRegistry);
      const instanceId = `${prefix}-${nextSequence}` as AgentInstanceId;
      nextSequence += 1;
      const record = freezeInstance({
        instanceId,
        bodyId: input.bodyId,
        bodyVersion: input.bodyVersion,
        tenantScope: scope,
        lifecycle: "instantiated",
        // modelRef / runtimeRef / boundAt are intentionally absent: they
        // exist ONLY after a ModelRuntimePort binding (single boundary).
        toolRefs: input.toolRefs ?? resolved.bodyTools,
        capabilityRefs: input.capabilityRefs ?? resolved.bodyCapabilities,
      });
      byId.set(instanceId as string, record);
      order.push(instanceId);
      return record;
    },

    bind(
      scope: TenantScope,
      instanceId: AgentInstanceId,
      requestedModelRef?: AgentInstanceRecord["modelRef"],
    ): AgentInstanceRecord {
      const record = mustGetInstance(scope, instanceId);
      if (record.lifecycle === "released") {
        throw new AgentRuntimeError(
          "instance-released",
          `Agent instance ${instanceId as string} is released and cannot be bound`,
        );
      }
      // THE ONLY model-selection call site: through the single boundary.
      const binding = options.modelRuntime.bindModel({
        tenantScope: scope,
        bodyId: record.bodyId,
        bodyVersion: record.bodyVersion,
        requestedModelRef,
      });
      const bound = freezeInstance({
        ...record,
        lifecycle: "bound",
        modelRef: binding.modelRef,
        runtimeRef: binding.runtimeRef,
        boundAt: binding.boundAt,
      });
      byId.set(instanceId as string, bound);
      return bound;
    },

    release(scope: TenantScope, instanceId: AgentInstanceId): AgentInstanceRecord {
      const record = mustGetInstance(scope, instanceId);
      const released = freezeInstance({ ...record, lifecycle: "released" });
      byId.set(instanceId as string, released);
      return released;
    },

    get(scope: TenantScope, instanceId: AgentInstanceId): AgentInstanceRecord | undefined {
      const record = byId.get(instanceId as string);
      if (
        record === undefined ||
        (record.tenantScope.tenantId as string) !== (scope.tenantId as string)
      ) {
        return undefined;
      }
      return record;
    },

    list(scope: TenantScope): readonly AgentInstanceRecord[] {
      return order
        .map((instanceId) => byId.get(instanceId as string))
        .filter(
          (record): record is AgentInstanceRecord =>
            record !== undefined &&
            (record.tenantScope.tenantId as string) === (scope.tenantId as string),
        );
    },
  };

  return registry;
}
