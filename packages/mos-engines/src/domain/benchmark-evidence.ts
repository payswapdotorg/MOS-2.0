/**
 * Benchmark → activation-evidence wiring (ENG-004).
 *
 * The bridge between the ENG-004 benchmark runner and the ENG-001
 * activation gate: a canonical EngineBenchmark record becomes
 * `goldenCorpusBenchmark` evidence ONLY when it is COMPLETE — every
 * required field of the frozen contract present
 * (spec/contracts/core-contracts-v2.0.yaml EngineBenchmark.required).
 * Incomplete records never become evidence, so an activation submitted
 * without a complete benchmark stays rejected (missing evidence named);
 * a complete-but-FAILED benchmark becomes evidence with `result:
 * "failed"`, which the gate rejects by name
 * (`goldenCorpusBenchmark:not-passed`). Also derives the worst-of-three
 * §29 license review status used by the benchmark record.
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  Engine,
  EngineBenchmark,
  LicenseReviewStatus,
} from "@mos/contracts";

import { BenchmarkError } from "./errors.js";
import type { GoldenCorpusBenchmarkEvidence } from "./activation.js";

/**
 * Worst-of-three §29 license review status: any blocked layer blocks; any
 * review-required layer degrades to review-required; else cleared.
 */
export function worstLicenseReviewStatus(
  license: Engine["license"],
): LicenseReviewStatus {
  const layers: readonly LicenseReviewStatus[] = [
    license.code.status,
    license.model.status,
    license.data.status,
  ];
  if (layers.includes("blocked")) {
    return "blocked";
  }
  if (layers.includes("review-required")) {
    return "review-required";
  }
  return "cleared";
}

/**
 * Validates a candidate benchmark record against the frozen
 * EngineBenchmark contract. Returns the named missing required fields
 * (empty = complete).
 */
export function benchmarkRecordViolations(
  benchmark: object,
): readonly string[] {
  try {
    assertRequiredFields(benchmark, "EngineBenchmark");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fields = message.split("missing required fields:")[1];
    if (fields === undefined) {
      return ["unknown"];
    }
    return fields.split(",").map((field) => field.trim());
  }
  return [];
}

/**
 * THE wiring: converts a COMPLETE EngineBenchmark record into the
 * activation gate's `goldenCorpusBenchmark` evidence. Throws
 * `BenchmarkError("incomplete-benchmark-record")` naming every missing
 * field otherwise — an incomplete benchmark can never back an
 * activation.
 */
export function goldenCorpusEvidenceFromBenchmark(
  benchmark: object,
): GoldenCorpusBenchmarkEvidence {
  const violations = benchmarkRecordViolations(benchmark);
  if (violations.length > 0) {
    throw new BenchmarkError(
      "incomplete-benchmark-record",
      `benchmark record is missing required fields: ${violations.join(", ")}`,
      { missing: violations },
    );
  }
  const record = benchmark as EngineBenchmark;
  return Object.freeze({
    benchmarkId: record.id,
    result: record.result,
  });
}
