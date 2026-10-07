/**
 * In-memory ModelRuntimePort adapter (AGT-002) — THE single model boundary.
 *
 * Working adapter (not a skeleton): a fail-closed catalog of models, each
 * pinned to one runtime. `bindModel` resolves a request (or the configured
 * default) against the catalog and returns the binding — this function is
 * the ONLY place a concrete ModelRef gets chosen in this package.
 *
 * There is no fallback model: an unknown requested model fails closed with
 * `unknown-model`, and no request + no default fails closed with
 * `no-model-requested`. Durable model catalogs, provider configuration and
 * credentials are later-wave composition-root work; the port is unchanged.
 */

import type { ModelRef, RuntimeRef, Timestamp } from "@mos/contracts";

import { AgentRuntimeError } from "../domain/errors.js";
import type { ModelBinding, ModelBindingRequest, ModelRuntimePort } from "../ports/model-runtime.port.js";

/** One catalog model: a model ref pinned to the runtime that executes it. */
export interface CatalogModel {
  readonly modelRef: ModelRef;
  readonly runtimeRef: RuntimeRef;
  readonly description?: string;
}

/** Options for the in-memory model runtime. */
export interface InMemoryModelRuntimeOptions {
  /** The fail-closed model catalog (unique model refs). */
  readonly models: readonly CatalogModel[];
  /**
   * Optional known-runtimes list; when provided, every model's runtimeRef
   * must appear in it (`invalid-model-catalog` otherwise).
   */
  readonly runtimes?: readonly RuntimeRef[];
  /** Model bound when a request carries no preference (optional). */
  readonly defaultModelRef?: ModelRef;
  /** Injectable clock for `boundAt` (deterministic in tests). */
  readonly now?: () => Timestamp;
}

/**
 * Creates an in-memory {@link ModelRuntimePort} — the single model/runtime
 * boundary implementation for tests and ephemeral composition roots.
 */
export function createInMemoryModelRuntime(
  options: InMemoryModelRuntimeOptions,
): ModelRuntimePort {
  const catalog = new Map<string, CatalogModel>();
  for (const model of options.models) {
    const key = model.modelRef as string;
    if (key.trim().length === 0) {
      throw new AgentRuntimeError("invalid-model-catalog", "catalog models must carry non-blank model refs");
    }
    if ((model.runtimeRef as string).trim().length === 0) {
      throw new AgentRuntimeError(
        "invalid-model-catalog",
        `model ${key} must carry a non-blank runtime ref`,
      );
    }
    if (catalog.has(key)) {
      throw new AgentRuntimeError("invalid-model-catalog", `model ${key} is declared more than once`);
    }
    if (
      options.runtimes !== undefined &&
      !options.runtimes.some((runtimeRef) => (runtimeRef as string) === (model.runtimeRef as string))
    ) {
      throw new AgentRuntimeError(
        "invalid-model-catalog",
        `model ${key} references runtime ${model.runtimeRef as string} which is not in the known runtimes list`,
      );
    }
    catalog.set(key, model);
  }
  if (
    options.defaultModelRef !== undefined &&
    !catalog.has(options.defaultModelRef as string)
  ) {
    throw new AgentRuntimeError(
      "invalid-model-catalog",
      `defaultModelRef ${options.defaultModelRef as string} is not in the catalog`,
    );
  }
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);

  const modelRuntime: ModelRuntimePort = {
    bindModel(request: ModelBindingRequest): ModelBinding {
      const requested = request.requestedModelRef ?? options.defaultModelRef;
      if (requested === undefined) {
        throw new AgentRuntimeError(
          "no-model-requested",
          "no model requested and no default model configured — the model boundary refuses to invent a selection",
        );
      }
      const model = catalog.get(requested as string);
      if (model === undefined) {
        throw new AgentRuntimeError(
          "unknown-model",
          `model ${requested as string} is not in the model catalog (request cannot bypass the model boundary)`,
        );
      }
      return {
        modelRef: model.modelRef,
        runtimeRef: model.runtimeRef,
        boundAt: now(),
      };
    },
  };
  return modelRuntime;
}
