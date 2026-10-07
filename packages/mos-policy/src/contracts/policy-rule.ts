/**
 * PolicyRule contract (POLICY-001) — the versioned, tenant-scoped,
 * append-only record of ONE policy rule.
 *
 * Basis: spec/mos-architecture-v2.0.md §3 (Policy is one of the MOS
 * authorities — "Exactly one authority owns each category of mutable
 * business state"; Studio ≠ Rights/Policy), §2 (the complete loop:
 * Lab → Mission → Policy → Rights → production — policy sits on the real
 * boundary chain BEFORE rights and production), §24 (the real-world
 * boundary: Lab candidate → Mission → Policy/Rights/Assets →
 * Production/Studio → Distribution/Integration), §19/§505 (a quality
 * rejection is DISTINCT from a Rights/Policy rejection — and policy ≠
 * rights: this module never decides rights), §27 (security and rights:
 * the disallowed-strategy families a tenant may encode as deny rules),
 * §31 (tenant scoping on mutable artifacts).
 *
 * Registry mapping (spec/mos-module-registry-v2.0.yaml): the policy module
 * owns root packages/mos-policy, authority `policy`, dependencies exactly
 * [contracts, identity] — imported registry-exact.
 *
 * Design rules pinned by this shape:
 * - The DECLARED SCOPE is a closed vocabulary aligned with the real
 *   boundary chain (which stage of the loop the rule governs) plus
 *   optional subject/actor scoping — never free text.
 * - CONSTRAINTS ARE DATA: a discriminated union of typed constraint
 *   declarations. There is structurally no free-text constraint field
 *   (an unstructurable constraint is rejected at registration — the
 *   runtime twin is the validation adapter's closed-kind check).
 * - The EFFECT is one of allow / deny / require-approval; a
 *   require-approval rule MUST name its approver role.
 * - Every rule carries a NAMED rationale (audit) and provenance (which
 *   authority/actor created it, which prior version it supersedes).
 */

import type {
  IdentityRef,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { IdentityId } from "@mos/identity";

import type { PolicyRuleId } from "./ids.js";

// ---------------------------------------------------------------------------
// The closed action-kind vocabulary (aligned with the boundary chain)
// ---------------------------------------------------------------------------

/**
 * The closed vocabulary of action kinds a policy rule may govern — the
 * stages of the real boundary chain where policy is consulted (spec §2/§24):
 *
 * - `production-request-approval` — approving a ProductionRequest (the
 *   Lab → Mission → Policy step of the boundary chain; the request's
 *   delayPolicy/rightsContext frame is vetted here);
 * - `distribution` — distribution operations (the §24 chain step where
 *   the W6-C PolicyGatePort seam sits; publish/schedule/read/delete);
 * - `experiment-launch` — launching a real MOS experiment (§24: the Lab
 *   candidate becomes a real experiment through Policy/Rights first);
 * - `transform-application` — applying a transform of one of the §5 kinds
 *   (the specific kind is scoped by the rule's subject refs, e.g.
 *   `transform:clip@3` — never inferred);
 * - `engine-invocation` — invoking an engine (§11 — the sandbox consults
 *   policy with the engine identity as the subject);
 * - `human-task-fulfillment` — fulfilling a human production task (§17 —
 *   the twelve-field task packages vetted before delivery).
 *
 * Frozen (compile-time const + runtime validation): adding a kind is an
 * architecture-level decision, never a data edit.
 */
export const POLICY_ACTION_KINDS = Object.freeze([
  "production-request-approval",
  "distribution",
  "experiment-launch",
  "transform-application",
  "engine-invocation",
  "human-task-fulfillment",
] as const);

/** One of the {@link POLICY_ACTION_KINDS} entries. */
export type PolicyActionKind = (typeof POLICY_ACTION_KINDS)[number];

/**
 * The closed modality vocabulary for modality-restriction constraints
 * (coarse content families — derived from DECLARED artifact types by
 * documented coarse mappings elsewhere, never inferred from content).
 */
export const POLICY_MODALITIES = Object.freeze([
  "text",
  "audio",
  "image",
  "video",
] as const);

/** One of the {@link POLICY_MODALITIES} entries. */
export type PolicyModality = (typeof POLICY_MODALITIES)[number];

// ---------------------------------------------------------------------------
// The declared scope (what the rule governs)
// ---------------------------------------------------------------------------

/**
 * WHAT a policy rule governs — a declarative closed-vocabulary scope:
 * which boundary-chain action kinds, optionally narrowed to explicit
 * subject references and/or actor references. Empty subject/actor lists
 * mean "any subject/actor" (the action kinds still bound the rule); a
 * scope with NO action kinds is invalid (a rule that governs nothing is
 * unstructurable data, rejected at registration).
 */
export interface PolicyScope {
  /** Which boundary-chain action kinds the rule governs (non-empty). */
  readonly actionKinds: readonly PolicyActionKind[];
  /**
   * Explicit subject references the rule is narrowed to (DATA strings in
   * the callers' documented derivations, e.g. `artifact:<id>`,
   * `transform:clip@3`, `engine:<id>@<version>`); empty = any subject.
   */
  readonly subjectRefs: readonly string[];
  /**
   * Explicit actor references the rule is narrowed to (§30 principals);
   * empty = any actor.
   */
  readonly actorRefs: readonly IdentityRef[];
}

// ---------------------------------------------------------------------------
// Structured constraint declarations (DATA, never free text)
// ---------------------------------------------------------------------------

/**
 * An ALLOWED-ACTION-KINDS constraint: every action kind the descriptor
 * declares as included must be within `allowedActionKinds` (a compound
 * action — e.g. a production request including distribution and engine
 * invocation — violates the constraint when it includes anything outside
 * the allowlist).
 */
export interface ActionKindAllowlistConstraint {
  readonly kind: "action-kind-allowlist";
  readonly allowedActionKinds: readonly PolicyActionKind[];
}

/**
 * A DISALLOWED-ACTION-KINDS constraint: the descriptor must include NO
 * kind from `disallowedActionKinds`.
 */
export interface ActionKindDenylistConstraint {
  readonly kind: "action-kind-denylist";
  readonly disallowedActionKinds: readonly PolicyActionKind[];
}

/**
 * A BUDGET-CEILING constraint: the action's declared spend must exist,
 * match the constraint's currency and not exceed `maximum`. An action
 * with NO declared spend is a VIOLATION (fail closed — a bound cannot be
 * verified without the data), never a silent pass.
 */
export interface BudgetCeilingConstraint {
  readonly kind: "budget-ceiling";
  /** ISO-4217-style currency code the ceiling is denominated in. */
  readonly currency: string;
  /** Maximum allowed declared spend (≥ 0) in that currency. */
  readonly maximum: number;
}

/**
 * A DEADLINE-FLOOR constraint: the action's declared deadline must exist
 * and be at least `minimumLeadMs` milliseconds after the evaluation's
 * `now`. An action with NO declared deadline is a VIOLATION (fail
 * closed), never a silent pass.
 */
export interface DeadlineFloorConstraint {
  readonly kind: "deadline-floor";
  /** Minimum lead time in milliseconds (≥ 0). */
  readonly minimumLeadMs: number;
}

/**
 * A MODALITY-RESTRICTION constraint: every modality the descriptor
 * declares must be within `allowedModalities`. An action with NO declared
 * modalities is a VIOLATION (fail closed), never a silent pass.
 */
export interface ModalityRestrictionConstraint {
  readonly kind: "modality-restriction";
  readonly allowedModalities: readonly PolicyModality[];
}

/**
 * The constraint-declaration union — STRUCTURED TYPED DATA. There is no
 * free-text constraint variant; an object whose `kind` is not one of the
 * five is rejected at registration (`unstructurable constraint`), so a
 * rule that cannot be evaluated structurally can never enter the
 * registry (the prompt's "constraint declarations structured —
 * unstructurable constraint rejected").
 */
export type PolicyConstraint =
  | ActionKindAllowlistConstraint
  | ActionKindDenylistConstraint
  | BudgetCeilingConstraint
  | DeadlineFloorConstraint
  | ModalityRestrictionConstraint;

// ---------------------------------------------------------------------------
// Effect + provenance + the rule record
// ---------------------------------------------------------------------------

/**
 * What the rule does when its scope MATCHES an action and all its
 * declared constraints are SATISFIED (deterministic precedence among
 * matched rules is documented on the evaluation contract):
 * - `allow` — the action is allowed (citing this rule);
 * - `deny` — the action is denied (citing this rule's own effect);
 * - `require-approval` — the action may proceed only after the named
 *   approver role approves it (the verdict names the role).
 */
export type PolicyEffect = "allow" | "deny" | "require-approval";

/**
 * Provenance of one policy rule version: which authority created it, the
 * acting principal, when, and which prior version it supersedes
 * (append-only: the prior version is never touched — supersession is
 * recorded on the NEW version only).
 */
export interface PolicyRuleProvenance {
  /**
   * The authority that created this rule version (a named MOS authority
   * or composition-root actor — DATA, e.g. `tenant-admin`,
   * `mission-authority`).
   */
  readonly createdByAuthority: string;
  /** The acting principal that submitted the registration. */
  readonly createdBy: IdentityId;
  /** When this version was registered (ISO-8601). */
  readonly registeredAt: Timestamp;
  /**
   * The prior version this rule version supersedes, or `null` on the
   * first version (v1). The SUPERSEDED record itself is never mutated.
   */
  readonly supersedes: { readonly id: PolicyRuleId; readonly version: Version } | null;
}

/**
 * One version of a policy rule. Immutable, deep-frozen at registration;
 * revisions APPEND a new version (the registry's discipline: prior
 * versions stay bit-for-bit and resolvable). The stable reference form is
 * the rule's {@link PolicyRuleId} (an alias of the canonical `PolicyRef`).
 */
export interface PolicyRule {
  /** Stable rule identity across versions (canonical PolicyRef form). */
  readonly id: PolicyRuleId;
  /** Append-only version number (v1 on registration, v+1 per revision). */
  readonly version: Version;
  /** Tenant/workspace scope (§31 — rules never cross tenants). */
  readonly scope: TenantScope;
  /** What the rule governs (closed vocabulary + subject/actor scoping). */
  readonly declaredScope: PolicyScope;
  /** Structured typed constraint declarations (data, never free text). */
  readonly constraints: readonly PolicyConstraint[];
  /** The rule's effect when matched with all constraints satisfied. */
  readonly effect: PolicyEffect;
  /**
   * The named approver role — REQUIRED (non-blank) exactly when the
   * effect is `require-approval`, `null` otherwise.
   */
  readonly approverRole: string | null;
  /** Named rationale for audit (non-blank; surfaced verbatim on verdicts). */
  readonly rationale: string;
  /** Who created this version, when, superseding what. */
  readonly provenance: PolicyRuleProvenance;
}

/**
 * Caller input for registering (or revising) a policy rule. `register`
 * mints v1 for a NEW in-tenant id (a duplicate id fails closed with
 * `duplicate-policy-rule`); `revise` appends v+1 to a KNOWN in-tenant id
 * (an unknown id fails closed with `policy-rule-not-found`). The registry
 * completes `version` and `provenance` (registeredAt, supersedes);
 * the caller declares everything else.
 */
export interface RegisterPolicyRuleInput {
  /**
   * Rule identity (register: new in-tenant id mints v1 — a known id is a
   * `duplicate-policy-rule` caller error; revise: known in-tenant id —
   * append-only v+1).
   */
  readonly id: PolicyRuleId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** What the rule governs (validated fail-closed). */
  readonly declaredScope: PolicyScope;
  /** Structured typed constraints (validated fail-closed). */
  readonly constraints: readonly PolicyConstraint[];
  /** allow / deny / require-approval. */
  readonly effect: PolicyEffect;
  /** Named approver role — required iff effect is require-approval. */
  readonly approverRole?: string;
  /** Named rationale (audit). */
  readonly rationale: string;
  /** Creating authority (provenance). */
  readonly createdByAuthority: string;
  /** Acting principal (provenance). */
  readonly createdBy: IdentityId;
}
