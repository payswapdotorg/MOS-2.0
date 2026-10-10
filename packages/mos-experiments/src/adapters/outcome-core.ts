/**
 * BRIDGE-003 outcome + closure core — the analysis segment (analyse) and
 * the terminal closure segment (closeExperiment: closed | the FIRST-CLASS
 * abandoned, §18). Split from measurement-core.ts to respect the managed
 * file line budget (the W3-A/W5-A split precedent); behavior-identical.
 *
 * ANALYSE appends the outcome record over the LATEST measured evidence
 * (the analysis verdict — domain/outcome-analysis.ts); CLOSE terminates
 * the chain with append-only history. See measurement-core.ts for the
 * durable measurement segment.
 */

import type { IdentityRef, TenantScope, Timestamp, Version } from "@mos/contracts";
import type { JobQueuePort } from "@mos/jobs";

import type { RealExperimentRecord, ExperimentAbandonmentSnapshot } from "../contracts/experiment-record.js";
import type { AnalyseOutcomeFailure, CloseExperimentFailure, ExperimentClosureInput } from "../contracts/authority-port.js";
import type { ExperimentOutcomeRecord } from "../contracts/outcome.js";
import type { ExperimentId } from "../contracts/ids.js";
import { assembleOutcomeRecord, projectOutcomeObservation } from "../domain/outcome-analysis.js";
import { digestOf } from "../domain/digest.js";
import type { RealExperimentStore } from "../store/experiment-store.js";
import { payloadOf } from "../store/experiment-store.js";
import type { ExperimentEvidenceStore, ExperimentOutcomeStore } from "../store/measurement-store.js";
import type { DistributionObservationSource } from "../contracts/authority-seams.js";

/** Dependencies of the outcome/closure core (all injected). */
export interface OutcomeCoreDeps {
  readonly distribution: DistributionObservationSource;
  readonly jobs: JobQueuePort;
  readonly store: RealExperimentStore;
  readonly evidenceStore: ExperimentEvidenceStore;
  readonly outcomeStore: ExperimentOutcomeStore;
  readonly clock: () => Timestamp;
}

// ---------------------------------------------------------------------------
// The analysis segment
// ---------------------------------------------------------------------------

/** Append the analysis outcome record over the latest measured evidence. */
export async function analyseExperimentOutcome(
  deps: OutcomeCoreDeps,
  scope: TenantScope,
  experimentId: ExperimentId,
  actor: IdentityRef,
): Promise<
  | { readonly ok: true; readonly value: { readonly outcome: ExperimentOutcomeRecord; readonly experiment: RealExperimentRecord } }
  | { readonly ok: false; readonly error: AnalyseOutcomeFailure }
> {
  const record = deps.store.getExperiment(scope, experimentId);
  if (record === undefined) {
    return { ok: false, error: { kind: "experiment-unresolved", reason: "no experiment chain resolves for this tenant scope (§31)" } };
  }
  if (record.status !== "measured" && record.status !== "analysed") {
    return {
      ok: false,
      error: {
        kind: "experiment-not-measured",
        reason: `the experiment's latest status is "${record.status}" — only measured experiments analyse (run the durable measurement segment first)`,
      },
    };
  }
  const evidence = deps.evidenceStore.getEvidence(scope, experimentId);
  if (evidence === undefined || evidence.kind !== "measured-evidence") {
    return {
      ok: false,
      error: {
        kind: "no-measured-evidence",
        reason: "no measured evidence version resolves for this experiment — the durable measurement segment appends it",
      },
    };
  }
  if (evidence.observations.length === 0) {
    // An outcome over zero observations would be a FAKE measurement basis
    // (the LAB-018 no-calibration-evidence precedent) — fail closed.
    return {
      ok: false,
      error: {
        kind: "empty-measured-evidence",
        reason: "the measured evidence folds zero platform-said observations — an outcome over an empty basis would be fabricated (re-run the segment after observations arrive)",
      },
    };
  }
  const previous = deps.outcomeStore.getOutcome(scope, experimentId);
  const outcomeDraft = assembleOutcomeRecord({
    experimentId,
    tenantId: String(scope.tenantId),
    experimentVersion: record.version,
    evidence,
    counterfactualExpectation: record.labCandidate.expectations,
    labCandidateRef: `benchmark:${record.labCandidate.citation.benchmarkId}:v${String(record.labCandidate.citation.benchmarkVersion)}:${record.labCandidate.citation.candidateKey}`,
    rewardSpecCitation: {
      missionRef: record.mission.missionRef,
      missionVersion: record.mission.missionVersion,
      rewardSpecVersion: record.mission.rewardSpecVersion,
    },
    measurement: {
      niche: record.measurement.niche,
      platform: record.measurement.platform,
      regime: record.measurement.regime,
      windowEnd: record.measurement.windowEnd,
    },
    analysedAt: deps.clock(),
    digest: "",
  });
  const version: Version = (previous === undefined ? 1 : previous.version + 1) as Version;
  const withVersion: ExperimentOutcomeRecord = { ...outcomeDraft, version };
  const sealed: ExperimentOutcomeRecord = {
    ...withVersion,
    outcomeDigest: digestOf(((): unknown => {
      const { outcomeDigest: _digest, ...payload } = withVersion;
      return payload;
    })()),
  };
  try {
    let storedOutcome: ExperimentOutcomeRecord;
    if (previous === undefined) {
      storedOutcome = deps.outcomeStore.appendFirstVersion(sealed);
    } else {
      const appended = deps.outcomeStore.appendSuccessorVersion(scope, experimentId, sealed);
      if (!appended.ok) {
        return { ok: false, error: { kind: "outcome-store-rejection", reason: appended.reason } };
      }
      storedOutcome = appended.record;
    }
    const analysed = successorOf(deps, record, {
      status: "analysed",
      analysis: {
        outcomeId: experimentId,
        outcomeVersion: storedOutcome.version,
        evidenceVersion: evidence.version,
        analysedAt: deps.clock(),
      },
    });
    void actor; // §30 attribution rides the record's actor field (the binding principal); re-analysis attribution is the outcome record's own stamps.
    const appended = deps.store.appendLifecycleVersion(scope, experimentId, analysed);
    if (!appended.ok) {
      return { ok: false, error: { kind: "outcome-store-rejection", reason: appended.reason } };
    }
    return { ok: true, value: { outcome: storedOutcome, experiment: appended.record } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: "outcome-store-rejection", reason } };
  }
}

// ---------------------------------------------------------------------------
// The terminal closure segment
// ---------------------------------------------------------------------------

/** Close the experiment terminally (closed, or the first-class abandoned). */
export async function closeExperimentRecord(
  deps: OutcomeCoreDeps,
  scope: TenantScope,
  experimentId: ExperimentId,
  actor: IdentityRef,
  closure: ExperimentClosureInput,
): Promise<
  | { readonly ok: true; readonly value: { readonly experiment: RealExperimentRecord } }
  | { readonly ok: false; readonly error: CloseExperimentFailure }
> {
  const record = deps.store.getExperiment(scope, experimentId);
  if (record === undefined) {
    return { ok: false, error: { kind: "experiment-unresolved", reason: "no experiment chain resolves for this tenant scope (§31)" } };
  }
  if (record.status === "closed" || record.status === "abandoned") {
    return {
      ok: false,
      error: {
        kind: "experiment-already-terminal",
        reason: `the experiment's latest status is already "${record.status}" (terminal — append-only history preserves it forever)`,
      },
    };
  }
  if (
    closure.kind === "abandoned" &&
    (closure.abandonment.reason.trim() === "" || closure.abandonment.summary.trim() === "")
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid-closure-request",
        reason: "an abandonment requires a non-blank reason AND summary (the §18 auditable justification)",
      },
    };
  }
  // The abandonment snapshot's justifying citations derive from the CURRENT
  // chain state (never caller-claimed): the latest evidence + the job echo.
  const latestEvidence = deps.evidenceStore.getEvidence(scope, experimentId);
  const job = record.job === null ? null : deps.jobs.getJob(scope, record.job.jobId as never) ?? null;
  const closedAt = deps.clock();
  const abandonment: ExperimentAbandonmentSnapshot | null =
    closure.kind === "abandoned"
      ? {
          ...closure.abandonment,
          evidenceRef:
            latestEvidence === undefined
              ? null
              : { evidenceId: latestEvidence.id, version: latestEvidence.version },
          jobEcho: job === null ? null : { status: job.status, attemptCount: job.attemptCount },
          abandonedAt: closedAt,
        }
      : null;
  const successor = successorOf(deps, record, {
    status: closure.kind === "abandoned" ? "abandoned" : "closed",
    closure: {
      kind: closure.kind,
      closedBy: actor,
      summary: closure.kind === "closed" ? closure.summary : closure.abandonment.summary,
      abandonment,
      closedAt,
    },
    job: job === null ? record.job : jobCitationOf(job, record),
  });
  const appended = deps.store.appendLifecycleVersion(scope, experimentId, successor);
  if (!appended.ok) {
    return { ok: false, error: { kind: "experiment-store-rejection", reason: appended.reason } };
  }
  return { ok: true, value: { experiment: appended.record } };
}

// ---------------------------------------------------------------------------
// Shared local helpers
// ---------------------------------------------------------------------------

/** Build a lifecycle successor draft over the latest record. */
const successorOf = (
  deps: OutcomeCoreDeps,
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

/** The §30 job citation view of one queue record (echoed at transitions). */
const jobCitationOf = (
  job: { readonly id: string; readonly jobKey: string; readonly status: string; readonly attemptCount: number },
  record: RealExperimentRecord,
): import("../contracts/experiment-boundary.js").ExperimentJobCitation => ({
  experimentId: record.id,
  jobId: String(job.id),
  jobKey: String(job.jobKey),
  kind: record.job?.kind ?? "benchmark",
  contractVersion: record.job?.contractVersion ?? 1,
  enqueuedAt: record.job?.enqueuedAt ?? record.createdAt,
  jobStatus: job.status,
  attemptCount: job.attemptCount,
});

/**
 * Project one outcome record onto the LAB-018 boundary observation (the
 * authority's getOutcomeObservation core; measurement context from the
 * experiment record's own segments). `null` when the outcome record's
 * tenant does not match the requesting scope (§31 — cross-tenant ≡
 * unknown, no existence leaks).
 */
export const outcomeObservationOf = (
  scope: TenantScope,
  outcome: ExperimentOutcomeRecord,
  record: RealExperimentRecord,
): ReturnType<typeof projectOutcomeObservation> | null => {
  if (String(outcome.tenantId) !== String(scope.tenantId)) {
    return null;
  }
  return projectOutcomeObservation(outcome, {
    niche: record.measurement.niche,
    platform: record.measurement.platform,
    regime: record.measurement.regime,
    windowEnd: record.measurement.windowEnd,
    publicationId: record.distribution.publicationId,
  });
};