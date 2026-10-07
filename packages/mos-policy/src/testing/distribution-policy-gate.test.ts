/**
 * Distribution PolicyGatePort seam adapter tests (POLICY-001) — the
 * in-package battery over the MIRRORED W6-C shape (the real-pipeline
 * half lives in compat/distribution-policy-gate.test.ts; the compile-time
 * mutual-assignability pins live in compat/distribution-policy-gate-compat.ts).
 *
 * Pins: the verdict mapping (permitted / denied with the authority's
 * attribution verbatim / approval-required naming the role / fail-closed
 * insufficient-policy), the default policy resolution (latest
 * distribution-scoped rules of the request tenant, registration order),
 * the resolvePolicy override, the documented coarse modality derivation,
 * and the TOTAL fail-closed behavior on evaluation errors.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { composePolicyStack } from "../testing/compose-policy-stack.js";
import {
  createDistributionPolicyGate,
  DISTRIBUTION_SEAM_OPERATIONS,
} from "../testing/distribution-policy-gate.js";
import {
  ACTOR_ONE,
  SCOPE_ALPHA,
  distributionRule,
  fixedNow,
  ref,
  ruleId,
} from "../testing/policy-fixtures.js";
import type { DistributionPolicyCheckRequest } from "../testing/distribution-policy-gate.js";

function checkRequest(
  overrides: Partial<DistributionPolicyCheckRequest> = {},
): DistributionPolicyCheckRequest {
  return {
    scope: SCOPE_ALPHA,
    actor: ACTOR_ONE,
    operation: "publish",
    subjectRef: "artifact:artifact-1",
    ...overrides,
  };
}

test("the mirrored seam operation vocabulary is the frozen W6-C five", () => {
  assert.deepEqual([...DISTRIBUTION_SEAM_OPERATIONS], [
    "publish",
    "schedule",
    "read-observations",
    "delete",
    "list-restrictions",
  ]);
});

test("an allow rule → PERMITTED citing the canonical PolicyRef; audit recorded", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({ id: ruleId("policy:alpha-gate-allow"), rationale: "gate fixture allow" }),
  );

  const verdict = stack.distributionGate.check(checkRequest());

  assert.deepEqual(verdict, {
    decision: "permitted",
    denialReason: null,
    policyRef: "policy:alpha-gate-allow",
  });
  const log = stack.evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 1);
  assert.equal(log[0]?.verdict.outcome, "allowed");
  assert.equal(log[0]?.action.actionKind, "distribution");
  assert.equal(log[0]?.action.subjectRef, "artifact:artifact-1");
  assert.equal(log[0]?.actor, ACTOR_ONE);
});

test("a deny rule → DENIED with the authority's attribution detail VERBATIM", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({
      id: ruleId("policy:alpha-gate-deny"),
      effect: "deny",
      rationale: "gate fixture prohibition",
    }),
  );

  const verdict = stack.distributionGate.check(checkRequest());

  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.policyRef, "policy:alpha-gate-deny");
  assert.match(verdict.denialReason ?? "", /policy-denied: denied by the deny-effect rule policy:alpha-gate-deny@v1/);
  assert.match(verdict.denialReason ?? "", /gate fixture prohibition/);
});

test("a constraint-driven denial names the rule AND the constraint in the seam reason", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({
      id: ruleId("policy:alpha-gate-modality"),
      constraints: [{ kind: "modality-restriction", allowedModalities: ["text"] }],
    }),
  );

  // The request carries NO artifact/presentation → no declared modalities
  // → the restriction fails closed (documented coarse derivation).
  const verdict = stack.distributionGate.check(checkRequest());
  assert.equal(verdict.decision, "denied");
  assert.match(verdict.denialReason ?? "", /constraint modality-restriction/);
  assert.match(verdict.denialReason ?? "", /no declared modalities/);
});

test("an approval-required rule → DENIED naming the approver role (no pending state on the seam)", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({
      id: ruleId("policy:alpha-gate-approval"),
      effect: "require-approval",
      approverRole: "distribution-approver",
    }),
  );

  const verdict = stack.distributionGate.check(checkRequest());

  assert.equal(verdict.decision, "denied");
  assert.equal(verdict.policyRef, "policy:alpha-gate-approval");
  assert.match(verdict.denialReason ?? "", /approval-required: distribution-approver must approve/);
});

test("NO distribution-scoped rules → insufficient-policy DENIAL (fail closed)", () => {
  const stack = composePolicyStack({ now: fixedNow });
  // An engine-invocation rule must NOT govern the distribution seam.
  stack.registerRule(
    distributionRule({
      id: ruleId("policy:alpha-gate-engine"),
      declaredScope: { actionKinds: ["engine-invocation"], subjectRefs: [], actorRefs: [] },
    }),
  );

  const verdict = stack.distributionGate.check(checkRequest());

  assert.deepEqual(verdict, {
    decision: "denied",
    denialReason: "insufficient-policy",
    policyRef: null,
  });
  // The fail-closed verdict is RECORDED (attributable, §30).
  const log = stack.evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 1);
  assert.equal(log[0]?.verdict.outcome, "insufficient-policy");
});

test("default resolution: the LATEST distribution-scoped rules of the REQUEST tenant, registration order", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({ id: ruleId("policy:alpha-gate-a"), rationale: "a-v1" }),
  );
  stack.registerRule(
    distributionRule({ id: ruleId("policy:alpha-gate-b") }),
  );
  // Revising a appends v2 — the LATEST version is what the gate consults.
  stack.reviseRule(
    distributionRule({ id: ruleId("policy:alpha-gate-a"), rationale: "a-v2" }),
  );

  const verdict = stack.distributionGate.check(checkRequest());
  assert.equal(verdict.decision, "permitted");
  assert.equal(verdict.policyRef, "policy:alpha-gate-a");
  const log = stack.evaluation.listEvaluationRecords(SCOPE_ALPHA);
  const consulted = log[0]?.policy ?? [];
  assert.deepEqual(consulted, [
    { id: "policy:alpha-gate-a", version: 2 },
    { id: "policy:alpha-gate-b", version: 1 },
  ]);
});

test("the resolvePolicy OVERRIDE decides the consulted refs (composition-root wiring seam)", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({ id: ruleId("policy:alpha-gate-override") }),
  );
  const gate = createDistributionPolicyGate({
    registry: stack.registry,
    evaluation: stack.evaluation,
    resolvePolicy: () => [ref(ruleId("policy:alpha-gate-override"), 1)],
  });

  const verdict = gate.check(checkRequest());
  assert.deepEqual(verdict, {
    decision: "permitted",
    denialReason: null,
    policyRef: "policy:alpha-gate-override",
  });
});

test("the gate is TOTAL: evaluation caller errors become fail-closed denials, never throws", () => {
  const stack = composePolicyStack({ now: fixedNow });
  const gate = createDistributionPolicyGate({
    registry: stack.registry,
    evaluation: stack.evaluation,
    // Cites an unknown rule id → typed unknown-policy-rule inside evaluate.
    resolvePolicy: () => [ref(ruleId("policy:does-not-exist"), 1)],
  });

  const verdict = gate.check(checkRequest());

  assert.equal(verdict.decision, "denied");
  assert.match(verdict.denialReason ?? "", /policy-evaluation-error: unknown-policy-rule/);
  assert.equal(verdict.policyRef, null);
});

test("the documented coarse modality derivation: text-only presentation → text; video artifact → video", () => {
  const stack = composePolicyStack({ now: fixedNow });
  stack.registerRule(
    distributionRule({
      id: ruleId("policy:alpha-gate-text"),
      constraints: [{ kind: "modality-restriction", allowedModalities: ["text"] }],
    }),
  );

  // A text-only presentation derives ["text"] → the text-only rule permits.
  const text = stack.distributionGate.check(
    checkRequest({ presentation: { kind: "text-only" } }),
  );
  assert.equal(text.decision, "permitted");

  // A video/mp4 artifact derives ["video"] → the text-only rule denies.
  const video = stack.distributionGate.check(
    checkRequest({
      artifact: {
        artifactId: "artifact-video" as never,
        version: 1 as never,
        tenantId: SCOPE_ALPHA.tenantId,
        digest: "sha256:fixture" as never,
        type: "video/mp4",
        storageRef: "storage:fixture" as never,
        rightsRef: "rights:fixture" as never,
        provenanceRef: "provenance:fixture" as never,
      },
      presentation: { kind: "artifact-with-caption", caption: "fixture" },
    }),
  );
  assert.equal(video.decision, "denied");
  assert.match(video.denialReason ?? "", /modality-restriction/);
  assert.match(video.denialReason ?? "", /video/);
});
