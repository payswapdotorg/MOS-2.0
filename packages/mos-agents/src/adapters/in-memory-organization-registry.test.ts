/**
 * In-memory OrganizationRegistry tests (AGT-003).
 *
 * Covers: build/validate happy path, every named rejection reason (invalid
 * organizations are rejected with ALL reasons), version immutability, old
 * version resolution, topology queries (neighbors + delegation chains,
 * versioned), tenant scoping (cross-tenant fail-closed, no existence
 * leaks), unknown organizations fail closed, frozen + JSON-serializable
 * records (§23: organizations are searchable objects — no hidden state).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AgentBody, ModelRef, TenantId, TenantScope, Version } from "@mos/contracts";

import { createInMemoryAgentBodyRegistry } from "./in-memory-agent-body-registry.js";
import { createInMemoryOrganizationRegistry } from "./in-memory-organization-registry.js";
import type { AgentOrganizationRecord } from "../domain/organization.js";
import type { OrganizationRejectionReason } from "../errors.js";
import {
  AgentOrganizationRegistrationConflictError,
  InvalidAgentOrganizationError,
  UnknownAgentOrganizationError,
  UnknownOrganizationNodeError,
} from "../errors.js";

const bodyId = (value: string) => value as AgentBody["id"];
const version = (value: number) => value as Version;
const tenantId = (value: string) => value as TenantId;
const modelRef = (value: string) => value as ModelRef;
const scopeFor = (value: string): TenantScope => ({ tenantId: tenantId(value) });

const TENANT_A = scopeFor("tenant-a");
const TENANT_B = scopeFor("tenant-b");

const bodyBase = {
  id: bodyId("clip-selection-pawn"),
  version: version(1),
  roleContract: { summary: "Ranks clips.", duties: ["Rank candidate clips"] },
  inputContract: { type: "object", properties: { candidates: { type: "array" } } },
  outputContract: { type: "object", properties: { ranked: { type: "array" } } },
  tools: ["tool:clip-inspector"],
  permissions: ["permission:read-artifacts"],
  memory: { scope: "session" },
  communication: { mayInitiate: false, allowedTopics: ["clip-candidates"] },
  actionInterface: { actions: ["emit-ranked-clips"] },
  capabilities: [],
  budget: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 60_000 },
  latency: { p50Ms: 100, p95Ms: 200, p99Ms: 300 },
  evaluator: "evaluator:clip-selection-quality",
  safety: { prohibitions: ["fake-engagement"] },
};

function makeBodyRegistry(): ReturnType<typeof createInMemoryAgentBodyRegistry> {
  return createInMemoryAgentBodyRegistry({
    initial: [
      bodyBase as unknown as AgentBody,
      { ...bodyBase, id: bodyId("quality-critic-pawn"), evaluator: "evaluator:quality" } as unknown as AgentBody,
    ],
  });
}

const orgBase = {
  id: "org:reaction-pipeline" as AgentOrganizationRecord["id"],
  version: version(1),
  tenantId: tenantId("tenant-a"),
  nodes: [
    { nodeId: "selector", bodyId: bodyId("clip-selection-pawn"), role: "selector" },
    { nodeId: "critic", bodyId: bodyId("quality-critic-pawn"), role: "critic" },
  ],
  edges: [
    { fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" as const },
    { fromNodeId: "critic", toNodeId: "selector", kind: "communicates-with" as const },
  ],
  modelAssignments: [
    { nodeId: "selector", modelRef: modelRef("model:small-fast") },
    { nodeId: "critic", modelRef: modelRef("model:large-deep") },
  ],
  memoryPolicy: { scope: "session" as const, sharing: "isolated" as const },
  budgetPolicy: {
    organization: { maxCost: { amount: 10, currency: "USD" }, maxDurationMs: 600_000 },
    perNode: { maxCost: { amount: 5, currency: "USD" }, maxDurationMs: 300_000 },
  },
  terminationPolicy: { maxIterations: 5, timeoutMs: 600_000 },
  evaluator: "evaluator:org-quality",
};

function makeOrg(overrides: Record<string, unknown> = {}): AgentOrganizationRecord {
  return { ...orgBase, ...overrides } as unknown as AgentOrganizationRecord;
}

function rejectionCodes(error: unknown): string[] {
  assert.ok(error instanceof InvalidAgentOrganizationError);
  return error.reasons.map((reason: OrganizationRejectionReason) => reason.code);
}

function registerOrg(
  overrides: Record<string, unknown> = {},
  scope: TenantScope = TENANT_A,
): ReturnType<typeof createInMemoryOrganizationRegistry> {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  registry.registerOrganization(scope, makeOrg(overrides));
  return registry;
}

test("a valid organization registers, resolves and lists versions", () => {
  const registry = registerOrg();
  const stored = registry.requireOrganization(TENANT_A, orgBase.id);
  assert.equal(stored.version, version(1));
  assert.deepEqual(registry.getOrganization(TENANT_A, orgBase.id), makeOrg());
  assert.deepEqual(registry.listVersions(TENANT_A, orgBase.id), [version(1)]);
  assert.deepEqual(registry.listOrganizationIds(TENANT_A), [orgBase.id]);
});

test("organization records are frozen and JSON-serializable (§23 searchable objects)", () => {
  const registry = registerOrg();
  const stored = registry.requireOrganization(TENANT_A, orgBase.id);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.nodes));
  assert.throws(() => {
    (stored as unknown as Record<string, unknown>).evaluator = "mutated";
  });
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), makeOrg());
});

test("invalid organizations are rejected with every named reason", () => {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  const invalid = makeOrg({
    nodes: [
      { nodeId: "selector", bodyId: bodyId("clip-selection-pawn"), role: "selector" },
      { nodeId: "critic", bodyId: bodyId("quality-critic-pawn"), role: "critic" },
      { nodeId: "planner", bodyId: bodyId("ghost-body"), role: "planner" },
      { nodeId: "planner", bodyId: bodyId("clip-selection-pawn"), role: "duplicate" },
    ],
    edges: [
      { fromNodeId: "selector", toNodeId: "nowhere", kind: "delegates-to" },
      { fromNodeId: "critic", toNodeId: "critic", kind: "reports-to" },
    ],
    modelAssignments: [
      { nodeId: "selector", modelRef: modelRef("model:a") },
      { nodeId: "ghost", modelRef: modelRef("model:b") },
    ],
    evaluator: "",
  });
  assert.throws(
    () => registry.registerOrganization(TENANT_A, invalid),
    (error: unknown) => {
      const codes = rejectionCodes(error);
      assert.ok(codes.includes("unknown-node-body"), "unknown-node-body");
      assert.ok(codes.includes("duplicate-node-id"), "duplicate-node-id");
      assert.ok(codes.includes("unknown-edge-endpoint"), "unknown-edge-endpoint");
      assert.ok(codes.includes("self-referencing-edge"), "self-referencing-edge");
      assert.ok(codes.includes("missing-model-assignment"), "missing-model-assignment");
      assert.ok(codes.includes("unknown-model-assignment-node"), "unknown-model-assignment-node");
      assert.ok(codes.includes("invalid-evaluator"), "invalid-evaluator");
      return true;
    },
  );
});

test("each named rejection reason is exercised individually", () => {
  const cases: readonly [string, Record<string, unknown>, string][] = [
    ["empty organization", { nodes: [] }, "empty-organization"],
    ["missing required field", { terminationPolicy: undefined }, "missing-required-field"],
    [
      "unknown edge kind",
      { edges: [{ fromNodeId: "selector", toNodeId: "critic", kind: "supervises" }] },
      "invalid-edge-kind",
    ],
    [
      "delegation cycle",
      {
        edges: [
          { fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" },
          { fromNodeId: "critic", toNodeId: "selector", kind: "delegates-to" },
        ],
      },
      "delegation-cycle",
    ],
    [
      "reporting cycle",
      {
        edges: [
          { fromNodeId: "selector", toNodeId: "critic", kind: "reports-to" },
          { fromNodeId: "critic", toNodeId: "selector", kind: "reports-to" },
        ],
      },
      "reporting-cycle",
    ],
    [
      "duplicate delegation",
      {
        edges: [
          { fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" },
          { fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" },
        ],
      },
      "duplicate-delegation",
    ],
    [
      "duplicate model assignment",
      {
        modelAssignments: [
          { nodeId: "selector", modelRef: "model:a" },
          { nodeId: "selector", modelRef: "model:b" },
          { nodeId: "critic", modelRef: "model:c" },
        ],
      },
      "duplicate-model-assignment",
    ],
    ["invalid memory policy", { memoryPolicy: { scope: "global", sharing: "shared" } }, "invalid-memory-policy"],
    [
      "per-node budget exceeds organization (cost)",
      {
        budgetPolicy: {
          organization: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 600_000 },
          perNode: { maxCost: { amount: 5, currency: "USD" }, maxDurationMs: 300_000 },
        },
      },
      "budget-per-node-exceeds-organization",
    ],
    [
      "per-node budget exceeds organization (duration)",
      {
        budgetPolicy: {
          organization: { maxCost: { amount: 10, currency: "USD" }, maxDurationMs: 100_000 },
          perNode: { maxCost: { amount: 5, currency: "USD" }, maxDurationMs: 300_000 },
        },
      },
      "budget-per-node-exceeds-organization",
    ],
    ["invalid termination policy", { terminationPolicy: { maxIterations: 0, timeoutMs: 10 } }, "invalid-termination-policy"],
  ];
  for (const [name, overrides, expectedCode] of cases) {
    const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
    assert.throws(
      () => registry.registerOrganization(TENANT_A, makeOrg(overrides)),
      (error: unknown) => rejectionCodes(error).includes(expectedCode),
      `rejection case '${name}' must carry reason ${expectedCode}`,
    );
  }
});

test("tenant scope mismatches are rejected without leaking other tenants", () => {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  assert.throws(
    () => registry.registerOrganization(TENANT_B, makeOrg()),
    (error: unknown) => rejectionCodes(error).includes("invalid-tenant-scope"),
  );
  registry.registerOrganization(TENANT_A, makeOrg());
  // Same organization id under another tenant: fail closed as unknown.
  assert.throws(
    () =>
      registry.registerOrganization(
        TENANT_B,
        makeOrg({ tenantId: tenantId("tenant-b") }),
      ),
    (error: unknown) => error instanceof UnknownAgentOrganizationError,
  );
});

test("cross-tenant reads fail closed without existence leaks", () => {
  const registry = registerOrg();
  assert.equal(registry.getOrganization(TENANT_B, orgBase.id), undefined);
  assert.deepEqual(registry.listVersions(TENANT_B, orgBase.id), []);
  assert.deepEqual(registry.listOrganizationIds(TENANT_B), []);
  assert.throws(
    () => registry.requireOrganization(TENANT_B, orgBase.id),
    (error: unknown) => error instanceof UnknownAgentOrganizationError,
  );
});

test("organization versions are immutable and old versions stay resolvable", () => {
  const registry = registerOrg();
  assert.throws(
    () => registry.registerOrganization(TENANT_A, makeOrg()),
    (error: unknown) =>
      error instanceof AgentOrganizationRegistrationConflictError &&
      error.code === "agent-organization-already-registered",
  );
  registry.registerOrganization(TENANT_A, makeOrg({ version: version(3), evaluator: "evaluator:org-quality-v3" }));
  assert.throws(
    () => registry.registerOrganization(TENANT_A, makeOrg({ version: version(2) })),
    (error: unknown) =>
      error instanceof AgentOrganizationRegistrationConflictError &&
      error.code === "agent-organization-version-not-monotonic",
  );
  assert.deepEqual(registry.listVersions(TENANT_A, orgBase.id), [version(1), version(3)]);
  assert.equal(registry.requireOrganization(TENANT_A, orgBase.id, version(1)).evaluator, "evaluator:org-quality");
  assert.equal(registry.requireOrganization(TENANT_A, orgBase.id).evaluator, "evaluator:org-quality-v3");
});

test("neighbors returns every edge touching a node, in declaration order", () => {
  const registry = registerOrg();
  const criticNeighbors = registry.neighbors(TENANT_A, orgBase.id, "critic");
  assert.deepEqual(criticNeighbors, [
    { fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" },
    { fromNodeId: "critic", toNodeId: "selector", kind: "communicates-with" },
  ]);
  const selectorNeighbors = registry.neighbors(TENANT_A, orgBase.id, "selector");
  assert.equal(selectorNeighbors.length, 2);
  assert.throws(
    () => registry.neighbors(TENANT_A, orgBase.id, "ghost"),
    (error: unknown) => error instanceof UnknownOrganizationNodeError && error.nodeId === "ghost",
  );
});

test("delegation chains follow delegates-to edges and are versioned", () => {
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry: makeBodyRegistry() });
  registry.registerOrganization(TENANT_A, makeOrg());
  registry.registerOrganization(
    TENANT_A,
    makeOrg({
      version: version(2),
      nodes: [
        { nodeId: "selector", bodyId: bodyId("clip-selection-pawn"), role: "selector" },
        { nodeId: "critic", bodyId: bodyId("quality-critic-pawn"), role: "critic" },
        { nodeId: "editor", bodyId: bodyId("clip-selection-pawn"), role: "editor" },
      ],
      edges: [
        { fromNodeId: "selector", toNodeId: "critic", kind: "delegates-to" },
        { fromNodeId: "critic", toNodeId: "editor", kind: "delegates-to" },
      ],
      modelAssignments: [
        { nodeId: "selector", modelRef: "model:small-fast" },
        { nodeId: "critic", modelRef: "model:large-deep" },
        { nodeId: "editor", modelRef: "model:small-fast" },
      ],
    }),
  );
  assert.deepEqual(registry.delegationChain(TENANT_A, orgBase.id, "selector", version(1)), ["selector", "critic"]);
  assert.deepEqual(registry.delegationChain(TENANT_A, orgBase.id, "selector", version(2)), [
    "selector",
    "critic",
    "editor",
  ]);
  assert.deepEqual(registry.delegationChain(TENANT_A, orgBase.id, "editor", version(2)), ["editor"]);
  assert.throws(
    () => registry.delegationChain(TENANT_A, orgBase.id, "ghost", version(2)),
    (error: unknown) => error instanceof UnknownOrganizationNodeError,
  );
});

test("unknown organizations fail closed", () => {
  const registry = registerOrg();
  assert.equal(registry.getOrganization(TENANT_A, "org:ghost" as AgentOrganizationRecord["id"]), undefined);
  assert.throws(
    () => registry.requireOrganization(TENANT_A, "org:ghost" as AgentOrganizationRecord["id"]),
    (error: unknown) => error instanceof UnknownAgentOrganizationError,
  );
  assert.throws(
    () => registry.requireOrganization(TENANT_A, orgBase.id, version(9)),
    (error: unknown) =>
      error instanceof UnknownAgentOrganizationError && error.version === 9,
  );
});
