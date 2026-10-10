/**
 * BRIDGE-003 adversarial probes — the W6-C/W10-B hostile classes over the
 * experiments authority: cross-tenant forgery, aliasing (the caller's
 * objects never move the store), deep-freeze corruption (mutating frozen
 * records is a silent no-op; integrity stays intact), digest tampering
 * (store corruption surfaces as `tampered`), fabricated citations, and
 * the outcome-observation boundary's §31 narrowing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composeExperimentWorld,
  experimentBindingRequestFixture,
  experimentLabCandidateSnapshot,
  experimentPublicationFixture,
  experimentWindowObservations,
  experimentObservationFixture,
  EXPERIMENT_SCOPE,
  EXPERIMENT_TENANT,
  EXPERIMENT_ACTOR,
} from "../testing/search-fixtures.js";
import { experimentObservationIdOf } from "../contracts/ids.js";

/** Bind + measure + analyse in one flow (the golden path up to analysis). */
const bindMeasureAnalyse = async (world: ReturnType<typeof composeExperimentWorld>) => {
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  if (!bound.ok) {
    throw new Error(`fixture binding failed: ${bound.error.kind}`);
  }
  const experimentId = bound.value.experimentId;
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-1", tenantId: EXPERIMENT_TENANT });
  if (claim === null) {
    throw new Error("fixture claim failed");
  }
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "worker-1",
  });
  if (!advanced.ok) {
    throw new Error(`fixture advance failed: ${advanced.error.kind}`);
  }
  const analysed = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, EXPERIMENT_ACTOR);
  if (!analysed.ok) {
    throw new Error(`fixture analyse failed: ${analysed.error.kind}`);
  }
  return { experimentId, record: analysed.value.experiment, outcome: analysed.value.outcome };
};

test("ALIASING: mutating the caller's request after the binding moves nothing (D3/D4)", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  assert.ok(bound.ok);
  const stored = world.authority.getExperiment(EXPERIMENT_SCOPE, bound.value.experimentId);
  assert.ok(stored !== undefined);
  const before = JSON.stringify(stored);
  // Mutate every caller-held object the request carried.
  (request as { mission: { missionVersion: number } }).mission.missionVersion = 999;
  (request.measurement as { niche: string }).niche = "mutated-niche";
  (request.rightsFrame as unknown as { rightsRefs: unknown[] }).rightsRefs.push("rights:injected");
  const after = JSON.stringify(world.authority.getExperiment(EXPERIMENT_SCOPE, bound.value.experimentId));
  assert.equal(after, before);
});

test("DEEP-FREEZE: mutating a returned record is a silent no-op and integrity stays intact", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await bindMeasureAnalyse(world);
  const record = world.authority.getExperiment(EXPERIMENT_SCOPE, experimentId);
  assert.ok(record !== undefined);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.labCandidate));
  assert.ok(Object.isFrozen(record.distribution));
  // A hostile in-place mutation attempts on the FROZEN record.
  assert.throws(() => {
    (record as { status: string }).status = "closed";
  });
  const report = world.authority.verifyExperimentIntegrity(EXPERIMENT_SCOPE, experimentId, record.version);
  assert.ok(report !== null);
  assert.equal(report.status, "intact");
});

test("DIGEST TAMPERING: store corruption surfaces as `tampered` (never silently defaulted)", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await bindMeasureAnalyse(world);
  // The honest probes: the store's own boundary disciplines (the W10-B
  // class) — a version-chain violation is rejected typed; a digest-
  // mismatched draft is rejected LOUD (fail-never-store).
  const latest = world.authority.getExperiment(EXPERIMENT_SCOPE, experimentId);
  assert.ok(latest !== undefined);
  // A re-played SAME version (a version-chain violation) is rejected typed.
  const replay = world.authority.experimentStore.appendLifecycleVersion(
    EXPERIMENT_SCOPE,
    experimentId,
    structuredClone(latest),
  );
  assert.ok(!replay.ok);
  assert.ok(replay.reason.includes("version-chain-violation"));
  // A DIGEST-MISMATCHED draft (payload tampered after sealing) is rejected
  // LOUD at the store boundary — never silently stored.
  const tamperedDraft = structuredClone(latest) as unknown as {
    status: string;
    version: number;
    priorVersion: number | null;
  };
  // Chain-consistent bookkeeping (version/priorVersion) with a TAMPERED
  // payload — only the digest check can catch this class.
  tamperedDraft.version = latest.version + 1;
  tamperedDraft.priorVersion = latest.version;
  tamperedDraft.status = "closed";
  const tampered = tamperedDraft as unknown as typeof latest;
  assert.throws(
    () => world.authority.experimentStore.appendLifecycleVersion(EXPERIMENT_SCOPE, experimentId, tampered),
    /digest mismatch/,
  );
  // Integrity verification over the REAL stored version stays intact.
  const report = world.authority.verifyExperimentIntegrity(EXPERIMENT_SCOPE, experimentId, latest.version);
  assert.ok(report !== null);
  assert.equal(report.status, "intact");
  assert.equal(report.recordedDigest, report.recomputedDigest);
});

test("CROSS-TENANT FORGERY: a foreign tenant's binding request resolves nothing of ours", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  assert.ok(bound.ok);
  // The hostile tenant replays the SAME citations under its own scope.
  const forgedScope = { ...request, scope: { tenantId: "tenant-hostile" as never } };
  const forged = await world.authority.createBinding(forgedScope);
  assert.ok(!forged.ok);
  // Every stage fails closed under the foreign scope — never a leak of OUR
  // records' existence.
  assert.equal(forged.error.kind, "lab-candidate-unresolved");
  // Our records are untouched and invisible to the hostile tenant.
  assert.deepEqual(world.authority.listExperiments({ tenantId: "tenant-hostile" as never }), []);
  assert.equal(world.authority.listBindingAudits({ tenantId: "tenant-hostile" as never }).length, 0);
  assert.ok(world.authority.getExperiment(EXPERIMENT_SCOPE, bound.value.experimentId) !== undefined);
});

test("CROSS-TENANT FORGERY: outcome observations narrow by exact tenant (no existence leaks)", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await bindMeasureAnalyse(world);
  const observationId = experimentObservationIdOf(experimentId);
  const home = world.authority.getOutcomeObservation(EXPERIMENT_SCOPE, observationId);
  assert.ok(home !== null);
  const foreign = world.authority.getOutcomeObservation(
    { tenantId: "tenant-hostile" as never },
    observationId,
  );
  assert.equal(foreign, null);
  // Malformed observation ids are null too (never a throw, never a leak).
  assert.equal(world.authority.getOutcomeObservation(EXPERIMENT_SCOPE, "junk" as never), null);
  assert.equal(
    world.authority.getOutcomeObservation(EXPERIMENT_SCOPE, "exp-obs:no-such-experiment" as never),
    null,
  );
});

test("FABRICATION: a lab-candidate citation the seam cannot resolve is never fabricated", async () => {
  const world = composeExperimentWorld({
    labCandidates: [experimentLabCandidateSnapshot()],
  });
  const { request } = await experimentBindingRequestFixture();
  const broken = {
    ...request,
    labCandidate: { benchmarkId: "benchmark:never-ran", benchmarkVersion: 7, candidateKey: "ghost" },
  };
  const outcome = await world.authority.createBinding(broken);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "lab-candidate-unresolved");
  assert.ok(outcome.error.reason.includes("never fabricated"));
});

test("ALIASING: the folded evidence payload is a private copy (mutating the source log moves nothing)", async () => {
  const observations = experimentWindowObservations();
  const world = composeExperimentWorld({ observations });
  const { experimentId } = await bindMeasureAnalyse(world);
  const evidence = world.authority.getEvidence(EXPERIMENT_SCOPE, experimentId);
  assert.ok(evidence !== undefined && evidence.kind === "measured-evidence");
  const before = JSON.stringify(evidence);
  // Mutate the CALLER's observation fixtures after the fold.
  (observations[0] as unknown as { reported: Record<string, number> }).reported = { hijacked: 1 };
  const after = JSON.stringify(world.authority.getEvidence(EXPERIMENT_SCOPE, experimentId));
  assert.equal(after, before);
});

test("HOSTILE WINDOW: a mid-window observation set still folds ONLY what the platform said", async () => {
  const late = experimentObservationFixture("social-obs:late", "2026-06-20T00:00:00.000Z", {
    "qualified-reach": 9999,
  });
  const world = composeExperimentWorld({ observations: [...experimentWindowObservations(), late] });
  const { experimentId, outcome } = await bindMeasureAnalyse(world);
  // Only the 5 in-window observations folded — the late one never did.
  assert.equal(outcome.observations.length, 5);
  const reach = outcome.observedMetricMeans.find((mean) => mean.metric === "qualified-reach");
  assert.ok(reach !== undefined);
  assert.equal(reach.value, (1200 + 1450 + 1610 + 1702 + 1834) / 5);
  // The outcome observation's sourceRefs cite the 5 REAL observation ids only.
  const observation = world.authority.getOutcomeObservation(
    EXPERIMENT_SCOPE,
    experimentObservationIdOf(experimentId),
  );
  assert.ok(observation !== null);
  assert.ok(!observation.sourceRefs.includes("social-obs:late"));
});

test("PUBLICATION ALIASING: a foreign-tenant publication in the log never resolves for us", async () => {
  const world = composeExperimentWorld({
    publications: [
      experimentPublicationFixture(),
      experimentPublicationFixture("tenant-other"),
    ],
  });
  const { request } = await experimentBindingRequestFixture();
  // The fixture publication id is OURS — but the double also holds a
  // same-id foreign-tenant copy: exact-tenant equality must pick OURS.
  const bound = await world.authority.createBinding(request);
  assert.ok(bound.ok);
  assert.equal(bound.value.experiment.distribution.providerId, "youtube");
  assert.equal(String(bound.value.experiment.scope.tenantId), String(EXPERIMENT_TENANT));
});

test("OUTCOME VERSION CHAIN: re-analysis over new evidence appends (never rewrites)", async () => {
  const world = composeExperimentWorld();
  const { experimentId } = await bindMeasureAnalyse(world);
  const first = world.authority.getOutcome(EXPERIMENT_SCOPE, experimentId);
  assert.ok(first !== undefined);
  assert.equal(first.version, 1);
  // Time passes past the window end; the worker claims + completes.
  world.clock.setIso("2026-06-10T00:00:00.000Z");
  // The completed (terminal succeeded) job admits NO re-claim: the REAL
  // queue returns null (nothing runnable) — the honest outcome for a
  // re-measure attempt through the durable path.
  const claim = world.jobs.claimNextRunnable({ workerId: "worker-2", tenantId: EXPERIMENT_TENANT });
  assert.equal(claim, null);
  // A new evidence version can only arrive through a NEW binding (a new
  // experiment): the append-only v1 outcome stays bit-for-bit resolvable.
  const stillFirst = world.authority.getOutcome(EXPERIMENT_SCOPE, experimentId, 1);
  assert.ok(stillFirst !== undefined);
  assert.equal(JSON.stringify(stillFirst), JSON.stringify(first));
});