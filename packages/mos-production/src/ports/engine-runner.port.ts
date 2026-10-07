/**
 * Engine runner seam (LAB-013) — the mirrored @mos/engines
 * `EngineRunnerPort` submission surface.
 *
 * Architecture §9/§11 and lock rule 13: a pawn may invoke deterministic
 * engines, and engine implementation runs behind the narrow sandboxed
 * runner — pawns submit `EngineJob`s THROUGH THE RUNNER and receive
 * `EngineResult`s; there is no other engine invocation path in this package
 * (pinned structurally by src/no-second-runtime.test.ts: the single
 * `submit` call-site, no adapter surface, no engine resolution).
 *
 * The seam mirrors the real port's `submit` signature exactly (job in →
 * result out, submission options with the network grant shape) from the
 * SAME @mos/contracts `EngineJob`/`EngineResult` types, so the REAL
 * `@mos/engines` runner satisfies this interface with zero adapters
 * (compat/engine-runner-compat.ts pins it; the runner's extra
 * `registerAdapter` method is composition-root wiring this package never
 * touches). Typed engine failures pass through: a failed EngineResult
 * carries its typed `failure` record VERBATIM into the pawn execution
 * record — never a crash, never a silent success.
 *
 * The in-memory double (adapters/in-memory-engine-runner.ts) is a
 * DISCLOSED double: it records submitted jobs and produces deterministic
 * results or typed failures as configured by the composition seam.
 */

import type { EngineJob, EngineResult } from "@mos/contracts";

/** Per-submission options (mirror of the runner's EngineJobSubmissionOptions). */
export interface PawnEngineJobSubmissionOptions {
  /** The ONLY way an engine ever gets network (unused by pawns; kept for parity). */
  readonly networkGrant?: {
    readonly allowedHosts: readonly string[];
  };
}

/**
 * The engine runner seam: pawns submit EngineJobs here. One public method.
 */
export interface PawnEngineRunnerPort {
  /**
   * Submits one job through the sandboxed runner. Failures arrive as TYPED
   * failures inside the EngineResult (the runner's vocabulary passes
   * through verbatim) — the submission itself only throws on caller-level
   * contract violations.
   */
  submit(
    job: EngineJob,
    submissionOptions?: PawnEngineJobSubmissionOptions,
  ): Promise<EngineResult>;
}
