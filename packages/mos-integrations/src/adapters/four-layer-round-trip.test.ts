/**
 * Four-layer structure round-trip with VERSIONING AT EACH LAYER
 * (INTEG-001 acceptance): ProviderDefinition → ProviderImplementation →
 * MerchantClientInstance → AvailabilityCapability, composed through the
 * REAL capability vocabulary and the REAL rights evaluation rule (see
 * src/testing/compose-integrations-stack.ts), with append-only version
 * corrections at every layer: prior versions stay resolvable and are never
 * rewritten.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Version } from "@mos/contracts";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import {
  ACTOR_ONE,
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  CAP_DETECT_SCENES,
  CAP_EVALUATE,
  CAP_GENERATE_VOICE,
  CAP_TRANSCRIBE,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
  generateVoiceAvailabilityInput,
  rightsGrantFixture,
  transcribeAvailabilityInput,
} from "../testing/fixtures.js";
import { IntegrationsError } from "../errors.js";
import { providerInteractionSubject } from "./in-memory-provider-interaction.js";

const FIXED_NOW = "2026-01-01T00:00:00.000Z";

test("four-layer round-trip: definition → implementation → instance → capability, with versioning at each layer", () => {
  const stack = composeIntegrationsStack({ now: () => FIXED_NOW });

  // ---- Layer 1: definition v1 → append-only correction v2 ---------------
  const definitionV1 = stack.definitions.register(AURORA_DEFINITION_INPUT);
  assert.equal(definitionV1.version, 1);
  assert.equal(definitionV1.kind, "social-platform");
  assert.equal(definitionV1.declaredCapabilities.length, 4);
  // The declared surface carries EXPLICIT supported/unsupported/unknown.
  const declaredV1 = new Map(
    definitionV1.declaredCapabilities.map((entry) => [entry.capabilityId as string, entry.support]),
  );
  assert.equal(declaredV1.get(CAP_TRANSCRIBE as string), "supported");
  assert.equal(declaredV1.get(CAP_GENERATE_VOICE as string), "unknown");
  assert.equal(declaredV1.get(CAP_EVALUATE as string), "unsupported");

  // Append-only correction: generate_voice declared unknown → supported.
  const definitionV2 = stack.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    id: definitionV1.id,
    declaredCapabilities: [
      { capabilityId: CAP_TRANSCRIBE, support: "supported" },
      { capabilityId: CAP_GENERATE_VOICE, support: "supported" },
      { capabilityId: CAP_EVALUATE, support: "unsupported" },
      { capabilityId: CAP_DETECT_SCENES, support: "supported" },
    ],
  });
  assert.equal(definitionV2.version, 2);
  assert.deepEqual(stack.definitions.listVersions(TENANT_ALPHA, definitionV1.id), [1, 2]);
  // Prior version stays resolvable and unchanged (append-only).
  assert.equal(
    stack.definitions.get(TENANT_ALPHA, definitionV1.id, 1 as Version)?.declaredCapabilities.find(
      (entry) => (entry.capabilityId as string) === (CAP_GENERATE_VOICE as string),
    )?.support,
    "unknown",
  );

  // ---- Layer 2: implementation v1 (status unknown) → correction v2 ------
  const implementationV1 = stack.implementations.register(
    auroraImplementationInput(definitionV1.id),
  );
  assert.equal(implementationV1.version, 1);
  assert.equal(implementationV1.status, "unknown");
  assert.deepEqual(implementationV1.evidenceRefs, []);
  // The provider identity is ECHOED from the definition (layer 1 is the
  // source of truth).
  assert.equal(implementationV1.providerId, definitionV1.providerId);

  // Append-only status correction: unknown → available, WITH evidence
  // (positive claims need evidence).
  const implementationV2 = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: implementationV1.id,
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  assert.equal(implementationV2.version, 2);
  assert.equal(implementationV2.status, "available");
  assert.deepEqual(implementationV2.evidenceRefs, [EVIDENCE_HEALTH_CHECK]);
  assert.deepEqual(stack.implementations.listVersions(TENANT_ALPHA, implementationV1.id), [1, 2]);
  // The PRIOR version keeps its original status — never rewritten.
  assert.equal(stack.implementations.get(TENANT_ALPHA, implementationV1.id, 1 as Version)?.status, "unknown");
  assert.equal(stack.implementations.getLatest(TENANT_ALPHA, implementationV1.id)?.status, "available");

  // A second implementation of the same definition (the "fallback" label).
  const fallback = stack.implementations.register({
    ...auroraImplementationInput(definitionV1.id),
    label: "fallback",
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  assert.equal(fallback.label, "fallback");
  assert.equal(
    stack.implementations.listForDefinition(TENANT_ALPHA, definitionV1.id).length,
    2,
  );

  // ---- Layer 3: instance v1 (binds implementation v1) → rebind v2 -------
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "aurora oauth2 escrow",
    kind: "oauth2-refresh-token",
  });
  const instanceV1 = stack.instances.register({
    scope: SCOPE_ALPHA,
    name: "aurora-main",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: implementationV1.id,
    implementationVersion: implementationV1.version,
    credentialRef,
  });
  assert.equal(instanceV1.version, 1);
  // REFERENCE-ONLY: the instance carries the HANDLE, never a value.
  assert.equal(typeof instanceV1.credentialRef, "string");
  assert.ok(stack.secrets.resolves(instanceV1.credentialRef));

  // Append-only rebind: track the corrected implementation version.
  const instanceV2 = stack.instances.recordRebind({
    scope: SCOPE_ALPHA,
    instanceId: instanceV1.id,
    implementationId: implementationV2.id,
    implementationVersion: implementationV2.version,
  });
  assert.equal(instanceV2.version, 2);
  assert.equal(instanceV2.implementationVersion, 2);
  assert.deepEqual(stack.instances.listVersions(TENANT_ALPHA, instanceV1.id), [1, 2]);
  // The prior binding stays resolvable.
  assert.equal(stack.instances.get(TENANT_ALPHA, instanceV1.id, 1 as Version)?.implementationVersion, 1);

  // ---- Layer 4: explicit availability capabilities (versioned) ----------
  const availabilityV1 = stack.availability.register(
    transcribeAvailabilityInput(implementationV1.id),
  );
  assert.equal(availabilityV1.version, 1);
  const voiceAvailability = stack.availability.register(
    generateVoiceAvailabilityInput(implementationV1.id),
  );
  assert.equal(voiceAvailability.constraints.length, 1);
  assert.equal(voiceAvailability.constraints[0]?.kind, "rate-limit");

  // Append-only constraint correction on the SAME availability record.
  const availabilityV2 = stack.availability.register({
    ...transcribeAvailabilityInput(implementationV1.id),
    id: availabilityV1.id,
    constraints: [{ kind: "region", parameters: { allowed: "eu" } }],
  });
  assert.equal(availabilityV2.version, 2);
  assert.deepEqual(stack.availability.listVersions(TENANT_ALPHA, availabilityV1.id), [1, 2]);
  assert.deepEqual(
    stack.availability.listForImplementation(TENANT_ALPHA, implementationV1.id).map((record) => record.id),
    [availabilityV1.id, voiceAvailability.id],
  );

  // ---- The resolved capability view: EXPLICIT records through the REAL
  // @mos/capabilities vocabulary -------------------------------------------
  const resolved = stack.interactions.listInstanceCapabilities(TENANT_ALPHA, instanceV1.id);
  assert.equal(resolved.length, 2);
  const resolvedIds = resolved.map((entry) => entry.capability.id as string).sort();
  assert.deepEqual(resolvedIds, [CAP_GENERATE_VOICE as string, CAP_TRANSCRIBE as string].sort());
  for (const entry of resolved) {
    // The capability contract RESOLVED through the real vocabulary.
    assert.ok(entry.capability.inputSchema);
    assert.ok(entry.capability.costModel);
  }

  // ---- A live interaction closes the round-trip ------------------------
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:round-trip",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        action: "use",
        subjectRef: AURORA_EXTERNAL_ACCOUNT as string,
      }),
    ],
  });
  const result = stack.interactions.invoke({
    scope: SCOPE_ALPHA,
    instanceId: instanceV2.id,
    capabilityId: CAP_TRANSCRIBE,
    capabilityVersion: 1 as Version,
    actor: ACTOR_ONE,
    rightsContextRef,
    rightsAction: "use",
    parameters: { audio: "storage:fixture-audio-1" },
  });
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    // §30 provider = the definition's provider identity, echoed through
    // the implementation and onto the record.
    assert.equal(result.record.providerId, definitionV1.providerId);
    assert.equal(result.record.implementationVersion, instanceV2.implementationVersion);
    assert.equal(result.record.capabilityId, CAP_TRANSCRIBE);
    assert.equal(result.record.actor, ACTOR_ONE);
    assert.equal(result.record.failure, null);
  }

  // The rights SUBJECT derivation is deterministic and documented.
  assert.equal(
    providerInteractionSubject(instanceV1),
    AURORA_EXTERNAL_ACCOUNT as string,
  );
});

test("round-trip integrity: instances cannot bind what does not exist (fail-closed at every layer)", () => {
  const stack = composeIntegrationsStack({ now: () => FIXED_NOW });

  // Layer 2 cannot reference an unknown definition.
  assert.throws(
    () =>
      stack.implementations.register(
        auroraImplementationInput("definition:nowhere" as ReturnType<typeof stack.definitions.register>["id"]),
      ),
    (error: unknown) => error instanceof IntegrationsError && error.code === "unknown-provider-definition-reference",
  );

  const definition = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const implementation = stack.implementations.register(
    auroraImplementationInput(definition.id),
  );
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "escrow",
    kind: "api-key",
  });

  // Layer 3 cannot reference an unknown implementation version.
  assert.throws(
    () =>
      stack.instances.register({
        scope: SCOPE_ALPHA,
        name: "broken",
        merchantIdentity: MERCHANT_ONE,
        implementationId: implementation.id,
        implementationVersion: 99 as Version,
        credentialRef,
      }),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation-reference",
  );

  // Layer 3 cannot bind an unresolved credential handle.
  assert.throws(
    () =>
      stack.instances.register({
        scope: SCOPE_ALPHA,
        name: "broken",
        merchantIdentity: MERCHANT_ONE,
        implementationId: implementation.id,
        implementationVersion: implementation.version,
        credentialRef: "credential:never-declared" as typeof credentialRef,
      }),
    (error: unknown) => error instanceof IntegrationsError && error.code === "unresolved-credential-ref",
  );

  // Layer 4 cannot reference an unknown implementation.
  assert.throws(
    () => stack.availability.register(transcribeAvailabilityInput("implementation:nowhere" as typeof implementation["id"])),
    (error: unknown) =>
      error instanceof IntegrationsError && error.code === "unknown-provider-implementation-reference",
  );
});
