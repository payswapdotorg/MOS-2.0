/**
 * DISCLOSED TEST DOUBLE — sandbox-aware deterministic EngineAdapter
 * (ENG-003/ENG-004/ENG-005).
 *
 * ⚠ TEST DOUBLE ONLY — NEVER A PRODUCTION ENGINE ⚠
 *
 * Unlike the minimal ENG-002 echo double, this adapter genuinely USES the
 * sandbox context, so the runner's enforcement paths have something real
 * to bite on:
 *
 * - resolves every input artifact through `context.artifacts` (fail-closed
 *   typed failure when an input is not resolvable in the job scope);
 * - persists one output artifact per input through `context.artifacts`
 *   (lineage: the input ref; rights + provenance carried forward; the
 *   output bytes are a deterministic function of
 *   (implementationTag, seed, input bytes) — two implementations with
 *   different tags produce different digests, same tag + same seed +
 *   same inputs produce identical digests);
 * - optionally attempts network access (through the sanctioned seam OR
 *   through the ambient fetch — the fail-closed paths);
 * - optionally reports resource usage OVER the granted quotas (the
 *   post-flight quota enforcement) and can hang forever (the deadline
 *   race);
 * - reports simulated work duration and configurable cost per invocation;
 * - records the configured model identity in provenance
 *   (modelIdentityRecordedPerRun).
 *
 * Every behavior is deterministic and disclosed. It makes NO claim about
 * any real engine, model, license or benchmark.
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  EngineId,
  EngineJob,
  EngineResult,
  EngineJobFailure,
  MoneyAmount,
  ResourceUsage,
  RunProvenance,
  Timestamp,
  Version,
} from "@mos/contracts";

import type { EngineSandboxContext } from "../ports/engine-runner.port.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";

/** Fixed provenance stamp: the double must be fully deterministic. */
const RECORDED_AT = "1970-01-01T00:00:00.000Z" as Timestamp;

/** How the network-attempting double reaches for the network. */
export type NetworkAttemptMode = "seam" | "ambient-fetch";

/** Options for the sandbox-aware test adapter. */
export interface SandboxAwareTestAdapterOptions {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  /** Model identity recorded per run (null for non-model engines). */
  readonly modelIdentity?: string | null;
  /**
   * Implementation tag baked into output bytes: different tags → different
   * output digests (two implementations of the same capability contract),
   * same tag + same seed + same inputs → identical outputs.
   */
  readonly implementationTag?: string;
  /** Simulated work per input artifact in ms (duration + usage). */
  readonly workMsPerInput?: number;
  /** Cost charged per invocation (default: zero USD). */
  readonly costPerInvocation?: MoneyAmount;
  /** When set, every invocation returns this typed failure (no outputs). */
  readonly failure?: EngineJobFailure;
  /** When set, the adapter attempts network access the configured way. */
  readonly networkAttempt?: {
    readonly url: string;
    readonly mode: NetworkAttemptMode;
  };
  /** Extra reported usage layered on top (quota-violation double). */
  readonly excessUsage?: Partial<ResourceUsage>;
  /** When true, the invocation never resolves (deadline double). */
  readonly hang?: boolean;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concatBytes(head: Uint8Array, tail: Uint8Array): Uint8Array {
  const out = new Uint8Array(head.length + tail.length);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

/**
 * Creates the DISCLOSED sandbox-aware deterministic test adapter.
 */
export function createSandboxAwareTestAdapter(
  options: SandboxAwareTestAdapterOptions,
): EngineAdapter {
  const implementationTag = options.implementationTag ?? "sandbox-double";
  const workMs = options.workMsPerInput ?? 0;
  const cost: MoneyAmount =
    options.costPerInvocation ?? { amount: 0, currency: "USD" };

  return {
    engineId: options.engineId,
    engineVersion: options.engineVersion,

    async invoke(
      job: EngineJob,
      context: EngineSandboxContext,
    ): Promise<EngineResult> {
      assertRequiredFields(job, "EngineJob");

      const provenance: RunProvenance = {
        engineId: job.engineId,
        engineVersion: job.engineVersion,
        capabilityId: job.capabilityId,
        capabilityVersion: job.capabilityVersion,
        modelIdentity: options.modelIdentity ?? null,
        recordedAt: RECORDED_AT,
      };

      const typedFailure = (
        failure: EngineJobFailure,
      ): Promise<EngineResult> =>
        Promise.resolve(
          Object.freeze({
            jobId: job.id,
            outputArtifactRefs: [],
            metrics: { invocations: 1, inputArtifactCount: job.inputArtifactRefs.length },
            provenance,
            duration: 0,
            resourceUsage: { cpuCoreSeconds: 0, gpuUnitSeconds: 0, memoryMbSeconds: 0 },
            cost,
            warnings: [],
            failure,
          }),
        );

      if (options.failure !== undefined) {
        return typedFailure(options.failure);
      }

      // Network-attempting double: seam or ambient fetch — both must fail
      // closed under a denied policy (the runner converts the violation).
      if (options.networkAttempt !== undefined) {
        if (options.networkAttempt.mode === "seam") {
          await context.network.request(options.networkAttempt.url);
        } else {
          await fetch(options.networkAttempt.url);
        }
      }

      // Resolve every input INSIDE the sandbox scope.
      const inputs = [];
      for (const ref of job.inputArtifactRefs) {
        const record = await context.artifacts.resolve(ref);
        if (record === undefined) {
          return typedFailure({
            code: "input-artifact-not-found",
            message: `input artifact ${ref.artifactId as string} is not resolvable inside the job's sandbox scope`,
            retriable: false,
            details: { artifactId: ref.artifactId as string },
          });
        }
        inputs.push(record);
      }

      // Deterministic transform: output bytes = tag:seed: ++ input bytes.
      const outputRefs = [];
      for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        if (input === undefined) {
          continue;
        }
        const bytes = concatBytes(
          utf8(`${implementationTag}:${job.seed ?? "noseed"}:`),
          input.bytes,
        );
        const ref = await context.artifacts.persist({
          tenantId: input.ref.tenantId,
          type: input.ref.type,
          bytes,
          rightsRef: input.ref.rightsRef,
          provenanceRef: input.ref.provenanceRef,
          lineage: [input.ref],
        });
        outputRefs.push(ref);
      }

      if (options.hang === true) {
        await new Promise<never>(() => undefined);
      }

      const durationMs = workMs * Math.max(inputs.length, 1);
      const usage: ResourceUsage = {
        cpuCoreSeconds: durationMs / 1000,
        gpuUnitSeconds: 0,
        memoryMbSeconds: Math.max(inputs.length, 1) * (workMs / 1000),
        ...options.excessUsage,
      };

      return Object.freeze({
        jobId: job.id,
        outputArtifactRefs: Object.freeze([...outputRefs]),
        metrics: {
          invocations: 1,
          inputArtifactCount: inputs.length,
          outputArtifactCount: outputRefs.length,
        },
        provenance,
        duration: durationMs,
        resourceUsage: usage,
        cost,
        warnings: [],
        failure: null,
      });
    },
  };
}
