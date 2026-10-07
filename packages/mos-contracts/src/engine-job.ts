/**
 * EngineJob and EngineResult contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   EngineJob.required = [id, capabilityId, capabilityVersion, engineId,
 *     engineVersion, inputArtifactRefs, parameters, seed, resourceLimits,
 *     outputContract]
 *   EngineResult.required = [jobId, outputArtifactRefs, metrics, provenance,
 *     duration, resourceUsage, cost, warnings, failure]
 *
 * Basis: spec/mos-architecture-v2.0.md §11 (Engine runner: external engines
 * run behind a narrow EngineRunner contract with the exact field lists
 * above; default sandbox denies network/credentials/arbitrary filesystem
 * and requires explicit CPU/GPU/memory/time quotas), §30 (observability:
 * every production action records run identity, engine/capability versions,
 * artifact refs, cost/latency, failure/warnings), spec/mos-engine-policy
 * -v2.0.yaml `replacement.modelIdentityRecordedPerRun`.
 *
 * ENG-002 (@mos/engines) defines the EngineAdapter invoke surface over
 * these two records: job in → result out.
 */

import type { ArtifactRef } from "./artifact.js";
import type {
  CapabilityId,
  EngineId,
  EngineJobId,
  JsonObject,
  JsonSchemaObject,
  Milliseconds,
  MoneyAmount,
  Timestamp,
  Version,
} from "./value-types.js";

// ---------------------------------------------------------------------------
// EngineJob
// ---------------------------------------------------------------------------

/** Per-job resource limits granted to one engine invocation (explicit quotas). */
export interface ResourceLimits {
  readonly cpuCores: number;
  readonly gpuUnits: number;
  readonly memoryMb: number;
  readonly timeoutMs: Milliseconds;
}

/**
 * One engine invocation. Carries the exact capability contract version and
 * engine identity/version (historical reproducibility), input artifact
 * references (media bytes never travel over control-plane RPC), opaque
 * parameters, the determinism seed when the engine supports it, granted
 * resource limits, and the output contract the result must satisfy.
 */
export interface EngineJob {
  readonly id: EngineJobId;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly parameters: JsonObject;
  /** Determinism seed; `null` when the engine does not support seeding. */
  readonly seed: number | null;
  readonly resourceLimits: ResourceLimits;
  readonly outputContract: JsonSchemaObject;
}

// ---------------------------------------------------------------------------
// EngineResult
// ---------------------------------------------------------------------------

/** Actual resource consumption reported for one engine invocation. */
export interface ResourceUsage {
  readonly cpuCoreSeconds: number;
  readonly gpuUnitSeconds: number;
  readonly memoryMbSeconds: number;
}

/** Non-fatal warning emitted by an engine invocation. */
export interface EngineWarning {
  readonly code: string;
  readonly message: string;
}

/** Typed failure path for an engine invocation. */
export interface EngineJobFailure {
  readonly code: string;
  readonly message: string;
  readonly retriable: boolean;
  readonly details?: JsonObject;
}

/**
 * Run provenance recorded with every engine result: exact engine and
 * capability identity, and the model identity when a model-backed engine
 * was used (modelIdentityRecordedPerRun — historical runs must be able to
 * reproduce the model that produced them).
 */
export interface RunProvenance {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  /** Model/checkpoint identity for model-backed engines; `null` otherwise. */
  readonly modelIdentity: string | null;
  readonly recordedAt: Timestamp;
}

/**
 * The outcome of one engine invocation. `failure` is a required field: it is
 * `null` on success and carries the typed failure otherwise; failed
 * invocations still return a result record (with metrics/provenance where
 * available) so runs stay auditable.
 */
export interface EngineResult {
  readonly jobId: EngineJobId;
  readonly outputArtifactRefs: readonly ArtifactRef[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly provenance: RunProvenance;
  readonly duration: Milliseconds;
  readonly resourceUsage: ResourceUsage;
  readonly cost: MoneyAmount;
  readonly warnings: readonly EngineWarning[];
  readonly failure: EngineJobFailure | null;
}
