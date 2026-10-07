/**
 * AvailabilityCapability — layer 4 of the connector provider contract
 * (INTEG-001): the EXPLICIT capability instance.
 *
 * Which capability a provider implementation makes available, AT WHICH
 * CAPABILITY VERSION, with what declared constraints. Capability refs
 * resolve through the `@mos/capabilities` vocabulary (the registry
 * dependency of this module): registering an availability whose
 * (capabilityId, capabilityVersion) does not resolve in the capability
 * registry is rejected fail-closed.
 *
 * EXPLICITNESS DISCIPLINE (test-pinned): an instance without a capability
 * record provides NOTHING. Availability is derived ONLY from these explicit
 * records — never from the definition's declared capability surface (a
 * "supported" declaration creates no availability), never by parity
 * assumption, never by default. Registering capability availability is an
 * affirmative act with a versioned, auditable record.
 */

import type { CapabilityId, TenantScope, Timestamp, Version } from "@mos/contracts";

import type { AvailabilityCapabilityId, ProviderImplementationId } from "./ids.js";

// ---------------------------------------------------------------------------
// Declared constraints
// ---------------------------------------------------------------------------

/**
 * One declared constraint on an availability: a generic kind string (DATA —
 * e.g. a rate-limit or data-residency posture) plus its parameters.
 * Constraint kinds are provider/tenant-authored data; the contract never
 * interprets them, it only carries them and surfaces them as warnings on
 * §30 interaction records so callers always see the declared constraints
 * that applied.
 */
export interface AvailabilityConstraint {
  /** Constraint kind (data, e.g. "rate-limit", "quota", "region"). */
  readonly kind: string;
  /** Constraint parameters (opaque JSON object payload). */
  readonly parameters: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// AvailabilityCapability (layer 4)
// ---------------------------------------------------------------------------

/**
 * Layer 4 — the EXPLICIT capability instance: implementation × capability
 * (at an exact capability version) × declared constraints.
 *
 * The availability binds to the implementation IDENTITY (stable across its
 * record versions): capability surfaces do not flip with status
 * corrections; the implementation status layer governs whether a call
 * should proceed. Versioned append-only: registering with an existing id
 * (same tenant) appends the next version — the correction path for
 * constraint changes; prior versions stay resolvable.
 */
export interface AvailabilityCapability {
  /** Registry record identity (stable across versions). */
  readonly id: AvailabilityCapabilityId;
  /** Monotonic record version (append-only corrections). */
  readonly version: Version;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The implementation that provides the capability. */
  readonly implementationId: ProviderImplementationId;
  /** WHICH capability is provided (resolves via @mos/capabilities). */
  readonly capabilityId: CapabilityId;
  /** The EXACT capability version provided (explicit, no drift). */
  readonly capabilityVersion: Version;
  /** Declared constraints on this availability (may be empty = unconstrained). */
  readonly constraints: readonly AvailabilityConstraint[];
  /** When this record version was created. */
  readonly createdAt: Timestamp;
}

/** Input for registering an availability capability record (layer 4). */
export interface RegisterAvailabilityCapabilityInput {
  /** Optional record id (minted when omitted). */
  readonly id?: AvailabilityCapabilityId;
  readonly scope: TenantScope;
  readonly implementationId: ProviderImplementationId;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly constraints: readonly AvailabilityConstraint[];
}
