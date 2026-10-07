/**
 * TransformPawnOrganization composition (LAB-013): multiple pawns composed
 * as a canonical AgentOrganization over the @mos/contracts organization
 * types (compose, never re-implement); deterministic nodes carry NO model
 * assignment and llm-flavored nodes carry exactly one (§9 discipline);
 * append-only versioned registry, tenant scoping, deep-frozen records and
 * named fail-closed rejections.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PawnExecutionError } from "./domain/errors.js";
import {
  SCOPE_ALPHA,
  SCOPE_BETA,
  SOURCE_VIDEO_REF,
  composePawnStack,
} from "./testing/compose-pawn-stack.js";
import type { ComposeTransformPawnOrganizationInput } from "./contracts/pawn-organization.js";

const MODEL = "mos-model:pawn-default" as never;

function organizationInput(
  overrides: Partial<ComposeTransformPawnOrganizationInput> = {},
): ComposeTransformPawnOrganizationInput {
  return {
    scope: SCOPE_ALPHA,
    organizationId: "org:pawn-pipeline" as never,
    nodes: [
      { nodeId: "selector", pawnKind: "clip-selection" },
      { nodeId: "designer", pawnKind: "question-designer" },
      { nodeId: "critic", pawnKind: "quality-critic" },
    ],
    edges: [
      { fromNodeId: "selector", toNodeId: "designer", kind: "communicates-with" },
      { fromNodeId: "designer", toNodeId: "critic", kind: "delegates-to" },
    ],
    modelAssignments: [{ nodeId: "designer", modelRef: MODEL }],
    evaluator: "evaluator:org/pawn-pipeline",
    ...overrides,
  };
}

test("a multi-pawn organization composes over the canonical organization field set", () => {
  const stack = composePawnStack();
  const record = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, organizationInput());

  // The canonical AgentOrganization field set (nodes/edges/modelAssignments/
  // memoryPolicy/budgetPolicy/terminationPolicy/evaluator) is composed —
  // nodes cite the REGISTERED pawn bodies' agent-body ids.
  assert.equal(record.version, 1);
  assert.equal(record.tenantId, SCOPE_ALPHA.tenantId);
  assert.deepEqual(
    record.nodes.map((node) => node.nodeId),
    ["selector", "designer", "critic"],
  );
  assert.deepEqual(
    record.nodes.map((node) => node.bodyId),
    ["pawn:clip-selection", "pawn:question-designer", "pawn:quality-critic"],
  );
  assert.equal(record.edges.length, 2);
  assert.equal(record.edges[1]?.kind, "delegates-to");
  // The llm-flavored node carries exactly ONE model assignment (as DATA).
  assert.deepEqual(record.modelAssignments, [{ nodeId: "designer", modelRef: MODEL }]);
  assert.equal(record.memoryPolicy.scope, "none");
  assert.equal(record.budgetPolicy.organization.maxCost.currency, "USD");
  assert.equal(record.terminationPolicy.maxIterations, 8);
  assert.equal(record.evaluator, "evaluator:org/pawn-pipeline");
});

test("a DETERMINISTIC node with a model assignment is a typed rejection (§9)", () => {
  const stack = composePawnStack();
  assert.throws(
    () =>
      stack.organizations.registerPawnOrganization(SCOPE_ALPHA, {
        ...organizationInput(),
        modelAssignments: [
          { nodeId: "selector", modelRef: MODEL },
          { nodeId: "designer", modelRef: MODEL },
        ],
      }),
    (error: unknown) =>
      error instanceof PawnExecutionError &&
      error.code === "invalid-pawn-organization" &&
      error.message.includes("model-assignment-for-deterministic-pawn"),
  );
});

test("an llm-flavored node WITHOUT a model assignment is a typed rejection", () => {
  const stack = composePawnStack();
  assert.throws(
    () =>
      stack.organizations.registerPawnOrganization(SCOPE_ALPHA, {
        ...organizationInput(),
        modelAssignments: undefined,
      }),
    (error: unknown) =>
      error instanceof PawnExecutionError &&
      error.code === "invalid-pawn-organization" &&
      error.message.includes("missing-model-assignment"),
  );
});

test("duplicate model assignments on one node are rejected", () => {
  const stack = composePawnStack();
  assert.throws(
    () =>
      stack.organizations.registerPawnOrganization(SCOPE_ALPHA, {
        ...organizationInput(),
        modelAssignments: [
          { nodeId: "designer", modelRef: MODEL },
          { nodeId: "designer", modelRef: "mos-model:other" as never },
        ],
      }),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.message.includes("duplicate-model-assignment"),
  );
});

test("structural rejections are named: empty, unknown kind, unknown edge node, self edge, cycle", () => {
  const stack = composePawnStack();
  const expectReason = (input: ComposeTransformPawnOrganizationInput, code: string): void => {
    assert.throws(
      () => stack.organizations.registerPawnOrganization(SCOPE_ALPHA, input),
      (error: unknown) =>
        error instanceof PawnExecutionError && error.message.includes(code),
      `${code} must be named in the rejection`,
    );
  };
  expectReason(organizationInput({ nodes: [] }), "empty-organization");
  expectReason(
    organizationInput({ nodes: [{ nodeId: "x", pawnKind: "nonexistent" as never }] }),
    "unknown-pawn-kind",
  );
  expectReason(
    organizationInput({
      nodes: [{ nodeId: "selector", pawnKind: "clip-selection" }],
      edges: [{ fromNodeId: "selector", toNodeId: "ghost", kind: "delegates-to" }],
      modelAssignments: [],
    }),
    "unknown-edge-node",
  );
  expectReason(
    organizationInput({
      nodes: [{ nodeId: "selector", pawnKind: "clip-selection" }],
      edges: [{ fromNodeId: "selector", toNodeId: "selector", kind: "communicates-with" }],
      modelAssignments: [],
    }),
    "self-referencing-edge",
  );
  expectReason(
    organizationInput({
      nodes: [
        { nodeId: "a", pawnKind: "clip-selection" },
        { nodeId: "b", pawnKind: "editor" },
      ],
      edges: [
        { fromNodeId: "a", toNodeId: "b", kind: "delegates-to" },
        { fromNodeId: "b", toNodeId: "a", kind: "delegates-to" },
      ],
      modelAssignments: [],
    }),
    "delegation-cycle",
  );
  expectReason(
    organizationInput({ edges: [{ fromNodeId: "selector", toNodeId: "designer", kind: "wild" as never }] }),
    "invalid-edge-kind",
  );
  expectReason(organizationInput({ evaluator: "" }), "invalid-evaluator");
});

test("the organization registry is append-only: revision appends v2, prior versions stay bit-for-bit", () => {
  const stack = composePawnStack();
  const first = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, organizationInput());
  const second = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, {
    ...organizationInput(),
    nodes: [
      { nodeId: "selector", pawnKind: "clip-selection" },
      { nodeId: "designer", pawnKind: "question-designer" },
    ],
    edges: [{ fromNodeId: "selector", toNodeId: "designer", kind: "communicates-with" }],
  });

  assert.equal(second.version, 2);
  // Prior version stays resolvable and bit-for-bit unchanged.
  const reread = stack.organizations.getPawnOrganization(
    SCOPE_ALPHA,
    first.id,
    first.version,
  );
  assert.ok(reread !== undefined);
  assert.deepEqual(reread, first);
  assert.equal(reread.nodes.length, 3);
  // Latest resolution wins; the registry lists the latest per organization.
  const latest = stack.organizations.getPawnOrganization(SCOPE_ALPHA, first.id);
  assert.ok(latest !== undefined);
  assert.equal(latest.version, 2);
  assert.equal(stack.organizations.listPawnOrganizations(SCOPE_ALPHA).length, 1);
});

test("organization records are DEEP-frozen (nested node/edge/assignment mutation throws)", () => {
  const stack = composePawnStack();
  const record = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, organizationInput());
  assert.throws(() => {
    (record.nodes[0] as { bodyId: string }).bodyId = "pawn:smuggled";
  }, TypeError);
  assert.throws(() => {
    (record.edges[0] as { kind: string }).kind = "smuggled";
  }, TypeError);
  assert.throws(() => {
    (record.modelAssignments[0] as { modelRef: string }).modelRef = "mos-model:smuggled" as never;
  }, TypeError);
  assert.throws(() => {
    (record.budgetPolicy as { organization: { maxCost: { amount: number } } }).organization.maxCost.amount = 999;
  }, TypeError);
  assert.throws(() => {
    (record.nodes as unknown as { push: (x: unknown) => number }).push({ nodeId: "x", bodyId: "y" });
  }, TypeError);
});

test("organizations are tenant-scoped with no existence leaks", () => {
  const stack = composePawnStack();
  const record = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, organizationInput());
  assert.equal(stack.organizations.getPawnOrganization(SCOPE_BETA, record.id), undefined);
  assert.deepEqual(stack.organizations.listPawnOrganizations(SCOPE_BETA), []);
  // Another tenant registers under the same id in its own namespace.
  const betaRecord = stack.organizations.registerPawnOrganization(SCOPE_BETA, {
    ...organizationInput(),
    scope: SCOPE_BETA,
    nodes: [{ nodeId: "selector", pawnKind: "clip-selection" }],
    edges: [],
    modelAssignments: [],
  });
  assert.equal(betaRecord.tenantId, SCOPE_BETA.tenantId);
  assert.equal(stack.organizations.getPawnOrganization(SCOPE_BETA, betaRecord.id)?.version, 1);
  // The alpha organization is untouched by the beta registration.
  assert.equal(stack.organizations.getPawnOrganization(SCOPE_ALPHA, record.id)?.version, 1);
});

test("a pawn execution inside an organization cites its version on the §30 record", async () => {
  const stack = composePawnStack();
  const organization = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, organizationInput());
  const instance = stack.execution.instantiatePawn(SCOPE_ALPHA, { pawnKind: "clip-selection" });
  const record = await stack.execution.executePawn(SCOPE_ALPHA, {
    instanceId: instance.instanceId,
    transformApplication: { definitionId: "transform:clip-highlights" as never, definitionVersion: 1 as never },
    inputArtifactRefs: [SOURCE_VIDEO_REF],
    parameters: { clipCount: 2 },
    seed: 3,
    actor: { kind: "identity", principalId: "identity:producer-1" },
    engineResourceLimits: { cpuCores: 2, gpuUnits: 0, memoryMb: 512, timeoutMs: 60_000 },
    organization: { organizationId: organization.id, version: organization.version },
  });
  assert.equal(record.lifecycle, "succeeded");
  assert.deepEqual(record.organization, {
    organizationId: organization.id,
    version: organization.version,
  });
});

test("pawn membership: every §9 pawn kind can serve as an organization node", () => {
  const stack = composePawnStack();
  const record = stack.organizations.registerPawnOrganization(SCOPE_ALPHA, {
    scope: SCOPE_ALPHA,
    organizationId: "org:all-pawns" as never,
    nodes: [
      { nodeId: "n1", pawnKind: "clip-selection" },
      { nodeId: "n2", pawnKind: "hook-extraction" },
      { nodeId: "n3", pawnKind: "reaction-composition" },
      { nodeId: "n4", pawnKind: "podcast-interviewer" },
      { nodeId: "n5", pawnKind: "question-designer" },
      { nodeId: "n6", pawnKind: "scene-layout" },
      { nodeId: "n7", pawnKind: "editor" },
      { nodeId: "n8", pawnKind: "caption" },
      { nodeId: "n9", pawnKind: "dubbing" },
      { nodeId: "n10", pawnKind: "quality-critic" },
    ],
    edges: [
      { fromNodeId: "n4", toNodeId: "n5", kind: "communicates-with" },
      { fromNodeId: "n5", toNodeId: "n10", kind: "delegates-to" },
    ],
    modelAssignments: [
      { nodeId: "n4", modelRef: MODEL },
      { nodeId: "n5", modelRef: MODEL },
    ],
    evaluator: "evaluator:org/all-pawns",
  });
  assert.equal(record.nodes.length, 10);
  assert.equal(record.modelAssignments.length, 2);
});
