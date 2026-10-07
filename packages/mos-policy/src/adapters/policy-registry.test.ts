/**
 * Policy registry tests (POLICY-001): registration, append-only
 * versioning, bit-for-bit immutability of prior versions, strict-shape
 * fail-closed validation, latest/version listing, tenant scoping.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { TenantScope, Version } from "@mos/contracts";

import { createInMemoryPolicyRegistry } from "./in-memory-policy-registry.js";
import { PolicyError } from "../errors.js";
import { composePolicyStack } from "../testing/compose-policy-stack.js";
import {
  ACTOR_ONE,
  POLICY_ADMIN,
  SCOPE_ALPHA,
  SCOPE_BETA,
  TENANT_ALPHA,
  distributionRule,
  fixedNow,
  ruleId,
} from "../testing/policy-fixtures.js";
import type { PolicyRule } from "../contracts/policy-rule.js";

test("registering a NEW rule id mints v1 with the declared fields and null supersession", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const rule = registry.register(distributionRule({
    id: ruleId("policy:alpha-distribution"),
    rationale: "distribution is permitted for tenant alpha",
    constraints: [{ kind: "budget-ceiling", currency: "USD", maximum: 100 }],
  }));

  assert.equal(rule.version, 1);
  assert.equal(rule.id, "policy:alpha-distribution");
  assert.equal(rule.rationale, "distribution is permitted for tenant alpha");
  assert.equal(rule.effect, "allow");
  assert.equal(rule.approverRole, null);
  assert.deepEqual(rule.declaredScope, {
    actionKinds: ["distribution"],
    subjectRefs: [],
    actorRefs: [],
  });
  assert.deepEqual(rule.constraints, [
    { kind: "budget-ceiling", currency: "USD", maximum: 100 },
  ]);
  assert.equal(rule.provenance.supersedes, null);
  assert.equal(rule.provenance.createdByAuthority, "tenant-admin");
  assert.equal(rule.provenance.createdBy, POLICY_ADMIN);
  assert.equal(rule.provenance.registeredAt, "2026-06-01T00:00:00.000Z");
});

test("REVISING a known in-tenant id appends v2 — v1 stays bit-for-bit immutable", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const v1 = registry.register(
    distributionRule({ id: ruleId("policy:alpha-rev"), rationale: "v1 rationale" }),
  );
  const v1Snapshot = structuredClone(v1);

  const v2 = registry.revise(
    distributionRule({ id: ruleId("policy:alpha-rev"), rationale: "v2 rationale" }),
  );

  assert.equal(v2.version, 2);
  assert.equal(v2.rationale, "v2 rationale");
  assert.deepEqual(v2.provenance.supersedes, { id: ruleId("policy:alpha-rev"), version: 1 });

  // v1 stays resolvable and bit-for-bit identical.
  const v1Again = registry.getRule(SCOPE_ALPHA, ruleId("policy:alpha-rev"), 1 as Version);
  assert.ok(v1Again !== null);
  assert.deepEqual(v1Again, v1Snapshot);
  assert.notEqual(v1Again.rationale, v2.rationale);
});

test("register FAILS CLOSED on a duplicate in-tenant id; revise FAILS CLOSED on an unknown id", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  registry.register(distributionRule({ id: ruleId("policy:alpha-dup") }));

  // A re-registration is a caller error — it must never silently append.
  assert.throws(
    () => registry.register(distributionRule({ id: ruleId("policy:alpha-dup") })),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.code === "duplicate-policy-rule" &&
      error.message.includes("use revise"),
  );
  // The duplicate attempt appended nothing.
  assert.deepEqual(
    registry.listRuleVersions(SCOPE_ALPHA, ruleId("policy:alpha-dup")).map(
      (rule: PolicyRule) => rule.version,
    ),
    [1],
  );

  // Revising an UNKNOWN id is a caller error (cross-tenant ≡ unknown —
  // the message never reveals another tenant's rule).
  assert.throws(
    () => registry.revise(distributionRule({ id: ruleId("policy:never-registered") })),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.code === "policy-rule-not-found" &&
      error.message.includes("cannot be resolved in this tenant scope"),
  );
});

test("register/revise of another tenant's id stays in-tenant (no cross-tenant leaks)", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  registry.register(
    distributionRule({ id: ruleId("policy:beta-owned"), scope: SCOPE_BETA }),
  );

  // The same id in ALPHA is ALPHA's own v1 (per-tenant keying) — no
  // duplicate error, no existence leak of BETA's rule.
  const alpha = registry.register(distributionRule({ id: ruleId("policy:beta-owned") }));
  assert.equal(alpha.version, 1);
  assert.equal(alpha.rationale, "fixture distribution rule");
  // And revising it appends to ALPHA's chain only.
  const alphaV2 = registry.revise(
    distributionRule({ id: ruleId("policy:beta-owned"), rationale: "alpha v2" }),
  );
  assert.equal(alphaV2.version, 2);
  // BETA's rule is untouched (still v1, still its own rationale).
  assert.equal(
    registry.getRule(SCOPE_BETA, ruleId("policy:beta-owned"), 1 as Version)?.rationale,
    "fixture distribution rule",
  );
});

test("the version chain lists v1..vN ascending and every version stays resolvable", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  registry.register(
    distributionRule({ id: ruleId("policy:alpha-chain"), rationale: "r1" }),
  );
  for (let index = 2; index <= 4; index += 1) {
    registry.revise(
      distributionRule({ id: ruleId("policy:alpha-chain"), rationale: `r${index}` }),
    );
  }
  const versions = registry.listRuleVersions(SCOPE_ALPHA, ruleId("policy:alpha-chain"));
  assert.deepEqual(
    versions.map((rule: PolicyRule) => rule.version),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    versions.map((rule: PolicyRule) => rule.rationale),
    ["r1", "r2", "r3", "r4"],
  );
  // Every revision's provenance names its prior version.
  assert.deepEqual(
    versions.map((rule: PolicyRule) => rule.provenance.supersedes?.version ?? null),
    [null, 1, 2, 3],
  );
});

test("stored rules are IMMUTABLE at every nesting level; caller input is never frozen in place", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  // A LOCAL scope object (not the shared SCOPE_ALPHA fixture): this test
  // mutates the caller's scope afterwards and must not corrupt the
  // shared fixture other tests rely on.
  const localScope: TenantScope = { tenantId: TENANT_ALPHA };
  const input = distributionRule({
    id: ruleId("policy:alpha-frozen"),
    scope: localScope,
    constraints: [{ kind: "action-kind-allowlist", allowedActionKinds: ["distribution"] }],
  });
  const rule = registry.register(input);

  assert.throws(() => {
    (rule as { rationale: string }).rationale = "mutated";
  }, TypeError);
  assert.throws(() => {
    (rule.declaredScope as unknown as { actionKinds: string[] }).actionKinds.push("distribution");
  }, TypeError);
  assert.throws(() => {
    (
      rule.constraints[0] as unknown as { allowedActionKinds: string[] }
    ).allowedActionKinds.push("distribution");
  }, TypeError);
  assert.throws(() => {
    (rule.provenance as { registeredAt: string }).registeredAt = "2020-01-01T00:00:00.000Z";
  }, TypeError);

  // The CALLER's input object was cloned, not frozen in place — including
  // the caller's scope object (the W4-B clone-then-freeze discipline).
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(localScope), false);
  (input as { rationale: string }).rationale = "caller-side edit after registration";
  (localScope as { tenantId: string }).tenantId = "tenant-mutated" as never;
  const stored = registry.getRule(SCOPE_ALPHA, ruleId("policy:alpha-frozen"), 1 as Version);
  assert.ok(stored !== null);
  assert.equal(stored.rationale, "fixture distribution rule");
  assert.equal(stored.scope.tenantId, "tenant-alpha");
  assert.notEqual(stored.scope.tenantId, "tenant-mutated");
});

test("strict-shape validation: unexpected fields, blank and empty-vocabulary inputs fail closed", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });

  assert.throws(
    () =>
      registry.register({
        ...distributionRule({ id: ruleId("policy:bad-extra") }),
        smuggled: "extra field",
      } as never),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.code === "invalid-policy-rule" &&
      error.message.includes("unexpected field"),
  );

  assert.throws(
    () => registry.register(distributionRule({ id: ruleId("policy:bad-blank"), rationale: "  " })),
    (error: unknown) => error instanceof PolicyError && error.code === "invalid-policy-rule",
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-empty-kinds"),
          declaredScope: { actionKinds: [], subjectRefs: [], actorRefs: [] },
        }),
      ),
    (error: unknown) =>
      error instanceof PolicyError && error.message.includes("governs nothing"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-kind"),
          declaredScope: {
            actionKinds: ["studio-composition" as never],
            subjectRefs: [],
            actorRefs: [],
          },
        }),
      ),
    (error: unknown) =>
      error instanceof PolicyError && error.message.includes("closed vocabulary"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-dup-subject"),
          declaredScope: {
            actionKinds: ["distribution"],
            subjectRefs: ["artifact:1", "artifact:1"],
            actorRefs: [],
          },
        }),
      ),
    (error: unknown) => error instanceof PolicyError && error.message.includes("duplicate"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-effect"),
          effect: "maybe" as never,
        }),
      ),
    (error: unknown) => error instanceof PolicyError && error.message.includes("effect"),
  );
});

test("approverRole is required EXACTLY when the effect is require-approval", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });

  assert.throws(
    () =>
      registry.register(
        distributionRule({ id: ruleId("policy:bad-approval"), effect: "require-approval" }),
      ),
    (error: unknown) =>
      error instanceof PolicyError && error.message.includes("approverRole"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({ id: ruleId("policy:bad-approval-2"), approverRole: "approver" }),
      ),
    (error: unknown) =>
      error instanceof PolicyError && error.message.includes("unless the effect"),
  );

  const rule = registry.register(
    distributionRule({
      id: ruleId("policy:alpha-approval"),
      effect: "require-approval",
      approverRole: "distribution-approver",
    }),
  );
  assert.equal(rule.approverRole, "distribution-approver");
});

test("UNSTRUCTURABLE constraints are rejected at registration", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-constraint-kind"),
          constraints: [{ kind: "free-text", text: "be sensible" } as never],
        }),
      ),
    (error: unknown) =>
      error instanceof PolicyError &&
      error.message.includes("STRUCTURED DATA") &&
      error.message.includes("unstructurable"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-constraint-field"),
          constraints: [
            { kind: "budget-ceiling", currency: "USD", maximum: 10, note: "extra" } as never,
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof PolicyError && error.message.includes("unexpected field"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-constraint-empty"),
          constraints: [{ kind: "modality-restriction", allowedModalities: [] }],
        }),
      ),
    (error: unknown) => error instanceof PolicyError && error.message.includes("non-empty"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-constraint-negative"),
          constraints: [{ kind: "deadline-floor", minimumLeadMs: -1 }],
        }),
      ),
    (error: unknown) => error instanceof PolicyError && error.message.includes("finite number"),
  );

  assert.throws(
    () =>
      registry.register(
        distributionRule({
          id: ruleId("policy:bad-constraint-blank-currency"),
          constraints: [{ kind: "budget-ceiling", currency: " ", maximum: 10 }],
        }),
      ),
    (error: unknown) => error instanceof PolicyError,
  );
});

test("listLatestRules returns the LATEST version per rule, in registration order, honoring filters", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  registry.register(
    distributionRule({ id: ruleId("policy:alpha-a"), rationale: "a-v1" }),
  );
  registry.register(
    distributionRule({ id: ruleId("policy:alpha-b"), rationale: "b-v1" }),
  );
  registry.revise(
    distributionRule({ id: ruleId("policy:alpha-a"), rationale: "a-v2" }),
  );
  registry.register(
    distributionRule({
      id: ruleId("policy:alpha-engine"),
      declaredScope: { actionKinds: ["engine-invocation"], subjectRefs: [], actorRefs: [] },
    }),
  );
  registry.register(
    distributionRule({
      id: ruleId("policy:alpha-subject"),
      declaredScope: {
        actionKinds: ["distribution"],
        subjectRefs: ["artifact:pinned"],
        actorRefs: [],
      },
    }),
  );

  const latest = registry.listLatestRules(SCOPE_ALPHA);
  assert.deepEqual(
    latest.map((rule: PolicyRule) => rule.id),
    [
      "policy:alpha-a",
      "policy:alpha-b",
      "policy:alpha-engine",
      "policy:alpha-subject",
    ],
  );
  assert.equal(latest.find((rule) => rule.id === "policy:alpha-a")?.rationale, "a-v2");

  const distributionOnly = registry.listLatestRules(SCOPE_ALPHA, { actionKind: "distribution" });
  assert.deepEqual(
    distributionOnly.map((rule: PolicyRule) => rule.id),
    ["policy:alpha-a", "policy:alpha-b", "policy:alpha-subject"],
  );

  const pinned = registry.listLatestRules(SCOPE_ALPHA, { subjectRef: "artifact:pinned" });
  // subjectRef filter: rules with EMPTY subject lists govern ANY subject
  // (the engine rule included — its declared scope is not narrowed by
  // subject); rules with pinned lists match only their pins.
  assert.deepEqual(
    pinned.map((rule: PolicyRule) => rule.id),
    ["policy:alpha-a", "policy:alpha-b", "policy:alpha-engine", "policy:alpha-subject"],
  );

  // The filters are a CONJUNCTION over the declared scope.
  const pinnedDistribution = registry.listLatestRules(SCOPE_ALPHA, {
    actionKind: "distribution",
    subjectRef: "artifact:pinned",
  });
  assert.deepEqual(
    pinnedDistribution.map((rule: PolicyRule) => rule.id),
    ["policy:alpha-a", "policy:alpha-b", "policy:alpha-subject"],
  );
});

test("tenant scoping: cross-tenant reads are indistinguishable from unknown (no existence leaks)", () => {
  const registry = createInMemoryPolicyRegistry({ now: fixedNow });
  const alpha = registry.register(
    distributionRule({ id: ruleId("policy:alpha-only") }),
  );
  const beta = registry.register(
    distributionRule({ id: ruleId("policy:beta-only"), scope: SCOPE_BETA }),
  );

  assert.ok(registry.getRule(SCOPE_ALPHA, ruleId("policy:alpha-only"), 1 as Version) !== null);
  assert.equal(registry.getRule(SCOPE_ALPHA, ruleId("policy:alpha-only"), 2 as Version), null);
  assert.equal(registry.getRule(SCOPE_BETA, ruleId("policy:alpha-only"), 1 as Version), null);
  assert.equal(registry.getRule(SCOPE_ALPHA, ruleId("policy:unknown"), 1 as Version), null);

  assert.deepEqual(registry.listLatestRules(SCOPE_BETA).map((rule: PolicyRule) => rule.id), [
    "policy:beta-only",
  ]);
  assert.deepEqual(registry.listRuleVersions(SCOPE_ALPHA, ruleId("policy:beta-only")), []);
  assert.deepEqual(registry.listRuleVersions(SCOPE_BETA, ruleId("policy:beta-only")).map(
    (rule: PolicyRule) => rule.version,
  ), [1]);

  // A revision in one tenant never touches the other tenant's rule.
  registry.revise(
    distributionRule({ id: ruleId("policy:alpha-only"), rationale: "alpha-v2" }),
  );
  assert.equal(alpha.version, 1);
  assert.equal(
    registry.getRule(SCOPE_ALPHA, ruleId("policy:alpha-only"), 1 as Version)?.rationale,
    "fixture distribution rule",
  );
  assert.equal(beta.version, 1);
});

test("the composed stack wires registry + evaluation + the distribution gate over the same rules", () => {
  const stack = composePolicyStack({ now: fixedNow });
  const rule = stack.registerRule(
    distributionRule({ id: ruleId("policy:alpha-stack") }),
  );
  const revised = stack.reviseRule(
    distributionRule({ id: ruleId("policy:alpha-stack"), rationale: "stack v2" }),
  );
  assert.equal(rule.version, 1);
  assert.equal(revised.version, 2);
  assert.ok(stack.distributionGate !== undefined);
  assert.ok(stack.evaluation !== undefined);
  // Sanity: the actor fixture is a reference, not a rule field.
  assert.equal(typeof ACTOR_ONE, "string");
});
