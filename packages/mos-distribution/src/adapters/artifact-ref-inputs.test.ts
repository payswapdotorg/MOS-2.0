/**
 * SOCIAL-001: artifact-ref inputs — the control plane carries CONTENT
 * ARTIFACT REFS, never inline media bytes (§6/AGENTS.md "Media"). Pins:
 * - publish/schedule inputs are STRICT-SHAPE: a smuggled media field
 *   (`mediaBytes`, `base64`, `dataUrl`, ...) is rejected listing the
 *   unexpected fields — there is no field through which bytes could
 *   enter (compile-time exact-keyset pins in contracts/type-pins.ts are
 *   the static twin);
 * - the artifact ref itself is validated fail-closed (all reference
 *   fields present and well-formed);
 * - the publication record ECHOES the artifact ref verbatim (references
 *   preserved — artifactId, version, digest, storageRef, rightsRef,
 *   provenanceRef);
 * - the RIGHTS SUBJECT of a publication derives from the ARTIFACT (a
 *   grant covering another artifact does not authorize this one);
 * - the transport parameters carry the artifact REFERENCE (the id/ref
 *   object), never bytes — inspected through a capturing transport;
 * - presentations are small control-plane data, validated fail-closed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { SocialTransportRequest } from "../ports/social-transport.port.js";
import { registeredAuroraStack } from "../testing/registered-stack.js";
import {
  ACTOR_ONE,
  FIXTURE_ARTIFACT,
  FIXTURE_NOW,
  SECOND_ARTIFACT,
  socialRightsGrantFixture,
} from "../testing/fixtures.js";
import { DistributionError } from "../errors.js";

const now = () => FIXTURE_NOW;

/** A capturing transport: records every request, answers both publish and schedule payloads. */
function createCapturingTransport() {
  const requests: SocialTransportRequest[] = [];
  return {
    requests,
    transport: {
      send(request: SocialTransportRequest) {
        requests.push(request);
        return {
          ok: true,
          output: {
            postRef: "aurora-post:captured-1",
            publishedAt: "2026-06-01T00:00:05.000Z",
            scheduleRef: "aurora-schedule:captured-1",
            scheduledAt: "2026-06-02T12:00:00.000Z",
          },
          warnings: [],
          source: "capturing-test-transport",
        } as const;
      },
    },
  };
}

function basePublish(registered: ReturnType<typeof registeredAuroraStack>) {
  return {
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "artifact-with-caption" as const },
  };
}

test("artifact-ref inputs: a smuggled MEDIA field on the publish request is rejected (strict shape)", () => {
  const registered = registeredAuroraStack({ now });
  const smuggled = {
    ...basePublish(registered),
    mediaBytes: "SGVsbG8gd29ybGQ=", // base64 bytes — must not enter the control plane
  };
  assert.throws(
    () => registered.stack.adapter.publish(smuggled as never),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      assert.deepEqual(error.details.unexpectedFields, ["mediaBytes"]);
      return true;
    },
  );
});

test("artifact-ref inputs: a smuggled media field ON THE ARTIFACT is rejected (the ref is strict-shape too)", () => {
  const registered = registeredAuroraStack({ now });
  const smuggledArtifact = {
    ...FIXTURE_ARTIFACT,
    base64: "SGVsbG8gd29ybGQ=",
  };
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        ...basePublish(registered),
        artifact: smuggledArtifact,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      assert.deepEqual(error.details.unexpectedFields, ["base64"]);
      return true;
    },
  );
});

test("artifact-ref inputs: a malformed artifact ref (missing storageRef / bad version) is rejected", () => {
  const registered = registeredAuroraStack({ now });
  const { storageRef: _dropped, ...missingStorage } = FIXTURE_ARTIFACT;
  void _dropped;
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        ...basePublish(registered),
        artifact: missingStorage as never,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        ...basePublish(registered),
        artifact: { ...FIXTURE_ARTIFACT, version: 0 as never },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
});

test("artifact-ref inputs: the publication record ECHOES the artifact ref verbatim", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.publish(basePublish(registered));

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.deepEqual(result.output.artifact, FIXTURE_ARTIFACT);
    assert.equal(result.output.artifact.artifactId, FIXTURE_ARTIFACT.artifactId);
    assert.equal(result.output.artifact.version, FIXTURE_ARTIFACT.version);
    assert.equal(result.output.artifact.digest, FIXTURE_ARTIFACT.digest);
    assert.equal(result.output.artifact.storageRef, FIXTURE_ARTIFACT.storageRef);
    assert.equal(result.output.artifact.rightsRef, FIXTURE_ARTIFACT.rightsRef);
    assert.equal(result.output.artifact.provenanceRef, FIXTURE_ARTIFACT.provenanceRef);
  }
});

test("artifact-ref inputs: the RIGHTS SUBJECT of a publication derives from the ARTIFACT", () => {
  const registered = registeredAuroraStack({ now });
  // A context covering only the SECOND artifact.
  const secondOnlyRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:second-artifact",
        tenantId: registered.channel.scope.tenantId,
        grantee: ACTOR_ONE,
        actions: ["distribute"],
        subjectRefs: [`artifact:${SECOND_ARTIFACT.artifactId as string}`],
      }),
    ],
  });

  // Publishing the FIRST artifact under the second-artifact grant → denied.
  const denied = registered.stack.adapter.publish({
    ...basePublish(registered),
    rightsContextRef: secondOnlyRef,
  });
  assert.equal(denied.outcome, "failed");
  assert.equal(denied.failure.code, "rights-gate-denied");
  assert.equal(denied.failure.details?.denialReason, "subject-not-covered");

  // Publishing the SECOND artifact under the same grant completes.
  const allowed = registered.stack.adapter.publish({
    ...basePublish(registered),
    rightsContextRef: secondOnlyRef,
    artifact: SECOND_ARTIFACT,
  });
  assert.equal(allowed.outcome, "completed");
});

test("artifact-ref inputs: the transport parameters carry the artifact REFERENCE, never bytes", () => {
  const capturing = createCapturingTransport();
  const registered = registeredAuroraStack({ now, transport: capturing.transport });

  const result = registered.stack.adapter.publish(basePublish(registered));
  assert.equal(result.outcome, "completed");
  assert.equal(capturing.requests.length, 1);

  const sent = capturing.requests[0];
  assert.ok(sent);
  assert.equal(sent.operation, "publish");
  assert.equal(sent.instanceRef, registered.instance.id);
  // The parameters carry the artifact REF object (small control-plane
  // values — artifactId/version/storageRef/digest...), never media bytes.
  const artifactParam = (sent.parameters as { artifact?: unknown }).artifact as Record<string, unknown>;
  assert.equal(artifactParam.artifactId, FIXTURE_ARTIFACT.artifactId);
  assert.equal(artifactParam.version, FIXTURE_ARTIFACT.version);
  assert.equal(artifactParam.storageRef, FIXTURE_ARTIFACT.storageRef);
  assert.equal(artifactParam.digest, FIXTURE_ARTIFACT.digest);
  // No byte-ish field anywhere in the parameters.
  const serialized = JSON.stringify(sent.parameters);
  assert.equal(serialized.includes("base64"), false);
  assert.ok(serialized.length < 500, "control-plane parameters stay small");
});

test("artifact-ref inputs: schedule carries the SAME artifact-ref discipline", () => {
  const capturing = createCapturingTransport();
  const registered = registeredAuroraStack({ now, transport: capturing.transport });

  const result = registered.stack.adapter.schedule({
    ...basePublish(registered),
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });
  assert.equal(result.outcome, "completed");
  const sent = capturing.requests[0];
  assert.ok(sent);
  assert.equal(sent.operation, "schedule");
  assert.equal((sent.parameters as { scheduledAt?: unknown }).scheduledAt, "2026-06-02T12:00:00.000Z");
  assert.equal(
    ((sent.parameters as { artifact?: unknown }).artifact as Record<string, unknown>).artifactId,
    FIXTURE_ARTIFACT.artifactId,
  );
  // An unparseable scheduledAt is a typed validation error.
  assert.throws(
    () =>
      registered.stack.adapter.schedule({
        ...basePublish(registered),
        scheduledAt: "not-a-timestamp" as never,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
});

test("artifact-ref inputs: presentations are small control-plane data, validated fail-closed", () => {
  const registered = registeredAuroraStack({ now });
  // Invalid presentation kind.
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        ...basePublish(registered),
        presentation: { kind: "viral-autoplay" as never },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
  // Blank caption.
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        ...basePublish(registered),
        presentation: { kind: "artifact-with-caption", caption: "   " },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
  // Non-object presentation parameters.
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        ...basePublish(registered),
        presentation: { kind: "link-preview", parameters: "not-an-object" as never },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
});
