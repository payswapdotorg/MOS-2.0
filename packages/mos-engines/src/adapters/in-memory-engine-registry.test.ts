/**
 * In-memory engine registry tests (ENG-001).
 *
 * Covers: registration rules, the FAIL-CLOSED activation evidence gate
 * (missing items named; verdict and policy checks named), and deterministic
 * resolution with the ranked audit trail. Tenant overrides, replacement
 * records, rollback and historical reproducibility live in
 * engine-lifecycle.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  BenchmarkCorpusRef,
  CapabilityId,
  EngineBenchmarkId,
  EngineId,
  EvaluatorRef,
  Timestamp,
  Version,
} from "@mos/contracts";

import { ACTIVATION_EVIDENCE_KEYS } from "../domain/activation.js";
import type { EngineActivationEvidence } from "../domain/activation.js";
import { EngineRegistryError } from "../domain/errors.js";
import { createInMemoryEngineRegistry } from "./in-memory-engine-registry.js";
import {
  makeActivationEvidence,
  makeEngineManifest,
} from "../fixtures/test-engine-manifests.js";

const CAP = "semantic_video_relevance" as CapabilityId;
const FIXED_CLOCK = () => "2026-01-01T00:00:00.000Z" as Timestamp;

function registry() {
  return createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
}

function registerAndActivate(
  engineRegistry: ReturnType<typeof registry>,
  manifest: ReturnType<typeof makeEngineManifest>,
  evidence: EngineActivationEvidence = makeActivationEvidence(manifest),
) {
  engineRegistry.registerEngine(manifest);
  return engineRegistry.activateEngine(
    manifest.id,
    manifest.version,
    evidence,
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test("registration stores the manifest; version history and unknown engines behave", () => {
  const engineRegistry = registry();
  const manifest = makeEngineManifest();
  const result = engineRegistry.registerEngine(manifest);

  assert.equal(result.status, "registered");
  assert.deepEqual(engineRegistry.getEngine(manifest.id, manifest.version), manifest);
  assert.deepEqual(engineRegistry.listEngineVersions(manifest.id), [1]);
  assert.equal(engineRegistry.getEngine("engine:missing" as EngineId, 1 as Version), undefined);
  assert.deepEqual(engineRegistry.listEngineVersions("engine:missing" as EngineId), []);
});

test("duplicate id+version registration is rejected", () => {
  const engineRegistry = registry();
  const manifest = makeEngineManifest();
  engineRegistry.registerEngine(manifest);
  assert.throws(
    () => engineRegistry.registerEngine(manifest),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "engine-already-registered",
  );
});

test("invalid manifests are rejected at the registration gate (named fields)", () => {
  const engineRegistry = registry();
  const broken = {
    id: "engine:broken",
    version: 1,
    // everything else missing
  } as unknown as ReturnType<typeof makeEngineManifest>;
  assert.throws(
    () => engineRegistry.registerEngine(broken),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "invalid-engine-manifest" &&
      /missing required fields/.test(error.message),
  );
});

test("registered is not activated: resolution fails closed before activation", () => {
  const engineRegistry = registry();
  engineRegistry.registerEngine(makeEngineManifest());
  assert.throws(
    () => engineRegistry.resolveCapability(CAP),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "no-activatable-engine",
  );
});

// ---------------------------------------------------------------------------
// Activation gate — fail-closed, named items
// ---------------------------------------------------------------------------

test("activation with empty evidence is rejected naming ALL nine required items", () => {
  const engineRegistry = registry();
  const manifest = makeEngineManifest();
  engineRegistry.registerEngine(manifest);

  const result = engineRegistry.activateEngine(manifest.id, manifest.version, {});
  assert.equal(result.activated, false);
  assert.deepEqual([...result.missingEvidence], [...ACTIVATION_EVIDENCE_KEYS]);
  assert.deepEqual(result.missingEvidence, [
    "manifestValidation",
    "capabilityContractTests",
    "goldenCorpusBenchmark",
    "evaluatorResult",
    "securitySandboxReview",
    "codeLicenseReview",
    "modelLicenseReview",
    "sourceDataRightsReview",
    "provenanceRecord",
  ]);
  assert.equal(engineRegistry.listActivatedEngines().length, 0);
});

test("activation with one missing evidence item names exactly that item", () => {
  for (const key of ACTIVATION_EVIDENCE_KEYS) {
    const engineRegistry = registry();
    const manifest = makeEngineManifest();
    engineRegistry.registerEngine(manifest);
    const evidence = makeActivationEvidence(manifest);
    const partial = { ...evidence } as Record<string, unknown>;
    delete partial[key];

    const result = engineRegistry.activateEngine(
      manifest.id,
      manifest.version,
      partial,
    );
    assert.equal(result.activated, false, `key ${key}`);
    assert.deepEqual(result.missingEvidence, [key], `key ${key}`);
    assert.equal(engineRegistry.listActivatedEngines().length, 0, `key ${key}`);
  }
});

test("activation fails closed on non-concluding verdicts (named checks)", () => {
  const cases: readonly [string, Partial<EngineActivationEvidence>][] = [
    ["evaluatorResult:not-passed", { evaluatorResult: { evaluator: "evaluator:golden@1" as EvaluatorRef, verdict: "fail", reportRef: "r" } }],
    ["goldenCorpusBenchmark:not-passed", { goldenCorpusBenchmark: { benchmarkId: "benchmark:x" as EngineBenchmarkId, result: "inconclusive" } }],
    ["securitySandboxReview:not-passed", { securitySandboxReview: { reviewedAt: FIXED_CLOCK(), reviewer: "sec", verdict: "fail", sandboxReportRef: "r" } }],
    ["codeLicenseReview:not-cleared", { codeLicenseReview: { reviewedAt: FIXED_CLOCK(), reviewer: "legal", verdict: "review-required", reportRef: "r" } }],
    ["modelLicenseReview:not-cleared", { modelLicenseReview: { reviewedAt: FIXED_CLOCK(), reviewer: "legal", verdict: "blocked", reportRef: "r" } }],
    ["sourceDataRightsReview:not-cleared", { sourceDataRightsReview: { reviewedAt: FIXED_CLOCK(), reviewer: "legal", verdict: "review-required", reportRef: "r" } }],
  ];
  for (const [expectedCheck, overrides] of cases) {
    const engineRegistry = registry();
    const manifest = makeEngineManifest();
    engineRegistry.registerEngine(manifest);
    const result = engineRegistry.activateEngine(
      manifest.id,
      manifest.version,
      makeActivationEvidence(manifest, overrides),
    );
    assert.equal(result.activated, false, expectedCheck);
    assert.ok(
      result.failedChecks.includes(expectedCheck),
      `expected ${expectedCheck} in ${JSON.stringify(result.failedChecks)}`,
    );
    assert.deepEqual(result.missingEvidence, []);
  }
});

test("activation fails closed when declared capabilities lack contract tests (named)", () => {
  const engineRegistry = registry();
  const manifest = makeEngineManifest({
    capabilityIds: [CAP, "detect_scenes"],
  });
  engineRegistry.registerEngine(manifest);
  // Evidence covers only CAP, not detect_scenes.
  const result = engineRegistry.activateEngine(
    manifest.id,
    manifest.version,
    makeActivationEvidence(manifest, {
      capabilityContractTests: [
        { capabilityId: CAP, capabilityVersion: 1 as Version, verdict: "compatible", testReportRef: "r" },
      ],
    }),
  );
  assert.equal(result.activated, false);
  assert.ok(
    result.failedChecks.includes("capabilityContractTests:missing:detect_scenes"),
    JSON.stringify(result.failedChecks),
  );
});

test("activation fails closed on an incompatible contract verdict (named capability)", () => {
  const engineRegistry = registry();
  const manifest = makeEngineManifest();
  engineRegistry.registerEngine(manifest);
  const result = engineRegistry.activateEngine(
    manifest.id,
    manifest.version,
    makeActivationEvidence(manifest, {
      capabilityContractTests: [
        { capabilityId: CAP, capabilityVersion: 1 as Version, verdict: "incompatible", testReportRef: "r" },
      ],
    }),
  );
  assert.equal(result.activated, false);
  assert.ok(
    result.failedChecks.includes(`capabilityContractTests:incompatible:${CAP as string}`),
    JSON.stringify(result.failedChecks),
  );
});

test("activation fails closed on forbidden manifest posture (named checks)", () => {
  const cases: readonly [string, ReturnType<typeof makeEngineManifest>][] = [
    ["security:sandbox-required", makeEngineManifest({
      security: {
        sandboxed: false,
        networkAccess: "denied",
        filesystemScope: "scoped-artifacts-only",
        databaseCredentials: "none",
        providerCredentials: "none",
      },
    })],
    ["security:provider-credentials-forbidden", makeEngineManifest({
      security: {
        sandboxed: true,
        networkAccess: "denied",
        filesystemScope: "scoped-artifacts-only",
        databaseCredentials: "none",
        providerCredentials: "injected",
      },
    })],
    ["license:blocked-layer", makeEngineManifest({
      license: {
        code: { identifier: "MIT", status: "cleared" },
        model: { identifier: "unknown", status: "blocked" },
        data: { identifier: "CC-BY-4.0", status: "cleared" },
      },
    })],
    ["benchmark:not-passed", makeEngineManifest({
      benchmark: {
        id: "benchmark:engine:test-alpha@1" as EngineBenchmarkId,
        capabilityVersion: 1 as Version,
        engineVersion: 1 as Version,
        benchmarkCorpusRef: "corpus:golden@1" as BenchmarkCorpusRef,
        evaluatorVersion: 1 as Version,
        metrics: { score: 0.8 },
        cost: { amount: 0.01, currency: "USD" },
        latency: 1000,
        licenseStatus: "cleared",
        result: "failed",
      },
    })],
  ];
  for (const [expectedCheck, manifest] of cases) {
    const engineRegistry = registry();
    engineRegistry.registerEngine(manifest);
    const result = engineRegistry.activateEngine(
      manifest.id,
      manifest.version,
      makeActivationEvidence(manifest),
    );
    assert.equal(result.activated, false, expectedCheck);
    assert.ok(
      result.failedChecks.includes(expectedCheck),
      `expected ${expectedCheck} in ${JSON.stringify(result.failedChecks)}`,
    );
  }
});

test("activation of an unknown engine or version throws", () => {
  const engineRegistry = registry();
  assert.throws(
    () =>
      engineRegistry.activateEngine("engine:missing" as EngineId, 1 as Version, makeActivationEvidence(makeEngineManifest())),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "unknown-engine",
  );
  engineRegistry.registerEngine(makeEngineManifest());
  assert.throws(
    () => engineRegistry.activateEngine("engine:test-alpha" as EngineId, 9 as Version, {}),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "unknown-engine",
  );
});

test("full evidence chain activates; sole candidate resolves with ranked audit trail", () => {
  const engineRegistry = registry();
  const manifest = makeEngineManifest();
  const result = registerAndActivate(engineRegistry, manifest);

  assert.equal(result.activated, true);
  assert.deepEqual(engineRegistry.listActivatedEngines(CAP), [manifest]);

  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.resolvedVia, "deterministic-tie-break");
  assert.equal(resolution.engine.id, manifest.id);
  assert.equal(resolution.decidedBy, undefined); // sole candidate
  assert.equal(resolution.candidates.length, 1);
  assert.equal(resolution.assignment.via, "initial-resolution");
  assert.equal(resolution.assignment.engineVersion, manifest.version);
});

// ---------------------------------------------------------------------------
// Deterministic resolution
// ---------------------------------------------------------------------------

test("resolution is deterministic: engines differing on benchmarkScore rank by score", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", benchmarkScore: 0.9 }));
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:b", benchmarkScore: 0.7 }));

  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.id, "engine:a");
  assert.equal(resolution.decidedBy, "benchmarkScore");
  assert.deepEqual(
    resolution.candidates.map((candidate) => candidate.engineId),
    ["engine:a", "engine:b"],
  );
});

test("resolution applies the full policy order: contract verdict outranks score", () => {
  const engineRegistry = registry();
  registerAndActivate(
    engineRegistry,
    makeEngineManifest({ id: "engine:a", benchmarkScore: 0.6 }),
  );
  registerAndActivate(
    engineRegistry,
    makeEngineManifest({ id: "engine:b", benchmarkScore: 0.95 }),
    makeActivationEvidence(makeEngineManifest({ id: "engine:b" }), {
      capabilityContractTests: [
        { capabilityId: CAP, capabilityVersion: 1 as Version, verdict: "degraded", testReportRef: "r" },
      ],
    }),
  );

  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.id, "engine:a");
  assert.equal(resolution.decidedBy, "contractCompatibility");
});

test("engines rejected by the gate (incompatible verdict / blocked license) are never resolvable", () => {
  const engineRegistry = registry();

  // An incompatible contract verdict for a declared capability rejects
  // ACTIVATION itself — the engine never becomes a resolution candidate.
  const incompatible = makeEngineManifest({ id: "engine:incompat" });
  engineRegistry.registerEngine(incompatible);
  const incompatibleActivation = engineRegistry.activateEngine(
    incompatible.id,
    incompatible.version,
    makeActivationEvidence(incompatible, {
      capabilityContractTests: [
        { capabilityId: CAP, capabilityVersion: 1 as Version, verdict: "incompatible", testReportRef: "r" },
      ],
    }),
  );
  assert.equal(incompatibleActivation.activated, false);

  // A blocked license layer (§29) likewise rejects activation.
  const blockedLicense = makeEngineManifest({
    id: "engine:blocked-license",
    license: {
      code: { identifier: "MIT", status: "cleared" },
      model: { identifier: "unknown", status: "blocked" },
      data: { identifier: "CC-BY-4.0", status: "cleared" },
    },
  });
  engineRegistry.registerEngine(blockedLicense);
  const blockedActivation = engineRegistry.activateEngine(
    blockedLicense.id,
    blockedLicense.version,
    makeActivationEvidence(blockedLicense),
  );
  assert.equal(blockedActivation.activated, false);
  assert.ok(blockedActivation.failedChecks.includes("license:blocked-layer"));

  // Neither rejected engine is activatable or resolvable.
  assert.equal(engineRegistry.listActivatedEngines().length, 0);
  assert.throws(
    () => engineRegistry.resolveCapability(CAP),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "no-activatable-engine",
  );

  // A compliant engine activates and resolves alone: the rejected ones stay
  // excluded from the candidate ranking (defense in depth — resolution
  // also independently excludes incompatible/blocked engines).
  const good = makeEngineManifest({ id: "engine:good", benchmarkScore: 0.5 });
  engineRegistry.registerEngine(good);
  engineRegistry.activateEngine(good.id, good.version, makeActivationEvidence(good));
  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.id, "engine:good");
  assert.deepEqual(
    resolution.candidates.map((candidate) => candidate.engineId),
    ["engine:good"],
  );
});

test("resolution fails closed for capabilities no engine declares", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest());
  assert.throws(
    () => engineRegistry.resolveCapability("generate_video" as CapabilityId),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "no-activatable-engine",
  );
});

