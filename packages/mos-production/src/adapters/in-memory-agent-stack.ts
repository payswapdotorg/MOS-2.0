/**
 * In-memory agent-stack doubles (LAB-013) — DISCLOSED DOUBLES of the
 * @mos/agents body registry, the @mos/agent-runtime instance registry /
 * single model boundary / instance executor seams.
 *
 * What is doubled: the registries and executors are process-local maps with
 * the SAME fail-closed semantics as the real in-memory adapters (unknown
 * ids, cross-tenant misses, subset-checked bindings, released-instance
 * refusals, `bindModel` as the ONLY model-selection call site). What is NOT
 * doubled: the port contracts themselves — these objects satisfy the seams
 * in ports/agent-stack.ports.ts, which the REAL packages satisfy with zero
 * adapters (compat-pinned); the production composition root swaps the real
 * adapters in behind the same types.
 *
 * Disclosed limits: no durability, no substrate — the real executor binds
 * the substrate AgentRuntimePort; the double here responds deterministically
 * through an injected `respondWith` (mirroring the disclosed substrate
 * double of @mos/agent-runtime, which this package cannot import).
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  AgentBody,
  ModelRef,
  RuntimeRef,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import { PawnExecutionError } from "../domain/errors.js";
import { cloneThenFreezeRecord } from "./registry-support.js";
import type {
  InstantiatePawnInstanceInput,
  PawnAgentExecutorEvent,
  PawnAgentExecutorFinishReason,
  PawnAgentExecutorOutcome,
  PawnBodyRegistryPort,
  PawnInstanceExecutionInput,
  PawnInstanceExecutorPort,
  PawnInstanceRecord,
  PawnInstanceRegistryPort,
  PawnModelBinding,
  PawnModelBindingRequest,
  PawnModelRuntimePort,
} from "../ports/agent-stack.ports.js";
import type { PawnAgentBodyId, PawnInstanceId } from "../contracts/pawn-ids.js";

// ---------------------------------------------------------------------------
// Body registry double
// ---------------------------------------------------------------------------

/** Options for the in-memory pawn body registry double. */
export interface InMemoryPawnBodyRegistryOptions {
  /** Bodies pre-registered at creation (validated like `register`). */
  readonly initial?: readonly AgentBody[];
}

/** Creates the in-memory {@link PawnBodyRegistryPort} double. */
export function createInMemoryPawnBodyRegistry(
  options: InMemoryPawnBodyRegistryOptions = {},
): PawnBodyRegistryPort {
  /** bodyId → versions (ascending insertion order). */
  const byId = new Map<string, Map<number, AgentBody>>();

  function register(body: AgentBody): void {
    try {
      assertRequiredFields(body, "AgentBody");
    } catch (error) {
      throw new PawnExecutionError(
        "invalid-pawn-body",
        error instanceof Error ? error.message : String(error),
      );
    }
    const id = body.id as string;
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new PawnExecutionError("invalid-pawn-body", "body id must be a non-blank string");
    }
    if (!Number.isInteger(body.version) || (body.version as number) < 1) {
      throw new PawnExecutionError("invalid-pawn-body", "body version must be an integer >= 1");
    }
    let versions = byId.get(id);
    if (versions === undefined) {
      versions = new Map<number, AgentBody>();
      byId.set(id, versions);
    }
    const version = body.version as number;
    if (versions.has(version)) {
      throw new PawnExecutionError(
        "invalid-pawn-body",
        `body ${id} version ${version} is already registered (bodies are immutable — a new version is a new record)`,
      );
    }
    const latest = [...versions.keys()].at(-1);
    if (latest !== undefined && version <= latest) {
      throw new PawnExecutionError(
        "invalid-pawn-body",
        `body ${id} version ${version} must append above latest ${latest} (monotonic versions)`,
      );
    }
    // DEEP-frozen PRIVATE snapshot (W9-B clone-then-freeze, completing the
    // sweep's ownership discipline): nested roleContract/schemas/policies
    // stay immutable through the returned record AND the caller's body
    // objects are never frozen in place — the pre-fix shallow spread
    // embedded the caller's nested objects by reference and the recursive
    // freeze froze them IN PLACE (the caller-ownership defect; pinned by
    // the W9-B adversarial probes).
    versions.set(version, cloneThenFreezeRecord(body));
  }

  for (const body of options.initial ?? []) {
    register(body);
  }

  const registry: PawnBodyRegistryPort = {
    register,
    get(bodyId: PawnAgentBodyId, version: Version): AgentBody | undefined {
      return byId.get(bodyId as string)?.get(version as number);
    },
    getLatest(bodyId: PawnAgentBodyId): AgentBody | undefined {
      const versions = byId.get(bodyId as string);
      if (versions === undefined) return undefined;
      const latest = [...versions.keys()].at(-1);
      return latest === undefined ? undefined : versions.get(latest);
    },
    require(bodyId: PawnAgentBodyId, version?: Version): AgentBody {
      const resolved =
        version === undefined
          ? registry.getLatest(bodyId)
          : registry.get(bodyId, version);
      if (resolved === undefined) {
        throw new PawnExecutionError(
          "invalid-pawn-body",
          `Unknown agent body: ${bodyId as string}${version === undefined ? " (latest)" : `@${version as number}`}`,
        );
      }
      return resolved;
    },
    listVersions(bodyId: PawnAgentBodyId): readonly Version[] {
      const versions = byId.get(bodyId as string);
      return versions === undefined ? [] : [...versions.keys()].map((v) => v as Version);
    },
  };
  return registry;
}

// ---------------------------------------------------------------------------
// Single model boundary double
// ---------------------------------------------------------------------------

/** One catalog model of the boundary double: a model pinned to a runtime. */
export interface PawnCatalogModel {
  readonly modelRef: ModelRef;
  readonly runtimeRef: RuntimeRef;
  readonly description?: string;
}

/** Options for the in-memory model boundary double. */
export interface InMemoryPawnModelRuntimeOptions {
  readonly models: readonly PawnCatalogModel[];
  /** Model bound when a request carries no preference (optional). */
  readonly defaultModelRef?: ModelRef;
  readonly now?: () => Timestamp;
}

/** Creates the in-memory {@link PawnModelRuntimePort} double (THE boundary). */
export function createInMemoryPawnModelRuntime(
  options: InMemoryPawnModelRuntimeOptions,
): PawnModelRuntimePort {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  const catalog = new Map<string, PawnCatalogModel>();
  for (const model of options.models) {
    const key = model.modelRef as string;
    if (key.trim().length === 0) {
      throw new PawnExecutionError("invalid-model-catalog", "catalog models must carry non-blank model refs");
    }
    if ((model.runtimeRef as string).trim().length === 0) {
      throw new PawnExecutionError("invalid-model-catalog", `model ${key} must carry a non-blank runtime ref`);
    }
    if (catalog.has(key)) {
      throw new PawnExecutionError("invalid-model-catalog", `model ${key} is declared more than once`);
    }
    catalog.set(key, model);
  }
  if (options.defaultModelRef !== undefined && !catalog.has(options.defaultModelRef as string)) {
    throw new PawnExecutionError(
      "invalid-model-catalog",
      `default model ${options.defaultModelRef as string} is not in the catalog`,
    );
  }
  return {
    bindModel(request: PawnModelBindingRequest): PawnModelBinding {
      const requested =
        request.requestedModelRef === undefined ? options.defaultModelRef : request.requestedModelRef;
      if (requested === undefined) {
        throw new PawnExecutionError(
          "no-model-requested",
          "no model preference and no configured default — the boundary cannot invent a selection",
        );
      }
      const model = catalog.get(requested as string);
      if (model === undefined) {
        throw new PawnExecutionError(
          "unknown-model",
          `model ${requested as string} is not in the catalog (requests are preferences; the boundary decides)`,
        );
      }
      return { modelRef: model.modelRef, runtimeRef: model.runtimeRef, boundAt: now() };
    },
  };
}

// ---------------------------------------------------------------------------
// Instance registry double
// ---------------------------------------------------------------------------

/** Options for the in-memory instance registry double. */
export interface InMemoryPawnInstanceRegistryOptions {
  readonly bodyRegistry: PawnBodyRegistryPort;
  readonly modelRuntime: PawnModelRuntimePort;
  readonly instanceIdPrefix?: string;
}

/** Creates the in-memory {@link PawnInstanceRegistryPort} double. */
export function createInMemoryPawnInstanceRegistry(
  options: InMemoryPawnInstanceRegistryOptions,
): PawnInstanceRegistryPort {
  if (options?.modelRuntime === undefined || typeof options.modelRuntime.bindModel !== "function") {
    // No boundary ⇒ no path to a bound instance (mirrors the real registry).
    throw new PawnExecutionError(
      "invalid-model-catalog",
      "modelRuntime (THE single model/runtime boundary) is required — an instance registry cannot exist without it",
    );
  }
  const prefix = options.instanceIdPrefix ?? "pawn-instance";
  const byId = new Map<string, PawnInstanceRecord>();
  const order: PawnInstanceId[] = [];
  let nextSequence = 1;

  function freeze(record: PawnInstanceRecord): PawnInstanceRecord {
    return Object.freeze({
      ...record,
      // W9-B ownership fix (completing the sweep — the @mos/agent-runtime
      // freezeInstance fix mirrored here): the record owns a FROZEN COPY of
      // the caller's scope, so mutating the caller's object after
      // instantiate/bind/release can never rewrite the STORED record's
      // tenant identity (post-hoc cross-tenant corruption, §31).
      tenantScope: Object.freeze({ ...record.tenantScope }),
      toolRefs: Object.freeze([...record.toolRefs]),
      capabilityRefs: Object.freeze([...record.capabilityRefs]),
    });
  }

  function mustGetInstance(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord {
    const record = byId.get(instanceId as string);
    if (record === undefined || (record.tenantScope.tenantId as string) !== (scope.tenantId as string)) {
      throw new PawnExecutionError(
        "unknown-pawn-instance",
        `Unknown pawn instance: ${instanceId as string} (not registered for this tenant)`,
      );
    }
    return record;
  }

  return {
    instantiate(scope: TenantScope, input: InstantiatePawnInstanceInput): PawnInstanceRecord {
      if (typeof input?.bodyId !== "string" || (input.bodyId as string).trim().length === 0) {
        throw new PawnExecutionError("invalid-agent-instance-input", "bodyId must be a non-blank string");
      }
      if (!Number.isInteger(input?.bodyVersion) || (input.bodyVersion as number) < 1) {
        throw new PawnExecutionError("invalid-agent-instance-input", "bodyVersion must be an integer >= 1");
      }
      // Fail-closed body resolution through the registry seam.
      const body = options.bodyRegistry.require(input.bodyId, input.bodyVersion);
      const toolRefs =
        input.toolRefs === undefined
          ? body.tools
          : input.toolRefs.map((ref) => ref as string).filter((ref) => ref.trim().length > 0);
      if (input.toolRefs !== undefined && toolRefs.length !== input.toolRefs.length) {
        throw new PawnExecutionError("invalid-agent-instance-input", "toolRefs must be non-blank tool refs");
      }
      for (const ref of toolRefs) {
        if (!(body.tools as readonly string[]).includes(ref)) {
          throw new PawnExecutionError(
            "instance-tool-outside-body",
            `tool ${ref} is not declared by body ${input.bodyId as string} version ${input.bodyVersion as number}`,
          );
        }
      }
      const capabilityRefs =
        input.capabilityRefs === undefined
          ? body.capabilities
          : input.capabilityRefs.map((ref) => ref as string).filter((ref) => ref.trim().length > 0);
      if (input.capabilityRefs !== undefined && capabilityRefs.length !== input.capabilityRefs.length) {
        throw new PawnExecutionError("invalid-agent-instance-input", "capabilityRefs must be non-blank capability ids");
      }
      for (const ref of capabilityRefs) {
        if (!(body.capabilities as readonly string[]).includes(ref)) {
          throw new PawnExecutionError(
            "instance-capability-outside-body",
            `capability ${ref} is not declared by body ${input.bodyId as string} version ${input.bodyVersion as number}`,
          );
        }
      }
      const instanceId = `${prefix}-${nextSequence}` as PawnInstanceId;
      nextSequence += 1;
      const record = freeze({
        instanceId,
        bodyId: input.bodyId,
        bodyVersion: input.bodyVersion,
        tenantScope: scope,
        lifecycle: "instantiated",
        // modelRef / runtimeRef / boundAt intentionally absent: they exist
        // ONLY after a model-boundary binding (single boundary, lock rule 9).
        toolRefs: toolRefs as PawnInstanceRecord["toolRefs"],
        capabilityRefs: capabilityRefs as PawnInstanceRecord["capabilityRefs"],
      });
      byId.set(instanceId as string, record);
      order.push(instanceId);
      return record;
    },

    bind(
      scope: TenantScope,
      instanceId: PawnInstanceId,
      requestedModelRef?: ModelRef,
    ): PawnInstanceRecord {
      const record = mustGetInstance(scope, instanceId);
      if (record.lifecycle === "released") {
        throw new PawnExecutionError(
          "pawn-instance-released",
          `Pawn instance ${instanceId as string} is released and cannot be bound`,
        );
      }
      // THE ONLY model-selection call site: through the single boundary.
      const binding = options.modelRuntime.bindModel({
        tenantScope: scope,
        bodyId: record.bodyId,
        bodyVersion: record.bodyVersion,
        requestedModelRef,
      });
      const bound = freeze({
        ...record,
        lifecycle: "bound",
        modelRef: binding.modelRef,
        runtimeRef: binding.runtimeRef,
        boundAt: binding.boundAt,
      });
      byId.set(instanceId as string, bound);
      return bound;
    },

    release(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord {
      const record = mustGetInstance(scope, instanceId);
      const released = freeze({ ...record, lifecycle: "released" });
      byId.set(instanceId as string, released);
      return released;
    },

    get(scope: TenantScope, instanceId: PawnInstanceId): PawnInstanceRecord | undefined {
      const record = byId.get(instanceId as string);
      if (record === undefined || (record.tenantScope.tenantId as string) !== (scope.tenantId as string)) {
        return undefined;
      }
      return record;
    },

    list(scope: TenantScope): readonly PawnInstanceRecord[] {
      return order
        .map((instanceId) => byId.get(instanceId as string))
        .filter(
          (record): record is PawnInstanceRecord =>
            record !== undefined &&
            (record.tenantScope.tenantId as string) === (scope.tenantId as string),
        );
    },
  };
}

// ---------------------------------------------------------------------------
// Instance executor double
// ---------------------------------------------------------------------------

/** Options for the in-memory instance executor double. */
export interface InMemoryPawnExecutorOptions {
  /**
   * Deterministic delivery of the execution input (mirrors the disclosed
   * substrate double's `respondWith`). Default: JSON-stringified echo.
   */
  readonly respondWith?: (input: PawnInstanceExecutionInput) => string;
  readonly now?: () => Timestamp;
}

/** Creates the in-memory {@link PawnInstanceExecutorPort} double. */
export function createInMemoryPawnInstanceExecutor(
  options: InMemoryPawnExecutorOptions = {},
): PawnInstanceExecutorPort {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  const respondWith =
    options.respondWith ??
    ((input: PawnInstanceExecutionInput) =>
      `pawn-executor-delivery:${typeof input === "string" ? input : JSON.stringify(input)}`);
  return {
    async execute(
      instance: PawnInstanceRecord,
      input: PawnInstanceExecutionInput,
    ): Promise<PawnAgentExecutorOutcome> {
      if (
        instance.lifecycle !== "bound" ||
        instance.modelRef === undefined ||
        instance.runtimeRef === undefined
      ) {
        throw new PawnExecutionError(
          "instance-not-bound",
          `Pawn instance ${instance.instanceId as string} is not bound to a model — request a binding through the model boundary first`,
        );
      }
      if (typeof input !== "string" && (typeof input !== "object" || input === null)) {
        throw new PawnExecutionError(
          "invalid-execution-input",
          "execution input must be a string or a JSON value object/array",
        );
      }
      const occurredAt = now();
      const output = respondWith(input);
      const events: PawnAgentExecutorEvent[] = [
        { type: "execution.started", occurredAt },
        { type: "text.delta", occurredAt, text: output },
        { type: "execution.completed", occurredAt, finishReason: "completed" },
      ];
      return {
        output,
        finishReason: "completed" as PawnAgentExecutorFinishReason,
        events: Object.freeze(events),
        usage: { steps: 1, durationMs: 0 },
      };
    },
  };
}
