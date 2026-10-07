/**
 * SOCIAL-001 / §31 (Multi-tenancy): all mutable distribution artifacts
 * are tenant/workspace scoped; cross-tenant references are denied unless
 * an explicit sharing contract exists — and they are INDISTINGUISHABLE
 * from unknown (no existence leaks). Pins:
 * - the channel registry: a cross-tenant channel id is an INDEPENDENT
 *   record with an independent version history (tenant-scoped ids are
 *   not globally unique);
 * - channel registration validates the integrations instanceRef IN THE
 *   SAME TENANT (a foreign-tenant instance ≡ unknown — fail-closed);
 * - the adapter: an unresolvable channel in the caller's tenant yields
 *   `unresolved-channel` with NO audit record;
 * - every log (publications, observations, §30 audit) is tenant-isolated;
 * - rights contexts and policy rules never cross tenants;
 * - channel names are unique per tenant only (same name in another
 *   tenant is fine; the SAME id re-registered in-tenant appends a
 *   version, never a collision).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { registeredAuroraStack } from "../testing/registered-stack.js";
import {
  ACTOR_ONE,
  ACTOR_TWO,
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  EVIDENCE_HEALTH_CHECK,
  FIXTURE_ARTIFACT,
  FIXTURE_NOW,
  FULLY_SUPPORTED_MATRIX,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  SCOPE_BETA,
  TENANT_ALPHA,
  TENANT_BETA,
  channelInput,
  permitRule,
  socialRightsGrantFixture,
} from "../testing/fixtures.js";
import { DistributionError } from "../errors.js";

const now = () => FIXTURE_NOW;

/** Registers the full integrations binding + channel in TENANT BETA (a second tenant's own world). */
function registerBetaWorld(registered: ReturnType<typeof registeredAuroraStack>) {
  const betaDefinition = registered.stack.integrations.definitions.register({
    ...AURORA_DEFINITION_INPUT,
    scope: SCOPE_BETA,
  });
  const betaImplementation = registered.stack.integrations.implementations.register({
    scope: SCOPE_BETA,
    definitionId: betaDefinition.id,
    definitionVersion: betaDefinition.version,
    label: "beta-primary",
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
    evidenceModel: { shape: "provider-evidence-v1" },
    errorModel: { shape: "provider-errors-v1" },
    rateLimitObservation: {
      observedAt: "2026-01-01T00:00:00.000Z" as never,
      requestsPerWindow: 600,
      windowMs: 600_000,
    },
  });
  const betaCredential = registered.stack.integrations.secrets.declare({
    scope: SCOPE_BETA,
    displayName: "beta escrow",
    kind: "oauth2-refresh-token",
  });
  const betaInstance = registered.stack.integrations.instances.register({
    scope: SCOPE_BETA,
    name: "aurora-main",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: betaImplementation.id,
    implementationVersion: betaImplementation.version,
    credentialRef: betaCredential,
  });
  const betaChannel = registered.stack.channels.register(
    channelInput(betaInstance.id, FULLY_SUPPORTED_MATRIX, {
      scope: SCOPE_BETA,
      externalAccount: AURORA_EXTERNAL_ACCOUNT,
    }),
  );
  return { betaInstance, betaChannel };
}

test("tenant scoping: a cross-tenant channel id is an INDEPENDENT record (independent version history)", () => {
  const registered = registeredAuroraStack({ now });
  const { betaChannel } = registerBetaWorld(registered);

  // Tenant alpha's channel resolves in alpha only; tenant beta sees ITS
  // OWN record with the same name/id-space but an independent history.
  assert.equal(registered.stack.channels.getLatest(TENANT_ALPHA, betaChannel.id), undefined);
  assert.ok(registered.stack.channels.getLatest(TENANT_BETA, betaChannel.id));
  assert.ok(registered.stack.channels.getLatest(TENANT_ALPHA, registered.channel.id));

  // Both start at version 1 — same id, two tenants, two independent v1s.
  assert.equal(registered.channel.version, 1);
  assert.equal(betaChannel.version, 1);

  // Appending a version in beta does NOT affect alpha's history.
  const betaV2 = registered.stack.channels.register({
    id: betaChannel.id,
    scope: SCOPE_BETA,
    name: betaChannel.name,
    providerId: betaChannel.providerId,
    displayName: betaChannel.displayName,
    instanceRef: betaChannel.instanceRef,
    capabilityMatrix: FULLY_SUPPORTED_MATRIX,
  });
  assert.equal(betaV2.version, 2);
  assert.deepEqual(
    registered.stack.channels.listVersions(TENANT_ALPHA, registered.channel.id),
    [1],
  );
});

test("tenant scoping: channel registration validates the instanceRef IN THE SAME TENANT (foreign ≡ unknown)", () => {
  const registered = registeredAuroraStack({ now });
  const { betaInstance } = registerBetaWorld(registered);

  // Alpha cannot bind a channel to BETA's instance — the failure is
  // indistinguishable from a nonexistent instance (§31 no leaks).
  assert.throws(
    () =>
      registered.stack.channels.register(
        channelInput(betaInstance.id, FULLY_SUPPORTED_MATRIX, { name: "alpha-on-beta-instance" }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "unknown-merchant-client-instance-reference");
      return true;
    },
  );
});

test("tenant scoping: the adapter resolves channels IN THE CALLER'S TENANT (cross-tenant ≡ unknown)", () => {
  const registered = registeredAuroraStack({ now });
  const { betaChannel } = registerBetaWorld(registered);

  // Alpha invoking beta's channel → unresolved (indistinguishable from
  // a nonexistent channel) and NO audit record in EITHER tenant.
  const result = registered.stack.adapter.publish({
    scope: SCOPE_ALPHA,
    channelRef: betaChannel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(result.outcome, "unresolved-channel");
  assert.equal(result.failure.code, "unknown-social-channel");
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, 0);
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_BETA).length, 0);
});

test("tenant scoping: every log is tenant-isolated (publications, observations, §30 audit)", () => {
  const registered = registeredAuroraStack({ now });
  const { betaChannel } = registerBetaWorld(registered);

  // Beta's own rights context + policy rule (beta's world is complete).
  const betaRights = registered.stack.registerRightsContext({
    scope: SCOPE_BETA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:beta-distribution",
        tenantId: TENANT_BETA,
        grantee: ACTOR_TWO,
        actions: ["distribute", "analyze"],
        subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`, AURORA_EXTERNAL_ACCOUNT as string],
      }),
    ],
  });
  registered.stack.registerPolicyRule(permitRule(SCOPE_BETA));

  // Alpha publishes once.
  const alphaResult = registered.stack.adapter.publish({
    scope: SCOPE_ALPHA,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(alphaResult.outcome, "completed");

  // Beta publishes once.
  const betaResult = registered.stack.adapter.publish({
    scope: SCOPE_BETA,
    channelRef: betaChannel.id,
    actor: ACTOR_TWO,
    rightsContextRef: betaRights,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(betaResult.outcome, "completed");

  // Each tenant sees EXACTLY its own records.
  assert.equal(registered.stack.adapter.listPublications(TENANT_ALPHA).length, 1);
  assert.equal(registered.stack.adapter.listPublications(TENANT_BETA).length, 1);
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, 1);
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_BETA).length, 1);
  const alphaRecord = registered.stack.adapter.listDistributionRecords(TENANT_ALPHA)[0];
  const betaRecord = registered.stack.adapter.listDistributionRecords(TENANT_BETA)[0];
  assert.equal(alphaRecord?.actor, ACTOR_ONE);
  assert.equal(betaRecord?.actor, ACTOR_TWO);
  assert.notEqual(alphaRecord?.channelRef, betaRecord?.channelRef);
  // Observations likewise (beta reads its own; alpha reads its own).
  registered.stack.adapter.readObservations({
    scope: SCOPE_ALPHA,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });
  assert.equal(registered.stack.adapter.listObservations(TENANT_ALPHA).length, 1);
  assert.equal(registered.stack.adapter.listObservations(TENANT_BETA).length, 0);
});

test("tenant scoping: rights contexts NEVER cross tenants", () => {
  const registered = registeredAuroraStack({ now });
  const { betaChannel } = registerBetaWorld(registered);

  // Alpha's rights context presented against BETA's channel: the beta
  // invocation resolves the channel, then the rights gate fails closed
  // (alpha's handle is unresolvable in beta — indistinguishable).
  const result = registered.stack.adapter.publish({
    scope: SCOPE_BETA,
    channelRef: betaChannel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
});

test("tenant scoping: policy rules NEVER cross tenants", () => {
  const registered = registeredAuroraStack({ now });
  // Alpha's standard arrangement permits alpha. Register a beta channel
  // + beta rights, but NO beta policy rule: beta is denied fail-closed.
  const { betaChannel } = registerBetaWorld(registered);
  const betaRights = registered.stack.registerRightsContext({
    scope: SCOPE_BETA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:beta-no-policy",
        tenantId: TENANT_BETA,
        grantee: ACTOR_TWO,
        actions: ["distribute"],
        subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
      }),
    ],
  });
  const result = registered.stack.adapter.publish({
    scope: SCOPE_BETA,
    channelRef: betaChannel.id,
    actor: ACTOR_TWO,
    rightsContextRef: betaRights,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "policy-gate-denied");
  assert.equal(result.failure.details?.denialReason, "no-matching-policy");
});

test("tenant scoping: channel names are unique PER TENANT (collisions across tenants are fine)", () => {
  const registered = registeredAuroraStack({ now });
  // "aurora-main" exists in alpha; beta registers its own "aurora-main".
  const { betaChannel } = registerBetaWorld(registered);
  assert.equal(betaChannel.name, registered.channel.name);
  assert.notEqual(betaChannel.id, registered.channel.id);

  // Within alpha, the name is taken by ANOTHER id → duplicate rejected.
  assert.throws(
    () =>
      registered.stack.channels.register(
        channelInput(registered.instance.id, FULLY_SUPPORTED_MATRIX, { name: "aurora-main" }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "duplicate-social-channel");
      return true;
    },
  );

  // The SAME id re-registering its OWN name is the append-only version
  // path, never a collision.
  const corrected = registered.stack.channels.register({
    id: registered.channel.id,
    scope: SCOPE_ALPHA,
    name: registered.channel.name,
    providerId: registered.channel.providerId,
    displayName: registered.channel.displayName,
    instanceRef: registered.instance.id,
    capabilityMatrix: FULLY_SUPPORTED_MATRIX,
  });
  assert.equal(corrected.version, 2);
});

test("tenant scoping: getDistributionRecord is tenant-scoped (no cross-tenant existence leaks)", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.publish({
    scope: SCOPE_ALPHA,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.ok(registered.stack.adapter.getDistributionRecord(TENANT_ALPHA, result.record.id));
    // The same id in beta is unknown — indistinguishable from nonexistent.
    assert.equal(registered.stack.adapter.getDistributionRecord(TENANT_BETA, result.record.id), undefined);
  }
});
