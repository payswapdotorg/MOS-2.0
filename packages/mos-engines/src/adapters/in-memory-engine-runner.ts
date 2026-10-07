/**
 * In-memory EngineRunner adapter — the ENG-003 sandbox.
 *
 * Policy-faithful execution of EngineJobs via registered EngineAdapters:
 * resource quotas (validity + adequacy vs the manifest's declared profile
 * + post-flight usage enforcement), the wall-clock deadline (typed
 * `engine-job-timeout` failure with partial metrics), fail-closed network
 * (the sandbox seam + the ambient-fetch guard; denied unless the manifest
 * AND the submission explicitly grant), scoped-artifacts-only filesystem
 * (the job-scoped ArtifactStorePort view), the seed policy
 * (seedRequiredWhenSupported), the full job lifecycle
 * queued→running→succeeded|failed|timed_out with §30 observability
 * records emitted through the JobEventSinkPort seam, and result
 * validation (identity echo, quotas, output scope). Policy breaches are
 * TYPED FAILURES in the EngineResult record — never crashes, never silent
 * successes. Malformed EngineJob input (contract-shape violations) throws
 * fail-closed, matching the adapter contract's precedent.
 *
 * DISCLOSED LIMIT (in-memory adapter): a production runner isolates each
 * engine in a separate process/container (OS-enforced quotas, no ambient
 * globals). This adapter enforces the same POLICY CONTRACT in-process —
 * quota accounting, the timeout race, the network seam and the fetch
 * guard — which is what the frozen runner contract requires the RUNNER
 * itself to guarantee. Durable job persistence is the mos-jobs module's
 * later-wave responsibility (the event sink is the seam).
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  Engine,
  EngineJob,
  EngineResult,
  EngineJobFailure,
  Milliseconds,
  MoneyAmount,
  ResourceUsage,
  RunProvenance,
  Timestamp,
} from "@mos/contracts";

import type { EngineRegistryPort } from "../ports/engine-registry.port.js";
import type {
  EngineJobSubmissionOptions,
  EngineArtifactStorePort,
  EngineRunnerPort,
  EngineSandboxContext,
} from "../ports/engine-runner.port.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";
import type {
  EngineRunObservabilityRecord,
  JobEvent,
  JobEventSinkPort,
} from "../ports/job-event-sink.port.js";
import { EngineRegistryError, EngineSandboxViolationError } from "../domain/errors.js";
import {
  effectiveNetworkPolicy,
  invalidResourceLimits,
  manifestPostureViolations,
  quotaDeficitAgainstManifest,
  sandboxFailure,
  seedPolicyViolation,
} from "../domain/sandbox-policy.js";
import { createFetchGuard } from "./fetch-guard.js";
import { createJobScopedArtifactStore } from "./job-scoped-artifact-store.js";
import {
  createSandboxNetwork,
  defaultTimers,
  EngineJobTimeoutSignal,
} from "./sandbox-seams.js";
import type { EngineRunnerTimers } from "./sandbox-seams.js";
import { validateAdapterResult } from "./runner-result-validation.js";

/** Options for the in-memory engine runner. */
export interface InMemoryEngineRunnerOptions {
  /** Manifest authority — every runnable engine must be registered here. */
  readonly registry: EngineRegistryPort;
  /** Backing artifact store (the job-scoped views are carved from it). */
  readonly artifactStore: EngineArtifactStorePort;
  /** Lifecycle/observability event sink (default: no-op, disclosed). */
  readonly eventSink?: JobEventSinkPort;
  /** Injectable wall-clock for ISO stamps (default: real time). */
  readonly clock?: () => Timestamp;
  /** Injectable monotonic milliseconds clock (default: Date.now). */
  readonly now?: () => number;
  /** Injectable timers (default: real setTimeout — tests fire manually). */
  readonly timers?: EngineRunnerTimers;
  /** Transport for explicitly granted network requests. */
  readonly fetchImpl?: (url: string) => Promise<Uint8Array>;
}

const NOOP_SINK: JobEventSinkPort = { onJobEvent: () => undefined };

const ZERO_USAGE: ResourceUsage = {
  cpuCoreSeconds: 0,
  gpuUnitSeconds: 0,
  memoryMbSeconds: 0,
};

const ZERO_COST: MoneyAmount = { amount: 0, currency: "USD" };

/**
 * Creates the in-memory {@link EngineRunnerPort} — the ENG-003 sandbox.
 */
export function createInMemoryEngineRunner(
  options: InMemoryEngineRunnerOptions,
): EngineRunnerPort {
  const registry = options.registry;
  const artifactStore = options.artifactStore;
  const eventSink = options.eventSink ?? NOOP_SINK;
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  const now = options.now ?? Date.now;
  const timers = options.timers ?? defaultTimers;
  const fetchGuard = createFetchGuard();

  /** engine identity key → executable adapter. */
  const adapters = new Map<string, EngineAdapter>();
  const adapterKey = (engineId: string, engineVersion: number): string =>
    `${engineId}@${engineVersion}`;

  function emit(event: JobEvent): void {
    eventSink.onJobEvent(event);
  }

  function jobProvenance(job: EngineJob): RunProvenance {
    return {
      engineId: job.engineId,
      engineVersion: job.engineVersion,
      capabilityId: job.capabilityId,
      capabilityVersion: job.capabilityVersion,
      modelIdentity: null,
      recordedAt: clock(),
    };
  }

  function complete(
    job: EngineJob,
    lifecycle: "succeeded" | "failed" | "timed_out",
    result: EngineResult,
    wallMs: Milliseconds,
  ): EngineResult {
    const record: EngineRunObservabilityRecord = {
      runId: job.id,
      capabilityId: job.capabilityId,
      capabilityVersion: job.capabilityVersion,
      engineId: job.engineId,
      engineVersion: job.engineVersion,
      actor: "engine-runner",
      inputArtifactRefs: job.inputArtifactRefs,
      outputArtifactRefs: result.outputArtifactRefs,
      durationMs: wallMs,
      resourceUsage: result.resourceUsage,
      cost: result.cost,
      warnings: result.warnings,
      failure: result.failure,
      provenance: result.provenance,
      lifecycle,
      recordedAt: clock(),
    };
    emit({
      type:
        lifecycle === "succeeded"
          ? "job-succeeded"
          : lifecycle === "timed_out"
            ? "job-timed-out"
            : "job-failed",
      jobId: job.id,
      record,
    });
    return result;
  }

  /** A failure result built from scratch (nothing ran / nothing trusted). */
  function failedResult(
    job: EngineJob,
    failure: EngineJobFailure,
    provenance: RunProvenance,
    wallMs: Milliseconds,
  ): EngineResult {
    return Object.freeze({
      jobId: job.id,
      outputArtifactRefs: [],
      metrics: {},
      provenance,
      duration: wallMs,
      resourceUsage: ZERO_USAGE,
      cost: ZERO_COST,
      warnings: [],
      failure,
    });
  }

  const runner: EngineRunnerPort = {
    registerAdapter(adapter: EngineAdapter): void {
      if (
        adapter === null ||
        typeof adapter !== "object" ||
        typeof adapter.engineId !== "string" ||
        typeof adapter.engineVersion !== "number" ||
        typeof adapter.invoke !== "function"
      ) {
        throw new EngineRegistryError(
          "invalid-engine-adapter",
          "adapter must carry engineId/engineVersion identity and an invoke(job, context) method",
        );
      }
      const key = adapterKey(adapter.engineId, adapter.engineVersion);
      if (adapters.has(key)) {
        throw new EngineRegistryError(
          "adapter-already-registered",
          `an adapter for ${key} is already registered`,
          { key },
        );
      }
      adapters.set(key, adapter);
    },

    async submit(
      job: EngineJob,
      submissionOptions?: EngineJobSubmissionOptions,
    ): Promise<EngineResult> {
      // Contract shape: fail-closed throw (programming error, named fields).
      assertRequiredFields(job, "EngineJob");

      emit({
        type: "job-queued",
        jobId: job.id,
        engineId: job.engineId,
        engineVersion: job.engineVersion,
        capabilityId: job.capabilityId,
        capabilityVersion: job.capabilityVersion,
        queuedAt: clock(),
      });

      // ---- Pre-flight policy gates (typed failures, adapter never runs) --
      const manifest: Engine | undefined = registry.getEngine(
        job.engineId,
        job.engineVersion,
      );
      if (manifest === undefined) {
        return complete(
          job,
          "failed",
          failedResult(
            job,
            sandboxFailure(
              "unknown-engine",
              `engine ${job.engineId as string}@${job.engineVersion as number} is not registered`,
            ),
            jobProvenance(job),
            0,
          ),
          0,
        );
      }

      const preFlightFailure = preFlightCheck(job, manifest);
      if (preFlightFailure !== null) {
        return complete(
          job,
          "failed",
          failedResult(job, preFlightFailure, jobProvenance(job), 0),
          0,
        );
      }

      const adapter = adapters.get(adapterKey(job.engineId, job.engineVersion));
      if (adapter === undefined) {
        return complete(
          job,
          "failed",
          failedResult(
            job,
            sandboxFailure(
              "adapter-not-registered",
              `no executable adapter is registered for ${job.engineId as string}@${job.engineVersion as number}`,
            ),
            jobProvenance(job),
            0,
          ),
          0,
        );
      }

      // ---- Running: the sandbox context is the adapter's whole world ----
      emit({ type: "job-running", jobId: job.id, startedAt: clock() });
      const startedWall = now();
      const scopedStore = createJobScopedArtifactStore(
        artifactStore,
        job.inputArtifactRefs,
      );

      const originalFetch = fetchGuard.acquire();
      let grantedFetch = options.fetchImpl;
      if (grantedFetch === undefined && originalFetch !== undefined) {
        grantedFetch = async (url: string) =>
          new Uint8Array(await (await originalFetch(url)).arrayBuffer());
      }
      const context: EngineSandboxContext = {
        job,
        network: createSandboxNetwork(
          effectiveNetworkPolicy(manifest, submissionOptions),
          grantedFetch,
        ),
        artifacts: scopedStore,
        quotas: job.resourceLimits,
        seed: job.seed,
      };

      let timedOut = false;
      let adapterResult: EngineResult | undefined;
      let invocationError: unknown;
      try {
        const invocation = adapter.invoke(job, context);
        let cancelTimer: (() => void) | undefined;
        const deadline = new Promise<never>((_, reject) => {
          cancelTimer = timers.set(job.resourceLimits.timeoutMs, () => {
            timedOut = true;
            reject(new EngineJobTimeoutSignal(job.resourceLimits.timeoutMs));
          });
        });
        try {
          adapterResult = await Promise.race([invocation, deadline]);
        } finally {
          cancelTimer?.();
        }
      } catch (error) {
        invocationError = error;
      } finally {
        fetchGuard.release();
      }
      const wallMs: Milliseconds = Math.max(0, now() - startedWall);

      // ---- Timeout: typed failure with partial metrics -------------------
      if (adapterResult === undefined && timedOut) {
        const result: EngineResult = Object.freeze({
          jobId: job.id,
          outputArtifactRefs: [],
          metrics: { partial: 1, timeoutDeadlineMs: job.resourceLimits.timeoutMs },
          provenance: jobProvenance(job),
          duration: wallMs,
          resourceUsage: ZERO_USAGE,
          cost: ZERO_COST,
          warnings: [],
          failure: sandboxFailure(
            "engine-job-timeout",
            `engine job exceeded its ${job.resourceLimits.timeoutMs}ms wall-clock deadline; invocation abandoned`,
            { timeoutMs: job.resourceLimits.timeoutMs },
          ),
        });
        return complete(job, "timed_out", result, wallMs);
      }

      // ---- Adapter threw (incl. sandbox violations): typed failure -------
      if (adapterResult === undefined) {
        const violation =
          invocationError instanceof EngineSandboxViolationError
            ? invocationError
            : undefined;
        const message =
          invocationError instanceof Error
            ? invocationError.message
            : String(invocationError);
        return complete(
          job,
          "failed",
          failedResult(
            job,
            sandboxFailure(
              violation?.code ?? "engine-invocation-error",
              violation !== undefined
                ? `sandbox policy violation: ${message}`
                : `adapter invocation failed: ${message}`,
              violation?.details as Record<string, unknown> | undefined,
            ),
            jobProvenance(job),
            wallMs,
          ),
          wallMs,
        );
      }

      // ---- Post-flight validation of the adapter's EngineResult ----------
      const verdict = await validateAdapterResult(
        job,
        adapterResult,
        wallMs,
        scopedStore,
      );
      if (verdict.kind === "invalid-result") {
        return complete(
          job,
          "failed",
          failedResult(job, verdict.failure, jobProvenance(job), wallMs),
          wallMs,
        );
      }
      if (verdict.kind === "failed") {
        return complete(
          job,
          "failed",
          Object.freeze({
            ...adapterResult,
            jobId: job.id,
            outputArtifactRefs: [],
            failure: verdict.failure,
          }),
          wallMs,
        );
      }

      return complete(job, "succeeded", adapterResult, wallMs);
    },
  };

  return runner;
}

/**
 * Pre-flight policy gates: manifest posture, quota shape, quota adequacy
 * vs the engine's declared profile, and the seed policy. Returns the
 * typed failure, or null when the job may run.
 */
function preFlightCheck(
  job: EngineJob,
  manifest: Engine,
): EngineJobFailure | null {
  const posture = manifestPostureViolations(manifest);
  if (posture.length > 0) {
    return sandboxFailure(
      posture[0] as string,
      `manifest sandbox posture is not runnable: ${posture.join(", ")}`,
      { violations: posture },
    );
  }

  const invalidLimits = invalidResourceLimits(job.resourceLimits);
  if (invalidLimits.length > 0) {
    return sandboxFailure(
      "invalid-resource-limits",
      `resource limits must be finite positive numbers: ${invalidLimits.join(", ")}`,
      { invalid: invalidLimits },
    );
  }

  const deficit = quotaDeficitAgainstManifest(job.resourceLimits, manifest.resources);
  if (deficit.length > 0) {
    return sandboxFailure(
      "resource-quota-below-engine-requirements",
      `job grants less than the engine's declared resource profile: ${deficit.join(", ")}`,
      { deficit },
    );
  }

  const seedViolation = seedPolicyViolation(manifest, job);
  if (seedViolation !== null) {
    return sandboxFailure(
      seedViolation,
      seedViolation === "seed-required"
        ? "engine declares deterministic support: a seed is required (seedRequiredWhenSupported)"
        : "engine declares non-deterministic behavior: seed must be null",
    );
  }

  return null;
}
