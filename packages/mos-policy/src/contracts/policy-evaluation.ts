/**
 * Policy evaluation contracts (POLICY-001) — the action descriptor, the
 * evaluation request, the verdict and the immutable append-only §30-style
 * evaluation record.
 *
 * EVALUATION LAW (fail closed — test-pinned): a verdict is one of
 * `allowed` | `denied` | `approval-required` | `insufficient-policy`.
 * An action matching NO cited rule yields `insufficient-policy` — NEVER
 * a silent allow; there is no permissive default (the explicit-grants
 * discipline of @mos/rights mirrored for policy). A `denied` verdict
 * names the RULE and — when the denial is constraint-driven — the exact
 * CONSTRAINT declaration that denied the action. An `approval-required`
 * verdict names the approver role.
 *
 * DETERMINISTIC PRECEDENCE among matched rules (documented, test-pinned):
 * 1. `deny`-effect rules whose constraints are ALL satisfied deny the
 *    action (an explicit prohibition is the strongest signal);
 * 2. otherwise ANY matched rule with a VIOLATED constraint denies the
 *    action citing (rule, constraint) — bounds are bounds;
 * 3. otherwise `require-approval` rules (all constraints satisfied)
 *    yield approval-required citing the first such rule's approver role;
 * 4. otherwise the action is ALLOWED citing the first matched
 *    allow-effect rule.
 * "First" is the CITATION ORDER of the request's policy refs — the caller
 * controls consultation order; the same (request, rules, clock) always
 * produces a bit-identical result.
 *
 * §505 SEPARATION (test-pinned): these verdicts are POLICY verdicts. They
 * never decide rights (a rights verdict is @mos/rights' authority — this
 * package has no rights vocabulary at all) and never decide quality (a
 * quality rejection is the Lab/Studio evaluators' domain).
 */

import type {
  IdentityRef,
  Milliseconds,
  MoneyAmount,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import type { PolicyEvaluationId, PolicyRuleId } from "./ids.js";
import type {
  PolicyActionKind,
  PolicyConstraint,
  PolicyEffect,
  PolicyModality,
} from "./policy-rule.js";

// ---------------------------------------------------------------------------
// The action descriptor (what the caller declares is being attempted)
// ---------------------------------------------------------------------------

/**
 * The DECLARED action a caller asks policy to vet — the descriptor is
 * DATA the caller owns; policy NEVER originates or enriches it (it vets
 * declared actions against declared rules — test-pinned).
 *
 * Context fields are OPTIONAL because not every action kind carries every
 * context; a rule declaring a constraint over missing context is VIOLATED
 * (fail closed — see the constraint docblocks in policy-rule.ts).
 */
export interface PolicyActionDescriptor {
  /**
   * Which boundary-chain stage the action belongs to (closed vocabulary).
   */
  readonly actionKind: PolicyActionKind;
  /**
   * The named subject of the action (DATA string in the caller's
   * documented derivation, e.g. `artifact:<id>`, `transform:clip@3`,
   * `social-channel:<id>`, `mission:<id>`).
   */
  readonly subjectRef: string;
  /**
   * For COMPOUND actions: which action kinds the proposal includes (e.g.
   * a production request including distribution + engine invocation).
   * Defaults to `[actionKind]` when omitted (a simple action includes
   * only its own kind).
   */
  readonly includedActionKinds?: readonly PolicyActionKind[];
  /**
   * The declared spend of the action, when the action declares one
   * (budget-ceiling context). Absent spend + a matched budget-ceiling
   * constraint → the constraint is VIOLATED (fail closed).
   */
  readonly declaredSpend?: MoneyAmount;
  /**
   * The declared deadline the action must meet, when one exists
   * (deadline-floor context, ISO-8601). Absent deadline + a matched
   * deadline-floor constraint → VIOLATED (fail closed).
   */
  readonly deadline?: Timestamp;
  /**
   * The declared modalities the action touches, when derivable from
   * DECLARED artifact types by a documented coarse mapping (never content
   * inference). Absent modalities + a matched modality-restriction
   * constraint → VIOLATED (fail closed).
   */
  readonly modalities?: readonly PolicyModality[];
}

/**
 * An EXACT-VERSION citation of one policy rule — the policy refs an
 * evaluation consults. Explicit versioning is the MOS discipline: the
 * registry resolves the exact frozen version (the latest-at-binding-time
 * choice is a composition-root decision, never implicit here).
 */
export interface PolicyRuleVersionRef {
  /** Stable rule identity. */
  readonly id: PolicyRuleId;
  /** The exact version to consult. */
  readonly version: Version;
}

/** One policy evaluation request: refs + action descriptor + §30 frame. */
export interface PolicyEvaluationRequest {
  /** Tenant/workspace scope (§31 — rules never cross tenants). */
  readonly scope: TenantScope;
  /** §30 actor — the principal whose action is being vetted. */
  readonly actor: IdentityRef;
  /**
   * The policy refs to consult, IN CITATION ORDER (deterministic
   * precedence — see the module docblock). An empty list always yields
   * `insufficient-policy` (fail closed).
   */
  readonly policy: readonly PolicyRuleVersionRef[];
  /** The declared action to vet. */
  readonly action: PolicyActionDescriptor;
}

// ---------------------------------------------------------------------------
// Per-rule consultation outcomes (full context, §30-style)
// ---------------------------------------------------------------------------

/** The evaluated outcome of ONE constraint against the action descriptor. */
export interface PolicyConstraintOutcome {
  /** The constraint declaration VERBATIM (structured data echo). */
  readonly constraint: PolicyConstraint;
  /** Whether the action satisfies the constraint. */
  readonly satisfied: boolean;
  /** Deterministic human-readable outcome detail (audit). */
  readonly detail: string;
}

/** Whether a rule's scope MATCHES the action (the three match facets). */
export interface PolicyScopeMatch {
  /** Same tenant (§31) — otherwise the rule is not even consulted. */
  readonly sameTenant: boolean;
  /** The rule's declared action kinds include the action's kind. */
  readonly actionKindCovered: boolean;
  /** The rule's subject refs are empty or include the subject (or: any). */
  readonly subjectCovered: boolean;
  /** The rule's actor refs are empty or include the actor (or: any). */
  readonly actorCovered: boolean;
}

/**
 * Full context for ONE consulted rule: the citation, the scope-match
 * facets, the per-constraint outcomes and the rule's effect — exactly
 * "which rules were consulted, which matched" (the §30 observability
 * requirement for policy evaluations).
 */
export interface PolicyRuleConsultation {
  /** The cited ref (echo). */
  readonly ref: PolicyRuleVersionRef;
  /** True when every scope facet matched (the rule APPLIES). */
  readonly matched: boolean;
  /** The three scope-match facets (recorded even when not matched). */
  readonly scopeMatch: PolicyScopeMatch;
  /** Per-constraint outcomes (empty when the rule declares none). */
  readonly constraintOutcomes: readonly PolicyConstraintOutcome[];
  /** True when every declared constraint is satisfied. */
  readonly allConstraintsSatisfied: boolean;
  /** The rule's effect (echo — audit). */
  readonly effect: PolicyEffect;
  /** The rule's named approver role (echo — `null` unless require-approval). */
  readonly approverRole: string | null;
  /** The rule's named rationale, carried VERBATIM (audit). */
  readonly rationale: string;
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * WHY a denial happened — the NAMED rule plus the NAMED element inside it
 * that denied the action:
 * - constraint-driven denials cite the violated constraint declaration
 *   (`violatedConstraint` — e.g. the exact budget-ceiling);
 * - effect-driven denials (a matched deny-effect rule with all
 *   constraints satisfied) cite the rule's own deny effect
 *   (`deniedByEffect: true`, `violatedConstraint: null`).
 * The rule's named rationale is carried verbatim either way.
 */
export interface PolicyDenialAttribution {
  /** The rule that denied the action — id + EXACT version. */
  readonly rule: PolicyRuleVersionRef;
  /** The violated constraint declaration, when constraint-driven. */
  readonly violatedConstraint: PolicyConstraint | null;
  /** True when the denial came from the rule's own deny effect. */
  readonly deniedByEffect: boolean;
  /** The rule's named rationale, VERBATIM (audit). */
  readonly rationale: string;
  /** Deterministic human-readable denial detail (audit). */
  readonly detail: string;
}

/**
 * The verdict of one policy evaluation (discriminated union).
 * `insufficient-policy` is the FAIL-CLOSED no-applicable-rule outcome —
 * never a silent allow.
 */
export type PolicyVerdict =
  | {
      readonly outcome: "allowed";
      /** The rule whose allow effect permitted the action. */
      readonly byRule: PolicyRuleVersionRef;
      /** That rule's named rationale, VERBATIM. */
      readonly rationale: string;
    }
  | {
      readonly outcome: "denied";
      /** The named rule + constraint that denied the action. */
      readonly deniedBy: PolicyDenialAttribution;
    }
  | {
      readonly outcome: "approval-required";
      /** The rule requiring approval. */
      readonly byRule: PolicyRuleVersionRef;
      /** The NAMED approver role that must approve the action. */
      readonly approverRole: string;
      /** That rule's named rationale, VERBATIM. */
      readonly rationale: string;
    }
  | {
      readonly outcome: "insufficient-policy";
      /** Every ref that was consulted (and matched none) — full context. */
      readonly consulted: readonly PolicyRuleVersionRef[];
    };

// ---------------------------------------------------------------------------
// The immutable evaluation record (append-only audit, §30-style)
// ---------------------------------------------------------------------------

/**
 * ONE recorded policy evaluation — immutable, deep-frozen, appended to
 * the tenant's evaluation audit log. Carries the FULL context: the
 * request frame, the action descriptor echo, the refs consulted, the
 * per-rule consultations (scope-match facets + per-constraint outcomes),
 * the verdict, and the §30-style timing fields. The verdict is a
 * property of the record: verdicts are immutable because records are.
 */
export interface PolicyEvaluationRecord {
  /** §30 request id — unique within the tenant's evaluation log. */
  readonly id: PolicyEvaluationId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** §30 actor — the principal whose action was vetted. */
  readonly actor: IdentityRef;
  /** When the evaluation started (ISO-8601, the adapter's clock). */
  readonly requestedAt: Timestamp;
  /** The action descriptor, VERBATIM echo (audit). */
  readonly action: PolicyActionDescriptor;
  /** The policy refs consulted, in citation order (echo). */
  readonly policy: readonly PolicyRuleVersionRef[];
  /** Per-rule consultation outcomes — the full matched/consulted context. */
  readonly consultations: readonly PolicyRuleConsultation[];
  /** The verdict (allowed | denied | approval-required | insufficient). */
  readonly verdict: PolicyVerdict;
  /** When the evaluation completed (ISO-8601). */
  readonly evaluatedAt: Timestamp;
  /** §30 duration in milliseconds (≥ 0). */
  readonly durationMs: Milliseconds;
}

/** Filter for reading the evaluation audit log (all fields optional). */
export interface PolicyEvaluationRecordFilter {
  /** Only evaluations of this action kind. */
  readonly actionKind?: PolicyActionKind;
  /** Only evaluations of this subject reference. */
  readonly subjectRef?: string;
  /** Only evaluations by this actor. */
  readonly actor?: IdentityRef;
  /** Only evaluations citing this rule id (any version). */
  readonly ruleId?: PolicyRuleId;
  /** Maximum number of records returned (ascending time, then id). */
  readonly limit?: number;
}

/**
 * The list-latest filter for registry reads: list by declared scope —
 * which boundary-chain action kind (and optionally which subject) the
 * rules govern.
 */
export interface PolicyRuleListFilter {
  /** Only rules whose declared scope includes this action kind. */
  readonly actionKind?: PolicyActionKind;
  /** Only rules whose declared subject refs include this subject. */
  readonly subjectRef?: string;
}
