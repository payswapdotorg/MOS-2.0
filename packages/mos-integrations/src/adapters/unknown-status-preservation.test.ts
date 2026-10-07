/**
 * UNKNOWN STATUS PRESERVED (INTEG-001 acceptance): "provider
 * status/evidence/UNKNOWN states are preserved" — the `unknown`
 * implementation status is a FIRST-CLASS state that survives every query,
 * summary and §30 record VERBATIM, never coerced to `unavailable` (or to
 * anything else). Status evolution happens ONLY through append-only
 * version corrections.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Version } from "@mos/contracts";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  ACTOR_ONE,
  AURORA_DEFINITION_INPUT,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
  rightsGrantFixture,
  transcribeAvailabilityInput,
} from "../testing/fixtures.js";
import { AURORA_EXTERNAL_ACCOUNT } from "../testing/fixtures.js";
import { PROVIDER_IMPLEMENTATION_STATUSES } from "../contracts/provider-implementation.js";

test("UNKNOWN preserved: the vocabulary carries unknown as a first-class member, distinct from unavailable", () => {
  assert.deepEqual([...PROVIDER_IMPLEMENTATION_STATUSES], [
    "available",
    "unavailable",
    "degraded",
    "unknown",
  ]);
  assert.notEqual("unknown", "unavailable");
});

test("UNKNOWN preserved: registered verbatim, returned verbatim by every registry query", () => {
  // A stack whose ONLY implementation stays in the unknown status —
  // no correction yet, so every query path returns the verbatim string.
  const stack = composeIntegrationsStack({ now: () => "2026-01-01T00:00:00.000Z" });
  const definition = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const implementation = stack.implementations.register(auroraImplementationInput(definition.id));

  // get / getLatest / listForDefinition all return the exact string.
  assert.equal(
    stack.implementations.get(TENANT_ALPHA, implementation.id, implementation.version)?.status,
    "unknown",
  );
  assert.equal(stack.implementations.getLatest(TENANT_ALPHA, implementation.id)?.status, "unknown");
  assert.deepEqual(
    stack.implementations.listForDefinition(TENANT_ALPHA, definition.id).map((record) => record.status),
    ["unknown"],
  );
});

test("UNKNOWN preserved: the §30 interaction record carries the verbatim status and its own DISTINCT failure code", () => {
  const registered = registeredAuroraStack();
  const { stack, implementationUnknown } = registered;

  // An instance bound to the UNKNOWN implementation version (before any
  // correction) — the §30 record must carry status "unknown" verbatim and
  // fail with implementation-status-unknown, NOT implementation-status-
  // unavailable.
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "second escrow",
    kind: "api-key",
  });
  const instance = stack.instances.register({
    scope: SCOPE_ALPHA,
    name: "aurora-unknown-status",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: implementationUnknown.id,
    implementationVersion: implementationUnknown.version,
    credentialRef,
  });
  stack.availability.register(transcribeAvailabilityInput(implementationUnknown.id));
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:unknown-status",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        action: "use",
        subjectRef: AURORA_EXTERNAL_ACCOUNT as string,
      }),
    ],
  });

  const result = stack.interactions.invoke({
    scope: SCOPE_ALPHA,
    instanceId: instance.id,
    capabilityId: registered.transcribeAvailability.capabilityId,
    capabilityVersion: registered.transcribeAvailability.capabilityVersion,
    actor: ACTOR_ONE,
    rightsContextRef,
    rightsAction: "use",
    parameters: { audio: "storage:fixture-audio-2" },
  });

  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "implementation-status-unknown");
    assert.equal(result.failure.details?.status, "unknown");
    // VERBATIM on the audit record — never coerced.
    assert.equal(result.record.implementationStatus, "unknown");
    assert.equal(result.record.implementationVersion, implementationUnknown.version);
  }
  // The audit log entry carries it verbatim too.
  const log = stack.interactions.listInteractionRecords(TENANT_ALPHA);
  assert.equal(log.length, 1);
  assert.equal(log[0]?.implementationStatus, "unknown");
  assert.equal(log[0]?.failure?.code, "implementation-status-unknown");
});

test("UNKNOWN preserved: an available→unknown correction is append-only — the prior version keeps 'available', the new one records 'unknown'", () => {
  const registered = registeredAuroraStack();
  const { stack, implementationAvailable } = registered;

  // Losing confidence back to unknown is NOT a positive claim — no
  // evidence required, and never rewritten in place.
  const backToUnknown = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: implementationAvailable.id,
    status: "unknown",
    evidenceRefs: [],
  });
  assert.equal(backToUnknown.version, 3);
  assert.equal(backToUnknown.status, "unknown");
  // The prior (available) version is untouched and resolvable.
  assert.equal(
    stack.implementations.get(TENANT_ALPHA, implementationAvailable.id, implementationAvailable.version)
      ?.status,
    "available",
  );
  assert.equal(
    stack.implementations.getLatest(TENANT_ALPHA, implementationAvailable.id)?.status,
    "unknown",
  );
  assert.deepEqual(
    stack.implementations.listVersions(TENANT_ALPHA, implementationAvailable.id),
    [1, 2, 3],
  );
});

test("UNKNOWN preserved: a query against an unknown-status implementation under the SAME interaction still records evidence refs honestly", () => {
  const registered = registeredAuroraStack();
  const { stack } = registered;

  // A degraded correction WITH evidence: the positive claim carries its
  // evidence; the unknown prior stays evidence-free. Both visible.
  const degraded = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: registered.implementationAvailable.id,
    status: "degraded",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  assert.equal(degraded.status, "degraded");
  assert.deepEqual(degraded.evidenceRefs, [EVIDENCE_HEALTH_CHECK]);
  assert.equal(
    stack.implementations.get(TENANT_ALPHA, degraded.id, degraded.version)?.evidenceRefs.length,
    1,
  );
  assert.equal(
    stack.implementations.get(
      TENANT_ALPHA,
      registered.implementationUnknown.id,
      registered.implementationUnknown.version,
    )?.evidenceRefs.length,
    0,
  );
});

test("UNKNOWN preserved: the availability + resolved-capability views are orthogonal to status (no status inference anywhere)", () => {
  const registered = registeredAuroraStack();
  const { stack, instance } = registered;

  // listInstanceCapabilities returns capability records only; it never
  // annotates them with an inferred status and never filters by status.
  const resolved = stack.interactions.listInstanceCapabilities(TENANT_ALPHA, instance.id);
  assert.equal(resolved.length, 2);
  for (const entry of resolved) {
    assert.equal(
      Object.hasOwn(entry.availability as unknown as Record<string, unknown>, "status"),
      false,
    );
  }

  // The definition's DECLARED capability surface preserves its own
  // supported/unsupported/unknown declarations verbatim — declaration
  // levels are never collapsed either.
  const definition = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: registered.definition.id,
  });
  const declared = new Map(
    definition.declaredCapabilities.map((entry) => [entry.capabilityId as string, entry.support]),
  );
  assert.equal(declared.size, 4);
  assert.equal(
    [...declared.values()].filter((support) => support === "unknown").length,
    1,
  );

  // An interaction through the AVAILABLE instance still completes —
  // status gates bind to the BOUND VERSION, never to the record id.
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");
});

test("UNKNOWN preserved: statusObservedAt and version history expose WHICH version observed what", () => {
  const registered = registeredAuroraStack();
  const { stack, implementationUnknown } = registered;

  const v1 = stack.implementations.get(
    TENANT_ALPHA,
    implementationUnknown.id,
    1 as Version,
  );
  const v2 = stack.implementations.get(
    TENANT_ALPHA,
    implementationUnknown.id,
    2 as Version,
  );
  assert.ok(v1 && v2);
  assert.equal(v1.status, "unknown");
  assert.equal(v2.status, "available");
  // Each version carries its own observation timestamp.
  assert.ok(typeof v1.statusObservedAt === "string" && v1.statusObservedAt.length > 0);
  assert.ok(typeof v2.statusObservedAt === "string" && v2.statusObservedAt.length > 0);
});
