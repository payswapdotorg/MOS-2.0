/**
 * BRIDGE-003 binding-core tests — the gate-ordered §24 chain: candidate →
 * mission → policy → rights → production → distribution → experiment
 * record, with the invocation-counting spy (a denial means ZERO
 * downstream calls + ZERO experiment state) and the exactly-one-audit-
 * record discipline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { composeExperimentWorld, experimentBindingRequestFixture } from "../testing/search-fixtures.js";
import { experimentLabCandidateSnapshot, experimentPublicationFixture } from "../testing/experiment-fixtures.js";
import { EXPERIMENT_TENANT, EXPERIMENT_SCOPE } from "../testing/experiment-fixtures.js";
import { canonicalRealExperimentBinding } from "../contracts/experiment-record.js";
import { EXPERIMENT_MISSION_ACTIVE_VERSION } from "../testing/experiment-fixtures.js";

test("a fully-resolved chain mints the experiment record v1 (created) with every segment", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(outcome.ok);
  const record = outcome.value.experiment;
  assert.equal(record.status, "created");
  assert.equal(record.version, 1);
  assert.equal(record.priorVersion, null);
  assert.equal(record.scope.tenantId, EXPERIMENT_TENANT);
  // Every §24 segment is present and version-pinned.
  assert.equal(record.labCandidate.citation.candidateKey, request.labCandidate.candidateKey);
  assert.equal(record.labCandidate.expectations.counterfactual, true);
  assert.equal(record.mission.missionVersion, EXPERIMENT_MISSION_ACTIVE_VERSION);
  assert.equal(record.mission.rewardSpecVersion, 1);
  assert.equal(record.policyGate.decision, "permitted");
  assert.equal(record.rightsGate.frameActive, true);
  assert.equal(record.production.requestRef.version, Number(request.production.selected.request.version));
  assert.equal(record.distribution.publicationId, request.distribution.publicationId);
  assert.equal(record.measurement.platform, "youtube");
  assert.equal(record.measurement.subjectRef, record.distribution.postRef);
  assert.ok(record.job !== null);
  assert.equal(record.job.jobKey, `experiment:${String(record.id)}`);
  assert.equal(record.analysis, null);
  assert.equal(record.closure, null);
});

test("the durable job is enqueued on the REAL queue with the frozen plan + experiment parameters", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(outcome.ok);
  const job = world.jobs.getJobByKey(EXPERIMENT_SCOPE, { length: 0 } as never) ?? undefined;
  void job;
  const stored = world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT });
  assert.equal(stored.length, 1);
  const enqueued = stored[0];
  assert.ok(enqueued !== undefined);
  assert.equal(enqueued.kind, "benchmark");
  assert.equal(enqueued.jobKey, `experiment:${String(outcome.value.experimentId)}`);
  assert.equal(enqueued.contractVersion, 1);
  assert.equal(enqueued.input.inputArtifactRefs.length, 1);
  assert.equal(String(enqueued.input.inputArtifactRefs[0]?.artifactId), String(request.distribution.expectedArtifact.artifactId));
  assert.equal(enqueued.input.parameters.experimentId, String(outcome.value.experimentId));
  assert.equal(enqueued.submittedBy.kind, "user");
});

test("an unresolvable lab candidate is a typed failure and records NOTHING", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const broken = {
    ...request,
    labCandidate: { ...request.labCandidate, candidateKey: "no-such-key" },
  };
  const outcome = await world.authority.createBinding(broken);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "lab-candidate-unresolved");
  assert.ok(outcome.error.reason.includes("never fabricated"));
  // ZERO experiment state, ZERO audits, ZERO jobs, ZERO mission lookups downstream.
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
  assert.equal(world.authority.listBindingAudits(EXPERIMENT_SCOPE).length, 0);
  assert.equal(world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT }).length, 0);
  assert.equal(world.policyGate.receivedRequests.length, 0);
});

test("an unresolvable mission is a typed failure and records NOTHING", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const broken = { ...request, mission: { ...request.mission, missionVersion: 99 } };
  const outcome = await world.authority.createBinding(broken);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "mission-unresolved");
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
  assert.equal(world.policyGate.receivedRequests.length, 0);
});

test("a non-active mission fails closed and records NOTHING", async () => {
  const { request } = await experimentBindingRequestFixture();
  // A fresh repository holding a never-activated (draft) mission at v1 —
  // the binding cites v1 and must fail closed on the non-active status.
  const { createInMemoryMissionRepository } = await import("../../../mos-missions/dist/index.js");
  const repo = createInMemoryMissionRepository({ now: () => "2026-05-01T00:00:00.000Z" });
  repo.createMission({
    scope: EXPERIMENT_SCOPE,
    id: request.mission.missionRef,
    objective: { statement: "s", targetMetrics: [{ metric: "quality", target: "1", unit: "count", horizon: null }], constraints: [] },
    rewardSpec: { version: 1, terms: [{ metric: "quality", weight: 1, direction: "maximize", definition: "d" }] },
  });
  // Status stays draft at v1 — the binding cites v1 and must fail closed.
  const worldDraft = composeExperimentWorld({ missionRepository: repo });
  const draftRequest = { ...request, mission: { ...request.mission, missionVersion: 1 } };
  const outcome = await worldDraft.authority.createBinding(draftRequest);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "mission-not-active");
  assert.equal(worldDraft.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
  assert.equal(worldDraft.policyGate.receivedRequests.length, 0);
});

test("a POLICY denial appends EXACTLY ONE audit record with verbatim attribution and ZERO experiment state", async () => {
  const world = composeExperimentWorld({
    policyScript: [
      {
        decision: "denied",
        outcome: "denied",
        denialReason: "denied by rule policy:experiment-deny-v1: budget constraint violated (verbatim authority attribution)",
        policyRef: "policy:experiment-deny-v1" as never,
        evaluationRef: "policy-eval:denied-1",
      },
    ],
  });
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "policy-gate-denied");
  assert.ok(outcome.error.reason.includes("budget constraint violated"));
  // EXACTLY ONE audit record — verbatim denial + attempted citations.
  const audits = world.authority.listBindingAudits(EXPERIMENT_SCOPE);
  assert.equal(audits.length, 1);
  const audit = audits[0];
  assert.ok(audit !== undefined);
  assert.equal(audit.stage, "policy-gate");
  assert.equal(audit.denial, outcome.error.reason);
  assert.equal(audit.attempted.missionRef, request.mission.missionRef);
  assert.equal(audit.attempted.policyCitations.length, 1);
  // ZERO experiment state.
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
  // The failure VALUE carries the audit record.
  assert.equal(outcome.error.audit.id, audit.id);
});

test("the invocation-counting spy: a POLICY denial means ZERO rights/distribution/job invocations", async () => {
  const world = composeExperimentWorld({
    policyScript: [
      {
        decision: "denied",
        outcome: "insufficient-policy",
        denialReason: "insufficient-policy: no cited rule matched",
        policyRef: null,
        evaluationRef: "eval-1",
      },
    ],
  });
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "policy-gate-denied");
  assert.equal(world.policyGate.receivedRequests.length, 1);
  assert.equal(world.rightsGate.receivedFrameRequests.length, 0);
  assert.equal(world.distribution.publicationReads.length, 0);
  assert.equal(world.distribution.observationReads.length, 0);
  assert.equal(world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT }).length, 0);
});

test("a RIGHTS denial appends EXACTLY ONE audit record with verbatim resolutions and ZERO experiment state", async () => {
  const world = composeExperimentWorld({
    frameScript: [
      {
        resolutions: [
          { ref: "rights:experiment-grant-1", kind: "rights-grant", status: "revoked" },
        ],
        frameActive: false,
      },
    ],
  });
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "rights-gate-denied");
  assert.ok(outcome.error.reason.includes("revoked"));
  const audits = world.authority.listBindingAudits(EXPERIMENT_SCOPE);
  assert.equal(audits.length, 1);
  const rightsAudit = audits[0];
  assert.ok(rightsAudit !== undefined);
  assert.equal(rightsAudit.stage, "rights-gate");
  // Policy WAS consulted (it permitted — §24 order), distribution/jobs were NOT.
  assert.equal(world.policyGate.receivedRequests.length, 1);
  assert.equal(world.distribution.publicationReads.length, 0);
  assert.equal(world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT }).length, 0);
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
});

test("a production-stage failure (post-gates) is a caller error that records NOTHING", async () => {
  const world = composeExperimentWorld();
  const { request, searchResult } = await experimentBindingRequestFixture();
  const lookalike = structuredClone(request.production.selected);
  const broken = { ...request, production: { searchResult, selected: lookalike } };
  const outcome = await world.authority.createBinding(broken);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "candidate-not-in-result");
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
  assert.equal(world.authority.listBindingAudits(EXPERIMENT_SCOPE).length, 0);
  // Gates WERE consulted (permitted — the §24 stage order), nothing was minted.
  assert.equal(world.policyGate.receivedRequests.length, 1);
  assert.equal(world.rightsGate.receivedFrameRequests.length, 1);
  assert.equal(world.distribution.publicationReads.length, 0);
});

test("an unresolvable distribution publication is a typed failure that records NOTHING", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const broken = { ...request, distribution: { ...request.distribution, publicationId: "no-such-publication" } };
  const outcome = await world.authority.createBinding(broken);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "distribution-publication-unresolved");
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 0);
  assert.equal(world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT }).length, 0);
});

test("an artifact mismatch between the publication and the declared expectation fails closed", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const broken = {
    ...request,
    distribution: {
      ...request.distribution,
      expectedArtifact: { artifactId: "artifact:other", version: 1 },
    },
  };
  const outcome = await world.authority.createBinding(broken);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "distribution-artifact-mismatch");
  assert.ok(outcome.error.reason.includes("the REAL distribution record is the authority"));
  assert.equal(world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT }).length, 0);
});

test("a non-counterfactual lab-candidate snapshot fails closed (the runtime double-cast guard)", async () => {
  const snapshot = experimentLabCandidateSnapshot();
  const smuggled = {
    ...snapshot,
    expectations: { ...snapshot.expectations, counterfactual: true },
  };
  void smuggled;
  // Simulate a seam serving an unlabeled/counterfactual-false shape via any-cast.
  const forged = {
    ...snapshot,
    expectations: { ...snapshot.expectations, counterfactual: false as unknown as true },
  };
  const world = composeExperimentWorld({ labCandidates: [forged] });
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "lab-candidate-not-counterfactual");
  assert.ok(outcome.error.reason.includes("lock rule 29"));
  assert.equal(world.policyGate.receivedRequests.length, 0);
});

test("the canonical binding projection carries ALL NINE required refs with exact-version pins", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(outcome.ok);
  const binding = canonicalRealExperimentBinding(outcome.value.experiment);
  assert.equal(binding.id, String(outcome.value.experimentId));
  assert.equal(
    binding.labCandidateRef,
    `benchmark:${request.labCandidate.benchmarkId}:v${String(request.labCandidate.benchmarkVersion)}:${request.labCandidate.candidateKey}`,
  );
  assert.equal(binding.missionRef, request.mission.missionRef);
  assert.equal(binding.missionVersion, EXPERIMENT_MISSION_ACTIVE_VERSION);
  assert.equal(binding.productionRequestRef.id, request.production.selected.request.id);
  assert.equal(binding.productionRequestRef.version, Number(request.production.selected.request.version));
  const policyCitation = request.policy[0];
  assert.ok(policyCitation !== undefined);
  assert.equal(binding.policyRef, policyCitation.id);
  const primaryGrant = request.rightsFrame.rightsRefs[0];
  assert.ok(primaryGrant !== undefined);
  assert.equal(binding.rightsRef, primaryGrant);
  assert.equal(binding.distributionRef, `social-publication:${request.distribution.publicationId}`);
  assert.equal(binding.experimentRef, String(outcome.value.experimentId));
  assert.equal(binding.evidenceRef, String(outcome.value.experimentId));
  assert.equal(binding.evidenceVersion, 1);
  assert.equal(binding.recordVersion, 1);
});

test("the binding mints the declared evidence record v1 (window + publication, no values)", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(outcome.ok);
  const evidence = world.authority.getEvidence(
    EXPERIMENT_SCOPE,
    outcome.value.experimentId,
  );
  assert.ok(evidence !== undefined);
  assert.equal(evidence.kind, "declared-window");
  if (evidence.kind === "declared-window") {
    assert.equal(evidence.window.windowStart, request.measurement.windowStart);
    assert.equal(evidence.window.windowEnd, request.measurement.windowEnd);
    assert.equal(evidence.subjectRef, "platform-post:experiment-1");
    assert.equal(evidence.publicationRef.publicationId, request.distribution.publicationId);
    assert.equal("observations" in evidence, false);
  }
});

test("idempotent re-binding is impossible: each act mints its own experiment id", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const first = await world.authority.createBinding(request);
  assert.ok(first.ok);
  const second = await world.authority.createBinding(request);
  assert.ok(second.ok);
  assert.notEqual(String(first.value.experimentId), String(second.value.experimentId));
  // Two jobs, two experiment chains (the caller's idempotency domain is the
  // caller's — the authority never silently dedupes a repeated binding).
  assert.equal(world.jobs.listJobs({ tenantId: EXPERIMENT_TENANT }).length, 2);
  assert.equal(world.authority.listExperiments(EXPERIMENT_SCOPE).length, 2);
});

test("cross-tenant lab-candidate citation is indistinguishable from unknown (§31)", async () => {
  const world = composeExperimentWorld({
    labCandidates: [experimentLabCandidateSnapshot("tenant-other")],
  });
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "lab-candidate-unresolved");
  assert.ok(outcome.error.reason.includes("cross-tenant"));
});

test("cross-tenant publication citation is indistinguishable from unknown (§31)", async () => {
  const world = composeExperimentWorld({
    publications: [experimentPublicationFixture("tenant-other")],
  });
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "distribution-publication-unresolved");
});

void EXPERIMENT_TENANT;