/**
 * BRIDGE-003 binding core — the gate-ordered §24 chain (createBinding).
 *
 * ORDER (the work item's hard law, the BRIDGE-001 pattern):
 * 1. INTAKE (fail-closed shape validation — binding-validation.ts):
 *    nothing attributable happened on a caller-shape failure, so nothing
 *    is recorded (the W8-A discipline).
 * 2. LAB CANDIDATE resolvable: the cited LAB-017 benchmark record version
 *    + candidate key resolves through the declared lab-candidate reader
 *    seam; the snapshot's expectations must be counterfactual-labeled
 *    (runtime double-cast guard — lock rule 29).
 * 3. MISSION linkage: the EXACT cited mission record version resolves
 *    through the REAL missions repository seam; unknown ≡ cross-tenant;
 *    only an ACTIVE mission accepts a real experiment.
 * 4. POLICY verdict: the declared policy gate vets the
 *    real-experiment-approval action — GATES PRECEDE every downstream
 *    invocation (production validation, distribution reads, job
 *    enqueue): a denial means ZERO downstream calls (invocation-counting
 *    spy) and appends EXACTLY ONE audit record with the authority's
 *    denial attribution VERBATIM.
 * 5. RIGHTS frame: the declared frame resolves — every cited grant and
 *    consent record active in this tenant; a denial appends EXACTLY ONE
 *    audit record (verbatim resolutions).
 * 6. PRODUCTION request: the selected candidate must be the cited search
 *    result's OWN entry (identity comparison — lookalikes fail closed);
 *    canonical request versioned + tenant-consistent.
 * 7. DISTRIBUTION binding: the cited platform-confirmed publication
 *    resolves through the REAL distribution observation surfaces; the
 *    publication's artifact must match the caller's declared expected
 *    artifact EXACTLY (the REAL record is the authority for what was
 *    distributed).
 * 8. EXPERIMENT record: enqueue the durable measurement job on the REAL
 *    @mos/jobs queue, then mint the experiment record v1 (created) + the
 *    declared evidence record v1 — a queue enqueue failure records
 *    NOTHING (fail loud, typed).
 */

import { randomUUID } from "node:crypto";

import type { Timestamp, Version } from "@mos/contracts";
import type { DurableJobRecord, JobQueuePort } from "@mos/jobs";
import { jobKey as jobKeyBrand } from "@mos/jobs";

import {
  EXPERIMENT_JOB_CONTRACT_VERSION,
  EXPERIMENT_JOB_KIND,
  EXPERIMENT_JOB_RETRY_POLICY,
  REAL_EXPERIMENT_BOUNDARY_STATEMENT,
} from "../contracts/experiment-boundary.js";
import type {
  RealExperimentBindingOutcome,
  RealExperimentBindingRequest,
} from "../contracts/binding-request.js";
import type {
  ExperimentJobCitation,
  ExperimentMeasurementContext,
} from "../contracts/experiment-boundary.js";
import type {
  ExperimentDistributionSegment,
  ExperimentLabCandidateSegment,
  ExperimentPolicyGateSegment,
  ExperimentProductionSegment,
  ExperimentRightsGateSegment,
  RealExperimentBindingAuditRecord,
  RealExperimentRecord,
} from "../contracts/experiment-record.js";
import type { ExperimentMissionLinkage } from "../contracts/authority-seams.js";
import type { DeclaredMeasurementWindowRecord } from "../contracts/evidence.js";
import type {
  DistributionObservationSource,
  ExperimentMissionSource,
  ExperimentPolicyGatePort,
  ExperimentRightsGatePort,
} from "../contracts/authority-seams.js";
import type { LabCandidateReaderPort } from "../contracts/lab-candidate-seam.js";
import type { ExperimentId } from "../contracts/ids.js";
import { experimentJobKeyOf } from "../contracts/ids.js";
import {
  bindingRequestShapeViolations,
  isFiniteNumberGuard,
  productionCitationFailure,
} from "../domain/binding-validation.js";
import { digestOf } from "../domain/digest.js";
import type { RealExperimentStore } from "../store/experiment-store.js";
import { payloadOf } from "../store/experiment-store.js";
import type { ExperimentEvidenceStore } from "../store/measurement-store.js";

// ---------------------------------------------------------------------------
// The declared core dependencies
// ---------------------------------------------------------------------------

/** Dependencies of the binding core (all injected; no ambient authority). */
export interface BindingCoreDeps {
  readonly labCandidate: LabCandidateReaderPort;
  readonly missions: ExperimentMissionSource;
  readonly policyGate: ExperimentPolicyGatePort;
  readonly rightsGate: ExperimentRightsGatePort;
  readonly distribution: DistributionObservationSource;
  readonly jobs: JobQueuePort;
  readonly store: RealExperimentStore;
  readonly evidenceStore: ExperimentEvidenceStore;
  readonly clock: () => Timestamp;
  readonly nextExperimentId: () => ExperimentId;
  readonly nextAuditId: () => string;
}

// ---------------------------------------------------------------------------
// The gate-ordered chain
// ---------------------------------------------------------------------------

/** Run the §24 binding chain (the createBinding core). */
export async function createRealExperimentBinding(
  deps: BindingCoreDeps,
  request: RealExperimentBindingRequest,
): Promise<RealExperimentBindingOutcome> {
  // — 1. INTAKE (fail-closed shape validation; nothing recorded) —
  const violations = bindingRequestShapeViolations(request);
  if (violations.length > 0) {
    return {
      ok: false,
      error: {
        kind: "invalid-binding-request",
        reason: violations.join("; "),
      },
    };
  }
  const scope = request.scope;
  const experimentId = deps.nextExperimentId();
  const clientJobKey = experimentJobKeyOf(experimentId);

  // — 2. LAB CANDIDATE resolvable (nothing recorded on failure) —
  const snapshot = await deps.labCandidate.getLabCandidate(scope, request.labCandidate);
  if (snapshot === null) {
    return {
      ok: false,
      error: {
        kind: "lab-candidate-unresolved",
        reason: `lab candidate benchmark:${request.labCandidate.benchmarkId}:v${String(request.labCandidate.benchmarkVersion)}:${request.labCandidate.candidateKey} does not resolve in this tenant scope (unknown ≡ cross-tenant, §31) — unresolvable refs are never fabricated`,
      },
    };
  }
  if (snapshot.expectations.counterfactual !== true) {
    // Runtime double-cast guard (lock rule 29): only counterfactual-labeled
    // lab predictions are citable — anything else fails closed.
    return {
      ok: false,
      error: {
        kind: "lab-candidate-not-counterfactual",
        reason: "the resolved lab candidate's expectations are not counterfactual-labeled — only frozen counterfactual benchmark predictions are experiment-bindable (lock rule 29)",
      },
    };
  }
  if (
    !isFiniteNumberGuard(snapshot.expectations.expectedReward) ||
    !isFiniteNumberGuard(snapshot.expectations.interval.lower) ||
    !isFiniteNumberGuard(snapshot.expectations.interval.upper) ||
    snapshot.expectations.interval.lower > snapshot.expectations.interval.upper
  ) {
    return {
      ok: false,
      error: {
        kind: "lab-candidate-not-counterfactual",
        reason: "the resolved lab candidate's expectations are malformed (non-finite numbers or inverted interval) — W9-B D5 finite guards fail closed",
      },
    };
  }
  const labSegment: ExperimentLabCandidateSegment = {
    citation: { ...request.labCandidate },
    expectations: structuredClone(snapshot.expectations),
    disclosure: snapshot.disclosure,
    benchmarkedAt: snapshot.benchmarkedAt,
    citedAt: deps.clock(),
  };

  // — 3. MISSION linkage (nothing recorded on failure) —
  const mission = deps.missions.getMission(request.mission.missionRef, request.mission.missionVersion);
  if (mission === null || String(mission.tenantId) !== String(scope.tenantId)) {
    return {
      ok: false,
      error: {
        kind: "mission-unresolved",
        reason: `mission ${String(request.mission.missionRef)}@v${String(request.mission.missionVersion)} does not resolve in this tenant scope (unknown ≡ cross-tenant, §31)`,
      },
    };
  }
  if (mission.status !== "active") {
    return {
      ok: false,
      error: {
        kind: "mission-not-active",
        reason: `mission ${String(request.mission.missionRef)}@v${String(request.mission.missionVersion)} is "${mission.status}" — only an active mission accepts a real experiment binding`,
      },
    };
  }
  const missionLinkage: ExperimentMissionLinkage = {
    missionRef: String(request.mission.missionRef),
    missionVersion: mission.version,
    rewardSpecVersion: mission.rewardSpec.version,
    missionStatus: mission.status,
    linkedAt: deps.clock(),
  };

  /** Append EXACTLY ONE audit record for an attributable gate denial. */
  const appendAudit = (
    stage: "policy-gate" | "rights-gate",
    denial: string,
    attempted: RealExperimentBindingAuditRecord["attempted"],
  ): RealExperimentBindingAuditRecord => {
    const audit: RealExperimentBindingAuditRecord = {
      id: deps.nextAuditId(),
      scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      actor: request.actor,
      createdAt: deps.clock(),
      stage,
      denial,
      attempted,
      boundaryStatement: REAL_EXPERIMENT_BOUNDARY_STATEMENT,
    };
    return deps.store.appendAuditRecord(audit);
  };
  const attemptedFrame: RealExperimentBindingAuditRecord["attempted"] = {
    labCandidate: { ...request.labCandidate },
    missionRef: request.mission.missionRef,
    missionVersion: request.mission.missionVersion,
    policyCitations: request.policy.map((citation) => ({ id: citation.id, version: citation.version })),
    rightsRefs: [...request.rightsFrame.rightsRefs],
    consentRefs: [...request.rightsFrame.consentRefs],
  };

  // — 4. POLICY verdict (PRECEDES every downstream invocation; §24 order) —
  const subjectRef = `benchmark:${request.labCandidate.benchmarkId}:v${String(request.labCandidate.benchmarkVersion)}:${request.labCandidate.candidateKey}`;
  const policyCheck = deps.policyGate.check({
    scope,
    actor: request.actor,
    subjectRef,
    policy: request.policy,
  });
  const policySegment: ExperimentPolicyGateSegment = {
    outcome: policyCheck.outcome,
    decision: policyCheck.decision,
    denialReason: policyCheck.denialReason,
    policyRef: policyCheck.policyRef,
    evaluationRef: policyCheck.evaluationRef,
    checkedAt: deps.clock(),
  };
  if (policyCheck.decision !== "permitted") {
    const reason = policyCheck.denialReason ?? "the policy gate denied the real-experiment-approval action";
    const audit = appendAudit("policy-gate", reason, attemptedFrame);
    return { ok: false, error: { kind: "policy-gate-denied", stage: "policy-gate", reason, audit } };
  }

  // — 5. RIGHTS frame (the declared frame must resolve active in-tenant) —
  const frame = deps.rightsGate.resolveFrame({
    scope,
    actor: request.actor,
    rightsRefs: [...request.rightsFrame.rightsRefs],
    consentRefs: [...request.rightsFrame.consentRefs],
    now: deps.clock(),
  });
  const rightsSegment: ExperimentRightsGateSegment = {
    frameResolutions: frame.resolutions,
    frameActive: frame.frameActive,
    checkedAt: deps.clock(),
  };
  if (!frame.frameActive) {
    const reason = frame.resolutions
      .filter((resolution) => resolution.status !== "active")
      .map((resolution) => `${resolution.kind} ${resolution.ref} is ${resolution.status}`)
      .join("; ");
    const denial = reason.length > 0 ? reason : "the declared rights frame is not active";
    const audit = appendAudit("rights-gate", denial, attemptedFrame);
    return { ok: false, error: { kind: "rights-gate-denied", stage: "rights-gate", reason: denial, audit } };
  }

  // — 6. PRODUCTION request (the result's own entry; lookalikes fail closed) —
  const productionFailure = productionCitationFailure(request);
  if (productionFailure !== null) {
    return { ok: false, error: productionFailure };
  }
  const selected = request.production.selected;
  const productionSegment: ExperimentProductionSegment = {
    requestRef: {
      id: selected.request.id,
      version: Number(selected.request.version) as Version,
    },
    searchResultId: String(request.production.searchResult.id),
    rank: selected.rank,
    transformChain: selected.candidate.transformChain.map((step) => ({
      definitionId: String(step.definitionId),
      definitionVersion: Number(step.definitionVersion),
    })),
  };

  // — 7. DISTRIBUTION binding (the REAL publication is the authority) —
  const publication = deps.distribution.getPublication(scope.tenantId, request.distribution.publicationId);
  if (publication === undefined) {
    return {
      ok: false,
      error: {
        kind: "distribution-publication-unresolved",
        reason: `publication ${request.distribution.publicationId} does not resolve in this tenant scope's platform-confirmed publication log (unknown ≡ cross-tenant, §31) — only platform-confirmed publications bind`,
      },
    };
  }
  const publishedArtifactId = String(publication.artifact.artifactId);
  const publishedArtifactVersion = Number(publication.artifact.version);
  if (
    publishedArtifactId !== request.distribution.expectedArtifact.artifactId ||
    publishedArtifactVersion !== request.distribution.expectedArtifact.version
  ) {
    return {
      ok: false,
      error: {
        kind: "distribution-artifact-mismatch",
        reason: `the publication's distributed artifact ${publishedArtifactId}@v${String(publishedArtifactVersion)} does not match the declared expected artifact ${request.distribution.expectedArtifact.artifactId}@v${String(request.distribution.expectedArtifact.version)} — the REAL distribution record is the authority for what was distributed`,
      },
    };
  }
  const distributionSegment: ExperimentDistributionSegment = {
    publicationId: String(publication.id),
    channelRef: String(publication.channelRef),
    providerId: String(publication.providerId),
    artifact: structuredClone(publication.artifact),
    postRef: String(publication.postRef),
    publishedAt: publication.publishedAt,
    recordedAt: publication.recordedAt,
    source: publication.source,
    citedAt: deps.clock(),
  };

  // — 8. EXPERIMENT record: enqueue the durable job, then mint —
  let job: DurableJobRecord;
  try {
    job = deps.jobs.enqueue({
      scope,
      jobKey: jobKeyBrand(clientJobKey),
      kind: EXPERIMENT_JOB_KIND,
      contractVersion: EXPERIMENT_JOB_CONTRACT_VERSION,
      submittedBy: { kind: "user", identityRef: String(request.actor) },
      inputArtifactRefs: [structuredClone(publication.artifact)],
      parameters: {
        experimentId: String(experimentId),
        subjectRef: String(publication.postRef),
        publicationId: String(publication.id),
        providerId: String(publication.providerId),
        windowStart: String(request.measurement.windowStart),
        windowEnd: String(request.measurement.windowEnd),
      },
      retryPolicy: { ...EXPERIMENT_JOB_RETRY_POLICY },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        kind: "job-enqueue-failed",
        reason: `the REAL durable job queue rejected the measurement-job submission (fail loud, nothing recorded): ${reason}`,
      },
    };
  }
  const jobCitation: ExperimentJobCitation = {
    experimentId,
    jobId: String(job.id),
    jobKey: clientJobKey,
    kind: EXPERIMENT_JOB_KIND,
    contractVersion: EXPERIMENT_JOB_CONTRACT_VERSION,
    enqueuedAt: job.createdAt,
    jobStatus: job.status,
    attemptCount: job.attemptCount,
  };
  const measurement: ExperimentMeasurementContext & { readonly subjectRef: string } = {
    windowStart: request.measurement.windowStart,
    windowEnd: request.measurement.windowEnd,
    niche: request.measurement.niche,
    regime: request.measurement.regime,
    platform: String(publication.providerId),
    subjectRef: String(publication.postRef),
  };
  const createdAt = deps.clock();
  const draft: RealExperimentRecord = {
    id: experimentId,
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    actor: request.actor,
    createdAt,
    status: "created",
    labCandidate: labSegment,
    mission: missionLinkage,
    policyGate: policySegment,
    rightsGate: rightsSegment,
    production: productionSegment,
    distribution: distributionSegment,
    measurement,
    evidenceRef: { evidenceId: experimentId, version: 1 as Version },
    job: jobCitation,
    analysis: null,
    closure: null,
    boundaryStatement: REAL_EXPERIMENT_BOUNDARY_STATEMENT,
    version: 1,
    priorVersion: null,
    experimentDigest: digestOf({}),
  };
  const sealedDraft: RealExperimentRecord = {
    ...draft,
    experimentDigest: digestOf(payloadOf(draft)),
  };
  const declaredEvidence: DeclaredMeasurementWindowRecord = {
    id: experimentId,
    version: 1 as Version,
    tenantId: scope.tenantId,
    kind: "declared-window",
    window: { windowStart: request.measurement.windowStart, windowEnd: request.measurement.windowEnd },
    subjectRef: String(publication.postRef),
    publicationRef: { publicationId: String(publication.id), providerId: String(publication.providerId) },
    declaredAt: createdAt,
    boundaryStatement: REAL_EXPERIMENT_BOUNDARY_STATEMENT,
    evidenceDigest: "",
  };
  const sealedEvidence: DeclaredMeasurementWindowRecord = {
    ...declaredEvidence,
    evidenceDigest: digestOf(((): unknown => {
      const { evidenceDigest: _digest, ...payload } = declaredEvidence;
      return payload;
    })()),
  };
  try {
    deps.evidenceStore.appendFirstVersion(sealedEvidence);
    const record = deps.store.appendFirstVersion(sealedDraft);
    return { ok: true, value: { experiment: record, experimentId, jobId: String(job.id) } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: "experiment-store-rejection", reason } };
  }
}

/** Default experiment-id factory (`exp_` + random UUID — the house shape). */
export const defaultNextExperimentId = (): ExperimentId => `exp_${randomUUID()}` as ExperimentId;

/** Default audit-id factory (`expa_` + random UUID). */
export const defaultNextAuditId = (): string => `expa_${randomUUID()}`;
