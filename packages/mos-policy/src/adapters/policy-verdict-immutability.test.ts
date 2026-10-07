/**
 * Verdict + record immutability tests (POLICY-001): returned evaluation
 * records are immutable at every nesting level (the W5-A/W6-A
 * nested-freeze discipline, pinned from the start), the STORED records
 * cannot be corrupted through returned values, caller request mutation
 * after evaluate never corrupts the audit log, and the log is
 * append-only (prior records stay bit-for-bit).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPolicyEvaluation } from "./in-memory-policy-evaluation.js";
import { createInMemoryPolicyRegistry } from "./in-memory-policy-registry.js";
import {
  ACTOR_ONE,
  SCOPE_ALPHA,
  distributionRule,
  fixedNow,
  ref,
  ruleId,
  sequencedIds,
} from "../testing/policy-fixtures.js";
import type { PolicyEvaluationRequest } from "../contracts/policy-evaluation.js";
import type { PolicyActionDescriptor } from "../contracts/policy-evaluation.js";

function stackWithBudgetRule() {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: fixedNow,
    nextId: sequencedIds(),
  });
  registry.register(
    distributionRule({
      id: ruleId("policy:alpha-immutable"),
      constraints: [
        { kind: "budget-ceiling", currency: "USD", maximum: 100 },
        { kind: "modality-restriction", allowedModalities: ["video"] },
      ],
    }),
  );
  return evaluation;
}

function request(
  overrides: Partial<PolicyActionDescriptor> = {},
): PolicyEvaluationRequest {
  const action: PolicyActionDescriptor = {
    actionKind: "distribution",
    subjectRef: "artifact:artifact-1",
    declaredSpend: { amount: 10, currency: "USD" },
    modalities: ["video"],
    ...overrides,
  };
  return {
    scope: SCOPE_ALPHA,
    actor: ACTOR_ONE,
    policy: [ref(ruleId("policy:alpha-immutable"), 1)],
    action,
  };
}

test("the returned evaluation record is immutable at EVERY nesting level", () => {
  const evaluation = stackWithBudgetRule();
  const record = evaluation.evaluate(request());

  assert.throws(() => {
    (record as { verdict: unknown }).verdict = { outcome: "allowed" };
  }, TypeError);
  assert.throws(() => {
    (record.action as { subjectRef: string }).subjectRef = "artifact:mutated";
  }, TypeError);
  assert.throws(() => {
    (record.action.declaredSpend as { amount: number }).amount = 1_000_000;
  }, TypeError);
  assert.throws(() => {
    (record.consultations[0] as { rationale: string }).rationale = "forged";
  }, TypeError);
  assert.throws(() => {
    const constraintOutcome = record.consultations[0]?.constraintOutcomes[0];
    (constraintOutcome as { satisfied: boolean }).satisfied = false;
  }, TypeError);
  assert.throws(() => {
    const outcome = record.consultations[0]?.constraintOutcomes[0];
    assert.ok(outcome !== undefined);
    (outcome.constraint as unknown as { maximum: number }).maximum = 1e9;
  }, TypeError);
  assert.throws(() => {
    (record.policy as unknown[]).push({ id: "policy:smuggled", version: 1 });
  }, TypeError);
});

test("the STORED record cannot be corrupted through the returned value; the log stays bit-for-bit", () => {
  const evaluation = stackWithBudgetRule();
  const first = evaluation.evaluate(request());
  const snapshot = structuredClone(first);

  // Any attempted mutation of the returned record throws (previous
  // test) — and the STORED copy equals the snapshot exactly afterwards.
  assert.throws(() => {
    (first.action.declaredSpend as { amount: number }).amount = 5_000;
  }, TypeError);
  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, first.id), snapshot);

  // Later appends never rewrite earlier entries.
  const second = evaluation.evaluate(request({ subjectRef: "artifact:artifact-2" }));
  const log = evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.equal(log.length, 2);
  assert.deepEqual(log[0], snapshot);
  assert.deepEqual(log[1], second);
});

test("mutating the CALLER request after evaluate never corrupts the stored record", () => {
  const evaluation = stackWithBudgetRule();
  const callerRequest = request();
  const record = evaluation.evaluate(callerRequest);
  const snapshot = structuredClone(record);

  // The caller owns its input object — mutate it freely afterwards.
  (callerRequest.action as { subjectRef: string }).subjectRef = "artifact:caller-side";
  (callerRequest.action.declaredSpend as { amount: number }).amount = 99_999;
  (callerRequest.policy as unknown[]).length = 0;

  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, record.id), snapshot);
  assert.notEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, record.id)?.action.subjectRef, "artifact:caller-side");
});

test("records returned by the READ methods are immutable clones too", () => {
  const evaluation = stackWithBudgetRule();
  const record = evaluation.evaluate(request());

  const byId = evaluation.getEvaluationRecord(SCOPE_ALPHA, record.id);
  assert.ok(byId !== null);
  assert.throws(() => {
    (byId.action as { subjectRef: string }).subjectRef = "artifact:mutated";
  }, TypeError);

  const listed = evaluation.listEvaluationRecords(SCOPE_ALPHA);
  assert.throws(() => {
    (listed[0] as { verdict: unknown }).verdict = null;
  }, TypeError);
  // ...and the stored copy is untouched by those attempts.
  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, record.id), record);
});

test("verdicts are immutable values on immutable records — a second read is bit-identical", () => {
  const evaluation = stackWithBudgetRule();
  const record = evaluation.evaluate(request());

  const again = evaluation.getEvaluationRecord(SCOPE_ALPHA, record.id);
  assert.ok(again !== null);
  assert.deepEqual(again.verdict, record.verdict);
  assert.equal(JSON.stringify(again), JSON.stringify(record));
});
