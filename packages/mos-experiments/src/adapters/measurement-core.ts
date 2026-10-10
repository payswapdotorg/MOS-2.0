/**
 * BRIDGE-003 measurement core — the durable lifecycle segments
 * (advanceMeasurement / analyse / closeExperiment).
 *
 * DURABLE EXECUTION (§26): the long-running measurement segment rides the
 * REAL `@mos/jobs` JobQueuePort. The WORKER claims the job through the
 * queue's own leased claim surface (claimNextRunnable — no
 * synchronous-HTTP durable claims exist anywhere); `advanceMeasurement`
 * validates the claim (the job's key must match the experiment, the lease
 * token must be the job's LIVE lease), advances `created` → `running`,
 * and then either:
 * - fails the job typed-RETRIABLE (`measurement-window-not-elapsed`, the
 *   declared backoff — the worker retries after the backoff; the
 *   experiment stays `running`), or
 * - when the window has elapsed: folds the platform-said observations of
 *   the REAL distribution observation log within the window into a
 *   measured evidence record, completes the job with the §30
 *   observability (run id, executor, artifact refs, duration, warnings,
 *   provenance), and advances the experiment to `measured`.
 *
 * ANALYSE appends the outcome record over the LATEST measured evidence
 * (the analysis verdict — see domain/outcome-analysis.ts). CLOSE is the
 * terminal closure: `closed` (summary) or the FIRST-CLASS `abandoned`
 * (§18: reason + justifying snapshot — the abandoned path stays auditable
 * forever through the append-only versions). Queue-mutation errors
 * propagate typed (disclosed: an experiment-side transition that
 * completed just before a stale-lease mutation failure stays recorded —
 * the job's own append-only history carries the discrepancy; the worker
 * resolves the job through the queue's dead-letter path).
 */

import type { TenantScope, Timestamp, Version } from "@mos/contracts";
import type { JobQueuePort } from "@mos/jobs";
import type { DurableJobRecord } from "@mos/jobs";

import { EXPERIMENT_JOB_CONTRACT_VERSION, REAL_EXPERIMENT_BOUNDARY_STATEMENT } from "../contracts/experiment-boundary.js";
import type { RealExperimentRecord } from "../contracts/experiment-record.js";
import type { ExperimentJobCitation } from "../contracts/experiment-boundary.js";
import type {
  AdvanceMeasurementFailure,
  AdvanceMeasurementOutcome,
  ExperimentJobClaim,
} from "../contracts/authority-port.js";
import type { MeasuredExperimentEvidence } from "../contracts/evidence.js";
import type { DistributionObservationSource } from "../contracts/authority-seams.js";
import type { ExperimentId } from "../contracts/ids.js";
import { experimentJobKeyOf } from "../contracts/ids.js";
import {
  evidenceUncertaintyOf,
  observationCitationsOf,
  observationPurityViolations,
  observationsWithinWindow,
} from "../domain/evidence-folding.js";
import { digestOf } from "../domain/digest.js";
import type { RealExperimentStore } from "../store/experiment-store.js";
import { payloadOf } from "../store/experiment-store.js";
import type {
  ExperimentEvidenceStore,
  ExperimentOutcomeStore,
} from "../store/measurement-store.js";

// ---------------------------------------------------------------------------
// The declared core dependencies
// ---------------------------------------------------------------------------

/** Dependencies of the measurement core (all injected). */
export interface MeasurementCoreDeps {
  readonly distribution: DistributionObservationSource;
  readonly jobs: JobQueuePort;
  readonly store: RealExperimentStore;
  readonly evidenceStore: ExperimentEvidenceStore;
  readonly outcomeStore: ExperimentOutcomeStore;
  readonly clock: () => Timestamp;
}

// ---------------------------------------------------------------------------
// The durable measurement segment
// ---------------------------------------------------------------------------

/** Run the durable measurement segment under a REAL queue claim. */
export async function advanceExperimentMeasurement(
  deps: MeasurementCoreDeps,
  scope: TenantScope,
  experimentId: ExperimentId,
  claim: ExperimentJobClaim,
): Promise<AdvanceMeasurementOutcome> {
  const failureOf = (kind: AdvanceMeasurementFailure["kind"], reason: string) =>
    ({ ok: false, error: { kind, reason } }) as const;

  // — resolve the experiment chain (cross-tenant ≡ unknown, §31) —
  const record = deps.store.getExperiment(scope, experimentId);
  if (record === undefined) {
    return failureOf(
      "experiment-unresolved",
      "no experiment chain resolves for this tenant scope (§31 — cross-tenant ≡ unknown)",
    );
  }
  // — resolve the job through the REAL queue and validate the claim —
  const job = deps.jobs.getJob(scope, claim.jobId as never);
  if (job === undefined) {
    return failureOf("job-not-resolvable", `durable job ${claim.jobId} does not resolve in this tenant scope through the REAL queue`);
  }
  if (String(job.jobKey) !== experimentJobKeyOf(experimentId)) {
    return failureOf(
      "job-experiment-mismatch",
      `durable job ${claim.jobId} (key ${String(job.jobKey)}) does not belong to experiment ${String(experimentId)} (expected key ${experimentJobKeyOf(experimentId)})`,
    );
  }
  if (job.lease === null || String(job.lease.token) !== claim.leaseToken) {
    return failureOf("claim-stale", `the presented lease token is not the job's live lease — claim the job through the queue (claimNextRunnable) and renew before expiry`);
  }
  if (record.status !== "created" && record.status !== "running") {
    return failureOf(
      "experiment-not-runnable",
      `the experiment's latest status is "${record.status}" — only created/running experiments advance their measurement segment`,
    );
  }

  // — advance to `running` (the first claim) —
  let current = record;
  if (record.status === "created") {
    const running = successorOf(deps, record, {
      status: "running",
      job: jobCitationOf(job, record),
    });
    const appended = deps.store.appendLifecycleVersion(scope, experimentId, running);
    if (!appended.ok) {
      return failureOf("evidence-store-rejection", appended.reason);
    }
    current = appended.record;
  }

  // — the window check: not elapsed → typed retriable failure (backoff) —
  const windowEndMs = Date.parse(String(current.measurement.windowEnd));
  const nowMs = Date.parse(deps.clock());
  if (nowMs < windowEndMs) {
    try {
      deps.jobs.failJob(
        { scope, jobId: job.id, leaseToken: job.lease.token },
        {
          code: "measurement-window-not-elapsed",
          message: `the declared measurement window ends at ${String(current.measurement.windowEnd)} — the measurement segment retries on the declared backoff (now ${deps.clock()})`,
          retriable: true,
          terminalStatus: "failed",
        },
        { executor: "mos-experiments-measurement" },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return failureOf("queue-mutation-failed", `the REAL queue rejected the retriable window failure: ${reason}`);
    }
    return {
      ok: true,
      value: { experiment: current, jobOutcome: "retry-scheduled", evidence: null },
    };
  }

  // — the window has elapsed: fold the platform-said observations —
  const allObservations = deps.distribution.listObservations(scope.tenantId, {
    subjectRef: current.measurement.subjectRef,
  });
  const withinWindow = observationsWithinWindow(
    allObservations,
    { windowStart: String(current.measurement.windowStart), windowEnd: String(current.measurement.windowEnd) },
    current.measurement.subjectRef,
  );
  const citations = observationCitationsOf(withinWindow);
  const purityViolations = observationPurityViolations(citations);
  if (purityViolations.length > 0) {
    return failureOf(
      "evidence-store-rejection",
      `the folded platform-said observations failed the purity guard: ${purityViolations.join("; ")}`,
    );
  }
  const latestEvidence = deps.evidenceStore.getEvidence(scope, experimentId);
  if (latestEvidence === undefined) {
    return failureOf("evidence-store-rejection", "the experiment's declared evidence record does not resolve — store corruption territory (never silently defaulted)");
  }
  const uncertainty = evidenceUncertaintyOf(citations);
  const measuredDraft: MeasuredExperimentEvidence = {
    id: experimentId,
    version: (latestEvidence.version + 1) as Version,
    tenantId: scope.tenantId,
    kind: "measured-evidence",
    window: { windowStart: current.measurement.windowStart, windowEnd: current.measurement.windowEnd },
    subjectRef: current.measurement.subjectRef,
    publicationRef: { publicationId: current.distribution.publicationId, providerId: current.distribution.providerId },
    observations: citations,
    uncertainty,
    measuredAt: deps.clock(),
    counterfactual: false,
    evidenceKind: "platform-said-observation",
    boundaryStatement: REAL_EXPERIMENT_BOUNDARY_STATEMENT,
    evidenceDigest: "",
  };
  const sealedMeasured: MeasuredExperimentEvidence = {
    ...measuredDraft,
    evidenceDigest: digestOf(((): unknown => {
      const { evidenceDigest: _digest, ...payload } = measuredDraft;
      return payload;
    })()),
  };
  const appendedEvidence = deps.evidenceStore.appendMeasuredVersion(scope, experimentId, sealedMeasured);
  if (!appendedEvidence.ok) {
    return failureOf("evidence-store-rejection", appendedEvidence.reason);
  }

  // — complete the job with the §30 observability —
  try {
    deps.jobs.completeJob(
      { scope, jobId: job.id, leaseToken: job.lease.token },
      {
        executor: "mos-experiments-measurement",
        runId: String(experimentId),
        engineId: null,
        engineVersion: null,
        capabilityId: null,
        capabilityVersion: null,
        outputArtifactRefs: [structuredClone(current.distribution.artifact)],
        durationMs: Math.max(0, nowMs - Date.parse(String(current.createdAt))),
        warnings: [],
        provenance: null,
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failureOf(
      "queue-mutation-failed",
      `the REAL queue rejected the completion (the measured evidence IS appended — the job's own append-only history carries the discrepancy; resolve through the queue's dead-letter path): ${reason}`,
    );
  }
  const completedJob = deps.jobs.getJob(scope, job.id);
  const measured = successorOf(deps, current, {
    status: "measured",
    job: jobCitationOf(completedJob ?? job, current),
    evidenceRef: { evidenceId: experimentId, version: appendedEvidence.record.version },
  });
  const appendedMeasured = deps.store.appendLifecycleVersion(scope, experimentId, measured);
  if (!appendedMeasured.ok) {
    return failureOf("evidence-store-rejection", appendedMeasured.reason);
  }
  return {
    ok: true,
    value: { experiment: appendedMeasured.record, jobOutcome: "completed", evidence: appendedEvidence.record },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** The §30 job citation view of one queue record (echoed at transitions). */
const jobCitationOf = (
  job: DurableJobRecord,
  record: RealExperimentRecord,
): ExperimentJobCitation => ({
  experimentId: record.id,
  jobId: String(job.id),
  jobKey: String(job.jobKey),
  kind: record.job?.kind ?? "benchmark",
  contractVersion: EXPERIMENT_JOB_CONTRACT_VERSION,
  enqueuedAt: record.job?.enqueuedAt ?? record.createdAt,
  jobStatus: job.status,
  attemptCount: job.attemptCount,
});

/** Build a lifecycle successor draft over the latest record. */
const successorOf = (
  deps: MeasurementCoreDeps,
  latest: RealExperimentRecord,
  changes: Partial<Pick<RealExperimentRecord, "status" | "closure" | "analysis" | "job" | "evidenceRef">>,
): RealExperimentRecord => {
  const draft: RealExperimentRecord = {
    ...latest,
    ...changes,
    version: latest.version + 1,
    priorVersion: latest.version,
  };
  return { ...draft, experimentDigest: digestOf(payloadOf(draft)) };
};