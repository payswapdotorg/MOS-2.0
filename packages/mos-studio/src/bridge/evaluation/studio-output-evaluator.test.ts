/**
 * BRIDGE-002 core battery (studio-output-evaluator.ts) — the §19
 * Studio-output evaluation/treatment authority over the REAL citation
 * surfaces: the BRIDGE-001 entry store (REAL, behind the bridge port), the
 * REAL STUDIO-013 packaging authority (the studio's own review path composed
 * the packages) and the REAL STUDIO-014 session directory — with the
 * mission/policy doubles behind the BRIDGE-001 gates disclosed (their REAL
 * twins run in compat/evaluation-real-authorities.test.ts).
 *
 * Pins:
 * - every one of the TEN §19 kinds records exactly ONE immutable v1 record
 *   with the full citation chain (package @ exact version, entry citation
 *   verbatim, expectations counterfactual-labeled, §30 observability);
 * - the GATE LADDER: package resolution → entry/candidate citation →
 *   expectations citation → session observation → decision cross-checks →
 *   record; a denial at ANY stage means ZERO store mutation;
 * - QUALITY vs RIGHTS/POLICY distinct classes: the smuggling probe fails
 *   typed; a BRIDGE-001-DENIED entry is not evaluable (its denial record
 *   stays a denial — never converted);
 * - DECISIONS DRIVE THE CHAIN, NEVER EXECUTE IT: zero studio-runtime
 *   invocations during any evaluation (the invocation-counting spy), and
 *   the port surface is exactly the four methods + store inspection;
 * - the §19 treatment linkage lifecycle: reserve (v1) → the studio's OWN
 *   treatment path composes the successor through STUDIO-013 → cite (v2);
 *   prior versions bit-for-bit immutable; single completion; the re-produced
 *   completion after a switch;
 * - ABANDON is first-class: a recorded terminal verdict with its justifying
 *   analysis snapshot — never a deletion (entry/package/session all intact);
 * - tenant isolation and caller-aliasing probes (D3/D4 at the authority).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { StudioRuntime } from "../../runtime/studio-runtime.js";
import type { TenantScope } from "@mos/contracts";

import {
  BRIDGE_ACTOR,
  BRIDGE_PERMITTED_VERDICT,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
} from "../../testing/bridge-fixtures.js";
import {
  ABANDONMENT_ANALYSIS,
  applyStudioTreatmentThroughRuntime,
  composeEvaluationWorld,
  evaluationRequestOf,
  labRoutingOf,
} from "../../testing/evaluation-fixtures.js";
import type { ComposedEvaluationWorld, PackagedBridgeEntry } from "../../testing/evaluation-fixtures.js";
import type {
  StudioOutputEvaluationOutcome,
  StudioOutputEvaluationRequest,
} from "./contracts/studio-output-evaluation.js";
import { createStudioOutputEvaluator } from "./studio-output-evaluator.js";
import {
  createInMemoryBridgeReads,
  createInMemoryPackagingReads,
  createInMemorySessionDirectoryReads,
} from "./adapters/in-memory-evaluation-authorities.js";
import type { LabToStudioProductionEntry } from "../contracts/lab-to-studio-entry.js";

// ---------------------------------------------------------------------------
// The composed worlds
// ---------------------------------------------------------------------------

let world: ComposedEvaluationWorld;
let packaged: PackagedBridgeEntry;

test("EVALUATION core setup: the REAL bridge world drives to a packaged, cited entry", async () => {
  world = await composeEvaluationWorld();
  packaged = await world.enterAndPackage();
  assert.equal(packaged.entry.status, "packaged");
  assert.equal(packaged.entry.version, 2);
  assert.ok(packaged.entry.packageRef !== null);
});

/** The honest accept-decision request over the packaged entry. */
function acceptRequest(overrides: Partial<StudioOutputEvaluationRequest> = {}): StudioOutputEvaluationRequest {
  return evaluationRequestOf(packaged, { kind: "accept", summary: "within the declared interval" }, overrides);
}

/** Evaluate and assert the recorded outcome (fail loud on denial). */
async function mustEvaluate(
  request: StudioOutputEvaluationRequest,
): Promise<Extract<StudioOutputEvaluationOutcome, { ok: true }>["value"]> {
  const outcome = await world.evaluator.evaluateStudioOutput(request);
  if (!outcome.ok) {
    throw new Error(`§19 evaluation failed: ${outcome.error.kind} — ${outcome.error.reason}`);
  }
  return outcome.value;
}

// ---------------------------------------------------------------------------
// THE TEN KINDS — every kind records exactly one fully-cited record
// ---------------------------------------------------------------------------

test("ACCEPT: the decision records ONE immutable v1 record with the full citation chain", async () => {
  const before = world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const value = await mustEvaluate(acceptRequest());
  const record = value.evaluation;

  assert.equal(record.version, 1);
  assert.equal(record.priorVersion, null);
  assert.equal(record.status, "decided");
  assert.equal(record.decision.kind, "accept");
  assert.equal(String(record.actor), String(BRIDGE_ACTOR));
  assert.equal(record.treatmentLinkage, null);
  assert.equal(record.notes, null);
  assert.match(record.boundaryStatement, /never call social platforms directly/);
  assert.equal(Object.isFrozen(record), true);

  // The evaluated package citation is EXACT (resolvable through STUDIO-013).
  assert.equal(String(record.evaluatedPackage.packageId), packaged.packageRef.packageId);
  assert.equal(record.evaluatedPackage.version, packaged.packageRef.version);
  const resolved = world.bridgeWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    record.evaluatedPackage.packageId,
    record.evaluatedPackage.version,
  );
  assert.ok(resolved !== undefined);
  assert.equal(String(record.evaluatedPackage.sessionRef), String(resolved.sessionRef));

  // The entry/candidate citation chain is VERBATIM from the cited entry version.
  assert.equal(record.entryCitation.entryId, packaged.entry.id);
  assert.equal(record.entryCitation.entryVersion, packaged.entry.version);
  assert.deepEqual(record.entryCitation.candidate, packaged.entry.candidate);
  assert.deepEqual(record.entryCitation.mission, packaged.entry.mission);
  assert.deepEqual(record.entryCitation.studio, packaged.entry.studio);
  const studioSegment = packaged.entry.studio;
  const missionSegment = packaged.entry.mission;
  assert.ok(studioSegment !== null && missionSegment !== null);

  // The declared-expectations citation is counterfactual-labeled (rule 29).
  assert.deepEqual(record.expectations, packaged.entry.expectations);
  assert.equal(record.expectations.counterfactual, true);
  assert.equal(record.expectations.disclosure.length > 0, true);

  // The §30 observability trail is cited from the REAL records.
  assert.equal(record.observability.sessionLifecycleState, "packaged");
  assert.equal(record.observability.organizationRef.id, studioSegment.organizationRef.id);
  assert.equal(record.observability.formatRef.formatId, studioSegment.formatRef.formatId);
  assert.deepEqual(
    record.observability.transformChain,
    packaged.entry.candidate.transformChain.map((step) => ({
      definitionId: step.definitionId,
      definitionVersion: step.definitionVersion,
    })),
  );
  assert.ok(record.observability.finalArtifactIds.length > 0);
  assert.equal(record.observability.missionRef.id, String(missionSegment.missionRef));

  // Exactly ONE record appended.
  assert.equal(world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before + 1);
});

test("TEN KINDS: each remaining kind records with its payload verbatim", async () => {
  const routing = labRoutingOf(packaged);
  const decisions: StudioOutputEvaluationRequest["decision"][] = [
    { kind: "reject-quality", failedCriteria: ["hook-retention-floor"], rationale: "cold open under floor" },
    { kind: "reject-strategy", rationale: "the output no longer serves the declared strategy" },
    { kind: "request-treatment", treatment: { kind: "trim", parametersRef: "params:trim-1", rationale: "tighten the mid-section" } },
    { kind: "require-human-action", humanAction: { objective: "re-capture the intro take", rationale: "synthetic intro reads flat" } },
    { kind: "switch-organization", routing },
    { kind: "switch-transform", routing },
    { kind: "switch-engine", routing },
    { kind: "abandon", justification: "delay cost dominates", analysis: ABANDONMENT_ANALYSIS },
  ];
  for (const decision of decisions) {
    const value = await mustEvaluate(evaluationRequestOf(packaged, decision));
    assert.equal(value.evaluation.decision.kind, decision.kind);
    assert.deepEqual(value.evaluation.decision, decision);
  }

  // accept-alternate-output over a REAL alternate (a second packaged entry).
  const alternateEntry = await world.enterAndPackage();
  const accepted = await mustEvaluate(
    evaluationRequestOf(packaged, {
      kind: "accept-alternate-output",
      alternate: { ...alternateEntry.packageRef },
    }),
  );
  assert.equal(accepted.evaluation.decision.kind, "accept-alternate-output");
  if (accepted.evaluation.decision.kind === "accept-alternate-output") {
    const alternate = world.bridgeWorld.packaging.getArtifactPackage(
      BRIDGE_SCOPE,
      accepted.evaluation.decision.alternate.packageId as never,
      accepted.evaluation.decision.alternate.version,
    );
    assert.ok(alternate !== undefined, "the alternate resolves through the REAL packaging authority");
  }
});

test("TREATMENT-LINKAGE RESERVE: request-treatment and switch-* decisions reserve the linkage over the prior version", async () => {
  const treatment = await mustEvaluate(
    evaluationRequestOf(packaged, {
      kind: "request-treatment",
      treatment: { kind: "edit", rationale: "tighten" },
    }),
  );
  const linkage = treatment.evaluation.treatmentLinkage;
  assert.ok(linkage !== null);
  assert.equal(linkage.phase, "awaiting-successor");
  assert.equal(linkage.decisionKind, "request-treatment");
  assert.equal(String(linkage.priorPackageRef.packageId), packaged.packageRef.packageId);
  assert.equal(linkage.priorPackageRef.version, packaged.packageRef.version);
  assert.equal(linkage.directive.treatment?.kind, "edit");

  const switched = await mustEvaluate(
    evaluationRequestOf(packaged, { kind: "switch-engine", routing: labRoutingOf(packaged) }),
  );
  const switchLinkage = switched.evaluation.treatmentLinkage;
  assert.ok(switchLinkage !== null);
  assert.equal(switchLinkage.decisionKind, "switch-engine");
  assert.ok(switchLinkage.directive.routing !== undefined);
});

// ---------------------------------------------------------------------------
// The §19 treatment linkage lifecycle (reserve → studio composes → cite)
// ---------------------------------------------------------------------------

test("LINKAGE LIFECYCLE: the studio's OWN treatment path composes the successor; the citation links it (v2)", async () => {
  const requestTreatment = await mustEvaluate(
    evaluationRequestOf(packaged, {
      kind: "request-treatment",
      treatment: { kind: "edit", rationale: "tighten the mid-section" },
    }),
  );
  const evaluationId = requestTreatment.evaluation.id;
  const v1Snapshot = structuredClone(requestTreatment.evaluation);
  const openLinkage = v1Snapshot.treatmentLinkage;
  assert.ok(openLinkage !== null);
  const priorPackageThroughAuthority = world.bridgeWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    openLinkage.priorPackageRef.packageId,
    openLinkage.priorPackageRef.version,
  );
  assert.ok(priorPackageThroughAuthority !== undefined);

  // The studio's OWN §19 treatment path (runtime.applyTreatment → the REAL
  // treatment executor → STUDIO-013 successor composition).
  const successor = await applyStudioTreatmentThroughRuntime(world.bridgeWorld, packaged);
  assert.equal(successor.packageId, packaged.packageRef.packageId);
  assert.equal(successor.version, packaged.packageRef.version + 1);

  const linked = await world.evaluator.recordTreatmentSuccessor(
    BRIDGE_SCOPE,
    BRIDGE_ACTOR,
    evaluationId,
    successor,
  );
  assert.ok(linked.ok, `successor citation failed: ${linked.ok ? "" : linked.failure.reason}`);
  if (linked.ok) {
    const v2 = linked.value.evaluation;
    assert.equal(v2.version, 2);
    assert.equal(v2.priorVersion, 1);
    assert.equal(v2.status, "treatment-linked");
    assert.equal(v2.decision.kind, "request-treatment");
    const linkage = v2.treatmentLinkage;
    assert.ok(linkage !== null && linkage.phase === "linked");
    if (linkage.phase === "linked") {
      assert.equal(linkage.successorKind, "treatment-successor");
      assert.equal(String(linkage.successorPackageRef.packageId), successor.packageId);
      assert.equal(linkage.successorPackageRef.version, successor.version);
      assert.equal(String(linkage.linkedBy), String(BRIDGE_ACTOR));
    }
    // The verdict + citations stay VERBATIM between v1 and v2.
    assert.deepEqual(v2.decision, v1Snapshot.decision);
    assert.deepEqual(v2.entryCitation, v1Snapshot.entryCitation);
    assert.deepEqual(v2.expectations, v1Snapshot.expectations);
  }

  // The v1 record stays resolvable and BIT-FOR-BIT unchanged.
  const rereadV1 = world.evaluator.getEvaluation(BRIDGE_SCOPE, evaluationId, 1);
  assert.deepEqual(rereadV1, v1Snapshot);

  // The linkage chain audits old → new with the decision as the link reason.
  const chain = world.evaluator.evaluationStore.listEvaluationVersions(BRIDGE_SCOPE, evaluationId);
  assert.deepEqual(chain.map((record) => record.version), [1, 2]);
  assert.equal(chain[0]?.decision.kind, "request-treatment");
  assert.equal(chain[1]?.treatmentLinkage?.phase, "linked");

  // The prior package version stays resolvable through STUDIO-013 (immutable).
  const priorStillResolvable = world.bridgeWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    packaged.packageRef.packageId as never,
    packaged.packageRef.version,
  );
  assert.ok(priorStillResolvable !== undefined);
  assert.deepEqual(priorStillResolvable, priorPackageThroughAuthority);
});

test("LINKAGE SINGLE-COMPLETION: a second successor citation fails closed, nothing appended", async () => {
  const decision = await mustEvaluate(
    evaluationRequestOf(packaged, { kind: "request-treatment", treatment: { kind: "re-render", rationale: "r" } }),
  );
  const successor = await applyStudioTreatmentThroughRuntime(world.bridgeWorld, packaged);
  const first = await world.evaluator.recordTreatmentSuccessor(BRIDGE_SCOPE, BRIDGE_ACTOR, decision.evaluation.id, successor);
  assert.ok(first.ok);
  const second = await world.evaluator.recordTreatmentSuccessor(BRIDGE_SCOPE, BRIDGE_ACTOR, decision.evaluation.id, successor);
  assert.ok(!second.ok);
  assert.equal(second.failure.kind, "linkage-already-completed");
  assert.equal(world.evaluator.getEvaluation(BRIDGE_SCOPE, decision.evaluation.id)?.version, 2);
});

test("LINKAGE NOT OPEN: a non-treatment decision accepts no successor citation", async () => {
  const accepted = await mustEvaluate(acceptRequest());
  const result = await world.evaluator.recordTreatmentSuccessor(
    BRIDGE_SCOPE,
    BRIDGE_ACTOR,
    accepted.evaluation.id,
    { packageId: packaged.packageRef.packageId, version: packaged.packageRef.version + 1 },
  );
  assert.ok(!result.ok);
  assert.equal(result.failure.kind, "linkage-not-open");
});

test("LINKAGE FAILURE LADDER: unknown evaluation / unknown successor / not-linked successor record NOTHING new", async () => {
  const unknown = await world.evaluator.recordTreatmentSuccessor(BRIDGE_SCOPE, BRIDGE_ACTOR, "sev_ghost", {
    packageId: packaged.packageRef.packageId,
    version: 1,
  });
  assert.ok(!unknown.ok);
  assert.equal(unknown.failure.kind, "evaluation-unresolved");

  const decision = await mustEvaluate(
    evaluationRequestOf(packaged, { kind: "request-treatment", treatment: { kind: "edit", rationale: "r" } }),
  );
  const unresolved = await world.evaluator.recordTreatmentSuccessor(BRIDGE_SCOPE, BRIDGE_ACTOR, decision.evaluation.id, {
    packageId: "pkg_never_composed",
    version: 1,
  });
  assert.ok(!unresolved.ok);
  assert.equal(unresolved.failure.kind, "successor-package-unresolved");

  const notNewer = await world.evaluator.recordTreatmentSuccessor(BRIDGE_SCOPE, BRIDGE_ACTOR, decision.evaluation.id, {
    packageId: packaged.packageRef.packageId,
    version: packaged.packageRef.version,
  });
  assert.ok(!notNewer.ok);
  assert.equal(notNewer.failure.kind, "successor-not-linked");
  assert.match(notNewer.failure.reason, /not a LATER immutable version/);

  const callerShape = await world.evaluator.recordTreatmentSuccessor(BRIDGE_SCOPE, BRIDGE_ACTOR, decision.evaluation.id, {
    packageId: " ",
    version: 1,
  });
  assert.ok(!callerShape.ok);
  assert.equal(callerShape.failure.kind, "invalid-successor-request");

  // The evaluation chain is still at v1 — NOTHING appended by any failure.
  assert.equal(world.evaluator.getEvaluation(BRIDGE_SCOPE, decision.evaluation.id)?.version, 1);
});

test("SWITCH LINKAGE: a switch-engine decision completes over a re-produced output (different package id)", async () => {
  const switched = await mustEvaluate(
    evaluationRequestOf(packaged, { kind: "switch-engine", routing: labRoutingOf(packaged) }),
  );
  // The Lab re-searched + re-produced: a NEW entry + package through the
  // studio's own path (the REAL re-production flow).
  const reproduced = await world.enterAndPackage();
  assert.notEqual(reproduced.packageRef.packageId, packaged.packageRef.packageId);
  const linked = await world.evaluator.recordTreatmentSuccessor(
    BRIDGE_SCOPE,
    BRIDGE_ACTOR,
    switched.evaluation.id,
    { ...reproduced.packageRef },
  );
  assert.ok(linked.ok, `re-produced citation failed: ${linked.ok ? "" : linked.failure.reason}`);
  if (linked.ok) {
    const linkage = linked.value.evaluation.treatmentLinkage;
    assert.ok(linkage !== null && linkage.phase === "linked");
    if (linkage.phase === "linked") {
      assert.equal(linkage.successorKind, "re-produced-output");
      assert.equal(String(linkage.successorPackageRef.packageId), reproduced.packageRef.packageId);
    }
  }
});

// ---------------------------------------------------------------------------
// The gate ladder (a denial at any stage = ZERO store mutation)
// ---------------------------------------------------------------------------

test("GATE: package-unresolved (unknown id / wrong version / cross-tenant) records NOTHING", async () => {
  const before = world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const unknownId = await world.evaluator.evaluateStudioOutput(
    acceptRequest({ evaluatedPackage: { packageId: "pkg_unknown", version: 1 } }),
  );
  assert.ok(!unknownId.ok);
  assert.equal(unknownId.error.kind, "package-unresolved");
  const wrongVersion = await world.evaluator.evaluateStudioOutput(
    acceptRequest({ evaluatedPackage: { packageId: packaged.packageRef.packageId, version: 99 } }),
  );
  assert.ok(!wrongVersion.ok);
  assert.equal(wrongVersion.error.kind, "package-unresolved");
  const crossTenant = await world.evaluator.evaluateStudioOutput(
    acceptRequest({ scope: { tenantId: "tenant-other" } as TenantScope }),
  );
  assert.ok(!crossTenant.ok);
  assert.equal(crossTenant.error.kind, "package-unresolved");
  assert.equal(world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});

test("GATE: entry-unresolved (unknown entry / cross-tenant) records NOTHING", async () => {
  const before = world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const unknown = await world.evaluator.evaluateStudioOutput(acceptRequest({ entryId: "lts_unknown" }));
  assert.ok(!unknown.ok);
  assert.equal(unknown.error.kind, "entry-unresolved");
  assert.match(unknown.error.reason, /cross-tenant ≡ unknown/);
  const wrongVersion = await world.evaluator.evaluateStudioOutput(acceptRequest({ entryVersion: 99 }));
  assert.ok(!wrongVersion.ok);
  assert.equal(wrongVersion.error.kind, "entry-unresolved");
  assert.equal(world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});

test("GATE: entry-not-packaged — an ENTERED-only entry (v1) has no evaluable output", async () => {
  // The direct probe: cite the PACKAGED entry's own v1 (status "entered").
  const v1Entered = world.bridgeWorld.bridge.getEntry(BRIDGE_SCOPE, packaged.entry.id, 1);
  assert.ok(v1Entered !== undefined);
  assert.equal(v1Entered.status, "entered");
  const result = await world.evaluator.evaluateStudioOutput(acceptRequest({ entryVersion: 1 }));
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "entry-not-packaged");
  assert.match(result.error.reason, /§24 gate denials are not §19 verdicts/);
});

test("GATE: entry-not-packaged — a BRIDGE-001 policy-denied entry can NEVER be evaluated (distinct classes)", async () => {
  // Compose a denied world (the BRIDGE-001 pattern: a scripted denial).
  const { composeBridgeWorld, bridgeEntryRequestOf, runBridgeSearch, firstStudioCandidateOf } =
    await import("../../testing/bridge-fixtures.js");
  const deniedWorld = composeBridgeWorld({
    policyScript: [
      { ...BRIDGE_PERMITTED_VERDICT, decision: "denied", outcome: "denied", denialReason: "policy denies this production" },
    ],
  });
  deniedWorld.grantFixtureSourceRights();
  const result = await runBridgeSearch();
  const candidate = firstStudioCandidateOf(result);
  const denied = await deniedWorld.bridge.enterProduction(bridgeEntryRequestOf(result, candidate));
  assert.ok(!denied.ok);
  if (denied.ok) {
    return;
  }
  assert.equal(denied.error.kind, "policy-gate-denied");
  const denialEntry: LabToStudioProductionEntry = denied.error.entry;

  // REAL-surface probe: the denied production composed NO package — the
  // honest ladder rung is package-unresolved (gate 1), and NOTHING records.
  const realSurfaces = createStudioOutputEvaluator({
    bridge: deniedWorld.bridge,
    packaging: deniedWorld.packaging,
    sessionDirectory: deniedWorld.sessionDirectory,
    clock: deniedWorld.clock,
  });
  const realAttempt = await realSurfaces.evaluateStudioOutput({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    entryId: denialEntry.id,
    evaluatedPackage: { packageId: "pkg_any", version: 1 },
    decision: { kind: "reject-quality", failedCriteria: ["floor"], rationale: "smuggle attempt" },
  });
  assert.ok(!realAttempt.ok);
  assert.equal(realAttempt.error.kind, "package-unresolved");
  assert.deepEqual(realSurfaces.listLatestEvaluations(BRIDGE_SCOPE), []);

  // Entry-gate probe (read doubles isolating the gate): even with a
  // resolvable package cited, the DENIED chain has no evaluable output —
  // and the denial record STAYS a §24 denial, never a §19 verdict.
  const resolvedPrior = world.bridgeWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    packaged.packageRef.packageId as never,
    packaged.packageRef.version,
  );
  assert.ok(resolvedPrior !== undefined);
  const entryGate = createStudioOutputEvaluator({
    bridge: createInMemoryBridgeReads([{ tenantId: String(BRIDGE_TENANT), entry: denialEntry }]),
    packaging: createInMemoryPackagingReads({
      packages: [{ tenantId: String(BRIDGE_TENANT), package: resolvedPrior }],
    }),
    sessionDirectory: createInMemorySessionDirectoryReads(),
    clock: deniedWorld.clock,
  });
  const attempt = await entryGate.evaluateStudioOutput({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    entryId: denialEntry.id,
    evaluatedPackage: { packageId: packaged.packageRef.packageId, version: packaged.packageRef.version },
    decision: { kind: "reject-quality", failedCriteria: ["floor"], rationale: "smuggle attempt" },
  });
  assert.ok(!attempt.ok);
  assert.equal(attempt.error.kind, "entry-not-packaged");
  // The denial record STAYS a denial — never converted into any §19 verdict.
  const reread = deniedWorld.bridge.getEntry(BRIDGE_SCOPE, denialEntry.id);
  assert.equal(reread?.status, "denied");
  assert.equal(reread?.denial?.stage, "policy-gate");
  assert.deepEqual(entryGate.listLatestEvaluations(BRIDGE_SCOPE), []);
});

test("GATE: package-citation-mismatch — citing a REAL package that is not the entry's own records NOTHING", async () => {
  const other = await world.enterAndPackage();
  const before = world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const result = await world.evaluator.evaluateStudioOutput(
    evaluationRequestOf(packaged, { kind: "accept", summary: "s" }, {
      evaluatedPackage: { ...other.packageRef },
    }),
  );
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "package-citation-mismatch");
  assert.match(result.error.reason, /citation chain must close/);
  assert.equal(world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});

test("GATE: expectations-unavailable — a packaged entry with a NULL expectations surface fails closed", async () => {
  // The hostile probe: a packaged entry whose expectations surface is absent
  // (the REAL bridge always carries it after intake — this double proves the
  // gate exists and fails closed, recording nothing).
  const hostileEntry: LabToStudioProductionEntry = structuredClone({
    ...packaged.entry,
    expectations: null,
  });
  const resolvedPrior = world.bridgeWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    packaged.packageRef.packageId as never,
    packaged.packageRef.version,
  );
  assert.ok(resolvedPrior !== undefined);
  const evaluator = createStudioOutputEvaluator({
    bridge: createInMemoryBridgeReads([{ tenantId: String(BRIDGE_TENANT), entry: hostileEntry }]),
    packaging: createInMemoryPackagingReads({
      packages: [{ tenantId: String(BRIDGE_TENANT), package: resolvedPrior }],
    }),
    sessionDirectory: createInMemorySessionDirectoryReads(),
    clock: () => "2026-06-02T00:00:00.000Z" as never,
  });
  const result = await evaluator.evaluateStudioOutput(acceptRequest());
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "expectations-unavailable");
  assert.deepEqual(evaluator.listLatestEvaluations(BRIDGE_SCOPE), []);
});

test("GATE: session-summary-unresolved — a session the directory does not know fails closed", async () => {
  const evaluator = createStudioOutputEvaluator({
    bridge: world.bridgeWorld.bridge,
    packaging: world.bridgeWorld.packaging,
    sessionDirectory: createInMemorySessionDirectoryReads(),
    clock: world.bridgeWorld.clock,
  });
  const result = await evaluator.evaluateStudioOutput(acceptRequest());
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "session-summary-unresolved");
  assert.deepEqual(evaluator.listLatestEvaluations(BRIDGE_SCOPE), []);
});

test("GATE: routing-mission-mismatch — a switch verdict citing a foreign mission fails closed", async () => {
  const before = world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const result = await world.evaluator.evaluateStudioOutput(
    evaluationRequestOf(packaged, {
      kind: "switch-organization",
      routing: { rationale: "r", missionRef: "mission:foreign", searchResultId: "search:any" },
    }),
  );
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "routing-mission-mismatch");
  assert.match(result.error.reason, /SAME mission's Lab surface/);
  assert.equal(world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});

test("GATE: alternate-package-unresolved — an unresolvable alternate fails closed", async () => {
  const result = await world.evaluator.evaluateStudioOutput(
    evaluationRequestOf(packaged, {
      kind: "accept-alternate-output",
      alternate: { packageId: "pkg_ghost", version: 1 },
    }),
  );
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "alternate-package-unresolved");
});

test("GATE: the caller-shape ladder records NOTHING (invalid frame / vocabulary)", async () => {
  const before = world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const badFrame = await world.evaluator.evaluateStudioOutput(
    acceptRequest({ actor: " " as never }),
  );
  assert.ok(!badFrame.ok);
  assert.equal(badFrame.error.kind, "invalid-evaluation-request");
  const smuggled = await world.evaluator.evaluateStudioOutput(
    evaluationRequestOf(packaged, { kind: "reject-rights-policy", violations: [] } as never),
  );
  assert.ok(!smuggled.ok);
  assert.equal(smuggled.error.kind, "decision-kind-out-of-vocabulary");
  assert.equal(world.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});

// ---------------------------------------------------------------------------
// DECISIONS DRIVE THE CHAIN, NEVER EXECUTE IT (§24)
// ---------------------------------------------------------------------------

test("STRUCTURAL: the §19 authority's own methods never invoke the studio runtime (spy + negative control)", async () => {
  // NEGATIVE CONTROL: a chain-EXECUTING act (BRIDGE-001 enterProduction
  // through the bridge-held runtime) DOES count on the spy — proving the spy
  // is live over the only runtime reference among the evaluator's transitive
  // dependencies.
  const controlCalls: Record<string, number> = {};
  const controlWorld = await composeEvaluationWorld({
    wrapRuntime: (runtime) =>
      countingRuntimeOf(runtime, (counted) => {
        for (const key of Object.keys(counted)) {
          controlCalls[key] = counted[key] as number;
        }
      }),
  });
  const controlEntry = await controlWorld.bridgeWorld.bridge.enterProduction(
    (await import("../../testing/bridge-fixtures.js")).bridgeEntryRequestOf(
      controlWorld.searchResult,
      controlWorld.candidate,
    ),
  );
  assert.ok(controlEntry.ok);
  assert.ok((controlCalls.createSession ?? 0) >= 1, "the spy is live (enterProduction invokes the runtime)");
  assert.ok((controlCalls.loadOrganization ?? 0) >= 1);

  // THE PIN: with the same spy wiring, §19 acts (decisions, denials, the
  // successor citation) add ZERO runtime invocations.
  const calls: Record<string, number> = {};
  const spyWorld = await composeEvaluationWorld({
    wrapRuntime: (runtime) =>
      countingRuntimeOf(runtime, (counted) => {
        for (const key of Object.keys(counted)) {
          calls[key] = counted[key] as number;
        }
      }),
  });
  const spyPackaged = await spyWorld.enterAndPackage();
  // The bridge's own entry act (createSession + loadOrganization through the
  // spy-wrapped runtime) is the baseline — every studio-side drive act after
  // it (join/capture/process/review) runs on world.runtime, invisible here.
  const afterDrive = { ...calls };
  assert.ok((afterDrive.createSession ?? 0) >= 1);

  const accepted = await spyWorld.evaluator.evaluateStudioOutput(
    evaluationRequestOf(spyPackaged, { kind: "accept", summary: "s" }),
  );
  assert.ok(accepted.ok);
  const denied = await spyWorld.evaluator.evaluateStudioOutput(
    evaluationRequestOf(spyPackaged, { kind: "accept", summary: "s" }, { entryId: "lts_unknown" }),
  );
  assert.ok(!denied.ok);
  const treatment = await spyWorld.evaluator.evaluateStudioOutput(
    evaluationRequestOf(spyPackaged, { kind: "request-treatment", treatment: { kind: "edit", rationale: "r" } }),
  );
  assert.ok(treatment.ok);
  assert.deepEqual(calls, afterDrive, "evaluateStudioOutput must never invoke the studio runtime (decisions drive the chain, never execute it)");

  // The studio's OWN treatment path composes the successor through STUDIO-013
  // (a studio-side act, driven here by the test standing in for the §13
  // loop's production orchestration); the successor CITATION is runtime-free.
  const successor = await applyStudioTreatmentThroughRuntime(spyWorld.bridgeWorld, spyPackaged);
  const linked = await spyWorld.evaluator.recordTreatmentSuccessor(
    BRIDGE_SCOPE,
    BRIDGE_ACTOR,
    treatment.value.evaluation.id,
    successor,
  );
  assert.ok(linked.ok);
  assert.deepEqual(calls, afterDrive, "recordTreatmentSuccessor must never invoke the studio runtime");
});

test("STRUCTURAL: the evaluation port surface is exactly the four methods + store inspection", async () => {
  const methodNames = Object.keys(world.evaluator).filter(
    (key) => typeof (world.evaluator as unknown as Record<string, unknown>)[key] === "function",
  );
  assert.deepEqual([...methodNames].sort(), [
    "evaluateStudioOutput",
    "getEvaluation",
    "listLatestEvaluations",
    "recordTreatmentSuccessor",
  ]);
  // The evaluator's deps carry NO runtime/engine/organization/provider seam.
  const depKeys = Object.keys(world.evaluatorDeps).sort();
  assert.deepEqual(depKeys, ["bridge", "clock", "nextEvaluationId", "packaging", "sessionDirectory"]);
});

// ---------------------------------------------------------------------------
// ABANDON is first-class (§18)
// ---------------------------------------------------------------------------

test("ABANDON: a recorded terminal verdict with its justifying analysis snapshot — never a deletion", async () => {
  const abandoned = await mustEvaluate(
    evaluationRequestOf(
      packaged,
      {
        kind: "abandon",
        justification: "delay cost dominates the expected incremental value",
        analysis: ABANDONMENT_ANALYSIS,
      },
      { notes: "route the learning to the benchmark surface" },
    ),
  );
  const record = abandoned.evaluation;
  assert.equal(record.decision.kind, "abandon");
  assert.equal(record.notes, "route the learning to the benchmark surface");
  const analysis = record.decision.kind === "abandon" ? record.decision.analysis : undefined;
  assert.ok(analysis !== undefined);
  assert.equal(analysis.analysisRef.analysisId, "delay-analysis:bridge-002");
  assert.equal(analysis.analysisRef.analysisVersion, 1);
  assert.ok(analysis.delayEconomics !== undefined);

  // NEVER a deletion: the entry chain, the package and the session all stay
  // resolvable through their own authorities.
  assert.ok(world.bridgeWorld.bridge.getEntry(BRIDGE_SCOPE, packaged.entry.id) !== undefined);
  assert.ok(
    world.bridgeWorld.packaging.getArtifactPackage(
      BRIDGE_SCOPE,
      packaged.packageRef.packageId as never,
      packaged.packageRef.version,
    ) !== undefined,
  );
  assert.ok(
    world.bridgeWorld.sessionDirectory.getSessionSummary(BRIDGE_SCOPE, packaged.sessionId) !== undefined,
  );
  // The abandoned path feeds learning BY REFERENCE (the analysis citation
  // stays auditable on the immutable record).
  assert.ok(world.evaluator.getEvaluation(BRIDGE_SCOPE, record.id, 1) !== undefined);
});

// ---------------------------------------------------------------------------
// Tenant isolation + caller-aliasing probes
// ---------------------------------------------------------------------------

test("TENANT: cross-tenant reads see NOTHING (no existence leak)", async () => {
  const value = await mustEvaluate(acceptRequest());
  const foreign = { tenantId: "tenant-evaluator-other" } as TenantScope;
  assert.equal(world.evaluator.getEvaluation(foreign, value.evaluation.id), undefined);
  assert.equal(world.evaluator.getEvaluation(foreign, value.evaluation.id, 1), undefined);
  assert.deepEqual(world.evaluator.listLatestEvaluations(foreign), []);
});

test("ALIASING: mutating the caller's scope/decision after the call moves nothing (D3/D4)", async () => {
  const scope = { tenantId: String(BRIDGE_TENANT) } as { tenantId: string };
  const decision = { kind: "accept" as const, summary: "within interval" };
  const request = evaluationRequestOf(packaged, decision, { scope: scope as never });
  const value = await mustEvaluate(request);
  scope.tenantId = "tenant-forged";
  (decision as { summary: string }).summary = "forged-after-the-call";
  const reread = world.evaluator.getEvaluation(BRIDGE_SCOPE, value.evaluation.id);
  assert.equal(String(reread?.scope.tenantId), String(BRIDGE_TENANT));
  assert.equal(reread?.decision.kind, "accept");
  assert.equal(reread?.decision.kind === "accept" ? reread.decision.summary : "", "within interval");
  assert.equal(world.evaluator.getEvaluation({ tenantId: "tenant-forged" } as never, value.evaluation.id), undefined);
});

// ---------------------------------------------------------------------------
// The counting runtime spy (shared discipline with BRIDGE-001)
// ---------------------------------------------------------------------------

/** A runtime wrapper counting every method invocation, by name. */
function countingRuntimeOf(
  runtime: StudioRuntime,
  onCalls?: (calls: Record<string, number>) => void,
): StudioRuntime {
  const calls: Record<string, number> = {};
  const proxy = new Proxy(Object.create(runtime), {
    get(_target: unknown, property: string | symbol, receiver: unknown): unknown {
      if (property === "calls") {
        return calls;
      }
      const value = Reflect.get(runtime as object, property, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]): unknown => {
          const name = String(property);
          calls[name] = (calls[name] ?? 0) + 1;
          onCalls?.(calls);
          return (value as (...fnArgs: unknown[]) => unknown).apply(runtime, args);
        };
      }
      return value;
    },
  });
  onCalls?.(calls);
  return proxy as StudioRuntime;
}
