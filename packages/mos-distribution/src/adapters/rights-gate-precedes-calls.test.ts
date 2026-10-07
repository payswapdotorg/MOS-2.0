/**
 * SOCIAL-001 acceptance: "rights/policy gates precede provider calls" —
 * the RIGHTS half, test-pinned:
 * - every adapter invocation requires a RightsContextRef (a request
 *   without one is a typed validation error — there is no field-free
 *   path to a provider call);
 * - a DENIED evaluation NEVER reaches the transport (send counting);
 * - the evaluation is the REAL injected `evaluateRights` of @mos/rights —
 *   denial reasons surface VERBATIM (every cascade stage), and an
 *   adequate explicit grant completes;
 * - the rights gate runs BEFORE the policy gate and BEFORE the
 *   capability matrix (a denied invocation surfaces
 *   `rights-gate-denied`, not a later stage's code);
 * - every attributable denial is §30-recorded (failure + verbatim reason
 *   + the refusing gate's source label).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { registeredAuroraStack } from "../testing/registered-stack.js";
import { createCountingTransport } from "../testing/counting-transport.js";
import {
  ACTOR_ONE,
  ACTOR_TWO,
  AURORA_EXTERNAL_ACCOUNT,
  FIXTURE_ARTIFACT,
  FIXTURE_NOW,
  SECOND_ARTIFACT,
  socialRightsGrantFixture,
} from "../testing/fixtures.js";
import { DistributionError } from "../errors.js";

const now = () => FIXTURE_NOW;

const standardPublish = {
  actor: ACTOR_ONE,
  artifact: FIXTURE_ARTIFACT,
  presentation: { kind: "artifact-with-caption" } as const,
};

/** A publish request over the registered channel with an OVERRIDABLE rights context. */
function publishOver(registered: ReturnType<typeof registeredAuroraStack>, rightsContextRef?: string) {
  return registered.stack.adapter.publish({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: standardPublish.actor,
    rightsContextRef: (rightsContextRef ?? registered.rightsContextRef) as never,
    artifact: standardPublish.artifact,
    presentation: standardPublish.presentation,
  });
}

test("rights gate precedes calls: a request WITHOUT a rightsContextRef is a typed validation error", () => {
  const registered = registeredAuroraStack({ now });
  assert.throws(
    () =>
      registered.stack.adapter.publish({
        scope: registered.channel.scope,
        channelRef: registered.channel.id,
        actor: ACTOR_ONE,
        rightsContextRef: undefined as never,
        artifact: FIXTURE_ARTIFACT,
        presentation: { kind: "single-artifact" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-social-request");
      return true;
    },
  );
});

test("rights gate precedes calls: a DENIED evaluation never reaches the transport (pinned)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  // A context whose grants name the OTHER artifact → subject-not-covered.
  const deniedRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:other-artifact",
        tenantId: registered.channel.scope.tenantId,
        grantee: ACTOR_ONE,
        actions: ["distribute"],
        subjectRefs: [`artifact:${SECOND_ARTIFACT.artifactId as string}`],
      }),
    ],
  });
  const result = publishOver(registered, deniedRef);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: denial reasons surface VERBATIM from the @mos/rights cascade", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const scope = registered.channel.scope;

  const cases: readonly (readonly [string, string])[] = [
    [
      "no-explicit-grant",
      registered.stack.registerRightsContext({ scope, grants: [] }) as string,
    ],
    [
      "subject-not-covered",
      registered.stack.registerRightsContext({
        scope,
        grants: [
          socialRightsGrantFixture({
            grantId: "grant:other-subject",
            tenantId: scope.tenantId,
            grantee: ACTOR_ONE,
            actions: ["distribute"],
            subjectRefs: [`artifact:${SECOND_ARTIFACT.artifactId as string}`],
          }),
        ],
      }) as string,
    ],
    [
      "grantee-not-covered",
      registered.stack.registerRightsContext({
        scope,
        grants: [
          socialRightsGrantFixture({
            grantId: "grant:other-grantee",
            tenantId: scope.tenantId,
            grantee: ACTOR_TWO,
            actions: ["distribute"],
            subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
          }),
        ],
      }) as string,
    ],
    [
      "action-not-covered",
      registered.stack.registerRightsContext({
        scope,
        grants: [
          socialRightsGrantFixture({
            grantId: "grant:analyze-only",
            tenantId: scope.tenantId,
            grantee: ACTOR_ONE,
            actions: ["analyze"],
            subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
          }),
        ],
      }) as string,
    ],
    [
      "grant-revoked",
      registered.stack.registerRightsContext({
        scope,
        grants: [
          socialRightsGrantFixture({
            grantId: "grant:revoked",
            tenantId: scope.tenantId,
            grantee: ACTOR_ONE,
            actions: ["distribute"],
            subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
            revokedAt: "2026-05-01T00:00:00.000Z",
          }),
        ],
      }) as string,
    ],
    [
      "grant-expired",
      registered.stack.registerRightsContext({
        scope,
        grants: [
          socialRightsGrantFixture({
            grantId: "grant:expired",
            tenantId: scope.tenantId,
            grantee: ACTOR_ONE,
            actions: ["distribute"],
            subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
            expiresAt: "2026-05-01T00:00:00.000Z",
          }),
        ],
      }) as string,
    ],
  ];

  for (const [expectedReason, ref] of cases) {
    const result = publishOver(registered, ref);
    assert.equal(result.outcome, "failed", `case ${expectedReason}`);
    assert.equal(result.failure.code, "rights-gate-denied", `case ${expectedReason}`);
    assert.equal(result.failure.details?.denialReason, expectedReason, `case ${expectedReason}`);
    assert.equal(result.record.failure?.details?.denialReason, expectedReason, `case ${expectedReason}`);
  }
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: an UNRESOLVABLE rights context handle fails closed", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const result = publishOver(registered, "social-rights-context-does-not-exist");
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: a CROSS-TENANT context handle is indistinguishable from unresolved (§31)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const foreignRef = registered.stack.registerRightsContext({
    scope: { tenantId: "tenant-beta" as never },
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:beta",
        tenantId: "tenant-beta" as never,
        grantee: ACTOR_ONE,
        actions: ["distribute"],
        subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
      }),
    ],
  });
  const result = publishOver(registered, foreignRef);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  // SAME denial reason as a nonexistent handle — no existence leak.
  assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: an adequate explicit grant completes through the REAL evaluateRights", () => {
  const registered = registeredAuroraStack({ now });
  const result = publishOver(registered);
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    // The §30 record cites the rights frame that was presented.
    assert.equal(result.record.rightsContextRef, registered.rightsContextRef);
    assert.equal(result.record.failure, null);
  }
});

test("rights gate precedes calls: the rights gate runs BEFORE the policy gate (denied rights + no policy rule → rights denial)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  // NO policy rules at all — the policy gate would deny everything; the
  // rights gate's denial must surface FIRST.
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [] });
  const deniedRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [],
  });
  const result = publishOver(registered, deniedRef);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.notEqual(result.failure.code, "policy-gate-denied");
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: the rights gate runs BEFORE the capability matrix", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  // A channel with NO publish declaration, plus a denied rights context:
  // the rights denial surfaces (the matrix is never consulted).
  const partial = registered.stack.channels.register({
    scope: registered.channel.scope,
    name: "aurora-no-publish",
    providerId: registered.channel.providerId,
    displayName: "partial",
    instanceRef: registered.instance.id,
    capabilityMatrix: [{ operation: "read-observations", support: "supported" }],
  });
  const deniedRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [],
  });
  const result = registered.stack.adapter.publish({
    scope: partial.scope,
    channelRef: partial.id,
    actor: ACTOR_ONE,
    rightsContextRef: deniedRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.equal(result.record.operationSupport, null);
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: EVERY operation is rights-gated (read-observations denial)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const deniedRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [
      // The channel-account subject is covered for ANALYZE but not for
      // the ACTOR — grantee-not-covered.
      socialRightsGrantFixture({
        grantId: "grant:other-actor-account",
        tenantId: registered.channel.scope.tenantId,
        grantee: ACTOR_TWO,
        actions: ["analyze", "distribute"],
        subjectRefs: [AURORA_EXTERNAL_ACCOUNT as string],
      }),
    ],
  });
  const result = registered.stack.adapter.readObservations({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: deniedRef,
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.equal(result.failure.details?.denialReason, "grantee-not-covered");
  assert.equal(counting.sentCount(), 0);
});

test("rights gate precedes calls: every attributable denial is §30-recorded with the refusing gate's label", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting });
  const deniedRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [],
  });
  const result = publishOver(registered, deniedRef);
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    const record = result.record;
    assert.equal(record.operation, "publish");
    assert.equal(record.providerId, registered.channel.providerId);
    assert.equal(record.actor, ACTOR_ONE);
    assert.equal(record.rightsContextRef, deniedRef);
    assert.equal(record.failure?.code, "rights-gate-denied");
    assert.equal(record.transportSource, "rights-gate");
    assert.equal(record.policyRef, null);
    assert.ok(record.durationMs >= 0);
    // And the record is in the tenant-scoped audit log.
    const listed = registered.stack.adapter.listDistributionRecords(
      registered.channel.scope.tenantId,
      { failureCode: "rights-gate-denied" },
    );
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, record.id);
  }
});
