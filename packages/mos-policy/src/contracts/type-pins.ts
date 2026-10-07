/**
 * Compile-time structural pins for the policy contracts (POLICY-001).
 *
 * TYPE-LEVEL assertions only — they emit no runtime code and fail `tsc`
 * (therefore every build and test run) the moment a contract drifts. The
 * runtime twins of these pins (strict-shape registration validation,
 * closed-vocabulary checks, the authority-discipline source scans) live
 * in the *.test.ts files.
 *
 * Pins:
 * 1. CONSTRAINTS-ARE-STRUCTURED-DATA: every PolicyConstraint variant has
 *    EXACTLY its pinned keyset — there is no free-text variant and no
 *    field through which prose could enter a constraint declaration.
 * 2. EXACT RECORD KEYSETS: PolicyRule, PolicyScope, PolicyActionDescriptor
 *    and every PolicyVerdict variant have EXACTLY the pinned keysets — no
 *    smuggled field (media bytes, credentials, rights semantics) can ride
 *    on a policy record.
 * 3. The action-kind and modality vocabularies are the frozen consts'
 *    literal unions (adding a member requires touching the frozen const).
 * 4. PolicyRuleId IS the canonical PolicyRef brand (type identity — the
 *    boundary-chain policyRef/Transform.policyRequirements vocabulary
 *    resolves directly through this registry with no adapter mapping).
 * 5. The verdict vocabulary is closed and includes the fail-closed
 *    `insufficient-policy` member (distinct from every other outcome).
 */

import type { PolicyRef } from "@mos/contracts";

import type { PolicyRuleId } from "./ids.js";
import type {
  ActionKindAllowlistConstraint,
  ActionKindDenylistConstraint,
  BudgetCeilingConstraint,
  DeadlineFloorConstraint,
  ModalityRestrictionConstraint,
  POLICY_ACTION_KINDS,
  POLICY_MODALITIES,
  PolicyActionKind,
  PolicyConstraint,
  PolicyEffect,
  PolicyModality,
  PolicyRule,
  PolicyScope,
} from "./policy-rule.js";
import type {
  PolicyActionDescriptor,
  PolicyVerdict,
} from "./policy-evaluation.js";

/** Compile-time assertion helper: the expression must resolve to `true`. */
export type Expect<T extends true> = T;

/** Strict type equality (the CORE-001 type-test helper). */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** True when the keyset of `T` is exactly `K` (no more, no fewer). */
export type ExactKeyset<T, K> = Equal<keyof T, K>;

// --- (1) constraints are structured data — exact variant keysets -----------

type _AllowlistKeyset = Expect<
  ExactKeyset<ActionKindAllowlistConstraint, "kind" | "allowedActionKinds">
>;
type _DenylistKeyset = Expect<
  ExactKeyset<ActionKindDenylistConstraint, "kind" | "disallowedActionKinds">
>;
type _BudgetCeilingKeyset = Expect<
  ExactKeyset<BudgetCeilingConstraint, "kind" | "currency" | "maximum">
>;
type _DeadlineFloorKeyset = Expect<
  ExactKeyset<DeadlineFloorConstraint, "kind" | "minimumLeadMs">
>;
type _ModalityRestrictionKeyset = Expect<
  ExactKeyset<ModalityRestrictionConstraint, "kind" | "allowedModalities">
>;

/** The constraint union's discriminants — exactly the five structured kinds. */
type _ConstraintKinds = Expect<
  Equal<PolicyConstraint["kind"],
    | "action-kind-allowlist"
    | "action-kind-denylist"
    | "budget-ceiling"
    | "deadline-floor"
    | "modality-restriction">
>;

// --- (2) exact record keysets ----------------------------------------------

type _PolicyScopeKeyset = Expect<
  ExactKeyset<PolicyScope, "actionKinds" | "subjectRefs" | "actorRefs">
>;

type _PolicyRuleKeyset = Expect<
  ExactKeyset<
    PolicyRule,
    | "id"
    | "version"
    | "scope"
    | "declaredScope"
    | "constraints"
    | "effect"
    | "approverRole"
    | "rationale"
    | "provenance"
  >
>;

type _ActionDescriptorKeyset = Expect<
  ExactKeyset<
    PolicyActionDescriptor,
    | "actionKind"
    | "subjectRef"
    | "includedActionKinds"
    | "declaredSpend"
    | "deadline"
    | "modalities"
  >
>;

type _AllowedVerdictKeyset = Expect<
  ExactKeyset<Extract<PolicyVerdict, { outcome: "allowed" }>, "outcome" | "byRule" | "rationale">
>;
type _DeniedVerdictKeyset = Expect<
  ExactKeyset<Extract<PolicyVerdict, { outcome: "denied" }>, "outcome" | "deniedBy">
>;
type _ApprovalVerdictKeyset = Expect<
  ExactKeyset<
    Extract<PolicyVerdict, { outcome: "approval-required" }>,
    "outcome" | "byRule" | "approverRole" | "rationale"
  >
>;
type _InsufficientVerdictKeyset = Expect<
  ExactKeyset<Extract<PolicyVerdict, { outcome: "insufficient-policy" }>, "outcome" | "consulted">
>;

// --- (3) frozen vocabularies ------------------------------------------------

type _ActionKindVocabulary = Expect<
  Equal<PolicyActionKind, (typeof POLICY_ACTION_KINDS)[number]>
>;
type _ModalityVocabulary = Expect<
  Equal<PolicyModality, (typeof POLICY_MODALITIES)[number]>
>;

// --- (4) the rule id IS the canonical PolicyRef -----------------------------

type _RuleIdIsCanonicalRef = Expect<Equal<PolicyRuleId, PolicyRef>>;

// --- (5) closed verdict + effect vocabularies -------------------------------

type _VerdictVocabulary = Expect<
  Equal<PolicyVerdict["outcome"],
    "allowed" | "denied" | "approval-required" | "insufficient-policy">
>;
type _EffectVocabulary = Expect<
  Equal<PolicyEffect, "allow" | "deny" | "require-approval">
>;
