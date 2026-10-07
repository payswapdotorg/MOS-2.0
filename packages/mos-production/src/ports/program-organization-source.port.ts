/**
 * Organization source seam (LAB-016) — the LAB-010-style organization
 * descriptors the program search's organization dimension varies over.
 *
 * The frozen module registry does NOT make `lab` or `agents` a production
 * dependency, so the organization vocabulary arrives through @mos/contracts
 * types (the canonical organization field set) plus this narrow seam.
 *
 * The descriptor mirrors the W7-B `TransformPawnOrganizationRecord` shape
 * (id/version/tenantId/nodes/edges/modelAssignments/memoryPolicy/
 * budgetPolicy/terminationPolicy/evaluator — `evaluator` unbranded exactly
 * as the @mos/agents registry record types it) so the REAL
 * `@mos/agents` organization registry records satisfy it DIRECTLY, and
 * LAB-010's searched/generated descriptors can be registered back into the
 * agents registry and then listed through this seam (the W5-B follow-up
 * wiring). The two DECLARED §23 features the canonical record cannot
 * express (critics, execution ordering) are declared alongside, exactly as
 * LAB-010's `DeclaredOrganizationFeatures` carries them.
 *
 * The in-memory double (adapters/in-memory-program-organization-source.ts)
 * is a DISCLOSED double. Listing is tenant-scoped: organizations of other
 * tenants are invisible (cross-tenant and unknown are indistinguishable).
 */

import type {
  AgentOrganizationEdge,
  AgentOrganizationNode,
  BudgetPolicy,
  MemoryPolicy,
  ModelAssignment,
  TenantId,
  TenantScope,
  TerminationPolicy,
  Version,
} from "@mos/contracts";

/** How the organization's nodes execute (§23 declared feature, LAB-010 vocabulary). */
export type ProgramOrganizationExecutionOrdering = "sequential" | "parallel" | "staged";

/**
 * One organization descriptor: the canonical organization field set (the
 * shape the @mos/agents registry records — nodes cite agent bodies, edges
 * are typed, model assignments are DATA refs resolved only at the single
 * model-runtime boundary) plus the two declared §23 features.
 */
export interface ProgramOrganizationDescriptor {
  readonly id: string;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly nodes: readonly AgentOrganizationNode[];
  readonly edges: readonly AgentOrganizationEdge[];
  readonly modelAssignments: readonly ModelAssignment[];
  readonly memoryPolicy: MemoryPolicy;
  readonly budgetPolicy: BudgetPolicy;
  readonly terminationPolicy: TerminationPolicy;
  /** Unbranded evaluator ref string, exactly as the agents registry types it. */
  readonly evaluator: string;
  /** §23 critics: the node ids acting as critics (validated ⊆ node ids). */
  readonly criticNodeIds: readonly string[];
  /** §23 execution ordering mode. */
  readonly executionOrdering: ProgramOrganizationExecutionOrdering;
}

/** Read surface over the organization descriptor vocabulary (LAB-010-style). */
export interface ProgramOrganizationSourcePort {
  /**
   * The organization descriptors visible in this tenant scope (insertion
   * order; cross-tenant and unknown are indistinguishable — invisible).
   */
  listOrganizations(scope: TenantScope): Promise<readonly ProgramOrganizationDescriptor[]>;
}
