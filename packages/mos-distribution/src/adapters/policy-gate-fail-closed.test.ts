/**
 * SOCIAL-001 acceptance: "rights/policy gates precede provider calls" —
 * the POLICY half (the declared PolicyGatePort seam, frozen contract
 * shape; disclosed in-memory double — the policy package arrives in a
 * later wave). Pins:
 * - FAIL-CLOSED: a request matching NO policy rule is DENIED
 *   (`no-matching-policy`) — there is no permissive default, and the
 *   denial NEVER reaches the transport;
 * - an explicit DENY rule denies with its reason verbatim (no transport);
 * - an explicit PERMIT rule lets the invocation proceed to the
 *   capability matrix and the transport;
 * - the policy gate runs AFTER the rights gate and BEFORE the capability
 *   matrix (denials surface the right stage's code);
 * - the PERMIT verdict's cited policyRef lands on the §30 record;
 * - every attributable policy denial is §30-recorded;
 * - policy rules never cross tenants (§31).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { registeredAuroraStack } from "../testing/registered-stack.js";
import { createCountingTransport } from "../testing/counting-transport.js";
import type { SocialChannelId } from "../contracts/ids.js";
import {
  ACTOR_ONE,
  FIXTURE_ARTIFACT,
  FIXTURE_NOW,
  FIXTURE_POLICY_REF,
  SCOPE_BETA,
  SCOPE_ALPHA,
  denyRule,
  permitRule,
  socialRightsGrantFixture,
} from "../testing/fixtures.js";

const now = () => FIXTURE_NOW;

function publishOver(
  registered: ReturnType<typeof registeredAuroraStack>,
  overrides: { channelRef?: SocialChannelId } = {},
) {
  return registered.stack.adapter.publish({
    scope: registered.channel.scope,
    channelRef: overrides.channelRef ?? registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "artifact-with-caption" },
  });
}

test("policy gate fail-closed: a request matching NO policy rule is DENIED and never reaches the transport", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [] });

  const result = publishOver(registered);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "policy-gate-denied");
  assert.equal(result.failure.details?.denialReason, "no-matching-policy");
  assert.equal(counting.sentCount(), 0);
});

test("policy gate fail-closed: a registered-at-runtime rule is evaluated too (the seeding path)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [] });
  // Nothing registered → denied.
  const before = publishOver(registered);
  assert.equal(before.outcome, "failed");
  if (before.outcome === "failed") {
    assert.equal(before.failure.code, "policy-gate-denied");
  }
  // A permitting rule registered at runtime flips the verdict.
  registered.stack.registerPolicyRule(permitRule(SCOPE_ALPHA));
  const result = publishOver(registered);
  assert.equal(result.outcome, "failed"); // counting transport's echo is untypable
  assert.equal(result.failure.code, "invalid-platform-response");
  assert.equal(counting.sentCount(), 1);
});

test("policy gate fail-closed: an explicit DENY rule denies with its reason verbatim", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({
    now,
    transport: counting,
    policyRules: [denyRule(SCOPE_ALPHA, "fixture-brand-freeze")],
  });

  const result = publishOver(registered);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "policy-gate-denied");
  assert.equal(result.failure.details?.denialReason, "fixture-brand-freeze");
  assert.equal(counting.sentCount(), 0);
});

test("policy gate fail-closed: an explicit PERMIT rule proceeds to the transport (real routes)", () => {
  const registered = registeredAuroraStack({ now });
  const result = publishOver(registered);
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    // The permit verdict's cited policyRef lands on the §30 record.
    assert.equal(result.record.policyRef, FIXTURE_POLICY_REF);
  }
});

test("policy gate fail-closed: the policy gate runs AFTER the rights gate (rights denial wins)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [] });
  const deniedRightsRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [],
  });
  const result = registered.stack.adapter.publish({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: deniedRightsRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "rights-gate-denied");
  assert.equal(result.record.transportSource, "rights-gate");
  assert.equal(counting.sentCount(), 0);
});

test("policy gate fail-closed: the policy gate runs BEFORE the capability matrix", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [] });
  // A channel with NO publish declaration + a policy denial: the POLICY
  // denial surfaces (the matrix is never consulted).
  const partial = registered.stack.channels.register({
    scope: registered.channel.scope,
    name: "aurora-policy-order",
    providerId: registered.channel.providerId,
    displayName: "partial",
    instanceRef: registered.instance.id,
    capabilityMatrix: [{ operation: "read-observations", support: "supported" }],
  });
  const result = publishOver(registered, { channelRef: partial.id });
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "policy-gate-denied");
  assert.equal(result.record.operationSupport, null);
  assert.equal(counting.sentCount(), 0);
});

test("policy gate fail-closed: every attributable policy denial is §30-recorded with the refusing gate's label", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [] });

  const result = publishOver(registered);
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.record.failure?.code, "policy-gate-denied");
    assert.equal(result.record.transportSource, "policy-gate");
    assert.equal(result.record.policyRef, null);
    const listed = registered.stack.adapter.listDistributionRecords(
      registered.channel.scope.tenantId,
      { failureCode: "policy-gate-denied" },
    );
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, result.record.id);
  }
});

test("policy gate fail-closed: policy rules NEVER cross tenants (§31)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  // A rule that permits EVERYTHING — but only for tenant beta.
  const registered = registeredAuroraStack({ now, transport: counting, policyRules: [permitRule(SCOPE_BETA)] });

  const result = publishOver(registered);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failure.code, "policy-gate-denied");
  assert.equal(result.failure.details?.denialReason, "no-matching-policy");
  assert.equal(counting.sentCount(), 0);
});

test("policy gate fail-closed: operation/actor/subject filters narrow rules deterministically (first match wins)", () => {
  const counting = createCountingTransport({ send: () => ({ ok: true, output: {}, warnings: [], source: "x" }) });
  const registered = registeredAuroraStack({
    now,
    transport: counting,
    policyRules: [
      // Deny publishes BY ACTOR_ONE only; everyone else falls through.
      { ...denyRule(SCOPE_ALPHA, "fixture-actor-freeze"), operation: "publish", actor: ACTOR_ONE },
      permitRule(SCOPE_ALPHA),
    ],
  });

  const denied = publishOver(registered);
  assert.equal(denied.outcome, "failed");
  assert.equal(denied.failure.code, "policy-gate-denied");
  assert.equal(denied.failure.details?.denialReason, "fixture-actor-freeze");

  // A DIFFERENT actor falls through to the permitting rule.
  const otherActorRef = registered.stack.registerRightsContext({
    scope: registered.channel.scope,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:actor-two",
        tenantId: registered.channel.scope.tenantId,
        grantee: "identity:actor-two" as never,
        actions: ["distribute"],
        subjectRefs: [`artifact:${FIXTURE_ARTIFACT.artifactId as string}`],
      }),
    ],
  });
  const allowed = registered.stack.adapter.publish({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: "identity:actor-two" as never,
    rightsContextRef: otherActorRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: { kind: "single-artifact" },
  });
  assert.equal(allowed.outcome, "failed"); // counting transport's echo is untypable
  assert.equal(allowed.failure.code, "invalid-platform-response");
  assert.equal(counting.sentCount(), 1);
});

test("policy gate fail-closed: the seam's frozen contract shape (check → verdict) is intact", () => {
  const registered = registeredAuroraStack({ now });
  const verdict = registered.stack.policyGate.check({
    scope: SCOPE_ALPHA,
    actor: ACTOR_ONE,
    operation: "publish",
    subjectRef: `artifact:${FIXTURE_ARTIFACT.artifactId as string}`,
  });
  assert.equal(verdict.decision, "permitted");
  assert.equal(verdict.denialReason, null);
  assert.equal(verdict.policyRef, FIXTURE_POLICY_REF);
  // Denied verdicts carry a reason and never a permissive default.
  const noRule = registered.stack.policyGate.check({
    scope: SCOPE_BETA,
    actor: ACTOR_ONE,
    operation: "publish",
    subjectRef: "irrelevant",
  });
  assert.equal(noRule.decision, "denied");
  assert.equal(noRule.denialReason, "no-matching-policy");
});
