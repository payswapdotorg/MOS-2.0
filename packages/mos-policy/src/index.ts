/**
 * Public surface of `@mos/policy` (MOS v2.0 POLICY-001).
 *
 * The policy authority: versioned, tenant-scoped, append-only policy
 * rules over the closed boundary-chain action-kind vocabulary, with
 * STRUCTURED TYPED constraint declarations (data, never free text), an
 * effect (allow/deny/require-approval), a named rationale and
 * provenance; a fail-closed evaluation surface whose verdicts are
 * allowed | denied (naming the rule + constraint) | approval-required
 * (naming the approver role) | insufficient-policy (NEVER a silent
 * allow), recorded as immutable append-only §30-style evaluation
 * records with the full consulted/matched context.
 *
 * Exports the domain/port/contract types plus exactly FIVE runtime
 * exports: the two in-memory adapter factories, the two frozen
 * vocabulary constants and the typed error class. No helper
 * constructors or internals are exposed. The testing/composition seams
 * (src/testing/** — including the W6-C distribution gate adapter) are
 * deliberately NOT exported here: they are import-site seams for tests
 * and the composition root (the W5-C/W6-C precedent), and the registry
 * dependency set stays exactly [@mos/contracts, @mos/identity].
 *
 * Cross-package usage note (the @mos/rights precedent): sibling MOS
 * packages import this package TYPE-ONLY (`import type { ... } from
 * '@mos/policy'`) and receive runtime implementations through injection
 * (hexagonal ports); runtime cross-import of workspace packages whose
 * exports default to source entry points does not resolve under plain
 * Node ESM, so the composition root wires adapters at TL integration
 * time.
 */

export type {
  PolicyRuleId,
  PolicyEvaluationId,
  PolicyRef,
} from "./contracts/ids.js";
export type {
  ActionKindAllowlistConstraint,
  ActionKindDenylistConstraint,
  BudgetCeilingConstraint,
  DeadlineFloorConstraint,
  ModalityRestrictionConstraint,
  PolicyActionKind,
  PolicyConstraint,
  PolicyEffect,
  PolicyModality,
  PolicyRule,
  PolicyRuleProvenance,
  PolicyScope,
  RegisterPolicyRuleInput,
} from "./contracts/policy-rule.js";
export type {
  PolicyActionDescriptor,
  PolicyConstraintOutcome,
  PolicyDenialAttribution,
  PolicyEvaluationRecord,
  PolicyEvaluationRecordFilter,
  PolicyEvaluationRequest,
  PolicyRuleConsultation,
  PolicyRuleListFilter,
  PolicyRuleVersionRef,
  PolicyScopeMatch,
  PolicyVerdict,
} from "./contracts/policy-evaluation.js";
export type {
  InMemoryPolicyRegistryOptions,
} from "./adapters/in-memory-policy-registry.js";
export type {
  InMemoryPolicyEvaluationOptions,
} from "./adapters/in-memory-policy-evaluation.js";
export type { PolicyRegistryPort } from "./ports/policy-registry.port.js";
export type { PolicyEvaluationPort } from "./ports/policy-evaluation.port.js";
export type { PolicyErrorCode } from "./errors.js";

export { POLICY_ACTION_KINDS, POLICY_MODALITIES } from "./contracts/policy-rule.js";
export { createInMemoryPolicyRegistry } from "./adapters/in-memory-policy-registry.js";
export { createInMemoryPolicyEvaluation } from "./adapters/in-memory-policy-evaluation.js";
export { PolicyError } from "./errors.js";
