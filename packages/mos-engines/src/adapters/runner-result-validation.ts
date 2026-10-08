/**
 * Post-flight validation of an adapter's EngineResult (ENG-003).
 *
 * After the adapter resolves, the runner validates BEFORE trusting the
 * result: the EngineResult contract shape, the identity echo (job id +
 * provenance must name the submitted job's exact engine/capability
 * identity — historical reproducibility), the reported resource usage
 * against the granted quotas over the measured wall-clock window, and
 * that every output artifact was materialized INSIDE the job's sandbox
 * scope (scoped-artifacts-only filesystem — outputs pulled from nowhere
 * are rejected and never surfaced).
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  EngineJob,
  EngineJobFailure,
  EngineResult,
  Milliseconds,
} from "@mos/contracts";

import type { EngineArtifactStorePort } from "../ports/engine-runner.port.js";
import {
  invalidReportedUsage,
  sandboxFailure,
  usageQuotaViolations,
} from "../domain/sandbox-policy.js";

/** Outcome of the post-flight validation. */
export type AdapterResultVerdict =
  | { readonly kind: "ok" }
  /** The result record itself is malformed — nothing in it is trustworthy. */
  | { readonly kind: "invalid-result"; readonly failure: EngineJobFailure }
  /** The run violated policy — its outputs are discarded, never surfaced. */
  | { readonly kind: "failed"; readonly failure: EngineJobFailure };

/**
 * Validates the adapter's result against the job, the granted quotas and
 * the sandbox scope. Returns the typed failure to record, or `ok`.
 */
export async function validateAdapterResult(
  job: EngineJob,
  adapterResult: EngineResult,
  wallMs: Milliseconds,
  scopedStore: EngineArtifactStorePort,
): Promise<AdapterResultVerdict> {
  try {
    assertRequiredFields(adapterResult, "EngineResult");
  } catch (error) {
    return {
      kind: "invalid-result",
      failure: sandboxFailure(
        "invalid-engine-result",
        error instanceof Error ? error.message : String(error),
      ),
    };
  }

  const identityEcho =
    adapterResult.jobId === job.id &&
    adapterResult.provenance.engineId === job.engineId &&
    adapterResult.provenance.engineVersion === job.engineVersion &&
    adapterResult.provenance.capabilityId === job.capabilityId &&
    adapterResult.provenance.capabilityVersion === job.capabilityVersion;
  if (!identityEcho) {
    return {
      kind: "failed",
      failure: sandboxFailure(
        adapterResult.jobId !== job.id
          ? "result-job-id-mismatch"
          : "provenance-identity-mismatch",
        "the adapter's result does not echo the submitted job identity",
      ),
    };
  }

  // W9-B: NaN/negative reported usage defeats the quota comparison
  // (`NaN > limit` is false) — enforcement made impossible fails closed.
  const invalidUsage = invalidReportedUsage(adapterResult.resourceUsage);
  if (invalidUsage.length > 0) {
    return {
      kind: "failed",
      failure: sandboxFailure(
        "invalid-resource-usage",
        `reported resource usage is not a finite non-negative number (quota enforcement impossible): ${invalidUsage.join(", ")}`,
        { invalid: invalidUsage },
      ),
    };
  }

  const quotaViolations = usageQuotaViolations(
    adapterResult.resourceUsage,
    job.resourceLimits,
    wallMs,
  );
  if (quotaViolations.length > 0) {
    return {
      kind: "failed",
      failure: sandboxFailure(
        "resource-quota-exceeded",
        `reported resource usage exceeds the granted quotas: ${quotaViolations.join(", ")}`,
        { violations: quotaViolations },
      ),
    };
  }

  const unscopedOutputs: string[] = [];
  for (const ref of adapterResult.outputArtifactRefs) {
    const resolved = await scopedStore.resolve(ref);
    if (resolved === undefined) {
      unscopedOutputs.push(ref.artifactId as string);
    }
  }
  if (unscopedOutputs.length > 0) {
    return {
      kind: "failed",
      failure: sandboxFailure(
        "unscoped-output-artifact",
        `output artifacts were not materialized inside the job's sandbox scope: ${unscopedOutputs.join(", ")}`,
        { artifactIds: unscopedOutputs },
      ),
    };
  }

  return { kind: "ok" };
}
