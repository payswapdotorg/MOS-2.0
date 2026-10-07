/**
 * Shared harness for the ENG-005 engine replacement / rollback proof tests.
 *
 * TEST FIXTURES ONLY — no engine claims. This file builds the repeatable
 * replacement scenario world (spec/mos-engine-policy-v2.0.yaml
 * `replacement`; spec/mos-effective-backlog-v2.0.md ENG-005 acceptance:
 * "swap implementation without domain changes; historical runs retain
 * engine identity"):
 *
 * - a golden corpus for one capability contract whose expected outputs are
 *   HANDCRAFTED ground truth (type-level goldens, scored by the DISCLOSED
 *   contract-shape evaluator — genuinely different implementations can
 *   pass the same goldens);
 * - `promoteEngine`: the honest benchmark-before-promotion sequence —
 *   candidate registration (pending benchmark) → REAL golden-corpus
 *   benchmark through the ENG-003 sandbox → production manifest embedding
 *   the frozen EngineBenchmark record → activation with evidence derived
 *   from that record → executable adapter registration;
 * - `executeCapability`: THE DOMAIN-STYLE CALLER — written once, asks for
 *   the CAPABILITY (never an engine), builds the EngineJob from whatever
 *   the registry resolves, submits it through the sandbox. Both the
 *   pre-swap and post-swap executions in the proof tests call this one
 *   function unchanged: that IS the "without domain-code changes" claim.
 */

import type {
  ArtifactRef,
  BenchmarkCorpusRef,
  CapabilityId,
  Engine,
  EngineBenchmark,
  EngineBenchmarkId,
  EngineId,
  EngineJob,
  EngineJobId,
  EvaluatorRef,
  MoneyAmount,
  ResourceLimits,
  Timestamp,
  Version,
} from "@mos/contracts";

import { createInMemoryEngineRegistry } from "../adapters/in-memory-engine-registry.js";
import { createInMemoryEngineRunner } from "../adapters/in-memory-engine-runner.js";
import { createInMemoryBenchmarkRunner } from "../adapters/in-memory-benchmark-runner.js";
import { createInMemoryBenchmarkCorpusRegistry } from "../adapters/in-memory-benchmark-corpus-registry.js";
import {
  makeActivationEvidence,
  makeEngineManifest,
} from "./test-engine-manifests.js";
import { createInMemoryArtifactStore } from "../test-doubles/in-memory-artifact-store.js";
import { createInMemoryJobEventSink } from "../test-doubles/in-memory-job-event-sink.js";
import { createSandboxAwareTestAdapter } from "../test-doubles/sandbox-aware-test-adapter.js";
import { createDisclosedBenchmarkEvaluator } from "../test-doubles/disclosed-benchmark-evaluator.js";
import { goldenCorpusEvidenceFromBenchmark } from "../domain/benchmark-evidence.js";
import type { BenchmarkCorpus } from "../ports/benchmark.port.js";

export const FIXED_CLOCK = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;

/** The capability contract every engine in the proof implements. */
export const CAPABILITY_ID = "semantic_video_relevance" as CapabilityId;
export const CAPABILITY_VERSION = 1 as Version;

/** The one golden corpus for the capability (type-level ground truth). */
export const CORPUS_ID = "corpus:golden-relevance" as BenchmarkCorpusRef;
export const EVALUATOR_REF = "evaluator:contract-shape@1" as EvaluatorRef;

/** Quotas granted to every job in the proof (≥ every manifest profile). */
export const LIMITS: ResourceLimits = {
  cpuCores: 2,
  gpuUnits: 1,
  memoryMb: 4096,
  timeoutMs: 60000,
};

/** The seed every caller job uses (determinism → reproducibility). */
export const CALLER_SEED = 11;

function inputRef(n: number): ArtifactRef {
  return {
    artifactId: `artifact:proof-input-${n}` as ArtifactRef["artifactId"],
    version: 1 as ArtifactRef["version"],
    tenantId: "tenant:proof" as ArtifactRef["tenantId"],
    digest: `sha256:proof-input-${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://proof-input-${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:proof" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:proof" as ArtifactRef["provenanceRef"],
  };
}

/** Handcrafted ground-truth expected output (a type-level golden). */
function groundTruthRef(n: number): ArtifactRef {
  return {
    artifactId: `artifact:golden-${n}` as ArtifactRef["artifactId"],
    version: 1 as ArtifactRef["version"],
    tenantId: "tenant:proof" as ArtifactRef["tenantId"],
    digest: `sha256:golden-${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://golden-${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:proof" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:proof" as ArtifactRef["provenanceRef"],
  };
}

/** The two job inputs every caller run consumes. */
export const PROOF_INPUTS: readonly ArtifactRef[] = [inputRef(1), inputRef(2)];

const GOLDEN_CORPUS: BenchmarkCorpus = {
  id: CORPUS_ID,
  version: 1 as Version,
  capabilityId: CAPABILITY_ID,
  capabilityVersion: CAPABILITY_VERSION,
  evaluatorRef: EVALUATOR_REF,
  cases: [
    {
      caseId: "case-1",
      inputArtifactRefs: [inputRef(1)],
      expectedOutputArtifactRefs: [groundTruthRef(1)],
    },
    {
      caseId: "case-2",
      inputArtifactRefs: [inputRef(2)],
      expectedOutputArtifactRefs: [groundTruthRef(2)],
    },
  ],
  metadata: { origin: "human-vetted-golden-corpus", caseCount: 2 },
};

/** The world one replacement-proof test runs in. */
export interface ReplacementHarness {
  readonly registry: ReturnType<typeof createInMemoryEngineRegistry>;
  readonly corpora: ReturnType<typeof createInMemoryBenchmarkCorpusRegistry>;
  readonly runner: ReturnType<typeof createInMemoryEngineRunner>;
  readonly benchmarkRunner: ReturnType<typeof createInMemoryBenchmarkRunner>;
  readonly evaluator: ReturnType<typeof createDisclosedBenchmarkEvaluator>;
  readonly sink: ReturnType<typeof createInMemoryJobEventSink>;
  readonly store: ReturnType<typeof createInMemoryArtifactStore>;
  readonly corpus: BenchmarkCorpus;
}

/** Builds the replacement-proof world (registry + sandbox + benchmark). */
export function createReplacementHarness(): ReplacementHarness {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const store = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  const sink = createInMemoryJobEventSink();
  store.registerArtifact(inputRef(1), new TextEncoder().encode("gold-frame-one"));
  store.registerArtifact(inputRef(2), new TextEncoder().encode("gold-frame-two"));

  const corpora = createInMemoryBenchmarkCorpusRegistry();
  corpora.registerCorpus(GOLDEN_CORPUS);

  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore: store,
    eventSink: sink,
    clock: FIXED_CLOCK,
    now: () => 0, // deterministic wall clock (quota windows + durations)
  });
  const benchmarkRunner = createInMemoryBenchmarkRunner({ registry, runner });
  const evaluator = createDisclosedBenchmarkEvaluator({
    evaluatorRef: EVALUATOR_REF,
    evaluatorVersion: 1 as Version,
    mode: "contract-shape",
  });

  return {
    registry,
    corpora,
    runner,
    benchmarkRunner,
    evaluator,
    sink,
    store,
    corpus: GOLDEN_CORPUS,
  };
}

/** One engine implementation promoted through the full policy sequence. */
export interface PromotedEngine {
  readonly manifest: Engine;
  readonly benchmark: EngineBenchmark;
}

/**
 * The honest promotion sequence (benchmarkBeforePromotion):
 *
 * 1. CANDIDATE registration under a candidate id with a PENDING benchmark
 *    record (`result: "inconclusive"`) — the candidate cannot activate
 *    (the gate rejects non-passed benchmarks by name; the caller pins this
 *    separately for the replacement engine).
 * 2. The REAL golden-corpus benchmark through the ENG-003 sandbox: every
 *    corpus case is an EngineJob executed by the candidate's adapter.
 * 3. The PRODUCTION manifest (same version number) embedding the FROZEN
 *    EngineBenchmark record the run produced. The record honestly names
 *    the candidate evaluation registration that produced it (the gate
 *    cross-checks the record's engine VERSION, result and identity vs the
 *    cited evidence).
 * 4. Activation with the full evidence chain, its goldenCorpusBenchmark
 *    evidence derived from the REAL record via
 *    goldenCorpusEvidenceFromBenchmark (the ENG-004 → ENG-001 wiring).
 * 5. Registration of the executable adapter for the production identity.
 *
 * When the caller has ALREADY registered the pending candidate manifest
 * (to pin the pre-benchmark activation rejection), pass it via
 * `candidateAlreadyRegistered` — the candidate registration is skipped.
 */
export async function promoteEngine(
  harness: ReplacementHarness,
  spec: {
    readonly engineId: string;
    readonly version: number;
    readonly implementationTag: string;
    readonly modelIdentity: string;
    readonly costPerInvocation: MoneyAmount;
  },
  options: { readonly candidateAlreadyRegistered?: Engine } = {},
): Promise<PromotedEngine> {
  const version = spec.version as Version;
  const candidateId = `${spec.engineId}:candidate` as EngineId;

  // 1. Candidate registration with a pending benchmark record.
  const pending: EngineBenchmark = {
    id: `benchmark:pending:${candidateId as string}@${spec.version}` as EngineBenchmarkId,
    capabilityVersion: CAPABILITY_VERSION,
    engineVersion: version,
    benchmarkCorpusRef: CORPUS_ID,
    evaluatorVersion: 1 as Version,
    metrics: { score: 0 },
    cost: { amount: 0, currency: "USD" },
    latency: 0,
    licenseStatus: "review-required", // placeholder; rejected on result anyway
    result: "inconclusive",
  };
  const candidateManifest = makeEngineManifest({
    id: candidateId as string,
    version: spec.version,
    benchmark: pending,
  });
  if (options.candidateAlreadyRegistered === undefined) {
    harness.registry.registerEngine(candidateManifest);
  }
  harness.runner.registerAdapter(
    createSandboxAwareTestAdapter({
      engineId: candidateId,
      engineVersion: version,
      modelIdentity: spec.modelIdentity,
      implementationTag: spec.implementationTag,
      costPerInvocation: spec.costPerInvocation,
    }),
  );

  // 2. The real benchmark through the sandbox.
  const benchmark = await harness.benchmarkRunner.run({
    corpus: harness.corpus,
    engineId: candidateId,
    engineVersion: version,
    evaluator: harness.evaluator,
    seed: 7,
    resourceLimits: LIMITS,
  });
  if (benchmark.result !== "passed") {
    throw new Error(
      `candidate ${spec.engineId as string}@${spec.version} did not pass the golden corpus (${benchmark.result}); promotion refused`,
    );
  }

  // 3. Production manifest embedding the frozen benchmark record.
  const manifest = makeEngineManifest({
    id: spec.engineId,
    version: spec.version,
    benchmark,
  });
  harness.registry.registerEngine(manifest);

  // 4. Activation with evidence derived from the REAL record.
  const activation = harness.registry.activateEngine(
    manifest.id,
    manifest.version,
    {
      ...makeActivationEvidence(manifest),
      goldenCorpusBenchmark: goldenCorpusEvidenceFromBenchmark(benchmark),
    },
  );
  if (!activation.activated) {
    throw new Error(
      `activation of ${spec.engineId as string}@${spec.version} was rejected: ${[...activation.failedChecks].join(", ")}`,
    );
  }

  // 5. The executable adapter for the production identity.
  harness.runner.registerAdapter(
    createSandboxAwareTestAdapter({
      engineId: manifest.id,
      engineVersion: manifest.version,
      modelIdentity: spec.modelIdentity,
      implementationTag: spec.implementationTag,
      costPerInvocation: spec.costPerInvocation,
    }),
  );

  return { manifest, benchmark };
}

/** One caller run: the resolution it used, the job it built, the result. */
export interface CallerRun {
  readonly resolution: ReturnType<ReplacementHarness["registry"]["resolveCapability"]>;
  readonly job: EngineJob;
  readonly result: Awaited<ReturnType<ReplacementHarness["runner"]["submit"]>>;
}

/**
 * THE DOMAIN-STYLE CALLER — the acceptance core of ENG-005.
 *
 * Written ONCE. It asks the registry for the CAPABILITY (it never names an
 * engine), builds the EngineJob from whatever engine the registry resolves,
 * and submits it through the sandbox runner. When the registry switches the
 * engine (explicit replacement, version bump, rollback), this function's
 * code is NOT touched — the proof tests call this exact function before and
 * after the switch.
 */
export async function executeCapability(
  harness: ReplacementHarness,
  label: string,
): Promise<CallerRun> {
  const resolution = harness.registry.resolveCapability(CAPABILITY_ID);
  const job: EngineJob = {
    id: `job:domain-${label}` as EngineJobId,
    capabilityId: CAPABILITY_ID,
    capabilityVersion: CAPABILITY_VERSION,
    engineId: resolution.engine.id,
    engineVersion: resolution.engine.version,
    inputArtifactRefs: [...PROOF_INPUTS],
    parameters: { treatment: "proof" },
    seed: CALLER_SEED,
    resourceLimits: { ...LIMITS },
    outputContract: resolution.engine.outputContract,
  };
  const result = await harness.runner.submit(job);
  return { resolution, job, result };
}
