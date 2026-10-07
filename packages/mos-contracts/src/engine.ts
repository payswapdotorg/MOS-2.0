/**
 * Engine and EngineBenchmark contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   Engine.required = [id, version, capabilityIds, adapterRef, inputContract,
 *     outputContract, resources, deterministic, license, security,
 *     provenance, benchmark]
 *   EngineBenchmark.required = [id, capabilityVersion, engineVersion,
 *     benchmarkCorpusRef, evaluatorVersion, metrics, cost, latency,
 *     licenseStatus, result]
 *
 * Basis: spec/mos-architecture-v2.0.md §5 (every engine has immutable
 * identity/version, capability declarations, input/output contract, adapter,
 * resource profile, deterministic/seed behavior, quality evaluator(s),
 * provenance, license metadata, model-weight/data-license metadata, network
 * policy, security sandbox, benchmark evidence, activation status), §10
 * (Engine Registry), §28 (OSS replacement policy), §29 (three-layer license
 * model), spec/mos-engine-policy-v2.0.yaml (activation evidence chain,
 * runner sandbox posture).
 */

import type {
  AdapterRef,
  BenchmarkCorpusRef,
  CapabilityId,
  EngineBenchmarkId,
  EngineId,
  JsonSchemaObject,
  Milliseconds,
  MoneyAmount,
  ProvenanceRef,
  Version,
} from "./value-types.js";

// ---------------------------------------------------------------------------
// License model (spec §29 — three layers reviewed separately)
// ---------------------------------------------------------------------------

/** Outcome of an independent license review for one license layer. */
export type LicenseReviewStatus = "cleared" | "review-required" | "blocked";

/** One reviewed license layer (code, model/checkpoint, or source data). */
export interface LicenseRecord {
  /** License identifier (e.g. "Apache-2.0", "CC-BY-NC-4.0", "proprietary"). */
  readonly identifier: string;
  readonly status: LicenseReviewStatus;
  readonly note?: string;
}

/**
 * The three-layer engine license record. Commercial compatibility cannot be
 * inferred from the code license alone (spec §29): all three layers are
 * required fields on every Engine manifest.
 */
export interface EngineLicense {
  readonly code: LicenseRecord;
  readonly model: LicenseRecord;
  readonly data: LicenseRecord;
}

// ---------------------------------------------------------------------------
// Resource profile and security posture (engine runner policy)
// ---------------------------------------------------------------------------

/** Compute resources the engine requires (explicit quotas; resourceQuotasRequired). */
export interface ResourceProfile {
  readonly cpuCores: number;
  readonly gpuUnits: number;
  readonly memoryMb: number;
  readonly timeoutMs: Milliseconds;
}

/**
 * Sandbox posture the engine runs under. Defaults encode
 * spec/mos-engine-policy-v2.0.yaml `runner`: network denied unless explicitly
 * granted, no database/provider credentials, scoped-artifacts-only
 * filesystem. Engines declaring injected credentials cannot pass the
 * activation gate (provider credentials inside an engine are forbidden).
 */
export interface EngineSecurity {
  readonly sandboxed: boolean;
  readonly networkAccess: "denied" | "explicitly-granted";
  readonly filesystemScope: "scoped-artifacts-only" | "none";
  readonly databaseCredentials: "none" | "injected";
  readonly providerCredentials: "none" | "injected";
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

/**
 * Benchmark metrics. `score` is the canonical scalar used by the Engine
 * Registry's deterministic tie-break (engine policy: benchmarkScore);
 * further engine-specific metrics may be carried alongside.
 */
export interface BenchmarkMetrics {
  readonly score: number;
  readonly [metric: string]: number | undefined;
}

/** Overall result of a golden-corpus benchmark run. */
export type BenchmarkResult = "passed" | "failed" | "inconclusive";

/**
 * Golden-corpus benchmark evidence for one engine version executing one
 * capability contract version (ENG-004 owns corpus construction).
 */
export interface EngineBenchmark {
  readonly id: EngineBenchmarkId;
  readonly capabilityVersion: Version;
  readonly engineVersion: Version;
  readonly benchmarkCorpusRef: BenchmarkCorpusRef;
  readonly evaluatorVersion: Version;
  readonly metrics: BenchmarkMetrics;
  readonly cost: MoneyAmount;
  readonly latency: Milliseconds;
  readonly licenseStatus: LicenseReviewStatus;
  readonly result: BenchmarkResult;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * A registered, replaceable implementation of one or more capabilities.
 *
 * - `capabilityIds`: the capabilities this engine implements (contract
 *   compatibility per capability is recorded by the activation evidence
 *   chain in @mos/engines, ENG-001).
 * - `adapterRef`: identity of the EngineAdapter implementation (ENG-002).
 *   The registry records the identity; loading/running adapters is the
 *   engine runner's job (ENG-003), never a domain import.
 * - `deterministic`: whether repeated invocations with the same inputs and
 *   seed produce identical outputs (seed behavior; seedRequiredWhenSupported).
 * - `benchmark`: golden-corpus benchmark evidence for this engine version.
 *
 * An Engine manifest alone activates nothing: activation requires the full
 * evidence chain of spec/mos-engine-policy-v2.0.yaml (see @mos/engines).
 */
export interface Engine {
  readonly id: EngineId;
  readonly version: Version;
  readonly capabilityIds: readonly CapabilityId[];
  readonly adapterRef: AdapterRef;
  readonly inputContract: JsonSchemaObject;
  readonly outputContract: JsonSchemaObject;
  readonly resources: ResourceProfile;
  readonly deterministic: boolean;
  readonly license: EngineLicense;
  readonly security: EngineSecurity;
  readonly provenance: ProvenanceRef;
  readonly benchmark: EngineBenchmark;
}
