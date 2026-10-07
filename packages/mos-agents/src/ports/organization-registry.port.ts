/**
 * OrganizationRegistry port (AGT-003).
 *
 * The registry of versioned, immutable, tenant-scoped agent organizations
 * (architecture §5/§23): a Studio session loads an EXACT version explicitly
 * supplied by the caller; organizations are searchable objects with every
 * §23 search dimension as explicit record data.
 *
 * Registry semantics:
 * - records follow the frozen AgentOrganization contract (required fields
 *   validated at registration, fail-closed) plus full organization
 *   validation (node body refs resolve, edge endpoints exist, typed edge
 *   kinds, acyclic delegation/reporting, explicit per-node model
 *   assignments, consistent budgets) — invalid organizations are rejected
 *   with EVERY named reason at once;
 * - organization versions are immutable: registering an existing
 *   id+version again is an error, and new versions must append
 *   monotonically; every registered version stays resolvable;
 * - mutating operations carry an explicit {@link TenantScope} — there is no
 *   ambient tenant (architecture policy
 *   `requireTenantScopeOnMutableArtifacts`); cross-tenant reads fail closed
 *   (`undefined` / typed unknown-organization error — no existence leaks);
 * - topology queries: neighbors (all edges touching a node) and delegation
 *   chains (the linear delegates-to chain from a node).
 */

import type { TenantScope, Version } from "@mos/contracts";

import type { AgentOrganizationId } from "../domain/ids.js";

import type { AgentOrganizationRecord, OrganizationEdge } from "../domain/organization.js";

/** Registry of versioned, immutable agent organizations. 7 public methods. */
export interface OrganizationRegistryPort {
  /**
   * Registers one immutable organization version under a tenant scope.
   * Fail-closed: the record must carry every required AgentOrganization
   * field (frozen YAML manifest) and pass organization validation; the
   * record's tenantId must match the scope. Duplicate id+version,
   * non-monotonic versions and cross-tenant registration are rejected with
   * typed errors. Invalid organizations are rejected with EVERY named
   * reason ({@link ../errors.js!InvalidAgentOrganizationError}).
   */
  registerOrganization(scope: TenantScope, organization: AgentOrganizationRecord): void;

  /**
   * Resolves one exact version (or the latest when `version` is omitted)
   * for the scope's tenant, or `undefined` when unknown or owned by another
   * tenant (fail-closed, no existence leaks).
   */
  getOrganization(
    scope: TenantScope,
    organizationId: AgentOrganizationId,
    version?: Version,
  ): AgentOrganizationRecord | undefined;

  /**
   * Fail-closed resolution: like {@link getOrganization} but throws
   * {@link ../errors.js!UnknownAgentOrganizationError} naming the
   * organization when unknown or cross-tenant.
   */
  requireOrganization(
    scope: TenantScope,
    organizationId: AgentOrganizationId,
    version?: Version,
  ): AgentOrganizationRecord;

  /** All registered versions of one organization for the tenant, ascending; empty when unknown. */
  listVersions(scope: TenantScope, organizationId: AgentOrganizationId): readonly Version[];

  /** All organization ids registered for the tenant (insertion order). */
  listOrganizationIds(scope: TenantScope): readonly AgentOrganizationId[];

  /**
   * Topology query: all edges touching `nodeId` (either endpoint), in
   * declaration order, of the resolved organization version (or the
   * latest). Throws unknown-organization / unknown-node fail-closed.
   */
  neighbors(
    scope: TenantScope,
    organizationId: AgentOrganizationId,
    nodeId: string,
    version?: Version,
  ): readonly OrganizationEdge[];

  /**
   * Topology query: the delegation chain (node ids reachable by following
   * `delegates-to` edges forward, starting with `nodeId`) of the resolved
   * organization version (or the latest). Well-defined and acyclic by
   * construction (validation rejects delegation cycles and multi-out
   * delegation). Throws unknown-organization / unknown-node fail-closed.
   */
  delegationChain(
    scope: TenantScope,
    organizationId: AgentOrganizationId,
    fromNodeId: string,
    version?: Version,
  ): readonly string[];
}
