/**
 * Benchmark port contracts (ENG-004 — golden corpus / engine benchmark).
 *
 * Basis: spec/contracts/core-contracts-v2.0.yaml EngineBenchmark.required
 * = [id, capabilityVersion, engineVersion, benchmarkCorpusRef,
 * evaluatorVersion, metrics, cost, latency, licenseStatus, result];
 * spec/mos-architecture-v2.0.md §28 (OSS replacement policy: golden corpus
 * benchmark precedes activation) and spec/mos-engine-policy-v2.0.yaml
 * (activation.required goldenCorpusBenchmark; replacement
 * benchmarkBeforePromotion).
 *
 * VERSIONED GOLDEN CORPORA: a BenchmarkCorpus record references its cases
 * as ARTIFACT REFS (inputs + expected outputs) plus scalar metadata — no
 * media bytes in the control plane (spec §6/AGENTS.md "Media"). Corpus
 * records are immutable and versioned; corpora are stored through a
 * BenchmarkCorpusRegistryPort (in-memory adapter disclosed).
 *
 * THE EVIDENCE CHAIN: the BenchmarkRunnerPort executes every corpus case
 * as a REAL EngineJob through the ENG-003 sandbox runner, scores the
 * outputs with a BenchmarkEvaluatorPort, and freezes the result into the
 * canonical EngineBenchmark record. That record feeds the ENG-001
 * activation gate as goldenCorpusBenchmark evidence (wiring in
 * domain/benchmark-evidence.ts: complete records only — incomplete
 * benchmarks can never become evidence, so activation stays rejected).
 */

import type {
  ArtifactRef,
  BenchmarkMetrics,
  BenchmarkResult,
  CapabilityId,
  EngineBenchmark,
  EngineId,
  EngineJob,
  EngineResult,
  EvaluatorRef,
  ResourceLimits,
  Version,
  BenchmarkCorpusRef,
} from "@mos/contracts";

// ---------------------------------------------------------------------------
// Golden corpora
// ---------------------------------------------------------------------------

/** One golden corpus case: inputs and the expected outputs, as refs. */
export interface BenchmarkCorpusCase {
  /** Stable case identifier (unique within the corpus). */
  readonly caseId: string;
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly expectedOutputArtifactRefs: readonly ArtifactRef[];
}

/**
 * A versioned golden benchmark corpus for one capability contract
 * version. Expected outputs and evaluator refs are part of the record;
 * case media live behind the artifact refs, never in the control plane.
 */
export interface BenchmarkCorpus {
  /** Corpus identity (e.g. "corpus:golden-relevance"). */
  readonly id: BenchmarkCorpusRef;
  readonly version: Version;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  /** The evaluator contract this corpus's expected outputs are scored with. */
  readonly evaluatorRef: EvaluatorRef;
  readonly cases: readonly BenchmarkCorpusCase[];
  /** Scalar metadata only (no media bytes over the control plane). */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Versioned store of immutable golden corpora.
 * 3 public methods (policy budget 12).
 */
export interface BenchmarkCorpusRegistryPort {
  /**
   * Registers one immutable corpus version (fail-closed validation:
   * required fields, non-empty cases with inputs AND expected outputs,
   * unique case ids). Duplicate (id, version) registration is a typed
   * error.
   */
  registerCorpus(corpus: BenchmarkCorpus): void;

  /** One exact corpus version, or `undefined` (never "latest"). */
  getCorpus(id: BenchmarkCorpusRef, version: Version): BenchmarkCorpus | undefined;

  /** All registered versions of one corpus id, ascending; empty when unknown. */
  listCorpusVersions(id: BenchmarkCorpusRef): readonly Version[];
}

// ---------------------------------------------------------------------------
// Evaluator contract
// ---------------------------------------------------------------------------

/** One executed corpus case: the case, the submitted job, its result. */
export interface BenchmarkCaseRun {
  readonly case: BenchmarkCorpusCase;
  readonly job: EngineJob;
  readonly result: EngineResult;
}

/** The evaluator's deterministic scoring outcome. */
export interface BenchmarkEvaluation {
  readonly metrics: BenchmarkMetrics;
  readonly result: BenchmarkResult;
}

/**
 * Deterministic scoring of engine outputs against a corpus's expected
 * outputs. Implementations MUST be pure functions of the case runs (same
 * runs → same metrics/verdict; the disclosed double compares output
 * digests and run failures).
 * 1 public method + 2 identity fields (policy budget 12).
 */
export interface BenchmarkEvaluatorPort {
  readonly evaluatorRef: EvaluatorRef;
  readonly evaluatorVersion: Version;
  evaluate(runs: readonly BenchmarkCaseRun[]): Promise<BenchmarkEvaluation>;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

/** Input for one benchmark run. */
export interface BenchmarkRunInput {
  readonly corpus: BenchmarkCorpus;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly evaluator: BenchmarkEvaluatorPort;
  /** Determinism seed — benchmark jobs are always seeded. */
  readonly seed: number;
  /** Resource limits granted to every benchmark job. */
  readonly resourceLimits: ResourceLimits;
}

/**
 * Runs one golden corpus against one engine version through the REAL
 * ENG-003 sandbox and freezes the canonical EngineBenchmark record:
 * [id, capabilityVersion, engineVersion, benchmarkCorpusRef,
 * evaluatorVersion, metrics, cost, latency, licenseStatus, result].
 * 1 public method (policy budget 12).
 */
export interface BenchmarkRunnerPort {
  run(input: BenchmarkRunInput): Promise<EngineBenchmark>;
}
