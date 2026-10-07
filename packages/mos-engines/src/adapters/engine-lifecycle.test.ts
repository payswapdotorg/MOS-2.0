/**
 * Engine lifecycle tests (ENG-001): tenant overrides, the silent-replacement
 * guard with explicit replacement records, same-engine version bumps,
 * rollback by engine version, historical reproducibility, deactivation, and
 * fail-closed capability-registry wiring.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { CapabilityId, EngineId, TenantId, Timestamp, Version } from "@mos/contracts";
import { UnknownCapabilityError } from "@mos/capabilities";
import { createInMemoryCapabilityRegistry } from "@mos/capabilities";
import { SEED_CAPABILITY_CATALOG } from "@mos/capabilities";

import type { EngineActivationEvidence } from "../domain/activation.js";
import { EngineRegistryError } from "../domain/errors.js";
import { createInMemoryEngineRegistry } from "./in-memory-engine-registry.js";
import type { EngineRegistryPort } from "../ports/engine-registry.port.js";
import {
  makeActivationEvidence,
  makeEngineManifest,
} from "../fixtures/test-engine-manifests.js";

const CAP = "semantic_video_relevance" as CapabilityId;
const FIXED_CLOCK = () => "2026-01-01T00:00:00.000Z" as Timestamp;

function registry() {
  return createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
}

function registerAndActivate(
  engineRegistry: EngineRegistryPort,
  manifest: ReturnType<typeof makeEngineManifest>,
  evidence: EngineActivationEvidence = makeActivationEvidence(manifest),
) {
  engineRegistry.registerEngine(manifest);
  return engineRegistry.activateEngine(
    manifest.id,
    manifest.version,
    evidence,
  );
}

// ---------------------------------------------------------------------------
// Tenant overrides
// ---------------------------------------------------------------------------

test("tenant override pins an engine version for one tenant without touching the default lane", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", benchmarkScore: 0.9 }));
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:b", benchmarkScore: 0.7 }));

  const tenantId = "tenant:one" as TenantId;
  const resolution = engineRegistry.resolveCapability(CAP, {
    tenantId,
    tenantOverride: { engineId: "engine:b" as EngineId, engineVersion: 1 as Version },
  });
  assert.equal(resolution.resolvedVia, "tenant-override");
  assert.equal(resolution.engine.id, "engine:b");
  assert.equal(resolution.assignment.via, "tenant-override");
  assert.equal(resolution.assignment.tenantId, tenantId);

  // Default lane is untouched and still resolves deterministically.
  const defaultResolution = engineRegistry.resolveCapability(CAP);
  assert.equal(defaultResolution.engine.id, "engine:a");
  assert.equal(defaultResolution.assignment.tenantId, undefined);
});

test("tenant override fails closed for unregistered, inactive, or mismatched engines", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a" }));

  const tenantId = "tenant:one" as TenantId;
  assert.throws(
    () =>
      engineRegistry.resolveCapability(CAP, {
        tenantId,
        tenantOverride: { engineId: "engine:missing" as EngineId, engineVersion: 1 as Version },
      }),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "unknown-engine",
  );

  engineRegistry.registerEngine(makeEngineManifest({ id: "engine:inactive" }));
  assert.throws(
    () =>
      engineRegistry.resolveCapability(CAP, {
        tenantId,
        tenantOverride: { engineId: "engine:inactive" as EngineId, engineVersion: 1 as Version },
      }),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "tenant-override-target-not-activated",
  );

  const otherCapability = makeEngineManifest({ id: "engine:other-cap", capabilityIds: ["detect_scenes" as CapabilityId] });
  registerAndActivate(engineRegistry, otherCapability);
  assert.throws(
    () =>
      engineRegistry.resolveCapability(CAP, {
        tenantId,
        tenantOverride: { engineId: "engine:other-cap" as EngineId, engineVersion: 1 as Version },
      }),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "no-activatable-engine",
  );
});

// ---------------------------------------------------------------------------
// Silent replacement forbidden; explicit replacement; version bumps
// ---------------------------------------------------------------------------

test("silent engine replacement is forbidden: the guard names both engines", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", benchmarkScore: 0.9 }));
  engineRegistry.resolveCapability(CAP); // records assignment → engine:a

  // A BETTER engine arrives and would win the tie-break silently.
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:b", benchmarkScore: 0.99 }));

  assert.throws(
    () => engineRegistry.resolveCapability(CAP),
    (error: unknown) => {
      assert.ok(error instanceof EngineRegistryError);
      assert.equal(error.code, "silent-engine-replacement");
      assert.equal(error.details.currentEngineId, "engine:a");
      assert.equal(error.details.candidateEngineId, "engine:b");
      assert.match(error.message, /engine:a/);
      assert.match(error.message, /engine:b/);
      return true;
    },
  );
});

test("an explicit replacement record unblocks resolution and is recorded in the assignment", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", benchmarkScore: 0.9 }));
  engineRegistry.resolveCapability(CAP);
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:b", benchmarkScore: 0.99 }));

  const record = engineRegistry.recordEngineReplacement({
    capabilityId: CAP,
    fromEngineId: "engine:a" as EngineId,
    fromEngineVersion: 1 as Version,
    toEngineId: "engine:b" as EngineId,
    toEngineVersion: 1 as Version,
    reason: "engine:b benchmarked better on the golden corpus",
  });
  assert.equal(record.recordedAt, FIXED_CLOCK());

  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.id, "engine:b");
  assert.equal(resolution.assignment.via, "explicit-replacement");
});

test("replacement records are directional: migrating back needs its own record", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", benchmarkScore: 0.9 }));
  engineRegistry.resolveCapability(CAP);
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:b", benchmarkScore: 0.99 }));
  engineRegistry.recordEngineReplacement({
    capabilityId: CAP,
    fromEngineId: "engine:a" as EngineId,
    fromEngineVersion: 1 as Version,
    toEngineId: "engine:b" as EngineId,
    toEngineVersion: 1 as Version,
    reason: "forward migration",
  });
  engineRegistry.resolveCapability(CAP); // now engine:b

  // Make engine:a win again; the existing record is a→b, not b→a. Because
  // engine:b (the recorded assignment) was deactivated, resolution fails
  // closed with the assigned-engine-inactive code — never a silent
  // fallback — naming both engines in the details.
  engineRegistry.deactivateEngine("engine:b" as EngineId, 1 as Version);
  assert.throws(
    () => engineRegistry.resolveCapability(CAP),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "assigned-engine-inactive" &&
      error.details.currentEngineId === "engine:b" &&
      error.details.candidateEngineId === "engine:a",
  );
});

test("recordEngineReplacement fails closed for unregistered or inactive targets", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a" }));
  engineRegistry.registerEngine(makeEngineManifest({ id: "engine:inactive" }));

  assert.throws(
    () =>
      engineRegistry.recordEngineReplacement({
        capabilityId: CAP,
        fromEngineId: "engine:a" as EngineId,
        fromEngineVersion: 1 as Version,
        toEngineId: "engine:missing" as EngineId,
        toEngineVersion: 1 as Version,
        reason: "x",
      }),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "unknown-engine",
  );
  assert.throws(
    () =>
      engineRegistry.recordEngineReplacement({
        capabilityId: CAP,
        fromEngineId: "engine:a" as EngineId,
        fromEngineVersion: 1 as Version,
        toEngineId: "engine:inactive" as EngineId,
        toEngineVersion: 1 as Version,
        reason: "x",
      }),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "engine-not-activated",
  );
});

test("same-engine version bumps resolve without a replacement record (explicit bump)", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", version: 1 }));
  const first = engineRegistry.resolveCapability(CAP);
  assert.equal(first.assignment.via, "initial-resolution");

  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", version: 2 }));
  const second = engineRegistry.resolveCapability(CAP);
  assert.equal(second.engine.version, 2);
  assert.equal(second.assignment.via, "engine-version-bump");
  assert.deepEqual(engineRegistry.listEngineVersions("engine:a" as EngineId), [1, 2]);
  // Only the promoted version is active.
  assert.deepEqual(
    engineRegistry.listActivatedEngines().map((engine) => engine.version),
    [2],
  );
});

// ---------------------------------------------------------------------------
// Historical reproducibility, deactivation, rollback
// ---------------------------------------------------------------------------

test("old engine versions remain resolvable after promotion (historical reproducibility)", () => {
  const engineRegistry = registry();
  const v1 = makeEngineManifest({ id: "engine:a", version: 1 });
  registerAndActivate(engineRegistry, v1);
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", version: 2 }));

  assert.deepEqual(engineRegistry.getEngine("engine:a" as EngineId, 1 as Version), v1);
  const v2 = engineRegistry.getEngine("engine:a" as EngineId, 2 as Version);
  assert.notEqual(v2, undefined);
  assert.equal(v2?.version, 2);
});

test("rollback by version re-points the active version and keeps history resolvable", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", version: 1 }));
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", version: 2 }));
  assert.equal(engineRegistry.resolveCapability(CAP).engine.version, 2);

  const rollback = engineRegistry.rollbackEngineVersion("engine:a" as EngineId, 1 as Version);
  assert.equal(rollback.fromEngineVersion, 2);
  assert.equal(rollback.toEngineVersion, 1);
  assert.equal(rollback.rolledBackAt, FIXED_CLOCK());

  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.version, 1);
  assert.equal(resolution.assignment.via, "engine-version-bump");
  // Historical reproducibility: v2 is still registered and resolvable.
  assert.notEqual(engineRegistry.getEngine("engine:a" as EngineId, 2 as Version), undefined);
  assert.deepEqual(engineRegistry.listEngineVersions("engine:a" as EngineId), [1, 2]);
});

test("rollback fails closed for unknown versions and never-activated versions", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a", version: 1 }));
  engineRegistry.registerEngine(makeEngineManifest({ id: "engine:a", version: 2 }));

  assert.throws(
    () => engineRegistry.rollbackEngineVersion("engine:a" as EngineId, 9 as Version),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "unknown-engine",
  );
  // v2 is registered but was never activated: rollback must NOT bypass
  // the activation evidence gate.
  assert.throws(
    () => engineRegistry.rollbackEngineVersion("engine:a" as EngineId, 2 as Version),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "rollback-target-not-previously-activated",
  );
});

test("deactivation excludes an engine from resolution; migration is explicit, records stay resolvable", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a" }));
  const manifest = makeEngineManifest({ id: "engine:b" });
  registerAndActivate(engineRegistry, manifest);
  engineRegistry.resolveCapability(CAP); // assignment: engine:a (lexicographic tie-break)

  engineRegistry.deactivateEngine("engine:a" as EngineId, 1 as Version);
  // The assigned engine is inactive: silent fallback to engine:b is
  // forbidden — resolution fails closed with the dedicated code.
  assert.throws(
    () => engineRegistry.resolveCapability(CAP),
    (error: unknown) =>
      error instanceof EngineRegistryError &&
      error.code === "assigned-engine-inactive",
  );
  // An explicit replacement record unblocks migration to engine:b.
  engineRegistry.recordEngineReplacement({
    capabilityId: CAP,
    fromEngineId: "engine:a" as EngineId,
    fromEngineVersion: 1 as Version,
    toEngineId: "engine:b" as EngineId,
    toEngineVersion: 1 as Version,
    reason: "engine:a deactivated",
  });
  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.id, "engine:b");
  assert.equal(resolution.assignment.via, "explicit-replacement");
  // engine:a stays registered and resolvable by exact version.
  assert.notEqual(engineRegistry.getEngine("engine:a" as EngineId, 1 as Version), undefined);
});

// ---------------------------------------------------------------------------
// Capability-registry wiring (fail-closed unknown capability)
// ---------------------------------------------------------------------------

test("resolution fails closed for unknown capabilities when a capability registry is wired", () => {
  const capabilityRegistry = createInMemoryCapabilityRegistry({
    initial: SEED_CAPABILITY_CATALOG,
  });
  const engineRegistry = createInMemoryEngineRegistry({
    clock: FIXED_CLOCK,
    capabilityRegistry,
  });
  registerAndActivate(engineRegistry, makeEngineManifest());

  const resolution = engineRegistry.resolveCapability(CAP);
  assert.equal(resolution.engine.id, "engine:test-alpha");

  assert.throws(
    () => engineRegistry.resolveCapability("no_such_capability" as CapabilityId),
    (error: unknown) =>
      error instanceof UnknownCapabilityError &&
      error.code === "unknown-capability",
  );
});

test("assignments are auditable per lane via getEngineAssignment", () => {
  const engineRegistry = registry();
  registerAndActivate(engineRegistry, makeEngineManifest({ id: "engine:a" }));
  engineRegistry.resolveCapability(CAP);

  const assignment = engineRegistry.getEngineAssignment(CAP);
  assert.equal(assignment?.engineId, "engine:a");
  assert.equal(assignment?.via, "initial-resolution");
  assert.equal(engineRegistry.getEngineAssignment(CAP, "tenant:x" as TenantId), undefined);
});
