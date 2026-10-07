/**
 * Test fixtures for the engine registry tests (ENG-001/ENG-002).
 *
 * Builds valid Engine manifests and full passing activation evidence
 * chains with per-test overrides. TEST FIXTURES ONLY — no engine claims:
 * these records exercise registry logic, not any real engine/model/license.
 */

import type {
  BenchmarkCorpusRef,
  CapabilityId,
  ContentDigest,
  Engine,
  EngineBenchmarkId,
  EngineId,
  EvaluatorRef,
  ProvenanceRef,
  Timestamp,
  Version,
} from "@mos/contracts";

import type {
  EngineActivationEvidence,
  EngineActivationEvidenceInput,
} from "../domain/activation.js";

const FIXED_AT = "2026-01-01T00:00:00.000Z" as Timestamp;
const VERSION_1 = 1 as Version;

/** Overridable defaults for a valid Engine manifest (plain scalars; branded here). */
export interface EngineManifestOverrides
  extends Omit<Partial<Engine>, "id" | "version" | "capabilityIds"> {
  /** Engine id (default "engine:test-alpha"). */
  readonly id?: string;
  /** Engine version (default 1). */
  readonly version?: number;
  /** Declared capability ids (default ["semantic_video_relevance"]). */
  readonly capabilityIds?: readonly string[];
  /** Convenience: benchmark metric score (default 0.8). */
  readonly benchmarkScore?: number;
  /** Convenience: benchmark cost amount in USD (default 0.01). */
  readonly benchmarkCostAmount?: number;
  /** Convenience: benchmark latency in ms (default 1000). */
  readonly benchmarkLatencyMs?: number;
}

/** Builds a valid Engine manifest with per-test overrides. */
export function makeEngineManifest(
  overrides: EngineManifestOverrides = {},
): Engine {
  const {
    benchmarkScore = 0.8,
    benchmarkCostAmount = 0.01,
    benchmarkLatencyMs = 1000,
    id: idOverride,
    version: versionOverride,
    capabilityIds: capabilityIdsOverride,
    ...manifestOverrides
  } = overrides;
  const id = (idOverride ?? "engine:test-alpha") as EngineId;
  const version = (versionOverride ?? 1) as Version;
  const capabilityIds = (
    capabilityIdsOverride ?? ["semantic_video_relevance"]
  ).map((capabilityId) => capabilityId as CapabilityId);

  return {
    id,
    version,
    capabilityIds,
    adapterRef: `adapter:${id as string}@${version as number}` as Engine["adapterRef"],
    inputContract: { type: "object" },
    outputContract: { type: "object" },
    resources: { cpuCores: 2, gpuUnits: 1, memoryMb: 4096, timeoutMs: 60000 },
    deterministic: true,
    license: {
      code: { identifier: "MIT", status: "cleared" },
      model: { identifier: "CC-BY-4.0", status: "cleared" },
      data: { identifier: "CC-BY-4.0", status: "cleared" },
    },
    security: {
      sandboxed: true,
      networkAccess: "denied",
      filesystemScope: "scoped-artifacts-only",
      databaseCredentials: "none",
      providerCredentials: "none",
    },
    provenance: `provenance:engine:${id as string}@${version as number}` as ProvenanceRef,
    benchmark: {
      id: `benchmark:${id as string}@${version as number}` as EngineBenchmarkId,
      capabilityVersion: VERSION_1,
      engineVersion: version,
      benchmarkCorpusRef: "corpus:golden@1" as BenchmarkCorpusRef,
      evaluatorVersion: VERSION_1,
      metrics: { score: benchmarkScore },
      cost: { amount: benchmarkCostAmount, currency: "USD" },
      latency: benchmarkLatencyMs,
      licenseStatus: "cleared",
      result: "passed",
    },
    ...manifestOverrides,
  };
}

/** Builds the FULL passing activation evidence chain for one engine manifest. */
export function makeActivationEvidence(
  engine: Engine,
  overrides: EngineActivationEvidenceInput = {},
): EngineActivationEvidence {
  return {
    manifestValidation: {
      validatedAt: FIXED_AT,
      manifestDigest: `digest:${engine.id as string}@${engine.version as number}` as ContentDigest,
    },
    capabilityContractTests: engine.capabilityIds.map((capabilityId) => ({
      capabilityId,
      capabilityVersion: VERSION_1,
      verdict: "compatible" as const,
      testReportRef: `report:contract-tests:${capabilityId as string}`,
    })),
    goldenCorpusBenchmark: {
      benchmarkId: engine.benchmark.id,
      result: "passed",
    },
    evaluatorResult: {
      evaluator: "evaluator:golden@1" as EvaluatorRef,
      verdict: "pass",
      reportRef: "report:evaluator",
    },
    securitySandboxReview: {
      reviewedAt: FIXED_AT,
      reviewer: "security-team",
      verdict: "pass",
      sandboxReportRef: "report:sandbox",
    },
    codeLicenseReview: {
      reviewedAt: FIXED_AT,
      reviewer: "legal",
      verdict: "cleared",
      reportRef: "report:license-code",
    },
    modelLicenseReview: {
      reviewedAt: FIXED_AT,
      reviewer: "legal",
      verdict: "cleared",
      reportRef: "report:license-model",
    },
    sourceDataRightsReview: {
      reviewedAt: FIXED_AT,
      reviewer: "legal",
      verdict: "cleared",
      reportRef: "report:license-data",
    },
    provenanceRecord: {
      provenanceRef: engine.provenance,
      recordedAt: FIXED_AT,
    },
    ...overrides,
  };
}
