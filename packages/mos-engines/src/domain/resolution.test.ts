/**
 * Deterministic resolution comparator tests (ENG-001).
 *
 * Constructs candidate pairs that differ on EXACTLY ONE tie-break
 * dimension at a time and asserts the policy ordering of
 * spec/mos-engine-policy-v2.0.yaml:
 *   contractCompatibility → licenseCompatibility → benchmarkScore →
 *   cost → latency → engineId.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { EngineLicense, LicenseReviewStatus } from "@mos/contracts";

import {
  compareEngineCandidates,
  deriveLicenseCompatibility,
  firstDifferingDimension,
} from "./resolution.js";
import type { EngineResolutionCandidate } from "./resolution.js";

/** Plain-scalar overrides (branded here) so call sites stay readable. */
type CandidateOverrides = Omit<
  Partial<EngineResolutionCandidate>,
  "engineId" | "engineVersion"
> & {
  readonly engineId?: string;
  readonly engineVersion?: number;
};

function candidate(overrides: CandidateOverrides = {}): EngineResolutionCandidate {
  const { engineId = "engine:a", engineVersion = 1, ...rest } = overrides;
  return {
    engineId: engineId as EngineResolutionCandidate["engineId"],
    engineVersion: engineVersion as EngineResolutionCandidate["engineVersion"],
    contractCompatibility: "compatible",
    licenseCompatibility: "compatible",
    benchmarkScore: 0.8,
    costAmount: 0.01,
    latencyMs: 1000,
    engine: {} as EngineResolutionCandidate["engine"],
    ...rest,
  };
}

test("dimension 1 — contractCompatibility beats everything after it", () => {
  const compatible = candidate({ engineId: "engine:a" });
  const degraded = candidate({
    engineId: "engine:b",
    contractCompatibility: "degraded",
    benchmarkScore: 0.99, // better score must NOT rescue a degraded contract
    costAmount: 0.0001,
    latencyMs: 1,
  });
  assert.ok(compareEngineCandidates(compatible, degraded) < 0);
  assert.equal(
    firstDifferingDimension(compatible, degraded),
    "contractCompatibility",
  );
});

test("dimension 2 — licenseCompatibility beats benchmarkScore/cost/latency", () => {
  const cleared = candidate({ engineId: "engine:a" });
  const restricted = candidate({
    engineId: "engine:b",
    licenseCompatibility: "restricted",
    benchmarkScore: 0.99,
    costAmount: 0.0001,
    latencyMs: 1,
  });
  assert.ok(compareEngineCandidates(cleared, restricted) < 0);
  assert.equal(
    firstDifferingDimension(cleared, restricted),
    "licenseCompatibility",
  );
});

test("dimension 3 — benchmarkScore: higher wins, beats cost and latency", () => {
  const highScore = candidate({
    engineId: "engine:a",
    benchmarkScore: 0.9,
    costAmount: 5,
    latencyMs: 9000,
  });
  const lowScore = candidate({
    engineId: "engine:b",
    benchmarkScore: 0.8,
    costAmount: 0.0001,
    latencyMs: 1,
  });
  assert.ok(compareEngineCandidates(highScore, lowScore) < 0);
  assert.equal(firstDifferingDimension(highScore, lowScore), "benchmarkScore");
});

test("dimension 4 — cost: lower wins, beats latency", () => {
  const cheap = candidate({
    engineId: "engine:a",
    costAmount: 0.005,
    latencyMs: 9000,
  });
  const expensive = candidate({
    engineId: "engine:b",
    costAmount: 0.01,
    latencyMs: 1,
  });
  assert.ok(compareEngineCandidates(cheap, expensive) < 0);
  assert.equal(firstDifferingDimension(cheap, expensive), "cost");
});

test("dimension 5 — latency: lower wins, beats engineId", () => {
  const fast = candidate({
    engineId: "engine:z",
    latencyMs: 500,
  });
  const slow = candidate({
    engineId: "engine:a",
    latencyMs: 1000,
  });
  assert.ok(compareEngineCandidates(fast, slow) < 0);
  assert.equal(firstDifferingDimension(fast, slow), "latency");
});

test("dimension 6 — engineId: lexicographically lower wins (total order)", () => {
  const a = candidate({ engineId: "engine:a" });
  const b = candidate({ engineId: "engine:b" });
  assert.ok(compareEngineCandidates(a, b) < 0);
  assert.ok(compareEngineCandidates(b, a) > 0);
  assert.equal(firstDifferingDimension(a, b), "engineId");
});

test("same engine id, different versions: HIGHER version wins (documented completion)", () => {
  const v2 = candidate({ engineId: "engine:a", engineVersion: 2 });
  const v1 = candidate({ engineId: "engine:a", engineVersion: 1 });
  assert.ok(compareEngineCandidates(v2, v1) < 0);
  assert.equal(firstDifferingDimension(v2, v1), "engineId");
});

test("identical candidates compare equal (deterministic total order)", () => {
  const a = candidate({});
  const b = candidate({});
  assert.equal(compareEngineCandidates(a, b), 0);
  assert.equal(firstDifferingDimension(a, b), "engineId");
});

test("sorting a mixed field ranks strictly by policy dimension order", () => {
  const best = candidate({ engineId: "engine:a", benchmarkScore: 0.95 });
  const middle = candidate({ engineId: "engine:b", benchmarkScore: 0.85 });
  const worst = candidate({
    engineId: "engine:c",
    benchmarkScore: 0.85,
    costAmount: 2,
  });
  const ranked = [worst, best, middle].sort(compareEngineCandidates);
  assert.deepEqual(
    ranked.map((item) => item.engineId),
    ["engine:a", "engine:b", "engine:c"],
  );
});

function license(
  code: LicenseReviewStatus,
  model: LicenseReviewStatus,
  data: LicenseReviewStatus,
): EngineLicense {
  return {
    code: { identifier: "x", status: code },
    model: { identifier: "x", status: model },
    data: { identifier: "x", status: data },
  };
}

test("deriveLicenseCompatibility aggregates worst-of-three (§29)", () => {
  assert.equal(
    deriveLicenseCompatibility(license("cleared", "cleared", "cleared")),
    "compatible",
  );
  assert.equal(
    deriveLicenseCompatibility(license("cleared", "review-required", "cleared")),
    "restricted",
  );
  assert.equal(
    deriveLicenseCompatibility(license("cleared", "cleared", "blocked")),
    "incompatible",
  );
  assert.equal(
    deriveLicenseCompatibility(license("blocked", "review-required", "cleared")),
    "incompatible",
  );
});
