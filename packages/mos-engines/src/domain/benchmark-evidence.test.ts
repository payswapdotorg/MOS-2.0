/**
 * Benchmark-evidence wiring tests (ENG-004): complete EngineBenchmark
 * records become goldenCorpusBenchmark activation evidence; incomplete
 * records NEVER do (activation stays rejected naming the missing item);
 * failed benchmarks become evidence the gate rejects by name.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  Engine,
  EngineBenchmark,
  LicenseReviewStatus,
  Timestamp,
  Version,
} from "@mos/contracts";

import { BenchmarkError } from "./errors.js";
import {
  benchmarkRecordViolations,
  goldenCorpusEvidenceFromBenchmark,
  worstLicenseReviewStatus,
} from "./benchmark-evidence.js";
import { makeActivationEvidence, makeEngineManifest } from "../fixtures/test-engine-manifests.js";
import { createInMemoryEngineRegistry } from "../adapters/in-memory-engine-registry.js";

const FIXED_AT = "2026-01-01T00:00:00.000Z" as Timestamp;
const ENGINE_ID = "engine:benchmark-wiring" as Engine["id"];

function makeBenchmark(
  overrides: Partial<EngineBenchmark> = {},
): EngineBenchmark {
  return {
    id: "benchmark:corpus:golden@1:engine:benchmark-wiring@1:e1" as EngineBenchmark["id"],
    capabilityVersion: 1 as Version,
    engineVersion: 1 as Version,
    benchmarkCorpusRef: "corpus:golden@1" as EngineBenchmark["benchmarkCorpusRef"],
    evaluatorVersion: 1 as Version,
    metrics: { score: 1 },
    cost: { amount: 0.02, currency: "USD" },
    latency: 12,
    licenseStatus: "cleared",
    result: "passed",
    ...overrides,
  };
}

test("worstLicenseReviewStatus aggregates the three §29 layers", () => {
  const license = (
    statuses: readonly LicenseReviewStatus[],
  ): Engine["license"] => ({
    code: { identifier: "MIT", status: statuses[0] as LicenseReviewStatus },
    model: { identifier: "CC-BY-4.0", status: statuses[1] as LicenseReviewStatus },
    data: { identifier: "CC-BY-4.0", status: statuses[2] as LicenseReviewStatus },
  });
  assert.equal(worstLicenseReviewStatus(license(["cleared", "cleared", "cleared"])), "cleared");
  assert.equal(
    worstLicenseReviewStatus(license(["cleared", "review-required", "cleared"])),
    "review-required",
  );
  assert.equal(
    worstLicenseReviewStatus(license(["cleared", "review-required", "blocked"])),
    "blocked",
  );
});

test("a complete EngineBenchmark record becomes goldenCorpusBenchmark evidence", () => {
  const benchmark = makeBenchmark();
  const evidence = goldenCorpusEvidenceFromBenchmark(benchmark);
  assert.deepEqual(evidence, {
    benchmarkId: benchmark.id,
    result: "passed",
  });
});

test("incomplete benchmark records are named and rejected, field by field", () => {
  const { metrics, latency, ...stripped } = makeBenchmark();
  void metrics;
  void latency;
  assert.deepEqual(benchmarkRecordViolations(stripped), [
    "metrics",
    "latency",
  ]);

  assert.throws(
    () => goldenCorpusEvidenceFromBenchmark(stripped),
    (error: unknown) =>
      error instanceof BenchmarkError &&
      error.code === "incomplete-benchmark-record" &&
      /metrics/.test(error.message) &&
      /latency/.test(error.message),
  );
});

test("incomplete benchmark → activation still rejected (the gate never sees the evidence)", () => {
  const engine = makeEngineManifest({ id: ENGINE_ID as string });
  const registry = createInMemoryEngineRegistry({ clock: () => FIXED_AT });
  registry.registerEngine(engine);

  // The wiring refuses the incomplete record (missing metrics), so the
  // operator cannot submit it as evidence; the activation goes in
  // WITHOUT goldenCorpusBenchmark and is rejected naming it.
  const incomplete = makeBenchmark({
    metrics: undefined as unknown as EngineBenchmark["metrics"],
  });
  assert.throws(() => goldenCorpusEvidenceFromBenchmark(incomplete), BenchmarkError);

  const fullEvidence = makeActivationEvidence(engine);
  const { goldenCorpusBenchmark, ...withoutBenchmark } = fullEvidence;
  void goldenCorpusBenchmark;
  const verdict = registry.activateEngine(
    engine.id,
    engine.version,
    withoutBenchmark,
  );
  assert.equal(verdict.activated, false);
  assert.deepEqual(verdict.missingEvidence, ["goldenCorpusBenchmark"]);
});

test("complete-but-failed benchmark → evidence the activation gate rejects by name", () => {
  const engine = makeEngineManifest({ id: ENGINE_ID as string });
  const registry = createInMemoryEngineRegistry({ clock: () => FIXED_AT });
  registry.registerEngine(engine);

  const benchmark = makeBenchmark({ result: "failed" });
  const evidence = goldenCorpusEvidenceFromBenchmark(benchmark);
  assert.equal(evidence.result, "failed");

  const verdict = registry.activateEngine(
    engine.id,
    engine.version,
    {
      ...makeActivationEvidence(engine),
      goldenCorpusBenchmark: evidence,
    },
  );
  assert.equal(verdict.activated, false);
  assert.ok(
    verdict.failedChecks.includes("goldenCorpusBenchmark:not-passed"),
  );
});

test("complete passed benchmark wired into a full chain → activation succeeds", () => {
  const engine = makeEngineManifest({ id: ENGINE_ID as string });
  const registry = createInMemoryEngineRegistry({ clock: () => FIXED_AT });
  registry.registerEngine(engine);

  // The manifest's declared benchmark must be the one the evidence cites.
  const benchmark = makeBenchmark({ id: engine.benchmark.id });
  const evidence = goldenCorpusEvidenceFromBenchmark(benchmark);

  const verdict = registry.activateEngine(
    engine.id,
    engine.version,
    {
      ...makeActivationEvidence(engine),
      goldenCorpusBenchmark: evidence,
    },
  );
  assert.deepEqual(verdict, {
    activated: true,
    engineId: engine.id,
    engineVersion: engine.version,
    activatedAt: FIXED_AT,
  });
});
