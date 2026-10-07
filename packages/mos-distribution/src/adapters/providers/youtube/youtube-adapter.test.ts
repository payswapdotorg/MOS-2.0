/**
 * YouTube adapter battery (SOCIAL-002) — the per-provider acceptance pins
 * over the W6-C SOCIAL-001 contract:
 * - the profile declares ALL five operations conservatively (validated;
 *   auth model KIND as data; NO credential surface anywhere on the profile);
 * - operation round-trips through the transport double with §30 records
 *   and ONE provider operation per interaction;
 * - declared-UNKNOWN operations keep their OWN typed outcome — at the
 *   channel matrix AND at the adapter's own declaration (fail-closed both
 *   ways, zero provider operations);
 * - declared operation shapes refuse outside requests (text-only /
 *   non-video) BEFORE any provider interaction;
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

import { createYouTubeTransportBinding, YOUTUBE_TRANSPORT_SOURCE } from "./youtube-adapter.js";
import { YOUTUBE_PROVIDER_ID, YOUTUBE_PROVIDER_PROFILE } from "./youtube-profile.js";

const now = () => "2026-06-01T00:00:00.000Z";

/** The fictional platform-said payloads the disclosed double routes (DATA). */
const YOUTUBE_TEST_ROUTES: Readonly<Record<string, InMemorySocialTransportRoute>> = {
  [YOUTUBE_PROVIDER_ID as string]: {
    kind: "ok",
    output: {
      postRef: "youtube-video:fixture-1",
      publishedAt: "2026-06-01T00:00:05.000Z",
      scheduleRef: "youtube-schedule:fixture-1",
      scheduledAt: "2026-06-02T12:00:00.000Z",
      retractedAt: "2026-06-03T00:00:05.000Z",
      observations: [
        {
          subjectRef: "youtube-video:fixture-1",
          reported: { views: 4211, likes: 87, comments: 12 },
          observedAt: "2026-06-04T00:00:00.000Z",
          providerRefs: ["youtube-analytics:fixture-1"],
        },
      ],
    },
  },
};

/** Composes the registered YouTube arrangement (profile matrix channel). */
function registeredYouTube(): {
  readonly registered: RegisteredProviderStack;
  readonly binding: ReturnType<typeof createYouTubeTransportBinding>;
} {
  const binding = createYouTubeTransportBinding({ routes: YOUTUBE_TEST_ROUTES, now });
  const registered = registeredProviderStack({ profile: YOUTUBE_PROVIDER_PROFILE, transport: binding, now });
  return { registered, binding };
}

test("youtube profile: declares ALL five operations conservatively, validates, and carries NO credential surface", () => {
  const validated = validateSocialProviderProfile(YOUTUBE_PROVIDER_PROFILE);
  assert.equal(validated.providerId, YOUTUBE_PROVIDER_ID);
  // Every closed-vocabulary operation is declared exactly once (the
  // conservative posture — parity is never assumed, nothing undeclared).
  assert.equal(validated.capabilityMatrix.length, 5);
  const declared = new Set(validated.capabilityMatrix.map((entry) => entry.operation as string));
  for (const operation of ["publish", "schedule", "read-observations", "delete", "list-restrictions"]) {
    assert.ok(declared.has(operation), `operation ${operation} must be explicitly declared`);
  }
  // The UNKNOWN posture is preserved first-class in the declaration.
  const restrictions = validated.capabilityMatrix.find((entry) => entry.operation === "list-restrictions");
  assert.equal(restrictions?.support, "unknown");
  // Auth model KIND as data — never credentials.
  assert.equal(validated.auth.model.kind, "oauth2");
  assert.equal(validated.auth.model.managedBy, "integrations");
  assert.ok(validated.auth.flows.length > 0);
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

test("youtube publish: video round-trip through the transport double with a §30 record and ONE provider operation", () => {
  const { registered, binding } = registeredYouTube();
  const result = registered.stack.adapter.publish(providerPublishRequest(registered));

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.record.providerId, YOUTUBE_PROVIDER_ID);
    assert.equal(result.record.operationSupport, "supported");
    assert.equal(result.record.transportSource, YOUTUBE_TRANSPORT_SOURCE);
    assert.equal(result.output.postRef, "youtube-video:fixture-1");
    assert.equal(result.output.source, YOUTUBE_TRANSPORT_SOURCE);
    assert.equal(registered.stack.adapter.listPublications(TENANT_ALPHA).length, 1);
  }
  assert.equal(binding.providerOperations().length, 1);
  assert.equal(binding.providerOperations()[0]?.operation, "publish");
  assert.equal(binding.providerOperations()[0]?.idempotencyKey, null);
});

test("youtube schedule: platform-confirmed future publication", () => {
  const { registered, binding } = registeredYouTube();
  const result = registered.stack.adapter.schedule({
    ...providerPublishRequest(registered),
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.scheduleRef, "youtube-schedule:fixture-1");
    assert.equal(result.output.scheduledAt, "2026-06-02T12:00:00.000Z");
    assert.equal(result.output.requestedAt, "2026-06-02T12:00:00.000Z");
  }
  assert.equal(binding.providerOperations().length, 1);
});

test("youtube read-observations: platform-said metrics recorded VERBATIM", () => {
  const { registered } = registeredYouTube();
  const result = registered.stack.adapter.readObservations({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    subjectRef: "youtube-video:fixture-1",
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 1);
    assert.deepEqual(result.output[0]?.reported, { views: 4211, likes: 87, comments: 12 });
    assert.equal(result.output[0]?.providerRefs[0], "youtube-analytics:fixture-1");
    assert.equal(result.output[0]?.source, YOUTUBE_TRANSPORT_SOURCE);
  }
});

test("youtube delete: platform-confirmed retraction", () => {
  const { registered, binding } = registeredYouTube();
  const result = registered.stack.adapter.delete({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    postRef: "youtube-video:fixture-1" as never,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.postRef, "youtube-video:fixture-1");
    assert.equal(result.output.retractedAt, "2026-06-03T00:00:05.000Z");
  }
  assert.equal(binding.providerOperations().length, 1);
});

test("youtube list-restrictions: declared UNKNOWN is its OWN typed outcome (zero provider operations)", () => {
  const { registered, binding } = registeredYouTube();
  const result = registered.stack.adapter.listRestrictions({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown");
  assert.notEqual(result.failure.code, "operation-unsupported");
  // The §30 record carries the declaration VERBATIM (never coerced).
  assert.equal(result.record.operationSupport, "unknown");
  assert.equal(binding.providerOperations().length, 0);
});

test("youtube adapter-level fail-closed: a channel declaring list-restrictions supported still gets the ADAPTER's unknown refusal", () => {
  const { registered, binding } = registeredYouTube();
  // A channel registration that CONTRADICTS the adapter's own declaration.
  const channel = registered.stack.channels.register({
    scope: SCOPE_ALPHA,
    name: "youtube-contradicting",
    providerId: YOUTUBE_PROVIDER_ID,
    displayName: "YouTube (contradicting fixture)",
    instanceRef: registered.instance.id,
    externalAccount: PROVIDER_STACK_EXTERNAL_ACCOUNT,
    capabilityMatrix: YOUTUBE_PROVIDER_PROFILE.capabilityMatrix.map((entry) =>
      entry.operation === "list-restrictions" ? { operation: "list-restrictions", support: "supported" } : entry,
    ),
  });

  const result = registered.stack.adapter.listRestrictions({
    scope: channel.scope,
    channelRef: channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown-at-adapter");
  assert.equal(result.failure.details?.declaredSupport, "unknown");
  // The channel's (wrong) declaration passed the tenant-side gate; the
  // §30 record names the ADAPTER as the refusing surface.
  assert.equal(result.record.operationSupport, "supported");
  assert.equal(result.record.transportSource, YOUTUBE_TRANSPORT_SOURCE);
  assert.equal(binding.providerOperations().length, 0);
});

test("youtube shapes: text-only presentation and image artifacts are typed refusals BEFORE any provider interaction", () => {
  const { registered, binding } = registeredYouTube();

  const textOnly = registered.stack.adapter.publish(
    providerPublishRequest(registered, { presentationKind: "text-only", artifact: registered.artifacts.text }),
  );
  assert.equal(textOnly.outcome, "failed");
  assert.equal(textOnly.failure.code, "operation-shape-unsupported");
  if (textOnly.outcome === "failed") {
    assert.equal(textOnly.failure.details?.presentationKind, "text-only");
    assert.deepEqual(textOnly.failure.details?.declaredShapes, ["video-upload"]);
  }

  const imageArtifact = registered.stack.adapter.publish(
    providerPublishRequest(registered, { artifact: registered.artifacts.image }),
  );
  assert.equal(imageArtifact.outcome, "failed");
  assert.equal(imageArtifact.failure.code, "operation-shape-unsupported");
  if (imageArtifact.outcome === "failed") {
    assert.equal(imageArtifact.failure.details?.artifactFamily, "image");
  }

  assert.equal(binding.providerOperations().length, 0);
});

test("youtube idempotency: the same logical publish retried records ONE provider operation (replay-safe)", () => {
  const { registered, binding } = registeredYouTube();
  const first = registered.stack.adapter.publish(providerPublishRequest(registered, { idempotencyKey: "yt-key-1" }));
  const second = registered.stack.adapter.publish(providerPublishRequest(registered, { idempotencyKey: "yt-key-1" }));

  assert.equal(first.outcome, "completed");
  assert.equal(second.outcome, "completed");
  // ONE provider operation for the retried logical publish.
  assert.equal(binding.providerOperations().length, 1);
  assert.equal(binding.providerOperations()[0]?.idempotencyKey, "yt-key-1");
  // The replay surfaces the idempotent-replay warning on its §30 record.
  if (second.outcome === "completed") {
    assert.ok(second.record.warnings.some((warning) => warning.code === "idempotent-replay"));
    // The platform said the same thing (same post ref — the platform-side
    // idempotency held; the double answered the ONE provider operation).
    assert.equal(second.output.postRef, "youtube-video:fixture-1");
  }
  // Both attempts are §30-recorded (every attributable attempt is).
  assert.equal(registered.stack.adapter.listDistributionRecords(TENANT_ALPHA).length, 2);
});

test("youtube idempotency: key reuse with CHANGED parameters is a typed conflict (no second provider operation)", () => {
  const { registered, binding } = registeredYouTube();
  const first = registered.stack.adapter.publish(providerPublishRequest(registered, { idempotencyKey: "yt-key-2" }));
  assert.equal(first.outcome, "completed");

  const conflicting = registered.stack.adapter.publish(
    providerPublishRequest(registered, {
      idempotencyKey: "yt-key-2",
      presentationKind: "single-artifact",
    }),
  );
  assert.equal(conflicting.outcome, "failed");
  assert.equal(conflicting.failure.code, "idempotency-key-conflict");
  assert.equal(binding.providerOperations().length, 1);
});

test("youtube idempotency: keyless publishes are FRESH provider operations (disclosed)", () => {
  const { registered, binding } = registeredYouTube();
  registered.stack.adapter.publish(providerPublishRequest(registered));
  registered.stack.adapter.publish(providerPublishRequest(registered));
  assert.equal(binding.providerOperations().length, 2);
  assert.equal(binding.providerOperations()[0]?.idempotencyKey, null);
  assert.equal(binding.providerOperations()[1]?.idempotencyKey, null);
});

test("youtube rate limit: DECLAREDLY simulated posture recorded as an observation (observedAt + provider refs + self-label)", () => {
  const binding = createYouTubeTransportBinding({
    routes: YOUTUBE_TEST_ROUTES,
    now,
    simulatedRateLimit: {
      posture: "near-limit",
      observedAt: "2026-06-01T00:00:05.000Z" as never,
      observed: { requestsInWindow: 41, windowMs: 600000 },
      providerRefs: ["youtube-quota:fixture-1"],
    },
  });
  const registered = registeredProviderStack({ profile: YOUTUBE_PROVIDER_PROFILE, transport: binding, now });

  const result = registered.stack.adapter.publish(providerPublishRequest(registered));
  assert.equal(result.outcome, "completed");

  const records = registered.stack.adapter.listRateLimitObservations(TENANT_ALPHA);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record);
  assert.equal(record.posture, "near-limit");
  assert.equal(record.observedAt, "2026-06-01T00:00:05.000Z");
  assert.deepEqual(record.observed, { requestsInWindow: 41, windowMs: 600000 });
  assert.equal(record.providerRefs[0], "youtube-quota:fixture-1");
  assert.equal(record.providerId, YOUTUBE_PROVIDER_ID);
  // The SELF-LABEL: the simulated posture is the DOUBLE's, never live evidence.
  assert.equal(record.source, YOUTUBE_TRANSPORT_SOURCE);
});

test("youtube rights gate: a denied rights evaluation NEVER reaches the binding (zero sends, zero provider operations)", () => {
  const binding = createYouTubeTransportBinding({ routes: YOUTUBE_TEST_ROUTES, now });
  const counting = createCountingTransport(binding);
  const registered = registeredProviderStack({ profile: YOUTUBE_PROVIDER_PROFILE, transport: counting, now });

  // A rights context whose grant covers a DIFFERENT subject.
  const uncovered = registered.stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:youtube-uncovered",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        actions: ["distribute"],
        subjectRefs: ["artifact:some-other-artifact"],
      }),
    ],
  });

  const denied = registered.stack.adapter.publish(
    providerPublishRequest(registered, { rightsContextRef: uncovered }),
  );
  assert.equal(denied.outcome, "failed");
  assert.equal(denied.failure.code, "rights-gate-denied");
  assert.equal(denied.failure.details?.denialReason, "subject-not-covered");
  assert.equal(counting.sentCount(), 0);
  assert.equal(binding.providerOperations().length, 0);
});

test("youtube tenant scoping: records never cross tenants; foreign channel ids are indistinguishable from unknown", () => {
  const { registered, binding } = registeredYouTube();
  const beta = registerSecondTenant(registered);

  const betaPublish = registered.stack.adapter.publish({
    scope: beta.channel.scope,
    channelRef: beta.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: beta.rightsContextRef,
    artifact: beta.artifact,
    presentation: { kind: "artifact-with-caption" },
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
    artifact: registered.artifacts.video,
    presentation: { kind: "artifact-with-caption" },
  });
  assert.equal(foreign.outcome, "unresolved-channel");
});

test("youtube isolation: the binding refuses to serve a foreign provider's request", () => {
  const binding = createYouTubeTransportBinding({ routes: YOUTUBE_TEST_ROUTES, now });
  const response = binding.send({
    requestId: "social-distribution-isolation" as never,
    scope: SCOPE_ALPHA,
    providerId: "provider:foreign-fixture" as never,
    channelRef: "social-channel-isolation" as never,
    instanceRef: "merchant-client-instance-isolation" as never,
    operation: "publish",
    parameters: { artifact: { artifactId: "artifact-isolation", type: "video/mp4" }, presentation: { kind: "single-artifact" } },
  });

  assert.equal(response.ok, false);
  if (!response.ok) {
    assert.equal(response.failure.code, "provider-adapter-mismatch");
    assert.equal(response.failure.details?.expectedProviderId, YOUTUBE_PROVIDER_ID);
    assert.equal(response.failure.details?.requestedProviderId, "provider:foreign-fixture");
    assert.equal(response.source, YOUTUBE_TRANSPORT_SOURCE);
  }
  assert.equal(binding.providerOperations().length, 0);
});
