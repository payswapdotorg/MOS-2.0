/**
 * The ten §9 transform pawn bodies (LAB-013): canonical AgentBody contract
 * completeness, role-contract vocabulary, body/role coherence, flavor
 * distribution (eight deterministic, two llm-flavored) and registration
 * through the pawn execution port.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { assertRequiredFields } from "@mos/contracts";

import { TRANSFORM_PAWN_BODIES } from "./bodies/transform-pawn-bodies.js";
import { engineToolRef } from "./contracts/pawn-body.js";
import {
  PAWN_TRANSFORM_KINDS,
  TRANSFORM_PAWN_KINDS,
} from "./contracts/pawn-role.js";
import { PawnExecutionError } from "./domain/errors.js";
import { composePawnStack } from "./testing/compose-pawn-stack.js";

const EXPECTED_KINDS = [
  "clip-selection",
  "hook-extraction",
  "reaction-composition",
  "podcast-interviewer",
  "question-designer",
  "scene-layout",
  "editor",
  "caption",
  "dubbing",
  "quality-critic",
] as const;

test("the ten §9 pawn kinds are declared verbatim and frozen", () => {
  assert.deepEqual([...TRANSFORM_PAWN_KINDS], [...EXPECTED_KINDS]);
  assert.equal(Object.isFrozen(TRANSFORM_PAWN_KINDS), true);
});

test("exactly ten pawn bodies are declared, one per §9 kind", () => {
  assert.equal(TRANSFORM_PAWN_BODIES.length, 10);
  const kinds = TRANSFORM_PAWN_BODIES.map((pawn) => pawn.role.pawnKind);
  assert.deepEqual([...new Set(kinds)].sort(), [...EXPECTED_KINDS].sort());
});

test("every pawn body satisfies the frozen AgentBody contract manifest", () => {
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    assert.doesNotThrow(
      () => assertRequiredFields(pawn.agentBody, "AgentBody"),
      `body ${String(pawn.agentBody.id)} must satisfy the AgentBody manifest`,
    );
  }
});

test("every pawn role serves only the thirteen frozen transform kinds", () => {
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    assert.ok(pawn.role.servedTransformKinds.length > 0, "served kinds must be non-empty");
    for (const kind of pawn.role.servedTransformKinds) {
      assert.ok(
        (PAWN_TRANSFORM_KINDS as readonly string[]).includes(kind),
        `kind ${kind} must be among the thirteen`,
      );
    }
    assert.ok(pawn.role.servedCapabilities.length > 0, "served capabilities must be non-empty");
  }
});

test("eight deterministic pawns and two llm-flavored pawns", () => {
  const flavors = TRANSFORM_PAWN_BODIES.map((pawn) => pawn.role.modelFlavor);
  assert.equal(flavors.filter((flavor) => flavor === "deterministic").length, 8);
  assert.equal(flavors.filter((flavor) => flavor === "llm-flavored").length, 2);
  const llmKinds = TRANSFORM_PAWN_BODIES
    .filter((pawn) => pawn.role.modelFlavor === "llm-flavored")
    .map((pawn) => pawn.role.pawnKind)
    .sort();
  assert.deepEqual(llmKinds, ["podcast-interviewer", "question-designer"]);
});

test("body capabilities equal served capabilities; tools are the derived engine tool refs", () => {
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    assert.deepEqual(
      [...(pawn.agentBody.capabilities as readonly string[])].sort(),
      [...(pawn.role.servedCapabilities as readonly string[])].sort(),
    );
    for (const binding of pawn.role.engineTools) {
      assert.ok(
        (pawn.role.servedCapabilities as readonly string[]).includes(binding.capabilityId as string),
        `engine tool capability ${binding.capabilityId as string} must be served`,
      );
      assert.ok(
        (pawn.agentBody.tools as readonly string[]).includes(engineToolRef(binding)),
        "the derived engine tool ref must be among the body tools",
      );
    }
  }
});

test("every pawn body declares the AGENTS.md safety prohibitions", () => {
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    const prohibitions = pawn.agentBody.safety.prohibitions as readonly string[];
    for (const prohibition of [
      "fake-engagement",
      "coordinated-inauthentic-behavior",
      "anti-abuse-bypass",
      "impersonation",
      "fabricated-testimonials",
      "deceptive-attribution",
      "rights-circumvention",
    ]) {
      assert.ok(prohibitions.includes(prohibition), `must prohibit ${prohibition}`);
    }
  }
});

test("registering all ten bodies through the port lists them all", () => {
  const stack = composePawnStack();
  const registered = stack.execution.listPawnBodies();
  assert.equal(registered.length, 10);
  const byKind = new Map(registered.map((pawn) => [pawn.role.pawnKind, pawn]));
  assert.ok(byKind.get("quality-critic") !== undefined);
  assert.equal(
    (byKind.get("quality-critic")?.role.servedTransformKinds.length ?? 0),
    13,
    "the quality critic serves every transform kind",
  );
});

test("duplicate pawn body registration fails closed", () => {
  const stack = composePawnStack();
  const [first] = TRANSFORM_PAWN_BODIES;
  assert.ok(first !== undefined);
  assert.throws(
    () => stack.execution.registerPawnBody(first),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "duplicate-pawn-body",
  );
});

test("an incoherent pawn body (capabilities disagree with the role) is rejected", () => {
  const stack = composePawnStack();
  const [template] = TRANSFORM_PAWN_BODIES;
  assert.ok(template !== undefined);
  const incoherent = {
    role: template.role,
    agentBody: {
      ...template.agentBody,
      id: "pawn:incoherent" as never,
      capabilities: ["some_other_capability" as never],
    },
  };
  assert.throws(
    () => stack.execution.registerPawnBody(incoherent),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "invalid-pawn-body",
  );
});

test("a pawn body violating the frozen AgentBody manifest is rejected", () => {
  const stack = composePawnStack();
  const [template] = TRANSFORM_PAWN_BODIES;
  assert.ok(template !== undefined);
  const { safety, ...withoutSafety } = template.agentBody;
  void safety;
  assert.throws(
    () => stack.execution.registerPawnBody({ role: template.role, agentBody: withoutSafety as never }),
    (error: unknown) =>
      error instanceof PawnExecutionError && error.code === "invalid-pawn-body",
  );
});
