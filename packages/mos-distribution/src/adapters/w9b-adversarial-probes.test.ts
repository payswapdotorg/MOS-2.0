/**
 * W9-B adversarial regression probes (production/engine/security sweep) —
 * the @mos/distribution control plane.
 *
 * Attack probes, shaped the way a hostile caller or a future bug would:
 *
 *  - replay-ledger key injection (the W3-A hostile-id-factory class): a
 *    hostile (tenant, channel, operation, key) tuple whose OLD
 *    `|`-delimited concatenation collided with an honest tenant's ledger
 *    entry must NOT replay the honest tenant's recorded provider answer —
 *    the JSON array key fix is pinned here (was: cross-tenant provider
 *    answer bleed / idempotency eviction);
 *  - provider-operation record ownership: the caller mutating its scope
 *    object after the interaction cannot rewrite the §30 provider-
 *    operation record (clone-then-freeze fix pin);
 *  - channel-registry ownership: mutating the caller's registration input
 *    (capability matrix) after register cannot change the stored channel
 *    version (clone fix pin);
 *  - health-surface ownership: mutating the caller's scope (or the
 *    caller's suspected-anomaly derivation) after recording cannot move
 *    the stored observation to another tenant (scope-copy fix pins);
 *  - rights/policy gate ordering (adversarial): a DENY verdict from the
 *    rights gate never reaches the transport (send-counting) — the
 *    existing rights-gate-precedes-calls pin, restated as an attack
 *    probe with an unresolvable rights context.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { TenantScope } from "@mos/contracts";

import { createProviderTransportBinding } from "./provider-transport-binding.js";
import { createInMemoryHealthSurface } from "./in-memory-health-surface.js";
import {
  EMBER_OK_ROUTES,
  EMBER_PROVIDER_ID,
  emberProfile,
} from "../testing/ember-social-fixture.js";
import { registeredAuroraStack, standardPublishRequest } from "../testing/registered-stack.js";
import { SCOPE_ALPHA, STANDARD_TRANSPORT_ROUTES, TENANT_ALPHA } from "../testing/fixtures.js";
import { createCountingTransport } from "../testing/counting-transport.js";
import { createInMemorySocialTransportDouble } from "./in-memory-social-transport.js";
import type { SocialTransportRequest } from "../ports/social-transport.port.js";
import type { SocialRestrictionRecord } from "../contracts/social-record.js";
import type { Timestamp } from "@mos/contracts";

const now = (): Timestamp => "2026-06-01T00:00:00.000Z" as Timestamp;

const scopeOf = (tenantId: string): TenantScope => ({ tenantId: tenantId as TenantScope["tenantId"] });

function publishTransportRequest(
  scope: TenantScope,
  channelRef: string,
  idempotencyKey: string,
): SocialTransportRequest {
  return {
    requestId: `dist-${idempotencyKey}` as SocialTransportRequest["requestId"],
    scope,
    providerId: EMBER_PROVIDER_ID,
    channelRef: channelRef as SocialTransportRequest["channelRef"],
    instanceRef: "instance:probe" as SocialTransportRequest["instanceRef"],
    operation: "publish",
    parameters: {
      artifact: { type: "video/mp4" },
      presentation: { kind: "single-artifact" },
    },
    idempotencyKey: idempotencyKey as SocialTransportRequest["idempotencyKey"],
  };
}

// ---------------------------------------------------------------------------
// Replay-ledger key injection (the JSON array composite-key fix)
// ---------------------------------------------------------------------------

test("W9-B probe: a hostile tuple colliding under the OLD '|' ledger key cannot replay another tenant's provider answer", () => {
  const binding = createProviderTransportBinding({ profile: emberProfile(), routes: EMBER_OK_ROUTES, now });

  // The honest tenant's logical operation.
  const honestKey = "ember-ch-1|publish|trap";
  const honest = binding.send(
    publishTransportRequest(scopeOf("tenant-alpha"), "ember-ch-1", honestKey),
  );
  assert.equal(honest.ok, true);

  // The attack: a hostile tenant whose OLD concatenated ledger key would be
  // IDENTICAL: "tenant-alpha|ember-ch-1|publish|ember-ch-1|publish|trap".
  // Under the old `${tenant}|${channel}|${op}|${key}` scheme this tuple
  // aliased the honest entry and REPLAYED the honest tenant's provider
  // answer to the hostile tenant (and would evict/conflict its binding).
  const hostile = binding.send(
    publishTransportRequest(
      scopeOf("tenant-alpha|ember-ch-1|publish"),
      "ember-ch-1",
      "trap",
    ),
  );
  assert.equal(hostile.ok, true, "the hostile tenant's own operation runs");
  if (hostile.ok) {
    assert.equal(
      hostile.warnings.some((warning) => warning.code === "idempotent-replay"),
      false,
      "the hostile tenant must NOT receive the honest tenant's recorded answer as a replay",
    );
  }
  // TWO distinct provider operations are recorded — one per tenant.
  assert.equal(binding.providerOperations().length, 2);

  // And the honest tenant's own retry still replays ITS answer (idempotency
  // intact after the hostile neighbor).
  const retry = binding.send(
    publishTransportRequest(scopeOf("tenant-alpha"), "ember-ch-1", honestKey),
  );
  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(
      retry.warnings.some((warning) => warning.code === "idempotent-replay"),
      true,
    );
  }
  assert.equal(binding.providerOperations().length, 2, "the honest retry replays, never re-sends");
});

test("W9-B probe: the caller mutating its scope object after send cannot rewrite the provider-operation record", () => {
  const binding = createProviderTransportBinding({ profile: emberProfile(), routes: EMBER_OK_ROUTES, now });
  const hostileScope = scopeOf("tenant-alpha");
  binding.send(publishTransportRequest(hostileScope, "ember-ch-1", "ownership-key"));

  // The attack: rewrite the caller-owned scope after the interaction.
  (hostileScope as { tenantId?: string }).tenantId = "tenant-forged";

  const operations = binding.providerOperations();
  assert.equal(operations.length, 1);
  assert.equal(operations[0]?.scope.tenantId as string, "tenant-alpha");
  assert.ok(Object.isFrozen(operations[0]));
  assert.ok(Object.isFrozen(operations[0]?.scope));
  // Ownership: the caller's scope object was NOT frozen in place.
  assert.ok(!Object.isFrozen(hostileScope));
});

// ---------------------------------------------------------------------------
// Channel-registry ownership (the structuredClone fix)
// ---------------------------------------------------------------------------

test("W9-B probe: mutating the caller's registration input after register cannot change the stored channel", () => {
  const registered = registeredAuroraStack();
  const matrix = registered.channel.capabilityMatrix.map((entry) => ({ ...entry }));
  const channel = registered.stack.channels.register({
    scope: SCOPE_ALPHA,
    name: "w9b-probe-channel",
    providerId: registered.channel.providerId,
    displayName: "W9-B probe channel",
    instanceRef: registered.instance.id,
    externalAccount: registered.channel.externalAccount,
    id: "social-channel-w9b" as never,
    capabilityMatrix: matrix,
  });
  const snapshot = JSON.stringify(channel);

  // The attack: rewrite the caller-retained matrix after registration.
  (matrix[0] as { support?: string }).support = "unsupported";

  const stored = registered.stack.channels.get(
    SCOPE_ALPHA.tenantId,
    channel.id,
    channel.version,
  );
  assert.ok(stored !== undefined);
  assert.equal(JSON.stringify(stored), snapshot, "the stored channel version is bit-for-bit unchanged");
  assert.equal((stored.capabilityMatrix[0] as { support?: string }).support, "supported");
  // Ownership: the caller's matrix objects were not frozen in place.
  assert.ok(!Object.isFrozen(matrix[0]));
});

// ---------------------------------------------------------------------------
// Health-surface ownership (the scope-copy + derivation clone fixes)
// ---------------------------------------------------------------------------

function makeRestriction(tenantId: string): SocialRestrictionRecord {
  return {
    id: "restriction:w9b-1" as SocialRestrictionRecord["id"],
    scope: scopeOf(tenantId),
    channelRef: "social-channel-w9b" as SocialRestrictionRecord["channelRef"],
    providerId: EMBER_PROVIDER_ID,
    observedAt: "2026-06-01T00:00:01.000Z",
    description: "fictional restriction (probe DATA)",
    recordedAt: "2026-06-01T00:00:02.000Z",
    source: "probe-double",
  } as SocialRestrictionRecord;
}

test("W9-B probe: mutating the caller's scope after recordConfirmedRestriction cannot move the observation to another tenant", () => {
  const surface = createInMemoryHealthSurface({ now });
  const hostileScope = scopeOf("tenant-alpha");
  const outcome = surface.recordConfirmedRestriction(hostileScope, {
    restriction: makeRestriction("tenant-alpha"),
  });
  assert.ok(outcome.ok === true);

  // The attack: rewrite the caller-owned scope after the authority took it.
  (hostileScope as { tenantId?: string }).tenantId = "tenant-forged";

  const observations = surface.listHealthObservations(scopeOf("tenant-alpha"));
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.scope.tenantId as string, "tenant-alpha");
  assert.equal(surface.listHealthObservations(scopeOf("tenant-forged")).length, 0);
  // The caller's scope object was not frozen in place.
  assert.ok(!Object.isFrozen(hostileScope));
});

test("W9-B probe: mutating the caller's suspected-anomaly derivation after recording cannot rewrite the stored derivation", () => {
  const surface = createInMemoryHealthSurface({ now });
  const derivation = {
    ruleId: "observation-absence",
    channelRef: "social-channel-w9b",
    windowMs: 3_600_000,
    evaluatedAt: "2026-06-01T01:00:00.000Z",
    examinedObservationIds: ["health-observation-1"],
  };
  const scope = scopeOf("tenant-alpha");
  const outcome = surface.recordSuspectedAnomaly(scope, {
    providerId: EMBER_PROVIDER_ID,
    derivation: derivation as never,
    source: "probe-double",
  });
  assert.ok(outcome.ok === true);
  const snapshot = JSON.stringify(surface.listHealthObservations(scope)[0]);

  // The attack: rewrite the caller-retained derivation inputs.
  (derivation as { ruleId?: string }).ruleId = "metric-decline-window";
  (derivation as { windowMs?: number }).windowMs = -1;

  assert.equal(
    JSON.stringify(surface.listHealthObservations(scope)[0]),
    snapshot,
    "the stored derivation is bit-for-bit unchanged",
  );
  const stored = surface.listHealthObservations(scope)[0];
  assert.ok(stored !== undefined && stored.kind === "suspected-distribution-anomaly");
  if (stored.kind === "suspected-distribution-anomaly") {
    assert.equal((stored.derivation as { ruleId?: string }).ruleId, "observation-absence");
    assert.ok(Object.isFrozen(stored.derivation));
  }
  assert.ok(!Object.isFrozen(derivation), "the caller's derivation object was not frozen in place");
});

// ---------------------------------------------------------------------------
// Rights/policy gate ordering (adversarial restatement)
// ---------------------------------------------------------------------------

test("W9-B probe: an unresolvable rights context fails closed with ZERO transport calls (gate ordering)", () => {
  const counting = createCountingTransport(
    createInMemorySocialTransportDouble({ routes: STANDARD_TRANSPORT_ROUTES }),
  );
  const registered = registeredAuroraStack({ now, transport: counting });
  const before = registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length;
  const result = registered.stack.adapter.publish(
    standardPublishRequest(registered, {
      rightsContextRef: "rights-context:does-not-exist" as never,
    }),
  );
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    // Unresolvable context ⇒ rights-gate DENIAL (fail-closed; the denial
    // reason names the unresolvable context verbatim — never a bypass).
    assert.equal(result.failure.code, "rights-gate-denied");
    assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
  }
  // GATE ORDERING (the adversarial property): the transport seam NEVER
  // answered anything — the denial never reaches the provider.
  assert.equal(counting.sentCount(), 0);
  // §30 discipline (the main-side pinned behavior, restated adversarially):
  // the attributable failed attempt IS recorded — exactly ONE new failed
  // distribution record carrying the rights denial.
  const listed = registered.stack.adapter.listDistributionRecords(TENANT_ALPHA, {
    failureCode: "rights-gate-denied",
  });
  assert.equal(listed.length, 1);
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, before + 1);
  // A same-scope follow-up with the REAL rights context still completes:
  // the failed attempt left no poisoned state behind — and the transport
  // now answers exactly that one completed call.
  const ok = registered.stack.adapter.publish(standardPublishRequest(registered, {}));
  assert.equal(ok.outcome, "completed");
  assert.equal(counting.sentCount(), 1);
});
