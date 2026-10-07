/**
 * Tenant-scoping + no-existence-leak tests (POLICY-001): rules and
 * evaluation records never cross tenants (§31); cross-tenant reads are
 * indistinguishable from unknown on EVERY surface (getRule / getEvaluationRecord /
 * list*), and cross-tenant citations are typed caller errors that append
 * no audit record.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInMemoryPolicyEvaluation } from "./in-memory-policy-evaluation.js";
import { createInMemoryPolicyRegistry } from "./in-memory-policy-registry.js";
import { PolicyError } from "../errors.js";
import {
  ACTOR_ONE,
  SCOPE_ALPHA,
  SCOPE_BETA,
  distributionRule,
  fixedNow,
  ref,
  ruleId,
  sequencedIds,
} from "../testing/policy-fixtures.js";
import type { PolicyEvaluationRequest } from "../contracts/policy-evaluation.js";
import type { PolicyActionDescriptor } from "../contracts/policy-evaluation.js";

function dualTenantStack() {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const evaluation = createInMemoryPolicyEvaluation({
    registry,
    now: fixedNow,
    nextId: sequencedIds(),
  });
  return { registry, evaluation };
}

function requestFor(
  scope: PolicyEvaluationRequest["scope"],
  policy: PolicyEvaluationRequest["policy"],
  overrides: Partial<PolicyActionDescriptor> = {},
): PolicyEvaluationRequest {
  return {
    scope,
    actor: ACTOR_ONE,
    policy,
    action: {
      actionKind: "distribution",
      subjectRef: "artifact:artifact-1",
      ...overrides,
    },
  };
}

test("a rule registered in tenant BETA cannot be cited by a tenant ALPHA evaluation", () => {
  const { registry, evaluation } = dualTenantStack();
  registry.register(distributionRule({ id: ruleId("policy:beta-allow") }));
  const betaRule = registry.register(
    distributionRule({ id: ruleId("policy:beta-only"), scope: SCOPE_BETA }),
  );

  // Sanity: beta's own evaluation works.
  const betaRecord = evaluation.evaluate(requestFor(SCOPE_BETA, [ref(betaRule.id, 1)]));
  assert.equal(betaRecord.verdict.outcome, "allowed");

  // An ALPHA-scoped evaluation citing BETA's rule: unknown (no existence
  // leak) — typed caller error, no audit record.
  assert.throws(
    () => evaluation.evaluate(requestFor(SCOPE_ALPHA, [ref(betaRule.id, 1)])),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.code === "unknown-policy-rule" &&
      error.message.includes("no-existence-leaks"),
  );
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA).length, 0);
  // ALPHA's own rule still evaluates.
  const alpha = evaluation.evaluate(requestFor(SCOPE_ALPHA, [ref(ruleId("policy:beta-allow"), 1)]));
  assert.equal(alpha.verdict.outcome, "allowed");
});

test("evaluation records are tenant-scoped: cross-tenant record reads are indistinguishable from unknown", () => {
  const { registry, evaluation } = dualTenantStack();
  registry.register(distributionRule({ id: ruleId("policy:alpha-tenant") }));
  registry.register(
    distributionRule({ id: ruleId("policy:beta-tenant"), scope: SCOPE_BETA }),
  );

  const alphaRecord = evaluation.evaluate(
    requestFor(SCOPE_ALPHA, [ref(ruleId("policy:alpha-tenant"), 1)]),
  );
  const betaRecord = evaluation.evaluate(
    requestFor(SCOPE_BETA, [ref(ruleId("policy:beta-tenant"), 1)]),
  );

  // Own-tenant reads work.
  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_ALPHA, alphaRecord.id), alphaRecord);
  assert.deepEqual(evaluation.getEvaluationRecord(SCOPE_BETA, betaRecord.id), betaRecord);

  // Cross-tenant reads: null — exactly like an unknown id.
  assert.equal(evaluation.getEvaluationRecord(SCOPE_BETA, alphaRecord.id), null);
  assert.equal(evaluation.getEvaluationRecord(SCOPE_ALPHA, betaRecord.id), null);
  assert.equal(evaluation.getEvaluationRecord(SCOPE_ALPHA, "policy-evaluation:none" as never), null);

  // Listing is scoped per tenant.
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA).length, 1);
  assert.equal(evaluation.listEvaluationRecords(SCOPE_BETA).length, 1);
  assert.equal(evaluation.listEvaluationRecords({ tenantId: "tenant-gamma" as never }).length, 0);
});

test("rules list per tenant; BETA rules never appear in ALPHA listings (and vice versa)", () => {
  const { registry } = dualTenantStack();
  registry.register(distributionRule({ id: ruleId("policy:alpha-1") }));
  registry.register(distributionRule({ id: ruleId("policy:alpha-2") }));
  registry.register(
    distributionRule({ id: ruleId("policy:beta-1"), scope: SCOPE_BETA }),
  );

  assert.deepEqual(
    registry.listLatestRules(SCOPE_ALPHA).map((rule) => rule.id),
    ["policy:alpha-1", "policy:alpha-2"],
  );
  assert.deepEqual(
    registry.listLatestRules(SCOPE_BETA).map((rule) => rule.id),
    ["policy:beta-1"],
  );
  assert.deepEqual(registry.listLatestRules({ tenantId: "tenant-gamma" as never }), []);

  // The same id in two tenants is TWO independent rules (per-tenant
  // keying — the ids never collide across tenants).
  registry.register(distributionRule({ id: ruleId("policy:shared-name") }));
  registry.register(
    distributionRule({ id: ruleId("policy:shared-name"), scope: SCOPE_BETA, rationale: "beta's own" }),
  );
  const alphaShared = registry.listLatestRules(SCOPE_ALPHA).find(
    (rule) => rule.id === "policy:shared-name",
  );
  const betaShared = registry.listLatestRules(SCOPE_BETA).find(
    (rule) => rule.id === "policy:shared-name",
  );
  assert.equal(alphaShared?.rationale, "fixture distribution rule");
  assert.equal(betaShared?.rationale, "beta's own");
});

test("workspaces ride WITH the tenant scope (audit echo) without splitting the tenant key", () => {
  const { registry, evaluation } = dualTenantStack();
  registry.register(distributionRule({ id: ruleId("policy:alpha-workspace") }));

  const record = evaluation.evaluate({
    scope: { tenantId: SCOPE_ALPHA.tenantId, workspaceId: "workspace:one" as never },
    actor: ACTOR_ONE,
    policy: [ref(ruleId("policy:alpha-workspace"), 1)],
    action: { actionKind: "distribution", subjectRef: "artifact:artifact-1" },
  });

  assert.equal(record.verdict.outcome, "allowed");
  assert.equal(record.scope.workspaceId, "workspace:one");
  // The audit log is keyed per TENANT: the workspace-scoped record lists
  // under the tenant root (documented §31 scoping root).
  assert.equal(evaluation.listEvaluationRecords(SCOPE_ALPHA).length, 1);
});
