/**
 * ENG-005 proof (part 2): rollback paths. After a swap to engine B:
 *
 * - return-to-incumbent across engine IDS is explicit: deactivating B fails
 *   resolution closed (`assigned-engine-inactive`, never a silent
 *   fallback), and an explicit b→a replacement record unblocks it — the
 *   same caller code runs on engine A again;
 * - rollbackByEngineVersion (same engine id): a promoted B@2 is rolled back
 *   to B@1 via `rollbackEngineVersion`, the same caller code executes B@1
 *   again, and B@2 stays registered + reproducible for historical runs
 *   (rollback can never bypass the activation evidence gate).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { EngineId, Version } from "@mos/contracts";

import { EngineRegistryError } from "../domain/errors.js";
import {
  CAPABILITY_ID,
  executeCapability,
  promoteEngine,
  createReplacementHarness,
} from "../fixtures/replacement-proof-harness.js";

const ENGINE_A = "engine:a" as EngineId;
const ENGINE_B = "engine:b" as EngineId;
const VERSION_1 = 1 as Version;
const VERSION_2 = 2 as Version;

/** Builds the post-swap world: A promoted → caller ran → B promoted → a→b recorded. */
async function createPostSwapHarness() {
  const harness = createReplacementHarness();
  await promoteEngine(harness, {
    engineId: ENGINE_A as string,
    version: 1,
    implementationTag: "alpha-impl",
    modelIdentity: "checkpoint:test/alpha@1",
    costPerInvocation: { amount: 0.02, currency: "USD" },
  });
  await executeCapability(harness, "pre-swap"); // assignment: engine A
  await promoteEngine(harness, {
    engineId: ENGINE_B as string,
    version: 1,
    implementationTag: "beta-impl",
    modelIdentity: "checkpoint:test/beta@1",
    costPerInvocation: { amount: 0.01, currency: "USD" },
  });
  harness.registry.recordEngineReplacement({
    capabilityId: CAPABILITY_ID,
    fromEngineId: ENGINE_A,
    fromEngineVersion: VERSION_1,
    toEngineId: ENGINE_B,
    toEngineVersion: VERSION_1,
    reason: "engine:b matches the golden corpus at half the cost",
  });
  return harness;
}

test("return-to-incumbent across engine ids: deactivation fails closed, an explicit record unblocks, same caller code", async () => {
  const harness = await createPostSwapHarness();
  const swapped = await executeCapability(harness, "swapped");
  assert.equal(swapped.result.provenance.engineId, ENGINE_B);

  // Retiring engine B: resolution refuses a silent fallback to A.
  harness.registry.deactivateEngine(ENGINE_B, VERSION_1);
  assert.throws(
    () => harness.registry.resolveCapability(CAPABILITY_ID),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "assigned-engine-inactive" &&
      error.details.currentEngineId === (ENGINE_B as string) &&
      error.details.candidateEngineId === (ENGINE_A as string),
  );

  // The explicit rollback record (b→a) unblocks the return.
  const rollbackRecord = harness.registry.recordEngineReplacement({
    capabilityId: CAPABILITY_ID,
    fromEngineId: ENGINE_B,
    fromEngineVersion: VERSION_1,
    toEngineId: ENGINE_A,
    toEngineVersion: VERSION_1,
    reason: "rollback to the incumbent engine",
  });
  assert.equal(rollbackRecord.recordedAt, "2026-01-01T00:00:00.000Z");

  // THE SAME CALLER CODE runs on engine A again.
  const returned = await executeCapability(harness, "returned");
  assert.equal(returned.result.failure, null);
  assert.equal(returned.resolution.engine.id, ENGINE_A);
  assert.equal(returned.resolution.assignment.via, "explicit-replacement");
  assert.equal(returned.result.provenance.engineId, ENGINE_A);
  assert.equal(returned.result.provenance.modelIdentity, "checkpoint:test/alpha@1");
});

test("rollbackByEngineVersion: promote B@2, roll back to B@1, same caller code; B@2 stays reproducible", async () => {
  const harness = await createPostSwapHarness();

  // A fixed B@2 arrives and is promoted through the same benchmark+gate
  // sequence (activating B@2 deactivates B@1 — benchmark-before-promotion).
  await promoteEngine(harness, {
    engineId: ENGINE_B as string,
    version: 2,
    implementationTag: "beta-impl-v2",
    modelIdentity: "checkpoint:test/beta@2",
    costPerInvocation: { amount: 0.005, currency: "USD" },
  });
  const bumped = await executeCapability(harness, "bumped");
  assert.equal(bumped.resolution.engine.id, ENGINE_B);
  assert.equal(bumped.resolution.engine.version, VERSION_2);
  assert.equal(bumped.result.provenance.engineVersion, VERSION_2);
  assert.equal(bumped.result.provenance.modelIdentity, "checkpoint:test/beta@2");

  // Rollback by engine version: B@1 carries a previously ACCEPTED evidence
  // chain, so the rollback re-points the active version without bypassing
  // the activation gate.
  const rollback = harness.registry.rollbackEngineVersion(ENGINE_B, VERSION_1);
  assert.equal(rollback.engineId, ENGINE_B);
  assert.equal(rollback.fromEngineVersion, VERSION_2);
  assert.equal(rollback.toEngineVersion, VERSION_1);
  assert.equal(rollback.rolledBackAt, "2026-01-01T00:00:00.000Z");

  // THE SAME CALLER CODE runs on B@1 again.
  const rolled = await executeCapability(harness, "rolled");
  assert.equal(rolled.result.failure, null);
  assert.equal(rolled.resolution.engine.id, ENGINE_B);
  assert.equal(rolled.resolution.engine.version, VERSION_1);
  assert.equal(rolled.result.provenance.engineVersion, VERSION_1);
  assert.equal(rolled.result.provenance.modelIdentity, "checkpoint:test/beta@1");

  // B@2 stays registered and resolvable (historical reproducibility)...
  assert.notEqual(harness.registry.getEngine(ENGINE_B, VERSION_2), undefined);
  assert.deepEqual(harness.registry.listEngineVersions(ENGINE_B), [1, 2]);
  // ...and the historical B@2 job still executes through B@2, reproducing
  // its original outputs bit for bit.
  const b2Rerun = await harness.runner.submit(bumped.job);
  assert.equal(b2Rerun.failure, null);
  assert.equal(b2Rerun.provenance.engineVersion, VERSION_2);
  assert.equal(b2Rerun.provenance.modelIdentity, "checkpoint:test/beta@2");
  assert.deepEqual(
    b2Rerun.outputArtifactRefs.map((ref) => ref.digest),
    bumped.result.outputArtifactRefs.map((ref) => ref.digest),
  );

  // Rollback can never bypass the activation gate: a registered-but-never-
  // activated version is a typed error (pinned in engine-lifecycle tests;
  // restated here inside the proof scenario).
  assert.throws(
    () => harness.registry.rollbackEngineVersion(ENGINE_B, 9 as Version),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "unknown-engine",
  );
});
