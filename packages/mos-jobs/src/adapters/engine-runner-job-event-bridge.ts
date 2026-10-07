/**
 * The ENG-003 runner-seam bridge adapter (JOBS-001) — §30 enrichment +
 * durable materialization of runner completion events.
 *
 * This adapter implements the runner event sink shape
 * (contracts/runner-events.ts — structurally the @mos/engines
 * JobEventSinkPort, pinned by compat/engines-event-compat.ts) and
 * materializes the runner's COMPLETION events as durable job lifecycle
 * events:
 *
 * - `job-succeeded` → completeJob with the full §30 observability record
 *   (run id, engine/capability identity + versions, input/output artifact
 *   refs, duration, cost, resource usage, warnings, provenance);
 * - `job-failed` / `job-timed-out` → failJob with the TYPED failure
 *   (code/message/retriable/details — the ENG-003 vocabulary), so retries
 *   are driven from the failure's `retriable` flag against the job's
 *   declared retry policy, and exhaustion dead-letters with full history.
 *
 * §30 ACTOR ENRICHMENT: the runner's events attribute the action to the
 * "engine-runner" actor (the EngineJob shape carries no submitter
 * identity). The bridge drives the queue mutation with
 * `executor: "engine-runner"` and the queue enriches it with the
 * SUBMITTING actor from the job record — the completed attribution reads
 * { executor: "engine-runner", submittedBy: <the enqueue-time actor> }.
 *
 * WIRING CONTRACT (documented for consumers): the bridge is constructed
 * per tenant scope; the worker sets `EngineJob.id = durableJobRecord.id`
 * (string identity) and submits with this sink wired as the runner's
 * event sink, while HOLDING the claim. Because the in-memory runner emits
 * synchronously inside submit(), the lease is live at event time and the
 * bridge's claim-held mutation succeeds — the worker loop must NOT also
 * call complete/fail (the second mutation fails closed with a typed
 * job-not-running error).
 *
 * The sink contract is void-returning: this adapter NEVER throws into the
 * runner. Events that cannot be materialized (unknown job id, job not
 * running under a claim — e.g. cancelled mid-run — or a typed queue
 * rejection) are buffered in `conflicts` for the composition root to
 * drain and alert on.
 */

import type { TenantScope } from "@mos/contracts";

import type { DurableJobId } from "../contracts/ids.js";
import type {
  RunnerJobEvent,
  RunnerJobEventSink,
  RunnerJobCompletedEvent,
  RunnerRunObservabilityRecord,
} from "../contracts/runner-events.js";
import type {
  JobCompletion,
  TypedJobFailure,
} from "../contracts/durable-job.js";
import type { JobClaimRef, JobQueuePort } from "../ports/job-queue.port.js";
import { JobQueueError } from "../domain/errors.js";

/** Options for the bridge. */
export interface EngineRunnerJobEventBridgeOptions {
  /** The durable job queue being driven. */
  readonly queue: JobQueuePort;
  /** The tenant scope this bridge resolves runner events in (§31). */
  readonly scope: TenantScope;
}

/** A runner event the bridge could not materialize (drained + alerted). */
export interface UnresolvedRunnerEvent {
  readonly event: RunnerJobEvent;
  /** Human-readable reason. */
  readonly reason: string;
  /** Typed queue error code when a queue mutation was rejected. */
  readonly code?: string;
}

/** Runtime observed counts (the non-terminal runner events are counted). */
export interface BridgeEventCounts {
  readonly queued: number;
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly timedOut: number;
}

/** The bridge: a runner event sink plus inspection surface. */
export interface EngineRunnerJobEventBridge extends RunnerJobEventSink {
  /** Runner events that could not be materialized, in arrival order. */
  readonly conflicts: readonly UnresolvedRunnerEvent[];
  /** Observed event counts. */
  readonly counts: BridgeEventCounts;
}

/**
 * Creates the ENG-003 runner-seam bridge adapter.
 */
export function createEngineRunnerJobEventBridge(
  options: EngineRunnerJobEventBridgeOptions,
): EngineRunnerJobEventBridge {
  const queue = options.queue;
  const scope = options.scope;
  const conflicts: UnresolvedRunnerEvent[] = [];
  const counts = { queued: 0, running: 0, succeeded: 0, failed: 0, timedOut: 0 };

  function buffer(event: RunnerJobEvent, reason: string, code?: string): void {
    conflicts.push({ event, reason, ...(code === undefined ? {} : { code }) });
  }

  /**
   * The documented identity bridge: EngineJob.id string-equals the
   * DurableJobRecord.id (single cast at the boundary, W2-C precedent).
   */
  function jobIdOf(event: RunnerJobEvent): DurableJobId {
    return event.jobId as unknown as DurableJobId;
  }

  function completionFrom(record: RunnerRunObservabilityRecord): JobCompletion {
    return {
      executor: "engine-runner",
      runId: record.runId as string,
      engineId: record.engineId,
      engineVersion: record.engineVersion,
      capabilityId: record.capabilityId,
      capabilityVersion: record.capabilityVersion,
      outputArtifactRefs: record.outputArtifactRefs,
      durationMs: record.durationMs,
      cost: record.cost,
      resourceUsage: record.resourceUsage,
      warnings: record.warnings,
      provenance: record.provenance,
    };
  }

  function failureFrom(
    record: RunnerRunObservabilityRecord,
    terminalStatus: "failed" | "timed_out",
  ): TypedJobFailure {
    return {
      code: record.failure?.code ?? "engine-run-unfinished",
      message:
        record.failure?.message
        ?? "the runner reported a terminal failure without a typed failure record",
      retriable: record.failure?.retriable ?? false,
      details: record.failure?.details,
      terminalStatus,
    };
  }

  function materializeCompletion(event: RunnerJobCompletedEvent): void {
    const jobId = jobIdOf(event);
    const job = queue.getJob(scope, jobId);
    if (job === undefined) {
      buffer(event, `no durable job in scope for runner job ${event.jobId as string}`, "unknown-job");
      return;
    }
    if (job.status !== "running" || job.lease === null) {
      buffer(
        event,
        `durable job ${job.id as string} is ${job.status} (not held under a claim); runner completion not materialized`,
        "job-not-running",
      );
      return;
    }
    const claim: JobClaimRef = {
      scope: job.scope,
      jobId: job.id,
      leaseToken: job.lease.token,
    };

    try {
      if (event.type === "job-succeeded") {
        queue.completeJob(claim, completionFrom(event.record));
      } else {
        const terminalStatus = event.type === "job-timed-out" ? "timed_out" : "failed";
        if (event.record.failure === null) {
          buffer(
            event,
            "runner completion event carries no typed failure record; refusing to guess",
          );
          return;
        }
        queue.failJob(claim, failureFrom(event.record, terminalStatus), {
          executor: "engine-runner",
        });
      }
    } catch (error) {
      if (error instanceof JobQueueError) {
        buffer(event, error.message, error.code);
        return;
      }
      buffer(event, `unexpected bridge failure: ${String(error)}`);
    }
  }

  const bridge: EngineRunnerJobEventBridge = {
    onJobEvent(event: RunnerJobEvent): void {
      switch (event.type) {
        case "job-queued":
          counts.queued += 1;
          return;
        case "job-running":
          counts.running += 1;
          return;
        case "job-succeeded":
          counts.succeeded += 1;
          break;
        case "job-failed":
          counts.failed += 1;
          break;
        case "job-timed-out":
          counts.timedOut += 1;
          break;
      }
      materializeCompletion(event);
    },

    get conflicts(): readonly UnresolvedRunnerEvent[] {
      return conflicts;
    },

    get counts(): BridgeEventCounts {
      return { ...counts };
    },
  };

  return bridge;
}
