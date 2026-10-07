/**
 * TransformPawnOrganization composition contracts (LAB-013).
 *
 * Architecture §5/§9 + lock rule 8: pawns use the MOS agent body/instance
 * runtime, and an organization is a graph of agent bodies with
 * communication/delegation edges. A TransformPawnOrganization is an
 * {@link AgentOrganization} whose nodes are TRANSFORM PAWN bodies — this
 * package COMPOSES the canonical organization record from pawn citations
 * (reusing the @mos/contracts organization types; it never re-implements
 * organization semantics).
 *
 * Pawn-specific discipline (fail-closed, test-pinned):
 * - every node cites a REGISTERED pawn kind (resolved to the pawn body);
 * - DETERMINISTIC pawn nodes carry NO model assignment — they never bind a
 *   model (§9; an assignment on a deterministic node is a typed rejection);
 * - LLM-FLAVORED pawn nodes MUST carry exactly one model assignment (the
 *   assignment is DATA — the model-runtime boundary resolves it at binding,
 *   lock rule 9 — but an unassigned llm node is a typed rejection).
 */

import type {
  AgentOrganizationEdge,
  AgentOrganizationNode,
  BudgetPolicy,
  MemoryPolicy,
  ModelAssignment,
  ModelRef,
  TerminationPolicy,
  TenantId,
  TenantScope,
  Version,
} from "@mos/contracts";

import type { TransformPawnKind } from "./pawn-role.js";
import type { PawnAgentOrganizationId } from "./pawn-ids.js";

// ---------------------------------------------------------------------------
// Composition input
// ---------------------------------------------------------------------------

/** The typed organization edge vocabulary (§5 communication/delegation). */
export type PawnOrganizationEdgeKind = "delegates-to" | "communicates-with" | "reports-to";

/** One node of the composed organization: a named slot for one pawn kind. */
export interface TransformPawnOrganizationNodeInput {
  readonly nodeId: string;
  readonly pawnKind: TransformPawnKind;
}

/** One typed edge between two nodes. */
export interface TransformPawnOrganizationEdgeInput {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: PawnOrganizationEdgeKind;
}

/** One model assignment input (LLM-flavored nodes only). */
export interface TransformPawnModelAssignmentInput {
  readonly nodeId: string;
  readonly modelRef: ModelRef;
}

/** Input to {@link ../ports/pawn-organization.port.js!TransformPawnOrganizationPort.registerPawnOrganization}. */
export interface ComposeTransformPawnOrganizationInput {
  readonly scope: TenantScope;
  readonly organizationId: PawnAgentOrganizationId;
  readonly nodes: readonly TransformPawnOrganizationNodeInput[];
  readonly edges?: readonly TransformPawnOrganizationEdgeInput[];
  readonly modelAssignments?: readonly TransformPawnModelAssignmentInput[];
  readonly memoryPolicy?: MemoryPolicy;
  readonly budgetPolicy?: BudgetPolicy;
  readonly terminationPolicy?: TerminationPolicy;
  /** Evaluator of the organization (non-blank ref; §5 organization contract). */
  readonly evaluator: string;
}

// ---------------------------------------------------------------------------
// The composed record
// ---------------------------------------------------------------------------

/**
 * One composed transform pawn organization: the canonical
 * {@link AgentOrganization} field set plus `tenantId` (tenant-scoped,
 * versioned, append-only — the same shape the `@mos/agents` organization
 * registry records). `evaluator` is the unbranded ref string exactly as the
 * agents registry record types it.
 */
export interface TransformPawnOrganizationRecord {
  readonly id: PawnAgentOrganizationId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly nodes: readonly AgentOrganizationNode[];
  readonly edges: readonly AgentOrganizationEdge[];
  readonly modelAssignments: readonly ModelAssignment[];
  readonly memoryPolicy: MemoryPolicy;
  readonly budgetPolicy: BudgetPolicy;
  readonly terminationPolicy: TerminationPolicy;
  readonly evaluator: string;
}

/** Named rejection reason of a pawn-organization composition. */
export interface PawnOrganizationRejectionReason {
  readonly code:
    | "empty-organization"
    | "duplicate-node-id"
    | "unknown-pawn-kind"
    | "unknown-edge-node"
    | "self-referencing-edge"
    | "invalid-edge-kind"
    | "delegation-cycle"
    | "model-assignment-for-deterministic-pawn"
    | "missing-model-assignment"
    | "duplicate-model-assignment"
    | "invalid-memory-policy"
    | "invalid-budget-policy"
    | "invalid-termination-policy"
    | "invalid-evaluator"
    | "invalid-tenant-scope"
    | "duplicate-organization-version";
  readonly detail: string;
}
