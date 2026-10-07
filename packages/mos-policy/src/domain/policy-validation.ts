/**
 * Fail-closed validation of policy authority inputs (POLICY-001).
 *
 * The runtime twin of the compile-time type pins: STRICT-SHAPE checks
 * (a record carrying any property beyond its declared field set is
 * rejected — the unstructurable-constraint guard), closed-vocabulary
 * membership, blank guards and numeric guards. Every failure throws a
 * typed `PolicyError` naming the field and the allowed vocabulary; the
 * failing code is selected by the caller (`invalid-policy-rule` for
 * registration inputs, `invalid-evaluation-request` for evaluation
 * requests).
 */

import type { TenantScope, Version } from "@mos/contracts";

import { PolicyError } from "../errors.js";
import type { PolicyErrorCode } from "../errors.js";
import type { PolicyRuleId } from "../contracts/ids.js";
import {
  POLICY_ACTION_KINDS,
  POLICY_MODALITIES,
} from "../contracts/policy-rule.js";
import type {
  PolicyActionKind,
  PolicyConstraint,
  PolicyEffect,
  PolicyModality,
  RegisterPolicyRuleInput,
  PolicyScope,
} from "../contracts/policy-rule.js";
import type {
  PolicyActionDescriptor,
  PolicyEvaluationRequest,
  PolicyRuleVersionRef,
} from "../contracts/policy-evaluation.js";

// ---------------------------------------------------------------------------
// Guard helpers (fail closed, typed, code-parameterized assertion functions)
// ---------------------------------------------------------------------------

type Fail = (message: string, details: Record<string, unknown>) => never;

function failer(code: PolicyErrorCode): Fail {
  return (message, details) => {
    throw new PolicyError(code, message, details);
  };
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function assertPlainObject(value: unknown, field: string, fail: Fail): asserts value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${field} must be a plain object`, { field });
  }
}

function assertArray(value: unknown, field: string, fail: Fail): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array`, { field });
  }
}

function assertNonBlankString(value: unknown, field: string, fail: Fail): asserts value is string {
  if (isBlank(value)) {
    fail(`${field} must be a non-blank string`, { field });
  }
}

function assertExactFields(
  input: object,
  allowedFields: readonly string[],
  field: string,
  fail: Fail,
): void {
  const unexpected = Object.keys(input).filter((key) => !allowedFields.includes(key));
  if (unexpected.length > 0) {
    fail(
      `${field} carries unexpected field(s): ${unexpected.join(", ")} — records are strict-shape (no extra properties can enter the policy authority)`,
      { field, unexpectedFields: [...unexpected], allowedFields: [...allowedFields] },
    );
  }
}

function assertNoDuplicates(values: readonly unknown[], field: string, fail: Fail): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = typeof value === "string" ? value : String(value);
    if (seen.has(key)) {
      fail(`${field} contains the duplicate entry "${key}"`, { field, duplicate: key });
    }
    seen.add(key);
  }
}

function assertVocabularyMembers(
  values: readonly unknown[],
  vocabulary: readonly string[],
  field: string,
  fail: Fail,
): void {
  for (const value of values) {
    if (typeof value !== "string" || !vocabulary.includes(value)) {
      fail(
        `${field} entries must be members of the closed vocabulary [${vocabulary.join(", ")}]`,
        { field, allowed: [...vocabulary], offending: value },
      );
    }
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
  min: number,
  fail: Fail,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    fail(`${field} must be a finite number ≥ ${min}`, { field });
  }
}

function assertPositiveIntegerVersion(
  value: unknown,
  field: string,
  fail: Fail,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail(`${field} must be an integer ≥ 1`, { field });
  }
}

function assertTenantScope(scope: unknown, field: string, fail: Fail): asserts scope is TenantScope {
  assertPlainObject(scope, field, fail);
  assertExactFields(scope, ["tenantId", "workspaceId"], field, fail);
  const candidate = scope as { tenantId?: unknown; workspaceId?: unknown };
  assertNonBlankString(candidate.tenantId, `${field}.tenantId`, fail);
  if (candidate.workspaceId !== undefined) {
    assertNonBlankString(candidate.workspaceId, `${field}.workspaceId`, fail);
  }
}

// ---------------------------------------------------------------------------
// Declared scope + structured constraints (registration validation)
// ---------------------------------------------------------------------------

const SCOPE_FIELDS = ["actionKinds", "subjectRefs", "actorRefs"] as const;

function validateDeclaredScope(scope: unknown, fail: Fail): PolicyScope {
  assertPlainObject(scope, "declaredScope", fail);
  assertExactFields(scope, SCOPE_FIELDS, "declaredScope", fail);
  const candidate = scope as {
    actionKinds?: unknown;
    subjectRefs?: unknown;
    actorRefs?: unknown;
  };

  const actionKinds = candidate.actionKinds;
  assertArray(actionKinds, "declaredScope.actionKinds", fail);
  if (actionKinds.length === 0) {
    fail("declaredScope.actionKinds must be non-empty — a rule that governs nothing is unstructurable", {
      field: "declaredScope.actionKinds",
    });
  }
  assertVocabularyMembers(actionKinds, POLICY_ACTION_KINDS, "declaredScope.actionKinds", fail);
  assertNoDuplicates(actionKinds, "declaredScope.actionKinds", fail);

  const subjectRefs = candidate.subjectRefs;
  assertArray(subjectRefs, "declaredScope.subjectRefs", fail);
  for (const ref of subjectRefs) {
    assertNonBlankString(ref, "declaredScope.subjectRefs[]", fail);
  }
  assertNoDuplicates(subjectRefs, "declaredScope.subjectRefs", fail);

  const actorRefs = candidate.actorRefs;
  assertArray(actorRefs, "declaredScope.actorRefs", fail);
  for (const ref of actorRefs) {
    assertNonBlankString(ref, "declaredScope.actorRefs[]", fail);
  }
  assertNoDuplicates(actorRefs, "declaredScope.actorRefs", fail);

  return {
    actionKinds: Object.freeze([...(actionKinds as readonly PolicyActionKind[])]),
    subjectRefs: Object.freeze([...(subjectRefs as readonly string[])]),
    actorRefs: Object.freeze([
      ...(actorRefs as PolicyScope["actorRefs"]),
    ]),
  };
}

const CONSTRAINT_FIELDS: Readonly<Record<PolicyConstraint["kind"], readonly string[]>> =
  Object.freeze({
    "action-kind-allowlist": ["kind", "allowedActionKinds"],
    "action-kind-denylist": ["kind", "disallowedActionKinds"],
    "budget-ceiling": ["kind", "currency", "maximum"],
    "deadline-floor": ["kind", "minimumLeadMs"],
    "modality-restriction": ["kind", "allowedModalities"],
  });

/**
 * Validates ONE constraint declaration — THE UNSTRUCTURABLE-CONSTRAINT
 * GUARD: the `kind` must be one of the five structured kinds, the object
 * must be strict-shape for that kind, and every payload must be a
 * non-empty closed-vocabulary/numeric declaration. There is no free-text
 * constraint form; anything else is rejected by name.
 */
function validateConstraint(constraint: unknown, index: number, fail: Fail): PolicyConstraint {
  const field = `constraints[${index}]`;
  assertPlainObject(constraint, field, fail);
  const kind = (constraint as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !(kind in CONSTRAINT_FIELDS)) {
    fail(
      `${field}.kind must be one of [${Object.keys(CONSTRAINT_FIELDS).join(", ")}] — constraint declarations are STRUCTURED DATA (unstructurable constraints are rejected)`,
      { field, allowed: Object.keys(CONSTRAINT_FIELDS), offending: kind },
    );
  }
  assertExactFields(
    constraint,
    CONSTRAINT_FIELDS[kind as PolicyConstraint["kind"]],
    field,
    fail,
  );

  switch (kind as PolicyConstraint["kind"]) {
    case "action-kind-allowlist": {
      const list = (constraint as { allowedActionKinds?: unknown }).allowedActionKinds;
      assertArray(list, `${field}.allowedActionKinds`, fail);
      if (list.length === 0) {
        fail(`${field}.allowedActionKinds must be non-empty`, { field });
      }
      assertVocabularyMembers(list, POLICY_ACTION_KINDS, `${field}.allowedActionKinds`, fail);
      assertNoDuplicates(list, `${field}.allowedActionKinds`, fail);
      return {
        kind: "action-kind-allowlist",
        allowedActionKinds: Object.freeze([...(list as readonly PolicyActionKind[])]),
      };
    }
    case "action-kind-denylist": {
      const list = (constraint as { disallowedActionKinds?: unknown }).disallowedActionKinds;
      assertArray(list, `${field}.disallowedActionKinds`, fail);
      if (list.length === 0) {
        fail(`${field}.disallowedActionKinds must be non-empty`, { field });
      }
      assertVocabularyMembers(list, POLICY_ACTION_KINDS, `${field}.disallowedActionKinds`, fail);
      assertNoDuplicates(list, `${field}.disallowedActionKinds`, fail);
      return {
        kind: "action-kind-denylist",
        disallowedActionKinds: Object.freeze([...(list as readonly PolicyActionKind[])]),
      };
    }
    case "budget-ceiling": {
      const currency = (constraint as { currency?: unknown }).currency;
      const maximum = (constraint as { maximum?: unknown }).maximum;
      assertNonBlankString(currency, `${field}.currency`, fail);
      assertFiniteNumber(maximum, `${field}.maximum`, 0, fail);
      return {
        kind: "budget-ceiling",
        currency,
        maximum,
      };
    }
    case "deadline-floor": {
      const minimumLeadMs = (constraint as { minimumLeadMs?: unknown }).minimumLeadMs;
      assertFiniteNumber(minimumLeadMs, `${field}.minimumLeadMs`, 0, fail);
      return { kind: "deadline-floor", minimumLeadMs };
    }
    case "modality-restriction": {
      const list = (constraint as { allowedModalities?: unknown }).allowedModalities;
      assertArray(list, `${field}.allowedModalities`, fail);
      if (list.length === 0) {
        fail(`${field}.allowedModalities must be non-empty`, { field });
      }
      assertVocabularyMembers(list, POLICY_MODALITIES, `${field}.allowedModalities`, fail);
      assertNoDuplicates(list, `${field}.allowedModalities`, fail);
      return {
        kind: "modality-restriction",
        allowedModalities: Object.freeze([...(list as readonly PolicyModality[])]),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Registration input (the registry's write guard)
// ---------------------------------------------------------------------------

const INPUT_FIELDS = [
  "id",
  "scope",
  "declaredScope",
  "constraints",
  "effect",
  "approverRole",
  "rationale",
  "createdByAuthority",
  "createdBy",
] as const;

const EFFECTS: readonly string[] = ["allow", "deny", "require-approval"];

/** The validated pieces of a registration input (normalized + frozen). */
export interface ValidatedPolicyRuleInput {
  readonly id: PolicyRuleId;
  readonly scope: TenantScope;
  readonly declaredScope: PolicyScope;
  readonly constraints: readonly PolicyConstraint[];
  readonly effect: PolicyEffect;
  readonly approverRole: string | null;
  readonly rationale: string;
  readonly createdByAuthority: string;
  readonly createdBy: RegisterPolicyRuleInput["createdBy"];
}

/**
 * Validates a registration input fail-closed and returns the validated
 * structural pieces (declaredScope + constraints normalized/frozen).
 */
export function validateRegisterPolicyRuleInput(
  input: RegisterPolicyRuleInput,
): ValidatedPolicyRuleInput {
  const fail = failer("invalid-policy-rule");
  assertPlainObject(input, "input", fail);
  assertExactFields(input, INPUT_FIELDS, "input", fail);
  assertNonBlankString(input.id, "input.id", fail);
  assertTenantScope(input.scope, "input.scope", fail);
  const declaredScope = validateDeclaredScope(input.declaredScope, fail);

  const constraintsInput = input.constraints;
  assertArray(constraintsInput, "input.constraints", fail);
  const constraints = constraintsInput.map((constraint, index) =>
    validateConstraint(constraint, index, fail),
  );

  const effect = input.effect;
  if (typeof effect !== "string" || !EFFECTS.includes(effect)) {
    fail("input.effect must be one of [allow, deny, require-approval]", {
      field: "effect",
      allowed: [...EFFECTS],
    });
  }

  if (effect === "require-approval") {
    assertNonBlankString(
      input.approverRole,
      "input.approverRole (required when effect is require-approval)",
      fail,
    );
  } else if (input.approverRole !== undefined && input.approverRole !== null) {
    fail("input.approverRole must be null/undefined unless the effect is require-approval", {
      field: "approverRole",
    });
  }

  assertNonBlankString(input.rationale, "input.rationale", fail);
  assertNonBlankString(input.createdByAuthority, "input.createdByAuthority", fail);
  assertNonBlankString(input.createdBy, "input.createdBy", fail);

  return {
    id: input.id,
    scope: input.scope,
    declaredScope,
    constraints: Object.freeze(constraints),
    effect: effect as PolicyEffect,
    approverRole: effect === "require-approval" ? (input.approverRole as string) : null,
    rationale: input.rationale,
    createdByAuthority: input.createdByAuthority,
    createdBy: input.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Evaluation request (the evaluation adapter's input guard)
// ---------------------------------------------------------------------------

const REF_FIELDS = ["id", "version"] as const;
const REQUEST_FIELDS = ["scope", "actor", "policy", "action"] as const;
const DESCRIPTOR_FIELDS = [
  "actionKind",
  "subjectRef",
  "includedActionKinds",
  "declaredSpend",
  "deadline",
  "modalities",
] as const;
const SPEND_FIELDS = ["amount", "currency"] as const;

function validateRuleVersionRef(ref: unknown, index: number, fail: Fail): PolicyRuleVersionRef {
  const field = `policy[${index}]`;
  assertPlainObject(ref, field, fail);
  assertExactFields(ref, REF_FIELDS, field, fail);
  const candidate = ref as { id?: unknown; version?: unknown };
  assertNonBlankString(candidate.id, `${field}.id`, fail);
  const version = candidate.version;
  assertPositiveIntegerVersion(version, `${field}.version`, fail);
  return { id: candidate.id as PolicyRuleId, version: version as Version };
}

function validateActionDescriptor(descriptor: unknown, fail: Fail): PolicyActionDescriptor {
  assertPlainObject(descriptor, "action", fail);
  assertExactFields(descriptor, DESCRIPTOR_FIELDS, "action", fail);
  const candidate = descriptor as Record<string, unknown>;

  const actionKind = candidate.actionKind;
  if (
    typeof actionKind !== "string" ||
    !POLICY_ACTION_KINDS.includes(actionKind as PolicyActionKind)
  ) {
    fail(`action.actionKind must be one of [${POLICY_ACTION_KINDS.join(", ")}]`, {
      field: "action.actionKind",
      allowed: [...POLICY_ACTION_KINDS],
    });
  }
  assertNonBlankString(candidate.subjectRef, "action.subjectRef", fail);

  const includedActionKinds = candidate.includedActionKinds;
  if (includedActionKinds !== undefined) {
    assertArray(includedActionKinds, "action.includedActionKinds", fail);
    if (includedActionKinds.length === 0) {
      fail("action.includedActionKinds must be non-empty when present", {
        field: "action.includedActionKinds",
      });
    }
    assertVocabularyMembers(
      includedActionKinds,
      POLICY_ACTION_KINDS,
      "action.includedActionKinds",
      fail,
    );
    assertNoDuplicates(includedActionKinds, "action.includedActionKinds", fail);
  }

  const declaredSpend = candidate.declaredSpend;
  if (declaredSpend !== undefined) {
    assertPlainObject(declaredSpend, "action.declaredSpend", fail);
    assertExactFields(declaredSpend, SPEND_FIELDS, "action.declaredSpend", fail);
    const spend = declaredSpend as { amount?: unknown; currency?: unknown };
    assertFiniteNumber(spend.amount, "action.declaredSpend.amount", 0, fail);
    assertNonBlankString(spend.currency, "action.declaredSpend.currency", fail);
  }

  const deadline = candidate.deadline;
  if (deadline !== undefined) {
    assertNonBlankString(deadline, "action.deadline", fail);
    if (!Number.isFinite(Date.parse(deadline))) {
      fail("action.deadline must be a parseable ISO-8601 instant", {
        field: "action.deadline",
      });
    }
  }

  const modalities = candidate.modalities;
  if (modalities !== undefined) {
    assertArray(modalities, "action.modalities", fail);
    if (modalities.length === 0) {
      fail("action.modalities must be non-empty when present", { field: "action.modalities" });
    }
    assertVocabularyMembers(modalities, POLICY_MODALITIES, "action.modalities", fail);
    assertNoDuplicates(modalities, "action.modalities", fail);
  }

  return descriptor as PolicyActionDescriptor;
}

/** Validates an evaluation request fail-closed (strict-shape, returns the same value, typed). */
export function validatePolicyEvaluationRequest(
  request: PolicyEvaluationRequest,
): PolicyEvaluationRequest {
  const fail = failer("invalid-evaluation-request");
  assertPlainObject(request, "request", fail);
  assertExactFields(request, REQUEST_FIELDS, "request", fail);
  assertTenantScope(request.scope, "request.scope", fail);
  assertNonBlankString(request.actor, "request.actor", fail);
  const policy = request.policy;
  assertArray(policy, "request.policy", fail);
  policy.forEach((ref, index) => validateRuleVersionRef(ref, index, fail));
  validateActionDescriptor(request.action, fail);
  return request;
}
