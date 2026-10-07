import type { TenantId } from '@mos/identity';
import type { ProvenanceRef, RightsRef } from '@mos/rights';

/**
 * Local contract types for the MOS content domain (CORE-004).
 *
 * Aligned field-for-field to `spec/contracts/core-contracts-v2.0.yaml` (FROZEN):
 *
 * - `Artifact` required: [id, version, tenantId, type, digest, storageRef,
 *   provenanceRef, rightsRef, lineage, creationMethod]
 * - `ArtifactRef` required: [artifactId, version, tenantId, digest, type,
 *   storageRef, rightsRef, provenanceRef]
 *
 * `@mos/contracts` (CORE-001) is not in this branch base; types are defined
 * locally and switch to `@mos/contracts` at TL reconciliation (Wave 2).
 */

declare const artifactIdBrand: unique symbol;
declare const artifactTypeBrand: unique symbol;
declare const storageRefBrand: unique symbol;
declare const contentDigestBrand: unique symbol;

/** Unique identifier of an artifact (stable across all its versions). */
export type ArtifactId = string & { readonly [artifactIdBrand]: true };

/**
 * Artifact content type — a MIME type or MOS type token (e.g.
 * `audio/wav`, `video/mp4`, `text/plain`, `graph/conversation`).
 */
export type ArtifactType = string & { readonly [artifactTypeBrand]: true };

/**
 * Opaque reference to an object-store location (e.g.
 * `mem://tenant/digest`, `s3://bucket/key`). Artifacts carry ONLY this
 * reference — large media bytes never travel through the control plane
 * (architecture §6, policy `forbidMediaOverControlRpc`).
 */
export type StorageRef = string & { readonly [storageRefBrand]: true };

/**
 * Content digest of the stored bytes: `sha256:<lowercase-hex>` — the same
 * format produced by the substrate object-storage adapters
 * (`@mos/substrate-adapters`), so digest verification is interchangeable
 * across storage backends.
 */
export type ContentDigest = string & { readonly [contentDigestBrand]: true };

/**
 * How an artifact came to exist (architecture §6 conceptual chain:
 * reference → acquired input → raw capture → transform → composition).
 * Vocabulary shared with `@mos/rights`' `ProvenanceCreationMethod`; unified
 * at CORE-001 reconciliation.
 */
export type CreationMethod =
  | 'reference'
  | 'acquisition'
  | 'raw-capture'
  | 'transform'
  | 'composition'
  | 'engine-output'
  | 'human-contribution';

/**
 * Reference to a specific artifact version — the frozen `ArtifactRef`
 * contract, field-for-field.
 */
export interface ArtifactRef {
  readonly artifactId: ArtifactId;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly digest: ContentDigest;
  readonly type: ArtifactType;
  readonly storageRef: StorageRef;
  readonly rightsRef: RightsRef;
  readonly provenanceRef: ProvenanceRef;
}

/**
 * An immutable artifact record — the frozen `Artifact` contract,
 * field-for-field.
 *
 * Immutability is BY CONSTRUCTION: the repository port exposes no update or
 * delete operation. A new version of an artifact is a NEW record (same `id`,
 * `version` + 1) whose lineage links the previous version; a transformation
 * is a new artifact record whose lineage links its parents. Raw human
 * capture is never silently treated as final — it enters the graph as a
 * `raw-capture` record that later steps explicitly build upon.
 */
export interface Artifact {
  readonly id: ArtifactId;
  /** Version of this record within the artifact's version chain (starts at 1). */
  readonly version: number;
  readonly tenantId: TenantId;
  readonly type: ArtifactType;
  readonly digest: ContentDigest;
  readonly storageRef: StorageRef;
  readonly provenanceRef: ProvenanceRef;
  readonly rightsRef: RightsRef;
  /** Parent artifact refs (lineage; empty only for root records). */
  readonly lineage: readonly ArtifactRef[];
  readonly creationMethod: CreationMethod;
}

/** Re-exported for downstream contract definitions (CORE-004 consumers). */
export type { ProvenanceRef, RightsRef, TenantId };
