/**
 * Artifact and ArtifactRef contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   Artifact.required = [id, version, tenantId, type, digest, storageRef,
 *     provenanceRef, rightsRef, lineage, creationMethod]
 *   ArtifactRef.required = [artifactId, version, tenantId, digest, type,
 *     storageRef, rightsRef, provenanceRef]
 *
 * Basis: spec/mos-architecture-v2.0.md §6 (artifact graph: every artifact is
 * versioned and lineage-preserving; metadata includes artifact id/version,
 * tenant/workspace, MIME/type, content digest, storage reference,
 * rights/consent reference, provenance, parent artifact refs, creation
 * method; raw human capture is never silently treated as final; large media
 * bytes move through object/media storage ports, not control-plane RPC),
 * §31 (requireTenantScopeOnMutableArtifacts).
 *
 * CORE-004 (@mos/content) owns the artifact graph authority built on these
 * types.
 */

import type {
  ArtifactId,
  ArtifactType,
  ContentDigest,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
  Version,
} from "./value-types.js";

/**
 * How an artifact came to exist (spec §6). Aligned with the @mos/studio
 * interface spike's creation-method vocabulary for Wave-1 reconciliation.
 */
export type CreationMethod =
  | "human-capture"
  | "human-import"
  | "engine-generated"
  | "organization-transform"
  | "composition";

/**
 * An immutable, versioned, lineage-preserving artifact record. Artifact
 * versions are never mutated in place — a treatment creates a new linked
 * version (spec §19).
 *
 * `lineage` carries the parent artifact references (empty only for pure raw
 * capture); `storageRef` is an opaque object-storage reference, never media
 * bytes over the control plane.
 */
export interface Artifact {
  readonly id: ArtifactId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly type: ArtifactType;
  readonly digest: ContentDigest;
  readonly storageRef: StorageRef;
  readonly provenanceRef: ProvenanceRef;
  readonly rightsRef: RightsRef;
  /** Parent artifact references (immutable lineage). */
  readonly lineage: readonly ArtifactRef[];
  readonly creationMethod: CreationMethod;
}

/**
 * A self-contained reference to one artifact version. This is the currency
 * of the production system: engine jobs consume and produce artifact refs,
 * production graphs and requests carry them, and the tenant/digest/rights/
 * provenance context travels WITH the reference so nothing is ever inferred
 * from URL accessibility (spec §4/§6, AGENTS.md "Media").
 */
export interface ArtifactRef {
  readonly artifactId: ArtifactId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly digest: ContentDigest;
  readonly type: ArtifactType;
  readonly storageRef: StorageRef;
  readonly rightsRef: RightsRef;
  readonly provenanceRef: ProvenanceRef;
}
