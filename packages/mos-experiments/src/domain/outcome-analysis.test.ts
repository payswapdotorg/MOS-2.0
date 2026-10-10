/**
 * BRIDGE-003 outcome-analysis tests — the observed metric means (LAB-008
 * discipline), the outcome record assembly and the LAB-018 boundary
 * observation projection.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { observedMetricMeansOf, projectOutcomeObservation } from "./outcome-analysis.js";
import type { ExperimentOutcomeRecord } from "../contracts/outcome.js";
import type { MeasuredExperimentEvidence } from "../contracts/evidence.js";
import { experimentObservationFixture } from "../testing/experiment-fixtures.js";
import { REAL_EXPERIMENT_BOUNDARY_STATEMENT } from "../contracts/experiment-boundary.js";

const measuredEvidenceOf = (): MeasuredExperimentEvidence => ({
  id: "exp-test-1" as never,
  version: 2 as never,
  tenantId: "tenant-experiments-fixture" as never,
  kind: "measured-evidence",
  window: { windowStart: "2026-06-01T00:00:00.000Z", windowEnd: "2026-06-08T00:00:00.000Z" } as never,
  subjectRef: "platform-post:experiment-1",
  publicationRef: { publicationId: "social-pub:experiment-fixture-1", providerId: "youtube" },
  observations: [
    {
      observationId: "social-obs:a",
      channelRef: "c",
      providerId: "youtube",
      subjectRef: "platform-post:experiment-1",
      reported: { "qualified-reach": 100, note: "not-numeric", "engagement-rate": 0.1 },
      observedAt: "2026-06-02T00:00:00.000Z" as never,
      recordedAt: "2026-06-02T00:00:00.000Z" as never,
      providerRefs: ["ref-a"],
      source: "in-memory-social-transport-double",
    },
    {
      observationId: "social-obs:b",
      channelRef: "c",
      providerId: "youtube",
      subjectRef: "platform-post:experiment-1",
      reported: { "qualified-reach": 200, "engagement-rate": 0.3 },
      observedAt: "2026-06-03T00:00:00.000Z" as never,
      recordedAt: "2026-06-03T00:00:00.000Z" as never,
      providerRefs: ["ref-b"],
      source: "in-memory-social-transport-double",
    },
  ],
  uncertainty: { level: "moderate", observationCount: 2, distinctProviders: 1, note: "n" },
  measuredAt: "2026-06-08T00:00:01.000Z" as never,
  counterfactual: false,
  evidenceKind: "platform-said-observation",
  boundaryStatement: REAL_EXPERIMENT_BOUNDARY_STATEMENT,
  evidenceDigest: "d",
});

test("the observed metric means aggregate NUMERIC members only (never coerced)", () => {
  const means = observedMetricMeansOf(measuredEvidenceOf());
  assert.equal(means.length, 2);
  const reach = means.find((mean) => mean.metric === "qualified-reach");
  const engagement = means.find((mean) => mean.metric === "engagement-rate");
  assert.ok(reach !== undefined);
  assert.equal(reach.value, 150);
  assert.ok(engagement !== undefined);
  assert.equal(Math.abs(engagement.value - 0.2) < 1e-12, true);
  // The non-numeric member is cited by the evidence but never aggregated.
  assert.equal(means.some((mean) => mean.metric === "note"), false);
  assert.equal(means.every((mean) => mean.unit === "platform-reported"), true);
});

test("the metric order is the first-seen order over the observations (deterministic)", () => {
  const means = observedMetricMeansOf(measuredEvidenceOf());
  assert.deepEqual(
    means.map((mean) => mean.metric),
    ["qualified-reach", "engagement-rate"],
  );
});

const outcomeRecordOf = (): ExperimentOutcomeRecord => ({
  id: "exp-test-1" as never,
  version: 1 as never,
  tenantId: "tenant-experiments-fixture" as never,
  experimentRef: { experimentId: "exp-test-1" as never, experimentVersion: 3 },
  evidenceRef: { evidenceId: "exp-test-1" as never, version: 2 },
  observedMetricMeans: [
    { metric: "qualified-reach", value: 150, unit: "platform-reported" },
  ],
  observations: [
    {
      observationId: "social-obs:a",
      channelRef: "c",
      providerId: "youtube",
      subjectRef: "platform-post:experiment-1",
      reported: { "qualified-reach": 100 },
      observedAt: "2026-06-02T00:00:00.000Z" as never,
      recordedAt: "2026-06-02T00:00:00.000Z" as never,
      providerRefs: ["ref-a"],
      source: "in-memory-social-transport-double",
    },
  ],
  counterfactualExpectation: {
    expectedReward: 42.5,
    interval: { lower: 30, upper: 55 },
    uncertainty: { level: "moderate", note: "n" },
    rewardSpecVersion: 1,
    counterfactual: true,
    labCandidateRef: "benchmark:b:v1:k",
  },
  rewardSpecCitation: { missionRef: "m", missionVersion: 2, rewardSpecVersion: 1 },
  uncertainty: { level: "moderate", note: "n", observationCount: 2, distinctProviders: 1 },
  conclusion: "measured-outcome-recorded",
  outcomeObservationId: "exp-obs:exp-test-1" as never,
  analysedAt: "2026-06-09T00:00:00.000Z",
  boundaryStatement: REAL_EXPERIMENT_BOUNDARY_STATEMENT,
  outcomeDigest: "d",
});

test("the LAB-018 boundary projection carries the HistoricalObservation fields exactly", () => {
  const observation = projectOutcomeObservation(outcomeRecordOf(), {
    niche: "marketing-tech-saas",
    platform: "youtube",
    regime: "current-market-regime",
    windowEnd: "2026-06-08T00:00:00.000Z" as never,
    publicationId: "social-pub:experiment-fixture-1",
  });
  assert.equal(observation.id, "exp-obs:exp-test-1");
  assert.equal(observation.version, 1);
  assert.equal(observation.tenantId, "tenant-experiments-fixture");
  assert.equal(observation.niche, "marketing-tech-saas");
  assert.equal(observation.platform, "youtube");
  assert.equal(observation.metrics.length, 1);
  assert.deepEqual(observation.metrics[0], { metric: "qualified-reach", value: 150, unit: "platform-reported" });
  assert.equal(observation.observedAt, "2026-06-08T00:00:00.000Z");
  assert.deepEqual(observation.sourceRefs, ["social-obs:a", "social-publication:social-pub:experiment-fixture-1"]);
  assert.equal(observation.regime, "current-market-regime");
  assert.equal(observation.counterfactual, false);
});

test("the projection over an empty outcome fails LOUD (store-corruption territory)", () => {
  const outcome = outcomeRecordOf();
  const corrupt = { ...outcome, observations: [] };
  assert.throws(() => projectOutcomeObservation(corrupt, {
    niche: "n",
    platform: "p",
    regime: "r",
    windowEnd: "2026-06-08T00:00:00.000Z" as never,
    publicationId: "pub",
  }), /folds zero observations/);
});

void experimentObservationFixture;
