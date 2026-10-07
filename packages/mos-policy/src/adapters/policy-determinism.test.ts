/**
 * Determinism tests (POLICY-001): the evaluation is a pure function of
 * (request, resolved rules, clock) — identical inputs produce
 * BIT-IDENTICAL records (deep-equal AND JSON-equal), including across
 * FRESH adapter instances; citation order controls precedence
 * deterministically; and the append-only log grows without rewriting.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPolicyEvaluation } from "./in-memory-policy-evaluation.js";
import { createInMemoryPolicyRegistry } from "./in-memory-policy-registry.js";
import {
  ACTOR_ONE,
  SCOPE_ALPHA,
  distributionRule,
  expectVerdict,
  fixedNow,
  ref,
  ruleId,
  sequencedIds,
} from "../testing/policy-fixtures.js";
import type { PolicyEvaluationRequest } from "../contracts/policy-evaluation.js";
import type { PolicyActionDescriptor } from "../contracts/policy-evaluation.js";

/** Identical seeds: same rules registered in the same order, same clock, same id factory. */
function freshDeterministicStack() {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: fixedNow,
    nextId: sequencedIds(),
  });
  registry.register(
    distributionRule({
      id: ruleId("policy:alpha-det-a"),
      constraints: [{ kind: "budget-ceiling", currency: "USD", maximum: 100 }],
    }),
  );
  registry.register(
    distributionRule({
      id: ruleId("policy:alpha-det-deny"),
      effect: "deny",
      rationale: "deterministic prohibition",
    }),
  );
  registry.register(
    distributionRule({
      id: ruleId("policy:alpha-det-approval"),
      effect: "require-approval",
      approverRole: "distribution-approver",
    }),
  );
  return evaluation;
}

function detRequest(): PolicyEvaluationRequest {
  const action: PolicyActionDescriptor = {
    actionKind: "distribution",
    subjectRef: "artifact:artifact-1",
    declaredSpend: { amount: 250, currency: "USD" },
    modalities: ["video"],
  };
  return {
    scope: SCOPE_ALPHA,
    actor: ACTOR_ONE,
    policy: [
      ref(ruleId("policy:alpha-det-a"), 1),
      ref(ruleId("policy:alpha-det-deny"), 1),
      ref(ruleId("policy:alpha-det-approval"), 1),
    ],
    action,
  };
}

test("identical (request, rules, clock, id factory) → BIT-IDENTICAL records", () => {
  const first = freshDeterministicStack().evaluate(detRequest());
  const second = freshDeterministicStack().evaluate(detRequest());

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  // The determinism covers the FULL context, not just the verdict.
  assert.equal(first.consultations.length, 3);
  const verdict = expectVerdict(first.verdict, "denied");
  assert.equal(verdict.deniedBy.deniedByEffect, true);
});

test("the same evaluation twice appends TWO records with identical verdicts and consultations", () => {
  const evaluation = freshDeterministicStack();
  const first = evaluation.evaluate(detRequest());
  const second = evaluation.evaluate(detRequest());

  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.verdict, second.verdict);
  assert.deepEqual(first.consultations, second.consultations);
  assert.equal(JSON.stringify(first.consultations), JSON.stringify(second.consultations));
  const log = evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 2);
});

test("citation order flips the attribution DETERMINISTICALLY (the caller controls order)", () => {
  const evaluation = freshDeterministicStack();
  const denyFirst = evaluation.evaluate(detRequest());
  const reversedRequest: PolicyEvaluationRequest = {
    ...detRequest(),
    policy: [...detRequest().policy].reverse(),
  };
  const approvalFirst = evaluation.evaluate(reversedRequest);

  // Both deny (the deny-effect rule matches in both orders), but the
  // CONSULTATION order is the citation order — deterministic per call.
  assert.equal(expectVerdict(denyFirst.verdict, "denied").deniedBy.deniedByEffect, true);
  assert.equal(expectVerdict(approvalFirst.verdict, "denied").deniedBy.deniedByEffect, true);
  assert.equal(denyFirst.consultations[0]?.ref.id, "policy:alpha-det-a");
  assert.equal(approvalFirst.consultations[0]?.ref.id, "policy:alpha-det-approval");
  // And repeating the reversed order reproduces it exactly.
  const approvalFirstAgain = evaluation.evaluate(reversedRequest);
  assert.deepEqual(approvalFirst.consultations, approvalFirstAgain.consultations);
});

test("registry determinism: the same registration sequence produces identical rule records", () => {
  const build = () => {
    const registry = createInMemoryPolicyRegistry({ now: fixedNow });
    const v1 = registry.register(
      distributionRule({ id: ruleId("policy:alpha-det-seq"), rationale: "v1" }),
    );
    const v2 = registry.revise(
      distributionRule({ id: ruleId("policy:alpha-det-seq"), rationale: "v2" }),
    );
    return { v1, v2, chain: registry.listRuleVersions(SCOPE_ALPHA, ruleId("policy:alpha-det-seq")) };
  };
  const a = build();
  const b = build();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.chain.map((rule) => rule.rationale), ["v1", "v2"]);
});
