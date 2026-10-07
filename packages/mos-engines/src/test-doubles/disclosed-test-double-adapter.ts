/**
 * DISCLOSED TEST DOUBLE — EngineAdapter implementation (ENG-002).
 *
 * ⚠ TEST DOUBLE ONLY — NEVER A PRODUCTION ENGINE ⚠
 *
 * This adapter demonstrates and exercises the EngineAdapter contract
 * (EngineJob → EngineResult). It is deterministic, dependency-free and
 * makes NO claim about any real engine, model, license or benchmark. It
 * exists so the adapter contract, the job/result shapes and the typed
 * failure path can be tested without any engine SDK (which the boundary
 * harness forbids anyway).
 *
 * Behavior (fully deterministic):
 * - validates the incoming job against the EngineJob contract's required
 *   fields (fail-closed: malformed jobs throw);
 * - echoes `job.inputArtifactRefs` as `outputArtifactRefs` on success (an
 *   obvious placeholder transform — the point is contract shape, not
 *   semantics); a failed invocation produces NO output artifacts;
 * - builds a complete EngineResult: provenance from the job's exact
 *   engine/capability identity plus the configured model identity,
 *   zero duration/resource usage, configurable cost and warnings, and the
 *   configured failure (typed failure path) or `null`;
 * - `recordedAt` uses a fixed epoch stamp so results are reproducible.
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  EngineId,
  EngineJob,
  EngineResult,
  EngineWarning,
  EngineJobFailure,
  MoneyAmount,
  RunProvenance,
  Timestamp,
  Version,
} from "@mos/contracts";

import type { EngineAdapter } from "../ports/engine-adapter.port.js";

/** Fixed provenance stamp: the double must be fully deterministic. */
const RECORDED_AT = "1970-01-01T00:00:00.000Z" as Timestamp;

/** Options for the disclosed test-double adapter. */
export interface TestDoubleEngineAdapterOptions {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  /** Model identity recorded in result provenance (null for non-model engines). */
  readonly modelIdentity?: string | null;
  /** When set, every invocation returns this typed failure. */
  readonly failure?: EngineJobFailure;
  /** Warnings attached to every result. */
  readonly warnings?: readonly EngineWarning[];
  /** Cost attached to every result (default: zero USD). */
  readonly cost?: MoneyAmount;
}

/**
 * Creates the DISCLOSED test-double {@link EngineAdapter}.
 */
export function createTestDoubleEngineAdapter(
  options: TestDoubleEngineAdapterOptions,
): EngineAdapter {
  const cost: MoneyAmount = options.cost ?? { amount: 0, currency: "USD" };
  const warnings: readonly EngineWarning[] = options.warnings ?? [];

  return {
    engineId: options.engineId,
    engineVersion: options.engineVersion,

    async invoke(job: EngineJob): Promise<EngineResult> {
      // Fail-closed: the double enforces the EngineJob contract surface.
      assertRequiredFields(job, "EngineJob");

      const failure: EngineJobFailure | null = options.failure ?? null;

      const provenance: RunProvenance = {
        engineId: job.engineId,
        engineVersion: job.engineVersion,
        capabilityId: job.capabilityId,
        capabilityVersion: job.capabilityVersion,
        modelIdentity: options.modelIdentity ?? null,
        recordedAt: RECORDED_AT,
      };

      const result: EngineResult = {
        jobId: job.id,
        // Echo placeholder: outputs mirror inputs on success. A failed
        // invocation produces no output artifacts. TEST DOUBLE semantics.
        outputArtifactRefs: failure === null ? job.inputArtifactRefs : [],
        metrics: { invocations: 1, inputArtifactCount: job.inputArtifactRefs.length },
        provenance,
        duration: 0,
        resourceUsage: { cpuCoreSeconds: 0, gpuUnitSeconds: 0, memoryMbSeconds: 0 },
        cost,
        warnings,
        failure,
      };
      return Object.freeze({ ...result });
    },
  };
}
