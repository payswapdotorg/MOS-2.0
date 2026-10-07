/**
 * Engine runner seam compatibility pin (LAB-013).
 *
 * Compile-time assertion that the mirrored runner seam of this package
 * (src/ports/engine-runner.port.ts) is satisfied by the REAL
 * `@mos/engines` `EngineRunnerPort` with ZERO adapters: the REAL runner is
 * a structural superset (its extra `registerAdapter` method is
 * composition-root wiring this package never touches — the seam exposes
 * `submit` only, which is how the no-bypass pin in
 * src/no-second-runtime.test.ts stays true).
 *
 * The reverse direction (the mirrored seam standing in for the full real
 * runner) is NOT assignable by design — the disclosed in-memory double
 * implements the seam, not the runner's adapter-registration surface;
 * documented, not asserted.
 */

import type { EngineRunnerPort as RealEngineRunnerPort } from "../../mos-engines/src/index.js";
import type { EngineJobSubmissionOptions as RealSubmissionOptions } from "../../mos-engines/src/index.js";

import type {
  PawnEngineJobSubmissionOptions,
  PawnEngineRunnerPort,
} from "../src/ports/engine-runner.port.js";

// ---------------------------------------------------------------------------
// Assignability assertions (`null as unknown as X` — no runtime code).
// ---------------------------------------------------------------------------

/** The REAL runner satisfies the seam with zero adapters. */
export const realRunnerSatisfiesMirror: PawnEngineRunnerPort =
  null as unknown as RealEngineRunnerPort;

/** The seam's submission options ⇔ the real submission options. */
export const realOptionsSatisfyMirror: PawnEngineJobSubmissionOptions =
  null as unknown as RealSubmissionOptions;
export const mirrorOptionsSatisfyReal: RealSubmissionOptions =
  null as unknown as PawnEngineJobSubmissionOptions;

/** The seam's submit parameters accept the real submit call shape. */
export type MirrorSubmitParameters = Parameters<PawnEngineRunnerPort["submit"]>;
export type RealSubmitParameters = Parameters<RealEngineRunnerPort["submit"]>;
export const realSubmitParametersSatisfyMirror: MirrorSubmitParameters =
  null as unknown as RealSubmitParameters;
export const mirrorSubmitParametersSatisfyReal: RealSubmitParameters =
  null as unknown as MirrorSubmitParameters;

/**
 * The EngineJob/EngineResult contracts are the SAME @mos/contracts types on
 * both sides (the seam imports them from @mos/contracts, as does the real
 * runner) — type identity, no drift possible (the submit-parameter
 * assertions above are the executable form of this fact).
 */
