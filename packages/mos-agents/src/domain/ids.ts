/**
 * Derived identifier aliases (AGT-001 / AGT-003).
 *
 * `@mos/contracts` defines `AgentBodyId` and `AgentOrganizationId` branded
 * types in its value-types module but does not re-export them from its
 * public index (its index is the frozen CORE-001 surface; editing it is
 * outside this package's ownership). These aliases DERIVE the exact same
 * types from the contract record shapes — zero duplication, identical
 * brands.
 */

import type { AgentBody, AgentOrganization } from "@mos/contracts";

/** Identifier of an {@link AgentBody} record (derived from the contract). */
export type AgentBodyId = AgentBody["id"];

/** Identifier of an {@link AgentOrganization} record (derived from the contract). */
export type AgentOrganizationId = AgentOrganization["id"];
