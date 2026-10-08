/**
 * REAL-authority integration test (BRIDGE-001) — the RUNTIME half of the
 * bridge authority-seam compatibility pins (the compile-time half lives in
 * compat/bridge-authority-compat.ts).
 *
 * Proves the §24 boundary chain's Lab→Mission→Policy/Rights/Assets→
 * Production/Studio segment runs END-TO-END over the REAL authorities
 * behind the bridge's declared ports:
 *
 * - the REAL `@mos/policy` evaluation authority (in-memory registry +
 *   evaluation — POLICY-001) behind `createRealProductionEntryPolicyGate`:
 *   allow → permitted citing the REAL rule + the authority's OWN §30
 *   evaluation record id; deny-effect / budget-ceiling-violated /
 *   approval-required / insufficient-policy all map to fail-closed denials
 *   with the authority's attribution VERBATIM; a thrown authority caller
 *   error (unresolvable exact-version citation) is a fail-closed denial,
 *   never a permission and never an escape into the bridge;
 * - the REAL `@mos/missions` repository behind `createRealBridgeMissionPort`:
 *   EXACT-version resolution of an activated mission; unknown ≡
 *   cross-tenant ≡ wrong-version (§31 — no existence leaks);
 * - the REAL `@mos/rights` authority + the REAL studio runtime (already REAL
 *   in the in-package battery) complete the chain: one REAL search result →
 *   one ENTERED studio-side production entry with every segment carrying
 *   the REAL authorities' own data;
 * - a REAL deny-effect rule denies the entry at the policy gate with ZERO
 *   studio runtime invocations (the invocation-counting spy).
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

// THIS package's public surface (built).
import {
  createLabToStudioBridge,
  createRealBridgeMissionPort,
  createRealProductionEntryPolicyGate,
} from "../dist/index.js";
import type { LabToStudioBridgePort } from "../dist/index.js";
import type { StudioRuntime } from "../dist/index.js";

// The disclosed bridge fixture world (built): the REAL production program
// search over its disclosed seams + the REAL studio runtime composition
// pieces (runtime / REAL rights repository / session directory / packaging
// authority / clock).
import {
  BRIDGE_ACTOR,
  BRIDGE_POLICY_REF,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
  bridgeEntryRequestOf,
  composeBridgeWorld,
  firstStudioCandidateOf,
  runBridgeSearch,
} from "../dist/testing/bridge-fixtures.js";
import type { ComposedBridgeWorld } from "../dist/testing/bridge-fixtures.js";
import type { RankedCandidateProgram } from "@mos/production";

// ---------------------------------------------------------------------------
// Deterministic authority fixtures
// ---------------------------------------------------------------------------

const NOW = (): string => "2026-06-01T00:00:00.000Z";

/** Deterministic evaluation-id factory (the authority's §30 record ids). */
const sequencedEvaluationIds = (): (() => PolicyEvaluationId) => {
  let counter = 0;
  return () => `policy-evaluation:bridge-compat-${++counter}` as PolicyEvaluationId;
};

/** One REAL policy rule registration over the bridge fixture world. */
function ruleInput(input: {
  readonly id: string;
  readonly effect: RegisterPolicyRuleInput["effect"];
  readonly constraints?: RegisterPolicyRuleInput["constraints"];
  readonly approverRole?: string;
}): RegisterPolicyRuleInput {
  return {
    id: input.id as PolicyRuleId,
    scope: BRIDGE_SCOPE,
    declaredScope: {
      actionKinds: ["production-request-approval"],
      subjectRefs: [],
      actorRefs: [],
    },
    constraints: input.constraints ?? [],
    effect: input.effect,
    approverRole: input.approverRole,
    rationale: `bridge compat fixture rule ${input.id}`,
    createdByAuthority: "bridge-compat-test",
    createdBy: "identity-bridge-operator-1" as IdentityId,
  };
}

/** Compose the REAL policy authority (registry + evaluation). */
function composeRealPolicyAuthority(): PolicyEvaluationPort & {
  register(input: RegisterPolicyRuleInput): void;
} {
  const registry = createInMemoryPolicyRegistry({ now: NOW });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: NOW,
    nextId: sequencedEvaluationIds(),
  });
  return {
    ...evaluation,
    register: (input) => {
      const registered = registry.register(input);
      if ("error" in registered && registered.error !== undefined) {
        throw new Error(`REAL policy registry rejected the fixture rule: ${JSON.stringify(registered)}`);
      }
    },
  };
}

/** Seed + activate one REAL mission; returns its ACTIVE record version. */
function seedRealActiveMission(repository: MissionRepository): {
  readonly missionVersion: number;
  readonly rewardSpecVersion: number;
} {
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
  return { missionVersion: activated.version, rewardSpecVersion: activated.rewardSpec.version };
}

// ---------------------------------------------------------------------------
// The composed REAL-authority bridge world
// ---------------------------------------------------------------------------

/** The REAL search result + its first studio candidate (module-scoped). */
let realResult: Awaited<ReturnType<typeof runBridgeSearch>>;
let realCandidate: RankedCandidateProgram;

/** Compose the full REAL-authority bridge over the studio fixture world. */
function composeRealAuthorityBridge(input: {
  readonly policy: PolicyEvaluationPort;
  readonly missionRepository: MissionRepository;
  readonly wrapRuntime?: (runtime: StudioRuntime) => StudioRuntime;
}): {
  readonly bridge: LabToStudioBridgePort & {
    readonly entryStore: import("../dist/bridge/bridge-entry-store.js").LabToStudioEntryStore;
  };
  readonly world: ComposedBridgeWorld;
} {
  const world = composeBridgeWorld({
    wrapRuntime: input.wrapRuntime,
  });
  world.grantFixtureSourceRights();
  const bridge = createLabToStudioBridge({
    runtime: input.wrapRuntime === undefined ? world.runtime : input.wrapRuntime(world.runtime),
    mission: createRealBridgeMissionPort({ source: input.missionRepository }),
    policyGate: createRealProductionEntryPolicyGate({ evaluation: input.policy }),
    rightsGate: world.realRightsGate,
    sessionDirectory: world.sessionDirectory,
    packaging: world.packaging,
    clock: world.clock,
  });
  return { bridge, world };
}

test("BRIDGE compat setup: the REAL search + REAL authorities compose", async () => {
  realResult = await runBridgeSearch();
  realCandidate = firstStudioCandidateOf(realResult);
});

/** The honest entry request citing the fixture rule @ v1. */
function honestRequest(missionVersion: number): ReturnType<typeof bridgeEntryRequestOf> {
  return bridgeEntryRequestOf(realResult, realCandidate, { missionVersion });
}

/** Register one REAL rule and return the composed authority. */
function policyWithRule(input: Parameters<typeof ruleInput>[0]): PolicyEvaluationPort & {
  register(rule: RegisterPolicyRuleInput): void;
} {
  const policy = composeRealPolicyAuthority();
  policy.register(ruleInput(input));
  return policy;
}

// ---------------------------------------------------------------------------
// The REAL policy authority behind the gate adapter (verdict mapping)
// ---------------------------------------------------------------------------

test("REAL POLICY: an allow rule maps to permitted citing the REAL rule + the authority's own §30 record", () => {
  const policy = composeRealPolicyAuthority();
  policy.register(ruleInput({ id: "policy:bridge-fixture-production", effect: "allow" }));
  const gate = createRealProductionEntryPolicyGate({ evaluation: policy });

  const verdict = gate.check({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    subjectRef: "program-request:compat-1",
    policy: [{ id: BRIDGE_POLICY_REF, version: 1 as never }],
    declaredSpend: { amount: 40, currency: "USD" } as never,
    deadline: "2026-06-01T00:15:00.000Z" as never,
  });
  assert.equal(verdict.decision, "permitted");
  assert.equal(verdict.outcome, "allowed");
  assert.equal(verdict.denialReason, null);
  assert.equal(String(verdict.policyRef), "policy:bridge-fixture-production");
  // The §30 evaluation record id resolves through the authority's OWN log.
  assert.ok(verdict.evaluationRef !== null);
  const record = policy.getEvaluationRecord(BRIDGE_SCOPE, verdict.evaluationRef as never);
  assert.ok(record !== null);
  assert.equal(record.verdict.outcome, "allowed");
  assert.equal(String(record.action.actionKind), "production-request-approval");
  assert.equal(String(record.actor), String(BRIDGE_ACTOR));
});

test("REAL POLICY: a deny-effect rule denies with the authority's attribution VERBATIM", () => {
  const policy = composeRealPolicyAuthority();
  policy.register(ruleInput({ id: "policy:bridge-deny", effect: "deny" }));
  const gate = createRealProductionEntryPolicyGate({ evaluation: policy });

  const verdict = gate.check({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    subjectRef: "program-request:compat-1",
    policy: [{ id: "policy:bridge-deny" as never, version: 1 as never }],
  });
  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.outcome, "denied");
  assert.ok(verdict.denialReason !== null);
  assert.ok(verdict.denialReason.length > 0, "the authority's denial detail rides verbatim");
  assert.equal(String(verdict.policyRef), "policy:bridge-deny");
});

test("REAL POLICY: a violated budget-ceiling constraint denies naming the constraint (fail closed)", () => {
  const policy = composeRealPolicyAuthority();
  policy.register(
    ruleInput({
      id: "policy:bridge-budget-ceiling",
      effect: "allow",
      constraints: [{ kind: "budget-ceiling", currency: "USD", maximum: 25 }],
    }),
  );
  const gate = createRealProductionEntryPolicyGate({ evaluation: policy });

  // The candidate's declared spend (USD 40) exceeds the ceiling (USD 25).
  const verdict = gate.check({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    subjectRef: "program-request:compat-1",
    policy: [{ id: "policy:bridge-budget-ceiling" as never, version: 1 as never }],
    declaredSpend: { amount: 40, currency: "USD" } as never,
  });
  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.outcome, "denied");
  assert.match(verdict.denialReason!, /budget-ceiling|exceeds|USD/i);
});

test("REAL POLICY: an approval-required rule denies naming the approver role (no pending state)", () => {
  const policy = composeRealPolicyAuthority();
  policy.register(
    ruleInput({
      id: "policy:bridge-approval",
      effect: "require-approval",
      approverRole: "marketing-lead",
    }),
  );
  const gate = createRealProductionEntryPolicyGate({ evaluation: policy });

  const verdict = gate.check({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    subjectRef: "program-request:compat-1",
    policy: [{ id: "policy:bridge-approval" as never, version: 1 as never }],
  });
  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.outcome, "approval-required");
  assert.match(verdict.denialReason!, /approval-required.*marketing-lead/);
});

test("REAL POLICY: a citation set matching no rule yields insufficient-policy — FAIL CLOSED", () => {
  const policy = composeRealPolicyAuthority();
  // A REGISTERED rule over a DIFFERENT action kind: the
  // production-request-approval action matches nothing → insufficient-policy
  // (the authority's own fail-closed no-applicable-rule outcome).
  policy.register({
    ...ruleInput({ id: "policy:bridge-distribution-only", effect: "allow" }),
    declaredScope: { actionKinds: ["distribution"], subjectRefs: [], actorRefs: [] },
  });
  const gate = createRealProductionEntryPolicyGate({ evaluation: policy });
  const verdict = gate.check({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    subjectRef: "program-request:compat-1",
    policy: [{ id: "policy:bridge-distribution-only" as never, version: 1 as never }],
  });
  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.outcome, "insufficient-policy");
  assert.match(verdict.denialReason!, /insufficient-policy|no cited policy rule matched/i);
});

test("REAL POLICY: a thrown authority caller error is a fail-closed denial with the typed reason verbatim", () => {
  // The REAL authority throws a typed PolicyError on an unresolvable
  // exact-version citation (unknown ≡ cross-tenant, §31) — the adapter is
  // TOTAL: never a permission, never an escape into the bridge.
  const policy = composeRealPolicyAuthority();
  const gate = createRealProductionEntryPolicyGate({ evaluation: policy });
  const verdict = gate.check({
    scope: BRIDGE_SCOPE,
    actor: BRIDGE_ACTOR,
    subjectRef: "program-request:compat-1",
    policy: [{ id: "policy:unknown-in-this-tenant" as never, version: 7 as never }],
  });
  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.outcome, "denied");
  assert.ok(verdict.denialReason !== null);
  assert.match(verdict.denialReason, /policy|rule|version|tenant/i);
});

// ---------------------------------------------------------------------------
// The REAL mission repository behind the mission port
// ---------------------------------------------------------------------------

test("REAL MISSIONS: the port resolves the EXACT activated version; unknown ≡ cross-tenant ≡ wrong-version", () => {
  const repository = createInMemoryMissionRepository({ now: NOW });
  const { missionVersion } = seedRealActiveMission(repository);
  assert.ok(missionVersion >= 1);
  const port = createRealBridgeMissionPort({ source: repository });

  // The EXACT version resolves with the repository's own record data.
  const resolved = port.getMission(BRIDGE_SCOPE, "mission:bridge-fixture-growth" as never, missionVersion);
  assert.ok(resolved !== null);
  assert.equal(resolved.status, "active");
  assert.equal(resolved.version, missionVersion);
  assert.equal(String(resolved.tenantId), BRIDGE_TENANT);
  assert.ok(resolved.rewardSpec.version >= 1);
  assert.equal(resolved.objective.statement, "Grow qualified reach through reaction-video experiments");

  // A WRONG version does not resolve (the citation is exact, never latest).
  assert.equal(port.getMission(BRIDGE_SCOPE, "mission:bridge-fixture-growth" as never, missionVersion + 1), null);
  // An unknown id does not resolve.
  assert.equal(port.getMission(BRIDGE_SCOPE, "mission:never-created" as never, 1), null);

  // CROSS-TENANT ≡ unknown (§31 — no existence leaks): a foreign scope sees
  // nothing, and the status never leaks which foreign tenant owns it.
  assert.equal(
    port.getMission({ tenantId: "tenant-other" as never }, "mission:bridge-fixture-growth" as never, missionVersion),
    null,
  );
});

test("REAL MISSIONS: a DRAFT (not-yet-activated) mission is not enterable (only active accepts)", () => {
  const repository = createInMemoryMissionRepository({ now: NOW });
  const created = repository.createMission({
    scope: BRIDGE_SCOPE,
    id: "mission:bridge-draft" as never,
    objective: {
      statement: "draft objective",
      targetMetrics: [
        { metric: "qualified-reach" as never, target: "100", unit: "count", horizon: null },
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
          definition: "draft reward term",
        },
      ],
    },
  });
  assert.ok(!("error" in created));
  const port = createRealBridgeMissionPort({ source: repository });
  const resolved = port.getMission(BRIDGE_SCOPE, "mission:bridge-draft" as never, created.version);
  assert.ok(resolved !== null);
  assert.equal(resolved.status, "draft");
});

// ---------------------------------------------------------------------------
// The full §24 chain over ALL REAL authorities (end-to-end)
// ---------------------------------------------------------------------------

test("END-TO-END: a REAL search candidate enters production through every REAL authority", async () => {
  const policy = policyWithRule({ id: "policy:bridge-fixture-production", effect: "allow" });
  const missionRepository = createInMemoryMissionRepository({ now: NOW });
  const { missionVersion } = seedRealActiveMission(missionRepository);

  const composed = composeRealAuthorityBridge({
    policy,
    missionRepository,
  });
  const outcome = await composed.bridge.enterProduction(honestRequest(missionVersion));
  assert.ok(outcome.ok, `entry failed: ${!outcome.ok ? `${outcome.error.kind} — ${outcome.error.reason}` : ""}`);
  if (!outcome.ok) {
    return;
  }
  const entry = outcome.value.entry;

  // The Mission segment cites the REAL repository's own activated record.
  assert.equal(entry.mission!.missionVersion, missionVersion);
  assert.equal(entry.mission!.missionStatus, "active");
  assert.equal(entry.mission!.rewardSpecVersion, 1);

  // The Policy segment carries the REAL authority's own verdict + §30 ref.
  assert.equal(entry.policyGate!.decision, "permitted");
  assert.equal(entry.policyGate!.outcome, "allowed");
  assert.ok(entry.policyGate!.evaluationRef !== null);
  const evaluationRecord = policy.getEvaluationRecord(
    BRIDGE_SCOPE,
    entry.policyGate!.evaluationRef as never,
  );
  assert.ok(evaluationRecord !== null, "the cited §30 evaluation resolves in the REAL authority's log");
  assert.equal(String(evaluationRecord.action.subjectRef), String(realCandidate.request.id));

  // The Rights + Assets segments ran over the REAL rights authority.
  assert.equal(entry.rightsGate!.frameActive, true);
  assert.equal(entry.assetsGate!.allCovered, true);

  // The Studio segment is the REAL runtime's own session.
  assert.equal(entry.studio!.lifecycleState, "capturing");
  assert.ok(String(entry.studio!.sessionRef).startsWith("sess_"));

  // The §24 boundary statement + the BRIDGE-002 expectations surface.
  assert.match(entry.boundaryStatement, /never call social platforms directly/);
  assert.equal(entry.expectations!.counterfactual, true);
});

test("END-TO-END DENIAL: a REAL deny-effect rule denies with the authority's VERBATIM attribution and ZERO studio calls", async () => {
  const policy = policyWithRule({
    id: "policy:bridge-fixture-production",
    effect: "deny",
  });
  const missionRepository = createInMemoryMissionRepository({ now: NOW });
  const { missionVersion } = seedRealActiveMission(missionRepository);

  let spyCalls: Record<string, number> = {};
  const composed = composeRealAuthorityBridge({
    policy,
    missionRepository,
    wrapRuntime: (runtime) => countingRuntimeOf(runtime, (calls) => {
      spyCalls = calls;
    }),
  });
  const outcome = await composed.bridge.enterProduction(honestRequest(missionVersion));
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "policy-gate-denied");
  if (outcome.error.kind === "policy-gate-denied") {
    // The REAL authority's denial attribution, VERBATIM on the typed failure
    // AND on the appended record.
    assert.ok(outcome.error.reason.length > 0);
    assert.equal(outcome.error.reason, outcome.error.entry.denial!.reason);
    assert.equal(outcome.error.entry.policyGate!.outcome, "denied");
    assert.equal(String(outcome.error.entry.policyGate!.policyRef), "policy:bridge-fixture-production");
    assert.ok(outcome.error.entry.policyGate!.evaluationRef !== null);
    // The REAL authority's §30 log carries the denial evaluation.
    const record = policy.getEvaluationRecord(
      BRIDGE_SCOPE,
      outcome.error.entry.policyGate!.evaluationRef as never,
    );
    assert.ok(record !== null);
    assert.equal(record.verdict.outcome, "denied");
  }
  // ZERO studio runtime invocations (the gate-ordering discipline).
  assert.equal(spyCalls.createSession ?? 0, 0);
  assert.equal(spyCalls.loadOrganization ?? 0, 0);
});

test("END-TO-END MISSION FAILURE: an unknown mission version records NOTHING (REAL repository)", async () => {
  const policy = policyWithRule({ id: "policy:bridge-fixture-production", effect: "allow" });
  const missionRepository = createInMemoryMissionRepository({ now: NOW });
  const { missionVersion } = seedRealActiveMission(missionRepository);

  const composed = composeRealAuthorityBridge({ policy, missionRepository });
  const outcome = await composed.bridge.enterProduction(honestRequest(missionVersion + 5));
  assert.ok(!outcome.ok);
  assert.equal(outcome.error.kind, "mission-unresolved");
  assert.deepEqual(composed.bridge.listLatestEntries(BRIDGE_SCOPE), []);
});

// ---------------------------------------------------------------------------
// The counting runtime spy (shared with the in-package battery's discipline)
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
