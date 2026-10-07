import type { IdentityId } from '@mos/identity';
import type { ConsentRef, ProvenanceRef, RightsRef, TenantId } from '@mos/contracts';

/**
 * Branded nominal identifier types for the MOS rights domain (CORE-003).
 *
 * RECONCILED (W2-A / RECONCILE-A): the stable opaque reference types
 * `RightsRef`, `ProvenanceRef` and `ConsentRef` — the vocabulary carried by
 * the frozen core contracts (`Artifact.rightsRef`, `Artifact.provenanceRef`,
 * `HumanProductionTask.rightsConsent`, `RealExperimentBinding.rightsRef`) —
 * are imported from `@mos/contracts` (CORE-001 canonical authority) and
 * re-exported here.
 *
 * The locally-owned record identifiers (`RightsGrantId`,
 * `ConsentRecordId`, `ProvenanceRecordId`) are now ALIASES of the
 * corresponding contracts reference types: the stable way to reference a
 * grant/consent/provenance record IS its identifier, so an
 * `Artifact.rightsRef` value from any package resolves directly through
 * `RightsRepository.getRights` with no adapter mapping. Compile-time-only
 * brands: at runtime every identifier is a plain string.
 */

/** Unique identifier of a rights grant record (also its stable ref form). */
export type RightsGrantId = RightsRef;

/** Unique identifier of a consent record (also its stable ref form). */
export type ConsentRecordId = ConsentRef;

/** Unique identifier of a provenance record (also its stable ref form). */
export type ProvenanceRecordId = ProvenanceRef;

/**
 * Stable opaque reference to an explicit rights grant.
 *
 * Carried by `Artifact.rightsRef` (CORE-004), `Transform.rightsRequirements`,
 * `RealExperimentBinding.rightsRef` and Lab corpus contracts. Resolving a
 * `RightsRef` is the ONLY way any consumer may learn which rights exist — see
 * {@link ../evaluation/rights-evaluation.ts} for the evaluation rule.
 */
export type { RightsRef };

/**
 * Stable opaque reference to a provenance record.
 *
 * Carried by `Artifact.provenanceRef` (CORE-004): every artifact names the
 * provenance record that describes how it came to exist.
 */
export type { ProvenanceRef };

/**
 * Stable opaque reference to a consent record.
 *
 * Carried by `HumanProductionTask.rightsConsent` and referenced from
 * `RightsGrant.sourceRefs` when a grant is backed by participant consent.
 */
export type { ConsentRef };

/** Re-exported for convenience of downstream contract definitions. */
export type { IdentityId, TenantId };
