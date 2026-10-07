/**
 * SOCIAL-001 acceptance: the capability matrix — "capability parity is
 * never assumed; every provider declares supported/unsupported/unknown
 * capabilities". Pins:
 * - a DECLARED `supported` operation proceeds through the gates to the
 *   transport;
 * - a DECLARED `unknown` operation yields its OWN typed outcome
 *   (`operation-support-unknown`) — preserved first-class, never coerced
 *   to `operation-unsupported` — and the §30 record carries the
 *   declaration VERBATIM;
 * - a DECLARED `unsupported` operation is a typed refusal that NEVER
 *   reaches the transport;
 * - an UNDECLARED operation (no matrix entry) is a typed refusal — the
 *   declared surface is the whole surface, never parity, never default;
 * - registration is fail-closed (closed vocabularies, duplicate entries);
 * - the canonical boolean projection maps supported/unsupported and
 *   deliberately omits unknown (the typed layer is authoritative);
 * - a corrected matrix is a NEW channel version (append-only) and the
 *   new version governs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { projectCapabilityMatrix } from "../contracts/social-channel.js";
import type { SocialProviderCapability } from "../contracts/social-operation.js";
import type { Version } from "@mos/contracts";
import { registeredAuroraStack, registerChannelWithMatrix } from "../testing/registered-stack.js";
import { createCountingTransport } from "../testing/counting-transport.js";
import {
  DELETE_UNSUPPORTED_MATRIX,
  FIXTURE_ARTIFACT,
  FIXTURE_NOW,
  PUBLISH_ONLY_MATRIX,
  SCHEDULE_UNKNOWN_MATRIX,
} from "../testing/fixtures.js";
import { DistributionError } from "../errors.js";

const now = () => FIXTURE_NOW;

test("capability matrix: a DECLARED supported operation proceeds through the gates to the transport", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.publish({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: "identity:actor-one" as never,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "artifact-with-caption", caption: "fixture caption (fictional)" },
  });
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.record.operationSupport, "supported");
    assert.equal(result.output.postRef, "aurora-post:fixture-1");
  }
});

test("capability matrix: DECLARED unknown is its OWN typed outcome — never coerced to unsupported", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const channel = registerChannelWithMatrix(registered, SCHEDULE_UNKNOWN_MATRIX, "aurora-unknown-schedule");

  const result = registered.stack.adapter.schedule({
    scope: channel.scope,
    channelRef: channel.id,
    actor: "identity:actor-one" as never,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-support-unknown");
  assert.notEqual(result.failure.code, "operation-unsupported");
  assert.equal(result.failure.details?.declaredSupport, "unknown");
  // The §30 record carries the declaration VERBATIM (never coerced).
  assert.equal(result.record.operationSupport, "unknown");
  // The refusal NEVER reaches the transport.
  assert.equal(counting.sentCount(), 0);
});

test("capability matrix: DECLARED unsupported is a typed refusal that never reaches the transport", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const channel = registerChannelWithMatrix(registered, DELETE_UNSUPPORTED_MATRIX, "aurora-no-delete");

  const result = registered.stack.adapter.delete({
    scope: channel.scope,
    channelRef: channel.id,
    actor: "identity:actor-one" as never,
    rightsContextRef: registered.rightsContextRef,
    postRef: "aurora-post:fixture-1" as never,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-unsupported");
  assert.equal(result.failure.details?.declaredSupport, "unsupported");
  assert.equal(result.record.operationSupport, "unsupported");
  assert.equal(counting.sentCount(), 0);
});

test("capability matrix: an UNDECLARED operation is a typed refusal — the declared surface is the whole surface", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const channel = registerChannelWithMatrix(registered, PUBLISH_ONLY_MATRIX, "aurora-partial");

  const result = registered.stack.adapter.readObservations({
    scope: channel.scope,
    channelRef: channel.id,
    actor: "identity:actor-one" as never,
    rightsContextRef: registered.rightsContextRef,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "operation-not-declared");
  assert.equal(result.failure.details?.operation, "read-observations");
  assert.equal(result.record.operationSupport, null);
  assert.equal(counting.sentCount(), 0);
});

test("capability matrix: an EMPTY matrix declares nothing — every operation is refused", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const channel = registerChannelWithMatrix(registered, [], "aurora-empty");

  for (const invoke of [
    () =>
      registered.stack.adapter.publish({
        scope: channel.scope,
        channelRef: channel.id,
        actor: "identity:actor-one" as never,
        rightsContextRef: registered.rightsContextRef,
        artifact: FIXTURE_ARTIFACT,
        presentation: { kind: "single-artifact" },
      }),
    () =>
      registered.stack.adapter.listRestrictions({
        scope: channel.scope,
        channelRef: channel.id,
        actor: "identity:actor-one" as never,
        rightsContextRef: registered.rightsContextRef,
      }),
  ]) {
    const result = invoke();
    assert.equal(result.outcome, "failed");
    assert.equal(result.failure.code, "operation-not-declared");
  }
  assert.equal(counting.sentCount(), 0);
});

test("capability matrix: registration is fail-closed — duplicate operation entries rejected", () => {
  const registered = registeredAuroraStack({ now });
  const duplicateMatrix: readonly SocialProviderCapability[] = [
    { operation: "publish", support: "supported" },
    { operation: "publish", support: "unsupported" },
  ];
  assert.throws(
    () =>
      registered.stack.channels.register({
        scope: registered.channel.scope,
        name: "aurora-duplicate",
        providerId: registered.channel.providerId,
        displayName: "duplicate",
        instanceRef: registered.instance.id,
        capabilityMatrix: duplicateMatrix,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-channel");
      return true;
    },
  );
});

test("capability matrix: registration is fail-closed — support must be the closed INTEG-001 vocabulary", () => {
  const registered = registeredAuroraStack({ now });
  assert.throws(
    () =>
      registered.stack.channels.register({
        scope: registered.channel.scope,
        name: "aurora-bogus-support",
        providerId: registered.channel.providerId,
        displayName: "bogus",
        instanceRef: registered.instance.id,
        capabilityMatrix: [{ operation: "publish", support: "maybe" as never }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-channel");
      return true;
    },
  );
});

test("capability matrix: the canonical boolean projection omits UNKNOWN (the typed layer is authoritative)", () => {
  const projection = projectCapabilityMatrix(SCHEDULE_UNKNOWN_MATRIX);
  assert.equal(projection.publish, true);
  assert.equal(projection.delete, true);
  // `unknown` has NO honest boolean — it is deliberately absent from the
  // canonical SocialAdapter.capabilityMatrix projection; consumers must
  // consult the typed matrix (preserved first-class, its own outcome).
  assert.equal("schedule" in projection, false);
  assert.equal(Object.keys(projection).includes("schedule"), false);
  // The unsupported declaration DOES project to false.
  const unsupportedProjection = projectCapabilityMatrix(DELETE_UNSUPPORTED_MATRIX);
  assert.equal(unsupportedProjection.delete, false);
});

test("capability matrix: a corrected matrix is a NEW channel version (append-only) and the new version governs", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const unknownChannel = registerChannelWithMatrix(registered, SCHEDULE_UNKNOWN_MATRIX, "aurora-corrected");

  // v1 declares schedule UNKNOWN → its own typed outcome.
  const refused = registered.stack.adapter.schedule({
    scope: unknownChannel.scope,
    channelRef: unknownChannel.id,
    actor: "identity:actor-one" as never,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });
  assert.equal(refused.outcome, "failed");
  assert.equal(refused.failure.code, "operation-support-unknown");

  // Append-only correction: re-registering the SAME id appends v2 with a
  // fully-supported matrix; prior versions stay resolvable.
  const corrected = registered.stack.channels.register({
    id: unknownChannel.id,
    scope: unknownChannel.scope,
    name: "aurora-corrected",
    providerId: unknownChannel.providerId,
    displayName: "corrected",
    instanceRef: registered.instance.id,
    capabilityMatrix: [
      { operation: "publish", support: "supported" },
      { operation: "schedule", support: "supported" },
      { operation: "read-observations", support: "supported" },
      { operation: "delete", support: "supported" },
      { operation: "list-restrictions", support: "supported" },
    ],
  });
  assert.equal(corrected.version, 2);
  assert.equal(
    registered.stack.channels.get(unknownChannel.scope.tenantId, unknownChannel.id, 1 as Version)
      ?.version,
    1,
  );
  assert.deepEqual(registered.stack.channels.listVersions(unknownChannel.scope.tenantId, unknownChannel.id), [1, 2]);

  // The LATEST version governs invocations.
  const result = registered.stack.adapter.schedule({
    scope: corrected.scope,
    channelRef: corrected.id,
    actor: "identity:actor-one" as never,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });
  assert.equal(result.outcome, "failed"); // counting transport returns an untypable echo
  assert.equal(result.failure.code, "invalid-platform-response");
  assert.equal(counting.sentCount(), 1);
});
