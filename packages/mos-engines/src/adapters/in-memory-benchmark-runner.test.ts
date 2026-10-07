/**
 * In-memory benchmark runner tests (ENG-004): the golden-corpus benchmark
 * round-trip through the REAL ENG-003 sandbox (every corpus case is an
 * EngineJob — lifecycle events prove it), the frozen EngineBenchmark
 * record shape (all ten required fields), metrics/cost/latency
 * aggregation, determinism (same corpus + engine + seed → the same
 * record), the honest verdicts for wrong-output and all-failing engines,
 * and the fail-closed operational errors. Corpus versioning behavior
 * lives in the corpus-registry tests at the bottom.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { assertRequiredFields } from "@mos/contracts";
import type {
  ArtifactRef,
  Engine,
  EngineJob,
  EngineJobId,
  ResourceLimits,
  Timestamp,
  Version,
} from "@mos/contracts";

import { createInMemoryEngineRegistry } from "./in-memory-engine-registry.js";
import { createInMemoryEngineRunner } from "./in-memory-engine-runner.js";
import { createInMemoryBenchmarkRunner } from "./in-memory-benchmark-runner.js";
import { createInMemoryBenchmarkCorpusRegistry } from "./in-memory-benchmark-corpus-registry.js";
import { makeEngineManifest } from "../fixtures/test-engine-manifests.js";
import { createInMemoryArtifactStore } from "../test-doubles/in-memory-artifact-store.js";
import { createInMemoryJobEventSink } from "../test-doubles/in-memory-job-event-sink.js";
import { createSandboxAwareTestAdapter } from "../test-doubles/sandbox-aware-test-adapter.js";
import { createDisclosedBenchmarkEvaluator } from "../test-doubles/disclosed-benchmark-evaluator.js";
import type {
  BenchmarkCorpus,
  BenchmarkRunInput,
} from "../ports/benchmark.port.js";
import { BenchmarkError } from "../domain/errors.js";

const FIXED_CLOCK = () => "2026-01-01T00:00:00.000Z" as Timestamp;
const ENGINE_ID = "engine:bench-alpha" as Engine["id"];
const CAPABILITY_ID = "semantic_video_relevance" as EngineJob["capabilityId"];
const EVALUATOR_REF = "evaluator:golden-digest@1" as BenchmarkCorpus["evaluatorRef"];
const LIMITS: ResourceLimits = {
  cpuCores: 2,
  gpuUnits: 1,
  memoryMb: 4096,
  timeoutMs: 60000,
};

function makeInputRef(n: number): ArtifactRef {
  return {
    artifactId: `artifact:bench-input-${n}` as ArtifactRef["artifactId"],
    version: 1 as ArtifactRef["version"],
    tenantId: "tenant:bench" as ArtifactRef["tenantId"],
    digest: `sha256:bench-input-${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://bench-${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:bench" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:bench" as ArtifactRef["provenanceRef"],
  };
}

interface BenchHarness {
  readonly benchmarkRunner: ReturnType<typeof createInMemoryBenchmarkRunner>;
  readonly registry: ReturnType<typeof createInMemoryEngineRegistry>;
  readonly runner: ReturnType<typeof createInMemoryEngineRunner>;
  readonly store: ReturnType<typeof createInMemoryArtifactStore>;
  readonly sink: ReturnType<typeof createInMemoryJobEventSink>;
  readonly evaluator: ReturnType<typeof createDisclosedBenchmarkEvaluator>;
}

function createBenchHarness(
  options: {
    readonly adapterTag?: string;
    readonly adapterFailure?: boolean;
    readonly manifestOverrides?: Partial<Engine>;
  } = {},
): BenchHarness {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const store = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  const sink = createInMemoryJobEventSink();
  store.registerArtifact(makeInputRef(1), new TextEncoder().encode("alpha-frame"));
  store.registerArtifact(makeInputRef(2), new TextEncoder().encode("beta-frame"));

  registry.registerEngine(
    makeEngineManifest({
      id: ENGINE_ID as string,
      ...options.manifestOverrides,
    }),
  );

  let wallClock = 0;
  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore: store,
    eventSink: sink,
    clock: FIXED_CLOCK,
    now: () => (wallClock += 10),
  });
  runner.registerAdapter(
    createSandboxAwareTestAdapter({
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      modelIdentity: "checkpoint:bench/alpha@1",
      implementationTag: options.adapterTag ?? "alpha",
      workMsPerInput: 10,
      costPerInvocation: { amount: 0.01, currency: "USD" },
      ...(options.adapterFailure === true
        ? {
            failure: {
              code: "engine-broken",
              message: "disclosed failure double",
              retriable: false,
            },
          }
        : {}),
    }),
  );

  const evaluator = createDisclosedBenchmarkEvaluator({
    evaluatorRef: EVALUATOR_REF,
    evaluatorVersion: 1 as Version,
  });
  const benchmarkRunner = createInMemoryBenchmarkRunner({ registry, runner });

  return { benchmarkRunner, registry, runner, store, sink, evaluator };
}

/** Golden capture: run the engine over the corpus inputs, collect outputs. */
async function captureGoldenOutputs(
  harness: BenchHarness,
): Promise<readonly ArtifactRef[]> {
  const outputs: ArtifactRef[] = [];
  for (const n of [1, 2]) {
    const result = await harness.runner.submit({
      id: `job:capture-${n}` as EngineJobId,
      capabilityId: CAPABILITY_ID,
      capabilityVersion: 1 as Version,
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      inputArtifactRefs: [makeInputRef(n)],
      parameters: {},
      seed: 7,
      resourceLimits: { ...LIMITS },
      outputContract: { type: "object" },
    });
    assert.equal(result.failure, null);
    outputs.push(...result.outputArtifactRefs);
  }
  return outputs;
}

async function makeCorpus(harness: BenchHarness): Promise<BenchmarkCorpus> {
  const expected = await captureGoldenOutputs(harness);
  return {
    id: "corpus:golden" as BenchmarkCorpus["id"],
    version: 1 as Version,
    capabilityId: CAPABILITY_ID,
    capabilityVersion: 1 as Version,
    evaluatorRef: EVALUATOR_REF,
    cases: [
      {
        caseId: "case-1",
        inputArtifactRefs: [makeInputRef(1)],
        expectedOutputArtifactRefs: [expected[0] as ArtifactRef],
      },
      {
        caseId: "case-2",
        inputArtifactRefs: [makeInputRef(2)],
        expectedOutputArtifactRefs: [expected[1] as ArtifactRef],
      },
    ],
    metadata: { origin: "golden-capture", caseCount: 2 },
  };
}

function benchmarkInput(
  corpus: BenchmarkCorpus,
  overrides: Partial<BenchmarkRunInput> = {},
): BenchmarkRunInput {
  return {
    corpus,
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    evaluator: createDisclosedBenchmarkEvaluator({
      evaluatorRef: EVALUATOR_REF,
      evaluatorVersion: 1 as Version,
    }),
    seed: 7,
    resourceLimits: { ...LIMITS },
    ...overrides,
  };
}

test("benchmark round-trip: full EngineBenchmark record, real sandbox jobs, aggregated cost/latency", async () => {
  const harness = createBenchHarness();
  const corpus = await makeCorpus(harness);
  const record = await harness.benchmarkRunner.run(benchmarkInput(corpus));

  assert.doesNotThrow(() => assertRequiredFields(record, "EngineBenchmark"));
  assert.equal(record.result, "passed");
  assert.deepEqual(record.metrics, {
    score: 1,
    matchedCases: 2,
    totalCases: 2,
    successfulRuns: 2,
  });
  assert.deepEqual(record.cost, { amount: 0.02, currency: "USD" });
  assert.equal(record.latency, 20); // 2 cases × 1 input × 10ms work
  assert.equal(record.licenseStatus, "cleared");
  assert.equal(record.capabilityVersion, 1);
  assert.equal(record.engineVersion, 1);
  assert.equal(record.benchmarkCorpusRef, corpus.id);
  assert.equal(record.evaluatorVersion, 1);
  assert.equal(
    record.id,
    "benchmark:corpus:golden@1:engine:bench-alpha@1:e1",
  );

  // The corpus cases genuinely ran through the REAL runner: lifecycle
  // events exist for the deterministic benchmark job ids.
  const jobIds = harness.sink.events.map((event) => event.jobId as string);
  assert.ok(jobIds.includes("job:benchmark:corpus:golden@1:engine:bench-alpha@1:case-1"));
  assert.ok(jobIds.includes("job:benchmark:corpus:golden@1:engine:bench-alpha@1:case-2"));
  const benchmarkCompletions = harness.sink.completions.filter((event) =>
    (event.jobId as string).startsWith("job:benchmark:"),
  );
  assert.equal(benchmarkCompletions.length, 2);
  for (const completion of benchmarkCompletions) {
    assert.equal(completion.type, "job-succeeded");
    assert.equal(completion.record.lifecycle, "succeeded");
  }
});

test("determinism: same corpus + engine + seed → the same benchmark record", async () => {
  const harness = createBenchHarness();
  const corpus = await makeCorpus(harness);
  const first = await harness.benchmarkRunner.run(benchmarkInput(corpus));
  const second = await harness.benchmarkRunner.run(benchmarkInput(corpus));
  assert.deepEqual(first, second);
});

test("wrong-output engine → benchmark result failed, score < 1 (replacement candidate rejected)", async () => {
  // Corpus captured from implementation "alpha"...
  const captureHarness = createBenchHarness({ adapterTag: "alpha" });
  const corpus = await makeCorpus(captureHarness);
  // ...benchmarked against a DIFFERENT implementation "gamma" whose output
  // bytes (and therefore digests) differ: the golden corpus does not match.
  const wrongHarness = createBenchHarness({ adapterTag: "gamma" });
  const record = await wrongHarness.benchmarkRunner.run(benchmarkInput(corpus));

  assert.equal(record.result, "failed");
  assert.equal(record.metrics.score, 0);
  assert.equal(record.metrics.matchedCases, 0);
  assert.equal(record.metrics.successfulRuns, 2);
});

test("all-failing engine → inconclusive (no evidence, honest verdict)", async () => {
  // Golden corpus captured from a HEALTHY engine, then benchmarked against
  // an engine whose every invocation fails: no case produced evidence.
  const captureHarness = createBenchHarness();
  const corpus = await makeCorpus(captureHarness);
  const brokenHarness = createBenchHarness({ adapterFailure: true });
  const record = await brokenHarness.benchmarkRunner.run(benchmarkInput(corpus));
  assert.equal(record.result, "inconclusive");
  assert.equal(record.metrics.successfulRuns, 0);
  assert.equal(record.metrics.score, 0);
});

test("non-deterministic engine cannot be golden-benchmarked: seeded jobs fail, verdict inconclusive", async () => {
  const captureHarness = createBenchHarness();
  const corpus = await makeCorpus(captureHarness);
  const nonDeterministicHarness = createBenchHarness({
    manifestOverrides: { deterministic: false },
  });
  const record = await nonDeterministicHarness.benchmarkRunner.run(benchmarkInput(corpus));
  assert.equal(record.result, "inconclusive");
  // Every benchmark job failed with the seed policy violation.
  const failures = nonDeterministicHarness.sink.completions
    .filter((event) => (event.jobId as string).startsWith("job:benchmark:"))
    .map((event) => event.record.failure?.code);
  assert.deepEqual(failures, ["seed-not-supported", "seed-not-supported"]);
});

test("contract-shape evaluator mode: different implementations pass the same type-level goldens", async () => {
  // A capability-level golden corpus (handcrafted ground truth: one video
  // output per case) scored by the DISCLOSED contract-shape evaluator:
  // genuinely different implementations ("alpha" vs "gamma" produce
  // different digests) both PASS — the digest-exact mode would fail gamma.
  const alphaHarness = createBenchHarness({ adapterTag: "alpha" });
  const gammaHarness = createBenchHarness({ adapterTag: "gamma" });

  const shapeEvaluator = () =>
    createDisclosedBenchmarkEvaluator({
      evaluatorRef: EVALUATOR_REF,
      evaluatorVersion: 1 as Version,
      mode: "contract-shape",
    });
  const corpus: BenchmarkCorpus = {
    id: "corpus:golden-shape" as BenchmarkCorpus["id"],
    version: 1 as Version,
    capabilityId: CAPABILITY_ID,
    capabilityVersion: 1 as Version,
    evaluatorRef: EVALUATOR_REF,
    cases: [1, 2].map((n) => ({
      caseId: `case-${n}`,
      inputArtifactRefs: [makeInputRef(n)],
      expectedOutputArtifactRefs: [makeInputRef(n + 10)], // type-level golden
    })),
  };
  const run = (harness: typeof alphaHarness) =>
    harness.benchmarkRunner.run({
      corpus,
      engineId: ENGINE_ID,
      engineVersion: 1 as Version,
      evaluator: shapeEvaluator(),
      seed: 7,
      resourceLimits: { ...LIMITS },
    });

  const alphaRecord = await run(alphaHarness);
  assert.equal(alphaRecord.result, "passed");
  assert.equal(alphaRecord.metrics.score, 1);
  const gammaRecord = await run(gammaHarness);
  assert.equal(gammaRecord.result, "passed");
  assert.equal(gammaRecord.metrics.score, 1);
  // Their outputs really do differ (different implementations):
  assert.notDeepEqual(
    alphaHarness.sink.completions[0]?.record.outputArtifactRefs.map((r) => r.digest),
    gammaHarness.sink.completions[0]?.record.outputArtifactRefs.map((r) => r.digest),
  );
});

test("fail-closed: evaluator mismatch and unregistered engines are typed errors", async () => {
  const harness = createBenchHarness();
  const corpus = await makeCorpus(harness);

  const wrongEvaluator = createDisclosedBenchmarkEvaluator({
    evaluatorRef: "evaluator:other@2" as BenchmarkCorpus["evaluatorRef"],
    evaluatorVersion: 2 as Version,
  });
  await assert.rejects(
    () => harness.benchmarkRunner.run(benchmarkInput(corpus, { evaluator: wrongEvaluator })),
    (error: unknown) =>
      error instanceof BenchmarkError &&
      error.code === "benchmark-evaluator-mismatch",
  );

  await assert.rejects(
    () =>
      harness.benchmarkRunner.run(
        benchmarkInput(corpus, { engineVersion: 9 as Version }),
      ),
    (error: unknown) =>
      error instanceof BenchmarkError &&
      error.code === "benchmark-engine-not-registered",
  );
});

test("corpus registry: versioned immutable corpora, fail-closed validation, exact-version retrieval", () => {
  const registry = createInMemoryBenchmarkCorpusRegistry();
  const corpus: BenchmarkCorpus = {
    id: "corpus:golden@1" as BenchmarkCorpus["id"],
    version: 1 as Version,
    capabilityId: CAPABILITY_ID,
    capabilityVersion: 1 as Version,
    evaluatorRef: EVALUATOR_REF,
    cases: [
      {
        caseId: "case-1",
        inputArtifactRefs: [makeInputRef(1)],
        expectedOutputArtifactRefs: [makeInputRef(1)],
      },
    ],
  };
  registry.registerCorpus(corpus);
  assert.deepEqual(registry.listCorpusVersions(corpus.id), [1]);
  assert.deepEqual(registry.getCorpus(corpus.id, 1 as Version), corpus);
  assert.equal(registry.getCorpus(corpus.id, 2 as Version), undefined);

  // The registry keeps its own frozen snapshot: caller-side mutation of
  // the submitted object never reaches the stored corpus.
  const originalCases = corpus.cases;
  const mutableCorpus = corpus as unknown as { cases: unknown[] };
  mutableCorpus.cases = [];
  assert.equal(registry.getCorpus(corpus.id, 1 as Version)?.cases.length, 1);
  mutableCorpus.cases = originalCases as unknown[];

  // Version 2 coexists; version 1 stays bit-identical.
  registry.registerCorpus({ ...corpus, version: 2 as Version });
  assert.deepEqual(registry.listCorpusVersions(corpus.id), [1, 2]);
  assert.equal(registry.getCorpus(corpus.id, 1 as Version)?.version, 1);

  // Duplicate (id, version) is a typed error.
  assert.throws(
    () => registry.registerCorpus(corpus),
    (error: unknown) =>
      error instanceof BenchmarkError &&
      error.code === "corpus-already-registered",
  );

  // Invalid corpora are rejected naming the violations.
  assert.throws(
    () =>
      registry.registerCorpus({
        ...corpus,
        version: 3 as Version,
        cases: [],
      }),
    (error: unknown) =>
      error instanceof BenchmarkError &&
      error.code === "invalid-benchmark-corpus" &&
      /cases:non-empty/.test(error.message),
  );
  assert.throws(
    () =>
      registry.registerCorpus({
        ...corpus,
        version: 4 as Version,
        cases: [
          {
            caseId: "case-bad",
            inputArtifactRefs: [],
            expectedOutputArtifactRefs: [],
          },
        ],
      }),
    (error: unknown) =>
      error instanceof BenchmarkError &&
      /inputs-non-empty/.test(error.message) &&
      /expected-outputs-non-empty/.test(error.message),
  );
  assert.throws(
    () =>
      registry.registerCorpus({
        ...corpus,
        version: 5 as Version,
        cases: [
          { caseId: "dupe", inputArtifactRefs: [makeInputRef(1)], expectedOutputArtifactRefs: [makeInputRef(1)] },
          { caseId: "dupe", inputArtifactRefs: [makeInputRef(2)], expectedOutputArtifactRefs: [makeInputRef(2)] },
        ],
      }),
    (error: unknown) =>
      error instanceof BenchmarkError && /duplicate-case-id/.test(error.message),
  );
});
