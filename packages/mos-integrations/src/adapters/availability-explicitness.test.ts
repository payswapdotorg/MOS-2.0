/**
 * CAPABILITY INSTANCES ARE EXPLICIT (INTEG-001 acceptance): "capability
 * instances are explicit... an instance without a capability record
 * provides NOTHING — pinned". Availability derives ONLY from explicit
 * layer-4 AvailabilityCapability records — never from the definition's
 * DECLARED surface (a "supported" declaration creates no availability),
 * never by parity assumption, never by default. Registration of an
 * availability whose capability refs do not resolve in the REAL
 * @mos/capabilities vocabulary is rejected fail-closed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AccountRef, Version } from "@mos/contracts";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  CAP_DETECT_SCENES,
  CAP_EVALUATE,
  CAP_TRANSCRIBE,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
  rightsGrantFixture,
} from "../testing/fixtures.js";
import { IntegrationsError } from "../errors.js";

test("explicitness: an instance with NO availability records provides NOTHING", () => {
  const stack = composeIntegrationsStack({ now: () => "2026-01-01T00:00:00.000Z" });
  const definition = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const implementation = stack.implementations.register({
    ...auroraImplementationInput(definition.id),
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "escrow",
    kind: "api-key",
  });
  const instance = stack.instances.register({
    scope: SCOPE_ALPHA,
    name: "empty-capability-surface",
    merchantIdentity: MERCHANT_ONE,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
  });

  // The definition DECLARES transcribe_audio supported — but there is no
  // layer-4 record, so the resolved view is EMPTY.
  assert.deepEqual(stack.interactions.listInstanceCapabilities(TENANT_ALPHA, instance.id), []);

  // With an ADEQUATE grant over the instance-derived subject, the rights
  // gate PASSES — and the availability gate still fails closed: nothing
  // is provided without an explicit record.
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:empty-surface",
        tenantId: TENANT_ALPHA,
        grantee: MERCHANT_ONE,
        action: "use",
        subjectRef: `merchant-client-instance:${instance.id as string}`,
      }),
    ],
  });
  const result = stack.interactions.invoke({
    scope: SCOPE_ALPHA,
    instanceId: instance.id,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: 1 as Version,
    actor: MERCHANT_ONE,
    rightsContextRef,
    rightsAction: "use",
    parameters: { audio: "storage:fixture" },
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "capability-not-available-on-instance");
  }
});

test("explicitness: a definition's 'supported' DECLARATION is not availability — the call fails closed", () => {
  const registered = registeredAuroraStack();
  const { stack } = registered;

  // transcribe_audio is DECLARED supported by the Aurora definition, and
  // the implementation is AVAILABLE — but this instance binds an
  // implementation with no transcribe availability record.
  const definition = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const implementation = stack.implementations.register({
    ...auroraImplementationInput(definition.id),
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "second escrow",
    kind: "api-key",
  });
  const externalAccount = "account:aurora-merchant-two" as AccountRef;
  const instance = stack.instances.register({
    scope: SCOPE_ALPHA,
    name: "declared-but-not-explicit",
    merchantIdentity: MERCHANT_ONE,
    externalAccount,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
  });
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:declared-not-explicit",
        tenantId: TENANT_ALPHA,
        grantee: MERCHANT_ONE,
        action: "use",
        subjectRef: externalAccount as string,
      }),
    ],
  });

  const result = stack.interactions.invoke({
    scope: SCOPE_ALPHA,
    instanceId: instance.id,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: 1 as Version,
    actor: MERCHANT_ONE,
    rightsContextRef,
    rightsAction: "use",
    parameters: { audio: "storage:fixture" },
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "capability-not-available-on-instance");
    // The §30 record exists (the attempt was attributable).
    assert.equal(result.record.failure?.code, "capability-not-available-on-instance");
  }
});

test("explicitness: the EXACT capability version must be recorded — v1 recorded, v2 requested → nothing", () => {
  const registered = registeredAuroraStack();
  const { stack } = registered;

  const result = stack.interactions.invoke(
    standardInvokeRequest(registered, { capabilityVersion: 2 as Version }),
  );
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "capability-not-available-on-instance");
    assert.equal(result.failure.details?.capabilityVersion, 2);
  }
});

test("explicitness: a capability id that resolves NOWHERE in the vocabulary cannot even be REGISTERED (fail-closed)", () => {
  const registered = registeredAuroraStack();
  const { stack, implementationAvailable } = registered;

  assert.throws(
    () =>
      stack.availability.register({
        scope: SCOPE_ALPHA,
        implementationId: implementationAvailable.id,
        capabilityId: "no_such_capability" as typeof CAP_TRANSCRIBE,
        capabilityVersion: 1 as Version,
        constraints: [],
      }),
    (error: unknown) => error instanceof IntegrationsError && error.code === "unknown-capability-reference",
  );

  // A REGISTERED id at an UNREGISTERED version is equally unresolvable.
  assert.throws(
    () =>
      stack.availability.register({
        scope: SCOPE_ALPHA,
        implementationId: implementationAvailable.id,
        capabilityId: CAP_TRANSCRIBE,
        capabilityVersion: 9 as Version,
        constraints: [],
      }),
    (error: unknown) => error instanceof IntegrationsError && error.code === "unknown-capability-reference",
  );
});

test("explicitness: unregistered capability refs on an availability are excluded from the resolved view (provide nothing)", () => {
  // The registry REJECTS unresolvable refs at registration; the resolved
  // view additionally filters anything that no longer resolves — belt and
  // braces. Model the second line with a capability registry that has the
  // seed catalog but an availability pointing at a capability whose
  // version is present: the view returns it RESOLVED with the contract.
  const registered = registeredAuroraStack();
  const { stack, instance } = registered;

  const resolved = stack.interactions.listInstanceCapabilities(TENANT_ALPHA, instance.id);
  assert.equal(resolved.length, 2);
  for (const entry of resolved) {
    // Each entry carries BOTH the explicit record AND the canonical
    // contract the ref resolved to.
    assert.ok(entry.availability.capabilityId);
    assert.equal(entry.capability.id, entry.availability.capabilityId);
    assert.equal(entry.capability.version, entry.availability.capabilityVersion);
  }
  const ids = resolved.map((entry) => entry.capability.id as string).sort();
  assert.deepEqual(ids, ["generate_voice", "transcribe_audio"]);
});

test("explicitness: availability binds to the implementation IDENTITY — status corrections never flip the capability surface", () => {
  const registered = registeredAuroraStack();
  const { stack, implementationAvailable, instance } = registered;

  // Correct the implementation status (available → degraded): the
  // availability records STILL cover the implementation — the surface
  // does not flip with status corrections.
  const degraded = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: implementationAvailable.id,
    status: "degraded",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const resolved = stack.interactions.listInstanceCapabilities(TENANT_ALPHA, instance.id);
  assert.equal(resolved.length, 2);

  // The instance is EXPLICITLY rebound to the degraded version (no silent
  // float to latest): the call now completes WITH the degraded warning —
  // status gates, not capability gates, govern proceeding.
  const rebound = stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: instance.id,
    implementationId: degraded.id,
    implementationVersion: degraded.version,
  });
  const result = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    instanceId: rebound.id,
  });
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.ok(
      result.record.warnings.some((warning) => warning.code === "implementation-degraded"),
    );
    assert.equal(result.record.implementationStatus, "degraded");
  }
});

test("explicitness: availability on implementation A provides nothing through an instance of implementation B", () => {
  const registered = registeredAuroraStack();
  const { stack } = registered;

  // A SECOND implementation of the SAME definition with no availability.
  const second = stack.implementations.register({
    ...auroraImplementationInput(registered.definition.id),
    label: "bare-fallback",
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "third escrow",
    kind: "session-cookie",
  });
  const bareInstance = stack.instances.register({
    scope: SCOPE_ALPHA,
    name: "aurora-bare",
    merchantIdentity: MERCHANT_ONE,
    // SAME external account boundary: the rights grant covers it, so the
    // rights gate PASSES and the AVAILABILITY gate is what fails.
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: second.id,
    implementationVersion: second.version,
    credentialRef,
  });
  assert.deepEqual(
    stack.interactions.listInstanceCapabilities(TENANT_ALPHA, bareInstance.id),
    [],
  );

  // The capability exists in the vocabulary AND is available on the OTHER
  // implementation — still nothing for this instance (no parity, no
  // sibling inference).
  const result = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    instanceId: bareInstance.id,
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "capability-not-available-on-instance");
  }
});

test("explicitness: the declared surface's 'unsupported' and 'unknown' declarations never become availability either", () => {
  const registered = registeredAuroraStack();
  const { stack, instance } = registered;

  // evaluate_content is DECLARED unsupported; detect_scenes is declared
  // supported but has NO availability record. Neither resolves.
  const resolved = stack.interactions.listInstanceCapabilities(TENANT_ALPHA, instance.id);
  const resolvedIds = resolved.map((entry) => entry.capability.id as string);
  assert.equal(resolvedIds.includes(CAP_EVALUATE as string), false);
  assert.equal(resolvedIds.includes(CAP_DETECT_SCENES as string), false);

  // Invoking the declared-unsupported capability: same explicit gate.
  const result = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    capabilityId: CAP_EVALUATE,
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "capability-not-available-on-instance");
  }
});
