/**
 * The pure policy evaluation engine (POLICY-001).
 *
 * Receives the RESOLVED rules (the adapter resolves each cited
 * exact-version ref against the registry — unresolvable refs are typed
 * caller errors that never reach this engine) and computes, for the
 * declared action descriptor:
 * - the per-rule CONSULTATIONS (scope-match facets + per-constraint
 *   outcomes — the "which rules were consulted, which matched" context);
 * - the VERDICT under the documented DETERMINISTIC PRECEDENCE:
 *   1. a matched `deny`-effect rule with all constraints satisfied
 *      denies the action (explicit prohibition is the strongest signal);
 *   2. otherwise any matched rule with a VIOLATED constraint denies the
 *      action citing (rule, constraint) — bounds are bounds;
 *   3. otherwise a matched `require-approval` rule yields
 *      approval-required naming the rule's approver role;
 *   4. otherwise the action is allowed citing the first matched
 *      allow-effect rule;
 *   5. no matched rule at all → `insufficient-policy` (FAIL CLOSED —
 *      never a silent allow).
 * "First" is the citation order of the request's policy refs; the caller
 * controls consultation order. The computation is a PURE function of
 * (request, rules, now): identical inputs produce bit-identical output
 * (no Date construction, no iteration over unordered structures, no
 * locale-sensitive formatting).
 *
 * §505 SEPARATION: this engine has no rights vocabulary and no quality
 * vocabulary — a policy verdict is orthogonal to a rights verdict
 * (@mos/rights' authority) and to a quality verdict (the Lab/Studio
 * evaluators' domain).
 */

import type {
  PolicyActionDescriptor,
  PolicyConstraintOutcome,
  PolicyEvaluationRequest,
  PolicyRuleConsultation,
  PolicyScopeMatch,
  PolicyVerdict,
} from "../contracts/policy-evaluation.js";
import type { PolicyConstraint, PolicyRule } from "../contracts/policy-rule.js";

/** The pure computation result: consultations + verdict. */
export interface PolicyEvaluationComputation {
  readonly consultations: readonly PolicyRuleConsultation[];
  readonly verdict: PolicyVerdict;
}

// ---------------------------------------------------------------------------
// Constraint evaluation (pure, fail-closed on missing context)
// ---------------------------------------------------------------------------

/** The action kinds a descriptor includes (simple actions: their own kind). */
function includedKinds(action: PolicyActionDescriptor): readonly string[] {
  return action.includedActionKinds ?? [action.actionKind];
}

/**
 * Evaluates ONE constraint against the descriptor. Missing context data
 * (no declared spend / deadline / modalities) is a VIOLATION — a bound
 * cannot be verified without the data, and policy never passes silently.
 */
export function evaluateConstraint(
  constraint: PolicyConstraint,
  action: PolicyActionDescriptor,
  now: string,
): PolicyConstraintOutcome {
  switch (constraint.kind) {
    case "action-kind-allowlist": {
      const offenders = includedKinds(action).filter(
        (kind) => !constraint.allowedActionKinds.includes(kind as never),
      );
      return offenders.length === 0
        ? {
            constraint,
            satisfied: true,
            detail: `all included action kinds within the allowlist [${constraint.allowedActionKinds.join(", ")}]`,
          }
        : {
            constraint,
            satisfied: false,
            detail: `included action kind(s) [${offenders.join(", ")}] outside the allowlist [${constraint.allowedActionKinds.join(", ")}]`,
          };
    }
    case "action-kind-denylist": {
      const offenders = includedKinds(action).filter((kind) =>
        constraint.disallowedActionKinds.includes(kind as never),
      );
      return offenders.length === 0
        ? {
            constraint,
            satisfied: true,
            detail: `no included action kind in the denylist [${constraint.disallowedActionKinds.join(", ")}]`,
          }
        : {
            constraint,
            satisfied: false,
            detail: `included action kind(s) [${offenders.join(", ")}] in the denylist [${constraint.disallowedActionKinds.join(", ")}]`,
          };
    }
    case "budget-ceiling": {
      const spend = action.declaredSpend;
      if (spend === undefined) {
        return {
          constraint,
          satisfied: false,
          detail: "no declared spend on the action — a budget ceiling cannot be verified (fail closed)",
        };
      }
      if (spend.currency !== constraint.currency) {
        return {
          constraint,
          satisfied: false,
          detail: `declared spend currency ${spend.currency} does not match the ceiling currency ${constraint.currency}`,
        };
      }
      return spend.amount <= constraint.maximum
        ? {
            constraint,
            satisfied: true,
            detail: `declared spend ${spend.amount} ${spend.currency} within the ceiling ${constraint.maximum} ${constraint.currency}`,
          }
        : {
            constraint,
            satisfied: false,
            detail: `declared spend ${spend.amount} ${spend.currency} exceeds the ceiling ${constraint.maximum} ${constraint.currency}`,
          };
    }
    case "deadline-floor": {
      const deadline = action.deadline;
      if (deadline === undefined) {
        return {
          constraint,
          satisfied: false,
          detail: "no declared deadline on the action — a deadline floor cannot be verified (fail closed)",
        };
      }
      const leadMs = Date.parse(deadline) - Date.parse(now);
      if (!Number.isFinite(leadMs)) {
        return {
          constraint,
          satisfied: false,
          detail: "declared deadline is not a parseable ISO-8601 instant (fail closed)",
        };
      }
      return leadMs >= constraint.minimumLeadMs
        ? {
            constraint,
            satisfied: true,
            detail: `deadline lead ${leadMs}ms meets the floor ${constraint.minimumLeadMs}ms`,
          }
        : {
            constraint,
            satisfied: false,
            detail: `deadline lead ${leadMs}ms is below the floor ${constraint.minimumLeadMs}ms`,
          };
    }
    case "modality-restriction": {
      const modalities = action.modalities;
      if (modalities === undefined) {
        return {
          constraint,
          satisfied: false,
          detail: "no declared modalities on the action — a modality restriction cannot be verified (fail closed)",
        };
      }
      const offenders = modalities.filter(
        (modality) => !constraint.allowedModalities.includes(modality),
      );
      return offenders.length === 0
        ? {
            constraint,
            satisfied: true,
            detail: `declared modalities [${modalities.join(", ")}] within the restriction [${constraint.allowedModalities.join(", ")}]`,
          }
        : {
            constraint,
            satisfied: false,
            detail: `declared modality(ies) [${offenders.join(", ")}] outside the restriction [${constraint.allowedModalities.join(", ")}]`,
          };
    }
  }
}

// ---------------------------------------------------------------------------
// Scope matching (pure)
// ---------------------------------------------------------------------------

/** Computes the three scope-match facets of one rule against the request. */
export function matchScope(
  rule: PolicyRule,
  request: PolicyEvaluationRequest,
): PolicyScopeMatch {
  const action = request.action;
  const sameTenant = (rule.scope.tenantId as string) === (request.scope.tenantId as string);
  const actionKindCovered = rule.declaredScope.actionKinds.includes(action.actionKind);
  const subjectCovered =
    rule.declaredScope.subjectRefs.length === 0 ||
    rule.declaredScope.subjectRefs.includes(action.subjectRef);
  const actorCovered =
    rule.declaredScope.actorRefs.length === 0 ||
    rule.declaredScope.actorRefs.includes(request.actor);
  return { sameTenant, actionKindCovered, subjectCovered, actorCovered };
}

// ---------------------------------------------------------------------------
// The computation (pure, deterministic precedence)
// ---------------------------------------------------------------------------

/**
 * Computes one policy evaluation. `rules` MUST be aligned with
 * `request.policy` (same length, same order — the adapter's resolution
 * step guarantees this before calling). `now` is the adapter's clock
 * instant (ISO-8601), used ONLY by deadline-floor constraints and
 * recorded on the evaluation record by the adapter.
 */
export function computePolicyEvaluation(
  request: PolicyEvaluationRequest,
  rules: readonly PolicyRule[],
  now: string,
): PolicyEvaluationComputation {
  const consultations: PolicyRuleConsultation[] = rules.map((rule, index) => {
    const scopeMatch = matchScope(rule, request);
    const matched =
      scopeMatch.sameTenant &&
      scopeMatch.actionKindCovered &&
      scopeMatch.subjectCovered &&
      scopeMatch.actorCovered;
    const constraintOutcomes = rule.constraints.map((constraint) =>
      evaluateConstraint(constraint, request.action, now),
    );
    const allConstraintsSatisfied = constraintOutcomes.every((outcome) => outcome.satisfied);
    return {
      ref: request.policy[index] as PolicyRuleConsultation["ref"],
      matched,
      scopeMatch,
      constraintOutcomes: Object.freeze(constraintOutcomes),
      allConstraintsSatisfied,
      effect: rule.effect,
      approverRole: rule.approverRole,
      rationale: rule.rationale,
    };
  });
  Object.freeze(consultations);

  const matched = consultations.filter((consultation) => consultation.matched);

  // (5) FAIL CLOSED: no applicable rule — never a silent allow.
  if (matched.length === 0) {
    return {
      consultations,
      verdict: {
        outcome: "insufficient-policy",
        consulted: Object.freeze(request.policy.map((ref) => ({ ...ref }))),
      },
    };
  }

  // (1) Explicit prohibitions first: a matched deny-effect rule whose
  // constraints are all satisfied denies the action.
  const deniedByEffect = matched.find(
    (consultation) => consultation.effect === "deny" && consultation.allConstraintsSatisfied,
  );
  if (deniedByEffect !== undefined) {
    return {
      consultations,
      verdict: {
        outcome: "denied",
        deniedBy: {
          rule: { ...deniedByEffect.ref },
          violatedConstraint: null,
          deniedByEffect: true,
          rationale: deniedByEffect.rationale,
          detail: `denied by the deny-effect rule ${deniedByEffect.ref.id}@v${deniedByEffect.ref.version} (${deniedByEffect.rationale})`,
        },
      },
    };
  }

  // (2) Bounds are bounds: any matched rule with a violated constraint
  // denies the action citing (rule, constraint).
  for (const consultation of matched) {
    const violated = consultation.constraintOutcomes.find((outcome) => !outcome.satisfied);
    if (violated !== undefined) {
      return {
        consultations,
        verdict: {
          outcome: "denied",
          deniedBy: {
            rule: { ...consultation.ref },
            violatedConstraint: violated.constraint,
            deniedByEffect: false,
            rationale: consultation.rationale,
            detail: `denied by rule ${consultation.ref.id}@v${consultation.ref.version} constraint ${violated.constraint.kind}: ${violated.detail}`,
          },
        },
      };
    }
  }

  // (3) Approval-required: name the approver role.
  const approval = matched.find(
    (consultation) =>
      consultation.effect === "require-approval" && consultation.allConstraintsSatisfied,
  );
  if (approval !== undefined) {
    return {
      consultations,
      verdict: {
        outcome: "approval-required",
        byRule: { ...approval.ref },
        approverRole: approval.approverRole ?? "unknown-approver-role",
        rationale: approval.rationale,
      },
    };
  }

  // (4) Allowed: cite the first matched allow-effect rule.
  const allowed = matched.find(
    (consultation) =>
      consultation.effect === "allow" && consultation.allConstraintsSatisfied,
  );
  if (allowed !== undefined) {
    return {
      consultations,
      verdict: {
        outcome: "allowed",
        byRule: { ...allowed.ref },
        rationale: allowed.rationale,
      },
    };
  }

  // Unreachable: after (1)/(2) every matched rule is fully satisfied and
  // partitioned by effect into deny/approval/allow — one of (1)/(3)/(4)
  // fired. Keep the fail-closed answer anyway (never a silent allow).
  return {
    consultations,
    verdict: {
      outcome: "insufficient-policy",
      consulted: Object.freeze(request.policy.map((ref) => ({ ...ref }))),
    },
  };
}
