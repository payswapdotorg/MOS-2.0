/**
 * W9-B adversarial regression probes (production/engine/security sweep) —
 * the @mos/integrations registries + §30 interaction plane.
 *
 * Attack probes, shaped the way a hostile caller or a future bug would:
 *
 *  - ownership (the W4-B/W8-A clone-then-freeze class): every registry used
 *    to store `deepFreeze({ ...literal, scope: input.scope, ... })` — a
 *    shallow literal whose NESTED caller objects (the scope, the transport
 *    declaration, capability constraints) were embedded by reference and
 *    then frozen IN PLACE by the recursive deep-freeze. The caller's own
 *    objects were mutated by the authority (frozen), and any alias kept
 *    after registration could rewrite the STORED record's tenant identity.
 *    The structuredClone fixes store private copies; these probes are the
 *    pinning tests;
 *  - hostile id factories (the W3-A class): the availability registry's
 *    by-implementation index used a `\u0000`-delimited composite key —
 *    delimiter-laden tenant ids must never alias another tenant's
 *    implementation listing (JSON array keys are injective);
 *  - §30 interaction-record ownership: the caller's live request objects
 *    (scope above all) are never aliased by the stored audit record nor
 *    frozen in place (the mirrored distribution fix, pinned here).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { TenantId, TenantScope, Version } from "@mos/contracts";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  CAP_TRANSCRIBE,
  CAP_VERSION_1,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
} from "../testing/fixtures.js";

const now = (): string => "2026-06-01T00:00:00.000Z";
const version = (value: number): Version => value as Version;

const scopeOf = (tenantId: string): TenantScope => ({
  tenantId: tenantId as TenantScope["tenantId"],
});

// ---------------------------------------------------------------------------
// Provider-definition registry — ownership (clone-then-freeze fix pin)
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's definition input after register cannot change the stored definition (and the caller's objects are never frozen)", () => {
  const stack = composeIntegrationsStack({ now });
  const hostileScope = scopeOf("tenant-alpha");
  // A DEEP copy the test owns (the shared fixture constant must stay
  // pristine for the other probes — exactly the caller-ownership point).
  const input = {
    ...structuredClone(AURORA_DEFINITION_INPUT),
    scope: hostileScope,
  };
  const record = stack.definitions.register(input);
  const snapshot = JSON.stringify(record);

  // The attack: rewrite the caller-retained declaration objects — under the
  // pre-fix shallow spread these were the STORED record's own nested objects.
  (input.transport as { transportKind?: string }).transportKind = "smuggled-transport";
  (input.transport.authentication as { kind?: string }).kind = "smuggled-auth";
  (input.declaredCapabilities as { 0?: { support?: string } })[0]!.support = "unsupported";
  (hostileScope as { tenantId?: string }).tenantId = "tenant-forged";

  const stored = stack.definitions.getLatest(TENANT_ALPHA, record.id);
  assert.ok(stored !== undefined);
  assert.equal(JSON.stringify(stored), snapshot, "the stored definition is bit-for-bit unchanged");
  assert.equal((stored.transport as { transportKind?: string }).transportKind, "http-rest");
  assert.equal(stored.scope.tenantId, TENANT_ALPHA);
  // Ownership: the caller's objects were NOT frozen in place.
  assert.ok(!Object.isFrozen(input.transport));
  assert.ok(!Object.isFrozen(input.transport.authentication));
  assert.ok(!Object.isFrozen(input.declaredCapabilities));
  assert.ok(!Object.isFrozen(hostileScope));
  // The stored record itself is deep-frozen.
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.transport));
});

test("W9-B probe: prior definition versions stay bit-for-bit after later versions register", () => {
  const stack = composeIntegrationsStack({ now });
  const first = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: "provider-definition:w9b-chain" as never,
  });
  const snapshot = JSON.stringify(first);
  const second = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: "provider-definition:w9b-chain" as never,
    displayName: "Aurora Social v2 (fictional fixture)",
  });
  assert.equal(second.version, version(2));
  // The EXACT v1 read stays bit-for-bit; the latest is v2.
  assert.equal(
    JSON.stringify(stack.definitions.get(TENANT_ALPHA, first.id, version(1))),
    snapshot,
  );
  assert.equal(stack.definitions.getLatest(TENANT_ALPHA, first.id)?.version, version(2));
  assert.deepEqual(stack.definitions.listVersions(TENANT_ALPHA, first.id), [
    version(1),
    version(2),
  ]);
});

// ---------------------------------------------------------------------------
// Merchant-client instance registry — ownership + append-only rebind
// ---------------------------------------------------------------------------

function instanceInput(stack: ReturnType<typeof composeIntegrationsStack>, scope: TenantScope) {
  const definition = stack.definitions.register({ ...AURORA_DEFINITION_INPUT, scope });
  const implementation = stack.implementations.register({
    ...auroraImplementationInput(definition.id),
    scope,
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const credentialRef = stack.secrets.declare({
    scope,
    displayName: "probe escrow",
    kind: "api-key",
  });
  return {
    scope,
    name: "w9b-probe-instance",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
  };
}

test("W9-B probe: mutating the caller's instance registration input after register cannot change the stored instance", () => {
  const stack = composeIntegrationsStack({ now });
  const hostileScope = scopeOf("tenant-alpha");
  const input = instanceInput(stack, hostileScope);
  const record = stack.instances.register(input);
  const snapshot = JSON.stringify(record);

  // The attack: rewrite the caller-owned scope AFTER the authority took it.
  (hostileScope as { tenantId?: string }).tenantId = "tenant-forged";

  const stored = stack.instances.getLatest(TENANT_ALPHA, record.id);
  assert.ok(stored !== undefined);
  assert.equal(JSON.stringify(stored), snapshot);
  assert.equal(stored.scope.tenantId, TENANT_ALPHA);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.scope));
  assert.ok(!Object.isFrozen(hostileScope), "the caller's scope object was not frozen in place");
});

test("W9-B probe: an append-only rebind keeps the prior instance version bit-for-bit (and owns its copy)", () => {
  const stack = composeIntegrationsStack({ now });
  const scope = scopeOf("tenant-alpha");
  const input = instanceInput(stack, scope);
  const first = stack.instances.register(input);
  const firstSnapshot = JSON.stringify(first);

  const rebind = stack.instances.recordRebind({
    scope,
    instanceId: first.id,
    implementationId: input.implementationId,
    implementationVersion: input.implementationVersion,
  });
  assert.equal(rebind.version, version(2));

  // The attack: rewrite the caller-held scope after the rebind.
  (scope as { tenantId?: string }).tenantId = "tenant-forged";
  const storedFirst = stack.instances.get(TENANT_ALPHA, first.id, version(1));
  assert.ok(storedFirst !== undefined);
  assert.equal(JSON.stringify(storedFirst), firstSnapshot, "v1 stays bit-for-bit");
  assert.equal(storedFirst.scope.tenantId, TENANT_ALPHA);
  assert.ok(!Object.isFrozen(scope));
});

// ---------------------------------------------------------------------------
// Availability registry — hostile delimiter-laden tenant ids + ownership
// ---------------------------------------------------------------------------

test("W9-B probe: hostile delimiter-laden tenant ids never alias another tenant's implementation availability", () => {
  const stack = composeIntegrationsStack({ now });
  const hostileTenantId = ("tenant-alpha\u0000impl-w9b") as TenantId;
  const hostileScope = scopeOf(hostileTenantId as string);

  const honestInput = instanceInput(stack, SCOPE_ALPHA);
  const honestDefinition = stack.definitions.register({ ...AURORA_DEFINITION_INPUT, scope: SCOPE_ALPHA });
  void honestDefinition;
  const hostileDefinition = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    scope: hostileScope,
    displayName: "Hostile Aurora (fictional fixture)",
  });
  const hostileImplementation = stack.implementations.register({
    ...auroraImplementationInput(hostileDefinition.id),
    scope: hostileScope,
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const hostileCredential = stack.secrets.declare({
    scope: hostileScope,
    displayName: "hostile escrow",
    kind: "api-key",
  });
  const hostileInstance = stack.instances.register({
    scope: hostileScope,
    name: "w9b-hostile-instance",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: hostileImplementation.id,
    implementationVersion: hostileImplementation.version,
    credentialRef: hostileCredential,
  });
  void hostileInstance;
  void honestInput;

  // Both tenants record the SAME availability id over their own
  // implementations (the OLD `\u0000` composite key blurred exactly this).
  const availabilityId = "availability:w9b-probe" as never;
  const constraints = [{ kind: "rate-limit", parameters: { requestsPerWindow: 60, windowMs: 60_000 } }];
  const honestAvailability = stack.availability.register({
    scope: SCOPE_ALPHA,
    id: availabilityId,
    implementationId: honestInput.implementationId,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: CAP_VERSION_1,
    constraints: [],
  });
  const hostileAvailability = stack.availability.register({
    scope: hostileScope,
    id: availabilityId,
    implementationId: hostileImplementation.id,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: CAP_VERSION_1,
    constraints,
  });
  assert.equal(honestAvailability.version, version(1));
  assert.equal(hostileAvailability.version, version(1), "each tenant owns an independent record");

  // Per-implementation listings stay exact per tenant.
  assert.deepEqual(
    stack.availability
      .listForImplementation(TENANT_ALPHA, honestInput.implementationId)
      .map((record) => record.scope.tenantId),
    [TENANT_ALPHA],
  );
  assert.deepEqual(
    stack.availability
      .listForImplementation(hostileTenantId, hostileImplementation.id)
      .map((record) => record.scope.tenantId),
    [hostileTenantId],
  );
  // Cross-tenant reads stay scoped: the SAME availability id resolves to
  // each tenant's OWN record (independent per-tenant namespaces, §31).
  assert.equal(
    stack.availability.get(TENANT_ALPHA, honestAvailability.id, version(1))?.scope.tenantId,
    TENANT_ALPHA,
  );
  assert.equal(
    stack.availability.get(hostileTenantId, hostileAvailability.id, version(1))?.scope.tenantId,
    hostileTenantId,
  );
});

test("W9-B probe: mutating the caller's availability input after register cannot change the stored record", () => {
  const stack = composeIntegrationsStack({ now });
  const input = instanceInput(stack, SCOPE_ALPHA);
  const hostileScope = scopeOf("tenant-alpha");
  const constraints = [{ kind: "rate-limit", parameters: { requestsPerWindow: 60, windowMs: 60_000 } }];
  const record = stack.availability.register({
    scope: hostileScope,
    implementationId: input.implementationId,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: CAP_VERSION_1,
    constraints,
  });
  const snapshot = JSON.stringify(record);

  // The attack: rewrite the caller-retained scope + constraint objects.
  (hostileScope as { tenantId?: string }).tenantId = "tenant-forged";
  (constraints[0]!.parameters as { requestsPerWindow?: number }).requestsPerWindow = 1e9;

  const stored = stack.availability.getLatest(TENANT_ALPHA, record.id);
  assert.ok(stored !== undefined);
  assert.equal(JSON.stringify(stored), snapshot);
  assert.equal(stored.scope.tenantId, TENANT_ALPHA);
  assert.equal(
    (stored.constraints[0]!.parameters as { requestsPerWindow?: number }).requestsPerWindow,
    60,
  );
  assert.ok(!Object.isFrozen(hostileScope));
  assert.ok(!Object.isFrozen(constraints[0]!));
  assert.ok(!Object.isFrozen(constraints[0]!.parameters));
});

// ---------------------------------------------------------------------------
// §30 provider-interaction records — ownership (the mirrored distribution fix)
// ---------------------------------------------------------------------------

test("W9-B probe: the caller mutating its request scope after invoke cannot rewrite the §30 interaction record", () => {
  const registered = registeredAuroraStack();
  const hostileScope = scopeOf("tenant-alpha");
  const request = {
    ...standardInvokeRequest(registered),
    scope: hostileScope,
  };
  const result = registered.stack.interactions.invoke(request);
  assert.equal(result.outcome, "completed");

  // The attack: rewrite the caller-owned scope after the §30 record was
  // emitted (pre-fix: the record ALIASED this object and the deep-freeze
  // had frozen the CALLER's object in place).
  (hostileScope as { tenantId?: string }).tenantId = "tenant-forged";

  const records = registered.stack.interactions.listInteractionRecords(TENANT_ALPHA);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.scope.tenantId, TENANT_ALPHA);
  assert.ok(Object.isFrozen(records[0]));
  assert.ok(Object.isFrozen(records[0]?.scope));
  // Ownership: the caller's scope object was NOT frozen in place.
  assert.ok(!Object.isFrozen(hostileScope));
  // The forged tenant sees no records (§31 isolation holds post-attack).
  assert.deepEqual(
    registered.stack.interactions.listInteractionRecords("tenant-forged" as TenantId),
    [],
  );
});
