/**
 * Branded identifier types for the policy module (POLICY-001).
 *
 * The cross-authority vocabulary (TenantId, WorkspaceId, Version,
 * IdentityRef, Timestamp, Milliseconds, MoneyAmount, Branded, ...) is
 * imported from `@mos/contracts` — the canonical CORE-001 authority. The
 * policy-owned identifiers below follow the documented W2-A/rights
 * reconciliation pattern:
 *
 * - `PolicyRuleId` is an ALIAS of the canonical `PolicyRef` brand (the
 *   stable way to reference a policy rule IS its identifier): a
 *   `Transform.policyRequirements` entry or a
 *   `RealExperimentBinding.policyRef` value from ANY package resolves
 *   directly through `PolicyRegistryPort.getRule` with no adapter mapping.
 * - `PolicyEvaluationId` is policy-owned (§30 request id of one recorded
 *   evaluation) and has no canonical form yet; when the core-contract
 *   vocabulary grows one, sibling packages reconcile by importing from
 *   there (the documented W2 pattern).
 *
 * All brands are compile-time only: at runtime every identifier is the
 * plain underlying string.
 */

import type { Branded, PolicyRef } from "@mos/contracts";

/**
 * Identifier of a policy RULE — the rule's STABLE identity across its
 * append-only version chain (an alias of the canonical `PolicyRef`: the
 * reference carried by `Transform.policyRequirements` and
 * `RealExperimentBinding.policyRef` names exactly this identity).
 */
export type PolicyRuleId = PolicyRef;

/** Re-exported for convenience of downstream contract definitions. */
export type { PolicyRef };

/**
 * Identifier of ONE recorded policy evaluation (§30 request id — unique
 * within the evaluation audit log of its tenant).
 */
export type PolicyEvaluationId = Branded<string, "PolicyEvaluationId">;
