/**
 * In-memory engine runner double (LAB-013) — DISCLOSED DOUBLE of the
 * @mos/engines `EngineRunnerPort` seam.
 *
 * Records every submitted EngineJob (inspection: the tests pin that pawns
 * submit jobs THROUGH the seam with the declared inputs/seed/limits) and
 * produces deterministic EngineResults — or the TYPED failures configured
 * at the composition seam (failure vocabulary: the runner's own typed
 * codes, passed through verbatim into pawn execution records).
 *
 * What is NOT doubled: the EngineJob/EngineResult contracts (canonical
 * @mos/contracts types, identical on both sides — compat-pinned) and the
 * failure passthrough discipline. What is doubled: the sandbox itself
 * (quotas, network, scoped artifacts — the REAL runner enforces §11
 * policy; the compat test runs real engine submissions through the REAL
 * runner).
 */

import type { EngineJob, EngineResult, RunProvenance } from "@mos/contracts";

import { PawnExecutionError } from "../domain/errors.js";
import type {
  PawnEngineJobSubmissionOptions,
  PawnEngineRunnerPort,
} from "../ports/engine-runner.port.js";

/** One scripted outcome for a submitted job (matched by capability id). */
export interface InMemoryRunnerRoute {
  /** The capability id this route answers (jobs of other capabilities succeed). */
  readonly capabilityId: string;
  /** Deterministic output artifact count (refs minted per job id). */
  readonly outputCount?: number;
  /** Metrics recorded on the result. */
  readonly metrics?: Readonly<Record<string, number>>;
  /** Cost recorded on the result. */
  readonly cost?: { readonly amount: number; readonly currency: string };
  /** Typed failure returned instead of outputs (passes through verbatim). */
  readonly failure?: { readonly code: string; readonly message: string; readonly retriable: boolean };
  /** Warnings recorded on the result. */
  readonly warnings?: readonly { readonly code: string; readonly message: string }[];
}

/** Options for the in-memory engine runner double. */
export interface InMemoryEngineRunnerOptions {
  /** Routes keyed by capability id (jobs without a route succeed with one output). */
  readonly routes?: Readonly<Record<string, InMemoryRunnerRoute>>;
  readonly now?: () => string;
}

/** The recorded submission (inspection surface for the structural pins). */
export interface RecordedEngineSubmission {
  readonly job: EngineJob;
  readonly submissionOptions: PawnEngineJobSubmissionOptions | undefined;
}

/** The in-memory runner double (plus its inspection surface). */
export interface InMemoryEngineRunnerDouble extends PawnEngineRunnerPort {
  /** Every submitted job, in submission order. */
  readonly submissions: readonly RecordedEngineSubmission[];
}

/** Creates the in-memory {@link PawnEngineRunnerPort} double. */
export function createInMemoryEngineRunner(
  options: InMemoryEngineRunnerOptions = {},
): InMemoryEngineRunnerDouble {
  const now = options.now ?? (() => new Date().toISOString());
  const submissions: RecordedEngineSubmission[] = [];

  const runner: InMemoryEngineRunnerDouble = {
    submissions,
    async submit(
      job: EngineJob,
      submissionOptions?: PawnEngineJobSubmissionOptions,
    ): Promise<EngineResult> {
      if (job === null || typeof job !== "object") {
        throw new PawnExecutionError("invalid-task", "an EngineJob must be an object");
      }
      submissions.push({ job, submissionOptions });
      const route = options.routes?.[job.capabilityId as string];
      const recordedAt = now();
      const provenance: RunProvenance = {
        engineId: job.engineId,
        engineVersion: job.engineVersion,
        capabilityId: job.capabilityId,
        capabilityVersion: job.capabilityVersion,
        modelIdentity: null,
        recordedAt: recordedAt as RunProvenance["recordedAt"],
      };
      const failure = route?.failure;
      if (failure !== undefined) {
        return {
          jobId: job.id,
          outputArtifactRefs: [],
          metrics: route?.metrics ?? {},
          provenance,
          duration: 12,
          resourceUsage: { cpuCoreSeconds: 0.01, gpuUnitSeconds: 0, memoryMbSeconds: 4 },
          cost: { amount: 0, currency: "USD" },
          warnings: route?.warnings ?? [],
          failure: {
            code: failure.code,
            message: failure.message,
            retriable: failure.retriable,
          },
        };
      }
      const outputCount = route?.outputCount ?? 1;
      const outputArtifactRefs = Array.from({ length: outputCount }, (_, index) => ({
        artifactId: `artifact:engine-output-${job.id as string}-${index + 1}` as never,
        version: 1 as never,
        tenantId: job.inputArtifactRefs[0]?.tenantId ?? ("" as never),
        digest: `sha256:engine-${job.id as string}-${index + 1}` as never,
        type: job.inputArtifactRefs[0]?.type ?? "video",
        storageRef: `storage://engine-output/${job.id as string}/${index + 1}` as never,
        rightsRef: job.inputArtifactRefs[0]?.rightsRef ?? ("" as never),
        provenanceRef: `provenance:engine-run/${job.id as string}` as never,
      }));
      return {
        jobId: job.id,
        outputArtifactRefs,
        metrics: route?.metrics ?? { qualityScore: 0.9 },
        provenance,
        duration: 12,
        resourceUsage: { cpuCoreSeconds: 0.05, gpuUnitSeconds: 0.01, memoryMbSeconds: 32 },
        cost: route?.cost ?? { amount: 0.01, currency: "USD" },
        warnings: route?.warnings ?? [],
        failure: null,
      };
    },
  };
  return runner;
}
