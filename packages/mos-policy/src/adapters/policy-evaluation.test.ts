/**
 * Policy evaluation round-trip tests (POLICY-001): every verdict class
 * (allowed / denied-by-effect / denied-by-constraint / approval-required /
 * insufficient-policy FAIL CLOSED), the deterministic precedence among
 * matched rules, the full-context consultations, the append-only audit
 * log and the caller-error discipline (typed errors append no record).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPolicyEvaluation } from "./in-memory-policy-evaluation.js";
import { createInMemoryPolicyRegistry } from "./in-memory-policy-registry.js";
import { PolicyError } from "../errors.js";
import {
  ACTOR_ONE,
  ACTOR_TWO,
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

function evaluationStack() {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: fixedNow,
    nextId: sequencedIds(),
  });
  return { registry, evaluation };
}

function action(overrides: Partial<PolicyActionDescriptor> = {}): PolicyActionDescriptor {
  return {
    actionKind: "distribution",
    subjectRef: "artifact:artifact-1",
    ...overrides,
  };
}

function request(
  policy: PolicyEvaluationRequest["policy"],
  overrides: Partial<PolicyActionDescriptor> = {},
): PolicyEvaluationRequest {
  return {
    scope: SCOPE_ALPHA,
    actor: ACTOR_ONE,
    policy,
    action: action(overrides),
  };
}

test("ALLOWED: cites the rule + its rationale, with full-context consultations", () => {
  const { registry, evaluation } = evaluationStack();
  const rule = registry.register(
    distributionRule({ id: ruleId("policy:alpha-allow"), rationale: "approved distribution" }),
  );

  const record = evaluation.evaluate(request([ref(rule.id, 1)]));

  const verdict = expectVerdict(record.verdict, "allowed");
  assert.deepEqual(verdict.byRule, { id: ruleId("policy:alpha-allow"), version: 1 });
  assert.equal(verdict.rationale, "approved distribution");
  assert.equal(record.consultations.length, 1);
  assert.equal(record.consultations[0]?.matched, true);
  assert.deepEqual(record.consultations[0]?.scopeMatch, {
    sameTenant: true,
    actionKindCovered: true,
    subjectCovered: true,
    actorCovered: true,
  });
  assert.equal(record.consultations[0]?.allConstraintsSatisfied, true);
  assert.equal(record.actor, ACTOR_ONE);
  assert.equal(record.action.subjectRef, "artifact:artifact-1");
  assert.equal(record.requestedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(record.durationMs, 0);
});

test("DENIED by effect: names the rule, deniedByEffect true, no violated constraint", () => {
  const { registry, evaluation } = evaluationStack();
  const rule = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-deny"),
      effect: "deny",
      rationale: "fixture prohibition",
    }),
  );

  const record = evaluation.evaluate(request([ref(rule.id, 1)]));

  const verdict = expectVerdict(record.verdict, "denied");
  assert.equal(verdict.deniedBy.deniedByEffect, true);
  assert.equal(verdict.deniedBy.violatedConstraint, null);
  assert.deepEqual(verdict.deniedBy.rule, { id: ruleId("policy:alpha-deny"), version: 1 });
  assert.equal(verdict.deniedBy.rationale, "fixture prohibition");
  assert.match(verdict.deniedBy.detail, /policy:alpha-deny@v1/);
});

test("DENIED by constraint: names the rule AND the violated constraint declaration", () => {
  const { registry, evaluation } = evaluationStack();
  const rule = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-budget"),
      constraints: [{ kind: "budget-ceiling", currency: "USD", maximum: 100 }],
    }),
  );

  const record = evaluation.evaluate(
    request([ref(rule.id, 1)], { declaredSpend: { amount: 250, currency: "USD" } }),
  );

  const verdict = expectVerdict(record.verdict, "denied");
  assert.equal(verdict.deniedBy.deniedByEffect, false);
  assert.deepEqual(verdict.deniedBy.violatedConstraint, {
    kind: "budget-ceiling",
    currency: "USD",
    maximum: 100,
  });
  assert.match(verdict.deniedBy.detail, /budget-ceiling/);
  assert.match(verdict.deniedBy.detail, /250/);
  // The consultation records the per-constraint outcome verbatim.
  assert.equal(record.consultations[0]?.constraintOutcomes[0]?.satisfied, false);
  assert.equal(record.consultations[0]?.allConstraintsSatisfied, false);
});

test("APPROVAL-REQUIRED: names the approver role and the rule", () => {
  const { registry, evaluation } = evaluationStack();
  const rule = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-approval"),
      effect: "require-approval",
      approverRole: "distribution-approver",
      rationale: "human sign-off required",
    }),
  );

  const record = evaluation.evaluate(request([ref(rule.id, 1)]));

  const verdict = expectVerdict(record.verdict, "approval-required");
  assert.equal(verdict.approverRole, "distribution-approver");
  assert.deepEqual(verdict.byRule, { id: ruleId("policy:alpha-approval"), version: 1 });
  assert.equal(verdict.rationale, "human sign-off required");
  assert.equal(record.consultations[0]?.approverRole, "distribution-approver");
});

test("INSUFFICIENT-POLICY: no applicable rule fails CLOSED — never a silent allow", () => {
  const { registry, evaluation } = evaluationStack();
  const wrongKind = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-engine"),
      declaredScope: { actionKinds: ["engine-invocation"], subjectRefs: [], actorRefs: [] },
    }),
  );
  const wrongSubject = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-pinned"),
      declaredScope: {
        actionKinds: ["distribution"],
        subjectRefs: ["artifact:other"],
        actorRefs: [],
      },
    }),
  );
  const wrongActor = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-actor"),
      declaredScope: { actionKinds: ["distribution"], subjectRefs: [], actorRefs: [ACTOR_TWO] },
    }),
  );

  // Empty policy list.
  assert.equal(evaluation.evaluate(request([])).verdict.outcome, "insufficient-policy");

  // Non-matching rules (kind / subject / actor).
  for (const rule of [wrongKind, wrongSubject, wrongActor]) {
    const record = evaluation.evaluate(request([ref(rule.id, 1)]));
    const verdict = expectVerdict(record.verdict, "insufficient-policy");
    assert.deepEqual(verdict.consulted, [ref(rule.id, 1)]);
    assert.equal(record.consultations[0]?.matched, false);
  }
});

test("PRECEDENCE: deny-effect beats constraint violation; constraint violation beats approval", () => {
  const { registry, evaluation } = evaluationStack();
  const bounded = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-bounded"),
      constraints: [{ kind: "budget-ceiling", currency: "USD", maximum: 100 }],
    }),
  );
  const prohibition = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-prohibition"),
      effect: "deny",
      rationale: "prohibition wins",
    }),
  );
  const approval = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-signoff"),
      effect: "require-approval",
      approverRole: "distribution-approver",
    }),
  );

  // A violated budget constraint AND a matching deny-effect rule: the
  // explicit prohibition is attributed (documented precedence (1) > (2)).
  const byEffect = evaluation.evaluate(
    request(
      [ref(bounded.id, 1), ref(prohibition.id, 1)],
      { declaredSpend: { amount: 250, currency: "USD" } },
    ),
  );
  const byEffectVerdict = expectVerdict(byEffect.verdict, "denied");
  assert.equal(byEffectVerdict.deniedBy.deniedByEffect, true);
  assert.deepEqual(byEffectVerdict.deniedBy.rule, { id: ruleId("policy:alpha-prohibition"), version: 1 });

  // A violated budget constraint AND a require-approval rule: the bound
  // is attributed (precedence (2) > (3)).
  const byConstraint = evaluation.evaluate(
    request(
      [ref(bounded.id, 1), ref(approval.id, 1)],
      { declaredSpend: { amount: 250, currency: "USD" } },
    ),
  );
  const byConstraintVerdict = expectVerdict(byConstraint.verdict, "denied");
  assert.equal(byConstraintVerdict.deniedBy.deniedByEffect, false);
  assert.deepEqual(byConstraintVerdict.deniedBy.rule, { id: ruleId("policy:alpha-bounded"), version: 1 });
});

test("CITATION ORDER: the caller's ref order deterministically picks the cited rule", () => {
  const { registry, evaluation } = evaluationStack();
  const first = registry.register(
    distributionRule({ id: ruleId("policy:alpha-first"), rationale: "first allow" }),
  );
  const second = registry.register(
    distributionRule({ id: ruleId("policy:alpha-second"), rationale: "second allow" }),
  );

  const record = evaluation.evaluate(request([ref(first.id, 1), ref(second.id, 1)]));
  const verdict = expectVerdict(record.verdict, "allowed");
  assert.deepEqual(verdict.byRule, { id: ruleId("policy:alpha-first"), version: 1 });

  const reversed = evaluation.evaluate(request([ref(second.id, 1), ref(first.id, 1)]));
  const reversedVerdict = expectVerdict(reversed.verdict, "allowed");
  assert.deepEqual(reversedVerdict.byRule, { id: ruleId("policy:alpha-second"), version: 1 });
  // Both consultations recorded in BOTH orders.
  assert.equal(record.consultations.length, 2);
  assert.equal(reversed.consultations[0]?.ref.id, "policy:alpha-second");
});

test("EXACT-VERSION citation: the registry resolves the cited version, not the latest", () => {
  const { registry, evaluation } = evaluationStack();
  registry.register(
    distributionRule({ id: ruleId("policy:alpha-v1"), effect: "allow", rationale: "v1 allows" }),
  );
  registry.revise(
    distributionRule({ id: ruleId("policy:alpha-v1"), effect: "deny", rationale: "v2 denies" }),
  );

  const atV1 = evaluation.evaluate(request([ref(ruleId("policy:alpha-v1"), 1)]));
  assert.equal(expectVerdict(atV1.verdict, "allowed").byRule.version, 1);

  const atV2 = evaluation.evaluate(request([ref(ruleId("policy:alpha-v1"), 2)]));
  const atV2Verdict = expectVerdict(atV2.verdict, "denied");
  assert.equal(atV2Verdict.deniedBy.deniedByEffect, true);
});

test("CALLER ERRORS: unresolvable refs and malformed requests throw typed errors and append NO record", () => {
  const { registry, evaluation } = evaluationStack();
  const rule = registry.register(distributionRule({ id: ruleId("policy:alpha-known") }));

  // Unknown id.
  assert.throws(
    () => evaluation.evaluate(request([ref(ruleId("policy:unknown"), 1)])),
    (error: unknown) => error instanceof PolicyError && error.code === "unknown-policy-rule",
  );
  // Unknown version.
  assert.throws(
    () => evaluation.evaluate(request([ref(rule.id, 7)])),
    (error: unknown) => error instanceof PolicyError && error.code === "unknown-policy-rule",
  );
  // Malformed request (unknown action kind, blank subject, extra field).
  assert.throws(
    () =>
      evaluation.evaluate(request([ref(rule.id, 1)], { actionKind: "studio-composition" as never })),
    (error: unknown) => error instanceof PolicyError && error.code === "invalid-evaluation-request",
  );
  assert.throws(
    () => evaluation.evaluate(request([ref(rule.id, 1)], { subjectRef: " " })),
    (error: unknown) => error instanceof PolicyError && error.code === "invalid-evaluation-request",
  );
  assert.throws(
    () =>
      evaluation.evaluate({
        ...request([ref(rule.id, 1)]),
        action: { ...action(), smuggled: true } as never,
      }),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.code === "invalid-evaluation-request" &&
      error.message.includes("unexpected field"),
  );

  // Nothing attributable happened — the audit log stayed empty.
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA).length, 0);
});

test("the AUDIT LOG is append-only with full-context records and honors filters", () => {
  const { registry, evaluation } = evaluationStack();
  const allow = registry.register(
    distributionRule({ id: ruleId("policy:alpha-log-allow") }),
  );
  const deny = registry.register(
    distributionRule({ id: ruleId("policy:alpha-log-deny"), effect: "deny" }),
  );

  const first = evaluation.evaluate(request([ref(allow.id, 1)]));
  const second = evaluation.evaluate(
    request([ref(deny.id, 1)], { subjectRef: "artifact:pinned" }),
  );
  const third = evaluation.evaluate(request([ref(allow.id, 1)]));

  const log = evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 3);
  assert.deepEqual(
    log.map((record) => record.id),
    [first.id, second.id, third.id],
  );

  // Round-trip by id.
  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, second.id), second);
  assert.equal(evaluation.getEvaluationRecord(SCOPE_ALPHA, first.id)?.id, first.id);
  assert.equal(evaluation.getEvaluationRecord(SCOPE_ALPHA, "policy-evaluation:nope" as never), null);

  // Filters.
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA, { subjectRef: "artifact:pinned" }).length, 1);
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA, { actionKind: "distribution" }).length, 3);
  assert.equal(
    evaluation.listEvaluationRecords(SCOPE_ALPHA, { ruleId: ruleId("policy:alpha-log-deny") }).length,
    1,
  );
  assert.equal(
    evaluation.listEvaluationRecords(SCOPE_ALPHA, { actor: ACTOR_ONE }).length,
    3,
  );
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA, { limit: 2 }).length, 2);
  assert.deepEqual(evaluation.listEvaluationRecords(SCOPE_ALPHA, { limit: 2 }), log.slice(0, 2));

  // The earlier records are unchanged after later appends.
  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, first.id), first);
});
