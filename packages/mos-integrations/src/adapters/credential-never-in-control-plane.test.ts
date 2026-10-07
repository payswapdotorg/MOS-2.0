/**
 * CREDENTIAL-NEVER-IN-CONTROL-PLANE (INTEG-001 structural pin): the
 * MerchantClientInstance — and every other record in the package — carries
 * a CredentialRef HANDLE ONLY; there is NO credential-value surface
 * anywhere in the control plane. The compile-time exact-keyset pins live
 * in contracts/type-pins.ts; this file is their RUNTIME twin:
 * - strict-shape registration: a record carrying ANY property beyond its
 *   declared field set (e.g. a smuggled `secret`/`accessToken` field) is
 *   rejected with a typed error naming the unexpected fields;
 * - stored records have EXACTLY the declared keysets;
 * - a deep key-scan over everything the control plane returns finds no
 *   credential-value-shaped key except the `credentialRef` handle;
 * - the secret-store double exposes NO API that returns credential
 *   material (declare → handle; resolves → boolean).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Version } from "@mos/contracts";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  AURORA_DEFINITION_INPUT,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
  transcribeAvailabilityInput,
} from "../testing/fixtures.js";
import { IntegrationsError } from "../errors.js";
import { createInMemoryProviderInteractionPort } from "./in-memory-provider-interaction.js";
import type { MerchantClientInstance } from "../contracts/merchant-client-instance.js";

const NOW = () => "2026-01-01T00:00:00.000Z";

function expectInvalid(
  fn: () => unknown,
  code: string,
): void {
  assert.throws(
    fn,
    (error: unknown) => error instanceof IntegrationsError && error.code === code,
  );
}

test("credential pin: a smuggled credential-VALUE field on an instance registration is rejected fail-closed", () => {
  const stack = composeIntegrationsStack({ now: NOW });
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

  // The smuggle attempt: an extra `secret` property alongside the handle.
  const smuggled = {
    scope: SCOPE_ALPHA,
    name: "smuggled-secret",
    merchantIdentity: MERCHANT_ONE,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
    secret: "super-secret-value",
  };
  expectInvalid(() => stack.instances.register(smuggled), "invalid-merchant-client-instance");

  // And the classic OAuth pair: accessToken + refreshToken.
  expectInvalid(
    () =>
      stack.instances.register({
        ...smuggled,
        name: "smuggled-tokens",
        accessToken: "value",
        refreshToken: "value",
      } as unknown as typeof smuggled),
    "invalid-merchant-client-instance",
  );

  // The error names the unexpected fields (actionable, fail-closed).
  assert.throws(
    () => stack.instances.register(smuggled),
    (error: unknown) =>
      error instanceof IntegrationsError &&
      error.details.unexpectedFields !== undefined &&
      (error.details.unexpectedFields as string[]).includes("secret"),
  );
});

test("credential pin: strict shape at EVERY registry input — definitions, implementations, availability, corrections, rebinds, interaction requests", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, implementationAvailable, instance } = registered;

  // Layer 1 — definitions.
  expectInvalid(
    () =>
      stack.definitions.register({
        ...AURORA_DEFINITION_INPUT,
        apiKey: "value",
      } as unknown as typeof AURORA_DEFINITION_INPUT),
    "invalid-provider-definition",
  );

  // Layer 2 — implementations (registration + correction).
  expectInvalid(
    () =>
      stack.implementations.register({
        ...auroraImplementationInput(registered.definition.id),
        password: "value",
      } as unknown as ReturnType<typeof auroraImplementationInput>),
    "invalid-provider-implementation",
  );
  expectInvalid(
    () =>
      stack.implementations.recordStatusCorrection({
        scope: SCOPE_ALPHA,
        implementationId: implementationAvailable.id,
        status: "unavailable",
        evidenceRefs: [],
        apiToken: "value",
      } as unknown as Parameters<typeof stack.implementations.recordStatusCorrection>[0]),
    "invalid-provider-implementation",
  );

  // Layer 3 — rebinds.
  expectInvalid(
    () =>
      stack.instances.recordRebind({
        scope: SCOPE_ALPHA,
        instanceId: instance.id,
        implementationId: implementationAvailable.id,
        implementationVersion: implementationAvailable.version,
        secret: "value",
      } as unknown as Parameters<typeof stack.instances.recordRebind>[0]),
    "invalid-merchant-client-instance",
  );

  // Layer 4 — availability.
  expectInvalid(
    () =>
      stack.availability.register({
        ...transcribeAvailabilityInput(implementationAvailable.id),
        bearerToken: "value",
      } as unknown as ReturnType<typeof transcribeAvailabilityInput>),
    "invalid-availability-capability",
  );

  // Call surface — interaction requests.
  expectInvalid(
    () =>
      stack.interactions.invoke({
        ...standardInvokeRequest(registered),
        credential: "value",
      } as unknown as Parameters<typeof stack.interactions.invoke>[0]),
    "invalid-interaction-request",
  );
});

test("credential pin: stored records have EXACTLY the declared keysets — the handle is the only credential-adjacent field", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { definition, implementationAvailable, instance, transcribeAvailability } = registered;

  assert.deepEqual(
    Object.keys(definition).sort(),
    [
      "declaredCapabilities",
      "displayName",
      "id",
      "kind",
      "providerId",
      "scope",
      "transport",
      "version",
    ],
  );
  assert.deepEqual(
    Object.keys(implementationAvailable).sort(),
    [
      "definitionId",
      "definitionVersion",
      "errorModel",
      "evidenceModel",
      "evidenceRefs",
      "id",
      "label",
      "providerId",
      "rateLimitObservation",
      "scope",
      "status",
      "statusObservedAt",
      "version",
    ],
  );
  assert.deepEqual(
    Object.keys(instance).sort(),
    [
      "createdAt",
      "credentialRef",
      "externalAccount",
      "id",
      "implementationId",
      "implementationVersion",
      "merchantIdentity",
      "name",
      "scope",
      "version",
    ],
  );
  assert.deepEqual(
    Object.keys(transcribeAvailability).sort(),
    [
      "capabilityId",
      "capabilityVersion",
      "constraints",
      "createdAt",
      "id",
      "implementationId",
      "scope",
      "version",
    ],
  );
});

test("credential pin: a deep key-scan over the ENTIRE control-plane state finds no credential-value key — only the handle", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack } = registered;

  // Interact so the §30 audit log is populated too.
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");

  // (label, record) pairs across every layer the control plane can return.
  const everything: ReadonlyArray<readonly [string, unknown]> = [
    ...stack.definitions.listForTenant(TENANT_ALPHA).flatMap((id) =>
      stack.definitions
        .listVersions(TENANT_ALPHA, id)
        .map((version) => ["definition", stack.definitions.get(TENANT_ALPHA, id, version as Version)] as const),
    ),
    ...stack.implementations
      .listForDefinition(TENANT_ALPHA, registered.definition.id)
      .flatMap((record) =>
        stack.implementations
          .listVersions(TENANT_ALPHA, record.id)
          .map((version) => ["implementation", stack.implementations.get(TENANT_ALPHA, record.id, version as Version)] as const),
      ),
    ...stack.instances.listForTenant(TENANT_ALPHA).flatMap((id) =>
      stack.instances
        .listVersions(TENANT_ALPHA, id)
        .map((version) => ["instance", stack.instances.get(TENANT_ALPHA, id, version as Version)] as const),
    ),
    ...stack.availability
      .listForImplementation(TENANT_ALPHA, registered.implementationAvailable.id)
      .map((record) => ["availability", stack.availability.getLatest(TENANT_ALPHA, record.id)] as const),
    ...stack.interactions.listInteractionRecords(TENANT_ALPHA).map((record) => ["interaction-record", record] as const),
  ];
  // The scan found real records at every layer.
  assert.equal(new Set(everything.map(([label]) => label)).size, 5);

  const valueShapedKeys: string[] = [];
  const handleOwners = new Set<string>();
  function scan(value: unknown, label: string, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, label, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (/credential|secret|token|password|apikey|passphrase/i.test(key)) {
          if (key === "credentialRef") {
            handleOwners.add(label);
          } else {
            valueShapedKeys.push(`${label}:${path}.${key}`);
          }
        }
        scan(child, label, `${path}.${key}`);
      }
    }
  }
  everything.forEach(([label, record]) => scan(record, label, "$"));

  // No credential-VALUE-shaped key exists anywhere in the control plane.
  assert.deepEqual(valueShapedKeys, []);
  // The ONLY credential-adjacent key is the handle, and it appears
  // exclusively on instance records — never on definitions,
  // implementations, availability or §30 audit records.
  assert.deepEqual([...handleOwners], ["instance"]);
});

test("credential pin: MerchantClientInstance has no credential-value surface — the type-level guarantee mirrored at runtime", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { instance, stack } = registered;

  // The instance record exposes exactly one credential-adjacent property:
  // the opaque handle, a string that resolves at the seam.
  const credentialProps = Object.keys(instance as unknown as Record<string, unknown>).filter(
    (key) => /credential/i.test(key),
  );
  assert.deepEqual(credentialProps, ["credentialRef"]);
  assert.equal(typeof instance.credentialRef, "string");
  assert.ok(stack.secrets.resolves(instance.credentialRef));
  // The handle is an opaque ref, NOT a value: it never round-trips any
  // credential-shaped payload through the control plane (the §30 record
  // does not even carry it — only the rights frame handle does).
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  if (result.outcome === "completed") {
    const serialized = JSON.stringify(result.record);
    assert.equal(serialized.includes(instance.credentialRef as string), false);
  }
});

test("credential pin: the secret-store double escrows NO material — declare returns a HANDLE, resolves returns a BOOLEAN", () => {
  const stack = composeIntegrationsStack({ now: NOW });
  const ref = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "escrow",
    kind: "oauth2-refresh-token",
  });
  // The only two methods of the seam: a handle out, a boolean out.
  assert.equal(typeof ref, "string");
  assert.equal(stack.secrets.resolves(ref), true);
  assert.equal(stack.secrets.resolves("credential-999999" as typeof ref), false);
  // Malformed declarations fail closed at the seam itself.
  assert.throws(() =>
    stack.secrets.declare({ scope: SCOPE_ALPHA, displayName: "  ", kind: "api-key" }),
  );
  assert.throws(() =>
    stack.secrets.declare({
      scope: SCOPE_ALPHA,
      displayName: "x",
      kind: "api-key",
      value: "smuggled",
    } as unknown as { scope: typeof SCOPE_ALPHA; displayName: string; kind: string }),
  );
});

test("credential pin: instances type-check the full MerchantClientInstance shape (compile-time twin reminder)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  // A structural assertion the compiler already guarantees: the record is
  // assignable to the exported contract type with EXACTLY these members.
  const instance: MerchantClientInstance = registered.instance;
  assert.ok(instance.id && instance.version && instance.scope && instance.name);
  assert.ok(instance.merchantIdentity && instance.implementationId);
  assert.ok(instance.implementationVersion && instance.credentialRef && instance.createdAt);
});

test("credential pin: the §30 audit record carries the RIGHTS frame handle — never the credential handle", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, instance } = registered;
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.record.rightsContextRef, registered.rightsContextRef);
    // No credential material of ANY shape on the audit record.
    assert.equal(
      Object.hasOwn(result.record as unknown as Record<string, unknown>, "credentialRef"),
      false,
    );
    assert.equal(
      JSON.stringify(result.record).includes(instance.credentialRef as string),
      false,
    );
  }
});

test("credential pin: the transport seam receives the HANDLE, never a value (spy-pinned at the boundary)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { stack, instance } = registered;

  // Wrap the composed transport with a spy and rebuild ONLY the call
  // surface over the same registries — the outbound request is captured
  // exactly as a real adapter would receive it.
  const seen: Parameters<typeof stack.transport.send>[0][] = [];
  const spyTransport = {
    send(request: Parameters<typeof stack.transport.send>[0]) {
      seen.push(request);
      return stack.transport.send(request);
    },
  };
  const interactions = createInMemoryProviderInteractionPort({
    instances: stack.instances,
    implementations: stack.implementations,
    availability: stack.availability,
    capabilities: stack.capabilities,
    rightsGate: stack.rightsGate,
    transport: spyTransport,
    now: NOW,
  });

  const result = interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");
  assert.equal(seen.length, 1);
  const outbound = seen[0];
  assert.ok(outbound);
  // The request carries the opaque handle (a string), never a value.
  assert.equal(outbound.credentialRef, instance.credentialRef);
  assert.equal(
    Object.keys(outbound).filter((key) => /secret|token|password|apikey/i.test(key)).length,
    0,
  );
  // The echo output contains no credential-shaped key either.
  if (result.outcome === "completed") {
    assert.equal(/secret|token|password|apikey/i.test(JSON.stringify(result.output)), false);
  }
});
