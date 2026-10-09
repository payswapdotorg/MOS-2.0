/**
 * BRIDGE-002 evaluation-store battery (evaluation-store.ts) — the append-only
 * versioned tenant-scoped record store behind the §19 authority.
 *
 * Pins (the BRIDGE-001 store discipline, W9-B D1–D5):
 * - D1/D2 exact-tenant JSON-array keys: hostile delimiter-laden tenant and
 *   evaluation ids cannot alias another tenant's chain;
 * - D3 clone-then-deep-freeze: the caller's draft is never aliased into the
 *   store and never frozen in place; returned records are deep-frozen;
 * - D4 frozen scope copies: forging the caller's scope after the call moves
 *   nothing;
 * - append-only chains: v1 minted by the decision, v2 `treatment-linked` over
 *   an OPEN linkage only; prior versions bit-for-bit immutable; exactly ONE
 *   successor completes a linkage;
 * - the §19 linkage verification: same-chain successors must be LATER
 *   versions of the SAME package; a different package id completes only as
 *   the disclosed re-produced shape;
 * - fail-loud evaluation-id collisions (never a silent overwrite);
 * - `__proto__` payloads persist as inert own properties (no prototype
 *   pollution through the deep-freeze walk).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { StudioOutputEvaluationRecord } from "./contracts/studio-output-evaluation.js";
import { STUDIO_EVALUATION_BOUNDARY_STATEMENT } from "./contracts/studio-output-evaluation.js";
import { createStudioOutputEvaluationStore } from "./evaluation-store.js";
import type { TenantScope } from "@mos/contracts";

// ---------------------------------------------------------------------------
// The record factory (a minimal well-formed v1 over the fixture citation)
// ---------------------------------------------------------------------------

const SCOPE: TenantScope = { tenantId: "tenant-store" as never };
const ACTOR = "identity-lab-evaluator-1" as never;
const OTHER_TENANT = "tenant-store-other" as never;

function recordOf(
  id: string,
  overrides: Partial<StudioOutputEvaluationRecord> = {},
): StudioOutputEvaluationRecord {
  return {
    id,
    scope: SCOPE,
    actor: ACTOR,
    createdAt: "2026-06-02T00:00:00.000Z" as never,
    status: "decided",
    decision: { kind: "accept", summary: "meets expectations" },
    evaluatedPackage: {
      packageId: "pkg_store_1" as never,
      version: 1,
      sessionRef: "sess_store_1" as never,
    },
    entryCitation: {
      entryId: "lts_store_1",
      entryVersion: 2,
      candidate: {
        searchResultId: "search:store-1",
        rank: 1,
        requestRef: { id: "program-request:store-1" as never, version: 1 },
        candidateOrigin: "hand-designed",
        isNoopBaseline: false,
        transformChain: [{ definitionId: "transform:store", definitionVersion: 1 }],
        organizationCitation: { organizationId: "organization:store", organizationVersion: 1 },
        provenance: { policyVersion: 1, seed: 1, generationIndex: null, variedDimensions: ["transform"] },
        rightsContext: { rightsRefs: ["rights:store"], consentRefs: [] },
      },
      mission: {
        missionRef: "mission:store" as never,
        missionVersion: 3,
        rewardSpecVersion: 1,
        missionStatus: "active",
        linkedAt: "2026-06-01T00:00:00.000Z" as never,
      },
      studio: {
        sessionRef: "sess_store_1" as never,
        labCandidateRef: "lab-cand" as never,
        organizationRef: { id: "organization:store", version: 1 },
        formatRef: { formatId: "reaction", version: 1 },
        lifecycleState: "packaged",
        enteredAt: "2026-06-01T00:00:00.000Z" as never,
      },
    },
    expectations: {
      expectedReward: 10,
      interval: { lower: 8, upper: 12 },
      baselineExpectedReward: 9,
      expectedRewardDelta: 1,
      expectedValueOfDelay: 0.5,
      disclosure: "simulation-based counterfactual estimate",
      counterfactual: true,
    },
    treatmentLinkage: null,
    observability: {
      evaluationId: id,
      entryId: "lts_store_1",
      sessionRef: "sess_store_1" as never,
      formatRef: { formatId: "reaction", version: 1 },
      organizationRef: { id: "organization:store", version: 1 },
      transformChain: [{ definitionId: "transform:store", definitionVersion: 1 }],
      finalArtifactIds: ["artifact:final-1"],
      cost: { currency: "USD", amount: "12.00" },
      durationSeconds: 120,
      sessionLifecycleState: "packaged",
      missionRef: { id: "mission:store", version: 3 },
      evaluatedAt: "2026-06-02T00:00:00.000Z" as never,
    },
    notes: null,
    boundaryStatement: STUDIO_EVALUATION_BOUNDARY_STATEMENT,
    version: 1,
    priorVersion: null,
    ...overrides,
  };
}

/** A treatment-creating record (a request-treatment decision with an open linkage). */
function treatmentRecordOf(id: string): StudioOutputEvaluationRecord {
  return recordOf(id, {
    decision: { kind: "request-treatment", treatment: { kind: "edit", rationale: "tighten" } },
    treatmentLinkage: {
      phase: "awaiting-successor",
      decisionKind: "request-treatment",
      priorPackageRef: { packageId: "pkg_store_1" as never, version: 1 },
      directive: {
        kind: "request-treatment",
        rationale: "tighten",
        treatment: { kind: "edit", rationale: "tighten" },
      },
      reservedAt: "2026-06-02T00:00:01.000Z" as never,
    },
  });
}

// ---------------------------------------------------------------------------
// D3/D4 — clone-then-deep-freeze
// ---------------------------------------------------------------------------

test("D3: the stored record is a private deep-frozen copy — the caller's draft is never aliased", () => {
  const store = createStudioOutputEvaluationStore();
  const draft = treatmentRecordOf("sev_d3");
  const stored = store.appendFirstVersion(draft);
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored.entryCitation), true);
  assert.equal(Object.isFrozen(stored.entryCitation.candidate), true);
  // Mutating the caller's draft after the append moves NOTHING (the store
  // holds its own private copy — reread stays the appended truth).
  (draft as unknown as Record<string, unknown>).actor = "identity-forged";
  (draft.entryCitation.candidate as unknown as Record<string, unknown>).rank = 99;
  const reread = store.getEvaluation(SCOPE, "sev_d3");
  assert.equal(reread?.actor, ACTOR);
  assert.equal(reread?.entryCitation.candidate.rank, 1);
  assert.deepEqual(reread, store.getEvaluation(SCOPE, "sev_d3"));
});

test("D4: forging the caller's scope after the append moves nothing", () => {
  const store = createStudioOutputEvaluationStore();
  const scope = { tenantId: "tenant-store" } as { tenantId: string };
  const stored = store.appendFirstVersion({ ...recordOf("sev_d4"), scope: scope as never });
  scope.tenantId = "tenant-forged";
  assert.equal(String(stored.scope.tenantId), "tenant-store");
  assert.ok(store.getEvaluation(SCOPE, "sev_d4") !== undefined);
  assert.equal(store.getEvaluation({ tenantId: "tenant-forged" as never }, "sev_d4"), undefined);
});

test("D3 hostile: a deep-frozen returned record throws on mutation (strict mode)", () => {
  const store = createStudioOutputEvaluationStore();
  const stored = store.appendFirstVersion(treatmentRecordOf("sev_d3b"));
  assert.throws(() => {
    (stored as unknown as Record<string, unknown>).status = "treatment-linked";
  }, /read only|Cannot assign/i);
});

// ---------------------------------------------------------------------------
// D1/D2 — exact-tenant keys, hostile delimiter-laden ids
// ---------------------------------------------------------------------------

test("D1/D2: hostile delimiter-laden tenant and evaluation ids cannot alias another chain", () => {
  const store = createStudioOutputEvaluationStore();
  const hostileTenant = 'tenant-store", "sev_x\\":[" evil';
  const hostileId = 'sev_a", "tenant-store\\":[" evil';
  store.appendFirstVersion(recordOf("sev_a", { scope: { tenantId: hostileTenant } as never }));
  store.appendFirstVersion(recordOf(hostileId));
  assert.equal(store.getEvaluation({ tenantId: hostileTenant } as never, "sev_a")?.id, "sev_a");
  assert.equal(store.getEvaluation(SCOPE, hostileId)?.id, hostileId);
  // The honest chain is untouched by the hostile ids.
  assert.equal(store.getEvaluation(SCOPE, "sev_a"), undefined);
  assert.equal(store.getEvaluation({ tenantId: hostileTenant } as never, hostileId), undefined);
  assert.deepEqual(store.listLatestEvaluations(SCOPE).map((record) => record.id), [hostileId]);
});

test("TENANT SCOPE: reads and listings are exact-tenant (cross-tenant ≡ unknown)", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(recordOf("sev_t1"));
  assert.equal(store.getEvaluation(SCOPE, "sev_t1")?.id, "sev_t1");
  assert.equal(store.getEvaluation({ tenantId: OTHER_TENANT } as never, "sev_t1"), undefined);
  assert.deepEqual(store.listLatestEvaluations({ tenantId: OTHER_TENANT } as never), []);
  assert.equal(store.listEvaluationVersions({ tenantId: OTHER_TENANT } as never, "sev_t1").length, 0);
});

// ---------------------------------------------------------------------------
// Append-only chains + the §19 linkage lifecycle
// ---------------------------------------------------------------------------

test("APPEND-ONLY: v1 stays bit-for-bit immutable after the linkage append; the chain ascends", () => {
  const store = createStudioOutputEvaluationStore();
  const v1 = store.appendFirstVersion(treatmentRecordOf("sev_chain"));
  const v1Snapshot = structuredClone(v1);
  const appended = store.appendTreatmentLinkage(SCOPE, "sev_chain", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 2,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.ok(appended.ok);
  if (appended.ok) {
    assert.equal(appended.record.version, 2);
    assert.equal(appended.record.priorVersion, 1);
    assert.equal(appended.record.status, "treatment-linked");
    assert.equal(appended.record.treatmentLinkage?.phase, "linked");
    assert.equal(appended.record.decision.kind, "request-treatment");
  }
  const rereadV1 = store.getEvaluation(SCOPE, "sev_chain", 1);
  assert.deepEqual(rereadV1, v1Snapshot);
  assert.equal(store.getEvaluation(SCOPE, "sev_chain")?.version, 2);
  assert.deepEqual(
    store.listEvaluationVersions(SCOPE, "sev_chain").map((record) => record.version),
    [1, 2],
  );
});

test("LINKAGE SINGLE-COMPLETION: a second successor append fails closed", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(treatmentRecordOf("sev_once"));
  const first = store.appendTreatmentLinkage(SCOPE, "sev_once", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 2,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.ok(first.ok);
  const second = store.appendTreatmentLinkage(SCOPE, "sev_once", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 3,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:03.000Z" as never,
  });
  assert.ok(!second.ok);
  assert.match(second.reason, /linkage-already-completed/);
  assert.equal(store.getEvaluation(SCOPE, "sev_once")?.version, 2);
});

test("LINKAGE NOT OPEN: a non-treatment decision accepts no successor append", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(recordOf("sev_accept"));
  const result = store.appendTreatmentLinkage(SCOPE, "sev_accept", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 2,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.ok(!result.ok);
  assert.match(result.reason, /linkage-not-open/);
});

test("LINKAGE VERIFICATION: same-chain successors must be LATER versions of the SAME package", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(treatmentRecordOf("sev_verify"));
  const badSuccessors: readonly {
    readonly packageId: string;
    readonly version: number;
    readonly successorKind?: "treatment-successor" | "re-produced-output";
  }[] = [
    { packageId: "pkg_store_1", version: 1 }, // same version — not new
    { packageId: "pkg_store_1", version: 0 }, // earlier — never
    { packageId: "pkg_other", version: 5, successorKind: "treatment-successor" }, // different id, wrong shape tag
  ];
  for (const bad of badSuccessors) {
    const result = store.appendTreatmentLinkage(SCOPE, "sev_verify", {
      successorKind: bad.successorKind ?? "treatment-successor",
      packageId: bad.packageId,
      version: bad.version,
      sessionRef: "sess_store_1" as never,
      linkedBy: ACTOR,
      linkedAt: "2026-06-02T00:00:02.000Z" as never,
    });
    assert.ok(!result.ok, `successor ${bad.packageId}@v${bad.version} must fail the linkage check`);
    assert.match(result.reason, /successor-not-linked/);
  }
});

test("LINKAGE VERIFICATION: a different package id completes ONLY as the disclosed re-produced shape", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(treatmentRecordOf("sev_repro"));
  const result = store.appendTreatmentLinkage(SCOPE, "sev_repro", {
    successorKind: "re-produced-output",
    packageId: "pkg_reproduced",
    version: 1,
    sessionRef: "sess_reproduced" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.record.treatmentLinkage?.phase, "linked");
    if (result.record.treatmentLinkage?.phase === "linked") {
      assert.equal(result.record.treatmentLinkage.successorKind, "re-produced-output");
      assert.equal(String(result.record.treatmentLinkage.successorPackageRef.packageId), "pkg_reproduced");
    }
  }
});

test("UNKNOWN CHAIN: appending a successor over an unknown/cross-tenant evaluation fails closed", () => {
  const store = createStudioOutputEvaluationStore();
  const unknown = store.appendTreatmentLinkage(SCOPE, "sev_ghost", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 2,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.ok(!unknown.ok);
  assert.match(unknown.reason, /evaluation-unresolved/);
  store.appendFirstVersion(treatmentRecordOf("sev_known"));
  const crossTenant = store.appendTreatmentLinkage({ tenantId: OTHER_TENANT } as never, "sev_known", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 2,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.ok(!crossTenant.ok);
  assert.match(crossTenant.reason, /evaluation-unresolved/);
});

test("COLLISION: a duplicate evaluation id fails LOUD (never a silent overwrite)", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(recordOf("sev_dup"));
  assert.throws(
    () => store.appendFirstVersion(recordOf("sev_dup")),
    /evaluation id collision/,
  );
});

test("LISTING: latest evaluations list in creation order, per tenant", () => {
  const store = createStudioOutputEvaluationStore();
  store.appendFirstVersion(recordOf("sev_l1"));
  store.appendFirstVersion(recordOf("sev_l2"));
  store.appendFirstVersion(recordOf("sev_l3", { scope: { tenantId: OTHER_TENANT } as never }));
  assert.deepEqual(
    store.listLatestEvaluations(SCOPE).map((record) => record.id),
    ["sev_l1", "sev_l2"],
  );
  // After a linkage append, the LATEST version is listed (v2).
  store.appendFirstVersion(treatmentRecordOf("sev_l4"));
  store.appendTreatmentLinkage(SCOPE, "sev_l4", {
    successorKind: "treatment-successor",
    packageId: "pkg_store_1",
    version: 2,
    sessionRef: "sess_store_1" as never,
    linkedBy: ACTOR,
    linkedAt: "2026-06-02T00:00:02.000Z" as never,
  });
  assert.deepEqual(
    store.listLatestEvaluations(SCOPE).map((record) => [record.id, record.version]),
    [
      ["sev_l1", 1],
      ["sev_l2", 1],
      ["sev_l4", 2],
    ],
  );
});

// ---------------------------------------------------------------------------
// Prototype-pollution hardening (the §5.5 discipline)
// ---------------------------------------------------------------------------

test("PROTOTYPE: a `__proto__`-keyed evaluation id does not pollute Object.prototype (inert own key)", () => {
  const store = createStudioOutputEvaluationStore();
  const prototypeSnapshot = Object.getOwnPropertyNames(Object.prototype).slice();
  store.appendFirstVersion(recordOf("__proto__"));
  // No prototype pollution: Object.prototype's own keyset is unchanged.
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).slice(), prototypeSnapshot);
  assert.equal(({} as { actor?: string }).actor, undefined);
  // The hostile evaluation id lives as its own tenant-scoped chain.
  assert.equal(store.listLatestEvaluations(SCOPE).length, 1);
  assert.equal(String(store.listLatestEvaluations(SCOPE)[0]!.id), "__proto__");
  assert.ok(store.getEvaluation(SCOPE, "__proto__") !== undefined);
  assert.ok(store.getEvaluation(SCOPE, "__proto__", 1) !== undefined);
});
