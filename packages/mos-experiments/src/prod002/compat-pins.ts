/**
 * PROD-002 — compile-time compatibility pins on the REAL upstream authorities.
 *
 * The pins are TYPE-ONLY imports: if an authority renames or drops a pinned
 * name, `tsc` fails HERE — a one-file fix at merge, not a scattered hunt.
 * Runtime shape variance is tolerated by `upstream.ts` probing instead.
 *
 * Pins (TL-cited names):
 *  - `JobQueuePort` exported by '@mos/jobs' (JOBS-001 — the durable path).
 *  - `RealExperimentBinding` exported by this package's root (BRIDGE-003 —
 *    the real-experiment/evidence/learning authority PROD-002 extends).
 *
 * MERGE RECONCILIATION POINT: if BRIDGE-003's root export surface lives at a
 * different path, fix ONLY the import line below. If '@mos/jobs' is not yet
 * a workspace devDep of this package, add it (declared registry dependency).
 */
import type { JobQueuePort } from '@mos/jobs';
import type { RealExperimentBinding } from '../index.js';

/** The REAL @mos/jobs durable-path authority type (JOBS-001). */
export type PinnedJobsPort = JobQueuePort;

/** The REAL @mos/experiments base binding (BRIDGE-003) this submodule extends. */
export type PinnedExperimentsBaseBinding = RealExperimentBinding;
