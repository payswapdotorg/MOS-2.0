/**
 * JobEventSinkPort — the durable-job SEAM (ENG-003).
 *
 * The runner emits the job lifecycle queued → running → succeeded |
 * failed | timed_out as events, and every completion event carries the
 * full §30 observability record (spec/mos-architecture-v2.0.md §30:
 * request/run id, contract version, actor, engine version, capability
 * version, artifact refs, cost/latency, failure/warning, provenance).
 *
 * This port is the seam where the durable job system (module `jobs`,
 * mos-jobs — a LATER wave) subscribes: a durable worker persists job state
 * from these events and drives retries from the typed failures. The
 * in-memory double (test-doubles/in-memory-job-event-sink.ts) simply
 * records them; production wiring is a TL/composition-root concern.
 *
 * 1 public method (policy budget 12).
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
  RunProvenance,
  ResourceUsage,
  Timestamp,
  Version,
} from "@mos/contracts";

/** Lifecycle states of one engine job. */
export type EngineJobLifecycleState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out";

/**
 * The §30 observability record for one engine run. `actor` is the engine
 * execution authority itself ("engine-runner"): the frozen EngineJob shape
 * carries no submitter identity — that arrives with the durable jobs wave
 * (mos-jobs), which will enrich the record at the seam. `provenance` is
 * `null` only when the adapter never produced one (pre-flight failures).
 */
export interface EngineRunObservabilityRecord {
  readonly runId: EngineJobId;
  readonly capabilityId: CapabilityId;
  /** The capability CONTRACT version the run pinned (§30 contract version). */
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
  readonly lifecycle: EngineJobLifecycleState;
  readonly recordedAt: Timestamp;
}

/** Job accepted by the runner (validation passed, about to be policy-checked). */
export interface JobQueuedEvent {
  readonly type: "job-queued";
  readonly jobId: EngineJobId;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly queuedAt: Timestamp;
}

/** Adapter invocation started inside the sandbox. */
export interface JobRunningEvent {
  readonly type: "job-running";
  readonly jobId: EngineJobId;
  readonly startedAt: Timestamp;
}

/** Terminal event: the run ended (succeeded / failed / timed_out). */
export interface JobCompletedEvent {
  readonly type: "job-succeeded" | "job-failed" | "job-timed-out";
  readonly jobId: EngineJobId;
  readonly record: EngineRunObservabilityRecord;
}

/** Every event the runner emits, in order, for one job. */
export type JobEvent =
  | JobQueuedEvent
  | JobRunningEvent
  | JobCompletedEvent;

/** Consumer of engine job lifecycle events (the durable-job seam). */
export interface JobEventSinkPort {
  /** Called synchronously by the runner as the lifecycle advances. */
  onJobEvent(event: JobEvent): void;
}
