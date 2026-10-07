/**
 * X adapter battery (SOCIAL-006) — the per-provider acceptance pins over
 * the W6-C SOCIAL-001 contract:
 * - the profile declares ALL five operations conservatively (validated;
 *   auth model KIND as data; NO credential surface anywhere on the profile);
 * - operation round-trips through the transport double with §30 records
 *   and ONE provider operation per interaction;
 * - declared-UNKNOWN operations (schedule / list-restrictions) keep their
 *   OWN typed outcome — at the channel matrix AND at the adapter's own
 *   declaration (fail-closed both ways, zero provider operations);
 * - declared operation shapes refuse outside requests (artifact types
 *   with NO family in the closed vocabulary, e.g. audio) BEFORE any
 *   provider interaction;
 * - idempotency/replay discipline (same logical publish → ONE provider
 *   operation; key reuse with changed parameters → typed conflict;
 *   keyless calls are fresh operations — disclosed);
 * - rate-limit observations are what-the-double-observed postures
 *   (observedAt + provider refs + self-label, DECLAREDLY simulated);
 * - the rights gate still precedes every call (zero sends when denied);
 * - tenant scoping holds; the binding never serves a foreign provider.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { InMemorySocialTransportRoute } from "../../in-memory-social-transport.js";
import { createCountingTransport } from "../../../testing/counting-transport.js";
import {
  ACTOR_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  TENANT_BETA,
  socialRightsGrantFixture,
} from "../../../testing/fixtures.js";
import {
  PROVIDER_STACK_EXTERNAL_ACCOUNT,
  providerPublishRequest,
  registerSecondTenant,
  registeredProviderStack,
} from "../../../testing/provider-stack.js";
import type { RegisteredProviderStack } from "../../../testing/provider-stack.js";
import { validateSocialProviderProfile } from "../../provider-profile-validation.js";

import { createXTransportBinding, X_TRANSPORT_SOURCE } from "./x-adapter.js";
import { X_PROVIDER_ID, X_PROVIDER_PROFILE } from "./x-profile.js";

const now = () => "2026-06-01T00:00:00.000Z";

/** The fictional platform-said payloads the disclosed double routes (DATA). */
const X_TEST_ROUTES: Readonly<Record<string, InMemorySocialTransportRoute>> = {
  [X_PROVIDER_ID as string]: {
    kind: "ok",
    output: {
      postRef: "x-post:fixture-1",
      publishedAt: "2026-06-01T00:00:05.000Z",
      retractedAt: "2026-06-03T00:00:05.000Z",
      observations: [
        {
          subjectRef: "x-post:fixture-1",
          reported: { impressions: 41023, likes: 902, reposts: 176 },
          observedAt: "2026-06-04T00:00:00.000Z",
          providerRefs: ["x-metrics:fixture-1"],
        },
      ],
    },
  },
};

/** Composes the registered X arrangement (profile matrix channel). */
function registeredX(): {
  readonly registered: RegisteredProviderStack;
  readonly binding: ReturnType<typeof createXTransportBinding>;
} {
  const binding = createXTransportBinding({ routes: X_TEST_ROUTES, now });
  const registered = registeredProviderStack({ profile: X_PROVIDER_PROFILE, transport: binding, now });
  return { registered, binding };
}

test("x profile: declares ALL five operations conservatively, validates, and carries NO credential surface", () => {
  const validated = validateSocialProviderProfile(X_PROVIDER_PROFILE);
  assert.equal(validated.providerId, X_PROVIDER_ID);
  // Every closed-vocabulary operation is declared exactly once (the
  // conservative posture — parity is never assumed, nothing undeclared).
  assert.equal(validated.capabilityMatrix.length, 5);
  const declared = new Set(validated.capabilityMatrix.map((entry) => entry.operation as string));
  for (const operation of ["publish", "schedule", "read-observations", "delete", "list-restrictions"]) {
    assert.ok(declared.has(operation), `operation ${operation} must be explicitly declared`);
  }
  // The UNKNOWN postures are preserved first-class in the declaration
  // (schedule / list-restrictions — observation-pending).
  for (const operation of ["schedule", "list-restrictions"]) {
    const entry = validated.capabilityMatrix.find((candidate) => candidate.operation === operation);
    assert.equal(entry?.support, "unknown", `${operation} must stay UNKNOWN — never guessed`);
  }
  // Auth model KIND as data — never credentials.
  assert.equal(validated.auth.model.kind, "oauth2");
  assert.equal(validated.auth.model.managedBy, "integrations");
  assert.deepEqual(validated.auth.flows, ["authorization-code-with-pkce"]);
  // NO credential-ish KEY anywhere in the profile (auth model is a KIND
  // declaration — there is structurally no credential field).
  const keys = new Set<string>();
  collectKeys(validated, keys);
  for (const key of keys) {
    assert.doesNotMatch(
      key,
      /credential|secret|password|apikey|api-key|token/i,
      `the profile must not carry a "${key}" field — auth model is a KIND declaration, never credentials`,
    );
  }
});

/** Collects every object key reachable from the value (the no-credential-surface scan). */
function collectKeys(value: unknown, into: Set<string>): void {
  if (typeof value === "object" && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      collectKeys(nested, into);
    }
  }
}

test("x publish: text round-trip through the transport double with a §30 record and ONE provider operation", () => {
  const { registered, binding } = registeredX();
  const result = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.text, presentationKind: "text-only" }),
  );

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.record.providerId, X_PROVIDER_ID);
    assert.equal(result.record.operationSupport, "supported");
    assert.equal(result.record.transportSource, X_TRANSPORT_SOURCE);
    assert.equal(result.output.postRef, "x-post:fixture-1");
    assert.equal(result.output.source, X_TRANSPORT_SOURCE);
    assert.equal(registered.stack.adapter.listPublications(TENANT_ALPHA).length, 1);
  }
  assert.equal(binding.providerOperations().length, 1);
  assert.equal(binding.providerOperations()[0]?.operation, "publish");
  assert.equal(binding.providerOperations()[0]?.idempotencyKey, null);
});

test("x publish: image, video and link-preview presentations round-trip too (the multi-shape posting surface)", () => {
  const { registered, binding } = registeredX();
  const image = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.image }),
  );
  assert.equal(image.outcome, "completed");
  const video = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.video }),
  );
  assert.equal(video.outcome, "completed");
  const linkPreview = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.text, presentationKind: "link-preview" }),
  );
  assert.equal(linkPreview.outcome, "completed");
  assert.equal(binding.providerOperations().length, 3);
});

test("x schedule: declared UNKNOWN is its OWN typed outcome (zero provider operations)", () => {
  const { registered, binding } = registeredX();
  const result = registered.stack.adapter.schedule({
    ...providerPublishRequest(registered, { artifact: registered.artifacts.text, presentationKind: "text-only" }),
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown");
  assert.notEqual(result.failure.code, "operation-unsupported");
  // The §30 record carries the declaration VERBATIM (never coerced).
  assert.equal(result.record.operationSupport, "unknown");
  assert.equal(binding.providerOperations().length, 0);
});

test("x read-observations: platform-said metrics recorded VERBATIM", () => {
  const { registered } = registeredX();
  const result = registered.stack.adapter.readObservations({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    subjectRef: "x-post:fixture-1",
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 1);
    assert.deepEqual(result.output[0]?.reported, { impressions: 41023, likes: 902, reposts: 176 });
    assert.equal(result.output[0]?.providerRefs[0], "x-metrics:fixture-1");
    assert.equal(result.output[0]?.source, X_TRANSPORT_SOURCE);
  }
});

test("x delete: platform-confirmed retraction", () => {
  const { registered, binding } = registeredX();
  const result = registered.stack.adapter.delete({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    postRef: "x-post:fixture-1" as never,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.postRef, "x-post:fixture-1");
    assert.equal(result.output.retractedAt, "2026-06-03T00:00:05.000Z");
  }
  assert.equal(binding.providerOperations().length, 1);
});

test("x list-restrictions: declared UNKNOWN is its OWN typed outcome (zero provider operations)", () => {
  const { registered, binding } = registeredX();
  const result = registered.stack.adapter.listRestrictions({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown");
  assert.notEqual(result.failure.code, "operation-unsupported");
  assert.equal(result.record.operationSupport, "unknown");
  assert.equal(binding.providerOperations().length, 0);
});

test("x adapter-level fail-closed: a channel declaring schedule supported still gets the ADAPTER's unknown refusal", () => {
  const { registered, binding } = registeredX();
  // A channel registration that CONTRADICTS the adapter's own declaration.
  const channel = registered.stack.channels.register({
    scope: SCOPE_ALPHA,
    name: "x-contradicting",
    providerId: X_PROVIDER_ID,
    displayName: "X (contradicting fixture)",
    instanceRef: registered.instance.id,
    externalAccount: PROVIDER_STACK_EXTERNAL_ACCOUNT,
    capabilityMatrix: X_PROVIDER_PROFILE.capabilityMatrix.map((entry) =>
      entry.operation === "schedule" ? { operation: "schedule", support: "supported" } : entry,
    ),
  });

  const result = registered.stack.adapter.schedule({
    scope: channel.scope,
    channelRef: channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: registered.artifacts.text,
    presentation: { kind: "text-only" },
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown-at-adapter");
  assert.equal(result.failure.details?.declaredSupport, "unknown");
  // The channel's (wrong) declaration passed the tenant-side gate; the
  // §30 record names the ADAPTER as the refusing surface.
  assert.equal(result.record.operationSupport, "supported");
  assert.equal(result.record.transportSource, X_TRANSPORT_SOURCE);
  assert.equal(binding.providerOperations().length, 0);
});

test("x shapes: artifact types with NO family in the closed vocabulary fail closed BEFORE any provider interaction", () => {
  const { registered, binding } = registeredX();

  // An audio artifact: "audio/mpeg" maps to NO closed-vocabulary family —
  // unmappable types fail closed against EVERY shape declaration.
  const audioArtifact = Object.freeze({
    ...registered.artifacts.video,
    type: "audio/mpeg" as never,
  });
  const audioPost = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: audioArtifact }),
  );
  assert.equal(audioPost.outcome, "failed");
  assert.equal(audioPost.failure.code, "operation-shape-unsupported");
  if (audioPost.outcome === "failed") {
    assert.equal(audioPost.failure.details?.artifactType, "audio/mpeg");
    assert.equal(audioPost.failure.details?.artifactFamily, undefined);
  }

  assert.equal(binding.providerOperations().length, 0);
});

test("x idempotency: the same logical publish retried records ONE provider operation (replay-safe)", () => {
  const { registered, binding } = registeredX();
  const request = providerPublishRequest(registered, { artifact: registered.artifacts.image });
  const first = registered.stack.adapter.publish({ ...request, idempotencyKey: "x-key-1" });
  const second = registered.stack.adapter.publish({ ...request, idempotencyKey: "x-key-1" });

  assert.equal(first.outcome, "completed");
  assert.equal(second.outcome, "completed");
  // ONE provider operation for the retried logical publish.
  assert.equal(binding.providerOperations().length, 1);
  assert.equal(binding.providerOperations()[0]?.idempotencyKey, "x-key-1");
  // The replay surfaces the idempotent-replay warning on its §30 record.
  if (second.outcome === "completed") {
    assert.ok(second.record.warnings.some((warning) => warning.code === "idempotent-replay"));
    assert.equal(second.output.postRef, "x-post:fixture-1");
  }
  // Both attempts are §30-recorded (every attributable attempt is).
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, 2);
});

test("x idempotency: key reuse with CHANGED parameters is a typed conflict (no second provider operation)", () => {
  const { registered, binding } = registeredX();
  const first = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.image, idempotencyKey: "x-key-2" }),
  );
  assert.equal(first.outcome, "completed");

  const conflicting = registered.stack.adapter.publish(
    providerPublishRequest(registered, {
      artifact: registered.artifacts.image,
      idempotencyKey: "x-key-2",
      presentationKind: "single-artifact",
    }),
  );
  assert.equal(conflicting.outcome, "failed");
  assert.equal(conflicting.failure.code, "idempotency-key-conflict");
  assert.equal(binding.providerOperations().length, 1);
});

test("x idempotency: keyless publishes are FRESH provider operations (disclosed)", () => {
  const { registered, binding } = registeredX();
  registered.stack.adapter.publish(providerPublishRequest(registered, { artifact: registered.artifacts.image }));
  registered.stack.adapter.publish(providerPublishRequest(registered, { artifact: registered.artifacts.image }));
  assert.equal(binding.providerOperations().length, 2);
  assert.equal(binding.providerOperations()[0]?.idempotencyKey, null);
  assert.equal(binding.providerOperations()[1]?.idempotencyKey, null);
});

test("x rate limit: DECLAREDLY simulated posture recorded as an observation (observedAt + provider refs + self-label)", () => {
  const binding = createXTransportBinding({
    routes: X_TEST_ROUTES,
    now,
    simulatedRateLimit: {
      posture: "within-window",
      observedAt: "2026-06-01T00:00:05.000Z" as never,
      observed: { requestsInWindow: 300, windowMs: 900000 },
      providerRefs: ["x-quota:fixture-1"],
    },
  });
  const registered = registeredProviderStack({ profile: X_PROVIDER_PROFILE, transport: binding, now });

  const result = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.image }),
  );
  assert.equal(result.outcome, "completed");

  const records = registered.stack.adapter.listRateLimitObservations(TENANT_ALPHA);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record);
  assert.equal(record.posture, "within-window");
  assert.equal(record.observedAt, "2026-06-01T00:00:05.000Z");
  assert.deepEqual(record.observed, { requestsInWindow: 300, windowMs: 900000 });
  assert.equal(record.providerRefs[0], "x-quota:fixture-1");
  assert.equal(record.providerId, X_PROVIDER_ID);
  // The SELF-LABEL: the simulated posture is the DOUBLE's, never live evidence.
  assert.equal(record.source, X_TRANSPORT_SOURCE);
});

test("x rights gate: a denied rights evaluation NEVER reaches the binding (zero sends, zero provider operations)", () => {
  const binding = createXTransportBinding({ routes: X_TEST_ROUTES, now });
  const counting = createCountingTransport(binding);
  const registered = registeredProviderStack({ profile: X_PROVIDER_PROFILE, transport: counting, now });

  // A rights context whose grant covers a DIFFERENT subject.
  const uncovered = registered.stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:x-uncovered",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        actions: ["distribute"],
        subjectRefs: ["artifact:some-other-artifact"],
      }),
    ],
  });

  const denied = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.image, rightsContextRef: uncovered }),
  );
  assert.equal(denied.outcome, "failed");
  assert.equal(denied.failure.code, "rights-gate-denied");
  assert.equal(denied.failure.details?.denialReason, "subject-not-covered");
  assert.equal(counting.sentCount(), 0);
  assert.equal(binding.providerOperations().length, 0);
});

test("x tenant scoping: records never cross tenants; foreign channel ids are indistinguishable from unknown", () => {
  const { registered, binding } = registeredX();
  const beta = registerSecondTenant(registered, { artifactFamily: "text" });

  const betaPublish = registered.stack.adapter.publish({
    scope: beta.channel.scope,
    channelRef: beta.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: beta.rightsContextRef,
    artifact: beta.artifact,
    presentation: { kind: "text-only" },
  });
  assert.equal(betaPublish.outcome, "completed");

  // Per-tenant log isolation (§31).
  assert.equal(registered.stack.adapter.listPublications(TENANT_ALPHA).length, 0);
  assert.equal(registered.stack.adapter.listPublications(TENANT_BETA).length, 1);
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, 0);
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_BETA).length, 1);
  // Both tenants' provider operations are recorded at the provider.
  assert.equal(binding.providerOperations().length, 1);

  // Cross-tenant channel id ≡ unknown (no existence leaks).
  const foreign = registered.stack.adapter.publish({
    scope: SCOPE_ALPHA,
    channelRef: beta.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: registered.artifacts.text,
    presentation: { kind: "text-only" },
  });
  assert.equal(foreign.outcome, "unresolved-channel");
});

test("x isolation: the binding refuses to serve a foreign provider's request", () => {
  const binding = createXTransportBinding({ routes: X_TEST_ROUTES, now });
  const response = binding.send({
    requestId: "social-distribution-isolation" as never,
    scope: SCOPE_ALPHA,
    providerId: "provider:foreign-fixture" as never,
    channelRef: "social-channel-isolation" as never,
    instanceRef: "merchant-client-instance-isolation" as never,
    operation: "publish",
    parameters: { artifact: { artifactId: "artifact-isolation", type: "text/plain" }, presentation: { kind: "text-only" } },
  });

  assert.equal(response.ok, false);
  if (!response.ok) {
    assert.equal(response.failure.code, "provider-adapter-mismatch");
    assert.equal(response.failure.details?.expectedProviderId, X_PROVIDER_ID);
    assert.equal(response.failure.details?.requestedProviderId, "provider:foreign-fixture");
    assert.equal(response.source, X_TRANSPORT_SOURCE);
  }
  assert.equal(binding.providerOperations().length, 0);
});
