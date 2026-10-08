/**
 * In-memory OrganizationRegistry adapter (AGT-003).
 *
 * Working adapter (not a skeleton): tenant-scoped registration with full
 * organization validation (fail-closed, all named reasons at once), immutable
 * frozen records, version history preserved and resolvable per tenant,
 * cross-tenant reads fail closed without existence leaks, topology queries
 * (neighbors + delegation chains) over the resolved version. Persistence
 * adapters arrive with the persistence wave; the port is unchanged.
 */

import type { TenantScope, Version } from "@mos/contracts";

import type { AgentOrganizationId } from "../domain/ids.js";

import {
  AgentOrganizationRegistrationConflictError,
  InvalidAgentOrganizationError,
  UnknownAgentOrganizationError,
  UnknownOrganizationNodeError,
} from "../errors.js";
import {
  organizationDelegationChain,
  organizationNeighbors,
  organizationRejectionReasons,
} from "../domain/organization.js";
import type { AgentOrganizationRecord, OrganizationEdge } from "../domain/organization.js";
import type { AgentBodyRegistryPort } from "../ports/agent-body-registry.port.js";
import type { OrganizationRegistryPort } from "../ports/organization-registry.port.js";

/** Options for the in-memory organization registry. */
export interface InMemoryOrganizationRegistryOptions {
  /**
   * The agent body registry used to resolve node body references during
   * organization validation (fail-closed: nodes referencing unknown bodies
   * are rejected). Required — organizations are validated against real
   * bodies, never trustingly.
   */
  readonly bodyRegistry: AgentBodyRegistryPort;
  /** Initial records to register (each under its own record tenantId). */
  readonly initial?: readonly AgentOrganizationRecord[];
}

/**
 * Clone-then-deep-freeze (W9-B ownership discipline, the W4-B/W8-A
 * pattern): the registry stores a PRIVATE structural copy. Before this
 * fix, nodes/edges/modelAssignments were copied per-item but the nested
 * POLICY objects (memoryPolicy, budgetPolicy with its organization/
 * perNode budgets, terminationPolicy) were embedded by reference —
 * mutating the caller's policy objects after registration rewrote the
 * STORED organization record in place (the W5-A/W6-A nested-freeze
 * defect class). The private clone also means the caller's objects are
 * never frozen in place.
 */
function freezeOrganization(organization: AgentOrganizationRecord): AgentOrganizationRecord {
  const clone = structuredClone(organization);
  const deepFreeze = (value: unknown): void => {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
      Object.freeze(value);
    }
  };
  deepFreeze(clone);
  return clone as AgentOrganizationRecord;
}

/**
 * Creates an in-memory {@link OrganizationRegistryPort} adapter.
 */
export function createInMemoryOrganizationRegistry(
  options: InMemoryOrganizationRegistryOptions,
): OrganizationRegistryPort {
  /** organizationId (string key) → tenantId → version → frozen record. */
  const byId = new Map<string, Map<string, Map<number, AgentOrganizationRecord>>>();
  /** organizationId (string key) → owning tenantId. */
  const ownerTenant = new Map<string, string>();
  const insertionOrder = new Map<string, AgentOrganizationId[]>();

  function tenantsOf(organizationId: AgentOrganizationId): Map<string, Map<number, AgentOrganizationRecord>> {
    return byId.get(organizationId as string) ?? new Map();
  }

  function versionsForTenant(
    scope: TenantScope,
    organizationId: AgentOrganizationId,
  ): Map<number, AgentOrganizationRecord> {
    return tenantsOf(organizationId).get(scope.tenantId as string) ?? new Map();
  }

  function resolve(
    scope: TenantScope,
    organizationId: AgentOrganizationId,
    version?: Version,
  ): AgentOrganizationRecord {
    const versions = versionsForTenant(scope, organizationId);
    if (versions.size === 0) {
      throw new UnknownAgentOrganizationError(
        organizationId as string,
        version as number | undefined,
      );
    }
    if (version === undefined) {
      const latest = Math.max(...versions.keys());
      return versions.get(latest) as AgentOrganizationRecord;
    }
    const record = versions.get(version as number);
    if (record === undefined) {
      throw new UnknownAgentOrganizationError(organizationId as string, version as number);
    }
    return record;
  }

  function requireNode(
    organization: AgentOrganizationRecord,
    nodeId: string,
  ): void {
    if (!organization.nodes.some((node) => node.nodeId === nodeId)) {
      throw new UnknownOrganizationNodeError(organization.id as string, nodeId);
    }
  }

  const registry: OrganizationRegistryPort = {
    registerOrganization(scope: TenantScope, organization: AgentOrganizationRecord): void {
      const reasons = organizationRejectionReasons(organization, options.bodyRegistry);
      if (reasons.length > 0) {
        throw new InvalidAgentOrganizationError(reasons);
      }
      const tenantKey = scope.tenantId as string;
      if (tenantKey !== (organization.tenantId as string)) {
        throw new InvalidAgentOrganizationError([
          {
            code: "invalid-tenant-scope",
            detail: `organization tenantId ${organization.tenantId as string} does not match the registering scope tenant ${tenantKey}`,
          },
        ]);
      }
      const idKey = organization.id as string;
      const owningTenant = ownerTenant.get(idKey);
      if (owningTenant !== undefined && owningTenant !== tenantKey) {
        // An organization id belongs to exactly one tenant: fail closed,
        // without leaking the other tenant's registration state.
        throw new UnknownAgentOrganizationError(idKey, organization.version as number);
      }
      let tenants = byId.get(idKey);
      if (tenants === undefined) {
        tenants = new Map<string, Map<number, AgentOrganizationRecord>>();
        byId.set(idKey, tenants);
        ownerTenant.set(idKey, tenantKey);
      }
      let versions = tenants.get(tenantKey);
      if (versions === undefined) {
        versions = new Map<number, AgentOrganizationRecord>();
        tenants.set(tenantKey, versions);
      }
      const versionKey = organization.version as number;
      if (versions.has(versionKey)) {
        throw new AgentOrganizationRegistrationConflictError(
          "agent-organization-already-registered",
          `Agent organization ${idKey} version ${versionKey} is already registered; organization versions are immutable — register a new version instead`,
          idKey,
          versionKey,
          versionKey,
        );
      }
      const latest = versions.size > 0 ? Math.max(...versions.keys()) : 0;
      if (versionKey <= latest) {
        throw new AgentOrganizationRegistrationConflictError(
          "agent-organization-version-not-monotonic",
          `Agent organization ${idKey} version ${versionKey} does not append monotonically (latest registered version is ${latest})`,
          idKey,
          versionKey,
          latest,
        );
      }
      versions.set(versionKey, freezeOrganization(organization));
      const order = insertionOrder.get(tenantKey) ?? [];
      if (!order.some((id) => (id as string) === idKey)) {
        order.push(organization.id);
      }
      insertionOrder.set(tenantKey, order);
    },

    getOrganization(
      scope: TenantScope,
      organizationId: AgentOrganizationId,
      version?: Version,
    ): AgentOrganizationRecord | undefined {
      const versions = versionsForTenant(scope, organizationId);
      if (versions.size === 0) {
        return undefined;
      }
      if (version === undefined) {
        const latest = Math.max(...versions.keys());
        return versions.get(latest);
      }
      return versions.get(version as number);
    },

    requireOrganization(
      scope: TenantScope,
      organizationId: AgentOrganizationId,
      version?: Version,
    ): AgentOrganizationRecord {
      return resolve(scope, organizationId, version);
    },

    listVersions(scope: TenantScope, organizationId: AgentOrganizationId): readonly Version[] {
      return [...versionsForTenant(scope, organizationId).keys()].sort((a, b) => a - b) as Version[];
    },

    listOrganizationIds(scope: TenantScope): readonly AgentOrganizationId[] {
      return insertionOrder.get(scope.tenantId as string) ?? [];
    },

    neighbors(
      scope: TenantScope,
      organizationId: AgentOrganizationId,
      nodeId: string,
      version?: Version,
    ): readonly OrganizationEdge[] {
      const organization = resolve(scope, organizationId, version);
      requireNode(organization, nodeId);
      return organizationNeighbors(organization, nodeId);
    },

    delegationChain(
      scope: TenantScope,
      organizationId: AgentOrganizationId,
      fromNodeId: string,
      version?: Version,
    ): readonly string[] {
      const organization = resolve(scope, organizationId, version);
      requireNode(organization, fromNodeId);
      return organizationDelegationChain(organization, fromNodeId);
    },
  };

  for (const organization of options.initial ?? []) {
    registry.registerOrganization(
      { tenantId: organization.tenantId },
      organization,
    );
  }

  return registry;
}
