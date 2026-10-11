/**
 * PROD-002 — the experiment engine: the §24 chain tail.
 * proposed -> running -> collecting -> measured -> learned | aborted,
 * state-machined on the durable JobsPort path (§26), every act trailed (§30),
 * every cross-tenant access rights-gated first (§27/§31).
 *
 * Split for the 400-line production cap (pure code motion): types live in
 * engine-types.ts, plan validation in plan-validation.ts, the helper surface
 * in engine-helpers.ts, and the phase flows in engine-flows.ts /
 * engine-measure.ts. This file is the public class shell.
 */
import type { Failure, Result } from './errors.js';
import type { PlatformSaidObservation } from './observation-set.js';
import type {
  AccessContextInput,
  ExperimentEngineDeps,
  ExperimentRecord,
} from './engine-types.js';
import { makeEngineOps } from './engine-ops.js';
import type { EngineOps } from './engine-ops.js';
import { runPropose, runStart, runBeginCollection, runAbort, runGet, runList } from './engine-flows.js';
import { runIngestObservation, runMarkMeasured, runPublishLearning } from './engine-measure.js';

export type {
  AccessContext,
  AccessContextInput,
  AuthorityVersions,
  ExperimentEngineDeps,
  ExperimentPhase,
  ExperimentPlan,
  ExperimentRecord,
  ResolvedChain,
} from './engine-types.js';
export { validateExperimentPlan } from './plan-validation.js';
export { JOB_KIND } from './engine-types.js';

export class ExperimentEngine {
  readonly #ops: EngineOps;

  constructor(deps: ExperimentEngineDeps) {
    this.#ops = makeEngineOps(deps);
  }

  propose(access: AccessContextInput, plan: unknown): Result<ExperimentRecord, Failure> {
    return runPropose(this.#ops, access, plan);
  }

  start(access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
    return runStart(this.#ops, access, experimentId);
  }

  beginCollection(access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
    return runBeginCollection(this.#ops, access, experimentId);
  }

  ingestObservation(access: AccessContextInput, experimentId: string, raw: unknown): Result<PlatformSaidObservation, Failure> {
    return runIngestObservation(this.#ops, access, experimentId, raw);
  }

  markMeasured(access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
    return runMarkMeasured(this.#ops, access, experimentId);
  }

  publishLearning(access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
    return runPublishLearning(this.#ops, access, experimentId);
  }

  abort(access: AccessContextInput, experimentId: string, reason: string): Result<ExperimentRecord, Failure> {
    return runAbort(this.#ops, access, experimentId, reason);
  }

  get(access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
    return runGet(this.#ops, access, experimentId);
  }

  list(access: AccessContextInput, tenantId?: string): Result<readonly ExperimentRecord[], Failure> {
    return runList(this.#ops, access, tenantId);
  }
}

export function createExperimentEngine(deps: ExperimentEngineDeps): ExperimentEngine {
  return new ExperimentEngine(deps);
}
