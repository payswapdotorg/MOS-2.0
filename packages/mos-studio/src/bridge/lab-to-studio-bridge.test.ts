/**
 * BRIDGE-001 core battery (lab-to-studio-bridge.ts) — the §24 boundary
 * chain's Lab→Mission→Policy/Rights/Assets→Production/Studio segment over
 * the REAL studio runtime + REAL rights authority (evaluateRights + the
 * REAL repository), with the mission/policy authorities as disclosed
 * doubles (their REAL twins run in compat/bridge-real-authorities.test.ts).
 *
 * Pins:
 * - the ENTERED record carries every chain segment with verbatim authority
 *   data (mission linkage @ exact version, policy verdict + §30 eval ref,
 *   rights frame resolutions, assets coverage verdicts with grant refs,
 *   the studio segment with the runtime's own session/lifecycle echo) and
 *   the BRIDGE-002 expectations surface (counterfactual-labeled);
 * - GATE ORDERING (the W6-C/W8-A discipline at the bridge): mission →
 *   policy → rights frame → assets coverage → studio, with a
 *   invocation-counting runtime spy proving a denial means ZERO studio
 *   calls;
 * - every attributable failure appends EXACTLY ONE record with the
 *   authority's denial attribution VERBATIM (typed kind↔stage correlation);
 * - caller-error shapes record NOTHING (the W8-A discipline);
 * - append-only chains, exact-tenant reads, clone-then-freeze caller
 *   aliasing probes, hostile scope forgery, and the `recordStudioPackage`
 *   citation lifecycle over the studio's OWN session directory + packaging
 *   authority (STUDIO-013/014 — the bridge never packages by itself).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { StudioRuntime } from "../runtime/studio-runtime.js";
import type { StudioSessionId } from "../contracts/refs.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { SubmitReviewInput } from "../runtime/intake-types.js";
import type { LabToStudioEntryRequest } from "./contracts/lab-to-studio-entry.js";
import type { RankedCandidateProgram } from "@mos/production";
import type { TenantScope } from "@mos/contracts";

import {
  BRIDGE_ACTOR,
  BRIDGE_PERMITTED_VERDICT,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
  bridgeEntryRequestOf,
  composeBridgeWorld,
  firstStudioCandidateOf,
  mustEnter,
  runBridgeSearch,
} from "../testing/bridge-fixtures.js";
import type { ComposedBridgeWorld } from "../testing/bridge-fixtures.js";
import {
  OPERATOR,
  USER,
  buildProcessingArtifacts,
  captureRawTake,
  mustOk,
  participantJoin,
  recordedEditGraphRefOf,
} from "../testing/test-fixtures.js";

/** The REAL fixture result + its first studio candidate (module-scoped). */
let realResult: Awaited<ReturnType<typeof runBridgeSearch>>;
let realCandidate: RankedCandidateProgram;

test("BRIDGE core setup: the REAL fixture search world composes", async () => {
  realResult = await runBridgeSearch();
  realCandidate = firstStudioCandidateOf(realResult);
});

/** The honest entry request. */
function honestRequest(): LabToStudioEntryRequest {
  assert.ok(realResult !== undefined, "setup must run first");
  return bridgeEntryRequestOf(realResult, realCandidate);
}

/** The entered session view (the runtime's own projection, typed for assertions). */
type EnteredSession = { readonly id: StudioSessionId; readonly lifecycle: { readonly state: string } };

function sessionOf(value: Awaited<ReturnType<typeof mustEnter>>): EnteredSession {
  return value.session as EnteredSession;
}

/** Compose a world with fixture rights already granted (the happy frame). */
function happyWorld(options: Parameters<typeof composeBridgeWorld>[0] = {}): ComposedBridgeWorld {
  const world = composeBridgeWorld(options);
  world.grantFixtureSourceRights();
  return world;
}

// ---------------------------------------------------------------------------
// The invocation-counting runtime spy (gate ordering — zero studio calls)
// ---------------------------------------------------------------------------

/** A runtime wrapper that counts every method invocation, by name. */
function countingRuntimeOf(
  runtime: StudioRuntime,
): StudioRuntime & { readonly calls: Readonly<Record<string, number>> } {
  const calls: Record<string, number> = {};
  return new Proxy(Object.create(runtime), {
    get(_target, property, receiver) {
      if (property === "calls") {
        return calls;
      }
      const value = Reflect.get(runtime, property, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]): unknown => {
          const name = String(property);
          calls[name] = (calls[name] ?? 0) + 1;
          return value.apply(runtime, args);
        };
      }
      return value;
    },
  }) as StudioRuntime & { readonly calls: Readonly<Record<string, number>> };
}

// ---------------------------------------------------------------------------
// The entered record (the happy §24 segment)
// ---------------------------------------------------------------------------

test("ENTERED: a REAL selected candidate becomes a studio-side production entry with every chain segment", async () => {
  const world = happyWorld();
  const value = await mustEnter(world.bridge, honestRequest());
  const entry = value.entry;

  assert.equal(entry.status, "entered");
  assert.equal(entry.version, 1);
  assert.equal(entry.priorVersion, null);
  assert.equal(String(entry.scope.tenantId), BRIDGE_TENANT);
  assert.equal(String(entry.actor), String(BRIDGE_ACTOR));
  assert.equal(entry.denial, null);
  assert.equal(
    entry.boundaryStatement,
    "a studio-side production entry under the §24 boundary chain — Lab/Studio never call social platforms directly",
  );

  // The Mission segment: the EXACT cited record version + reward spec.
  assert.ok(entry.mission !== null);
  assert.equal(String(entry.mission.missionRef), String(realResult.missionRef));
  assert.equal(entry.mission.missionVersion, 4);
  assert.equal(entry.mission.rewardSpecVersion, 2);
  assert.equal(entry.mission.missionStatus, "active");

  // The Policy segment: the permitted verdict with its §30 evaluation ref.
  assert.ok(entry.policyGate !== null);
  assert.equal(entry.policyGate.decision, "permitted");
  assert.equal(entry.policyGate.outcome, "allowed");
  assert.equal(entry.policyGate.denialReason, null);
  assert.equal(entry.policyGate.evaluationRef, "policy-evaluation:bridge-fixture-1");

  // The Rights segment: the declared frame resolved active in-tenant.
  assert.ok(entry.rightsGate !== null);
  assert.equal(entry.rightsGate.frameActive, true);
  assert.deepEqual(
    entry.rightsGate.frameResolutions.map((resolution) => `${resolution.kind}:${resolution.status}`),
    ["rights-grant:active", "consent-record:active"],
  );

  // The Assets segment: every source covered under the DERIVED action.
  assert.ok(entry.assetsGate !== null);
  assert.equal(entry.assetsGate.action, "transform");
  assert.equal(entry.assetsGate.allCovered, true);
  assert.equal(entry.assetsGate.verdicts.length, realCandidate.request.sourceArtifacts.length);
  for (const verdict of entry.assetsGate.verdicts) {
    assert.equal(verdict.verdict, "granted");
    assert.equal(verdict.reason, null);
    assert.ok(verdict.grantRef !== null);
  }

  // The Production/Studio segment: the runtime's OWN session + lifecycle.
  assert.ok(entry.studio !== null);
  assert.equal(entry.studio.sessionRef, sessionOf(value).id);
  assert.equal(entry.studio.lifecycleState, "capturing");
  assert.deepEqual(entry.studio.organizationRef, {
    id: "organization:bridge-fixture-duo",
    version: 1,
  });
  assert.deepEqual(entry.studio.formatRef, { formatId: "reaction", version: 1 });
  assert.equal(String(entry.studio.labCandidateRef), JSON.stringify(["lab-candidate", String(realResult.id), realCandidate.rank]));

  // The session view is the runtime's own projection.
  assert.equal(sessionOf(value).id, entry.studio.sessionRef);
  assert.equal(sessionOf(value).lifecycle.state, "capturing");

  // BRIDGE-002's consumption surface rides the record verbatim.
  assert.ok(entry.expectations !== null);
  assert.equal(entry.expectations.counterfactual, true);
  assert.equal(entry.expectations.expectedReward, realCandidate.evaluation.expectedReward);
  assert.equal(entry.expectations.disclosure, "ensemble-evaluated-simulation-estimate");

  // The studio's own session record cites the lab candidate (supplier kind lab).
  const summary = world.sessionDirectory.getSessionSummary(BRIDGE_SCOPE, sessionOf(value).id);
  assert.ok(summary !== undefined);
  assert.equal(summary.organizationRef.id, "organization:bridge-fixture-duo");
});

test("ENTERED: the bridge's policy emission frame is the caller's declared citation set (§30 verbatim)", async () => {
  const world = happyWorld();
  await mustEnter(world.bridge, honestRequest());
  const requests = world.policyGate.receivedRequests;
  assert.equal(requests.length, 1);
  const emitted = requests[0]!;
  assert.equal(String(emitted.scope.tenantId), BRIDGE_TENANT);
  assert.equal(String(emitted.actor), String(BRIDGE_ACTOR));
  assert.equal(emitted.subjectRef, String(realCandidate.request.id));
  assert.deepEqual(
    emitted.policy.map((citation) => [String(citation.id), citation.version]),
    [["policy:bridge-fixture-production", 1]],
  );
  // The declared spend is the canonical request's own budget limit.
  assert.deepEqual(emitted.declaredSpend, realCandidate.request.budget.maxCost);
  assert.equal(emitted.deadline, realCandidate.request.deadline);
});

test("ENTERED: the derived rights action is `use` when the candidate's chain is empty (documented derivation)", async () => {
  // A hand-shaped non-noop candidate with an EMPTY chain riding the result's
  // own ranked slot (the derivation's other branch — REAL search candidates
  // carry chains; the no-op's empty chain is rejected at intake).
  const emptyChain = {
    ...realCandidate,
    candidate: { ...realCandidate.candidate, transformChain: [] },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? emptyChain : entry)),
  };
  const world = composeBridgeWorld();
  // Grants carrying ONLY the `use` action: the empty-chain candidate is
  // covered under `use`; a chained candidate would be action-not-covered.
  world.grantFixtureSourceRights({ actions: ["use"] });
  const value = await mustEnter(
    world.bridge,
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, emptyChain),
  );
  assert.equal(value.entry.assetsGate!.action, "use");
  assert.equal(value.entry.assetsGate!.allCovered, true);
});

test("ENTERED: a chained candidate under use-only grants is denied at the assets gate (action derivation, REAL authority)", async () => {
  const world = composeBridgeWorld();
  world.grantFixtureSourceRights({ actions: ["use"] });
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "assets-gate-denied");
  if (outcome.error.kind === "assets-gate-denied") {
    // The REAL evaluateRights cascade's denial reason, verbatim.
    assert.match(outcome.error.reason, /action-not-covered/);
    assert.equal(outcome.error.entry.assetsGate!.action, "transform");
    assert.equal(outcome.error.entry.assetsGate!.allCovered, false);
  }
});

// ---------------------------------------------------------------------------
// Gate ordering (the W6-C/W8-A discipline: gates PRECEDE studio invocation)
// ---------------------------------------------------------------------------

test("GATE ORDER: a policy denial means ZERO studio runtime calls (invocation-counting spy)", async () => {
  let spyCalls: Record<string, number> = {};
  const world = composeBridgeWorld({
    policyScript: [
      {
        decision: "denied",
        outcome: "denied",
        denialReason: "budget ceiling violated: declared USD 40.00 exceeds maximum USD 25.00",
        policyRef: "policy:bridge-fixture-production" as never,
        evaluationRef: "policy-evaluation:bridge-fixture-2",
      },
    ],
    wrapRuntime: (runtime) => {
      const spy = countingRuntimeOf(runtime);
      spyCalls = (spy as unknown as { calls: Record<string, number> }).calls;
      return spy;
    },
  });
  world.grantFixtureSourceRights();
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "policy-gate-denied");
  assert.deepEqual(
    Object.entries(spyCalls).filter(([name]) => name === "createSession" || name === "loadOrganization"),
    [],
    "a policy denial must reach ZERO studio runtime methods",
  );
  // The policy gate was consulted exactly once; nothing downstream moved.
  assert.equal(world.policyGate.receivedRequests.length, 1);
});

test("GATE ORDER: the ladder mission → policy → rights frame → assets coverage → studio (fail-closed ladder pins)", async () => {
  // 1. Mission unresolved → NOTHING downstream consulted, nothing recorded.
  const worldMission = composeBridgeWorld({ missions: [] });
  worldMission.grantFixtureSourceRights();
  const missionFailure = await worldMission.bridge.enterProduction(honestRequest());
  assert.ok(!missionFailure.ok);
  assert.equal(missionFailure.error.kind, "mission-unresolved");
  assert.equal(worldMission.policyGate.receivedRequests.length, 0, "policy is never consulted when the mission does not resolve");
  assert.deepEqual(worldMission.bridge.listLatestEntries(BRIDGE_SCOPE), [], "nothing recorded");

  // 2. Policy denied → rights/assets/studio never consulted.
  const worldPolicy = composeBridgeWorld({
    policyScript: [{ ...BRIDGE_PERMITTED_VERDICT, decision: "denied", outcome: "denied", denialReason: "no" }],
    rightsGateDouble: {
      frameScript: [{ resolutions: [], frameActive: true }],
      coverageScript: [{ verdicts: [], allCovered: true }],
    },
  });
  worldPolicy.grantFixtureSourceRights();
  const policyFailure = await worldPolicy.bridge.enterProduction(honestRequest());
  assert.ok(!policyFailure.ok);
  assert.equal(policyFailure.error.kind, "policy-gate-denied");
  assert.equal(worldPolicy.rightsGateDoublePort!.receivedFrameRequests.length, 0, "rights frame is never resolved when policy denies");
  assert.equal(worldPolicy.rightsGateDoublePort!.receivedCoverageRequests.length, 0, "coverage is never evaluated when policy denies");

  // 3. Rights frame inactive → coverage/studio never consulted.
  const worldRights = composeBridgeWorld({
    rightsGateDouble: {
      frameScript: [
        {
          resolutions: [{ ref: "rights:bridge-source-grant", kind: "rights-grant", status: "revoked" }],
          frameActive: false,
        },
      ],
      coverageScript: [{ verdicts: [], allCovered: true }],
    },
  });
  worldRights.grantFixtureSourceRights();
  const rightsFailure = await worldRights.bridge.enterProduction(honestRequest());
  assert.ok(!rightsFailure.ok);
  assert.equal(rightsFailure.error.kind, "rights-gate-denied");
  assert.equal(worldRights.rightsGateDoublePort!.receivedCoverageRequests.length, 0, "coverage is never evaluated when the frame is inactive");

  // 4. Assets uncovered → studio never invoked (the spy wrapper).
  let spyCalls: Record<string, number> = {};
  const worldAssets = composeBridgeWorld({
    rightsGateDouble: {
      frameScript: [{ resolutions: [], frameActive: true }],
      coverageScript: [
        {
          verdicts: [
            { subjectRef: "artifact:bridge-source-video-1", verdict: "denied", reason: "no-explicit-grant", grantRef: null },
          ],
          allCovered: false,
        },
      ],
    },
    wrapRuntime: (runtime) => {
      const spy = countingRuntimeOf(runtime);
      spyCalls = (spy as unknown as { calls: Record<string, number> }).calls;
      return spy;
    },
  });
  worldAssets.grantFixtureSourceRights();
  const assetsFailure = await worldAssets.bridge.enterProduction(honestRequest());
  assert.ok(!assetsFailure.ok);
  assert.equal(assetsFailure.error.kind, "assets-gate-denied");
  assert.equal(spyCalls.createSession ?? 0, 0, "an assets denial must reach ZERO createSession calls");
  assert.equal(spyCalls.loadOrganization ?? 0, 0, "an assets denial must reach ZERO loadOrganization calls");
});

// ---------------------------------------------------------------------------
// Attributable failures append EXACTLY ONE record with verbatim attribution
// ---------------------------------------------------------------------------

test("DENIED@policy: the record carries the authority's attribution VERBATIM (typed kind↔stage)", async () => {
  const denialReason = "budget ceiling violated: declared USD 40.00 exceeds maximum USD 25.00";
  const world = composeBridgeWorld({
    policyScript: [
      {
        decision: "denied",
        outcome: "denied",
        denialReason,
        policyRef: "policy:bridge-fixture-production" as never,
        evaluationRef: "policy-evaluation:bridge-fixture-2",
      },
    ],
  });
  world.grantFixtureSourceRights();
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.ok(outcome.error.kind === "policy-gate-denied");
  if (outcome.error.kind === "policy-gate-denied") {
    assert.equal(outcome.error.stage, "policy-gate");
    assert.equal(outcome.error.reason, denialReason);
    const entry = outcome.error.entry;
    assert.equal(entry.status, "denied");
    assert.deepEqual(entry.denial, { stage: "policy-gate", reason: denialReason });
    // The attempt's own context rides the record.
    assert.ok(entry.mission !== null, "the mission linkage is recorded (it resolved)");
    assert.ok(entry.policyGate !== null);
    assert.equal(entry.policyGate.outcome, "denied");
    assert.equal(entry.policyGate.decision, "denied");
    assert.equal(entry.policyGate.denialReason, denialReason);
    assert.equal(entry.policyGate.evaluationRef, "policy-evaluation:bridge-fixture-2");
    assert.equal(entry.rightsGate, null, "the rights gate never ran");
    assert.equal(entry.assetsGate, null, "the assets gate never ran");
    assert.equal(entry.studio, null, "no studio surface was touched");
    assert.ok(entry.expectations !== null, "the expectations surface is carried on denied records too");
    // EXACTLY ONE record exists.
    assert.equal(world.bridge.listLatestEntries(BRIDGE_SCOPE).length, 1);
    assert.equal(world.bridge.getEntry(BRIDGE_SCOPE, entry.id), entry);
  }
});

test("DENIED@policy: approval-required and insufficient-policy both fail closed (no pending state)", async () => {
  for (const outcome_ of ["approval-required", "insufficient-policy"] as const) {
    const world = composeBridgeWorld({
      policyScript: [
        {
          decision: "denied",
          outcome: outcome_,
          denialReason:
            outcome_ === "approval-required"
              ? 'approval-required: approver role "marketing-lead" must approve the production request'
              : "insufficient-policy: no cited policy rule matched the production-request-approval action (fail closed — never a silent allow)",
          policyRef: null,
          evaluationRef: "policy-evaluation:bridge-fixture-3",
        },
      ],
    });
    world.grantFixtureSourceRights();
    const failure = await world.bridge.enterProduction(honestRequest());
    assert.ok(!failure.ok, outcome_);
    assert.equal(failure.error.kind, "policy-gate-denied");
    assert.equal(failure.error.entry.policyGate!.outcome, outcome_);
    assert.equal(failure.error.entry.status, "denied");
  }
});

test("DENIED@rights: an INACTIVE frame appends the record with the composed verbatim reason (REAL authority)", async () => {
  // A REAL grant that was REVOKED after seeding: the frame resolution is
  // `revoked` and the denial reason names it verbatim.
  const world = composeBridgeWorld();
  world.grantFixtureSourceRights();
  const revoked = world.rightsRepository.revokeRights(BRIDGE_SCOPE, "rights:bridge-source-grant" as never);
  assert.ok(!("error" in revoked), "fixture revocation must succeed");
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "rights-gate-denied");
  if (outcome.error.kind === "rights-gate-denied") {
    assert.match(outcome.error.reason, /rights-grant .* is revoked/);
    const entry = outcome.error.entry;
    assert.equal(entry.status, "denied");
    assert.deepEqual(entry.denial, { stage: "rights-gate", reason: outcome.error.reason });
    assert.ok(entry.policyGate !== null, "the policy gate ran first");
    assert.ok(entry.rightsGate !== null);
    assert.equal(entry.rightsGate.frameActive, false);
    assert.equal(entry.assetsGate, null, "the assets gate never ran");
    assert.equal(entry.studio, null);
  }
});

test("DENIED@rights: an EXPIRED grant fails the frame (REAL authority, expiry is exclusive)", async () => {
  const world = composeBridgeWorld();
  // grantedAt lands on the shared clock's first tick (2026-06-01T00:00:01Z);
  // the bridge's rights-gate `now` runs on a LATER tick — this expiry sits
  // between them, so the REAL authority resolves the frame `expired`.
  world.grantFixtureSourceRights({ expiresAt: "2026-06-01T00:00:02.000Z" });
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "rights-gate-denied");
  if (outcome.error.kind === "rights-gate-denied") {
    assert.match(outcome.error.reason, /rights-grant .* is expired/);
  }
});

test("DENIED@rights: an UNRESOLVED rights ref fails the frame (REAL authority — no existence leaks)", async () => {
  const world = composeBridgeWorld();
  // No grant seeded at all: the frame's ref is unresolved.
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "rights-gate-denied");
  if (outcome.error.kind === "rights-gate-denied") {
    assert.match(outcome.error.reason, /rights-grant .* is unresolved/);
  }
});

test("DENIED@assets: an uncovered source artifact appends the record with the REAL cascade's reason verbatim", async () => {
  const world = composeBridgeWorld();
  // The grant covers ONLY the first source artifact.
  world.grantFixtureSourceRights({
    subjects: [
      String(realCandidate.request.sourceArtifacts[0]!.artifactId),
      String(realCandidate.request.sourceArtifacts[0]!.storageRef),
    ],
  });
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "assets-gate-denied");
  if (outcome.error.kind === "assets-gate-denied") {
    // The REAL cascade: the grant EXISTS but its subjects do not cover the
    // second source artifact → subject-not-covered, verbatim.
    assert.match(outcome.error.reason, /subject-not-covered/);
    const entry = outcome.error.entry;
    assert.equal(entry.status, "denied");
    assert.deepEqual(entry.denial, { stage: "assets-gate", reason: outcome.error.reason });
    assert.ok(entry.rightsGate !== null, "the rights frame resolved first");
    assert.equal(entry.rightsGate.frameActive, true);
    assert.ok(entry.assetsGate !== null);
    assert.equal(entry.assetsGate.allCovered, false);
    assert.equal(entry.assetsGate.verdicts.length, realCandidate.request.sourceArtifacts.length);
    assert.equal(entry.assetsGate.verdicts[1]!.verdict, "denied");
    assert.equal(entry.assetsGate.verdicts[1]!.reason, "subject-not-covered");
    assert.equal(entry.studio, null, "no studio surface was touched");
  }
});

test("DENIED@assets: a grant for ANOTHER GRANTEE covers nothing (the actor is the evaluated grantee)", async () => {
  const world = composeBridgeWorld();
  world.grantFixtureSourceRights({ grantee: "identity-someone-else" });
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "assets-gate-denied");
  if (outcome.error.kind === "assets-gate-denied") {
    assert.match(outcome.error.reason, /grantee-not-covered/);
  }
});

test("MISSION failures record NOTHING (nothing attributable happened — the W8-A discipline)", async () => {
  // Unknown mission ref@version (unknown ≡ cross-tenant, §31).
  const worldUnknown = happyWorld();
  const unknown = await worldUnknown.bridge.enterProduction({
    ...honestRequest(),
    missionVersion: 99,
  });
  assert.ok(!unknown.ok);
  assert.equal(unknown.error.kind, "mission-unresolved");
  assert.deepEqual(worldUnknown.bridge.listLatestEntries(BRIDGE_SCOPE), []);

  // A NON-ACTIVE mission (completed).
  const worldCompleted = composeBridgeWorld({
    missions: [
      {
        id: (await Promise.resolve(realResult)).missionRef,
        tenantId: BRIDGE_TENANT,
        version: 4,
        status: "completed",
        rewardSpec: { version: 2 },
        objective: { statement: "done" },
      },
    ],
  });
  worldCompleted.grantFixtureSourceRights();
  const completed = await worldCompleted.bridge.enterProduction(honestRequest());
  assert.ok(!completed.ok);
  assert.equal(completed.error.kind, "mission-not-active");
  assert.match(
    (completed.error as { reason: string }).reason,
    /"completed" — only an active mission accepts production entry/,
  );
  assert.deepEqual(worldCompleted.bridge.listLatestEntries(BRIDGE_SCOPE), []);
});

test("MISSION: the port consults the EXACT cited version (never 'latest')", async () => {
  const world = happyWorld();
  await mustEnter(world.bridge, honestRequest());
  assert.equal(world.mission.requestedLookups.length, 1);
  assert.deepEqual(world.mission.requestedLookups[0], {
    tenantId: BRIDGE_TENANT,
    missionRef: String(realResult.missionRef),
    version: 4,
  });
});

test("CALLER-SHAPE failures record NOTHING (validation precedes every authority)", async () => {
  const world = happyWorld();
  const lookalike = structuredClone(realCandidate) as unknown as RankedCandidateProgram;
  const outcome = await world.bridge.enterProduction(bridgeEntryRequestOf(realResult, lookalike));
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "candidate-not-in-result");
  assert.deepEqual(world.bridge.listLatestEntries(BRIDGE_SCOPE), []);
  assert.equal(world.mission.requestedLookups.length, 0, "not even the mission was consulted");
  assert.equal(world.policyGate.receivedRequests.length, 0);
});

// ---------------------------------------------------------------------------
// Studio-entry failures (attributable — one record each)
// ---------------------------------------------------------------------------

test("STUDIO-ENTRY-FAILED: an unregistered format version fails with a recorded studio failure", async () => {
  const world = happyWorld();
  const outcome = await world.bridge.enterProduction({
    ...honestRequest(),
    formatVersion: 99,
  });
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "studio-entry-failed");
  if (outcome.error.kind === "studio-entry-failed") {
    assert.equal(outcome.error.stage, "studio-entry");
    assert.match(outcome.error.reason, /createSession rejected the production request: format-not-registered/);
    const entry = outcome.error.entry;
    assert.equal(entry.status, "studio-entry-failed");
    assert.deepEqual(entry.denial, { stage: "studio-entry", reason: outcome.error.reason });
    // All four gates PASSED and are recorded on the failure record.
    assert.equal(entry.policyGate!.decision, "permitted");
    assert.equal(entry.rightsGate!.frameActive, true);
    assert.equal(entry.assetsGate!.allCovered, true);
    assert.equal(entry.studio, null, "no session existed to cite");
  }
});

test("STUDIO-ENTRY-FAILED: an organization the studio cannot load fails AFTER the gates (recorded with a failed studio segment)", async () => {
  // The studio organization source carries a DIFFERENT organization — the
  // candidate's citation cannot load through the studio's own loader.
  const world = composeBridgeWorld({
    studioOrganizations: [
      {
        id: "organization:someone-else",
        version: 1,
        declaredCapabilities: ["compose_reaction", "render_timeline"],
      },
    ],
  });
  world.grantFixtureSourceRights();
  const outcome = await world.bridge.enterProduction(honestRequest());
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "studio-entry-failed");
  if (outcome.error.kind === "studio-entry-failed") {
    assert.match(outcome.error.reason, /loadOrganization failed for the cited organization/);
    const entry = outcome.error.entry;
    assert.equal(entry.status, "studio-entry-failed");
    // The studio segment EXISTS and cites the failed lifecycle + session.
    assert.ok(entry.studio !== null);
    assert.equal(entry.studio.lifecycleState, "failed");
    assert.ok(String(entry.studio.sessionRef).startsWith("sess_"));
  }
});

// ---------------------------------------------------------------------------
// Tenant scoping (§31) + append-only + caller aliasing (W10-F1/D3/D4)
// ---------------------------------------------------------------------------

test("TENANT: entries are tenant-scoped — cross-tenant reads see nothing", async () => {
  const world = happyWorld();
  const value = await mustEnter(world.bridge, honestRequest());
  const otherScope: TenantScope = { tenantId: "tenant-other" as never };
  assert.equal(world.bridge.getEntry(otherScope, value.entry.id), undefined);
  assert.deepEqual(world.bridge.listLatestEntries(otherScope), []);
  assert.equal(world.bridge.getEntry(BRIDGE_SCOPE, value.entry.id), value.entry);
});

test("APPEND-ONLY: two entry attempts mint two chains; prior versions stay bit-for-bit", async () => {
  const world = happyWorld();
  const first = await mustEnter(world.bridge, honestRequest());
  const second = await mustEnter(world.bridge, honestRequest());
  assert.notEqual(first.entry.id, second.entry.id);
  assert.deepEqual(
    world.bridge.listLatestEntries(BRIDGE_SCOPE).map((entry) => entry.id),
    [first.entry.id, second.entry.id],
  );
  // A hostile caller mutation of their returned record copies nothing back
  // (the returned record IS the store's frozen record — D3 by construction).
  assert.throws(() => {
    (first.entry as unknown as { status: string }).status = "packaged";
  }, /read only|Cannot assign/i, "the returned record is frozen — hostile mutation throws");
  assert.equal(world.bridge.getEntry(BRIDGE_SCOPE, first.entry.id)!.status, "entered");
});

test("CALLER ALIASING: post-entry mutation of the caller's request objects moves nothing (W10-F1)", async () => {
  const world = happyWorld();
  const request = honestRequest();
  const value = await mustEnter(world.bridge, request);
  const snapshot = structuredClone(value.entry);

  // The hostile caller rewrites their CALLER-OWNED frame objects AFTER the
  // entry (scope, policy citations, intake — freshly built by the caller).
  const hostileScope = request.scope as unknown as { tenantId: string };
  hostileScope.tenantId = "tenant-forged";
  const hostilePolicy = request.policy[0] as unknown as Record<string, unknown>;
  hostilePolicy.id = "policy:forged";
  const hostileIntake = request.intake as unknown as Record<string, unknown>;
  hostileIntake.inputKind = "complete-script";

  assert.deepEqual(world.bridge.getEntry(BRIDGE_SCOPE, value.entry.id), snapshot);
  assert.deepEqual(world.bridge.listLatestEntries(BRIDGE_SCOPE), [snapshot]);

  // The caller's own frame objects were never frozen in place BY THE BRIDGE.
  assert.equal(Object.isFrozen(request.scope), false);
  assert.equal(Object.isFrozen(request.policy[0]), false);
  assert.equal(Object.isFrozen(request.intake), false);

  // The search result's OWN records arrive already frozen from the REAL
  // search (its own returned-records discipline) — the bridge never froze
  // them, and hostile mutation of them throws without moving anything.
  assert.equal(Object.isFrozen(request.searchResult), true, "the REAL search's own output records are frozen");
  assert.equal(Object.isFrozen(request.selected), true);
  assert.throws(() => {
    (request.selected.candidate as unknown as { studioFormat: string }).studioFormat = "audio-podcast";
  }, /read only|Cannot assign/i);
  assert.equal(String(request.selected.candidate.studioFormat), "reaction");
  assert.deepEqual(world.bridge.getEntry(BRIDGE_SCOPE, value.entry.id), snapshot);
});

test("SCOPE FORGERY: forging the entry scope after the call moves nothing (D4)", async () => {
  const world = happyWorld();
  const scope = { ...BRIDGE_SCOPE } as { tenantId: string };
  const request = { ...honestRequest(), scope: scope as unknown as TenantScope };
  const value = await mustEnter(world.bridge, request);
  scope.tenantId = "tenant-forged";
  assert.equal(String(world.bridge.getEntry(BRIDGE_SCOPE, value.entry.id)!.scope.tenantId), BRIDGE_TENANT);
  assert.equal(world.bridge.getEntry({ tenantId: "tenant-forged" as never }, value.entry.id), undefined);
  assert.equal(world.bridge.listLatestEntries(BRIDGE_SCOPE).length, 1);
});

// ---------------------------------------------------------------------------
// recordStudioPackage (the studio's OWN review path composes; the bridge cites)
// ---------------------------------------------------------------------------

/** Drive one entered session to the packaged state through the studio's own surfaces. */
async function driveSessionToPackaged(
  world: ComposedBridgeWorld,
  sessionId: StudioSessionId,
): Promise<{ readonly packageId: string; readonly packageVersion: number }> {
  // The studio's own §15 live-consent discipline: seed the REAL authorities
  // for the joining participant (identity + membership + session consents).
  world.authorities.ensureIdentity({ tenantId: BRIDGE_TENANT, identityRef: USER });
  const captureConsent = world.authorities.recordSessionConsent({
    tenantId: BRIDGE_TENANT,
    identityRef: USER,
    sessionId,
    actions: ["use"],
  });
  const processingConsent = world.authorities.recordSessionConsent({
    tenantId: BRIDGE_TENANT,
    identityRef: USER,
    sessionId,
    actions: ["transform"],
  });
  assert.deepEqual([String(captureConsent), String(processingConsent)], ["consent-1", "consent-2"]);

  await mustOk(world.runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(world.runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(world.artifactFactory, [rawArtifact]);
  await mustOk(world.runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    world.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [
        { artifact: intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true },
      ],
      editGraphRef: recordedEditGraphRefOf(sessionId),
    }),
    "completeProcessing",
  );
  const accepted = await mustOk(
    world.runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "submitReview",
  );
  assert.equal(accepted.session.lifecycle.state, "packaged");
  assert.ok(accepted.package !== undefined && accepted.package !== null);
  return { packageId: String(accepted.package.id), packageVersion: accepted.package.version };
}

test("PACKAGED: recordStudioPackage cites what the studio's OWN review path composed (v2 append-only)", async () => {
  const world = happyWorld();
  const value = await mustEnter(world.bridge, honestRequest());
  const entryId = value.entry.id;
  const v1Snapshot = structuredClone(value.entry);

  // Before the studio packages: session-not-packaged.
  const early = await world.bridge.recordStudioPackage(BRIDGE_SCOPE, entryId);
  assert.ok(!early.ok);
  assert.equal(early.failure.kind, "session-not-packaged");

  const packaged = await driveSessionToPackaged(world, sessionOf(value).id);
  const recorded = await world.bridge.recordStudioPackage(BRIDGE_SCOPE, entryId);
  assert.ok(recorded.ok);
  if (recorded.ok) {
    const entry = recorded.value.entry;
    assert.equal(entry.version, 2);
    assert.equal(entry.priorVersion, 1);
    assert.equal(entry.status, "packaged");
    assert.deepEqual(entry.packageRef, {
      packageId: packaged.packageId,
      version: packaged.packageVersion,
    });
    // The v1 record stays resolvable and BIT-FOR-BIT unchanged.
    const v1 = world.bridge.getEntry(BRIDGE_SCOPE, entryId, 1);
    assert.ok(v1 !== undefined);
    assert.deepEqual(v1, v1Snapshot);
    assert.equal(v1.status, "entered");
    // The latest is v2; the chain ascends.
    assert.equal(world.bridge.getEntry(BRIDGE_SCOPE, entryId)!.version, 2);
    assert.equal(world.bridge.entryStore.listEntryVersions(BRIDGE_SCOPE, entryId).length, 2);
    // The package resolves through the studio's OWN packaging authority.
    const resolved = world.packaging.getArtifactPackage(
      BRIDGE_SCOPE,
      entry.packageRef!.packageId,
      entry.packageRef!.version,
    );
    assert.ok(resolved !== undefined, "the cited package resolves through the canonical authority");
  }

  // A second citation attempt fails closed (already packaged).
  const again = await world.bridge.recordStudioPackage(BRIDGE_SCOPE, entryId);
  assert.ok(!again.ok);
  assert.equal(again.failure.kind, "entry-not-entered");
});

test("PACKAGED failure ladder: unknown entry / non-entered entry / unresolved session", async () => {
  const world = happyWorld();

  const unknown = await world.bridge.recordStudioPackage(BRIDGE_SCOPE, "lts_unknown");
  assert.ok(!unknown.ok);
  assert.equal(unknown.failure.kind, "entry-not-found");

  const crossTenant = await world.bridge.recordStudioPackage(
    { tenantId: "tenant-other" as never },
    "lts_unknown",
  );
  assert.ok(!crossTenant.ok);
  assert.equal(crossTenant.failure.kind, "entry-not-found");

  // A denied entry cannot cite a package.
  const worldDenied = composeBridgeWorld({
    policyScript: [
      { ...BRIDGE_PERMITTED_VERDICT, decision: "denied", outcome: "denied", denialReason: "no" },
    ],
  });
  worldDenied.grantFixtureSourceRights();
  const denied = await worldDenied.bridge.enterProduction(honestRequest());
  assert.ok(!denied.ok && denied.error.kind === "policy-gate-denied");
  if (denied.error.kind === "policy-gate-denied") {
    const notEntered = await worldDenied.bridge.recordStudioPackage(BRIDGE_SCOPE, denied.error.entry.id);
    assert.ok(!notEntered.ok);
    assert.equal(notEntered.failure.kind, "entry-not-entered");
  }

  // A session with NO directory summary (the runtime's own observation seam
  // has no record — a session the studio does not know in this scope).
  const value = await mustEnter(world.bridge, honestRequest());
  const summaryless = await world.bridge.recordStudioPackage(BRIDGE_SCOPE, value.entry.id);
  // The summary EXISTS (the runtime published it at creation) but carries no
  // package yet → session-not-packaged (the honest ladder rung).
  assert.ok(!summaryless.ok);
  assert.equal(summaryless.failure.kind, "session-not-packaged");
  if (summaryless.failure.kind === "session-not-packaged") {
    assert.match(summaryless.failure.reason, /no package attached yet/);
  }
});

// ---------------------------------------------------------------------------
// The §24 boundary pin (Lab/Studio never call providers — output shape)
// ---------------------------------------------------------------------------

test("BOUNDARY: the bridge's output is a studio-side production entry — no distribution surface exists", async () => {
  const world = happyWorld();
  const value = await mustEnter(world.bridge, honestRequest());
  // The port surface is exactly the four §24-chain methods (no publish,
  // no distribute, no provider call of any kind).
  const methodNames = Object.keys(world.bridge).filter((key) => typeof (world.bridge as unknown as Record<string, unknown>)[key] === "function");
  assert.deepEqual([...methodNames].sort(), ["enterProduction", "getEntry", "listLatestEntries", "recordStudioPackage"]);
  assert.match(value.entry.boundaryStatement, /never call social platforms directly/);
});
