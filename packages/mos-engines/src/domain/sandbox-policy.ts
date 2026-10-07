/**
 * Sandbox policy — the pure enforcement core of the engine runner
 * (ENG-003).
 *
 * Every rule here encodes one line of spec/mos-engine-policy-v2.0.yaml
 * `runner` or spec/mos-architecture-v2.0.md §11:
 *
 * - `resourceQuotasRequired` → invalid/absent quotas are named failures
 *   (`invalid-resource-limits`), and a job may not grant the engine less
 *   than its manifest's declared ResourceProfile
 *   (`resource-quota-below-engine-requirements`, per dimension);
 * - `timeoutRequired` → the wall-clock deadline is enforced by the runner
 *   (typed `engine-job-timeout` failure with partial metrics);
 * - over-quota runs are retroactively failed by name, dimension by
 *   dimension (`resource-quota-exceeded`) — outputs of quota-violating
 *   runs are discarded, never surfaced as success artifacts;
 * - `defaultNetwork: denied` → the effective policy is the conjunction of
 *   an `explicitly-granted` manifest AND an explicit submission grant;
 * - `seedRequiredWhenSupported` → deterministic engines refuse unseeded
 *   jobs (`seed-required`); non-deterministic engines refuse seeded ones
 *   (`seed-not-supported`, per the EngineJob contract's "null when the
 *   engine does not support seeding");
 * - `databaseCredentials`/`providerCredentials: none` +
 *   specialRules.engines.sandboxRequired → manifests declaring injected
 *   credentials or unsandboxed execution cannot run AT ALL, mirroring the
 *   activation gate's forbidden list at execution time.
 *
 * Pure functions only — no IO, no clocks (testable in isolation).
 */

import type {
  Engine,
  EngineJob,
  EngineJobFailure,
  ResourceLimits,
  ResourceUsage,
} from "@mos/contracts";

import type {
  EngineJobSubmissionOptions,
  NetworkPolicy,
} from "../ports/engine-runner.port.js";

/** Positive-tolerance for floating-point quota comparisons. */
const EPSILON = 1e-9;

/** Quota dimensions, in ResourceLimits order. */
export const QUOTA_DIMENSIONS = ["cpuCores", "gpuUnits", "memoryMb", "timeoutMs"] as const;

export type QuotaDimension = (typeof QUOTA_DIMENSIONS)[number];

/** Manifest facets the pre-flight checks need (structural subset of Engine). */
export interface SandboxManifestFacets {
  readonly resources: Engine["resources"];
  readonly deterministic: Engine["deterministic"];
  readonly security: Engine["security"];
}

/**
 * Validates the SHAPE of granted resource limits: every dimension present,
 * a finite number, strictly positive. Returns the named invalid dimensions
 * (empty = valid).
 */
export function invalidResourceLimits(
  limits: ResourceLimits,
): readonly QuotaDimension[] {
  const invalid: QuotaDimension[] = [];
  for (const dimension of QUOTA_DIMENSIONS) {
    const value = limits[dimension];
    if (!Number.isFinite(value) || value <= 0) {
      invalid.push(dimension);
    }
  }
  return invalid;
}

/**
 * Per-dimension check that the job's granted limits satisfy the engine
 * manifest's declared ResourceProfile (a job may grant MORE than the
 * engine requires, never less). Returns the deficit dimensions (empty =
 * adequate).
 */
export function quotaDeficitAgainstManifest(
  limits: ResourceLimits,
  manifestResources: Engine["resources"],
): readonly QuotaDimension[] {
  const deficit: QuotaDimension[] = [];
  for (const dimension of QUOTA_DIMENSIONS) {
    if (limits[dimension] + EPSILON < manifestResources[dimension]) {
      deficit.push(dimension);
    }
  }
  return deficit;
}

/**
 * Seed policy (seedRequiredWhenSupported): deterministic engines require a
 * seed; non-deterministic engines reject one.
 */
export function seedPolicyViolation(
  manifest: Pick<Engine, "deterministic">,
  job: Pick<EngineJob, "seed">,
): "seed-required" | "seed-not-supported" | null {
  if (manifest.deterministic && (job.seed === null || !Number.isFinite(job.seed))) {
    return "seed-required";
  }
  if (!manifest.deterministic && job.seed !== null) {
    return "seed-not-supported";
  }
  return null;
}

/**
 * Effective network policy: `'denied'` unless the manifest explicitly
 * grants network AND the submission carries an explicit, non-empty host
 * grant (fail-closed conjunction — the default posture survives either
 * side being absent).
 */
export function effectiveNetworkPolicy(
  manifest: Pick<Engine, "security">,
  submissionOptions: EngineJobSubmissionOptions | undefined,
): NetworkPolicy {
  const grant = submissionOptions?.networkGrant;
  if (
    manifest.security.networkAccess !== "explicitly-granted" ||
    grant === undefined ||
    grant.allowedHosts.length === 0
  ) {
    return { access: "denied" };
  }
  return { access: "explicitly-granted", allowedHosts: grant.allowedHosts };
}

/**
 * Manifest posture checks mirrored from the activation gate's forbidden
 * list (execution-time defense in depth): injected credentials or
 * unsandboxed engines never run, even if they somehow got registered.
 */
export function manifestPostureViolations(
  manifest: Pick<Engine, "security">,
): readonly string[] {
  const violations: string[] = [];
  if (!manifest.security.sandboxed) {
    violations.push("engine-not-sandboxed");
  }
  if (manifest.security.databaseCredentials === "injected") {
    violations.push("database-credentials-forbidden");
  }
  if (manifest.security.providerCredentials === "injected") {
    violations.push("provider-credentials-forbidden");
  }
  return violations;
}

/**
 * Post-flight quota check: the adapter's REPORTED usage must fit inside
 * the granted limits over the measured wall-clock window (cpu/gpu
 * core-seconds ≤ granted units × wall seconds; memory MB·s ≤ granted MB ×
 * wall seconds). Returns the exceeded dimensions (empty = within quotas).
 */
export function usageQuotaViolations(
  usage: ResourceUsage,
  limits: ResourceLimits,
  wallClockMs: number,
): readonly string[] {
  const wallSeconds = Math.max(wallClockMs, 0) / 1000;
  const violations: string[] = [];
  if (usage.cpuCoreSeconds > limits.cpuCores * wallSeconds + EPSILON) {
    violations.push("cpuCoreSeconds");
  }
  if (usage.gpuUnitSeconds > limits.gpuUnits * wallSeconds + EPSILON) {
    violations.push("gpuUnitSeconds");
  }
  if (usage.memoryMbSeconds > limits.memoryMb * wallSeconds + EPSILON) {
    violations.push("memoryMbSeconds");
  }
  return violations;
}

/** Builds the typed failure payload used for every runner policy breach. */
export function sandboxFailure(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): EngineJobFailure {
  return {
    code,
    message,
    retriable: code === "engine-job-timeout" || code === "engine-invocation-error",
    ...(details === undefined ? {} : { details }),
  };
}
