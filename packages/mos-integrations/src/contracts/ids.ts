/**
 * Locally-owned branded identifier types for the integrations module
 * (INTEG-001).
 *
 * The cross-authority vocabulary (TenantId, ProviderId, CapabilityId,
 * Version, IdentityRef, AccountRef, EvidenceRef, RightsRef, ...) is imported
 * from `@mos/contracts` — the canonical CORE-001 authority. The identifiers
 * below are INTEGRATIONS-OWNED record identities and handles that have no
 * canonical form yet; when the core-contract vocabulary grows them, sibling
 * packages reconcile by importing from there (the documented W2 pattern).
 *
 * All brands are compile-time only: at runtime every value is the plain
 * underlying string.
 */

import type { Branded } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Record identifiers (one per registry layer)
// ---------------------------------------------------------------------------

/** Identifier of a {@link ProviderDefinition} record (layer 1). */
export type ProviderDefinitionId = Branded<string, "ProviderDefinitionId">;
/** Identifier of a {@link ProviderImplementation} record (layer 2). */
export type ProviderImplementationId = Branded<string, "ProviderImplementationId">;
/** Identifier of a {@link MerchantClientInstance} record (layer 3). */
export type MerchantClientInstanceId = Branded<string, "MerchantClientInstanceId">;
/** Identifier of an {@link AvailabilityCapability} record (layer 4). */
export type AvailabilityCapabilityId = Branded<string, "AvailabilityCapabilityId">;
/** Identifier of one recorded provider interaction (§30 request id). */
export type ProviderInteractionId = Branded<string, "ProviderInteractionId">;

// ---------------------------------------------------------------------------
// Handles (opaque references that resolve at declared seams)
// ---------------------------------------------------------------------------

/**
 * Opaque HANDLE to a credential escrowed at the substrate secret-store seam
 * (`ProviderSecretStorePort`).
 *
 * This is the ONLY credential-related value the integrations control plane
 * ever stores or transports: a reference, never a credential VALUE. The
 * handle is resolved exclusively at the transport boundary (the seam where
 * §31 places credentials — "least-privilege and remain at integration
 * boundaries"); no control-plane API accepts, returns or records a
 * credential value (structurally pinned — see contracts/type-pins.ts).
 */
export type CredentialRef = Branded<string, "CredentialRef">;

/**
 * Opaque HANDLE to a rights context — the explicit rights frame
 * (grants and consent backing an actor) under which a provider interaction
 * is requested. Resolved by the rights gate (`ProviderRightsGatePort`)
 * against the `@mos/rights` vocabulary; the integrations module never
 * interprets the handle itself, it only carries it and fails closed when
 * the gate cannot resolve an adequate grant.
 */
export type RightsContextRef = Branded<string, "RightsContextRef">;
