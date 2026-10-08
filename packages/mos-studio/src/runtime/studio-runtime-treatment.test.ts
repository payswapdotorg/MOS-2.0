import assert from "node:assert/strict";
import { test } from "node:test";

import { composeTestRuntime } from "../testing/compose-runtime-for-tests.js";
import {
  OPERATOR,
  captureRawTake,
  driveToPackaged,
  driveToReview,
  mustOk,
  participantJoin,
  seedDefaultSubjectConsent,
  standaloneIntent,
  buildProcessingArtifacts,
  recordedEditGraphRefOf,
} from "../testing/test-fixtures.js";
import type { OutputTreatmentRequest } from "../contracts/treatment.js";
import type { Timestamp } from "../contracts/refs.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { SubmitReviewInput } from "./intake-types.js";

// ---------------------------------------------------------------------------
// STUDIO-001: rejection branches (quality ≠ rights/policy) + treatment chain
// ---------------------------------------------------------------------------

test("quality rejection is distinct from rights/policy rejection (§19)", async () => {
  const quality = await driveToReview();
  const qualityRejected = await mustOk(
    quality.runtime.submitReview(quality.sessionId, {
      targetArtifactId: (quality.finals[0] as StudioArtifactRef).artifactId,
      outcome: "reject-quality",
      rejection: { kind: "quality-rejection", failedCriteria: ["audio-clarity"] },
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "reject-quality",
  );
  assert.equal(qualityRejected.session.lifecycle.state, "failed");
  const qualityView = quality.runtime.getSession(quality.sessionId);
  assert.ok(qualityView !== undefined);
  assert.equal(qualityView.reviews[0]?.rejection?.kind, "quality-rejection");
  assert.ok(qualityView.session.lifecycle.transitions.some((t) => t.reason === "review:reject-quality"));

  const rights = await driveToReview();
  const rightsRejected = await mustOk(
    rights.runtime.submitReview(rights.sessionId, {
      targetArtifactId: (rights.finals[0] as StudioArtifactRef).artifactId,
      outcome: "reject-rights-policy",
      rejection: {
        kind: "rights-policy-rejection",
        violations: ["violation-missing-consent" as never],
      },
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "reject-rights-policy",
  );
  assert.equal(rightsRejected.session.lifecycle.state, "failed");
  const rightsView = rights.runtime.getSession(rights.sessionId);
  assert.ok(rightsView !== undefined);
  assert.equal(rightsView.reviews[0]?.rejection?.kind, "rights-policy-rejection");
  assert.ok(rightsView.session.lifecycle.transitions.some((t) => t.reason === "review:reject-rights-policy"));

  // The two rejection kinds are never interchangeable.
  const { runtime, sessionId, finals } = await driveToReview();
  const wrongKind = await runtime.submitReview(sessionId, {
    targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
    outcome: "reject-quality",
    rejection: { kind: "rights-policy-rejection", violations: ["v" as never] },
    decidedBy: OPERATOR,
  });
  assert.ok(!wrongKind.ok && wrongKind.error.kind === "rejection-kind-mismatch");
  // The mismatched review was NOT recorded; the session stays in review.
  assert.equal(runtime.getSession(sessionId)?.reviews.length, 0);
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "review");
});

test("unsupported review outcomes fail closed (require-human-action, switch-*)", async () => {
  const { runtime, sessionId, finals } = await driveToReview();
  for (const outcome of ["require-human-action", "switch-organization", "switch-transform", "switch-engine"] as const) {
    const result = await runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome,
      decidedBy: OPERATOR,
    });
    assert.ok(!result.ok && result.error.kind === "unsupported-review-outcome", `${outcome} must fail closed`);
  }
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "review");
});

test("treatment on a packaged session creates a NEW immutable linked package version (§19)", async () => {
  const { runtime, sessionId, finals, package: v1 } = await driveToPackaged();
  const targetArtifact = finals[0] as StudioArtifactRef;

  const treatmentRequest: OutputTreatmentRequest = {
    sessionId: sessionId as never,
    targetArtifact,
    treatment: "trim",
    parametersRef: "params-trim-1",
    requestedBy: OPERATOR,
    requestedAt: "2026-01-02T00:00:00.000Z" as Timestamp,
  };
  const treated = await mustOk(
    runtime.applyTreatment(sessionId, treatmentRequest),
    "applyTreatment",
  );
  assert.ok(treated.package !== undefined);
  const v2 = treated.package;

  // New version under the SAME package id; predecessor version retained.
  assert.equal(v2.id, v1.id);
  assert.equal(v2.version, 2);
  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 2);
  assert.equal(view.packages[0]?.version, 1);
  assert.deepEqual(view.session.artifactPackageRef, { packageId: v1.id, version: 2 });

  // v1 is untouched (immutable predecessor) and still resolvable.
  assert.equal(v1.finalArtifacts.length, 1);
  assert.deepEqual(view.packages[0]?.finalArtifacts.map((a) => a.artifactId), v1.finalArtifacts.map((a) => a.artifactId));

  // v2 contains predecessor AND successor; successor lineage links to target.
  const successor = treated.result.successorArtifacts[0] as StudioArtifactRef;
  assert.ok(v2.finalArtifacts.some((a) => a.artifactId === targetArtifact.artifactId));
  assert.ok(v2.finalArtifacts.some((a) => a.artifactId === successor.artifactId));
  assert.deepEqual(
    successor.parentArtifactRefs.map((p) => p.artifactId),
    [targetArtifact.artifactId],
  );
  assert.deepEqual(
    treated.result.predecessorArtifacts.map((p) => p.artifactId),
    [targetArtifact.artifactId],
  );
  assert.equal(successor.creationMethod, "organization-transform");
  assert.equal(v2.evaluation.outcome, "treatment-requested");

  // A second treatment chains v3 onto v2.
  const treatedAgain = await mustOk(
    runtime.applyTreatment(sessionId, {
      sessionId: sessionId as never,
      targetArtifact: successor,
      treatment: "re-render",
      requestedBy: OPERATOR,
      requestedAt: "2026-01-03T00:00:00.000Z" as Timestamp,
    }),
    "applyTreatment again",
  );
  assert.equal(treatedAgain.package?.version, 3);
  assert.equal(runtime.getSession(sessionId)?.packages.length, 3);
});

test("treatment branch from review: request-treatment → processing → treatment → review → accept", async () => {
  const { runtime, sessionId, finals } = await driveToReview();

  // Review requests treatment → session moves back to processing.
  const treatmentRequested = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "request-treatment",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "request-treatment",
  );
  assert.equal(treatmentRequested.session.lifecycle.state, "processing");

  // Treatment runs in the processing branch and returns the session to review.
  const treated = await mustOk(
    runtime.applyTreatment(sessionId, {
      sessionId: sessionId as never,
      targetArtifact: finals[0] as StudioArtifactRef,
      treatment: "adjust-composition",
      requestedBy: OPERATOR,
      requestedAt: "2026-01-02T00:00:00.000Z" as Timestamp,
    }),
    "applyTreatment(processing)",
  );
  assert.equal(treated.package, undefined);
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "review");

  // The successor final candidate is reviewable; accepting packages everything.
  const successor = treated.result.successorArtifacts[0] as StudioArtifactRef;
  const accepted = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: successor.artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "accept after treatment",
  );
  assert.equal(accepted.session.lifecycle.state, "packaged");
  assert.equal(accepted.package?.finalArtifacts.length, 2);
  assert.ok(accepted.package?.finalArtifacts.some((a) => a.artifactId === successor.artifactId));
});

test("failed treatments: rights/policy rejection recorded distinctly; session state preserved", async () => {
  const { runtime, artifactFactory, authorities } = composeTestRuntime({
    treatmentFailWith: {
      kind: "rights-policy-rejection",
      violations: ["violation-copyrighted-source"],
    },
  });
  const created = await mustOk(
    runtime.createSession(standaloneIntent()),
    "create",
  );
  await mustOk(runtime.loadOrganization(created.session.id), "load");
  // STUDIO-006: seed the REAL identity + consent records for the subject.
  seedDefaultSubjectConsent(authorities, created.session.id);
  await mustOk(runtime.joinParticipant(created.session.id, participantJoin()), "join");
  const rawArtifact = await captureRawTake(runtime, created.session.id, {});
  const { intermediate, finals } = await buildProcessingArtifacts(artifactFactory, [rawArtifact]);
  await mustOk(runtime.beginProcessing(created.session.id), "beginProcessing");
  await mustOk(
    runtime.completeProcessing(created.session.id, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [
        { artifact: intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true },
      ],
      editGraphRef: recordedEditGraphRefOf(created.session.id),
    }),
    "completeProcessing",
  );
  await mustOk(
    runtime.submitReview(created.session.id, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "accept",
  );
  const sessionId = created.session.id;

  const rightsFailure = await runtime.applyTreatment(sessionId, {
    sessionId: sessionId as never,
    targetArtifact: finals[0] as StudioArtifactRef,
    treatment: "edit",
    requestedBy: OPERATOR,
    requestedAt: "2026-01-04T00:00:00.000Z" as Timestamp,
  });
  assert.ok(!rightsFailure.ok && rightsFailure.error.kind === "treatment-failed");
  assert.equal((rightsFailure.error as { failure: { kind: string } }).failure.kind, "rights-policy-rejection");
  // Session stays packaged; failure is recorded for audit.
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "packaged");
  assert.equal(runtime.getSession(sessionId)?.treatmentFailures.length, 1);
  assert.equal(runtime.getSession(sessionId)?.packages.length, 1);

  // Execution failure mode is distinct.
  const { runtime: execRuntime, artifactFactory: execFactory, authorities: execAuthorities } = composeTestRuntime({
    treatmentFailWith: { kind: "execution-failure", reason: "engine exploded" },
  });
  const execCreated = await mustOk(execRuntime.createSession(standaloneIntent()), "create");
  await mustOk(execRuntime.loadOrganization(execCreated.session.id), "load");
  seedDefaultSubjectConsent(execAuthorities, execCreated.session.id);
  await mustOk(execRuntime.joinParticipant(execCreated.session.id, participantJoin()), "join");
  const execRaw = await captureRawTake(execRuntime, execCreated.session.id, {});
  const execProcessed = await buildProcessingArtifacts(execFactory, [execRaw]);
  await mustOk(execRuntime.beginProcessing(execCreated.session.id), "beginProcessing");
  await mustOk(
    execRuntime.completeProcessing(execCreated.session.id, {
      intermediateArtifacts: execProcessed.intermediate,
      finalArtifacts: execProcessed.finals,
      transcriptRefs: [
        { artifact: execProcessed.intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true },
      ],
      editGraphRef: recordedEditGraphRefOf(execCreated.session.id),
    }),
    "completeProcessing",
  );
  await mustOk(
    execRuntime.submitReview(execCreated.session.id, {
      targetArtifactId: (execProcessed.finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "accept",
  );
  const execFailure = await execRuntime.applyTreatment(execCreated.session.id, {
    sessionId: execCreated.session.id as never,
    targetArtifact: execProcessed.finals[0] as StudioArtifactRef,
    treatment: "re-transcribe",
    requestedBy: OPERATOR,
    requestedAt: "2026-01-05T00:00:00.000Z" as Timestamp,
  });
  assert.ok(!execFailure.ok && (execFailure.error as { failure: { kind: string } }).failure.kind === "execution-failure");
});
