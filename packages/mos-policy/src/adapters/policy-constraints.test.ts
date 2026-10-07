/**
 * Structured-constraint tests (POLICY-001): every constraint kind
 * evaluated in its satisfied AND violated forms through the REAL
 * evaluation path — including the FAIL-CLOSED missing-context cases
 * (no declared spend / deadline / modalities ⇒ violation, never a
 * silent pass) — plus the compound-action semantics of the
 * allowlist/denylist constraints.
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
  ts,
} from "../testing/policy-fixtures.js";
import type { PolicyEvaluationRequest } from "../contracts/policy-evaluation.js";
import type { PolicyActionDescriptor } from "../contracts/policy-evaluation.js";
import type { PolicyConstraint } from "../contracts/policy-rule.js";

function stackWith(constraints: readonly PolicyConstraint[]) {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: fixedNow,
    nextId: sequencedIds(),
  });
  const rule = registry.register(
    distributionRule({ id: ruleId("policy:alpha-constraint"), constraints }),
  );
  return { evaluation, ruleId: rule.id };
}

function evaluateWith(
  constraints: readonly PolicyConstraint[],
  overrides: Partial<PolicyActionDescriptor>,
) {
  const { evaluation, ruleId: id } = stackWith(constraints);
  const request: PolicyEvaluationRequest = {
    scope: SCOPE_ALPHA,
    actor: ACTOR_ONE,
    policy: [ref(id, 1)],
    action: {
      actionKind: "distribution",
      subjectRef: "artifact:artifact-1",
      ...overrides,
    },
  };
  return { record: evaluation.evaluate(request), evaluation };
}

test("action-kind-allowlist: included kinds within the allowlist pass; offenders are named", () => {
  const constraint: PolicyConstraint = {
    kind: "action-kind-allowlist",
    allowedActionKinds: ["distribution", "engine-invocation"],
  };

  const ok = evaluateWith([constraint], { includedActionKinds: ["distribution"] });
  assert.equal(ok.record.verdict.outcome, "allowed");
  assert.match(
    ok.record.consultations[0]?.constraintOutcomes[0]?.detail ?? "",
    /within the allowlist/,
  );

  // A COMPOUND action (production request including a transform
  // application) violates the allowlist, naming the offender.
  const bad = evaluateWith([constraint], {
    includedActionKinds: ["distribution", "transform-application"],
  });
  const badVerdict = expectVerdict(bad.record.verdict, "denied");
  assert.equal(badVerdict.deniedBy.violatedConstraint?.kind, "action-kind-allowlist");
  assert.match(badVerdict.deniedBy.detail, /transform-application/);
});

test("action-kind-denylist: disjoint kinds pass; an intersection is named", () => {
  const constraint: PolicyConstraint = {
    kind: "action-kind-denylist",
    disallowedActionKinds: ["experiment-launch"],
  };

  const ok = evaluateWith([constraint], {
    includedActionKinds: ["distribution", "engine-invocation"],
  });
  assert.equal(ok.record.verdict.outcome, "allowed");

  const bad = evaluateWith([constraint], {
    includedActionKinds: ["distribution", "experiment-launch"],
  });
  const badVerdict = expectVerdict(bad.record.verdict, "denied");
  assert.match(badVerdict.deniedBy.detail, /experiment-launch/);
});

test("budget-ceiling: within/currency-mismatch/over-budget/missing-spend outcomes", () => {
  const constraint: PolicyConstraint = {
    kind: "budget-ceiling",
    currency: "USD",
    maximum: 100,
  };

  const ok = evaluateWith([constraint], { declaredSpend: { amount: 100, currency: "USD" } });
  assert.equal(ok.record.verdict.outcome, "allowed");
  assert.match(ok.record.consultations[0]?.constraintOutcomes[0]?.detail ?? "", /100 USD/);

  const over = evaluateWith([constraint], { declaredSpend: { amount: 100.01, currency: "USD" } });
  const overVerdict = expectVerdict(over.record.verdict, "denied");
  assert.match(overVerdict.deniedBy.detail, /exceeds the ceiling/);

  const currencyMismatch = evaluateWith([constraint], {
    declaredSpend: { amount: 1, currency: "EUR" },
  });
  const currencyVerdict = expectVerdict(currencyMismatch.record.verdict, "denied");
  assert.match(currencyVerdict.deniedBy.detail, /currency/);

  // FAIL CLOSED: no declared spend — the ceiling cannot be verified.
  const missingSpend = evaluateWith([constraint], {});
  const missingSpendVerdict = expectVerdict(missingSpend.record.verdict, "denied");
  assert.match(missingSpendVerdict.deniedBy.detail, /no declared spend/);
});

test("deadline-floor: sufficient/insufficient lead and missing deadline (fail closed)", () => {
  const constraint: PolicyConstraint = { kind: "deadline-floor", minimumLeadMs: 3_600_000 };

  // The fixture clock is 2026-06-01T00:00:00.000Z.
  const ok = evaluateWith([constraint], { deadline: ts("2026-06-01T02:00:00.000Z") });
  assert.equal(ok.record.verdict.outcome, "allowed");
  assert.match(ok.record.consultations[0]?.constraintOutcomes[0]?.detail ?? "", /7200000ms/);

  const soon = evaluateWith([constraint], { deadline: ts("2026-06-01T00:30:00.000Z") });
  const soonVerdict = expectVerdict(soon.record.verdict, "denied");
  assert.match(soonVerdict.deniedBy.detail, /below the floor/);

  const missing = evaluateWith([constraint], {});
  const missingVerdict = expectVerdict(missing.record.verdict, "denied");
  assert.match(missingVerdict.deniedBy.detail, /no declared deadline/);
});

test("modality-restriction: within/outside and missing modalities (fail closed)", () => {
  const constraint: PolicyConstraint = {
    kind: "modality-restriction",
    allowedModalities: ["text", "video"],
  };

  const ok = evaluateWith([constraint], { modalities: ["video"] });
  assert.equal(ok.record.verdict.outcome, "allowed");

  const bad = evaluateWith([constraint], { modalities: ["audio"] });
  const badVerdict = expectVerdict(bad.record.verdict, "denied");
  assert.equal(badVerdict.deniedBy.violatedConstraint?.kind, "modality-restriction");
  assert.match(badVerdict.deniedBy.detail, /audio/);

  const missing = evaluateWith([constraint], {});
  const missingVerdict = expectVerdict(missing.record.verdict, "denied");
  assert.match(missingVerdict.deniedBy.detail, /no declared modalities/);
});

test("MULTIPLE constraints: the FIRST violated constraint in declaration order is cited", () => {
  const constraints: readonly PolicyConstraint[] = [
    { kind: "modality-restriction", allowedModalities: ["text"] },
    { kind: "budget-ceiling", currency: "USD", maximum: 100 },
  ];

  const record = evaluateWith(constraints, {
    declaredSpend: { amount: 500, currency: "USD" },
  }).record;

  const verdict = expectVerdict(record.verdict, "denied");
  assert.equal(verdict.deniedBy.violatedConstraint?.kind, "modality-restriction");
  // ...but EVERY outcome is recorded in the consultation.
  assert.equal(record.consultations[0]?.constraintOutcomes.length, 2);
  assert.equal(record.consultations[0]?.constraintOutcomes[0]?.satisfied, false);
  assert.equal(record.consultations[0]?.constraintOutcomes[1]?.satisfied, false);
});

test("constraint declarations echo VERBATIM as structured data in the consultation", () => {
  const constraints: readonly PolicyConstraint[] = [
    { kind: "budget-ceiling", currency: "USD", maximum: 42 },
  ];
  const { record } = evaluateWith(constraints, { declaredSpend: { amount: 1, currency: "USD" } });

  assert.deepEqual(record.consultations[0]?.constraintOutcomes[0]?.constraint, {
    kind: "budget-ceiling",
    currency: "USD",
    maximum: 42,
  });
  // Structured data — no free-text surface anywhere on the echo.
  assert.equal(
    Object.keys(record.consultations[0]?.constraintOutcomes[0]?.constraint ?? {}).includes("text"),
    false,
  );
});
