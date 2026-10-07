/**
 * DISCLOSED TEST DOUBLE — deterministic BenchmarkEvaluatorPort (ENG-004).
 *
 * ⚠ TEST DOUBLE ONLY — NEVER A PRODUCTION EVALUATOR ⚠
 *
 * Two disclosed deterministic scoring modes:
 *
 * - `"digest-exact"` (default): a case MATCHES when its engine run
 *   succeeded (no failure) and the sorted output digests equal the sorted
 *   expected-output digests (content identity, robust to artifact-id
 *   minting). This is the exact-reproduction gold standard: a replacement
 *   engine must reproduce the golden outputs bit for bit.
 *
 * - `"contract-shape"`: a case MATCHES when its engine run succeeded and
 *   produced the same NUMBER of outputs as expected, every output
 *   artifact's `type` being among the expected outputs' types. This models
 *   a capability-level golden corpus ("one artifact of type X per input",
 *   ground truth vetted independently of any one implementation) and lets
 *   genuinely DIFFERENT implementations of the same capability contract
 *   pass the same goldens — the ENG-005 replacement scenario.
 *
 * Verdicts (both modes): no cases ran successfully → `inconclusive` (no
 * evidence); every case matched → `passed`; anything else → `failed`.
 *
 * score = matched / total. Same runs → same metrics (pure function).
 * It makes NO claim about real evaluator quality — the quality evaluator
 * contract is a §5 capability concern; this double pins the ENGINE
 * REPLACEMENT benchmark mechanics.
 */

import type {
  BenchmarkMetrics,
  BenchmarkResult,
  EvaluatorRef,
  Version,
} from "@mos/contracts";

import type {
  BenchmarkCaseRun,
  BenchmarkEvaluation,
  BenchmarkEvaluatorPort,
} from "../ports/benchmark.port.js";

/** Options for the disclosed deterministic evaluator. */
export interface DisclosedBenchmarkEvaluatorOptions {
  readonly evaluatorRef: EvaluatorRef;
  readonly evaluatorVersion: Version;
  /** Scoring mode (default `"digest-exact"`); see the header comment. */
  readonly mode?: "digest-exact" | "contract-shape";
}

function sortedDigests(
  refs: readonly { readonly digest: string }[],
): readonly string[] {
  return refs.map((ref) => ref.digest).sort();
}

function caseMatches(
  mode: "digest-exact" | "contract-shape",
  run: BenchmarkCaseRun,
): boolean {
  if (run.result.failure !== null) {
    return false;
  }
  const produced = run.result.outputArtifactRefs;
  const expected = run.case.expectedOutputArtifactRefs;
  if (mode === "digest-exact") {
    const producedDigests = sortedDigests(produced);
    const expectedDigests = sortedDigests(expected);
    return (
      producedDigests.length === expectedDigests.length &&
      producedDigests.every((digest, index) => digest === expectedDigests[index])
    );
  }
  // contract-shape: same output count, every produced type expected.
  if (produced.length !== expected.length) {
    return false;
  }
  const expectedTypes = new Set(expected.map((ref) => ref.type));
  return produced.every((ref) => expectedTypes.has(ref.type));
}

/**
 * Creates the DISCLOSED deterministic benchmark evaluator.
 */
export function createDisclosedBenchmarkEvaluator(
  options: DisclosedBenchmarkEvaluatorOptions,
): BenchmarkEvaluatorPort {
  const mode = options.mode ?? "digest-exact";
  return {
    evaluatorRef: options.evaluatorRef,
    evaluatorVersion: options.evaluatorVersion,

    async evaluate(
      runs: readonly BenchmarkCaseRun[],
    ): Promise<BenchmarkEvaluation> {
      const total = runs.length;
      let matched = 0;
      let successfulRuns = 0;

      for (const run of runs) {
        if (run.result.failure === null) {
          successfulRuns += 1;
        }
        if (caseMatches(mode, run)) {
          matched += 1;
        }
      }

      const result: BenchmarkResult =
        total === 0 || successfulRuns === 0
          ? "inconclusive"
          : matched === total
            ? "passed"
            : "failed";

      const metrics: BenchmarkMetrics = Object.freeze({
        score: total === 0 ? 0 : matched / total,
        matchedCases: matched,
        totalCases: total,
        successfulRuns,
      });

      return Object.freeze({ metrics, result });
    },
  };
}
