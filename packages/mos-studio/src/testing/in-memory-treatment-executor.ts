/**
 * DISCLOSED TEST DOUBLE — in-memory output treatment executor (STUDIO-001).
 *
 * Simulates the organization-side treatment execution path (§16/§17:
 * treatments run through the loaded organization's production program;
 * engines/capabilities not in this base) for contract tests. Successful
 * treatments create ONE successor artifact through the artifact factory — a
 * NEW immutable version whose parents include the treated artifact — and
 * return the full §19 result. Configurable failure modes cover the two
 * distinct failure kinds: execution failure vs rights/policy rejection.
 */

import type {
  OutputTreatmentOutcome,
  OutputTreatmentRequest,
  StudioOutputTreatmentPort,
} from "../contracts/treatment.js";
import type { RightsPolicyViolationRef, ProvenanceRef, StorageRef, Timestamp } from "../contracts/refs.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";

/** Options controlling the double. */
export interface InMemoryTreatmentExecutorOptions {
  readonly artifactFactory: StudioArtifactFactoryPort;
  readonly clock?: () => Timestamp;
  /** Simulated failure mode (default: succeed). */
  readonly failWith?:
    | { readonly kind: "execution-failure"; readonly reason: string }
    | { readonly kind: "rights-policy-rejection"; readonly violations: readonly string[] };
}

/** Create the disclosed in-memory treatment executor test double. */
export function createInMemoryTreatmentExecutor(
  options: InMemoryTreatmentExecutorOptions,
): StudioOutputTreatmentPort {
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  return {
    async applyTreatment(request: OutputTreatmentRequest): Promise<OutputTreatmentOutcome> {
      if (options.failWith?.kind === "execution-failure") {
        return {
          ok: false,
          failure: { kind: "execution-failure", reason: options.failWith.reason },
        };
      }
      if (options.failWith?.kind === "rights-policy-rejection") {
        return {
          ok: false,
          failure: {
            kind: "rights-policy-rejection",
            rejection: {
              kind: "rights-policy-rejection",
              violations: options.failWith.violations as RightsPolicyViolationRef[],
              notes: "in-memory double: simulated rights/policy violation",
            },
          },
        };
      }
      const target = request.targetArtifact;
      const creation = await options.artifactFactory.createArtifact({
        tenantId: target.tenantId,
        type: target.type,
        stage: "final",
        creationMethod: "organization-transform",
        storageRef: `mos-studio:treatment:${request.treatment}:${target.artifactId}` as StorageRef,
        content: new TextEncoder().encode(
          `treated|${request.treatment}|${target.artifactId}|${request.parametersRef ?? "no-params"}`,
        ),
        rightsRef: target.rightsRef,
        provenanceRef: `mos-studio:treatment-provenance:${request.treatment}:${target.artifactId}` as ProvenanceRef,
        parents: [target],
      });
      if (!creation.ok) {
        return {
          ok: false,
          failure: { kind: "execution-failure", reason: `artifact factory rejected successor: ${JSON.stringify(creation.error)}` },
        };
      }
      return {
        ok: true,
        result: {
          request,
          successorArtifacts: [creation.artifact],
          predecessorArtifacts: [target],
          completedAt: clock(),
        },
      };
    },
  };
}
