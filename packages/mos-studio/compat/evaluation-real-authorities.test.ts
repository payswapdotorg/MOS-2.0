/**
 * REAL-authority integration test (BRIDGE-002) — the RUNTIME half of the
 * §19 evaluation authority-seam compatibility pins (the compile-time half
 * lives in compat/evaluation-authority-compat.ts).
 *
 * Proves the §19 Studio-output evaluation/treatment authority runs
 * END-TO-END over the REAL authorities behind its read seams:
 *
 * - the REAL `@mos/policy` evaluation authority + the REAL `@mos/missions`
 *   repository behind the BRIDGE-001 gates (the established compat wiring —
 *   an allow rule permits the production entry; a deny-effect rule denies
 *   it, and the denied chain can NEVER be evaluated: §19 distinct classes);
 * - the REAL production program search (LAB-016's own surface);
 * - the REAL studio runtime's OWN review path composes the evaluated package
 *   through the REAL STUDIO-013 canonical packaging authority, and the REAL
 *   STUDIO-014 session directory publishes the session summaries;
 * - the §19 treatment linkage over the studio's OWN treatment path: the REAL
 *   runtime.applyTreatment (the REAL organization treatment executor)
 *   composes the NEW immutable successor package version through STUDIO-013,
 *   and the successor citation links it (prior versions bit-for-bit
 *   immutable in the REAL authority);
 * - the ten-kind §19 vocabulary zero-drift pin at runtime, the
 *   rights/policy-rejection smuggling probe, cross-tenant isolation, and
 *   the gate ladder over the REAL authorities.
 *
 * The REAL sibling packages are imported by relative dist path (the W7-B
 * compat precedent — no runtime dependency of this package is created; the
 * studio's registry dependencies stay exactly
 * contracts/content/production/agents/capabilities/engines/jobs/rights).
 * All fixture data is FICTIONAL (the bridge fixture world — no real tenant,
 * rule, mission or organization is implied).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// REAL sibling authorities (relative dist paths — the same public surfaces
// the bare specifiers resolve to after `tsc -b`).
import {
  createInMemoryPolicyEvaluation,
  createInMemoryPolicyRegistry,
} from "../../mos-policy/dist/index.js";
import type {
  PolicyEvaluationId,
  PolicyEvaluationPort,
  PolicyRuleId,
  RegisterPolicyRuleInput,
} from "../../mos-policy/dist/index.js";
import { createInMemoryMissionRepository } from "../../mos-missions/dist/index.js";
import type { MissionRepository } from "../../mos-missions/dist/index.js";
import type { IdentityId } from "@mos/identity";
import type { RankedCandidateProgram, ProductionProgramSearchResult } from "@mos/production";

// THIS package's public surface (built).
import {
  createLabToStudioBridge,
  createRealBridgeMissionPort,
  createRealProductionEntryPolicyGate,
  createStudioOutputEvaluator,
  STUDIO_EVALUATION_DECISION_KINDS,
} from "../dist/index.js";
import type {
  StudioOutputEvaluatorPort,
  StudioOutputEvaluationRequest,
  StudioRuntime,
  StudioArtifactPackagingPort,
  StudioSessionDirectory,
  LabToStudioBridgePort,
} from "../dist/index.js";

// The disclosed fixture worlds (built): the bridge fixture world (the REAL
// search + REAL studio runtime + REAL rights) and the evaluation fixtures
// (drive-to-packaged + the studio's own treatment path).
import {
  BRIDGE_ACTOR,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
  bridgeEntryRequestOf,
  composeBridgeWorld,
  mustEnter,
  runBridgeSearch,
  firstStudioCandidateOf,
} from "../dist/testing/bridge-fixtures.js";
import type { ComposedBridgeWorld } from "../dist/testing/bridge-fixtures.js";
import {
  ABANDONMENT_ANALYSIS,
  applyStudioTreatmentThroughRuntime,
  driveEntryToPackaged,
  labRoutingOf,
} from "../dist/testing/evaluation-fixtures.js";
import type { PackagedBridgeEntry } from "../dist/testing/evaluation-fixtures.js";
import type { TenantScope } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Deterministic REAL-authority fixtures (the BRIDGE-001 compat pattern)
// ---------------------------------------------------------------------------

const NOW = (): string => "2026-06-01T00:00:00.000Z";

/** Deterministic evaluation-id factory (the authority's §30 record ids). */
const sequencedEvaluationIds = (): (() => PolicyEvaluationId) => {
  let counter = 0;
  return () => `policy-evaluation:evaluation-compat-${++counter}` as PolicyEvaluationId;
};

/** One REAL policy rule registration over the bridge fixture world. */
function ruleInput(input: {
  readonly id: string;
  readonly effect: RegisterPolicyRuleInput["effect"];
}): RegisterPolicyRuleInput {
  return {
    id: input.id as PolicyRuleId,
    scope: BRIDGE_SCOPE,
    declaredScope: {
      actionKinds: ["production-request-approval"],
      subjectRefs: [],
      actorRefs: [],
    },
    constraints: [],
    effect: input.effect,
    approverRole: undefined,
    rationale: `evaluation compat fixture rule ${input.id}`,
    createdByAuthority: "evaluation-compat-test",
    createdBy: "identity-bridge-operator-1" as IdentityId,
  };
}

/** Compose the REAL policy authority (registry + evaluation + one rule). */
function composeRealPolicyAuthority(effect: "allow" | "deny"): PolicyEvaluationPort {
  const registry = createInMemoryPolicyRegistry({ now: NOW });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: NOW,
    nextId: sequencedEvaluationIds(),
  });
  const registered = registry.register(ruleInput({ id: "policy:bridge-fixture-production", effect }));
  if ("error" in registered && registered.error !== undefined) {
    throw new Error(`REAL policy registry rejected the fixture rule: ${JSON.stringify(registered)}`);
  }
  return evaluation;
}

/** Seed + activate one REAL mission; returns its ACTIVE record version. */
function seedRealActiveMission(repository: MissionRepository): number {
  const created = repository.createMission({
    scope: BRIDGE_SCOPE,
    id: "mission:bridge-fixture-growth" as never,
    objective: {
      statement: "Grow qualified reach through reaction-video experiments",
      targetMetrics: [
        { metric: "qualified-reach" as never, target: "10000", unit: "count", horizon: null },
      ],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: "qualified-reach" as never,
          weight: 1,
          direction: "maximize",
          definition: "verified unique accounts reached with attribution intact",
        },
      ],
    },
    strategyRefs: ["strategy:bridge-reaction-loops" as never],
  });
  if ("error" in created) {
    throw new Error(`REAL mission repository rejected the fixture mission: ${created.message}`);
  }
  const activated = repository.activateMission(BRIDGE_SCOPE, "mission:bridge-fixture-growth" as never);
  if ("error" in activated) {
    throw new Error(`REAL mission repository rejected the activation: ${activated.message}`);
  }
  return activated.version;
}

// ---------------------------------------------------------------------------
// The composed REAL-authority evaluation world
// ---------------------------------------------------------------------------

/** The REAL-authority §19 evaluation world (composed by the setup test). */
interface RealEvaluationWorld {
  readonly bridge: LabToStudioBridgePort;
  readonly bridgeWorld: ComposedBridgeWorld;
  readonly missionVersion: number;
  readonly searchResult: ProductionProgramSearchResult;
  readonly candidate: RankedCandidateProgram;
  readonly runtime: StudioRuntime;
  readonly packaging: StudioArtifactPackagingPort;
  readonly sessionDirectory: StudioSessionDirectory;
  readonly evaluator: StudioOutputEvaluatorPort;
  readonly enterAndPackage: () => Promise<PackagedBridgeEntry>;
}

let realWorld: RealEvaluationWorld;

test("EVALUATION compat setup: the REAL authorities + REAL studio stack compose end-to-end", async () => {
  const policy = composeRealPolicyAuthority("allow");
  const missionRepository = createInMemoryMissionRepository({ now: NOW });
  const missionVersion = seedRealActiveMission(missionRepository);

  const searchResult = await runBridgeSearch();
  const candidate = firstStudioCandidateOf(searchResult);

  const bridgeWorld = composeBridgeWorld({});
  bridgeWorld.grantFixtureSourceRights();
  const bridge = createLabToStudioBridge({
    runtime: bridgeWorld.runtime,
    mission: createRealBridgeMissionPort({ source: missionRepository }),
    policyGate: createRealProductionEntryPolicyGate({ evaluation: policy }),
    rightsGate: bridgeWorld.realRightsGate,
    sessionDirectory: bridgeWorld.sessionDirectory,
    packaging: bridgeWorld.packaging,
    clock: bridgeWorld.clock,
  });

  const evaluator = createStudioOutputEvaluator({
    bridge,
    packaging: bridgeWorld.packaging,
    sessionDirectory: bridgeWorld.sessionDirectory,
    clock: bridgeWorld.clock,
    nextEvaluationId: (() => {
      let counter = 0;
      return () => `sev_compat_${String(++counter).padStart(3, "0")}`;
    })(),
  });

  const enterAndPackage = async (): Promise<PackagedBridgeEntry> => {
    const value = await mustEnter(bridge, bridgeEntryRequestOf(searchResult, candidate, { missionVersion }));
    const sessionId = (value.session as { readonly id: Parameters<StudioSessionDirectory["getSessionSummary"]>[1] }).id;
    const packaged = await driveEntryToPackaged(bridgeWorld, sessionId);
    const recorded = await bridge.recordStudioPackage(BRIDGE_SCOPE, value.entry.id);
    if (!recorded.ok) {
      throw new Error(`recordStudioPackage failed: ${recorded.failure.kind} — ${recorded.failure.reason}`);
    }
    return {
      entry: recorded.value.entry,
      sessionId,
      packageRef: { packageId: packaged.packageId, version: packaged.packageVersion },
    };
  };

  realWorld = {
    bridge,
    bridgeWorld,
    missionVersion,
    searchResult,
    candidate,
    runtime: bridgeWorld.runtime,
    packaging: bridgeWorld.packaging,
    sessionDirectory: bridgeWorld.sessionDirectory,
    evaluator,
    enterAndPackage,
  };
});

/** The honest §19 evaluation request over a packaged entry. */
function evaluationRequest(
  packaged: PackagedBridgeEntry,
  decision: StudioOutputEvaluationRequest["decision"],
  overrides: Partial<StudioOutputEvaluationRequest> = {},
): StudioOutputEvaluationRequest {
  return {
    scope: { tenantId: BRIDGE_TENANT },
    actor: BRIDGE_ACTOR,
    entryId: packaged.entry.id,
    evaluatedPackage: { ...packaged.packageRef },
    decision,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The zero-drift vocabulary pin (runtime)
// ---------------------------------------------------------------------------

test("ZERO-DRIFT: the ten §19 decision kinds are exactly the spec's ten verbs at runtime", () => {
  assert.deepEqual([...STUDIO_EVALUATION_DECISION_KINDS], [
    "accept",
    "reject-quality",
    "reject-strategy",
    "request-treatment",
    "require-human-action",
    "switch-organization",
    "switch-transform",
    "switch-engine",
    "accept-alternate-output",
    "abandon",
  ]);
});

// ---------------------------------------------------------------------------
// The §19 verdicts over the REAL authorities
// ---------------------------------------------------------------------------

test("REAL ACCEPT: the decision cites the REAL STUDIO-013 package, the REAL entry chain and the counterfactual expectations", async () => {
  const packaged = await realWorld.enterAndPackage();
  const outcome = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, { kind: "accept", summary: "within the declared interval" }),
  );
  assert.ok(outcome.ok, `accept failed: ${outcome.ok ? "" : `${outcome.error.kind} — ${outcome.error.reason}`}`);
  if (!outcome.ok) {
    return;
  }
  const record = outcome.value.evaluation;

  // The evaluated package resolves through the REAL STUDIO-013 authority.
  const resolved = realWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    record.evaluatedPackage.packageId,
    record.evaluatedPackage.version,
  );
  assert.ok(resolved !== undefined);
  assert.equal(String(resolved.sessionRef), String(record.evaluatedPackage.sessionRef));

  // The entry citation closes through the REAL BRIDGE-001 chain (the mission
  // linkage is the REAL repository's own activated record).
  assert.equal(record.entryCitation.mission.missionVersion, realWorld.missionVersion);
  assert.equal(record.entryCitation.mission.missionStatus, "active");

  // The expectations ride verbatim, counterfactual-labeled (lock rule 29).
  assert.equal(record.expectations.counterfactual, true);
  assert.deepEqual(record.expectations, packaged.entry.expectations);

  // The §30 observability trail echoes the REAL session directory.
  const summary = realWorld.sessionDirectory.getSessionSummary(BRIDGE_SCOPE, record.evaluatedPackage.sessionRef);
  assert.ok(summary !== undefined);
  assert.equal(record.observability.sessionLifecycleState, summary.lifecycleState);
});

test("REAL REJECT-QUALITY: the §19 quality verdict records with failed criteria (distinct from rights/policy)", async () => {
  const packaged = await realWorld.enterAndPackage();
  const outcome = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, {
      kind: "reject-quality",
      failedCriteria: ["hook-retention-floor", "attribution-intact"],
      rationale: "the cold open falls under the declared quality floor",
    }),
  );
  assert.ok(outcome.ok);
  if (outcome.ok) {
    assert.equal(outcome.value.evaluation.decision.kind, "reject-quality");
    if (outcome.value.evaluation.decision.kind === "reject-quality") {
      assert.deepEqual(outcome.value.evaluation.decision.failedCriteria, [
        "hook-retention-floor",
        "attribution-intact",
      ]);
    }
  }
});

test("REAL TREATMENT LINKAGE: the studio's OWN path composes the successor through STUDIO-013; the citation links it", async () => {
  const packaged = await realWorld.enterAndPackage();
  const decision = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, {
      kind: "request-treatment",
      treatment: { kind: "edit", parametersRef: "params:compat-edit", rationale: "tighten the mid-section" },
    }),
  );
  assert.ok(decision.ok);
  if (!decision.ok) {
    return;
  }
  assert.equal(decision.value.evaluation.treatmentLinkage?.phase, "awaiting-successor");

  // The prior version's REAL-authority snapshot (bit-for-bit immutability).
  const priorBefore = structuredClone(
    realWorld.packaging.getArtifactPackage(
      BRIDGE_SCOPE,
      packaged.packageRef.packageId as never,
      packaged.packageRef.version,
    ),
  );

  // The studio's OWN §19 treatment path over the REAL runtime: the REAL
  // organization treatment executor + the REAL STUDIO-013 successor compose.
  const successor = await applyStudioTreatmentThroughRuntime(realWorld.bridgeWorld, packaged);
  assert.equal(successor.version, packaged.packageRef.version + 1);

  const linked = await realWorld.evaluator.recordTreatmentSuccessor(
    BRIDGE_SCOPE,
    BRIDGE_ACTOR,
    decision.value.evaluation.id,
    successor,
  );
  assert.ok(linked.ok, `successor citation failed: ${linked.ok ? "" : linked.failure.reason}`);
  if (linked.ok) {
    const linkage = linked.value.evaluation.treatmentLinkage;
    assert.ok(linkage !== null && linkage.phase === "linked");
    if (linkage.phase === "linked") {
      assert.equal(linkage.successorKind, "treatment-successor");
      assert.equal(linkage.successorPackageRef.version, successor.version);
      assert.equal(String(linkage.linkedBy), String(BRIDGE_ACTOR));
    }
  }

  const priorAfter = realWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    packaged.packageRef.packageId as never,
    packaged.packageRef.version,
  );
  assert.deepEqual(priorAfter, priorBefore, "the prior version never mutates in the REAL authority");

  // The successor version resolves through the REAL authority (append-only).
  const successorResolved = realWorld.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    successor.packageId as never,
    successor.version,
  );
  assert.ok(successorResolved !== undefined);
});

test("REAL ABANDON: a recorded terminal verdict with its justifying analysis snapshot (never a deletion)", async () => {
  const packaged = await realWorld.enterAndPackage();
  const outcome = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, {
      kind: "abandon",
      justification: "delay cost dominates the expected incremental value",
      analysis: ABANDONMENT_ANALYSIS,
    }),
  );
  assert.ok(outcome.ok);
  if (outcome.ok) {
    assert.equal(outcome.value.evaluation.decision.kind, "abandon");
  }
  // NEVER a deletion: the entry/package/session all stay resolvable through
  // the REAL authorities.
  assert.ok(
    realWorld.packaging.getArtifactPackage(
      BRIDGE_SCOPE,
      packaged.packageRef.packageId as never,
      packaged.packageRef.version,
    ) !== undefined,
  );
  assert.ok(realWorld.sessionDirectory.getSessionSummary(BRIDGE_SCOPE, packaged.sessionId) !== undefined);
});

test("REAL SWITCH-ENGINE: a recorded verdict routing BACK to the Lab search surface BY REFERENCE", async () => {
  const packaged = await realWorld.enterAndPackage();
  const outcome = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, {
      kind: "switch-engine",
      routing: labRoutingOf(packaged),
    }),
  );
  assert.ok(outcome.ok);
  const missionSegment = packaged.entry.mission;
  assert.ok(missionSegment !== null);
  if (outcome.ok) {
    const linkage = outcome.value.evaluation.treatmentLinkage;
    assert.ok(linkage !== null);
    assert.equal(linkage.decisionKind, "switch-engine");
    assert.ok(linkage.directive.routing !== undefined);
    assert.equal(
      String(linkage.directive.routing.missionRef),
      String(missionSegment.missionRef),
    );
  }

  // The re-produced completion: the Lab re-ran the search + production — a
  // NEW entry + package through the REAL chain (a different package id).
  const reproduced = await realWorld.enterAndPackage();
  assert.notEqual(reproduced.packageRef.packageId, packaged.packageRef.packageId);
  const linked = await realWorld.evaluator.recordTreatmentSuccessor(
    BRIDGE_SCOPE,
    BRIDGE_ACTOR,
    outcome.ok ? outcome.value.evaluation.id : "",
    { ...reproduced.packageRef },
  );
  assert.ok(linked.ok, `re-produced citation failed: ${linked.ok ? "" : linked.failure.reason}`);
  if (linked.ok) {
    const linkage = linked.value.evaluation.treatmentLinkage;
    assert.ok(linkage !== null && linkage.phase === "linked");
    if (linkage.phase === "linked") {
      assert.equal(linkage.successorKind, "re-produced-output");
    }
  }
});

test("REAL ACCEPT-ALTERNATE-OUTPUT: the alternate is a REAL studio package resolving through STUDIO-013", async () => {
  const packaged = await realWorld.enterAndPackage();
  const alternate = await realWorld.enterAndPackage();
  const outcome = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, {
      kind: "accept-alternate-output",
      alternate: { ...alternate.packageRef },
    }),
  );
  assert.ok(outcome.ok);
  if (outcome.ok) {
    const decision = outcome.value.evaluation.decision;
    assert.equal(decision.kind, "accept-alternate-output");
    if (decision.kind === "accept-alternate-output") {
      const resolved = realWorld.packaging.getArtifactPackage(
        BRIDGE_SCOPE,
        decision.alternate.packageId as never,
        decision.alternate.version,
      );
      assert.ok(resolved !== undefined, "the alternate resolves through the REAL STUDIO-013 authority");
    }
  }
});

// ---------------------------------------------------------------------------
// §19 distinct classes + the gate ladder over the REAL authorities
// ---------------------------------------------------------------------------

test("REAL SMUGGLING PROBE: reject-rights-policy fails typed and records NOTHING (§19 distinct classes)", async () => {
  const packaged = await realWorld.enterAndPackage();
  const before = realWorld.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const smuggled = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, {
      kind: "reject-rights-policy",
      violations: ["rights:circumvention"],
    } as never),
  );
  assert.ok(!smuggled.ok);
  assert.equal(smuggled.error.kind, "decision-kind-out-of-vocabulary");
  assert.match(smuggled.error.reason, /rights\/policy rejections are NOT evaluation kinds/);
  assert.equal(realWorld.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});

test("REAL DENIED CHAIN: a policy-denied BRIDGE-001 entry has NO evaluable output (distinct classes, end-to-end)", async () => {
  const deniedPolicy = composeRealPolicyAuthority("deny");
  const missionRepository = createInMemoryMissionRepository({ now: NOW });
  const missionVersion = seedRealActiveMission(missionRepository);
  const deniedWorld = composeBridgeWorld({});
  deniedWorld.grantFixtureSourceRights();
  const deniedBridge = createLabToStudioBridge({
    runtime: deniedWorld.runtime,
    mission: createRealBridgeMissionPort({ source: missionRepository }),
    policyGate: createRealProductionEntryPolicyGate({ evaluation: deniedPolicy }),
    rightsGate: deniedWorld.realRightsGate,
    sessionDirectory: deniedWorld.sessionDirectory,
    packaging: deniedWorld.packaging,
    clock: deniedWorld.clock,
  });
  const denied = await deniedBridge.enterProduction(
    bridgeEntryRequestOf(realWorld.searchResult, realWorld.candidate, { missionVersion }),
  );
  assert.ok(!denied.ok);
  if (denied.ok) {
    return;
  }
  assert.equal(denied.error.kind, "policy-gate-denied");

  const evaluator = createStudioOutputEvaluator({
    bridge: deniedBridge,
    packaging: deniedWorld.packaging,
    sessionDirectory: deniedWorld.sessionDirectory,
    clock: deniedWorld.clock,
  });
  const attempt = await evaluator.evaluateStudioOutput({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    entryId: denied.error.entry.id,
    evaluatedPackage: { packageId: "pkg_none", version: 1 },
    decision: { kind: "accept", summary: "smuggle" },
  });
  // The denied production composed NO package — the REAL ladder rung.
  assert.ok(!attempt.ok);
  assert.equal(attempt.error.kind, "package-unresolved");
  assert.deepEqual(evaluator.listLatestEvaluations(BRIDGE_SCOPE), []);
  // The denial record stays a §24 denial — never a §19 verdict.
  assert.equal(deniedBridge.getEntry(BRIDGE_SCOPE, denied.error.entry.id)?.status, "denied");
});

test("REAL GATE LADDER: unknown package version / cross-tenant scope record NOTHING", async () => {
  const packaged = await realWorld.enterAndPackage();
  const before = realWorld.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;

  const wrongVersion = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, { kind: "accept", summary: "s" }, {
      evaluatedPackage: { packageId: packaged.packageRef.packageId, version: 99 },
    }),
  );
  assert.ok(!wrongVersion.ok);
  assert.equal(wrongVersion.error.kind, "package-unresolved");

  const foreignScope: TenantScope = { tenantId: "tenant-compat-other" } as TenantScope;
  const crossTenant = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, { kind: "accept", summary: "s" }, { scope: foreignScope }),
  );
  assert.ok(!crossTenant.ok);
  assert.equal(crossTenant.error.kind, "package-unresolved");

  assert.equal(realWorld.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
  assert.deepEqual(realWorld.evaluator.listLatestEvaluations(foreignScope), []);
});

test("REAL ENTRY VERSION: citing the entry's own v1 (entered) fails entry-not-packaged; nothing records", async () => {
  const packaged = await realWorld.enterAndPackage();
  const before = realWorld.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length;
  const attempt = await realWorld.evaluator.evaluateStudioOutput(
    evaluationRequest(packaged, { kind: "accept", summary: "s" }, { entryVersion: 1 }),
  );
  assert.ok(!attempt.ok);
  assert.equal(attempt.error.kind, "entry-not-packaged");
  assert.equal(realWorld.evaluator.listLatestEvaluations(BRIDGE_SCOPE).length, before);
});
