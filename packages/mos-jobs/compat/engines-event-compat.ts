/**
 * ENG-003 event-seam compatibility pin (JOBS-001) — compile-time half.
 *
 * Pins MUTUAL ASSIGNABILITY between the mirrored runner event vocabulary
 * of @mos/jobs (src/contracts/runner-events.ts — RunnerJobEvent,
 * RunnerRunObservabilityRecord, RunnerJobEventSink) and the REAL
 * `@mos/engines` JobEventSinkPort vocabulary (JobEvent,
 * EngineRunObservabilityRecord, JobEventSinkPort). Both sides type their
 * fields from the SAME @mos/contracts brands, so the pin holds with zero
 * casts; if EITHER side renames a field, changes a type or drops a member,
 * this file fails to typecheck and the package build goes red.
 *
 * Compiled ONLY by tsconfig.compat.json (noEmit) as part of the package
 * `test` script; the runtime half is
 * compat/engine-runner-bridge.test.ts, which runs the REAL ENG-003
 * in-memory runner with the bridge as its event sink.
 *
 * Registry note: the frozen module registry gives `jobs` exactly one
 * dependency — `contracts` — and the RUNTIME module graph of this package
 * imports only @mos/contracts. The real engine package is referenced from
 * this compat directory via RELATIVE paths (types from its source entry,
 * runtime from its built dist) so the package.json dependency set stays
 * exactly the registry-declared one; the sole purpose of these references
 * is the zero-drift pin and the end-to-end bridge proof (disclosed in the
 * package README and the wave report).
 */

import type {
  EngineRunObservabilityRecord as RealObservabilityRecord,
  JobCompletedEvent as RealCompletedEvent,
  JobEvent as RealJobEvent,
  JobEventSinkPort as RealJobEventSinkPort,
  JobQueuedEvent as RealQueuedEvent,
  JobRunningEvent as RealRunningEvent,
} from "../../mos-engines/src/index.ts";

import type {
  RunnerJobCompletedEvent,
  RunnerJobEvent,
  RunnerJobEventSink,
  RunnerJobQueuedEvent,
  RunnerJobRunningEvent,
  RunnerRunObservabilityRecord,
} from "../src/contracts/runner-events.js";

import type { EngineRunnerJobEventBridge } from "../src/adapters/engine-runner-job-event-bridge.js";

// ---------------------------------------------------------------------------
// Mutual assignability assertions. Each constant typechecks ONLY when the
// paired types accept each other's values in BOTH directions.
// ---------------------------------------------------------------------------

/** Real events are assignable to the mirrored event union. */
const realEventIsMirror: RealJobEvent = null as unknown as RunnerJobEvent;
/** Mirrored events are assignable to the real event union. */
const mirrorEventIsReal: RunnerJobEvent = null as unknown as RealJobEvent;
void realEventIsMirror;
void mirrorEventIsReal;

/** Queued events, both directions. */
const realQueuedIsMirror: RealQueuedEvent = null as unknown as RunnerJobQueuedEvent;
const mirrorQueuedIsReal: RunnerJobQueuedEvent = null as unknown as RealQueuedEvent;
void realQueuedIsMirror;
void mirrorQueuedIsReal;

/** Running events, both directions. */
const realRunningIsMirror: RealRunningEvent = null as unknown as RunnerJobRunningEvent;
const mirrorRunningIsReal: RunnerJobRunningEvent = null as unknown as RealRunningEvent;
void realRunningIsMirror;
void mirrorRunningIsReal;

/** Completion events, both directions. */
const realCompletedIsMirror: RealCompletedEvent = null as unknown as RunnerJobCompletedEvent;
const mirrorCompletedIsReal: RunnerJobCompletedEvent = null as unknown as RealCompletedEvent;
void realCompletedIsMirror;
void mirrorCompletedIsReal;

/** The §30 observability record, both directions. */
const realRecordIsMirror: RealObservabilityRecord = null as unknown as RunnerRunObservabilityRecord;
const mirrorRecordIsReal: RunnerRunObservabilityRecord = null as unknown as RealObservabilityRecord;
void realRecordIsMirror;
void mirrorRecordIsReal;

/** The bridge is a REAL JobEventSinkPort (no cast, no adapter). */
const bridgeAsRealSink: RealJobEventSinkPort = null as unknown as EngineRunnerJobEventBridge;
const realSinkIsBridgeShaped: RunnerJobEventSink = null as unknown as RealJobEventSinkPort;
void bridgeAsRealSink;
void realSinkIsBridgeShaped;
