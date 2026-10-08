/**
 * BRIDGE-001 entry-store adversarial battery (bridge-entry-store.ts) — the
 * W9-B D1–D5 disciplines BY CONSTRUCTION, probed attack-first:
 *
 * - D1/D2 exact-tenant JSON-array keys: hostile delimiter-laden tenant ids
 *   (`\u0000`, `::`, `:`, `|`, quote, `__proto__`, embedded space) cannot
 *   alias another tenant's entry chains — reads, listings and version
 *   chains see nothing across tenants;
 * - D3 clone-then-deep-freeze: the caller's draft record is never aliased
 *   into the store and never frozen in place; stored records are
 *   bit-for-bit immutable under post-append caller mutation;
 * - D4 frozen scope copies: forging the caller's scope object after the
 *   append moves nothing;
 * - D5 finite guards: the store's own numeric bookkeeping (versions) is
 *   integer-only by construction (the validation layer guards the payload
 *   numerics — pinned in bridge-validation.test.ts);
 * - append-only: v1 → v2 (`packaged`) only over an `entered` latest; prior
 *   versions stay resolvable and bit-for-bit immutable; no update/delete
 *   surface exists;
 * - `__proto__`-carrying payloads persist as INERT OWN PROPERTIES (the
 *   W9-B §5.5 residual discipline: no Object.prototype pollution, no
 *   propagation into reads).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createLabToStudioEntryStore } from "./bridge-entry-store.js";
import type { LabToStudioEntryStore } from "./bridge-entry-store.js";
import {
  LAB_TO_STUDIO_BOUNDARY_STATEMENT,
  type LabToStudioProductionEntry,
} from "./contracts/lab-to-studio-entry.js";
import type { TenantScope } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Draft-record fixtures (the store's payloads; the bridge core mints these)
// ---------------------------------------------------------------------------

function draftRecord(input: {
  readonly tenantId: string;
  readonly entryId: string;
  readonly status?: LabToStudioProductionEntry["status"];
  readonly hostilePayload?: Record<string, unknown>;
}): LabToStudioProductionEntry {
  return {
    id: input.entryId,
    scope: { tenantId: input.tenantId as never, workspaceId: undefined },
    actor: "identity-store-probe-1" as never,
    createdAt: "2026-06-01T00:00:01.000Z" as never,
    status: input.status ?? "entered",
    denial: null,
    candidate: {
      searchResultId: "program-search:store-probe",
      rank: 1,
      requestRef: { id: "program-request:store-probe" as never, version: 1 },
      candidateOrigin: "hand-designed",
      isNoopBaseline: false,
      transformChain: [
        { definitionId: "transform:store-probe", definitionVersion: 1 },
      ],
      organizationCitation: { organizationId: "organization:store-probe", organizationVersion: 1 },
      provenance: {
        policyVersion: 1,
        seed: 20260601,
        generationIndex: null,
        variedDimensions: ["modality"],
      },
      rightsContext: { rightsRefs: ["rights:store-probe"], consentRefs: ["consent:store-probe"] },
      ...input.hostilePayload,
    },
    mission: {
      missionRef: "mission:store-probe" as never,
      missionVersion: 4,
      rewardSpecVersion: 2,
      missionStatus: "active",
      linkedAt: "2026-06-01T00:00:01.000Z" as never,
    },
    policyGate: null,
    rightsGate: null,
    assetsGate: null,
    studio: null,
    expectations: {
      expectedReward: 1.25,
      interval: { lower: 1.0, upper: 1.5 },
      baselineExpectedReward: 0,
      expectedRewardDelta: 1.25,
      expectedValueOfDelay: 0.5,
      disclosure: "ensemble-evaluated-simulation-estimate",
      counterfactual: true,
    },
    packageRef: null,
    boundaryStatement: LAB_TO_STUDIO_BOUNDARY_STATEMENT,
    version: 1,
    priorVersion: null,
  };
}

const scopeOf = (tenantId: string): TenantScope => ({ tenantId: tenantId as never });

// ---------------------------------------------------------------------------
// D3/D4: clone-then-deep-freeze + frozen scope copies
// ---------------------------------------------------------------------------

test("D3: the stored record is a PRIVATE clone — post-append mutation of the caller's draft moves nothing", () => {
  const store = createLabToStudioEntryStore();
  const draft = draftRecord({ tenantId: "tenant-a", entryId: "entry-1" });
  const stored = store.appendFirstVersion(draft);

  // The caller mutates their draft AFTER the append (hostile casts — the
  // readonly surface is exactly what the caller is violating).
  const hostileDraft = draft as unknown as Record<string, unknown>;
  hostileDraft.status = "denied";
  const hostileCandidate = draft.candidate as unknown as Record<string, unknown>;
  hostileCandidate.rank = 999;
  (draft.candidate.transformChain[0] as unknown as Record<string, unknown>).definitionId =
    "transform:hostile-rewrite";
  (draft.expectations as unknown as Record<string, unknown>).expectedReward = -1;
  hostileCandidate.hostileInjection = "boom";

  assert.equal(stored.status, "entered");
  assert.equal(stored.candidate.rank, 1);
  assert.equal(stored.candidate.transformChain[0]!.definitionId, "transform:store-probe");
  assert.equal(stored.expectations!.expectedReward, 1.25);
  assert.equal(
    (stored.candidate as unknown as Record<string, unknown>).hostileInjection,
    undefined,
    "the caller's post-append field injection never lands on the stored record",
  );
  // And the re-read is the SAME bit-for-bit record.
  assert.equal(store.getEntry(scopeOf("tenant-a"), "entry-1"), stored);
});

test("D3: the caller's draft is NEVER frozen in place (no in-place freeze of caller objects)", () => {
  const store = createLabToStudioEntryStore();
  const draft = draftRecord({ tenantId: "tenant-a", entryId: "entry-1" });
  store.appendFirstVersion(draft);
  assert.equal(Object.isFrozen(draft), false, "the caller's top-level draft object stays mutable");
  assert.equal(Object.isFrozen(draft.candidate), false, "the caller's nested objects stay mutable");
  assert.equal(Object.isFrozen(draft.expectations), false);
});

test("D3: the STORED record is deeply frozen (nested segments immutable)", () => {
  const store = createLabToStudioEntryStore();
  const stored = store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored.candidate), true);
  assert.equal(Object.isFrozen(stored.candidate.transformChain), true);
  assert.equal(Object.isFrozen(stored.candidate.provenance), true);
  assert.equal(Object.isFrozen(stored.mission), true);
  assert.equal(Object.isFrozen(stored.expectations), true);
  assert.equal(Object.isFrozen(stored.expectations!.interval), true);
  assert.throws(() => {
    (stored as { status: string }).status = "denied";
  }, /cannot assign to read only property|Cannot assign/i);
});

test("D4: forging the caller's SCOPE object after the append moves nothing", () => {
  const store = createLabToStudioEntryStore();
  const scope = scopeOf("tenant-a");
  const draft = draftRecord({ tenantId: "tenant-a", entryId: "entry-1" });
  const stored = store.appendFirstVersion(draft);

  // The caller forges their scope object post-hoc (tenant-identity corruption).
  (scope as { tenantId: string }).tenantId = "tenant-b";
  (draft.scope as { tenantId: string }).tenantId = "tenant-b";

  assert.equal(String(stored.scope.tenantId), "tenant-a");
  // The stored record still resolves under the ORIGINAL tenant...
  assert.ok(store.getEntry(scopeOf("tenant-a"), "entry-1") !== undefined);
  // ...and NOT under the forged one.
  assert.equal(store.getEntry(scopeOf("tenant-b"), "entry-1"), undefined);
  // The listing is unchanged too.
  assert.equal(store.listLatestEntries(scopeOf("tenant-a")).length, 1);
  assert.equal(store.listLatestEntries(scopeOf("tenant-b")).length, 0);
});

// ---------------------------------------------------------------------------
// D1/D2: hostile tenant ids over the JSON-array keys
// ---------------------------------------------------------------------------

test("D1/D2: hostile delimiter-laden tenant ids cannot alias another tenant's entry chain", () => {
  const store = createLabToStudioEntryStore();
  // An HONEST tenant with a composite-looking id...
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  // ...and hostile tenants whose ids embed the honest tenant's key material.
  const hostileTenants = [
    'tenant-a", "entry-1"',
    "tenant-a::entry-1",
    "tenant-a:entry-1",
    "tenant-a|entry-1",
    'tenant-a", "entry-2"',
    "__proto__",
    "constructor",
    "tenant-a entry-1",
    "tenant-a\u0000entry-1",
    'tenant-a"]',
  ];
  for (const hostile of hostileTenants) {
    // A hostile append under the hostile tenant CREATES ITS OWN chain...
    const hostileEntryId = "entry-1";
    const stored = store.appendFirstVersion(draftRecord({ tenantId: hostile, entryId: hostileEntryId }));
    assert.equal(String(stored.scope.tenantId), hostile);
    // ...the hostile tenant reads ONLY its own chain (never tenant-a's)...
    assert.equal(store.listLatestEntries(scopeOf(hostile)).length, 1);
    assert.equal(String(store.listLatestEntries(scopeOf(hostile))[0]!.scope.tenantId), hostile);
    // ...and the honest tenant's chain is untouched.
    const honest = store.listLatestEntries(scopeOf("tenant-a"));
    assert.equal(honest.length, 1);
    assert.equal(String(honest[0]!.scope.tenantId), "tenant-a");
    assert.equal(store.listEntryVersions(scopeOf("tenant-a"), "entry-1").length, 1);
  }
  // The honest tenant's listing is EXACTLY its own chain (11 hostile tenants
  // carved their own; tenant-a still sees exactly one).
  assert.equal(store.listLatestEntries(scopeOf("tenant-a")).length, 1);
});

test("D1/D2: hostile ENTRY ids cannot alias another tenant's chain either", () => {
  const store = createLabToStudioEntryStore();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  const hostileEntryIds = [
    'entry-1", "tenant-a',
    "entry-1\u0000",
    "entry-1::tenant-a",
    "__proto__",
    "__proto__.tenantId",
    "constructor.prototype",
  ];
  for (const hostileId of hostileEntryIds) {
    store.appendFirstVersion(draftRecord({ tenantId: "tenant-b", entryId: hostileId }));
    // tenant-b's hostile entry id does NOT read tenant-a's entry-1.
    assert.equal(store.getEntry(scopeOf("tenant-b"), "entry-1"), undefined);
    assert.equal(store.getEntry(scopeOf("tenant-a"), hostileId), undefined);
    assert.equal(store.listEntryVersions(scopeOf("tenant-b"), "entry-1").length, 0);
  }
  assert.ok(store.getEntry(scopeOf("tenant-a"), "entry-1") !== undefined);
});

test("D2: cross-tenant reads see NOTHING (no existence leak — undefined is indistinguishable)", () => {
  const store = createLabToStudioEntryStore();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  assert.equal(store.getEntry(scopeOf("tenant-b"), "entry-1"), undefined);
  assert.equal(store.getEntry(scopeOf("tenant-b"), "entry-1", 1), undefined);
  assert.deepEqual(store.listLatestEntries(scopeOf("tenant-b")), []);
  assert.deepEqual(store.listEntryVersions(scopeOf("tenant-b"), "entry-1"), []);
  // Unknown-entry reads under the OWNING tenant are the same shape.
  assert.equal(store.getEntry(scopeOf("tenant-a"), "entry-unknown"), undefined);
});

test("the __proto__-keyed entry id does not pollute Object.prototype (inert own key)", () => {
  const store = createLabToStudioEntryStore();
  const prototypeSnapshot = Object.getOwnPropertyNames(Object.prototype).slice();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "__proto__" }));
  // No prototype pollution: Object.prototype's own keyset is unchanged.
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).slice(), prototypeSnapshot);
  assert.equal(({} as { tenantId?: string }).tenantId, undefined);
  // The hostile entry lives as its own tenant-scoped chain.
  assert.equal(store.listLatestEntries(scopeOf("tenant-a")).length, 1);
  assert.equal(String(store.listLatestEntries(scopeOf("tenant-a"))[0]!.id), "__proto__");
});

// ---------------------------------------------------------------------------
// __proto__ payloads (the W9-B §5.5 residual discipline, pinned)
// ---------------------------------------------------------------------------

test("__proto__-carrying payloads persist as INERT OWN PROPERTIES (no pollution, no propagation)", () => {
  const store = createLabToStudioEntryStore();
  // A hostile payload object carrying "__proto__" as an OWN property (the
  // JSON.parse shape — never a prototype assignment).
  const hostilePayload = JSON.parse(
    '{"__proto__": {"polluted": "yes"}, "rank": 7}',
  ) as Record<string, unknown> & { rank: number };
  assert.equal(({} as { polluted?: string }).polluted, undefined);

  const draft = draftRecord({
    tenantId: "tenant-a",
    entryId: "entry-1",
    hostilePayload: { hostile: hostilePayload },
  });
  const stored = store.appendFirstVersion(draft);
  const prototypeSnapshot = Object.getOwnPropertyNames(Object.prototype).slice();

  // No Object.prototype pollution happened through the store.
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).slice(), prototypeSnapshot);
  assert.equal(({} as { polluted?: string }).polluted, undefined);
  // The hostile own-property survives as an inert own property of the clone.
  const hostile = (stored.candidate as unknown as { hostile?: Record<string, unknown> }).hostile;
  assert.ok(hostile !== undefined);
  assert.equal(Object.getOwnPropertyNames(hostile).includes("__proto__"), true);
  assert.deepEqual((hostile as { __proto__?: unknown })["__proto__"], { polluted: "yes" });
  assert.equal(hostile.rank, 7);
  // The stored record is frozen — including the inert own-property payload.
  assert.equal(Object.isFrozen(hostile), true);
  // Reads do not propagate the payload anywhere else.
  const reRead = store.getEntry(scopeOf("tenant-a"), "entry-1");
  assert.ok(reRead !== undefined);
  assert.equal(({} as { polluted?: string }).polluted, undefined);
});

// ---------------------------------------------------------------------------
// Append-only discipline
// ---------------------------------------------------------------------------

test("append-only: v1 minted by the append, v2 (`packaged`) only over an `entered` latest", () => {
  const store = createLabToStudioEntryStore();
  const stored = store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  assert.equal(stored.version, 1);
  assert.equal(stored.priorVersion, null);
  assert.equal(stored.status, "entered");

  const appended = store.appendPackagedVersion(scopeOf("tenant-a"), "entry-1", {
    packageId: "pkg_studio_1",
    version: 3,
  });
  assert.equal(appended.ok, true);
  if (appended.ok) {
    assert.equal(appended.record.version, 2);
    assert.equal(appended.record.priorVersion, 1);
    assert.equal(appended.record.status, "packaged");
    assert.deepEqual(appended.record.packageRef, { packageId: "pkg_studio_1", version: 3 });
  }
  // The prior version stays resolvable AND bit-for-bit immutable.
  const v1 = store.getEntry(scopeOf("tenant-a"), "entry-1", 1);
  assert.ok(v1 !== undefined);
  assert.equal(v1.status, "entered");
  assert.equal(v1.packageRef, null);
  assert.equal(v1, stored, "the v1 record object is the SAME frozen instance — never rewritten");
  // The latest is v2.
  assert.equal(store.getEntry(scopeOf("tenant-a"), "entry-1")!.version, 2);
  // The version chain ascends.
  assert.deepEqual(
    store.listEntryVersions(scopeOf("tenant-a"), "entry-1").map((record) => record.version),
    [1, 2],
  );
  // v2 is deeply frozen too.
  assert.equal(Object.isFrozen(store.getEntry(scopeOf("tenant-a"), "entry-1")), true);
});

test("append-only: a `packaged` latest cannot package again (no v3)", () => {
  const store = createLabToStudioEntryStore();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  assert.ok(store.appendPackagedVersion(scopeOf("tenant-a"), "entry-1", { packageId: "pkg_1", version: 1 }).ok);
  const second = store.appendPackagedVersion(scopeOf("tenant-a"), "entry-1", { packageId: "pkg_2", version: 1 });
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.match(second.reason, /entry-already-packaged/);
  }
  assert.equal(store.getEntry(scopeOf("tenant-a"), "entry-1")!.version, 2);
});

test("append-only: a `denied`/`studio-entry-failed` latest cannot package (typed rejection)", () => {
  for (const status of ["denied", "studio-entry-failed"] as const) {
    const store = createLabToStudioEntryStore();
    store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1", status }));
    const outcome = store.appendPackagedVersion(scopeOf("tenant-a"), "entry-1", {
      packageId: "pkg_1",
      version: 1,
    });
    assert.equal(outcome.ok, false, `status ${status} cannot package`);
    if (!outcome.ok) {
      assert.match(outcome.reason, /entry-not-entered/);
    }
  }
});

test("append-only: unknown/cross-tenant entry ids fail closed (nothing exists to extend)", () => {
  const store = createLabToStudioEntryStore();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  const unknown = store.appendPackagedVersion(scopeOf("tenant-b"), "entry-1", {
    packageId: "pkg_1",
    version: 1,
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.match(unknown.reason, /entry-not-found/);
  }
  const cross = store.appendPackagedVersion(scopeOf("tenant-a"), "entry-unknown", {
    packageId: "pkg_1",
    version: 1,
  });
  assert.equal(cross.ok, false);
});

test("duplicate entry-id appends FAIL LOUD (never a silent overwrite)", () => {
  const store = createLabToStudioEntryStore();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  assert.throws(
    () => store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" })),
    /entry id collision/,
  );
  // The original chain is intact after the collision throw.
  assert.equal(store.listLatestEntries(scopeOf("tenant-a")).length, 1);
  assert.equal(store.getEntry(scopeOf("tenant-a"), "entry-1")!.version, 1);
});

test("listings keep first-seen creation order across appends", () => {
  const store = createLabToStudioEntryStore();
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-2" }));
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-3" }));
  store.appendFirstVersion(draftRecord({ tenantId: "tenant-b", entryId: "entry-1" }));
  assert.deepEqual(
    store.listLatestEntries(scopeOf("tenant-a")).map((record) => record.id),
    ["entry-1", "entry-2", "entry-3"],
  );
  assert.deepEqual(
    store.listLatestEntries(scopeOf("tenant-b")).map((record) => record.id),
    ["entry-1"],
  );
  // Packaging one entry does not reorder the listing.
  store.appendPackagedVersion(scopeOf("tenant-a"), "entry-2", { packageId: "pkg_1", version: 1 });
  assert.deepEqual(
    store.listLatestEntries(scopeOf("tenant-a")).map((record) => record.id),
    ["entry-1", "entry-2", "entry-3"],
  );
  assert.deepEqual(
    store.listLatestEntries(scopeOf("tenant-a")).map((record) => record.status),
    ["entered", "packaged", "entered"],
  );
});

test("the stored records satisfy the store interface invariants under versioned reads", () => {
  const store: LabToStudioEntryStore = createLabToStudioEntryStore();
  const stored = store.appendFirstVersion(draftRecord({ tenantId: "tenant-a", entryId: "entry-1" }));
  // Boundary statement rides every record verbatim.
  assert.equal(stored.boundaryStatement, LAB_TO_STUDIO_BOUNDARY_STATEMENT);
  assert.match(stored.boundaryStatement, /§24 boundary chain/);
  // Exact-version reads resolve; unknown versions do not.
  assert.ok(store.getEntry(scopeOf("tenant-a"), "entry-1", 1) !== undefined);
  assert.equal(store.getEntry(scopeOf("tenant-a"), "entry-1", 99), undefined);
});
