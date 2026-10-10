/**
 * BRIDGE-003 measurement-core tests — the durable lifecycle (§26):
 * created → running → measured → analysed → closed | abandoned, riding the
 * REAL @mos/jobs queue (leased claims, typed retriable window retries, §30
 * completion observability, job-event trail), the analysis over measured
 * evidence, and the first-class abandonment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composeExperimentWorld,
  experimentBindingRequestFixture,
  EXPERIMENT_SCOPE,
  EXPERIMENT_TENANT,
} from "../testing/search-fixtures.js";
import type { ExperimentId } from "../contracts/ids.js";

/** Bind the fixture request and return the experiment id. */
const bindFixture = async (world: ReturnType<typeof composeExperimentWorld>): Promise<ExperimentId> => {
  const { request } = await experimentBindingRequestFixture();
  const outcome = await world.authority.createBinding(request);
  if (!outcome.ok) {
    throw new Error(`fixture binding failed: ${outcome.error.kind} — ${outcome.error.reason}`);
  }
  return outcome.value.experimentId;
};

test("advanceMeasurement with a stale claim (no lease) fails closed and mutates nothing", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const outcome = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: "job-exp-fixture-1",
    leaseToken: "not-a-live-lease",
    workerId: "worker-1",
  });
  assert.ok(!outcome.ok);
  // The job EXISTS (enqueued by the binding) but holds NO live lease — the
  // presented token cannot be the job's live lease: claim-stale, fail closed.
  assert.equal(outcome.error.kind, "claim-stale");
  assert.ok(outcome.error.reason.includes("claimNextRunnable"));
  // Mutated nothing: the experiment stays `created`.
  const record = world.authority.getExperiment(EXPERIMENT_SCOPE, experimentId);
  assert.ok(record !== undefined);
  assert.equal(record.status, "created");
});

test("a worker claims the REAL job and the measurement window retry is typed-retriable", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  // The worker claims through the REAL queue (§26 — leased claims only).
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  assert.equal(String(claim.job.jobKey), `experiment:${String(experimentId)}`);
  // The window (ends 2026-06-08) has NOT elapsed at the fixture clock
  // (2026-06-01T09:00) — the segment must fail the job typed-retriable.
  const outcome = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.value.jobOutcome, "retry-scheduled");
  assert.equal(outcome.value.experiment.status, "running");
  // The REAL queue re-queued the job with the declared backoff.
  const stored = world.jobs.getJob(EXPERIMENT_SCOPE, claim.jobId);
  assert.ok(stored !== undefined);
  assert.equal(stored.status, "queued");
  assert.ok(stored.nextAttemptAtMs !== null && stored.nextAttemptAtMs > Date.parse(world.clock.now()));
  assert.ok(stored.failure !== null);
  assert.equal(stored.failure.code, "measurement-window-not-elapsed");
  assert.equal(stored.failure.retriable, true);
});

test("after the window elapses, the segment folds the platform-said observations, completes the job and reaches `measured`", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  // Time passes past the window end (2026-06-08) — then the worker claims
  // fresh (a lease taken before the window elapsed would expire during the
  // backoff wait; crash recovery re-claims — the JOBS-001 semantics).
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  const outcome = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.value.jobOutcome, "completed");
  assert.equal(outcome.value.experiment.status, "measured");
  // The evidence record v2 carries the 5 platform-said observations verbatim.
  const evidence = world.authority.getEvidence(EXPERIMENT_SCOPE, experimentId);
  assert.ok(evidence !== undefined);
  assert.equal(evidence.kind, "measured-evidence");
  if (evidence.kind === "measured-evidence") {
    assert.equal(evidence.counterfactual, false);
    assert.equal(evidence.evidenceKind, "platform-said-observation");
    assert.equal(evidence.observations.length, 5);
    assert.equal(evidence.uncertainty.observationCount, 5);
    assert.equal(evidence.uncertainty.level, "low");
    assert.equal(evidence.version, 2);
    const first = evidence.observations[0];
    assert.ok(first !== undefined);
    assert.equal(first.observationId, "social-obs:experiment-1");
    assert.deepEqual(first.reported, { "qualified-reach": 1200, "engagement-rate": 0.045 });
  }
  // The job is terminal succeeded with the §30 observability.
  const job = world.jobs.getJob(EXPERIMENT_SCOPE, claim.jobId);
  assert.ok(job !== undefined);
  assert.equal(job.status, "succeeded");
  assert.ok(job.observability !== null);
  assert.equal(job.observability.runId, String(experimentId));
  assert.equal(job.observability.outputArtifactRefs.length, 1);
  // The job EVENT history enriches the §30 trail (enqueued, claim, succeeded).
  const history = world.jobs.getJobHistory(EXPERIMENT_SCOPE, claim.jobId);
  assert.ok(history !== undefined);
  const eventTypes = history.map((event: { readonly type: string }) => event.type);
  assert.ok(eventTypes.includes("enqueued"));
  assert.ok(eventTypes.includes("claim"));
  assert.ok(eventTypes.includes("attempt-succeeded"));
  // The experiment record's job citation echoes the completed status.
  const record = world.authority.getExperiment(EXPERIMENT_SCOPE, experimentId);
  assert.ok(record !== undefined);
  assert.equal(record.job?.jobStatus, "succeeded");
  assert.equal(record.evidenceRef.version, 2);
});

test("a claim for ANOTHER experiment's job fails closed (job-experiment mismatch)", async () => {
  const world = composeExperimentWorld();
  const first = await bindFixture(world);
  const second = await bindFixture(world);
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  // The first claim is the FIRST experiment's job — advance the SECOND with it.
  const outcome = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, second, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "job-experiment-mismatch");
  void first;
});

test("analyse over measured evidence appends the outcome record and advances to `analysed`", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  assert.ok(advanced.ok);
  const analysed = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, "identity:analyst" as never);
  assert.ok(analysed.ok);
  const outcome = analysed.value.outcome;
  assert.equal(outcome.version, 1);
  assert.equal(outcome.conclusion, "measured-outcome-recorded");
  // The observed metric means are the plain arithmetic means (LAB-008 discipline).
  const reach = outcome.observedMetricMeans.find((mean) => mean.metric === "qualified-reach");
  assert.ok(reach !== undefined);
  assert.equal(reach.value, (1200 + 1450 + 1610 + 1702 + 1834) / 5);
  assert.equal(reach.unit, "platform-reported");
  // The counterfactual expectation rides VERBATIM, staying counterfactual FOREVER.
  assert.equal(outcome.counterfactualExpectation.counterfactual, true);
  assert.equal(outcome.counterfactualExpectation.expectedReward, 42.5);
  assert.equal(outcome.counterfactualExpectation.labCandidateRef, "benchmark:benchmark:experiment-fixture-1:v1:exp-candidate-reaction-1");
  // The reward-spec citation is the mission's own §21 version.
  assert.equal(outcome.rewardSpecCitation.rewardSpecVersion, 1);
  assert.equal(analysed.value.experiment.status, "analysed");
  assert.equal(analysed.value.experiment.analysis?.outcomeVersion, 1);
});

test("analyse fails closed before measurement (experiment-not-measured)", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const outcome = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, "identity:analyst" as never);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "experiment-not-measured");
});

test("analyse fails closed over EMPTY measured evidence (never a fake basis)", async () => {
  const world = composeExperimentWorld({ observations: [] });
  const experimentId = await bindFixture(world);
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  assert.ok(advanced.ok);
  assert.equal(advanced.value.jobOutcome, "completed");
  const analysed = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, "identity:analyst" as never);
  assert.ok(!analysed.ok);
  assert.equal(analysed.error.kind, "empty-measured-evidence");
  assert.ok(analysed.error.reason.includes("fabricated"));
});

test("observations OUTSIDE the window are never folded (the Time Machine visibility discipline)", async () => {
  const lateObservation = {
    id: "social-obs:late-1",
    scope: { tenantId: EXPERIMENT_TENANT },
    channelRef: "social-channel:experiment-fixture-1",
    providerId: "youtube",
    subjectRef: "platform-post:experiment-1",
    reported: { "qualified-reach": 9999 },
    observedAt: "2026-07-01T00:00:00.000Z",
    recordedAt: "2026-07-01T00:00:00.000Z",
    providerRefs: ["platform-insight:late-1"],
    source: "in-memory-social-transport-double",
  } as never;
  const world = composeExperimentWorld({ observations: [lateObservation] });
  const experimentId = await bindFixture(world);
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  assert.ok(advanced.ok);
  assert.equal(advanced.value.jobOutcome, "completed");
  // The window [06-01, 06-08) excludes the 07-01 observation: ZERO folded.
  const evidence = world.authority.getEvidence(EXPERIMENT_SCOPE, experimentId);
  assert.ok(evidence !== undefined && evidence.kind === "measured-evidence");
  assert.equal(evidence.observations.length, 0);
});

test("closeExperiment terminates the chain (closed) with an append-only history", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const closed = await world.authority.closeExperiment(EXPERIMENT_SCOPE, experimentId, "identity:operator" as never, {
    kind: "closed",
    summary: "the measurement fed calibration; the experiment is complete",
  });
  assert.ok(closed.ok);
  assert.equal(closed.value.experiment.status, "closed");
  assert.equal(closed.value.experiment.closure?.kind, "closed");
  assert.equal(closed.value.experiment.closure?.summary, "the measurement fed calibration; the experiment is complete");
  // The prior versions stay resolvable (append-only).
  const v1 = world.authority.getExperiment(EXPERIMENT_SCOPE, experimentId, 1);
  assert.ok(v1 !== undefined);
  assert.equal(v1.status, "created");
});

test("abandonment is FIRST-CLASS: reason + snapshot + derived citations, forever auditable", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const abandoned = await world.authority.closeExperiment(
    EXPERIMENT_SCOPE,
    experimentId,
    "identity:operator" as never,
    {
      kind: "abandoned",
      abandonment: {
        reason: "the platform restricted the channel mid-window (§18 delay economics dominate)",
        summary: "delay cost dominates expected incremental value — the abandoned path stays learning-relevant",
      },
    },
  );
  assert.ok(abandoned.ok);
  assert.equal(abandoned.value.experiment.status, "abandoned");
  const closure = abandoned.value.experiment.closure;
  assert.ok(closure !== null);
  assert.equal(closure.kind, "abandoned");
  assert.ok(closure.abandonment !== null);
  assert.equal(closure.abandonment.reason.includes("restricted the channel"), true);
  // The snapshot's citations DERIVE from chain state (never caller-claimed):
  // the declared evidence v1 + the job's own status echo.
  assert.ok(closure.abandonment.evidenceRef !== null);
  assert.equal(closure.abandonment.evidenceRef.version, 1);
  assert.ok(closure.abandonment.jobEcho !== null);
  assert.equal(closure.abandonment.jobEcho.status, "queued");
});

test("a blank abandonment reason fails closed (invalid-closure-request)", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const outcome = await world.authority.closeExperiment(
    EXPERIMENT_SCOPE,
    experimentId,
    "identity:operator" as never,
    { kind: "abandoned", abandonment: { reason: "  ", summary: "s" } },
  );
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "invalid-closure-request");
});

test("a terminal experiment admits no successor (append-only forever)", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const closed = await world.authority.closeExperiment(EXPERIMENT_SCOPE, experimentId, "identity:operator" as never, {
    kind: "closed",
    summary: "done",
  });
  assert.ok(closed.ok);
  const again = await world.authority.closeExperiment(EXPERIMENT_SCOPE, experimentId, "identity:operator" as never, {
    kind: "closed",
    summary: "again",
  });
  assert.ok(!again.ok);
  assert.equal(again.error.kind, "experiment-already-terminal");
});

test("cross-tenant advance/analyse/close are all indistinguishable from unknown (§31)", async () => {
  const world = composeExperimentWorld();
  const experimentId = await bindFixture(world);
  const foreignScope = { tenantId: "tenant-other" as never };
  const advance = await world.authority.advanceMeasurement(foreignScope, experimentId, {
    jobId: "job-exp-fixture-1",
    leaseToken: "lease-x",
    workerId: "worker-1",
  });
  assert.ok(!advance.ok);
  assert.equal(advance.error.kind, "experiment-unresolved");
  const analyse = await world.authority.analyse(foreignScope, experimentId, "identity:x" as never);
  assert.ok(!analyse.ok);
  assert.equal(analyse.error.kind, "experiment-unresolved");
  const close = await world.authority.closeExperiment(foreignScope, experimentId, "identity:x" as never, {
    kind: "closed",
    summary: "s",
  });
  assert.ok(!close.ok);
  assert.equal(close.error.kind, "experiment-unresolved");
  // The home tenant still sees its chain untouched.
  assert.ok(world.authority.getExperiment(EXPERIMENT_SCOPE, experimentId) !== undefined);
});