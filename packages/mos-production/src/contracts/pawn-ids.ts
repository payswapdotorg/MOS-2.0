/**
 * Production-owned identifiers (LAB-013).
 *
 * `AgentBodyId` / `AgentOrganizationId` are derived from the frozen
 * @mos/contracts record shapes exactly as `@mos/agents` derives them (the
 * contracts value-types module defines the brands but its frozen public
 * index does not re-export them) — identical brands, zero duplication.
 *
 * `PawnInstanceId` is deliberately UNBRANDED: the real
 * `@mos/agent-runtime` instance ids are branded with an agent-runtime-local
 * symbol, and the agent-stack seams of this package are mirrored so the
 * REAL registries satisfy them with ZERO adapters (compat-pinned) — a
 * locally-branded id would break that assignability. The id is opaque at
 * runtime either way.
 *
 * `PawnExecutionId` is production-owned (execution records are this
 * authority's state) and branded locally.
 */

import type { AgentBody, AgentOrganization } from "@mos/contracts";

/** Identifier of an {@link AgentBody} record (derived from the contract). */
export type PawnAgentBodyId = AgentBody["id"];

/** Identifier of an {@link AgentOrganization} record (derived from the contract). */
export type PawnAgentOrganizationId = AgentOrganization["id"];

/**
 * Opaque identifier of one agent runtime instance. Structurally the
 * `@mos/agent-runtime` instance id (see the file docblock for why it is not
 * locally branded).
 */
export type PawnInstanceId = string;

/** Compile-time nominal brand for production-owned execution ids. */
declare const productionBrand: unique symbol;

/** Identifier of one recorded pawn execution (production-owned). */
export type PawnExecutionId = string & { readonly [productionBrand]: "PawnExecutionId" };
