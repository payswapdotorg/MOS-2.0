/**
 * SOCIAL-001: operation round-trips through the doubles with §30 records.
 * Every operation of the provider-neutral social surface completes
 * through the disclosed in-memory transport double, appends its
 * platform-confirmed output record immutably to its tenant-scoped
 * append-only log, and leaves an immutable §30 record (request id,
 * provider ref, capability invoked — operation + declared support —,
 * actor, duration, failure/warnings, honest transport source label) in
 * the audit log. Transport failures and untypable platform responses are
 * typed failures — never silent, never invented.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { IN_MEMORY_SOCIAL_TRANSPORT_SOURCE } from "../adapters/in-memory-social-transport.js";
import type { PublishSocialPostInput } from "../contracts/social-operation.js";
import { registeredAuroraStack, registerChannelWithMatrix } from "../testing/registered-stack.js";
import { createCountingTransport } from "../testing/counting-transport.js";
import {
  ACTOR_ONE,
  AURORA_PROVIDER_ID,
  CINDER_PROVIDER_ID,
  DUNE_PROVIDER_ID,
  FIXTURE_ARTIFACT,
  FIXTURE_NOW,
  FULLY_SUPPORTED_MATRIX,
} from "../testing/fixtures.js";

const now = () => FIXTURE_NOW;

function publishRequest(registered: ReturnType<typeof registeredAuroraStack>): PublishSocialPostInput {
  return {
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "artifact-with-caption", caption: "fixture caption (fictional)" },
  };
}

test("round-trip: publish completes with a platform-confirmed publication record + §30 record", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.publish(publishRequest(registered));

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const publication = result.output;
    assert.equal(publication.postRef, "aurora-post:fixture-1");
    assert.equal(publication.publishedAt, "2026-06-01T00:00:05.000Z");
    assert.deepEqual(publication.artifact, FIXTURE_ARTIFACT);
    assert.equal(publication.presentation.caption, "fixture caption (fictional)");
    assert.equal(publication.source, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    assert.equal(publication.recordedAt, FIXTURE_NOW);

    const record = result.record;
    assert.equal(record.operation, "publish");
    assert.equal(record.operationSupport, "supported");
    assert.equal(record.providerId, AURORA_PROVIDER_ID);
    assert.equal(record.actor, ACTOR_ONE);
    assert.equal(record.failure, null);
    assert.equal(record.transportSource, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    assert.ok(record.durationMs >= 0);
    assert.ok(record.id.length > 0);

    // The publication is in the tenant-scoped append-only log.
    const listed = registered.stack.adapter.listPublications(registered.channel.scope.tenantId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, publication.id);
    // And the §30 record is retrievable by id.
    assert.equal(
      registered.stack.adapter.getDistributionRecord(registered.channel.scope.tenantId, record.id)?.id,
      record.id,
    );
  }
});

test("round-trip: schedule completes with the requested echo + platform-confirmed schedule", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.schedule({
    ...publishRequest(registered),
    scheduledAt: "2026-06-02T12:00:00.000Z" as never,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const schedule = result.output;
    assert.equal(schedule.requestedAt, "2026-06-02T12:00:00.000Z");
    assert.equal(schedule.scheduledAt, "2026-06-02T12:00:00.000Z");
    assert.equal(schedule.scheduleRef, "aurora-schedule:fixture-1");
    assert.deepEqual(schedule.artifact, FIXTURE_ARTIFACT);
    assert.equal(schedule.source, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    assert.equal(result.record.operation, "schedule");
  }
});

test("round-trip: read-observations completes with platform-reported observation records", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.readObservations({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    subjectRef: "aurora-post:fixture-1",
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 1);
    assert.equal(result.output[0]?.subjectRef, "aurora-post:fixture-1");
    assert.equal(result.record.operation, "read-observations");
    // The observations are in the tenant-scoped append-only log.
    const listed = registered.stack.adapter.listObservations(registered.channel.scope.tenantId);
    assert.equal(listed.length, 1);
  }
});

test("round-trip: delete completes with a platform-confirmed retraction record", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.delete({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    postRef: "aurora-post:fixture-1" as never,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const retraction = result.output;
    assert.equal(retraction.postRef, "aurora-post:fixture-1");
    assert.equal(retraction.retractedAt, "2026-06-03T00:00:05.000Z");
    assert.equal(retraction.source, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    assert.equal(result.record.operation, "delete");
  }
});

test("round-trip: list-restrictions completes with platform-said restriction records", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.listRestrictions({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 1);
    assert.equal(result.output[0]?.description, "fictional rate window: 25 posts per 24h");
    assert.equal(result.output[0]?.observedAt, "2026-06-01T00:00:00.000Z");
    assert.equal(result.record.operation, "list-restrictions");
  }
});

test("round-trip: a transport failure is a typed failure with a §30 record", () => {
  const registered = registeredAuroraStack({ now });
  const cinderChannel = registerChannelWithMatrix(
    registered,
    FULLY_SUPPORTED_MATRIX,
    "cinder-main",
    CINDER_PROVIDER_ID,
  );

  const result = registered.stack.adapter.publish({
    scope: cinderChannel.scope,
    channelRef: cinderChannel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });

  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "transport-failed");
    assert.equal(result.failure.retriable, true);
    assert.equal(result.record.failure?.code, "transport-failed");
    assert.equal(result.record.transportSource, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    // Nothing was published.
    assert.equal(registered.stack.adapter.listPublications(cinderChannel.scope.tenantId).length, 0);
  }
});

test("round-trip: an untypable platform response is invalid-platform-response — never invented", () => {
  const registered = registeredAuroraStack({ now });
  // dune-social has NO route: the double echoes (no platform data), and
  // the echo carries no postRef — the runtime refuses to invent one.
  const duneChannel = registerChannelWithMatrix(
    registered,
    FULLY_SUPPORTED_MATRIX,
    "dune-main",
    DUNE_PROVIDER_ID,
  );

  const result = registered.stack.adapter.publish({
    scope: duneChannel.scope,
    channelRef: duneChannel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });

  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "invalid-platform-response");
    assert.equal(result.record.failure?.code, "invalid-platform-response");
    assert.equal(registered.stack.adapter.listPublications(duneChannel.scope.tenantId).length, 0);
  }
});

test("round-trip: an UNRESOLVED channel produces NO §30 record (nothing was attributable — disclosed)", () => {
  const registered = registeredAuroraStack({ now });
  const result = registered.stack.adapter.publish({
    ...publishRequest(registered),
    channelRef: "social-channel-does-not-exist" as never,
  });
  assert.equal(result.outcome, "unresolved-channel");
  assert.equal(result.failure.code, "unknown-social-channel");
  // No audit record exists for the unresolvable lookup.
  assert.equal(registered.stack.adapter.listDistributionRecords(registered.channel.scope.tenantId).length, 0);
});

test("round-trip: deterministic — identical stacks + fixed clock produce bit-for-bit identical evidence", () => {
  const first = registeredAuroraStack({ now });
  const second = registeredAuroraStack({ now });

  const firstResult = first.stack.adapter.publish(publishRequest(first));
  const secondResult = second.stack.adapter.publish(publishRequest(second));

  assert.equal(firstResult.outcome, "completed");
  assert.equal(secondResult.outcome, "completed");
  if (firstResult.outcome === "completed" && secondResult.outcome === "completed") {
    assert.deepEqual(firstResult.record, secondResult.record);
    assert.deepEqual(firstResult.output, secondResult.output);
  }
});

test("round-trip: logs are APPEND-ONLY and records are frozen (no mutation surface)", () => {
  const registered = registeredAuroraStack({ now });
  registered.stack.adapter.publish(publishRequest(registered));
  registered.stack.adapter.publish(publishRequest(registered));

  const publications = registered.stack.adapter.listPublications(registered.channel.scope.tenantId);
  assert.equal(publications.length, 2);
  const audit = registered.stack.adapter.listDistributionRecords(registered.channel.scope.tenantId);
  assert.equal(audit.length, 2);

  // Records are deep-frozen — mutation attempts throw in strict mode.
  assert.throws(() => {
    (publications[0] as unknown as { postRef: string }).postRef = "tampered";
  });
  assert.throws(() => {
    (audit[0] as unknown as { failure: unknown }).failure = null;
  });

  // The log arrays returned are snapshots — no splice/push surface on the port.
  const snapshot = registered.stack.adapter.listPublications(registered.channel.scope.tenantId);
  assert.equal(snapshot.length, 2);
});

test("round-trip: §30 record completeness on a completed publish (the §30 field list)", () => {
  const counting = createCountingTransport({
    send: () => ({
      ok: true,
      output: {
        postRef: "aurora-post:counted-1",
        publishedAt: "2026-06-01T00:00:05.000Z",
      },
      warnings: [{ code: "fixture-warning", message: "fictional platform warning" }],
      source: "counting-test-transport",
    }),
  });
  const registered = registeredAuroraStack({ now, transport: counting });
  const result = registered.stack.adapter.publish(publishRequest(registered));

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const record = result.record;
    // §30: request id, provider ref, capability invoked, actor, duration,
    // failure/warnings — plus scope/channel/rights frame/policy/source.
    assert.ok(typeof record.id === "string" && record.id.length > 0);
    assert.equal(record.providerId, AURORA_PROVIDER_ID);
    assert.equal(record.operation, "publish");
    assert.equal(record.operationSupport, "supported");
    assert.equal(record.actor, ACTOR_ONE);
    assert.ok(record.durationMs >= 0);
    assert.equal(record.failure, null);
    assert.deepEqual(record.warnings, [{ code: "fixture-warning", message: "fictional platform warning" }]);
    assert.equal(record.transportSource, "counting-test-transport");
    assert.equal(record.scope.tenantId, registered.channel.scope.tenantId);
    assert.equal(record.channelRef, registered.channel.id);
    assert.equal(record.rightsContextRef, registered.rightsContextRef);
  }
});
