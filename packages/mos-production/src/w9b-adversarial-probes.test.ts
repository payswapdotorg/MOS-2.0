/**
 * W9-B adversarial regression probes (production/engine/security sweep) —
 * the @mos-production pawn surfaces.
 *
 * Attack probes, shaped the way a hostile caller or a future bug would:
 *
 *  - ownership (the W4-B/W8-A clone-then-freeze class): the pawn body
 *    registry and the transform-source double stored SHALLOW spreads —
 *    the caller's nested objects (role contracts, parameters, budget)
 *    were embedded by reference and frozen IN PLACE; the pawn instance
 *    records embedded the CALLER's scope object (mutating it after
 *    instantiate moved the stored record's tenant identity — §31). The
 *    clone-then-freeze fixes are pinned here;
 *  - hostile id factories (the W3-A class): the transform-source and
 *    pawn-organization registries keyed versions by `\u0000`-delimited
 *    composite keys and LISTED by prefix scan — delimiter-laden tenant
 *    ids aliased/leaked across tenants. JSON array keys + exact-equality
 *    listings are pinned here;
 *  - validation integrity: the pawn body/role capability-agreement check
 *    compared SORTED arrays joined with `\u0000` — capability ids carrying
 *    the delimiter could alias two DIFFERENT sets and slip a mismatched
 *    body past validation. The element-wise comparison is pinned here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { TRANSFORM_PAWN_BODIES } from "./bodies/transform-pawn-bodies.js";
import { transformPawnBodyIssues } from "./domain/pawn-body-validation.js";
import { createInMemoryTransformSource } from "./adapters/in-memory-transform-source.js";
import {
  SCOPE_ALPHA,
  SCOPE_BETA,
  composePawnStack,
} from "./testing/compose-pawn-stack.js";
import type { TransformPawnBody } from "./contracts/pawn-body.js";
import type { TenantScope } from "@mos/contracts";

const NUL = "\u0000";
const scopeOf = (tenantId: string): TenantScope => ({
  tenantId: tenantId as TenantScope["tenantId"],
});

/** A fresh, caller-owned pawn body derived from the clip-selection template. */
function probePawnBody(): TransformPawnBody {
  const template = TRANSFORM_PAWN_BODIES[0];
  assert.ok(template !== undefined, "fixture premise: the clip-selection body exists");
  const pawn = structuredClone(template) as TransformPawnBody;
  (pawn.agentBody as { id?: string }).id = "pawn:w9b-probe";
  return pawn;
}

// ---------------------------------------------------------------------------
// Pawn body registration — ownership (clone-then-freeze pins)
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's pawn declaration after registerPawnBody cannot change the stored pawn", () => {
  const stack = composePawnStack();
  const pawn = probePawnBody();
  stack.execution.registerPawnBody(pawn);
  const stored = stack.execution
    .listPawnBodies()
    .find((body) => (body.agentBody.id as string) === "pawn:w9b-probe");
  assert.ok(stored !== undefined, "fixture premise: the probe body is registered");
  const snapshot = JSON.stringify(stored);

  // The attack: rewrite the caller-retained declaration — nested role and
  // body fields the pre-fix records aliased (and froze in place).
  (pawn.role.servedCapabilities as unknown as string[]).push("smuggled_capability");
  (pawn.agentBody.budget as { maxDurationMs?: number }).maxDurationMs = Number.POSITIVE_INFINITY;
  (pawn.agentBody.safety as { prohibitions?: string[] }).prohibitions = [];

  const reread = stack.execution
    .listPawnBodies()
    .find((body) => (body.agentBody.id as string) === "pawn:w9b-probe");
  assert.ok(reread !== undefined);
  assert.equal(JSON.stringify(reread), snapshot, "the stored pawn body is bit-for-bit unchanged");
  assert.equal(reread.role.servedCapabilities.length, 1);
  // Ownership: the caller's declaration objects were NOT frozen in place.
  assert.ok(!Object.isFrozen(pawn.role));
  assert.ok(!Object.isFrozen(pawn.role.servedCapabilities));
  assert.ok(!Object.isFrozen(pawn.agentBody));
  assert.ok(!Object.isFrozen(pawn.agentBody.budget));
  assert.ok(!Object.isFrozen(pawn.agentBody.safety));
  // The stored record itself is deep-frozen.
  assert.ok(Object.isFrozen(reread));
  assert.ok(Object.isFrozen(reread.role));
  assert.ok(Object.isFrozen(reread.agentBody));
});

// ---------------------------------------------------------------------------
// Pawn instances — the caller's scope object never owns the stored record
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's scope after instantiatePawn cannot move the stored instance to another tenant", () => {
  const stack = composePawnStack();
  const hostileScope = scopeOf("tenant:alpha");
  const instance = stack.execution.instantiatePawn(hostileScope, { pawnKind: "clip-selection" });
  assert.equal(instance.tenantScope.tenantId, SCOPE_ALPHA.tenantId);

  // The attack: rewrite the caller-owned scope AFTER the authority took it —
  // pre-fix, the stored record (and every later transition) aliased it.
  (hostileScope as { tenantId?: string }).tenantId = "tenant:beta";

  const stored = stack.execution.getPawnInstance(SCOPE_ALPHA, instance.instanceId);
  assert.ok(stored !== undefined, "tenant:alpha still resolves the instance");
  assert.equal(stored.tenantScope.tenantId, "tenant:alpha");
  assert.ok(Object.isFrozen(stored.tenantScope), "the record's scope copy is frozen");
  // The FORGED tenant must not adopt the instance (§31 fail-closed).
  assert.equal(stack.execution.getPawnInstance(SCOPE_BETA, instance.instanceId), undefined);
  assert.equal(stack.execution.listPawnInstances(SCOPE_BETA).length, 0);
  // Ownership: the caller's scope object was not frozen in place.
  assert.ok(!Object.isFrozen(hostileScope));
  // Later transitions inherit the discipline (no scope bleed through release).
  const released = stack.execution.releasePawn(SCOPE_ALPHA, instance.instanceId);
  assert.equal(released.tenantScope.tenantId, "tenant:alpha");
  (hostileScope as { tenantId?: string }).tenantId = "tenant:gamma";
  assert.equal(
    stack.execution.getPawnInstance(SCOPE_ALPHA, instance.instanceId)?.tenantScope.tenantId,
    "tenant:alpha",
  );
});

// ---------------------------------------------------------------------------
// Transform-source double — hostile tenant ids + ownership
// ---------------------------------------------------------------------------

function transformSeed(tenantId: string, id: string) {
  return {
    id: id as never,
    tenantId: tenantId as never,
    version: 1 as never,
    kind: "crop-reframe" as const,
    inputTypes: ["video/mp4"],
    outputTypes: ["video/mp4"],
    parameters: { type: "object", properties: { notes: { type: "string" } } },
    capabilityRequirements: [{ capabilityId: "segment_person" as never, version: 1 as never }],
    evaluator: "evaluator:transform/w9b" as never,
    // The REAL frozen CostBasis vocabulary literal (const-asserted so the
    // widened `string` can never smuggle a non-vocabulary basis past the
    // seed's CostModel typing — no cast, the literal must itself be valid).
    costModel: { basis: "per-invocation" as const, amount: 0.1, currency: "USD" },
    latencyModel: { p50Ms: 1_000, p95Ms: 4_000, p99Ms: 9_000 },
    rightsRequirements: [],
    policyRequirements: [],
    lineageRules: [],
  };
}

test("W9-B probe: a hostile delimiter-laden tenant id cannot widen another tenant's transform listing", async () => {
  const source = createInMemoryTransformSource();
  const honest = source.register(transformSeed("tenant:alpha", "transform:w9b"));
  // The hostile tenant id CONCATENATES into the honest tenant's old
  // composite-key PREFIX — the pre-fix listLatest prefix scan leaked the
  // hostile tenant's definitions into the honest tenant's listing.
  const hostile = source.register(
    transformSeed("tenant:alpha" + NUL + "transform:w9b", "transform:hostile"),
  );
  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1, "each tenant owns an independent version chain");

  const honestList = source.listLatest(SCOPE_ALPHA);
  assert.equal(honestList.length, 1);
  assert.equal(honestList[0]?.id, "transform:w9b");
  const hostileList = source.listLatest(scopeOf("tenant:alpha" + NUL + "transform:w9b"));
  assert.equal(hostileList.length, 1);
  assert.equal(hostileList[0]?.id, "transform:hostile");
  // Cross-tenant resolution is indistinguishable from unknown (§31).
  assert.equal(
    await source.resolve(scopeOf("tenant:alpha" + NUL + "transform:w9b"), "transform:w9b" as never),
    null,
  );
});

test("W9-B probe: mutating the caller's transform seed after register cannot change the stored definition", async () => {
  const source = createInMemoryTransformSource();
  const seed = transformSeed("tenant:alpha", "transform:ownership");
  const record = source.register(seed);
  const snapshot = JSON.stringify(record);

  // The attack: rewrite the caller-retained seed objects.
  (seed.parameters as { properties?: Record<string, unknown> }).properties = {};
  (seed.costModel as { amount?: number }).amount = Number.NaN;

  const stored = await source.resolve(SCOPE_ALPHA, "transform:ownership" as never);
  assert.ok(stored !== null);
  assert.equal(JSON.stringify(stored), snapshot, "the stored definition is bit-for-bit unchanged");
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.parameters));
  assert.ok(!Object.isFrozen(seed));
  assert.ok(!Object.isFrozen(seed.parameters));
  assert.ok(!Object.isFrozen(seed.costModel));
});

// ---------------------------------------------------------------------------
// Pawn-organization registry — hostile tenant ids (exact-equality listing)
// ---------------------------------------------------------------------------

function organizationInput(scope: TenantScope, organizationId: string) {
  return {
    scope,
    organizationId: organizationId as never,
    nodes: [
      { nodeId: "selector", pawnKind: "clip-selection" as const },
      { nodeId: "designer", pawnKind: "question-designer" as const },
    ],
    edges: [{ fromNodeId: "selector", toNodeId: "designer", kind: "communicates-with" as const }],
    modelAssignments: [{ nodeId: "designer", modelRef: "mos-model:pawn-default" as never }],
    evaluator: "evaluator:org/w9b-probe",
  };
}

test("W9-B probe: a hostile delimiter-laden tenant id cannot alias another tenant's organization chain or widen its listing", () => {
  const stack = composePawnStack();
  // The W3-A composite-key collision shape: the honest organization id
  // CONTAINS the delimiter, and the hostile tenant id carries its prefix —
  // under the OLD `${tenantId}\u0000${organizationId}` key BOTH registrations
  // landed in ONE chain (the hostile write appended into / corrupted the
  // honest tenant's organization), and the OLD prefix-scan listings leaked
  // each tenant's organizations into the other's listing.
  const hostileScope = scopeOf("tenant:alpha" + NUL + "org");
  const honest = stack.organizations.registerPawnOrganization(
    SCOPE_ALPHA,
    organizationInput(SCOPE_ALPHA, "org" + NUL + "probe"),
  );
  const hostile = stack.organizations.registerPawnOrganization(
    hostileScope,
    organizationInput(hostileScope, "probe"),
  );

  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1, "the hostile write must NOT extend the honest chain");
  // EXACT-equality listing: each scope lists exactly its own organizations.
  const honestList = stack.organizations.listPawnOrganizations(SCOPE_ALPHA);
  assert.equal(honestList.length, 1);
  assert.equal(honestList[0]?.id, honest.id);
  assert.equal(honestList[0]?.tenantId, SCOPE_ALPHA.tenantId);
  const hostileList = stack.organizations.listPawnOrganizations(hostileScope);
  assert.equal(hostileList.length, 1);
  assert.equal(hostileList[0]?.id, hostile.id);
  assert.equal(hostileList[0]?.tenantId, hostileScope.tenantId);
  // Cross-tenant reads are indistinguishable from unknown (§31) — the ids
  // are distinct per tenant, so neither scope resolves the other's record.
  assert.equal(stack.organizations.getPawnOrganization(hostileScope, honest.id), undefined);
  assert.equal(stack.organizations.getPawnOrganization(SCOPE_ALPHA, hostile.id), undefined);
});

// ---------------------------------------------------------------------------
// Pawn-body validation — delimiter-join capability-set collision
// ---------------------------------------------------------------------------

test("W9-B probe: capability sets that collide under a delimiter join are still recognized as UNEQUAL (element-wise)", () => {
  const template = TRANSFORM_PAWN_BODIES[0];
  assert.ok(template !== undefined);
  // Two DIFFERENT capability sets whose sorted `\u0000`-joins are IDENTICAL:
  // ["cap_a", "cap_b\u0000cap_c"] joins to "cap_a\u0000cap_b\u0000cap_c" and
  // ["cap_a\u0000cap_b", "cap_c"] joins to the same string. The pre-fix join
  // comparison let this mismatched body PASS validation.
  const pawn = structuredClone(template) as TransformPawnBody;
  (pawn.role as unknown as { servedCapabilities: string[] }).servedCapabilities = [
    "cap_a",
    "cap_b" + NUL + "cap_c",
  ];
  (pawn.agentBody as unknown as { capabilities: string[] }).capabilities = [
    "cap_a" + NUL + "cap_b",
    "cap_c",
  ];
  (pawn.role as unknown as { engineTools: unknown[] }).engineTools = [];

  const issues = transformPawnBodyIssues(pawn);
  assert.ok(
    issues.some((issue) => issue.includes("must equal role.servedCapabilities")),
    `the agreement check must fire for join-colliding sets (issues: ${issues.join("; ")})`,
  );

  // Control: the SAME sets element-wise pass (the comparison is not
  // over-strict — only genuinely different sets are rejected).
  const coherent = structuredClone(template) as TransformPawnBody;
  (coherent.role as unknown as { servedCapabilities: string[] }).servedCapabilities = [
    "cap_a",
    "cap_b" + NUL + "cap_c",
  ];
  (coherent.agentBody as unknown as { capabilities: string[] }).capabilities = [
    "cap_b" + NUL + "cap_c",
    "cap_a",
  ];
  (coherent.role as unknown as { engineTools: unknown[] }).engineTools = [];
  const coherentIssues = transformPawnBodyIssues(coherent);
  assert.ok(
    !coherentIssues.some((issue) => issue.includes("must equal role.servedCapabilities")),
    `order-insensitive equality still holds (issues: ${coherentIssues.join("; ")})`,
  );
});
