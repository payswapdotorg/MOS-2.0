/**
 * Manifest-derived activation policy checks (ENG-001).
 *
 * The second half of the fail-closed activation gate (after
 * `activationFailedChecks` judges the evidence chain itself): checks the
 * ENGINE MANIFEST against the engine policy's forbidden list and
 * cross-checks the manifest's benchmark record against the submitted
 * golden-corpus evidence.
 *
 * Encodes spec/mos-engine-policy-v2.0.yaml `activation.forbidden`
 * (provider_credentials_inside_engine, implicit_network_access → the
 * EngineSecurity posture) and the runner defaults (sandboxed execution,
 * no database credentials), plus §29 three-layer license gating and
 * benchmark-before-promotion (the manifest's own benchmark record must
 * have passed, for exactly this engine version, and must be the benchmark
 * the evidence chain cites).
 */

import type { CapabilityId, Engine } from "@mos/contracts";

import type {
  EngineActivationEvidence,
} from "./activation.js";
import type { CompatibilityVerdict } from "./resolution.js";
import { deriveLicenseCompatibility } from "./resolution.js";

/**
 * The activation-evidence view of one registered engine entry the policy
 * checks need (structural: the in-memory adapter's entry satisfies it).
 */
export interface EnginePolicyEntry {
  readonly engine: Engine;
  readonly evidence?: EngineActivationEvidence;
}

/**
 * Contract compatibility verdict recorded in an engine's activation
 * evidence for one capability.
 */
export function contractVerdictFor(
  entry: EnginePolicyEntry,
  capabilityId: CapabilityId,
): CompatibilityVerdict {
  const test = entry.evidence?.capabilityContractTests.find(
    (candidate) => candidate.capabilityId === capabilityId,
  );
  // Defensive fail-closed: activation guarantees coverage; a missing test
  // still excludes the engine rather than guessing.
  return test?.verdict ?? "incompatible";
}

/**
 * Policy checks derived from the manifest itself (forbidden-list
 * encoding + manifest/evidence benchmark cross-checks). Returns the named
 * failed checks; empty means the manifest is activation-grade.
 */
export function manifestPolicyFailedChecks(
  engine: Engine,
  evidence: EngineActivationEvidence,
): readonly string[] {
  const failed: string[] = [];
  if (!engine.security.sandboxed) {
    failed.push("security:sandbox-required");
  }
  if (engine.security.providerCredentials === "injected") {
    failed.push("security:provider-credentials-forbidden");
  }
  if (engine.security.databaseCredentials === "injected") {
    failed.push("security:database-credentials-forbidden");
  }
  if (deriveLicenseCompatibility(engine.license) === "incompatible") {
    failed.push("license:blocked-layer");
  }
  if (engine.benchmark.result !== "passed") {
    failed.push("benchmark:not-passed");
  }
  if (engine.benchmark.id !== evidence.goldenCorpusBenchmark.benchmarkId) {
    failed.push("goldenCorpusBenchmark:benchmark-mismatch");
  }
  if (engine.benchmark.engineVersion !== engine.version) {
    failed.push("benchmark:engine-version-mismatch");
  }
  return failed;
}
