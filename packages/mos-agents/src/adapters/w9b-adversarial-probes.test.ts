/**
 * W9-B adversarial regression probes (production/engine/security sweep) —
 * the @mos/agents registries.
 *
 * Attack probes, shaped the way a hostile caller or a future bug would:
 *
 *  - nested-mutation corruption (the W5-A/W6-A/W8-A defect class): the
 *    caller mutating its OWN body/organization declaration AFTER
 *    registration must never rewrite the STORED record — the body
 *    registry's shallow `Object.freeze({...body})` and the organization
 *    registry's unfrozen policy objects were REAL defects this sweep
 *    found and fixed (clone-then-deep-freeze); these probes are the
 *    pinning tests;
 *  - freeze-in-place side effects: the caller's declaration objects are
 *    never frozen by the authority (ownership stays with the caller);
 *  - hostile id factories (the W3-A branch-bleed class): delimiter-laden
 *    tenant ids never alias another tenant's organization records (§31).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AgentBody, ModelRef, TenantId, TenantScope, Version } from "@mos/contracts";

import { createInMemoryAgentBodyRegistry } from "./in-memory-agent-body-registry.js";
import { createInMemoryOrganizationRegistry } from "./in-memory-organization-registry.js";
import type { AgentOrganizationRecord } from "../domain/organization.js";

const bodyId = (value: string) => value as AgentBody["id"];
const version = (value: number) => value as Version;
const tenantId = (value: string) => value as TenantId;
const modelRef = (value: string) => value as ModelRef;
const scopeFor = (value: string): TenantScope => ({ tenantId: tenantId(value) });

const bodyBase = {
  id: bodyId("w9b-probe-pawn"),
  version: version(1),
  roleContract: { summary: "Probe body.", duties: ["Hold still"] },
  inputContract: { type: "object", properties: { candidates: { type: "array" } } },
  outputContract: { type: "object", properties: { ranked: { type: "array" } } },
  tools: ["tool:probe"],
  permissions: ["permission:probe"],
  memory: { scope: "session" },
  communication: { mayInitiate: false, allowedTopics: ["probes"] },
  actionInterface: { actions: ["probe"] },
  capabilities: [],
  budget: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 60_000 },
  latency: { p50Ms: 1, p95Ms: 2, p99Ms: 3 },
  evaluator: "evaluator:probe",
  safety: { prohibitions: ["fake-engagement"] },
};

function makeBody(): AgentBody {
  return structuredClone(bodyBase) as unknown as AgentBody;
}

function makeBodyRegistry(): ReturnType<typeof createInMemoryAgentBodyRegistry> {
  return createInMemoryAgentBodyRegistry({
    initial: [
      bodyBase as unknown as AgentBody,
      {
        ...bodyBase,
        id: bodyId("w9b-probe-critic"),
        evaluator: "evaluator:probe-critic",
      } as unknown as AgentBody,
    ],
  });
}

const orgBase = {
  id: "org:w9b-probe" as AgentOrganizationRecord["id"],
  version: version(1),
  tenantId: tenantId("tenant-a"),
  nodes: [
    { nodeId: "probe", bodyId: bodyId("w9b-probe-pawn"), role: "probe" },
    { nodeId: "critic", bodyId: bodyId("w9b-probe-critic"), role: "critic" },
  ],
  edges: [{ fromNodeId: "probe", toNodeId: "critic", kind: "delegates-to" as const }],
  modelAssignments: [
    { nodeId: "probe", modelRef: modelRef("model:probe") },
    { nodeId: "critic", modelRef: modelRef("model:probe") },
  ],
  memoryPolicy: { scope: "session" as const, sharing: "isolated" as const },
  budgetPolicy: {
    organization: { maxCost: { amount: 10, currency: "USD" }, maxDurationMs: 600_000 },
    perNode: { maxCost: { amount: 5, currency: "USD" }, maxDurationMs: 300_000 },
  },
  terminationPolicy: { maxIterations: 5, timeoutMs: 600_000 },
  evaluator: "evaluator:org-probe",
};

function makeOrg(): AgentOrganizationRecord {
  return structuredClone(orgBase) as unknown as AgentOrganizationRecord;
}

// ---------------------------------------------------------------------------
// Body registry: nested-mutation corruption + freeze-in-place
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's body declaration after registration cannot change the stored body", () => {
  const registry = createInMemoryAgentBodyRegistry();
  const body = makeBody();
  registry.register(body);
  const snapshot = JSON.stringify(registry.getLatest(body.id));

  // The attack: rewrite every nested posture the pre-fix record aliased.
  (body.roleContract as unknown as { duties: string[] }).duties = ["Escape the sandbox"];
  (body.budget as { maxDurationMs?: number }).maxDurationMs = Number.POSITIVE_INFINITY;
  (body.safety as unknown as { prohibitions: string[] }).prohibitions = [];
  (body.inputContract as unknown as { properties: Record<string, unknown> }).properties = {};
  (body.tools as unknown as string[]).push("tool:hostile");

  assert.equal(
    JSON.stringify(registry.getLatest(body.id)),
    snapshot,
    "the stored body must be bit-for-bit unchanged",
  );
  const latest = registry.getLatest(body.id);
  assert.ok(latest !== undefined);
  assert.equal((latest.safety as { prohibitions?: string[] }).prohibitions?.length, 1);
});

test("W9-B probe: the stored body is a private deep-frozen copy, not the caller's object", () => {
  const registry = createInMemoryAgentBodyRegistry();
  const body = makeBody();
  registry.register(body);
  const stored = registry.getLatest(body.id);
  assert.ok(stored !== undefined);
  assert.notEqual(stored, body);
  assert.notEqual(stored?.roleContract, body.roleContract);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored?.roleContract));
  assert.ok(Object.isFrozen(stored?.budget));
  const storedBudget = stored?.budget;
  assert.ok(storedBudget !== undefined);
  assert.ok(Object.isFrozen(storedBudget.maxCost));
  // Ownership: the caller's declaration is NOT frozen in place.
  assert.ok(!Object.isFrozen(body));
  assert.ok(!Object.isFrozen(body.roleContract));
  assert.ok(!Object.isFrozen(body.tools));
});

test("W9-B probe: prior body versions stay bit-for-bit after later versions register", () => {
  const registry = createInMemoryAgentBodyRegistry();
  registry.register(makeBody());
  const v1 = registry.get(bodyId("w9b-probe-pawn"), version(1));
  const snapshot = JSON.stringify(v1);

  const v2Body = makeBody();
  (v2Body as { version?: number }).version = version(2);
  (v2Body.roleContract as { summary?: string }).summary = "A different posture.";
  registry.register(v2Body);

  assert.equal(JSON.stringify(registry.get(bodyId("w9b-probe-pawn"), version(1))), snapshot);
  assert.notEqual(
    JSON.stringify(registry.get(bodyId("w9b-probe-pawn"), version(2))),
    snapshot,
  );
});

// ---------------------------------------------------------------------------
// Organization registry: policy-object aliasing + tenant isolation
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's policy objects after registration cannot change the stored organization", () => {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  const org = makeOrg();
  registry.registerOrganization(scopeFor("tenant-a"), org);
  const snapshot = JSON.stringify(
    registry.getOrganization(scopeFor("tenant-a"), org.id, version(1)),
  );

  // The attack: rewrite the policies the pre-fix record embedded by reference.
  (org.memoryPolicy as { scope?: string }).scope = "persistent";
  const orgBudget = (org.budgetPolicy as { organization?: { maxCost?: { amount?: number } } }).organization;
  if (orgBudget !== undefined && orgBudget.maxCost !== undefined) {
    orgBudget.maxCost.amount = 1e9;
  }
  const nodeBudget = (org.budgetPolicy as { perNode?: { maxDurationMs?: number } }).perNode;
  if (nodeBudget !== undefined) {
    nodeBudget.maxDurationMs = Number.POSITIVE_INFINITY;
  }
  (org.terminationPolicy as { maxIterations?: number }).maxIterations = 1e9;
  const firstNode = org.nodes[0] as { role?: string } | undefined;
  if (firstNode !== undefined) {
    firstNode.role = "hostile";
  }

  assert.equal(
    JSON.stringify(registry.getOrganization(scopeFor("tenant-a"), org.id, version(1))),
    snapshot,
    "the stored organization must be bit-for-bit unchanged",
  );
  const stored = registry.getOrganization(scopeFor("tenant-a"), org.id, version(1));
  assert.ok(stored !== undefined);
  assert.equal((stored.memoryPolicy as { scope?: string }).scope, "session");
  const storedOrgBudget = (
    stored.budgetPolicy as { organization?: { maxCost?: { amount?: number } } }
  ).organization;
  assert.equal(storedOrgBudget?.maxCost?.amount, 10);
});

test("W9-B probe: the stored organization is a private deep-frozen copy (policies included)", () => {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  const org = makeOrg();
  registry.registerOrganization(scopeFor("tenant-a"), org);
  const stored = registry.getOrganization(scopeFor("tenant-a"), org.id, version(1));
  assert.ok(stored !== undefined);
  assert.notEqual(stored, org);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored?.memoryPolicy));
  assert.ok(Object.isFrozen(stored?.budgetPolicy));
  assert.ok(Object.isFrozen(stored?.terminationPolicy));
  assert.ok(Object.isFrozen(stored?.nodes));
  // Ownership: the caller's policies are NOT frozen in place.
  assert.ok(!Object.isFrozen(org.memoryPolicy));
  assert.ok(!Object.isFrozen(org.budgetPolicy));
  assert.ok(!Object.isFrozen(org.terminationPolicy));
});

test("W9-B probe: hostile delimiter-laden tenant ids never alias another tenant's organizations", () => {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  const honestScope = scopeFor("tenant-a");
  const hostileScope = scopeFor("tenant-a\u0000org:w9b-probe");

  const honestOrg = makeOrg();
  registry.registerOrganization(honestScope, honestOrg);

  // The hostile tenant registers its OWN organization under a forged id that
  // would collide under a delimiter-concatenated key scheme.
  const hostileOrg = makeOrg();
  (hostileOrg as { id?: unknown }).id = "probe" as AgentOrganizationRecord["id"];
  (hostileOrg as { tenantId?: unknown }).tenantId = hostileScope.tenantId;
  registry.registerOrganization(hostileScope, hostileOrg);

  // Each tenant sees exactly its own organization ids — no bleed either way.
  assert.deepEqual(registry.listOrganizationIds(honestScope), [honestOrg.id]);
  assert.deepEqual(registry.listOrganizationIds(hostileScope), [hostileOrg.id]);
  assert.equal(
    registry.getOrganization(hostileScope, honestOrg.id as AgentOrganizationRecord["id"]),
    undefined,
  );
  assert.equal(
    registry.getOrganization(honestScope, hostileOrg.id as AgentOrganizationRecord["id"]),
    undefined,
  );
  // Cross-tenant requireOrganization fails closed without existence leaks.
  assert.throws(
    () => registry.requireOrganization(hostileScope, honestOrg.id as AgentOrganizationRecord["id"]),
    (error: unknown) => error instanceof Error,
  );
});
