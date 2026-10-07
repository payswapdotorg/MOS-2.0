/**
 * Tests for the in-memory capability registry (CAP-001).
 *
 * Covers: registration, version resolution, version history preservation,
 * fail-closed unknown capability, immutability rules, and contract-shape
 * validation at the registration gate.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hasRequiredFields } from "@mos/contracts";
import type { Capability, CapabilityId, Version } from "@mos/contracts";

import {
  CapabilityAlreadyRegisteredError,
  CapabilityVersionNotMonotonicError,
  InvalidCapabilityRecordError,
  UnknownCapabilityError,
} from "../errors.js";
import { createInMemoryCapabilityRegistry } from "./in-memory-capability-registry.js";
import { SEED_CAPABILITY_CATALOG } from "../fixtures/seed-capabilities.js";

function makeCapability(
  id: string,
  version: number,
  overrides: Partial<Capability> = {},
): Capability {
  return {
    id: id as CapabilityId,
    version: version as Version,
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    evaluator: `evaluator:${id}@1` as Capability["evaluator"],
    costModel: { basis: "per-invocation", amount: 0.01, currency: "USD" },
    latencyModel: { p50Ms: 100, p95Ms: 200, p99Ms: 400 },
    provenance: `provenance:capability:${id}@1` as Capability["provenance"],
    ...overrides,
  };
}

test("registration and exact-version resolution round-trip", () => {
  const registry = createInMemoryCapabilityRegistry();
  const v1 = makeCapability("transcribe_audio", 1);
  registry.register(v1);

  const resolved = registry.get("transcribe_audio" as CapabilityId, 1 as Version);
  assert.deepEqual(resolved, v1);
  assert.deepEqual(registry.listCapabilityIds(), ["transcribe_audio"]);
});

test("version resolution: latest, exact old version, ascending history", () => {
  const registry = createInMemoryCapabilityRegistry();
  const v1 = makeCapability("semantic_video_relevance", 1);
  const v2 = makeCapability("semantic_video_relevance", 2, {
    inputSchema: { type: "object", additionalProperties: false },
  });
  registry.register(v1);
  registry.register(v2);

  assert.deepEqual(
    registry.getLatest("semantic_video_relevance" as CapabilityId),
    v2,
  );
  // Version history preserved: the old version remains resolvable.
  assert.deepEqual(
    registry.get("semantic_video_relevance" as CapabilityId, 1 as Version),
    v1,
  );
  assert.deepEqual(
    registry.listVersions("semantic_video_relevance" as CapabilityId),
    [1, 2],
  );
});

test("unknown capability fails closed", () => {
  const registry = createInMemoryCapabilityRegistry();
  const unknown = "no_such_capability" as CapabilityId;

  assert.equal(registry.get(unknown, 1 as Version), undefined);
  assert.equal(registry.getLatest(unknown), undefined);
  assert.deepEqual(registry.listVersions(unknown), []);

  assert.throws(
    () => registry.require(unknown),
    (error: unknown) =>
      error instanceof UnknownCapabilityError &&
      error.code === "unknown-capability" &&
      error.capabilityId === "no_such_capability" &&
      error.version === undefined,
  );

  registry.register(makeCapability("transcribe_audio", 1));
  assert.throws(
    () => registry.require("transcribe_audio" as CapabilityId, 7 as Version),
    (error: unknown) =>
      error instanceof UnknownCapabilityError &&
      error.code === "unknown-capability" &&
      error.capabilityId === "transcribe_audio" &&
      error.version === 7,
  );
  // Latest-version require works without a version argument.
  assert.equal(
    registry.require("transcribe_audio" as CapabilityId).version,
    1 as Version,
  );
});

test("duplicate id+version registration is rejected (records are immutable)", () => {
  const registry = createInMemoryCapabilityRegistry();
  registry.register(makeCapability("detect_scenes", 1));
  assert.throws(
    () => registry.register(makeCapability("detect_scenes", 1)),
    (error: unknown) =>
      error instanceof CapabilityAlreadyRegisteredError &&
      error.code === "capability-already-registered" &&
      error.capabilityId === "detect_scenes" &&
      error.version === 1,
  );
});

test("non-monotonic version append is rejected", () => {
  const registry = createInMemoryCapabilityRegistry();
  registry.register(makeCapability("detect_scenes", 2));
  assert.throws(
    () => registry.register(makeCapability("detect_scenes", 1)),
    (error: unknown) =>
      error instanceof CapabilityVersionNotMonotonicError &&
      error.code === "capability-version-not-monotonic" &&
      error.attemptedVersion === 1 &&
      error.latestVersion === 2,
  );
});

test("registration gate validates the Capability contract shape (fail-closed)", () => {
  const registry = createInMemoryCapabilityRegistry();
  const incomplete = {
    id: "broken_capability",
    version: 1,
    inputSchema: { type: "object" },
    // outputSchema, evaluator, costModel, latencyModel, provenance missing
  } as unknown as Capability;
  assert.throws(
    () => registry.register(incomplete),
    (error: unknown) =>
      error instanceof InvalidCapabilityRecordError &&
      error.code === "invalid-capability-record" &&
      /missing required fields/.test(error.message),
  );
  // Nothing was registered.
  assert.deepEqual(registry.listCapabilityIds(), []);
});

test("registered records are frozen and registry contents immutable", () => {
  const registry = createInMemoryCapabilityRegistry();
  const record = makeCapability("render_timeline", 1);
  registry.register(record);
  assert.throws(() => {
    "use strict";
    const stored = registry.get("render_timeline" as CapabilityId, 1 as Version);
    (stored as { evaluator: string }).evaluator = "tampered";
  }, TypeError);
});

test("seed catalog: all §5 example capabilities register and resolve", () => {
  const registry = createInMemoryCapabilityRegistry({
    initial: SEED_CAPABILITY_CATALOG,
  });

  const expectedIds = [
    "transcribe_audio",
    "transcribe_video",
    "detect_scenes",
    "diarize_speakers",
    "rank_clip_candidates",
    "segment_person",
    "semantic_video_relevance",
    "generate_questions",
    "generate_voice",
    "animate_avatar",
    "compose_reaction",
    "render_timeline",
    "realtime_room",
    "generate_video",
    "evaluate_content",
  ];
  assert.equal(SEED_CAPABILITY_CATALOG.length, 15);
  assert.deepEqual(registry.listCapabilityIds(), expectedIds);

  for (const capability of SEED_CAPABILITY_CATALOG) {
    assert.equal(hasRequiredFields(capability, "Capability"), true);
    assert.deepEqual(registry.getLatest(capability.id), capability);
    assert.deepEqual(
      registry.get(capability.id, capability.version),
      capability,
    );
    assert.ok(
      capability.provenance.startsWith("provenance:seed-catalog:"),
      "seed records carry the seed provenance marker",
    );
  }
});
