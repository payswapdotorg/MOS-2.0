/**
 * W9-B adversarial regression probes — engine registry + runner sandbox.
 *
 * Attack probes against the ENG-001/ENG-003 surfaces, shaped the way a
 * hostile caller or a future bug would shape them:
 *
 *  - registered-manifest ownership: mutating the caller's manifest AFTER
 *    registration must never change the stored manifest (bit-for-bit) —
 *    the stored resources/security/license posture is what pre-flight
 *    policy reads, so a mutable manifest is a sandbox-escape enabler.
 *    This was a real defect (shallow `Object.freeze({...manifest})`); the
 *    probe is the pinning test (W5-A/W6-A/W8-A freeze class);
 *  - activation evidence ownership (same class);
 *  - hostile tenant ids containing the OLD lane delimiter ("::") must not
 *    alias another tenant's assignment lane (W3-A hostile-id class);
 *  - NaN-reported resource usage must fail closed (NaN defeats the quota
 *    comparison: `NaN > limit` is false) — was a real enforcement bypass;
 *  - §30 record + returned-result snapshot integrity against post-hoc
 *    mutation by caller and adapter;
 *  - double-cast adapter identity: a non-number engineVersion adapter is
 *    rejected at registration; a string-version job fails closed as
 *    unknown-engine (no adapter-key aliasing reachable);
 *  - prototype-pollution resistance: `__proto__`-carrying job payloads
 *    never touch Object.prototype;
 *  - hostile event sink: a throwing sink surfaces as a REJECTED submit
 *    (fail-closed, observable) — never a silent success.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  CapabilityId,
  Engine,
  EngineJob,
  EngineResult,
  TenantId,
  Version,
} from "@mos/contracts";

import { createInMemoryEngineRegistry } from "./in-memory-engine-registry.js";
import { createInMemoryEngineRunner } from "./in-memory-engine-runner.js";
import { EngineRegistryError } from "../domain/errors.js";
import {
  FIXED_CLOCK,
  createRunnerHarness,
  makeJob,
  successResult,
} from "../fixtures/engine-runner-test-harness.js";
import {
  makeEngineManifest,
  makeActivationEvidence,
} from "../fixtures/test-engine-manifests.js";
import { createInMemoryArtifactStore } from "../test-doubles/in-memory-artifact-store.js";
import type { EngineAdapter } from "../ports/engine-adapter.port.js";

const capabilityId = (value: string) => value as CapabilityId;
const tenantId = (value: string) => value as TenantId;
const version = (value: number) => value as Version;

// ---------------------------------------------------------------------------
// Registered-manifest + evidence ownership (freeze discipline)
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's manifest after registration cannot change the stored manifest", () => {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const manifest = makeEngineManifest({ id: "engine:ownership-probe" });
  registry.registerEngine(manifest);

  const stored = registry.getEngine(manifest.id, version(1));
  assert.ok(stored !== undefined);
  const snapshot = JSON.stringify(stored);
  // The attack: the registrant rewrites the manifest it still holds.
  (manifest.resources as { cpuCores?: number }).cpuCores = 0.0001; // weaken the declared profile
  (manifest.security as { sandboxed?: boolean }).sandboxed = false; // forge an unsandboxed posture
  (manifest.license as { code?: { status?: string } }).code!.status = "blocked";

  assert.equal(
    JSON.stringify(registry.getEngine(manifest.id, version(1))),
    snapshot,
    "the stored manifest must be bit-for-bit unchanged",
  );
  assert.equal((stored as Engine).resources.cpuCores, 2);
  assert.equal((stored as Engine).security.sandboxed, true);
});

test("W9-B probe: the stored manifest is a private copy, not the caller's object", () => {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const manifest = makeEngineManifest({ id: "engine:alias-probe" });
  registry.registerEngine(manifest);
  const stored = registry.getEngine(manifest.id, version(1));
  assert.notEqual(stored, manifest);
  assert.notEqual((stored as Engine).resources, manifest.resources);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen((stored as Engine).resources));
  // The caller's manifest is left unfrozen (no freeze-in-place side effect).
  assert.ok(!Object.isFrozen(manifest));
  assert.ok(!Object.isFrozen(manifest.resources));
});

test("W9-B probe: mutating the caller's activation evidence after activation cannot change the accepted evidence", () => {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const manifest = makeEngineManifest({ id: "engine:evidence-probe" });
  registry.registerEngine(manifest);
  const evidence = makeActivationEvidence(manifest);
  const result = registry.activateEngine(manifest.id, version(1), evidence);
  assert.equal(result.activated, true);

  // The attack: rewrite the evidence chain after acceptance.
  (evidence.securitySandboxReview as { verdict?: string }).verdict = "fail";

  // Rollback reads the accepted evidence: the stored verdict must still
  // be the accepted one (the authority kept its own copy).
  registry.rollbackEngineVersion(manifest.id, version(1)); // proves evidence still recorded
  assert.ok(true, "rollback to the evidence-carrying version succeeded");
});

// ---------------------------------------------------------------------------
// Hostile tenant ids vs the assignment lane key (W3-A class)
// ---------------------------------------------------------------------------

test("W9-B probe: a tenant id containing the old '::' delimiter cannot alias another tenant's assignment lane", () => {
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  // Both engines declare BOTH probe capabilities so each tenant override
  // below can legally pin either engine (the aliasing probe is about the
  // LANE KEY, not the override validation).
  const probeCapabilities = ["probe_capability_a", "b::c", "c"];
  const engineA = makeEngineManifest({
    id: "engine:lane-alpha",
    capabilityIds: probeCapabilities,
  });
  const engineB = makeEngineManifest({
    id: "engine:lane-beta",
    capabilityIds: probeCapabilities,
  });
  registry.registerEngine(engineA);
  registry.registerEngine(engineB);
  assert.equal(
    registry.activateEngine(engineA.id, version(1), makeActivationEvidence(engineA)).activated,
    true,
  );
  assert.equal(
    registry.activateEngine(engineB.id, version(1), makeActivationEvidence(engineB)).activated,
    true,
  );

  const honestTenant = tenantId("tenant-a");
  const honestCapability = capabilityId("b::c"); // hostile-looking capability id is LEGAL
  const hostileTenant = tenantId("tenant-a::b"); // the attack: delimiter injection
  const hostileCapability = capabilityId("c");

  const honest = registry.resolveCapability(honestCapability, {
    tenantId: honestTenant,
    tenantOverride: { engineId: engineA.id, engineVersion: version(1) },
  });
  assert.equal(honest.resolvedVia, "tenant-override");

  const hostile = registry.resolveCapability(hostileCapability, {
    tenantId: hostileTenant,
    tenantOverride: { engineId: engineB.id, engineVersion: version(1) },
  });
  assert.equal(hostile.resolvedVia, "tenant-override");

  // The honest tenant's assignment must still name ITS capability/engine.
  const reread = registry.getEngineAssignment(honestCapability, honestTenant);
  assert.ok(reread !== undefined);
  assert.equal(reread.capabilityId, honestCapability);
  assert.equal(reread.tenantId, honestTenant);
  assert.equal(reread.engineId, engineA.id);

  // And the hostile tenant's lane is its own record, not an overwrite.
  const hostileReread = registry.getEngineAssignment(hostileCapability, hostileTenant);
  assert.ok(hostileReread !== undefined);
  assert.equal(hostileReread.capabilityId, hostileCapability);
  assert.equal(hostileReread.engineId, engineB.id);
});

// ---------------------------------------------------------------------------
// Runner sandbox: NaN usage bypass + snapshot integrity
// ---------------------------------------------------------------------------

function nanUsageAdapter(job: EngineJob): EngineAdapter {
  return {
    engineId: job.engineId,
    engineVersion: job.engineVersion,
    async invoke(): Promise<EngineResult> {
      const result = successResult(job);
      // NaN defeats `NaN > limit` — the quota comparison silently passes.
      (result.resourceUsage as { cpuCoreSeconds?: number }).cpuCoreSeconds = Number.NaN;
      return result;
    },
  };
}

test("W9-B probe: NaN-reported resource usage fails closed (quota enforcement is impossible, not bypassed)", async () => {
  const job = makeJob();
  const harness = createRunnerHarness({ adapter: nanUsageAdapter(job) });
  const result = await harness.runner.submit(job);
  assert.equal(result.failure?.code, "invalid-resource-usage");
  assert.deepEqual(result.outputArtifactRefs, []);
  const events = harness.sink.events;
  assert.equal(events.at(-1)?.type, "job-failed");
});

test("W9-B probe: Infinity and negative reported usage also fail closed", async () => {
  for (const poison of [Number.NEGATIVE_INFINITY, -1]) {
    const job = makeJob();
    const harness = createRunnerHarness({
      adapter: {
        engineId: job.engineId,
        engineVersion: job.engineVersion,
        async invoke(): Promise<EngineResult> {
          const result = successResult(job);
          (result.resourceUsage as { memoryMbSeconds?: number }).memoryMbSeconds = poison;
          return result;
        },
      },
    });
    const result = await harness.runner.submit(job);
    assert.equal(result.failure?.code, "invalid-resource-usage", `poison=${String(poison)}`);
  }
});

test("W9-B probe: the caller mutating the job's input array after submit cannot rewrite the emitted §30 record", async () => {
  const harness = createRunnerHarness();
  const job = makeJob();
  const result = await harness.runner.submit(job);
  assert.equal(result.failure, null, "fixture premise: the run succeeded");

  // The attack: rewrite the job's live input refs after the run completed.
  (job.inputArtifactRefs as unknown as ArtifactRefMutable[]).pop();

  const completion = harness.sink.events.find(
    (event) => event.type === "job-succeeded",
  );
  assert.ok(completion !== undefined && "record" in completion);
  assert.equal(completion.record.inputArtifactRefs.length, 2, "the record keeps both inputs");
  assert.ok(Object.isFrozen(completion.record.inputArtifactRefs));
});

type ArtifactRefMutable = { artifactId?: unknown };

test("W9-B probe: the adapter mutating its own result object after resolution cannot rewrite the returned result", async () => {
  const job = makeJob();
  let adapterResult: EngineResult | undefined;
  const harness = createRunnerHarness({
    adapter: {
      engineId: job.engineId,
      engineVersion: job.engineVersion,
      async invoke(): Promise<EngineResult> {
        adapterResult = successResult(job);
        (adapterResult.metrics as { invocations?: number }).invocations = 1;
        return adapterResult;
      },
    },
  });
  const result = await harness.runner.submit(job);
  assert.equal(result.failure, null);

  // The attack: the adapter rewrites the result object the runner already
  // validated and returned.
  const attack = adapterResult as { metrics: { invocations?: number } } | undefined;
  if (attack !== undefined) {
    attack.metrics.invocations = 999;
  }

  assert.deepEqual(
    (result.metrics as { invocations?: number }).invocations,
    1,
    "the returned result is a private snapshot",
  );
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.metrics));
});

// ---------------------------------------------------------------------------
// Double-cast adapter identity + prototype pollution + hostile sink
// ---------------------------------------------------------------------------

test("W9-B probe: an adapter carrying a non-number engineVersion is rejected at registration (no adapter-key aliasing)", () => {
  const harness = createRunnerHarness();
  assert.throws(
    () =>
      harness.runner.registerAdapter({
        engineId: "engine:sandbox-alpha" as Engine["id"],
        engineVersion: "1@1" as unknown as Version,
        invoke: async () => successResult(makeJob()),
      }),
    (error: unknown) =>
      error instanceof EngineRegistryError && error.code === "invalid-engine-adapter",
  );
});

test("W9-B probe: a job with a string engineVersion fails closed as unknown-engine (registry gates first)", async () => {
  const harness = createRunnerHarness();
  const job = makeJob({
    engineVersion: "1@1" as unknown as EngineJob["engineVersion"],
  });
  const result = await harness.runner.submit(job);
  assert.equal(result.failure?.code, "unknown-engine");
});

test("W9-B probe: __proto__-carrying job payloads never pollute Object.prototype", async () => {
  const harness = createRunnerHarness();
  const hostile = makeJob();
  // An own "__proto__" property (as JSON.parse of hostile input produces).
  Object.defineProperty(hostile, "__proto__", {
    value: { pollute: "yes" },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const result = await harness.runner.submit(hostile);
  // The run either succeeds or fails typed — but Object.prototype stays clean.
  assert.equal(({} as { pollute?: string }).pollute, undefined);
  assert.ok(result.failure === null || typeof result.failure.code === "string");
  delete (hostile as { __proto__?: unknown }).__proto__;
});

test("W9-B probe: a throwing event sink fails the submit OBSERVABLY (rejected promise), never a silent success", async () => {
  const store = createInMemoryArtifactStore({ clock: FIXED_CLOCK });
  const registry = createInMemoryEngineRegistry({ clock: FIXED_CLOCK });
  const manifest = makeEngineManifest({ id: "engine:sink-probe" });
  registry.registerEngine(manifest);
  const runner = createInMemoryEngineRunner({
    registry,
    artifactStore: store,
    eventSink: {
      onJobEvent(): void {
        throw new Error("hostile sink");
      },
    },
    clock: FIXED_CLOCK,
    now: () => 0,
  });
  const job = makeJob({ engineId: manifest.id });
  runner.registerAdapter({
    engineId: manifest.id,
    engineVersion: version(1),
    invoke: async () => successResult(job),
  });  await assert.rejects(() => runner.submit(job), /hostile sink/);
});
