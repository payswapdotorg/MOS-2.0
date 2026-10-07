/**
 * TransformPawnOrganizationPort (LAB-013) — composition of multiple pawns
 * as an AgentOrganization.
 *
 * The production package COMPOSES the canonical organization record from
 * pawn citations (never re-implements organization semantics — §5 types are
 * reused verbatim) and registers it append-only, tenant-scoped. The
 * pawn-specific discipline (deterministic nodes carry no model assignment,
 * llm-flavored nodes must carry exactly one) is enforced at composition
 * with named rejections.
 *
 * 3 public methods (architecture policy budget: 12).
 */

import type { TenantScope, Version } from "@mos/contracts";

import type { PawnAgentOrganizationId } from "../contracts/pawn-ids.js";
import type {
  ComposeTransformPawnOrganizationInput,
  TransformPawnOrganizationRecord,
} from "../contracts/pawn-organization.js";

/** Pawn organization composition + registry. 3 public methods. */
export interface TransformPawnOrganizationPort {
  /**
   * Composes, validates and registers one pawn organization version
   * (append-only: re-registering an existing id appends version + 1; prior
   * versions stay resolvable bit-for-bit). Fail-closed with EVERY named
   * rejection reason at once (`invalid-pawn-organization`).
   */
  registerPawnOrganization(
    scope: TenantScope,
    input: ComposeTransformPawnOrganizationInput,
  ): TransformPawnOrganizationRecord;

  /**
   * Resolves one organization version (or the latest when `version` is
   * omitted), or `undefined` when unknown or owned by another tenant
   * (fail-closed, no existence leaks).
   */
  getPawnOrganization(
    scope: TenantScope,
    organizationId: PawnAgentOrganizationId,
    version?: Version,
  ): TransformPawnOrganizationRecord | undefined;

  /** All latest pawn organizations for the tenant (registration order). */
  listPawnOrganizations(scope: TenantScope): readonly TransformPawnOrganizationRecord[];
}
