/**
 * In-memory BenchmarkRunner adapter (ENG-004).
 *
 * Runs one golden corpus against one engine version: every corpus case
 * becomes a REAL EngineJob submitted through the ENG-003 sandbox runner
 * (the benchmark exercises the exact production execution path — quotas,
 * seed policy, scoped artifacts, network denial, timeouts), the case
 * results are scored by the BenchmarkEvaluatorPort, and the outcome is
 * frozen into the canonical EngineBenchmark record
 * (spec/contracts/core-contracts-v2.0.yaml):
 *
 *   [id, capabilityVersion, engineVersion, benchmarkCorpusRef,
 *    evaluatorVersion, metrics, cost, latency, licenseStatus, result]
 *
 * Determinism: the record id is a pure function of (corpus id+version,
 * engine id+version, evaluator version); metrics come from the evaluator
 * (deterministic contract); cost is the sum and latency the sum of
 * adapter-reported durations. For deterministic engines, same corpus +
 * engine + seed → the same record, bit for bit.
 *
 * Benchmark jobs are ALWAYS seeded; a non-deterministic engine therefore
 * fails every case (`seed-not-supported`) and the record comes out
 * `inconclusive` — you cannot golden-benchmark reproducibility into an
 * engine that declares none. That is the honest verdict.
 */

import type {
  Engine,
  EngineBenchmark,
  EngineJob,
  EngineJobId,
  EngineResult,
  MoneyAmount,
} from "@mos/contracts";

import type { EngineRegistryPort } from "../ports/engine-registry.port.js";
import type { EngineRunnerPort } from "../ports/engine-runner.port.js";
import type {
  BenchmarkCaseRun,
  BenchmarkRunInput,
  BenchmarkRunnerPort,
} from "../ports/benchmark.port.js";
import { BenchmarkError } from "../domain/errors.js";
import { worstLicenseReviewStatus } from "../domain/benchmark-evidence.js";

/** Options for the in-memory benchmark runner. */
export interface InMemoryBenchmarkRunnerOptions {
  /** Manifest authority (engine lookup + license posture). */
  readonly registry: EngineRegistryPort;
  /** The REAL sandbox runner every benchmark job goes through. */
  readonly runner: EngineRunnerPort;
}

function benchmarkJobId(input: BenchmarkRunInput, caseId: string): EngineJobId {
  return `job:benchmark:${input.corpus.id as string}@${input.corpus.version as number}:${input.engineId as string}@${input.engineVersion as number}:${caseId}` as EngineJobId;
}

function benchmarkRecordId(input: BenchmarkRunInput): EngineBenchmark["id"] {
  return `benchmark:${input.corpus.id as string}@${input.corpus.version as number}:${input.engineId as string}@${input.engineVersion as number}:e${input.evaluator.evaluatorVersion as number}` as EngineBenchmark["id"];
}

function aggregateCost(results: readonly EngineResult[]): MoneyAmount {
  let amount = 0;
  let currency: string | undefined;
  for (const result of results) {
    if (currency === undefined) {
      currency = result.cost.currency;
    } else if (result.cost.currency !== currency) {
      throw new BenchmarkError(
        "benchmark-cost-currency-mismatch",
        `case runs report mixed currencies (${currency} vs ${result.cost.currency}); cannot aggregate`,
        { jobId: result.jobId as string },
      );
    }
    amount += result.cost.amount;
  }
  return { amount, currency: currency ?? "USD" };
}

/**
 * Creates the in-memory {@link BenchmarkRunnerPort}.
 */
export function createInMemoryBenchmarkRunner(
  options: InMemoryBenchmarkRunnerOptions,
): BenchmarkRunnerPort {
  const runner: BenchmarkRunnerPort = {
    async run(input: BenchmarkRunInput): Promise<EngineBenchmark> {
      if (input.corpus.cases.length === 0) {
        throw new BenchmarkError(
          "invalid-benchmark-corpus",
          "corpus has no cases: a golden corpus needs at least one",
        );
      }
      if (input.evaluator.evaluatorRef !== input.corpus.evaluatorRef) {
        throw new BenchmarkError(
          "benchmark-evaluator-mismatch",
          `evaluator ${input.evaluator.evaluatorRef as string} does not match the corpus's declared evaluator ${input.corpus.evaluatorRef as string}`,
        );
      }
      const manifest: Engine | undefined = options.registry.getEngine(
        input.engineId,
        input.engineVersion,
      );
      if (manifest === undefined) {
        throw new BenchmarkError(
          "benchmark-engine-not-registered",
          `engine ${input.engineId as string}@${input.engineVersion as number} is not registered`,
        );
      }

      const caseRuns: BenchmarkCaseRun[] = [];
      for (const benchmarkCase of input.corpus.cases) {
        const job: EngineJob = Object.freeze({
          id: benchmarkJobId(input, benchmarkCase.caseId),
          capabilityId: input.corpus.capabilityId,
          capabilityVersion: input.corpus.capabilityVersion,
          engineId: input.engineId,
          engineVersion: input.engineVersion,
          inputArtifactRefs: benchmarkCase.inputArtifactRefs,
          parameters: Object.freeze({
            benchmarkRun: true,
            benchmarkCorpus: input.corpus.id as string,
            benchmarkCorpusVersion: input.corpus.version as number,
            benchmarkCaseId: benchmarkCase.caseId,
          }),
          seed: input.seed,
          resourceLimits: input.resourceLimits,
          outputContract: manifest.outputContract,
        });
        const result = await options.runner.submit(job);
        caseRuns.push({ case: benchmarkCase, job, result });
      }

      const evaluation = await input.evaluator.evaluate(caseRuns);
      const cost = aggregateCost(caseRuns.map((run) => run.result));
      const latency = caseRuns.reduce(
        (total, run) => total + run.result.duration,
        0,
      );

      const record: EngineBenchmark = Object.freeze({
        id: benchmarkRecordId(input),
        capabilityVersion: input.corpus.capabilityVersion,
        engineVersion: input.engineVersion,
        benchmarkCorpusRef: input.corpus.id,
        evaluatorVersion: input.evaluator.evaluatorVersion,
        metrics: evaluation.metrics,
        cost,
        latency,
        licenseStatus: worstLicenseReviewStatus(manifest.license),
        result: evaluation.result,
      });
      return record;
    },
  };

  return runner;
}
