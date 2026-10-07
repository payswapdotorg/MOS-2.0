/**
 * RIGHTS GATE FAIL-CLOSED (INTEG-001 / the SOCIAL-001 acceptance this
 * structure will gate): "rights/policy gates precede provider calls" —
 * every provider interaction takes a RightsContextRef and FAILS CLOSED
 * without an adequate grant. Denied interactions NEVER reach the
 * transport seam; every denial reason of the REAL @mos/rights
 * `evaluateRights` cascade surfaces VERBATIM (never reinterpreted), plus
 * the gate's own `rights-context-unresolved` for unresolvable handles —
 * including handles registered in ANOTHER tenant (no existence leaks).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  ACTOR_ONE,
  ACTOR_TWO,
  AURORA_EXTERNAL_ACCOUNT,
  SCOPE_ALPHA,
  SCOPE_BETA,
  TENANT_ALPHA,
  TENANT_BETA,
  rightsGrantFixture,
} from "../testing/fixtures.js";
import type { RightsGrant } from "@mos/rights";
import { createInMemoryProviderInteractionPort } from "./in-memory-provider-interaction.js";

const NOW = () => "2026-03-01T00:00:00.000Z";

/** A spy transport that records every call it receives. */
function spyTransport(stack: ReturnType<typeof composeIntegrationsStack>) {
  const calls: unknown[] = [];
  return {
    calls,
    transport: {
      send(request: Parameters<typeof stack.transport.send>[0]) {
        calls.push(request);
        return stack.transport.send(request);
      },
    },
  };
}

/** Builds a call surface over the registered stack with a SPY transport. */
function spiedSurface(registered: ReturnType<typeof registeredAuroraStack>) {
  const spy = spyTransport(registered.stack);
  const interactions = createInMemoryProviderInteractionPort({
    instances: registered.stack.instances,
    implementations: registered.stack.implementations,
    availability: registered.stack.availability,
    capabilities: registered.stack.capabilities,
    rightsGate: registered.stack.rightsGate,
    transport: spy.transport,
    now: NOW,
  });
  return { interactions, calls: spy.calls };
}

test("rights gate: an UNRESOLVABLE context handle is a DENIAL — never a pass-through", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions, calls } = spiedSurface(registered);

  const result = interactions.invoke(
    standardInvokeRequest(registered, {
      rightsContextRef: "rights-context-never-registered" as typeof registered.rightsContextRef,
    }),
  );
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "rights-gate-denied");
    assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
    // The §30 record exists (attributable attempt) and carries the frame.
    assert.equal(result.record.rightsContextRef, "rights-context-never-registered");
    // Denied interactions never reach the transport.
    assert.equal(calls.length, 0);
  }
});

test("rights gate: a context handle registered in ANOTHER tenant is indistinguishable from unresolved (§31)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const betaContext = registered.stack.registerRightsContext({
    scope: SCOPE_BETA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:beta-tenant",
        tenantId: TENANT_BETA,
        grantee: ACTOR_ONE,
        action: "use",
        subjectRef: AURORA_EXTERNAL_ACCOUNT as string,
      }),
    ],
  });
  const { interactions, calls } = spiedSurface(registered);

  // The SAME grant shape would cover the call — but the context lives in
  // tenant beta, and the call is scoped to tenant alpha.
  const result = interactions.invoke(
    standardInvokeRequest(registered, { rightsContextRef: betaContext }),
  );
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "rights-gate-denied");
    assert.equal(result.failure.details?.denialReason, "rights-context-unresolved");
    assert.equal(calls.length, 0);
  }
});

test("rights gate: every @mos/rights denial reason surfaces VERBATIM (never reinterpreted)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions, calls } = spiedSurface(registered);
  const subjectRef = AURORA_EXTERNAL_ACCOUNT as string;

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly grants: readonly RightsGrant[];
    readonly reason: string;
  }> = [
    {
      name: "no explicit grant at all",
      grants: [],
      reason: "no-explicit-grant",
    },
    {
      name: "grants exist but none names this subject",
      grants: [
        rightsGrantFixture({
          grantId: "grant:other-subject",
          tenantId: TENANT_ALPHA,
          grantee: ACTOR_ONE,
          action: "use",
          subjectRef: "account:somewhere-else",
        }),
      ],
      reason: "subject-not-covered",
    },
    {
      name: "subject covered but for ANOTHER grantee",
      grants: [
        rightsGrantFixture({
          grantId: "grant:other-grantee",
          tenantId: TENANT_ALPHA,
          grantee: ACTOR_TWO,
          action: "use",
          subjectRef,
        }),
      ],
      reason: "grantee-not-covered",
    },
    {
      name: "grant covers subject+grantee but not this ACTION",
      grants: [
        rightsGrantFixture({
          grantId: "grant:other-action",
          tenantId: TENANT_ALPHA,
          grantee: ACTOR_ONE,
          action: "analyze",
          subjectRef,
        }),
      ],
      reason: "action-not-covered",
    },
    {
      name: "the only matching grant is REVOKED",
      grants: [
        {
          ...rightsGrantFixture({
            grantId: "grant:revoked",
            tenantId: TENANT_ALPHA,
            grantee: ACTOR_ONE,
            action: "use",
            subjectRef,
          }),
          revokedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      reason: "grant-revoked",
    },
    {
      name: "the only matching grant has EXPIRED",
      grants: [
        rightsGrantFixture({
          grantId: "grant:expired",
          tenantId: TENANT_ALPHA,
          grantee: ACTOR_ONE,
          action: "use",
          subjectRef,
          expiresAt: "2026-02-01T00:00:00.000Z",
        }),
      ],
      reason: "grant-expired",
    },
  ];

  for (const testCase of cases) {
    const contextRef = registered.stack.registerRightsContext({
      scope: SCOPE_ALPHA,
      grants: testCase.grants,
    });
    const result = interactions.invoke(
      standardInvokeRequest(registered, { rightsContextRef: contextRef }),
    );
    assert.equal(result.outcome, "failed", testCase.name);
    if (result.outcome === "failed") {
      assert.equal(result.failure.code, "rights-gate-denied", testCase.name);
      assert.equal(result.failure.details?.denialReason, testCase.reason, testCase.name);
    }
  }
  // NO denial ever reached the transport.
  assert.equal(calls.length, 0);
  // Every denial was recorded (§30 — no unrecorded path).
  assert.equal(interactions.listInteractionRecords(TENANT_ALPHA).length, cases.length);
});

test("rights gate: the grantee is the §30 ACTOR — a context naming another grantee denies even when the grant exists", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions, calls } = spiedSurface(registered);

  // The registered context's grant names ACTOR_ONE; ACTOR_TWO invokes
  // through the SAME context handle — denied (grantee-not-covered).
  const result = interactions.invoke({
    ...standardInvokeRequest(registered),
    actor: ACTOR_TWO,
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.details?.denialReason, "grantee-not-covered");
    assert.equal(result.record.actor, ACTOR_TWO);
    assert.equal(calls.length, 0);
  }
});

test("rights gate: an ADEQUATE explicit grant allows the call — the gate passes and the transport answers", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions, calls } = spiedSurface(registered);

  const result = interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");
  assert.equal(calls.length, 1);
  if (result.outcome === "completed") {
    assert.equal(result.record.failure, null);
  }
});

test("rights gate: an unknown rights ACTION string fails closed at request validation (vocabulary pin)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions, calls } = spiedSurface(registered);

  assert.throws(
    () =>
      interactions.invoke({
        ...standardInvokeRequest(registered),
        rightsAction: "exfiltrate" as Parameters<typeof interactions.invoke>[0]["rightsAction"],
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("rightsAction"),
  );
  assert.equal(calls.length, 0);
  assert.equal(interactions.listInteractionRecords(TENANT_ALPHA).length, 0);
});

test("rights gate: the gate verdict is deterministic for the same frame (pure evaluation, no ambient state)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions } = spiedSurface(registered);

  const first = interactions.invoke(standardInvokeRequest(registered));
  const second = interactions.invoke(standardInvokeRequest(registered));
  assert.equal(first.outcome, "completed");
  assert.equal(second.outcome, "completed");
  if (first.outcome === "completed" && second.outcome === "completed") {
    // Same rights frame + same request → same verdict shape (records
    // differ only by request id).
    assert.equal(first.record.failure, second.record.failure);
    assert.notEqual(first.record.id, second.record.id);
  }
});

test("rights gate: gate denial is recorded BEFORE availability/status gates (ordering — rights precede provider calls)", () => {
  const registered = registeredAuroraStack({ now: NOW });
  const { interactions } = spiedSurface(registered);

  // Request a capability with NO availability record through an EMPTY
  // rights context: the rights denial wins (stage 2 precedes stage 3) —
  // the failure code proves the ordering.
  const emptyContext = registered.stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [],
  });
  const result = interactions.invoke({
    ...standardInvokeRequest(registered),
    capabilityId: "detect_scenes" as typeof registered.transcribeAvailability.capabilityId,
    rightsContextRef: emptyContext,
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "rights-gate-denied");
  }
});
