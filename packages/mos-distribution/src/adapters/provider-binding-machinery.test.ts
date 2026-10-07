/**
 * Provider binding machinery (SOCIAL-002..006 shared battery, part 2) —
 * the shared transport-binding behavior exercised with FICTIONAL provider
 * DATA (the ember-social fixture of the data seam): adapter-level
 * fail-closed / UNKNOWN, operation-shape refusals, the idempotency/replay
 * discipline, and the rate-limit observation records. The five REAL
 * platform bindings are pinned per subtree by their own batteries; the
 * structural isolation (no provider token outside its own subtree) is
 * pinned by the authority-discipline battery.
 *
 * Pins:
 * - an operation the ADAPTER declares unsupported is a typed refusal at
 *   the adapter level even when the channel's registration declares
 *   otherwise (defense in depth), and declared UNKNOWN gets its OWN
 *   preserved typed outcome (never coerced to unsupported);
 * - a request outside the profile's declared shapes is a typed refusal
 *   BEFORE any provider interaction;
 * - the idempotency/replay discipline: the same logical operation retried
 *   → ONE provider operation recorded (the recorded provider answer
 *   replayed, `idempotent-replay` warning); key reuse with CHANGED
 *   parameters → typed `idempotency-key-conflict` (pinned per provider);
 *   a replayed FAILED provider operation replays the recorded failure
 *   (still ONE provider operation); keys are scoped per
 *   (tenant, channel, operation);
 * - rate-limit observations: an ABSENT posture produces NO record (never
 *   invented); a MALFORMED posture is a WARNING surfaced on the §30
 *   record (never silently dropped, never failing the interaction); a
 *   DECLAREDLY simulated posture is recorded VERBATIM with the honest
 *   self-label (§30-style — observedAt + provider refs).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { InMemorySocialTransportRoute } from "./in-memory-social-transport.js";
import { createProviderTransportBinding } from "./provider-transport-binding.js";
import type { ProviderTransportBinding } from "./provider-transport-binding.js";
import { registeredProviderStack, providerPublishRequest } from "../testing/provider-stack.js";
import type { RegisteredProviderStack } from "../testing/provider-stack.js";
import { ACTOR_ONE, TENANT_ALPHA } from "../testing/fixtures.js";
import {
  EMBER_FAILING_ROUTES,
  EMBER_OK_ROUTES,
  EMBER_PROVIDER_ID,
  emberProfile,
} from "../testing/ember-social-fixture.js";

const now = () => "2026-06-01T00:00:00.000Z";

/** Builds a binding + registered stack over the fictional profile (DATA-driven). */
function emberStack(): {
  readonly registered: RegisteredProviderStack;
  readonly binding: ProviderTransportBinding;
} {
  const profile = emberProfile();
  const binding = createProviderTransportBinding({ profile, routes: EMBER_OK_ROUTES, now });
  const registered = registeredProviderStack({ profile, transport: binding, now });
  return { registered, binding };
}

// ---------------------------------------------------------------------------
// Adapter-level fail-closed / UNKNOWN / shapes (fictional DATA)
// ---------------------------------------------------------------------------

test("provider machinery: adapter-level UNSUPPORTED refuses even when the channel declares supported (defense in depth)", () => {
  // The fictional profile declares schedule UNSUPPORTED...
  const { registered, binding } = emberStack();
  // ...and the channel registration CONTRADICTS it.
  const channel = registered.stack.channels.register({
    scope: registered.channel.scope,
    name: "ember-contradicting",
    providerId: EMBER_PROVIDER_ID,
    displayName: "Ember Social (contradicting fixture)",
    instanceRef: registered.instance.id,
    externalAccount: registered.channel.externalAccount,
    capabilityMatrix: registered.profile.capabilityMatrix.map((entry) =>
      entry.operation === "schedule" ? { operation: "schedule", support: "supported" } : entry,
    ),
  });

  const result = registered.stack.adapter.schedule({
    scope: channel.scope,
    channelRef: channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: registered.artifacts.video,
    presentation: { kind: "single-artifact" },
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-unsupported-at-adapter");
  assert.equal(result.failure.details?.declaredSupport, "unsupported");
  assert.equal(binding.providerOperations().length, 0);
});

test("provider machinery: adapter-level UNKNOWN is its OWN typed outcome (never coerced to unsupported)", () => {
  const { registered, binding } = emberStack();
  // A channel registration that CONTRADICTS the adapter's own declaration
  // (the profile declares read-observations UNKNOWN; the channel claims
  // supported) — the ADAPTER's preserved outcome still governs.
  const channel = registered.stack.channels.register({
    scope: registered.channel.scope,
    name: "ember-contradicting-unknown",
    providerId: EMBER_PROVIDER_ID,
    displayName: "Ember Social (contradicting unknown fixture)",
    instanceRef: registered.instance.id,
    externalAccount: registered.channel.externalAccount,
    capabilityMatrix: registered.profile.capabilityMatrix.map((entry) =>
      entry.operation === "read-observations" ? { operation: "read-observations", support: "supported" } : entry,
    ),
  });

  const result = registered.stack.adapter.readObservations({
    scope: channel.scope,
    channelRef: channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown-at-adapter");
  assert.notEqual(result.failure.code, "operation-unsupported-at-adapter");
  assert.equal(result.failure.details?.declaredSupport, "unknown");
  assert.equal(binding.providerOperations().length, 0);
});

test("provider machinery: a request outside the declared shapes is a typed refusal BEFORE any provider interaction", () => {
  const { registered, binding } = emberStack();
  // The fictional platform is video-only: an image artifact is outside.
  const result = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.image }),
  );
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-shape-unsupported");
  assert.equal(binding.providerOperations().length, 0);
});

// ---------------------------------------------------------------------------
// The idempotency/replay discipline (fictional DATA)
// ---------------------------------------------------------------------------

test("provider machinery: the same logical operation retried records ONE provider operation (replay-safe)", () => {
  const { registered, binding } = emberStack();
  const request = providerPublishRequest(registered, { idempotencyKey: "ember-key-1" });
  const first = registered.stack.adapter.publish(request);
  const second = registered.stack.adapter.publish({ ...request });

  assert.equal(first.outcome, "completed");
  assert.equal(second.outcome, "completed");
  assert.equal(binding.providerOperations().length, 1);
  if (second.outcome === "completed") {
    assert.ok(second.record.warnings.some((warning) => warning.code === "idempotent-replay"));
    // The recorded provider answer is replayed verbatim.
    assert.equal(second.output.postRef, "ember-post:fixture-1");
  }
  // Both attempts are §30-recorded.
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, 2);
});

test("provider machinery: a replayed FAILED provider operation replays the recorded failure (still ONE provider operation)", () => {
  const profile = emberProfile();
  const binding = createProviderTransportBinding({ profile, routes: EMBER_FAILING_ROUTES, now });
  const registered = registeredProviderStack({ profile, transport: binding, now });
  const request = providerPublishRequest(registered, { idempotencyKey: "ember-key-fail" });

  const first = registered.stack.adapter.publish(request);
  const retry = registered.stack.adapter.publish({ ...request });

  assert.equal(first.outcome, "failed");
  assert.equal(first.failure.code, "transport-failed");
  // The retry replays the recorded failure — no new provider operation.
  assert.equal(retry.outcome, "failed");
  assert.equal(retry.failure.code, "transport-failed");
  assert.equal(binding.providerOperations().length, 1);
});

test("provider machinery: idempotency keys are scoped per (tenant, channel, operation)", () => {
  const { registered, binding } = emberStack();
  // The SAME key on a DIFFERENT channel names a DIFFERENT logical
  // operation (two provider operations — never a false replay).
  const second = registered.stack.channels.register({
    scope: registered.channel.scope,
    name: "ember-second",
    providerId: EMBER_PROVIDER_ID,
    displayName: "Ember Social (second fixture)",
    instanceRef: registered.instance.id,
    externalAccount: registered.channel.externalAccount,
    capabilityMatrix: registered.profile.capabilityMatrix,
  });

  const first = registered.stack.adapter.publish(
    providerPublishRequest(registered, { idempotencyKey: "ember-key-scope" }),
  );
  const other = registered.stack.adapter.publish({
    scope: second.scope,
    channelRef: second.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    idempotencyKey: "ember-key-scope",
    artifact: registered.artifacts.video,
    presentation: { kind: "single-artifact" },
  });

  assert.equal(first.outcome, "completed");
  assert.equal(other.outcome, "completed");
  assert.equal(binding.providerOperations().length, 2);
});

// ---------------------------------------------------------------------------
// The rate-limit observation records (fictional DATA)
// ---------------------------------------------------------------------------

test("provider machinery: an ABSENT rate-limit posture produces NO observation record (never invented)", () => {
  const { registered } = emberStack();
  const result = registered.stack.adapter.publish(providerPublishRequest(registered));
  assert.equal(result.outcome, "completed");
  assert.equal(registered.stack.adapter.listRateLimitObservations(TENANT_ALPHA).length, 0);
});

test("provider machinery: a MALFORMED transport-reported posture is a WARNING on the §30 record (never dropped, never fatal)", () => {
  // The fictional route reports a rateLimit object with NO posture in the
  // closed vocabulary — untypable, surfaced as a warning.
  const malformedRoutes: Readonly<Record<string, InMemorySocialTransportRoute>> = {
    [EMBER_PROVIDER_ID as string]: {
      kind: "ok",
      output: {
        postRef: "ember-post:fixture-1",
        publishedAt: "2026-06-01T00:00:05.000Z",
        rateLimit: { posture: "invented-posture", observedAt: "2026-06-01T00:00:05.000Z" },
      },
    },
  };
  const profile = emberProfile();
  const binding = createProviderTransportBinding({ profile, routes: malformedRoutes, now });
  const registered = registeredProviderStack({ profile, transport: binding, now });

  const result = registered.stack.adapter.publish(providerPublishRequest(registered));
  // The malformed AUXILIARY posture can neither fail the completed
  // interaction nor be silently dropped.
  assert.equal(result.outcome, "completed");
  assert.equal(registered.stack.adapter.listRateLimitObservations(TENANT_ALPHA).length, 0);
  if (result.outcome === "completed") {
    assert.ok(
      result.record.warnings.some((warning) => warning.code === "rate-limit-observation-untypable"),
      "the untypable posture must be surfaced as a warning",
    );
  }
});

test("provider machinery: a DECLAREDLY simulated posture is recorded VERBATIM with the honest self-label", () => {
  const profile = emberProfile();
  const binding = createProviderTransportBinding({
    profile,
    routes: EMBER_OK_ROUTES,
    now,
    simulatedRateLimit: {
      posture: "near-limit",
      observedAt: "2026-06-01T00:00:05.000Z" as never,
      observed: { requestsInWindow: 7, windowMs: 60000 },
      providerRefs: ["ember-quota:fixture-1"],
    },
  });
  const registered = registeredProviderStack({ profile, transport: binding, now });

  const result = registered.stack.adapter.publish(providerPublishRequest(registered));
  assert.equal(result.outcome, "completed");

  const records = registered.stack.adapter.listRateLimitObservations(TENANT_ALPHA);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record);
  assert.equal(record.posture, "near-limit");
  assert.deepEqual(record.observed, { requestsInWindow: 7, windowMs: 60000 });
  assert.equal(record.providerRefs[0], "ember-quota:fixture-1");
  // The honest self-label: the binding names ITSELF (never the platform).
  assert.equal(record.source, `${EMBER_PROVIDER_ID as string}-transport-double`);
});
