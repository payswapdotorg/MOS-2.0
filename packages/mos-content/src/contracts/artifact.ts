import type {
  Artifact as ContractsArtifact,
  ArtifactId,
  ArtifactRef,
  ArtifactType,
  ContentDigest,
  CreationMethod as ContractsCreationMethod,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
  Version,
} from '@mos/contracts';

/**
 * Local contract types for the MOS content domain (CORE-004).
 *
 * RECONCILED (W2-A / RECONCILE-A): the shared artifact vocabulary —
 * `ArtifactId`, `ArtifactType`, `StorageRef`, `ContentDigest`, `Version` and
 * the whole `ArtifactRef` reference record — is imported from
 * `@mos/contracts` (CORE-001 canonical authority, aligned field-for-field to
 * `spec/contracts/core-contracts-v2.0.yaml`):
 *
 * - `Artifact` required: [id, version, tenantId, type, digest, storageRef,
 *   provenanceRef, rightsRef, lineage, creationMethod]
 * - `ArtifactRef` required: [artifactId, version, tenantId, digest, type,
 *   storageRef, rightsRef, provenanceRef]
 *
 * `ArtifactRef` — the cross-package currency of the production system — is
 * now the CONTRACTS type itself (type identity, not a structural twin), so
 * artifact references flow between content, lab, engines and studio packages
 * without adapter mapping.
 *
 * `Artifact` extends the contracts base locally: content's
 * `CreationMethod` vocabulary (architecture §6 conceptual chain: reference →
 * acquisition → raw capture → transform → composition) is a SUPERSET of the
 * contracts projection's vocabulary, and the frozen YAML pins only the field
 * NAME (not the value vocabulary), so the local union includes the contracts
 * base and adds the content-domain provenance methods. Unifying the two
 * vocabularies is a Tech-Lead contracts decision, disclosed in the W2-A
 * report.
 */

/**
 * How an artifact came to exist. The contracts base vocabulary (CORE-001)
 * plus the content-domain provenance methods shared with `@mos/rights`'
 * `ProvenanceCreationMethod` (architecture §6 conceptual chain).
 */
export type CreationMethod =
  | ContractsCreationMethod
  | 'reference'
  | 'acquisition'
  | 'raw-capture'
  | 'transform'
  | 'engine-output'
  | 'human-contribution';

/**
 * An immutable artifact record — the frozen `Artifact` contract with the
 * content-domain creation-method vocabulary.
 *
 * Immutability is BY CONSTRUCTION: the repository port exposes no update or
 * delete operation. A new version of an artifact is a NEW record (same `id`,
 * `version` + 1) whose lineage links the previous version; a transformation
 * is a new artifact record whose lineage links its parents. Raw human
 * capture is never silently treated as final — it enters the graph as a
 * `raw-capture` record that later steps explicitly build upon.
 */
export interface Artifact extends Omit<ContractsArtifact, 'creationMethod'> {
  /** Version of this record within the artifact's version chain (starts at 1). */
  readonly version: Version;
  /** How this artifact came to exist (content-domain vocabulary). */
  readonly creationMethod: CreationMethod;
}

/** Re-exported for downstream contract definitions (CORE-004 consumers). */
export type {
  ArtifactId,
  ArtifactRef,
  ArtifactType,
  ContentDigest,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
  Version,
};
