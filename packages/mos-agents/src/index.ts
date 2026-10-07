/**
 * Public surface of `@mos/agents` (MOS v2.0 AGT-001 + AGT-003).
 *
 * The AgentBodyRegistry (versioned, immutable agent body contracts with
 * capability-ref validation) and the OrganizationRegistry (tenant-scoped,
 * versioned, immutable agent organizations with typed topology, explicit
 * model assignments, consistent budgets and topology queries).
 *
 * Types are imported from `@mos/contracts` (CORE-001) — the frozen YAML
 * projection is the single contract authority (RECONCILE-B).
 *
 * Export budget: 2 runtime factories + 1 frozen constant
 * (ORGANIZATION_EDGE_KINDS) + 8 error classes — 11 runtime exports, within
 * the architecture policy budget of 12. Port method budget: 5 (body
 * registry) + 7 (organization registry) = 12 public methods, at the policy
 * limit. The pure validation/topology functions stay internal (used by the
 * adapters; the organization port exposes the topology queries).
 */

// ---- Ports ----
export type { CapabilityRefSource, KnownCapability } from "./ports/capability-ref-source.port.js";
export type { AgentBodyRegistryPort } from "./ports/agent-body-registry.port.js";
export type { OrganizationRegistryPort } from "./ports/organization-registry.port.js";

// ---- Derived identifiers ----
// The contracts value-types module defines these branded ids but its frozen
// public index does not re-export them; these aliases derive the exact same
// types from the contract record shapes (zero duplication, identical brands).
export type { AgentBodyId, AgentOrganizationId } from "./domain/ids.js";

// ---- Agent body registry (AGT-001) ----
export type { InMemoryAgentBodyRegistryOptions } from "./adapters/in-memory-agent-body-registry.js";
export { createInMemoryAgentBodyRegistry } from "./adapters/in-memory-agent-body-registry.js";

// ---- Agent organization registry + topology (AGT-003) ----
export type {
  AgentOrganizationRecord,
  OrganizationEdge,
  OrganizationEdgeKind,
  OrganizationMemoryPolicy,
  OrganizationMemorySharing,
  OrganizationNode,
} from "./domain/organization.js";
export { ORGANIZATION_EDGE_KINDS } from "./domain/organization.js";
export type { InMemoryOrganizationRegistryOptions } from "./adapters/in-memory-organization-registry.js";
export { createInMemoryOrganizationRegistry } from "./adapters/in-memory-organization-registry.js";

// ---- Errors ----
export { AgentRegistryError } from "./errors.js";
export type { OrganizationRejectionCode, OrganizationRejectionReason } from "./errors.js";
export {
  AgentBodyRegistrationConflictError,
  InvalidAgentBodyError,
  UnknownAgentBodyError,
} from "./errors.js";
export {
  AgentOrganizationRegistrationConflictError,
  InvalidAgentOrganizationError,
  UnknownAgentOrganizationError,
  UnknownOrganizationNodeError,
} from "./errors.js";
