/**
 * ENG-005 proof (part 1): swap the engine implementation for a capability
 * WITHOUT domain-code changes, with the benchmark-before-promotion gate,
 * the explicit (never silent) replacement record, the stable capability
 * contract, and historical runs retaining the old engine's identity and
 * reproducibility.
 *
 * This is the repeatable acceptance evidence for ENG-005 (backlog:
 * "swap implementation without domain changes; historical runs retain
 * engine identity"). The documented scenario in README.md mirrors this
 * test step by step. Rollback paths are pinned in
 * engine-rollback-proof.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  BenchmarkCorpusRef,
  EngineBenchmarkId,
  EngineId,
  Version,
} from "@mos/contracts";

import { EngineRegistryError } from "../domain/errors.js";
import { goldenCorpusEvidenceFromBenchmark } from "../domain/benchmark-evidence.js";
import {
  makeActivationEvidence,
  makeEngineManifest,
} from "../fixtures/test-engine-manifests.js";
import {
  CAPABILITY_ID,
  FIXED_CLOCK,
  executeCapability,
  promoteEngine,
  createReplacementHarness,
} from "../fixtures/replacement-proof-harness.js";

const ENGINE_A = "engine:a" as EngineId;
const ENGINE_B = "engine:b" as EngineId;
const VERSION_1 = 1 as Version;

test("ENG-005 core proof: swap engine implementation without domain-code changes; history keeps engine A identity", async () => {
  const harness = createReplacementHarness();

  // ---- Phase 0: incumbent engine A, promoted through the real sequence --
  const incumbent = await promoteEngine(harness, {
    engineId: ENGINE_A as string,
    version: 1,
    implementationTag: "alpha-impl",
    modelIdentity: "checkpoint:test/alpha@1",
    costPerInvocation: { amount: 0.02, currency: "USD" },
  });

  // ---- Phase 1: THE CALLER (written once) runs on engine A --------------
  const before = await executeCapability(harness, "before");
  assert.equal(before.result.failure, null);
  assert.equal(before.resolution.engine.id, ENGINE_A);
  assert.equal(before.resolution.assignment.via, "initial-resolution");
  assert.equal(before.result.provenance.engineId, ENGINE_A);
  assert.equal(before.result.provenance.engineVersion, VERSION_1);
  assert.equal(before.result.provenance.modelIdentity, "checkpoint:test/alpha@1");
  assert.equal(before.result.outputArtifactRefs.length, 2);

  // ---- Phase 2: replacement candidate B arrives (different implementation)
  // benchmarkBeforePromotion: the candidate registration CANNOT activate
  // before a passed golden-corpus benchmark exists — the gate rejects the
  // pending record BY NAME (manifest + evidence sides).
  const candidateId = `${ENGINE_B as string}:candidate` as EngineId;
  const pendingManifest = makeEngineManifest({
    id: candidateId as string,
    version: 1,
    benchmark: {
      id: `benchmark:pending:${candidateId as string}@1` as EngineBenchmarkId,
      capabilityVersion: VERSION_1,
      engineVersion: VERSION_1,
      benchmarkCorpusRef: "corpus:golden-relevance" as BenchmarkCorpusRef,
      evaluatorVersion: VERSION_1,
      metrics: { score: 0 },
      cost: { amount: 0, currency: "USD" },
      latency: 0,
      licenseStatus: "review-required",
      result: "inconclusive",
    },
  });
  harness.registry.registerEngine(pendingManifest);
  const rejected = harness.registry.activateEngine(
    candidateId,
    VERSION_1,
    {
      ...makeActivationEvidence(pendingManifest),
      goldenCorpusBenchmark: goldenCorpusEvidenceFromBenchmark(
        pendingManifest.benchmark,
      ),
    },
  );
  assert.equal(rejected.activated, false);
  assert.ok(rejected.failedChecks.includes("benchmark:not-passed"));
  assert.ok(rejected.failedChecks.includes("goldenCorpusBenchmark:not-passed"));

  // The candidate passes the golden corpus → the full promotion sequence.
  const replacement = await promoteEngine(
    harness,
    {
      engineId: ENGINE_B as string,
      version: 1,
      implementationTag: "beta-impl",
      modelIdentity: "checkpoint:test/beta@1",
      costPerInvocation: { amount: 0.01, currency: "USD" },
    },
    { candidateAlreadyRegistered: pendingManifest },
  );
  assert.equal(replacement.benchmark.result, "passed");
  assert.equal(replacement.benchmark.metrics.score, 1);
  // The benchmark cases genuinely ran through the REAL sandbox runner.
  const benchmarkCompletions = harness.sink.completions.filter((event) =>
    (event.jobId as string).startsWith("job:benchmark:"),
  );
  assert.equal(benchmarkCompletions.length, 4); // A: 2 cases + B: 2 cases
  for (const completion of benchmarkCompletions) {
    assert.equal(completion.type, "job-succeeded");
  }

  // ---- Phase 3: stable capability contract ------------------------------
  assert.deepEqual(
    replacement.manifest.capabilityIds,
    incumbent.manifest.capabilityIds,
  );
  assert.deepEqual(
    replacement.manifest.outputContract,
    incumbent.manifest.outputContract,
  );

  // ---- Phase 4: the swap is EXPLICIT, never silent ----------------------
  assert.throws(
    () => harness.registry.resolveCapability(CAPABILITY_ID),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "silent-engine-replacement" &&
      error.details.currentEngineId === (ENGINE_A as string) &&
      error.details.candidateEngineId === (ENGINE_B as string),
  );
  harness.registry.recordEngineReplacement({
    capabilityId: CAPABILITY_ID,
    fromEngineId: ENGINE_A,
    fromEngineVersion: VERSION_1,
    toEngineId: ENGINE_B,
    toEngineVersion: VERSION_1,
    reason: "engine:b matches the golden corpus at half the cost",
  });

  // ---- Phase 5: THE SAME CALLER CODE runs on engine B -------------------
  const after = await executeCapability(harness, "after");
  assert.equal(after.result.failure, null);
  assert.equal(after.resolution.engine.id, ENGINE_B);
  assert.equal(after.resolution.engine.version, VERSION_1);
  assert.equal(after.resolution.assignment.via, "explicit-replacement");
  assert.equal(after.result.provenance.engineId, ENGINE_B);
  assert.equal(after.result.provenance.engineVersion, VERSION_1);
  assert.equal(after.result.provenance.modelIdentity, "checkpoint:test/beta@1");
  // The caller's job changed ONLY in engine identity (and the run label):
  // capability, parameters, seed, inputs and quotas are untouched — the
  // stable capability contract made the swap a configuration change.
  const { id: _id, engineId: _engineId, engineVersion: _engineVersion, ...callerShape } =
    before.job;
  void _id;
  void _engineId;
  void _engineVersion;
  const {
    id: id2,
    engineId: engineId2,
    engineVersion: engineVersion2,
    ...callerShapeAfter
  } = after.job;
  void id2;
  void engineId2;
  void engineVersion2;
  assert.deepEqual(callerShapeAfter, callerShape);
  // Genuinely different implementation → different output digests.
  assert.notDeepEqual(
    after.result.outputArtifactRefs.map((ref) => ref.digest),
    before.result.outputArtifactRefs.map((ref) => ref.digest),
  );

  // ---- Phase 6: historical runs retain engine A's identity --------------
  harness.registry.deactivateEngine(ENGINE_A, VERSION_1); // the incumbent is retired
  // The frozen historical record still names engine A + its model identity.
  assert.equal(before.result.provenance.engineId, ENGINE_A);
  assert.equal(before.result.provenance.modelIdentity, "checkpoint:test/alpha@1");
  // oldEngineMustRemainReproducibleForHistoricalRuns: the retired version
  // stays registered/resolvable by exact identity...
  assert.notEqual(harness.registry.getEngine(ENGINE_A, VERSION_1), undefined);
  // ...and the EXACT historical job still executes through engine A,
  // reproducing its original outputs bit for bit (determinism).
  const historicalRerun = await harness.runner.submit(before.job);
  assert.equal(historicalRerun.failure, null);
  assert.equal(historicalRerun.provenance.engineId, ENGINE_A);
  assert.equal(historicalRerun.provenance.engineVersion, VERSION_1);
  assert.equal(historicalRerun.provenance.modelIdentity, "checkpoint:test/alpha@1");
  assert.deepEqual(
    historicalRerun.outputArtifactRefs.map((ref) => ref.digest),
    before.result.outputArtifactRefs.map((ref) => ref.digest),
  );
  // Current resolution still routes to engine B — history and present coexist.
  assert.equal(
    harness.registry.resolveCapability(CAPABILITY_ID).engine.id,
    ENGINE_B,
  );
  // The promotion history is fully auditable in the event stream: the
  // caller's pre-swap and post-swap jobs both completed through the runner.
  const callerCompletions = harness.sink.completions.filter(
    (event) => (event.jobId as string).startsWith("job:domain-"),
  );
  assert.deepEqual(
    callerCompletions.map((event) => event.record.engineId),
    [ENGINE_A, ENGINE_B, ENGINE_A],
  );
  assert.equal(callerCompletions[0]?.record.recordedAt, FIXED_CLOCK());
});
