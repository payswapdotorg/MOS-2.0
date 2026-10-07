/**
 * EngineAdapter contract (ENG-002).
 *
 * The narrow invoke surface every engine implementation sits behind:
 * EngineJob in → EngineResult out (spec/mos-architecture-v2.0.md §11,
 * spec/contracts/core-contracts-v2.0.yaml EngineJob/EngineResult). Domain
 * modules never import engine implementations; the engine runner (ENG-003)
 * loads adapters by the manifest's `adapterRef` identity and executes them
 * inside the sandbox. The registry records the adapter identity only — it
 * never loads or invokes adapters.
 */

import type { EngineId, EngineJob, EngineResult, Version } from "@mos/contracts";

/**
 * A runnable engine behind the capability contract. ONE method — the
 * narrowest possible surface: submit a job, get its result.
 *
 * Implementations MUST:
 * - carry the exact engine identity (`engineId`/`engineVersion`) they
 *   implement, matching their registered manifest;
 * - satisfy the job's `outputContract` on success;
 * - return a full EngineResult record even on failure (typed `failure`,
 *   with whatever metrics/provenance are available) so runs stay auditable;
 * - record model identity in result provenance when model-backed
 *   (modelIdentityRecordedPerRun).
 */
export interface EngineAdapter {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  invoke(job: EngineJob): Promise<EngineResult>;
}
