/**
 * The ENG-003 runner event seam, mirrored (JOBS-001).
 *
 * These types mirror — field for field, brand for brand — the
 * `JobEventSinkPort` event vocabulary of `@mos/engines` (ENG-003:
 * `JobQueuedEvent | JobRunningEvent | JobCompletedEvent` and the
 * `EngineRunObservabilityRecord` §30 record). Because both sides type
 * their fields from the SAME `@mos/contracts` brands (EngineJobId,
 * EngineId, CapabilityId, Version, ArtifactRef, EngineWarning,
 * EngineJobFailure, RunProvenance, ResourceUsage, MoneyAmount), the
 * mirror and the real engine types are MUTUALLY ASSIGNABLE with zero
 * casts. `compat/engines-event-compat.ts` pins that mutual assignability
 * against the real package so drift fails the build.
 *
 * Why a mirror at all: the frozen module registry gives `jobs` exactly one
 * dependency — `contracts`. The runtime module graph of this package
 * therefore imports ONLY @mos/contracts; the real engine package is
 * referenced solely from the compat directory (relative paths — types for
 * the compile-time pin, built dist for the runtime round-trip test) so the
 * package's declared dependencies stay exactly the registry-declared set.
 * The bridge adapter
 * (adapters/engine-runner-job-event-bridge.ts) consumes these mirrored
 * events and is structurally a `JobEventSinkPort` — the real runner can
 * hand it its events directly.
 */

import type {
  ArtifactRef,
  CapabilityId,
  EngineId,
  EngineJobFailure,
  EngineJobId,
  EngineWarning,
  Milliseconds,
  MoneyAmount,
  ResourceUsage,
  RunProvenance,
  Timestamp,
  Version,
} from "@mos/contracts";

/** Lifecycle states of one engine run (ENG-003 vocabulary). */
export type RunnerJobLifecycleState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out";

/**
 * The §30 observability record of one engine run. `actor` is the engine
 * execution authority itself ("engine-runner"): the frozen EngineJob shape
 * carries no submitter identity — the durable jobs bridge enriches the
 * actor at this seam with the submitting actor from the job record.
 */
export interface RunnerRunObservabilityRecord {
  readonly runId: EngineJobId;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly actor: "engine-runner";
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly outputArtifactRefs: readonly ArtifactRef[];
  readonly durationMs: Milliseconds;
  readonly resourceUsage: ResourceUsage;
  readonly cost: MoneyAmount;
  readonly warnings: readonly EngineWarning[];
  readonly failure: EngineJobFailure | null;
  readonly provenance: RunProvenance | null;
  readonly lifecycle: RunnerJobLifecycleState;
  readonly recordedAt: Timestamp;
}

/** Runner event: job accepted by the runner (validation passed). */
export interface RunnerJobQueuedEvent {
  readonly type: "job-queued";
  readonly jobId: EngineJobId;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly queuedAt: Timestamp;
}

/** Runner event: adapter invocation started inside the sandbox. */
export interface RunnerJobRunningEvent {
  readonly type: "job-running";
  readonly jobId: EngineJobId;
  readonly startedAt: Timestamp;
}

/** Runner event: the run ended (succeeded / failed / timed_out). */
export interface RunnerJobCompletedEvent {
  readonly type: "job-succeeded" | "job-failed" | "job-timed-out";
  readonly jobId: EngineJobId;
  readonly record: RunnerRunObservabilityRecord;
}

/** Every runner event, as the durable-job seam receives it. */
export type RunnerJobEvent =
  | RunnerJobQueuedEvent
  | RunnerJobRunningEvent
  | RunnerJobCompletedEvent;

/**
 * The consumer side of the runner seam — structurally the ENG-003
 * `JobEventSinkPort` ({@link onJobEvent}). The bridge adapter implements
 * this shape; the real runner hands it real events.
 */
export interface RunnerJobEventSink {
  /** Called synchronously by the runner as the lifecycle advances. */
  onJobEvent(event: RunnerJobEvent): void;
}
