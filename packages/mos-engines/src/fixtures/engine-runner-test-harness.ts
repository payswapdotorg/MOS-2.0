/**
 * Shared test harness for the in-memory engine runner tests (ENG-003).
 *
 * TEST FIXTURES ONLY — no engine claims. Builds the deterministic world the
 * runner sandbox tests bite on: fixed clock, registered sandbox-alpha
 * manifest, seeded in-memory artifact store, recording job-event sink, the
 * DISCLOSED sandbox-aware adapter, and manually-fired deadline timers (so
 * timeout enforcement is deterministic, never wall-clock flaky).
 */

import type {
  ArtifactRef,
  Engine,
  EngineJob,
  EngineJobId,
  EngineResult,
  ResourceLimits,
  Timestamp,
  Version,
} from "@mos/contracts";

import { createInMemoryEngineRegistry } from "../adapters/in-memory-engine-registry.js";
import { createInMemoryEngineRunner } from "../adapters/in-memory-engine-runner.js";
import type { EngineRunnerTimers } from "../adapters/sandbox-seams.js";
import { makeEngineManifest } from "./test-engine-manifests.js";
import { createInMemoryArtifactStore } from "../test-doubles/in-memory-artifact-store.js";
import { createInMemoryJobEventSink } from "../test-doubles/in-memory-job-event-sink.js";
import { createSandboxAwareTestAdapter } from "../test-doubles/sandbox-aware-test-adapter.js";
import type { EngineSandboxContext } from "../ports/engine-runner.port.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";

/** Fixed ISO clock: everything the runner stamps is deterministic. */
export const FIXED_CLOCK = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;

/** The sandbox-alpha engine identity used across the runner tests. */
export const ENGINE_ID = "engine:sandbox-alpha" as Engine["id"];

/** The capability the sandbox-alpha engine declares. */
export const CAPABILITY_ID = "semantic_video_relevance" as EngineJob["capabilityId"];

/** Baseline granted quotas (≥ the manifest's declared profile). */
export const LIMITS: ResourceLimits = {
  cpuCores: 2,
  gpuUnits: 1,
  memoryMb: 4096,
  timeoutMs: 60000,
};

/** One declared job input ref (n-th). */
export function makeInputRef(n: number): ArtifactRef {
  return {
    artifactId: `artifact:input-${n}` as ArtifactRef["artifactId"],
    version: 1 as ArtifactRef["version"],
    tenantId: "tenant:t1" as ArtifactRef["tenantId"],
    digest: `sha256:input-${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://input-${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:input" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:input" as ArtifactRef["provenanceRef"],
  };
}

/** The bytes the seeded artifact store holds for the two job inputs. */
export const INPUT_BYTES: readonly Uint8Array[] = [
  new TextEncoder().encode("frame-one"),
  new TextEncoder().encode("frame-two"),
];

/** A well-formed EngineJob for the sandbox-alpha engine, with overrides. */
export function makeJob(overrides: Partial<EngineJob> = {}): EngineJob {
  return {
    id: "job:runner-1" as EngineJobId,
    capabilityId: CAPABILITY_ID,
    capabilityVersion: 1 as Version,
    engineId: ENGINE_ID,
    engineVersion: 1 as Version,
    inputArtifactRefs: [makeInputRef(1), makeInputRef(2)],
    parameters: {},
    seed: 42,
    resourceLimits: { ...LIMITS },
    outputContract: { type: "object" },
    ...overrides,
  };
}

/** The manually-driven world one runner test needs. */
export interface RunnerHarness {
  readonly runner: ReturnType<typeof createInMemoryEngineRunner>;
  readonly registry: ReturnType<typeof createInMemoryEngineRegistry>;
  readonly store: ReturnType<typeof createInMemoryArtifactStore>;
  readonly sink: ReturnType<typeof createInMemoryJobEventSink>;
  readonly timers: { fireFirst(): void; pendingCount(): number };
  /** Advances the injectable wall clock by 5ms. */
  tick(): void;
}

/**
 * Creates the deterministic runner harness: registry + manifest + seeded
 * store + recording sink + manual deadline timers + the sandbox-aware
 * adapter (or a caller-supplied one).
 */
export function createRunnerHarness(
  options: {
    readonly manifest?: Engine;
    readonly adapter?: EngineAdapter;
    readonly fetchImpl?: (url: string) => Promise<Uint8Array>;
    readonly now?: () => number;
  } = {},
): RunnerHarness {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const store = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  const sink = createInMemoryJobEventSink();
  store.registerArtifact(makeInputRef(1), INPUT_BYTES[0] as Uint8Array);
  store.registerArtifact(makeInputRef(2), INPUT_BYTES[1] as Uint8Array);

  const manifest = options.manifest ?? makeEngineManifest({ id: ENGINE_ID as string });
  registry.registerEngine(manifest);

  const pending: {
    ms: number;
    callback: () => void;
    cancelled: boolean;
  }[] = [];
  const timers: EngineRunnerTimers = {
    set: (ms: number, callback: () => void) => {
      const entry = { ms, callback, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };

  let time = 0;
  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore: store,
    eventSink: sink,
    clock: FIXED_CLOCK,
    now: options.now ?? (() => time),
    timers,
    fetchImpl: options.fetchImpl,
  });
  runner.registerAdapter(
    options.adapter ??
      createSandboxAwareTestAdapter({
        engineId: ENGINE_ID,
        engineVersion: 1 as Version,
        modelIdentity: "checkpoint:test/sandbox-alpha@1",
        implementationTag: "alpha",
      }),
  );

  return {
    runner,
    registry,
    store,
    sink,
    timers: {
      fireFirst() {
        const entry = pending.shift();
        if (entry !== undefined && !entry.cancelled) {
          entry.callback();
        }
      },
      pendingCount() {
        return pending.filter((entry) => !entry.cancelled).length;
      },
    },
    tick() {
      time += 5;
    },
  };
}

/** A full EngineResult echoing the given job (the happy-path record). */
export function successResult(job: EngineJob): EngineResult {
  return {
    jobId: job.id,
    outputArtifactRefs: [],
    metrics: { invocations: 1 },
    provenance: {
      engineId: job.engineId,
      engineVersion: job.engineVersion,
      capabilityId: job.capabilityId,
      capabilityVersion: job.capabilityVersion,
      modelIdentity: null,
      recordedAt: FIXED_CLOCK(),
    },
    duration: 0,
    resourceUsage: { cpuCoreSeconds: 0, gpuUnitSeconds: 0, memoryMbSeconds: 0 },
    cost: { amount: 0, currency: "USD" },
    warnings: [],
    failure: null,
  };
}

/** Captures the sandbox context handed to the adapter, then returns `result`. */
export function createContextCapturingAdapter(
  result: EngineResult,
): EngineAdapter & { capturedContexts: EngineSandboxContext[] } {
  const capturedContexts: EngineSandboxContext[] = [];
  const engineId = ENGINE_ID;
  return {
    engineId,
    engineVersion: 1 as Version,
    capturedContexts,
    async invoke(job: EngineJob, context: EngineSandboxContext): Promise<EngineResult> {
      capturedContexts.push(context);
      return { ...result, jobId: job.id };
    },
  };
}
