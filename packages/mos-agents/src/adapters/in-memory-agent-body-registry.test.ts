/**
 * In-memory AgentBodyRegistry tests (AGT-001).
 *
 * Covers: registration + lookup, required-field completeness for EVERY
 * AgentBody field (pinned against the frozen YAML manifest via
 * @mos/contracts), version immutability (duplicate + non-monotonic +
 * old-version resolution), capability ref validation (fail-closed unknown),
 * semantic validation, fail-closed unknowns and frozen records.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTRACT_REQUIRED_FIELDS } from "@mos/contracts";
import type { AgentBody, CapabilityId, Version } from "@mos/contracts";

import { createInMemoryAgentBodyRegistry } from "./in-memory-agent-body-registry.js";
import type { CapabilityRefSource } from "../ports/capability-ref-source.port.js";
import {
  AgentBodyRegistrationConflictError,
  InvalidAgentBodyError,
  UnknownAgentBodyError,
} from "../errors.js";

const bodyId = (value: string) => value as AgentBody["id"];
const version = (value: number) => value as Version;
const capabilityId = (value: string) => value as CapabilityId;

function makeCapabilitySource(
  known: readonly string[],
): CapabilityRefSource {
  const set = new Set(known);
  return {
    getLatest(id: CapabilityId) {
      return set.has(id as string) ? { id } : undefined;
    },
  };
}

const baseBody = {
  id: bodyId("clip-selection-pawn"),
  version: version(1),
  roleContract: {
    summary: "Selects the best clip candidates for a transform.",
    duties: ["Rank candidate clips", "Emit a ranked clip list with reasons"],
  },
  inputContract: { type: "object", properties: { candidates: { type: "array" } } },
  outputContract: { type: "object", properties: { ranked: { type: "array" } } },
  tools: ["tool:clip-inspector"],
  permissions: ["permission:read-artifacts"],
  memory: { scope: "session" },
  communication: { mayInitiate: false, allowedTopics: ["clip-candidates"] },
  actionInterface: { actions: ["emit-ranked-clips"] },
  capabilities: [capabilityId("rank_clip_candidates")],
  budget: { maxCost: { amount: 1, currency: "USD" }, maxDurationMs: 60_000 },
  latency: { p50Ms: 100, p95Ms: 200, p99Ms: 300 },
  evaluator: "evaluator:clip-selection-quality",
  safety: { prohibitions: ["fake-engagement", "deceptive-attribution"] },
};

function makeBody(overrides: Record<string, unknown> = {}): AgentBody {
  return { ...baseBody, ...overrides } as unknown as AgentBody;
}

test("registration resolves by exact version, latest and require", () => {
  const registry = createInMemoryAgentBodyRegistry();
  registry.register(makeBody());

  assert.deepEqual(registry.get(bodyId("clip-selection-pawn"), version(1)), makeBody());
  assert.deepEqual(registry.getLatest(bodyId("clip-selection-pawn")), makeBody());
  assert.deepEqual(registry.require(bodyId("clip-selection-pawn")), makeBody());
  assert.deepEqual(registry.require(bodyId("clip-selection-pawn"), version(1)), makeBody());
  assert.deepEqual(registry.listVersions(bodyId("clip-selection-pawn")), [version(1)]);
});

test("every AgentBody required field is enforced (frozen YAML manifest)", () => {
  const required = CONTRACT_REQUIRED_FIELDS.AgentBody;
  assert.ok(required.length >= 14);
  for (const field of required) {
    const registry = createInMemoryAgentBodyRegistry();
    const record: Record<string, unknown> = { ...baseBody };
    delete record[field];
    assert.throws(
      () => registry.register(record as unknown as AgentBody),
      (error: unknown) =>
        error instanceof InvalidAgentBodyError &&
        error.message.includes(`missing required fields: ${field}`),
      `registering a body without '${field}' must fail closed`,
    );
  }
});

test("body versions are immutable: duplicates and non-monotonic versions rejected", () => {
  const registry = createInMemoryAgentBodyRegistry();
  registry.register(makeBody());

  assert.throws(
    () => registry.register(makeBody()),
    (error: unknown) =>
      error instanceof AgentBodyRegistrationConflictError &&
      error.code === "agent-body-already-registered",
  );
  registry.register(makeBody({ version: version(3) }));
  assert.throws(
    () => registry.register(makeBody({ version: version(2) })),
    (error: unknown) =>
      error instanceof AgentBodyRegistrationConflictError &&
      error.code === "agent-body-version-not-monotonic" &&
      error.attemptedVersion === 2 &&
      error.latestVersion === 3,
  );
});

test("old body versions stay resolvable after a new version is registered", () => {
  const registry = createInMemoryAgentBodyRegistry();
  registry.register(makeBody());
  registry.register(makeBody({ version: version(2), safety: { prohibitions: ["impersonation"] } }));

  assert.deepEqual(registry.listVersions(bodyId("clip-selection-pawn")), [version(1), version(2)]);
  assert.equal(registry.require(bodyId("clip-selection-pawn"), version(1)).safety.prohibitions[0], "fake-engagement");
  assert.equal(registry.require(bodyId("clip-selection-pawn"), version(2)).safety.prohibitions[0], "impersonation");
  assert.equal(registry.require(bodyId("clip-selection-pawn")).version, version(2));
});

test("capability refs are validated against the injected capability source", () => {
  const registry = createInMemoryAgentBodyRegistry({
    capabilitySource: makeCapabilitySource(["rank_clip_candidates"]),
  });
  registry.register(makeBody());

  const unknownRef = makeBody({
    id: bodyId("bad-pawn"),
    capabilities: [capabilityId("no_such_capability")],
  });
  assert.throws(
    () => registry.register(unknownRef),
    (error: unknown) =>
      error instanceof InvalidAgentBodyError &&
      error.message.includes("unknown capability: no_such_capability"),
  );
});

test("semantic validation rejects malformed bodies with named issues", () => {
  const cases: readonly [string, Record<string, unknown>, RegExp][] = [
    ["blank id", { id: "  " }, /id must be a non-blank string/],
    ["zero version", { version: version(0) }, /version must be an integer >= 1/],
    ["empty duties", { roleContract: { summary: "s", duties: [] } }, /at least one duty/],
    ["empty input contract", { inputContract: {} }, /inputContract must be a non-empty schema object/],
    ["bad memory scope", { memory: { scope: "global" } }, /memory.scope/],
    ["bad communication flag", { communication: { mayInitiate: "yes", allowedTopics: [] } }, /mayInitiate/],
    ["bad budget", { budget: { maxCost: { amount: -1, currency: "USD" }, maxDurationMs: 1 } }, /budget.maxCost.amount/],
    ["bad latency ordering", { latency: { p50Ms: 300, p95Ms: 200, p99Ms: 100 } }, /p50Ms <= p95Ms <= p99Ms/],
    ["blank evaluator", { evaluator: "" }, /evaluator must be a non-blank/],
    ["empty safety policy", { safety: { prohibitions: [] } }, /at least one prohibition/],
  ];
  for (const [name, overrides, pattern] of cases) {
    const registry = createInMemoryAgentBodyRegistry();
    assert.throws(
      () => registry.register(makeBody(overrides)),
      (error: unknown) => error instanceof InvalidAgentBodyError && pattern.test(error.message),
      `semantic case '${name}' must fail closed`,
    );
  }
});

test("unknown bodies fail closed", () => {
  const registry = createInMemoryAgentBodyRegistry();
  assert.equal(registry.get(bodyId("ghost"), version(1)), undefined);
  assert.equal(registry.getLatest(bodyId("ghost")), undefined);
  assert.deepEqual(registry.listVersions(bodyId("ghost")), []);
  assert.throws(
    () => registry.require(bodyId("ghost")),
    (error: unknown) =>
      error instanceof UnknownAgentBodyError && error.bodyId === "ghost",
  );
  assert.throws(
    () => registry.require(bodyId("clip-selection-pawn"), version(4)),
    (error: unknown) =>
      error instanceof UnknownAgentBodyError && error.version === 4,
  );
});

test("registered body records are frozen", () => {
  const registry = createInMemoryAgentBodyRegistry();
  registry.register(makeBody());
  const record = registry.require(bodyId("clip-selection-pawn"));
  assert.ok(Object.isFrozen(record));
  assert.throws(() => {
    (record as unknown as Record<string, unknown>).id = bodyId("mutated");
  });
});

test("initial records are registered under the same rules", () => {
  const registry = createInMemoryAgentBodyRegistry({
    capabilitySource: makeCapabilitySource(["rank_clip_candidates"]),
    initial: [makeBody()],
  });
  assert.deepEqual(registry.listVersions(bodyId("clip-selection-pawn")), [version(1)]);
  assert.throws(
    () =>
      createInMemoryAgentBodyRegistry({
        initial: [makeBody({ id: bodyId("dup"), version: version(0) })],
      }),
    (error: unknown) => error instanceof InvalidAgentBodyError,
  );
});
