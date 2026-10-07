/**
 * §30 INTERACTION RECORD COMPLETENESS (INTEG-001): every provider
 * interaction records the §30 operative fields — REQUEST ID, PROVIDER,
 * IMPLEMENTATION VERSION, CAPABILITY, ACTOR, DURATION, FAILURE/WARNINGS —
 * plus scope, instance binding, rights frame, verbatim implementation
 * status and the honest transport-source label. Every attributable
 * attempt (success, typed failure, rights denial) appends an immutable
 * audit record; there is no unrecorded path past instance resolution.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  ACTOR_TWO,
  AURORA_EXTERNAL_ACCOUNT,
  SCOPE_ALPHA,
  TENANT_ALPHA,
} from "../testing/fixtures.js";
import { IN_MEMORY_TRANSPORT_SOURCE } from "../adapters/in-memory-provider-transport.js";
import type { ProviderInteractionRecord } from "../contracts/interaction.js";

const FIXED_NOW = "2026-03-01T12:00:00.000Z";
const NOW = () => FIXED_NOW;

/** The §30 completeness assertion: EVERY required field is present. */
function assertCompleteRecord(record: ProviderInteractionRecord): void {
  // §30 request id.
  assert.ok(typeof record.id === "string" && record.id.length > 0);
  // §31 scope.
  assert.equal(record.scope.tenantId, TENANT_ALPHA);
  // The instance binding.
  assert.ok(record.instanceId);
  // §30 provider.
  assert.equal(record.providerId, "provider:aurora-social");
  // Implementation identity + §30 implementation version.
  assert.ok(record.implementationId);
  assert.equal(typeof record.implementationVersion, "number");
  // Verbatim implementation status at interaction time.
  assert.ok(["available", "unavailable", "degraded", "unknown"].includes(record.implementationStatus));
  // §30 capability (id + exact version).
  assert.ok(record.capabilityId);
  assert.equal(typeof record.capabilityVersion, "number");
  // §30 actor.
  assert.ok(record.actor);
  // The rights frame that was presented.
  assert.ok(record.rightsContextRef);
  // §30 duration (≥ 0).
  assert.equal(typeof record.durationMs, "number");
  assert.ok(record.durationMs >= 0);
  // §30 failure (null on success) + warnings.
  assert.ok(record.failure === null || typeof record.failure.code === "string");
  assert.ok(Array.isArray(record.warnings));
  // Honest transport source label.
  assert.ok(typeof record.transportSource === "string" && record.transportSource.length > 0);
  // Immutable audit record.
  assert.ok(Object.isFrozen(record));
}

test("§30 completeness: a SUCCESS record carries every field, self-labels the double transport, and is frozen", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const result = registered.stack.interactions.invoke(standardInvokeRequest(registered));

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assertCompleteRecord(result.record);
    assert.equal(result.record.failure, null);
    assert.equal(result.record.warnings.length, 0);
    // The disclosed double names itself on every record.
    assert.equal(result.record.transportSource, IN_MEMORY_TRANSPORT_SOURCE);
    assert.equal(result.record.startedAt, FIXED_NOW);
    assert.equal(result.record.durationMs, 0); // fixed clock
  }
});

test("§30 completeness: a transport failure record carries the typed failure and the double's source label", () => {
  const registered = registeredAuroraStack({
    now: NOW,
    transportRoutes: {
      "provider:aurora-social": {
        kind: "fail",
        message: "fictional provider maintenance window",
        retriable: true,
        details: { window: "fictional" },
      },
    },
  });
  const result = registered.stack.interactions.invoke(standardInvokeRequest(registered));

  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assertCompleteRecord(result.record);
    assert.equal(result.failure.code, "transport-failed");
    assert.equal(result.failure.retriable, true);
    assert.equal(result.record.transportSource, IN_MEMORY_TRANSPORT_SOURCE);
    // The failure is echoed on both the result and the record.
    assert.equal(result.record.failure?.code, "transport-failed");
  }
});

test("§30 completeness: transport WARNINGS surface on the record alongside declared availability constraints", () => {
  const registered = registeredAuroraStack({
    now: NOW,
    transportRoutes: {
      "provider:aurora-social": {
        kind: "ok",
        output: { fictional: "payload" },
        warnings: [{ code: "provider-deprecation", message: "fictional v1 surface deprecating" }],
      },
    },
  });
  // generate_voice availability carries a rate-limit constraint.
  const result = registered.stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    capabilityId: registered.voiceAvailability.capabilityId,
    capabilityVersion: registered.voiceAvailability.capabilityVersion,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const codes = result.record.warnings.map((warning) => warning.code);
    assert.ok(codes.includes("provider-deprecation"));
    assert.ok(codes.includes("availability-constraints-declared"));
    assert.ok(
      result.record.warnings
        .find((warning) => warning.code === "availability-constraints-declared")
        ?.message.includes("rate-limit"),
    );
  }
});

test("§30 completeness: a DEGRADED implementation completes WITH the degraded warning recorded", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const degraded = registered.stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: registered.implementationAvailable.id,
    status: "degraded",
    evidenceRefs: ["evidence:degraded-observation" as never],
  });
  const rebound = registered.stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: registered.instance.id,
    implementationId: degraded.id,
    implementationVersion: degraded.version,
  });

  const result = registered.stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    instanceId: rebound.id,
  });
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assertCompleteRecord(result.record);
    assert.equal(result.record.implementationStatus, "degraded");
    assert.ok(result.record.warnings.some((w) => w.code === "implementation-degraded"));
  }
});

test("§30 completeness: rights denials and availability/status failures are ALL recorded — no unrecorded path", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  // 1. Rights denial.
  const denied = stack.interactions.invoke(
    standardInvokeRequest(registered, {
      rightsContextRef: "rights-context-missing" as typeof registered.rightsContextRef,
    }),
  );
  assert.equal(denied.outcome, "failed");

  // 2. Availability failure (capability not recorded on the instance).
  const notAvailable = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    capabilityId: "detect_scenes" as typeof registered.transcribeAvailability.capabilityId,
  });
  assert.equal(notAvailable.outcome, "failed");

  // 3. Status failure (unavailable).
  const unavailable = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: registered.implementationAvailable.id,
    status: "unavailable",
    evidenceRefs: [],
  });
  const reboundUnavailable = stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: registered.instance.id,
    implementationId: unavailable.id,
    implementationVersion: unavailable.version,
  });
  const statusFailed = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    instanceId: reboundUnavailable.id,
  });
  assert.equal(statusFailed.outcome === "failed" ? statusFailed.failure.code : "", "implementation-status-unavailable");

  // Rebind back to the AVAILABLE version for the remaining attempts.
  stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: registered.instance.id,
    implementationId: registered.implementationAvailable.id,
    implementationVersion: registered.implementationAvailable.version,
  });

  // 4. A transport failure (scripted route on its OWN stack).
  const routed = registeredAuroraStack({
    now: NOW,
    transportRoutes: {
      "provider:aurora-social": { kind: "fail", message: "fictional blip" },
    },
  });
  const transportFailed = routed.stack.interactions.invoke(standardInvokeRequest(routed));
  assert.equal(transportFailed.outcome, "failed");
  if (transportFailed.outcome === "failed") {
    assert.equal(transportFailed.failure.code, "transport-failed");
  }

  // 5. A success.
  const completed = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(completed.outcome, "completed");

  // Every attributable attempt is in the log: 1+1+1+1 = 4 on this stack
  // (the routed failure lives on its own stack — nothing bleeds).
  const log = stack.interactions.listInteractionRecords(TENANT_ALPHA);
  assert.equal(log.length, 4);
  assert.equal(routed.stack.interactions.listInteractionRecords(TENANT_ALPHA).length, 1);
  for (const record of log) {
    assertCompleteRecord(record);
  }
  // The audit log is ordered by time (insertion order) then id.
  assert.deepEqual(
    log.map((record) => record.id),
    [...log].sort((a, b) => (a.id as string).localeCompare(b.id as string)).map((r) => r.id),
  );
});

test("§30 completeness: an UNRESOLVABLE instance produces NO audit record (disclosed — the log records interactions, not failed lookups)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const result = registered.stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    instanceId: "merchant-client-instance-nowhere" as typeof registered.instance.id,
  });
  assert.equal(result.outcome, "unresolved-instance");
  if (result.outcome === "unresolved-instance") {
    assert.equal(result.failure.code, "unknown-merchant-client-instance");
  }
  assert.deepEqual(registered.stack.interactions.listInteractionRecords(TENANT_ALPHA), []);
});

test("§30 completeness: audit-log read-back — by id, filtered, limited, tenant-scoped", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  const first = stack.interactions.invoke(standardInvokeRequest(registered));
  const second = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    actor: ACTOR_TWO,
    // A context that does NOT cover actor-two → denied (still recorded).
    rightsContextRef: "rights-context-missing" as typeof registered.rightsContextRef,
  });
  assert.equal(first.outcome, "completed");
  assert.equal(second.outcome, "failed");

  // By id.
  if (first.outcome === "completed") {
    assert.equal(
      stack.interactions.getInteractionRecord(TENANT_ALPHA, first.record.id)?.id,
      first.record.id,
    );
    assert.equal(stack.interactions.getInteractionRecord(TENANT_ALPHA, "nope" as typeof first.record.id), undefined);
  }

  // Filtered by actor + failure code.
  const denied = stack.interactions.listInteractionRecords(TENANT_ALPHA, {
    failureCode: "rights-gate-denied",
  });
  assert.equal(denied.length, 1);
  assert.equal(denied[0]?.failure?.code, "rights-gate-denied");

  const byInstance = stack.interactions.listInteractionRecords(TENANT_ALPHA, {
    instanceId: registered.instance.id,
  });
  assert.equal(byInstance.length, 2);

  // Limit.
  assert.equal(stack.interactions.listInteractionRecords(TENANT_ALPHA, { limit: 1 }).length, 1);

  // Capability filter.
  assert.equal(
    stack.interactions.listInteractionRecords(TENANT_ALPHA, {
      capabilityId: registered.transcribeAvailability.capabilityId,
    }).length,
    2,
  );
});

test("§30 completeness: the record names the implementation VERSION THAT SERVED — explicit staleness after rebind", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  // Invoke while bound to v2 (available).
  const before = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(before.outcome, "completed");

  // Rebind to a NEW implementation version (degraded correction v3).
  const degraded = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: registered.implementationAvailable.id,
    status: "degraded",
    evidenceRefs: ["evidence:later-observation" as never],
  });
  stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: registered.instance.id,
    implementationId: degraded.id,
    implementationVersion: degraded.version,
  });

  // Invoke again: the new record names the NEW bound version; the OLD
  // record still names the version that actually served it.
  const after = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(after.outcome, "completed");
  if (before.outcome === "completed" && after.outcome === "completed") {
    assert.equal(before.record.implementationVersion, registered.implementationAvailable.version);
    assert.equal(after.record.implementationVersion, degraded.version);
    assert.equal(after.record.implementationStatus, "degraded");
  }
});

test("§30 completeness: the record's provider identity is the DEFINITION's, echoed through the implementation (layer-1 source of truth)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const result = registered.stack.interactions.invoke(standardInvokeRequest(registered));
  if (result.outcome === "completed") {
    assert.equal(result.record.providerId, registered.definition.providerId);
    // The subject derivation is the external account boundary.
    assert.equal(AURORA_EXTERNAL_ACCOUNT as string, "account:aurora-merchant-one");
  }
});
