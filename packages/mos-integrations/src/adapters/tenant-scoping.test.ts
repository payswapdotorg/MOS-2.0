/**
 * TENANT SCOPING + NO EXISTENCE LEAKS (INTEG-001, §31): all mutable
 * integrations records are tenant/workspace scoped; cross-tenant
 * references are denied and INDISTINGUISHABLE from unknown ones — same
 * record id in another tenant is an independent record; cross-tenant
 * reads return undefined/[] with no error that would reveal existence;
 * instance names are unique per tenant only; the §30 audit log is
 * tenant-isolated; rights contexts do not cross tenants.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Version } from "@mos/contracts";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  BEACON_DEFINITION_INPUT,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  MERCHANT_TWO,
  SCOPE_ALPHA,
  SCOPE_BETA,
  TENANT_ALPHA,
  TENANT_BETA,
  auroraImplementationInput,
  rightsGrantFixture,
  transcribeAvailabilityInput,
} from "../testing/fixtures.js";
import { IntegrationsError } from "../errors.js";

const NOW = () => "2026-04-01T00:00:00.000Z";

test("tenant scoping: the SAME record id in two tenants is TWO independent records with independent versions", () => {
  const stack = composeIntegrationsStack({ now: NOW });
  const sharedId = "provider-definition:shared" as ReturnType<
    typeof stack.definitions.register
  >["id"];

  const alphaV1 = stack.definitions.register({ ...AURORA_DEFINITION_INPUT, id: sharedId });
  const alphaV2 = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: sharedId,
    displayName: "Aurora Social v2 (fictional fixture)",
  });
  const betaV1 = stack.definitions.register({ ...BEACON_DEFINITION_INPUT, id: sharedId, scope: SCOPE_BETA });

  assert.equal(alphaV1.version, 1);
  assert.equal(alphaV2.version, 2);
  // Beta's record with the SAME id starts at version 1 — independent.
  assert.equal(betaV1.version, 1);
  assert.equal(betaV1.providerId, BEACON_DEFINITION_INPUT.providerId);
  assert.deepEqual(stack.definitions.listVersions(TENANT_ALPHA, sharedId), [1, 2]);
  assert.deepEqual(stack.definitions.listVersions(TENANT_BETA, sharedId), [1]);
});

test("tenant scoping: cross-tenant reads are indistinguishable from unknown (no existence leaks)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, definition, implementationAvailable, instance, transcribeAvailability } = registered;

  // Layer 1: definition.
  assert.equal(stack.definitions.get(TENANT_BETA, definition.id, definition.version), undefined);
  assert.equal(stack.definitions.getLatest(TENANT_BETA, definition.id), undefined);
  assert.deepEqual(stack.definitions.listVersions(TENANT_BETA, definition.id), []);
  assert.deepEqual(stack.definitions.listForTenant(TENANT_BETA), []);

  // Layer 2: implementation.
  assert.equal(
    stack.implementations.get(TENANT_BETA, implementationAvailable.id, implementationAvailable.version),
    undefined,
  );
  assert.equal(stack.implementations.getLatest(TENANT_BETA, implementationAvailable.id), undefined);
  assert.deepEqual(stack.implementations.listVersions(TENANT_BETA, implementationAvailable.id), []);
  assert.deepEqual(stack.implementations.listForDefinition(TENANT_BETA, definition.id), []);

  // Layer 3: instance.
  assert.equal(stack.instances.get(TENANT_BETA, instance.id, instance.version), undefined);
  assert.equal(stack.instances.getLatest(TENANT_BETA, instance.id), undefined);
  assert.deepEqual(stack.instances.listVersions(TENANT_BETA, instance.id), []);
  assert.deepEqual(stack.instances.listForTenant(TENANT_BETA), []);

  // Layer 4: availability.
  assert.equal(
    stack.availability.get(TENANT_BETA, transcribeAvailability.id, transcribeAvailability.version),
    undefined,
  );
  assert.equal(stack.availability.getLatest(TENANT_BETA, transcribeAvailability.id), undefined);
  assert.deepEqual(stack.availability.listVersions(TENANT_BETA, transcribeAvailability.id), []);
  assert.deepEqual(
    stack.availability.listForImplementation(TENANT_BETA, implementationAvailable.id),
    [],
  );

  // Call surface: listInstanceCapabilities on a cross-tenant id throws the
  // SAME typed error as a fully unknown one.
  const crossTenant = () =>
    stack.interactions.listInstanceCapabilities(TENANT_BETA, instance.id);
  const unknown = () =>
    stack.interactions.listInstanceCapabilities(TENANT_BETA, "merchant-client-instance:nope" as typeof instance.id);
  const crossTenantError = captureError(crossTenant);
  const unknownError = captureError(unknown);
  assert.ok(crossTenantError instanceof IntegrationsError);
  assert.ok(unknownError instanceof IntegrationsError);
  assert.equal(crossTenantError.code, "unknown-merchant-client-instance");
  assert.equal(crossTenantError.code, unknownError.code);
  assert.equal(crossTenantError.message, unknownError.message);
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

test("tenant scoping: cross-tenant REGISTRATION references are rejected as unknown (no existence leaks)", () => {
  const stack = composeIntegrationsStack({ now: NOW });
  const alphaDefinition = stack.definitions.register(AURORA_DEFINITION_INPUT);

  // Beta implementation referencing ALPHA's definition: unknown reference.
  assert.throws(
    () =>
      stack.implementations.register({
        ...auroraImplementationInput(alphaDefinition.id),
        scope: SCOPE_BETA,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-definition-reference",
  );

  // Beta instance referencing ALPHA's implementation: unknown reference.
  const alphaImplementation = stack.implementations.register({
    ...auroraImplementationInput(alphaDefinition.id),
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_BETA,
    displayName: "beta escrow",
    kind: "api-key",
  });
  assert.throws(
    () =>
      stack.instances.register({
        scope: SCOPE_BETA,
        name: "beta-instance",
        merchantIdentity: MERCHANT_TWO,
        implementationId: alphaImplementation.id,
        implementationVersion: alphaImplementation.version,
        credentialRef,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation-reference",
  );

  // Beta availability referencing ALPHA's implementation: unknown reference.
  assert.throws(
    () =>
      stack.availability.register({
        ...transcribeAvailabilityInput(alphaImplementation.id),
        scope: SCOPE_BETA,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation-reference",
  );
});

test("tenant scoping: instance NAMES are unique per tenant — the same name in another tenant is fine", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  // Same name in beta: allowed (per-tenant uniqueness only).
  const betaDefinition = stack.definitions.register({ ...BEACON_DEFINITION_INPUT, scope: SCOPE_BETA });
  const betaImplementation = stack.implementations.register({
    ...auroraImplementationInput(betaDefinition.id),
    scope: SCOPE_BETA,
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const betaCredential = stack.secrets.declare({
    scope: SCOPE_BETA,
    displayName: "beta escrow",
    kind: "oauth2-refresh-token",
  });
  const betaInstance = stack.instances.register({
    scope: SCOPE_BETA,
    name: "aurora-main", // the SAME name alpha already uses
    merchantIdentity: MERCHANT_TWO,
    implementationId: betaImplementation.id,
    implementationVersion: betaImplementation.version,
    credentialRef: betaCredential,
  });
  assert.equal(betaInstance.name, "aurora-main");

  // Within alpha the name is still taken.
  const alphaCredential = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "second alpha escrow",
    kind: "api-key",
  });
  assert.throws(
    () =>
      stack.instances.register({
        scope: SCOPE_ALPHA,
        name: "aurora-main",
        merchantIdentity: MERCHANT_TWO,
        implementationId: registered.implementationAvailable.id,
        implementationVersion: registered.implementationAvailable.version,
        credentialRef: alphaCredential,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "duplicate-merchant-client-instance",
  );
});

test("tenant scoping: a cross-tenant INVOKE is unresolved — no §30 record lands in EITHER tenant", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, instance } = registered;

  const result = stack.interactions.invoke({
    ...standardInvokeRequest(registered),
    scope: SCOPE_BETA,
    instanceId: instance.id,
  });
  assert.equal(result.outcome, "unresolved-instance");
  if (result.outcome === "unresolved-instance") {
    assert.equal(result.failure.code, "unknown-merchant-client-instance");
  }
  // Neither tenant's audit log grew (nothing was attributable).
  assert.equal(stack.interactions.listInteractionRecords(TENANT_ALPHA).length, 0);
  assert.equal(stack.interactions.listInteractionRecords(TENANT_BETA).length, 0);
});

test("tenant scoping: the §30 audit log is tenant-isolated — beta never sees alpha's records", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  // Alpha interacts.
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    // Beta cannot read it — by tenant, by id, by any filter.
    assert.deepEqual(stack.interactions.listInteractionRecords(TENANT_BETA), []);
    assert.equal(
      stack.interactions.getInteractionRecord(TENANT_BETA, result.record.id),
      undefined,
    );
    // Alpha still sees it.
    assert.equal(stack.interactions.listInteractionRecords(TENANT_ALPHA).length, 1);
  }
});

test("tenant scoping: a beta rights context does not authorize an alpha interaction (no cross-tenant grant laundering)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const betaContext = registered.stack.registerRightsContext({
    scope: SCOPE_BETA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:beta-laundering",
        tenantId: TENANT_BETA,
        grantee: MERCHANT_ONE,
        action: "use",
        subjectRef: AURORA_EXTERNAL_ACCOUNT as string,
      }),
    ],
  });

  const result = registered.stack.interactions.invoke(
    standardInvokeRequest(registered, { rightsContextRef: betaContext }),
  );
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "rights-gate-denied");
    assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
  }
});

test("tenant scoping: scope fields are carried on every record (§31 pin)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, definition, implementationAvailable, instance, transcribeAvailability } = registered;

  assert.equal(definition.scope.tenantId, TENANT_ALPHA);
  assert.equal(implementationAvailable.scope.tenantId, TENANT_ALPHA);
  assert.equal(instance.scope.tenantId, TENANT_ALPHA);
  assert.equal(transcribeAvailability.scope.tenantId, TENANT_ALPHA);

  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  if (result.outcome === "completed") {
    assert.equal(result.record.scope.tenantId, TENANT_ALPHA);
  }

  // Registration with a MISSING scope fails closed at every layer.
  assert.throws(
    () =>
      stack.definitions.register({
        ...AURORA_DEFINITION_INPUT,
        scope: undefined as never,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "invalid-provider-definition",
  );
  assert.throws(
    () =>
      stack.implementations.register({
        ...auroraImplementationInput(definition.id),
        scope: undefined as never,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "invalid-provider-implementation",
  );
});

test("tenant scoping: the version history of a beta correction never touches alpha's record", () => {
  const stack = composeIntegrationsStack({ now: NOW });
  const sharedImplementationId = "provider-implementation:shared" as never;

  const alphaDefinition = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const betaDefinition = stack.definitions.register({ ...BEACON_DEFINITION_INPUT, scope: SCOPE_BETA });

  const alphaImpl = stack.implementations.register({
    ...auroraImplementationInput(alphaDefinition.id),
    id: sharedImplementationId,
  });
  const betaImpl = stack.implementations.register({
    ...auroraImplementationInput(betaDefinition.id),
    scope: SCOPE_BETA,
    id: sharedImplementationId,
  });
  assert.equal(alphaImpl.id, betaImpl.id);

  // Correct BETA's record: alpha's version history is untouched.
  const betaCorrected = stack.implementations.recordStatusCorrection({
    scope: SCOPE_BETA,
    implementationId: betaImpl.id,
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  assert.equal(betaCorrected.version, 2);
  assert.deepEqual(stack.implementations.listVersions(TENANT_ALPHA, alphaImpl.id), [1]);
  assert.deepEqual(stack.implementations.listVersions(TENANT_BETA, betaImpl.id), [1, 2]);
  assert.equal(
    stack.implementations.getLatest(TENANT_ALPHA, alphaImpl.id)?.status,
    "unknown",
  );
  assert.equal(
    stack.implementations.getLatest(TENANT_BETA, betaImpl.id)?.status,
    "available",
  );
  // A correction for the SHARED id scoped to a THIRD unknown tenant is
  // rejected without revealing that the id exists elsewhere.
  assert.throws(
    () =>
      stack.implementations.recordStatusCorrection({
        scope: { tenantId: "tenant-gamma" as typeof TENANT_ALPHA },
        implementationId: sharedImplementationId,
        status: "unavailable",
        evidenceRefs: [],
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation",
  );

  // Sanity: alphaImpl.version is a number (version field type).
  assert.equal(typeof alphaImpl.version, "number");
  void (1 as Version);
});
