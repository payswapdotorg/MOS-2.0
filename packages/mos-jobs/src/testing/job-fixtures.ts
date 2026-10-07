/**
 * Shared deterministic test fixtures for @mos/jobs tests (JOBS-001).
 *
 * TEST FIXTURES ONLY: fixed injectable clocks (ISO + epoch ms), a
 * counting id/token factory queue, valid submissions, artifact refs, a
 * mirrored runner-event factory, and a tiny synchronous fake "runner"
 * that emits ENG-003-shaped events to a sink (the REAL runner round-trip
 * is covered by compat/engine-runner-bridge.test.ts).
 */

import type {
  ArtifactRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import type {
  DurableJobSubmission,
  JobSubmitterActor,
  TypedJobFailure,
} from "../contracts/durable-job.js";
import type { JobKey } from "../contracts/ids.js";
import type {
  RunnerJobCompletedEvent,
  RunnerJobEvent,
  RunnerJobQueuedEvent,
  RunnerJobRunningEvent,
  RunnerRunObservabilityRecord,
} from "../contracts/runner-events.js";
import { createDurableJobQueue } from "../adapters/durable-job-queue.js";
import { createInMemoryDurableJobStore } from "../adapters/in-memory-durable-job-store.js";
import type { JobQueuePort } from "../ports/job-queue.port.js";

/** Fixed ISO stamp for every event/record the fixtures produce. */
export const FIXED_CLOCK = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;

/** Cast-once helpers for branded fixture values. */
export const tenantId = (value: string): TenantId => value as TenantId;
export const jobKeyOf = (value: string): JobKey => value as JobKey;
export const workspaceIdOf = (value: string): TenantScope["workspaceId"] =>
  value as TenantScope["workspaceId"];
export const engineJobId = (value: string): RunnerRunObservabilityRecord["runId"] =>
  value as RunnerRunObservabilityRecord["runId"];

export const TENANT_A = tenantId("tenant:a");
export const TENANT_B = tenantId("tenant:b");

export const SCOPE_A: TenantScope = { tenantId: TENANT_A };
export const SCOPE_B: TenantScope = { tenantId: TENANT_B };

/** A controllable epoch-ms clock (tests advance time explicitly). */
export interface FakeClock {
  now(): number;
  advance(ms: number): void;
}

export function createFakeClock(startMs = 0): FakeClock {
  let time = startMs;
  return {
    now: () => time,
    advance(ms: number): void {
      time += ms;
    },
  };
}

/** Sequential ids: job-1, job-2, ... / lease-a, lease-b, ... */
export function countingIds(): {
  jobId: () => string;
  leaseToken: () => string;
} {
  let jobCounter = 0;
  let leaseCounter = 0;
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return {
    jobId: () => `job-${(jobCounter += 1)}`,
    leaseToken: () => `lease-${letters[(leaseCounter += 1) - 1] ?? "z"}`,
  };
}

/** Builds the queue over the in-memory store with deterministic seams. */
export function makeQueue(options: {
  clock?: FakeClock;
  leaseDurationMs?: number;
} = {}): JobQueuePort {
  const fake = options.clock ?? createFakeClock();
  const ids = countingIds();
  return createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock: FIXED_CLOCK,
    now: () => fake.now(),
    leaseDurationMs: options.leaseDurationMs ?? 60_000,
    jobIdFactory: ids.jobId,
    leaseTokenFactory: ids.leaseToken,
  });
}

/** One well-formed artifact ref (n-th). */
export function makeArtifactRef(n: number, tenantId: TenantId = TENANT_A): ArtifactRef {
  return {
    artifactId: `artifact:input-${n}` as ArtifactRef["artifactId"],
    version: 1 as Version,
    tenantId,
    digest: `sha256:input-${n}` as ArtifactRef["digest"],
    type: "video",
    storageRef: `storage://input-${n}` as ArtifactRef["storageRef"],
    rightsRef: "rights:input" as ArtifactRef["rightsRef"],
    provenanceRef: "provenance:input" as ArtifactRef["provenanceRef"],
  };
}

const SUBMITTER: JobSubmitterActor = { kind: "service", name: "studio-runtime" };

const BASE_SUBMISSION: Record<string, unknown> = {
  scope: SCOPE_A,
  jobKey: "render-episode-42",
  kind: "rendering",
  contractVersion: 1,
  submittedBy: SUBMITTER,
  inputArtifactRefs: [makeArtifactRef(1), makeArtifactRef(2)],
  parameters: { quality: "high" },
  retryPolicy: { maxAttempts: 1, backoffScheduleMs: [] },
};

/**
 * A valid submission with overrides (cast-once fixture pattern). The base
 * is DEEP-CLONED per call so tests that mutate their submission (or delete
 * fields to probe fail-closed validation) can never bleed into later tests.
 */
export function makeSubmission(
  overrides: Record<string, unknown> = {},
): DurableJobSubmission {
  return structuredClone({ ...BASE_SUBMISSION, ...overrides }) as unknown as DurableJobSubmission;
}

/** A typed failure (the ENG-003 vocabulary shape). */
export function makeFailure(
  overrides: Partial<TypedJobFailure> = {},
): TypedJobFailure {
  return {
    code: "engine-invocation-error",
    message: "adapter invocation failed: simulated",
    retriable: false,
    terminalStatus: "failed",
    ...overrides,
  };
}

/** A full §30 runner observability record with overrides. */
export function makeRunnerRecord(
  overrides: Partial<RunnerRunObservabilityRecord> = {},
): RunnerRunObservabilityRecord {
  return {
    runId: "job-1" as RunnerRunObservabilityRecord["runId"],
    capabilityId: "semantic_video_relevance" as RunnerRunObservabilityRecord["capabilityId"],
    capabilityVersion: 1 as Version,
    engineId: "engine:sandbox-alpha" as RunnerRunObservabilityRecord["engineId"],
    engineVersion: 1 as Version,
    actor: "engine-runner",
    inputArtifactRefs: [makeArtifactRef(1)],
    outputArtifactRefs: [makeArtifactRef(1)],
    durationMs: 42,
    resourceUsage: { cpuCoreSeconds: 1, gpuUnitSeconds: 0, memoryMbSeconds: 10 },
    cost: { amount: 1, currency: "USD" },
    warnings: [{ code: "slow-step", message: "step took longer than p95" }],
    failure: null,
    provenance: {
      engineId: "engine:sandbox-alpha" as RunnerRunObservabilityRecord["engineId"],
      engineVersion: 1 as Version,
      capabilityId: "semantic_video_relevance" as RunnerRunObservabilityRecord["capabilityId"],
      capabilityVersion: 1 as Version,
      modelIdentity: "checkpoint:test/sandbox-alpha@1",
      recordedAt: FIXED_CLOCK(),
    },
    lifecycle: "succeeded",
    recordedAt: FIXED_CLOCK(),
    ...overrides,
  } as RunnerRunObservabilityRecord;
}

/** A runner queued event. */
export function runnerQueuedEvent(
  jobId: string,
): RunnerJobQueuedEvent {
  return {
    type: "job-queued",
    jobId: jobId as RunnerJobQueuedEvent["jobId"],
    engineId: "engine:sandbox-alpha" as RunnerJobQueuedEvent["engineId"],
    engineVersion: 1 as Version,
    capabilityId: "semantic_video_relevance" as RunnerJobQueuedEvent["capabilityId"],
    capabilityVersion: 1 as Version,
    queuedAt: FIXED_CLOCK(),
  };
}

/** A runner running event. */
export function runnerRunningEvent(jobId: string): RunnerJobRunningEvent {
  return {
    type: "job-running",
    jobId: jobId as RunnerJobRunningEvent["jobId"],
    startedAt: FIXED_CLOCK(),
  };
}

/** A runner completion event (succeeded / failed / timed-out). */
export function runnerCompletedEvent(
  type: "job-succeeded" | "job-failed" | "job-timed-out",
  record: RunnerRunObservabilityRecord,
): RunnerJobCompletedEvent {
  return { type, jobId: record.runId, record };
}

/**
 * A tiny synchronous fake "runner" emitting ENG-003-shaped events to a
 * sink — for bridge tests that do not import @mos/engines. The REAL
 * runner round-trip is compat/engine-runner-bridge.test.ts.
 */
export interface FakeRunner {
  submit(jobId: string, outcome: "succeeded" | "failed" | "timed-out", failure?: TypedJobFailure | null): void;
  readonly emitted: readonly RunnerJobEvent[];
}

export function createFakeRunner(sink: { onJobEvent(event: RunnerJobEvent): void }): FakeRunner {
  const emitted: RunnerJobEvent[] = [];
  const lifecycleOf = (
    outcome: "succeeded" | "failed" | "timed-out",
  ): RunnerRunObservabilityRecord["lifecycle"] =>
    outcome === "succeeded" ? "succeeded" : outcome === "timed-out" ? "timed_out" : "failed";
  return {
    submit(jobId, outcome, failure = null) {
      const record = makeRunnerRecord({
        runId: jobId as RunnerRunObservabilityRecord["runId"],
        lifecycle: lifecycleOf(outcome),
        failure: failure === null
          ? null
          : {
            code: failure.code,
            message: failure.message,
            retriable: failure.retriable,
            ...(failure.details === undefined ? {} : { details: failure.details }),
          },
        ...(outcome === "succeeded" ? {} : { outputArtifactRefs: [] }),
      });
      const events: RunnerJobEvent[] = [
        runnerQueuedEvent(jobId),
        runnerRunningEvent(jobId),
        runnerCompletedEvent(
          outcome === "succeeded"
            ? "job-succeeded"
            : outcome === "timed-out"
              ? "job-timed-out"
              : "job-failed",
          record,
        ),
      ];
      for (const event of events) {
        emitted.push(event);
        sink.onJobEvent(event);
      }
    },
    get emitted(): readonly RunnerJobEvent[] {
      return emitted;
    },
  };
}
