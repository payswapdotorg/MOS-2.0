import type { IdentityId, TenantId } from '@mos/identity';

/**
 * Branded nominal identifier types for the MOS rights domain (CORE-003).
 *
 * Compile-time-only brands: at runtime every identifier is a plain string.
 * Branding keeps `RightsGrantId`, `ConsentRecordId` and `ProvenanceRecordId`
 * from being mixed up where a plain `string` would compile.
 *
 * The `*Ref` types are the STABLE OPAQUE REFERENCES carried by other core
 * contracts (`Artifact.rightsRef`, `Artifact.provenanceRef`,
 * `HumanProductionTask.rightsConsent`, `RealExperimentBinding.rightsRef`,
 * `Transform.rightsRequirements` — `spec/contracts/core-contracts-v2.0.yaml`).
 * A ref is intentionally an alias of the corresponding record id: the stable
 * way to reference a grant/consent/provenance record IS its identifier, so an
 * `Artifact.rightsRef` resolves directly through `RightsRepository.getRights`.
 */

declare const rightsGrantIdBrand: unique symbol;
declare const consentRecordIdBrand: unique symbol;
declare const provenanceRecordIdBrand: unique symbol;

/** Unique identifier of a rights grant record (also its stable ref form). */
export type RightsGrantId = string & { readonly [rightsGrantIdBrand]: true };

/** Unique identifier of a consent record (also its stable ref form). */
export type ConsentRecordId = string & { readonly [consentRecordIdBrand]: true };

/** Unique identifier of a provenance record (also its stable ref form). */
export type ProvenanceRecordId = string & { readonly [provenanceRecordIdBrand]: true };

/**
 * Stable opaque reference to an explicit rights grant.
 *
 * Carried by `Artifact.rightsRef` (CORE-004), `Transform.rightsRequirements`,
 * `RealExperimentBinding.rightsRef` and `LabScenario`-adjacent contracts.
 * Resolving a `RightsRef` is the ONLY way any consumer may learn which rights
 * exist — see {@link evaluateRights} for the evaluation rule.
 */
export type RightsRef = RightsGrantId;

/**
 * Stable opaque reference to a provenance record.
 *
 * Carried by `Artifact.provenanceRef` (CORE-004): every artifact names the
 * provenance record that describes how it came to exist.
 */
export type ProvenanceRef = ProvenanceRecordId;

/**
 * Stable opaque reference to a consent record.
 *
 * Carried by `HumanProductionTask.rightsConsent` and referenced from
 * `RightsGrant.sourceRefs` when a grant is backed by participant consent.
 */
export type ConsentRef = ConsentRecordId;

/** Re-exported for convenience of downstream contract definitions. */
export type { IdentityId, TenantId };
