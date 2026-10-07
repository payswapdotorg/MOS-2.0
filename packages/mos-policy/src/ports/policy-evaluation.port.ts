/**
 * PolicyEvaluationPort (POLICY-001) — the policy evaluation surface.
 *
 * `evaluate(policy refs, action descriptor)` → ONE immutable
 * {@link PolicyEvaluationRecord} whose verdict is:
 * - `allowed` (citing the rule whose allow effect permitted the action);
 * - `denied` (naming the RULE and — when constraint-driven — the exact
 *   CONSTRAINT declaration that denied it);
 * - `approval-required` (naming the approver role that must approve);
 * - `insufficient-policy` — NO cited rule matched the action: FAIL
 *   CLOSED, never a silent allow (there is no permissive default; the
 *   explicit-grants discipline of @mos/rights mirrored for policy).
 *
 * Verdicts are immutable because records are: every evaluation is
 * RECORDED append-only with full context — the request frame, the action
 * echo, which rules were consulted, which matched (scope-match facets),
 * the per-constraint outcomes and §30-style timing fields.
 *
 * CALLER ERRORS (no record): a malformed request or an unresolvable
 * exact-version citation (unknown / cross-tenant ≡ unknown, §31) is a
 * typed `PolicyError` thrown at the boundary — nothing attributable
 * happened, so nothing is appended.
 *
 * Method budget: 3 (≤ 12).
 */

import type { TenantScope } from "@mos/contracts";

import type { PolicyEvaluationId } from "../contracts/ids.js";
import type {
  PolicyEvaluationRecord,
  PolicyEvaluationRecordFilter,
  PolicyEvaluationRequest,
} from "../contracts/policy-evaluation.js";

/** The policy evaluation port. 3 public methods (budget: 12). */
export interface PolicyEvaluationPort {
  /**
   * Evaluates one policy request — consults the cited rules (exact
   * versions, in citation order), matches them against the declared
   * action descriptor, evaluates every declared constraint, applies the
   * documented deterministic precedence and RETURNS the immutable
   * evaluation record (verdict + full context), which is simultaneously
   * appended to the tenant's evaluation audit log.
   */
  evaluate(request: PolicyEvaluationRequest): PolicyEvaluationRecord;

  /**
   * Gets ONE recorded evaluation by id. Returns `null` when the id is
   * unknown OR belongs to another tenant (§31 — cross-tenant ≡ unknown,
   * no existence leaks).
   */
  getEvaluationRecord(scope: TenantScope, id: PolicyEvaluationId): PolicyEvaluationRecord | null;

  /**
   * Lists the tenant's evaluation audit log (ascending time order, then
   * id), optionally filtered by action kind / subject / actor / cited
   * rule. Cross-tenant scopes list empty (no existence leaks).
   */
  listEvaluationRecords(
    scope: TenantScope,
    filter?: PolicyEvaluationRecordFilter,
  ): readonly PolicyEvaluationRecord[];
}
