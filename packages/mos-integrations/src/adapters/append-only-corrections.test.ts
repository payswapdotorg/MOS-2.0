/**
 * APPEND-ONLY VERSION CORRECTIONS (INTEG-001, policy
 * requireAppendOnlyHistoryWhereDeclared): every registry layer versions
 * its records append-only — corrections (definition re-registrations,
 * implementation status corrections, instance rebinds, availability
 * constraint corrections) append NEW immutable versions; prior versions
 * stay resolvable with their original content; nothing is rewritten in
 * place; positive status claims need evidence (fail-closed).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import type { Timestamp, Version } from "@mos/contracts";
import {
  AURORA_DEFINITION_INPUT,
  CAP_GENERATE_VOICE,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
  generateVoiceAvailabilityInput,
  transcribeAvailabilityInput,
} from "../testing/fixtures.js";
import { IntegrationsError } from "../errors.js";

const NOW = () => "2026-05-01T00:00:00.000Z";

test("append-only: LAYER 1 corrections — re-registering a known id appends; prior versions stay resolvable and frozen", () => {
  const stack = composeIntegrationsStack({ now: NOW });
  const v1 = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const v2 = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: v1.id,
    displayName: "Aurora Social corrected (fictional fixture)",
  });
  const v3 = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: v1.id,
    transport: {
      ...AURORA_DEFINITION_INPUT.transport,
      transportKind: "graphql",
    },
  });
  void v3;

  assert.deepEqual(stack.definitions.listVersions(TENANT_ALPHA, v1.id), [1, 2, 3]);
  // The prior versions keep their ORIGINAL content.
  assert.equal(stack.definitions.get(TENANT_ALPHA, v1.id, 1 as Version)?.displayName, AURORA_DEFINITION_INPUT.displayName);
  assert.equal(stack.definitions.get(TENANT_ALPHA, v1.id, 1 as Version)?.transport.transportKind, "http-rest");
  assert.equal(stack.definitions.get(TENANT_ALPHA, v1.id, 2 as Version)?.transport.transportKind, "http-rest");
  assert.equal(stack.definitions.getLatest(TENANT_ALPHA, v1.id)?.transport.transportKind, "graphql");
  // Every stored version is frozen.
  for (const version of [1, 2, 3]) {
    assert.ok(Object.isFrozen(stack.definitions.get(TENANT_ALPHA, v1.id, version as never)));
  }
  // v1/v2 records were not mutated by later registrations.
  assert.equal(v1.displayName, AURORA_DEFINITION_INPUT.displayName);
  assert.equal(v2.displayName, "Aurora Social corrected (fictional fixture)");
});

test("append-only: LAYER 2 status corrections preserve every prior field EXCEPT status/evidence/observedAt", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, implementationAvailable } = registered;

  const corrected = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: implementationAvailable.id,
    status: "degraded",
    statusObservedAt: "2026-05-02T00:00:00.000Z" as Timestamp,
    evidenceRefs: ["evidence:degraded-observation" as never],
  });

  assert.equal(corrected.version, implementationAvailable.version + 1);
  assert.equal(corrected.status, "degraded");
  assert.equal(corrected.statusObservedAt, "2026-05-02T00:00:00.000Z");
  assert.deepEqual(corrected.evidenceRefs, ["evidence:degraded-observation"]);
  // Preserved: identity + definition binding + label + models.
  assert.equal(corrected.id, implementationAvailable.id);
  assert.equal(corrected.definitionId, implementationAvailable.definitionId);
  assert.equal(corrected.definitionVersion, implementationAvailable.definitionVersion);
  assert.equal(corrected.label, implementationAvailable.label);
  assert.equal(corrected.evidenceModel, implementationAvailable.evidenceModel);
  assert.equal(corrected.errorModel, implementationAvailable.errorModel);
  assert.equal(corrected.rateLimitObservation, implementationAvailable.rateLimitObservation);
  // The prior version is untouched.
  assert.equal(
    stack.implementations.get(TENANT_ALPHA, implementationAvailable.id, implementationAvailable.version)
      ?.status,
    "available",
  );
});

test("append-only: positive status claims (available/degraded) REQUIRE evidence — corrections fail closed without it", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, implementationAvailable } = registered;

  for (const status of ["available", "degraded"] as const) {
    assert.throws(
      () =>
        stack.implementations.recordStatusCorrection({
          scope: SCOPE_ALPHA,
          implementationId: implementationAvailable.id,
          status,
          evidenceRefs: [],
        }),
      (error: unknown) =>
        error instanceof IntegrationsError &&
        error.code === "invalid-provider-implementation" &&
        error.details.status === status,
    );
  }
  // unknown/unavailable corrections stay evidence-free-allowed.
  const toUnknown = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: implementationAvailable.id,
    status: "unknown",
    evidenceRefs: [],
  });
  assert.equal(toUnknown.status, "unknown");

  // Registration into a positive status without evidence equally fails.
  const stack2 = composeIntegrationsStack({ now: NOW });
  const definition = stack2.definitions.register(AURORA_DEFINITION_INPUT);
  assert.throws(
    () =>
      stack2.implementations.register({
        ...auroraImplementationInput(definition.id),
        status: "available",
        evidenceRefs: [],
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "invalid-provider-implementation",
  );
});

test("append-only: LAYER 3 rebinds — prior bindings stay resolvable; §30 history keeps naming what actually served", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, implementationAvailable } = registered;

  // A second implementation to rebind onto.
  const fallback = stack.implementations.register({
    ...auroraImplementationInput(registered.definition.id),
    label: "fallback",
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const rebound = stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: registered.instance.id,
    implementationId: fallback.id,
    implementationVersion: fallback.version,
  });

  assert.equal(rebound.version, registered.instance.version + 1);
  assert.equal(rebound.implementationId, fallback.id);
  // Everything else about the instance is preserved.
  assert.equal(rebound.name, registered.instance.name);
  assert.equal(rebound.merchantIdentity, registered.instance.merchantIdentity);
  assert.equal(rebound.credentialRef, registered.instance.credentialRef);
  // Prior binding resolvable.
  assert.equal(
    stack.instances.get(TENANT_ALPHA, registered.instance.id, registered.instance.version)
      ?.implementationId,
    implementationAvailable.id,
  );
  // Rebinding to an UNKNOWN implementation fails closed, nothing appended.
  assert.throws(
    () =>
      stack.instances.recordRebind({
        scope: SCOPE_ALPHA,
        instanceId: registered.instance.id,
        implementationId: "provider-implementation:nowhere" as typeof fallback.id,
        implementationVersion: 1 as Version,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation-reference",
  );
  assert.deepEqual(
    stack.instances.listVersions(TENANT_ALPHA, registered.instance.id),
    [1, 2],
  );
});

test("append-only: LAYER 4 constraint corrections append; listForImplementation serves the LATEST per record", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, implementationAvailable, voiceAvailability } = registered;

  const corrected = stack.availability.register({
    ...generateVoiceAvailabilityInput(implementationAvailable.id),
    id: voiceAvailability.id,
    constraints: [
      { kind: "rate-limit", parameters: { requestsPerWindow: 30, windowMs: 60_000 } },
      { kind: "region", parameters: { allowed: "eu" } },
    ],
  });
  assert.equal(corrected.version, 2);
  assert.deepEqual(stack.availability.listVersions(TENANT_ALPHA, voiceAvailability.id), [1, 2]);
  // The prior version keeps the ORIGINAL single constraint.
  assert.equal(
    stack.availability.get(TENANT_ALPHA, voiceAvailability.id, 1 as Version)?.constraints.length,
    1,
  );
  // listForImplementation serves the corrected LATEST version.
  const latest = stack.availability
    .listForImplementation(TENANT_ALPHA, implementationAvailable.id)
    .find((record) => (record.id as string) === (voiceAvailability.id as string));
  assert.equal(latest?.version, 2);
  assert.equal(latest?.constraints.length, 2);
});

test("append-only: no delete/mutation API exists on any registry port (history cannot be rewritten)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  // The registry surfaces expose ONLY the declared methods — no remove,
  // delete, update, or patch anywhere.
  const portObjects: ReadonlyArray<Record<string, unknown>> = [
    stack.definitions as unknown as Record<string, unknown>,
    stack.implementations as unknown as Record<string, unknown>,
    stack.instances as unknown as Record<string, unknown>,
    stack.availability as unknown as Record<string, unknown>,
    stack.interactions as unknown as Record<string, unknown>,
  ];
  for (const port of portObjects) {
    const methods = Object.keys(port).filter((key) => typeof port[key] === "function");
    for (const method of methods) {
      assert.match(method, /^(register|get|getLatest|listVersions|listForTenant|listForDefinition|listForImplementation|recordRebind|recordStatusCorrection|invoke|listInstanceCapabilities|listInteractionRecords|getInteractionRecord)$/);
    }
  }

  // Frozen records resist in-place mutation (strict mode: silent no-op or
  // throw — either way the STORED record never changes).
  const record = registered.instance as unknown as Record<string, unknown>;
  const original = record.name;
  try {
    record.name = "hijacked";
  } catch {
    // frozen object in strict mode throws — fine
  }
  assert.equal(
    stack.instances.getLatest(TENANT_ALPHA, registered.instance.id)?.name,
    original,
  );
});

test("append-only: availability corrections cannot smuggle a DIFFERENT capability onto the same record id", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, implementationAvailable, transcribeAvailability } = registered;

  // A "correction" that switches the capability id entirely is just a new
  // version of the record with the new content — EXPLICIT and versioned,
  // and the prior version still declares transcribe_audio@1. The registry
  // does not silently reinterpret record identity.
  const switched = stack.availability.register({
    ...transcribeAvailabilityInput(implementationAvailable.id),
    id: transcribeAvailability.id,
    capabilityId: CAP_GENERATE_VOICE,
    capabilityVersion: 1 as Version,
  });
  assert.equal(switched.version, 2);
  assert.equal(switched.capabilityId, CAP_GENERATE_VOICE);
  assert.equal(
    stack.availability.get(TENANT_ALPHA, transcribeAvailability.id, 1 as Version)?.capabilityId,
    transcribeAvailability.capabilityId,
  );
  // The instance now resolves the LATEST of the switched record (generate_voice)
  // plus the dedicated generate_voice record — and transcribe_audio is NO
  // LONGER served (its availability exists only at v1 of the switched
  // record; explicit availability serves the latest version per record).
  const resolved = stack.interactions.listInstanceCapabilities(
    TENANT_ALPHA,
    registered.instance.id,
  );
  const ids = resolved.map((entry) => entry.capability.id as string).sort();
  assert.deepEqual(ids, ["generate_voice", "generate_voice"]);
  assert.equal(ids.includes("transcribe_audio"), false);

  // Invoking transcribe_audio through the instance now fails closed —
  // the v1 history is preserved but history is not availability.
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "capability-not-available-on-instance");
  }
});

test("append-only: corrections on UNKNOWN record ids fail closed without revealing existence", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  assert.throws(
    () =>
      stack.implementations.recordStatusCorrection({
        scope: SCOPE_ALPHA,
        implementationId: "provider-implementation:ghost" as never,
        status: "available",
        evidenceRefs: [EVIDENCE_HEALTH_CHECK],
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation",
  );
  assert.throws(
    () =>
      stack.instances.recordRebind({
        scope: SCOPE_ALPHA,
        instanceId: "merchant-client-instance:ghost" as never,
        implementationId: registered.implementationAvailable.id,
        implementationVersion: registered.implementationAvailable.version,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-merchant-client-instance",
  );
  // Cross-tenant correction ≡ unknown correction.
  assert.throws(
    () =>
      stack.implementations.recordStatusCorrection({
        scope: { tenantId: "tenant-beta" as typeof TENANT_ALPHA },
        implementationId: registered.implementationAvailable.id,
        status: "unavailable",
        evidenceRefs: [],
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation",
  );
  void MERCHANT_ONE;
});
