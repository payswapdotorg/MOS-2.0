/**
 * EngineAdapter contract (ENG-002, extended by ENG-003).
 *
 * The narrow invoke surface every engine implementation sits behind:
 * EngineJob in → EngineResult out (spec/mos-architecture-v2.0.md §11,
 * spec/contracts/core-contracts-v2.0.yaml EngineJob/EngineResult). Domain
 * modules never import engine implementations; the engine runner (ENG-003)
 * loads adapters by the manifest's `adapterRef` identity and executes them
 * inside the sandbox. The registry records the adapter identity only — it
 * never loads or invokes adapters.
 *
 * ENG-003: `invoke` receives the sandbox context (network policy seam,
 * job-scoped artifact store, granted quotas, seed) alongside the job.
 * The context has NO credential surface — structurally (pinned in
 * sandbox-policy.test.ts).
 */

import type { EngineId, EngineJob, EngineResult, Version } from "@mos/contracts";

import type { EngineSandboxContext } from "./engine-runner.port.js";

/**
 * A runnable engine behind the capability contract. ONE method — the
 * narrowest possible surface: submit a job with its sandbox context, get
 * its result.
 *
 * Implementations MUST:
 * - carry the exact engine identity (`engineId`/`engineVersion`) they
 *   implement, matching their registered manifest;
 * - satisfy the job's `outputContract` on success;
 * - materialize outputs through the sandbox artifact store (the runner
 *   rejects outputs that were not produced inside the job scope);
 * - return a full EngineResult record even on failure (typed `failure`,
 *   with whatever metrics/provenance are available) so runs stay auditable;
 * - record model identity in result provenance when model-backed
 *   (modelIdentityRecordedPerRun);
 * - reach the network ONLY through `context.network` (the ambient fetch
 *   is denied during invocation; violations fail the run closed).
 */
export interface EngineAdapter {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  invoke(job: EngineJob, context: EngineSandboxContext): Promise<EngineResult>;
}
