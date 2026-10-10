/**
 * BRIDGE-003 outcome-observation tests — the LEARNING/CALIBRATION FEED
 * surface: the outcome citations the LAB-018 calibration authority
 * consumes through its declared RealityObservationReaderPort boundary (by
 * reference — read-only projection, no second calibration authority, no
 * writes into lab state).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composeExperimentWorld,
  experimentBindingRequestFixture,
  EXPERIMENT_SCOPE,
  EXPERIMENT_TENANT,
  EXPERIMENT_ACTOR,
} from "../testing/search-fixtures.js";
import { experimentObservationIdOf } from "../contracts/ids.js";

/** Bind + measure + analyse (the golden path). */
const goldenPath = async (world: ReturnType<typeof composeExperimentWorld>) => {
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  if (!bound.ok) {
    throw new Error(`fixture binding failed: ${bound.error.kind}`);
  }
  const experimentId = bound.value.experimentId;
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "w", tenantId: EXPERIMENT_TENANT });
  if (claim === null) {
    throw new Error("fixture claim failed");
  }
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "w",
  });
  if (!advanced.ok) {
    throw new Error(`fixture advance failed: ${advanced.error.kind}`);
  }
  const analysed = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, EXPERIMENT_ACTOR);
  if (!analysed.ok) {
    throw new Error(`fixture analyse failed: ${analysed.error.kind}`);
  }
  return { experimentId, outcome: analysed.value.outcome, experiment: analysed.value.experiment };
};

test("the outcome observation resolves by its deterministic id after analysis", async () => {
  const world = composeExperimentWorld();
  const { experimentId, outcome } = await goldenPath(world);
  const observationId = experimentObservationIdOf(experimentId);
  assert.equal(outcome.outcomeObservationId, observationId);
  const observation = world.authority.getOutcomeObservation(EXPERIMENT_SCOPE, observationId);
  assert.ok(observation !== null);
  assert.equal(observation.id, observationId);
  // The observation is the projection of the LATEST outcome version.
  assert.equal(observation.version, outcome.version);
});

test("the observation carries the REAL publication's platform + the declared context verbatim", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await goldenPath(world);
  const observation = world.authority.getOutcomeObservation(
    EXPERIMENT_SCOPE,
    experimentObservationIdOf(experimentId),
  );
  assert.ok(observation !== null);
  // Platform DERIVED from the REAL publication (never caller-claimed).
  assert.equal(observation.platform, "youtube");
  // Niche + regime carried verbatim from the declared measurement context.
  assert.equal(observation.niche, "marketing-tech-saas");
  assert.equal(observation.regime, "current-market-regime");
});

test("observedAt is the window end (the Time Machine visibility key)", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await goldenPath(world);
  const observation = world.authority.getOutcomeObservation(
    EXPERIMENT_SCOPE,
    experimentObservationIdOf(experimentId),
  );
  assert.ok(observation !== null);
  assert.equal(observation.observedAt, "2026-06-08T00:00:00.000Z");
});

test("sourceRefs cite the REAL platform-said observation ids + the publication (non-empty, traceable)", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await goldenPath(world);
  const observation = world.authority.getOutcomeObservation(
    EXPERIMENT_SCOPE,
    experimentObservationIdOf(experimentId),
  );
  assert.ok(observation !== null);
  assert.deepEqual(observation.sourceRefs, [
    "social-obs:experiment-1",
    "social-obs:experiment-2",
    "social-obs:experiment-3",
    "social-obs:experiment-4",
    "social-obs:experiment-5",
    "social-publication:social-pub:experiment-fixture-1",
  ]);
});

test("the observation is READ-ONLY: the authority surface has no lab-state write path", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await goldenPath(world);
  const observationId = experimentObservationIdOf(experimentId);
  // The only lab-facing surface is the getOutcomeObservation read; there is
  // no write method on any lab surface (pinned by the exported-vocabulary
  // scan in authority-discipline.test.ts; here: the read is stable).
  const first = world.authority.getOutcomeObservation(EXPERIMENT_SCOPE, observationId);
  const second = world.authority.getOutcomeObservation(EXPERIMENT_SCOPE, observationId);
  assert.deepEqual(JSON.stringify(first), JSON.stringify(second));
  // The returned projection is frozen (deep-freeze at the boundary).
  assert.ok(Object.isFrozen(first));
});

test("before analysis, the observation id resolves to null (the outcome does not exist yet)", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  assert.ok(bound.ok);
  const observation = world.authority.getOutcomeObservation(
    EXPERIMENT_SCOPE,
    experimentObservationIdOf(bound.value.experimentId),
  );
  assert.equal(observation, null);
});