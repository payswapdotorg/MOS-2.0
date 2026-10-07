import type {
  ArtifactRef,
  CapabilityRequirement,
  ProvenanceRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type { ReferenceDocumentId } from './corpus.js';

/**
 * Multimodal feature bundle contracts for the Marketing Lab (LAB-002).
 *
 * Basis: spec/mos-architecture-v2.0.md §2 (corpus → multimodal features +
 * Idea Graph), §5 (capabilities are contracts; engines are replaceable
 * implementations), §10 (domain modules ask for capabilities, the Engine
 * Registry selects engines), spec/mos-effective-backlog-v2.0.md LAB-002
 * ("Multimodal Feature Bundles", deps LAB-001 + ENG-001 — both available).
 *
 * FEATURE DESCRIPTORS ARE REFERENCES, NOT VECTORS (AGENTS.md "Media" +
 * architecture §6): a computed feature (text embedding, audio/video feature
 * track, …) is recorded as a COMPUTED {@link ArtifactRef} pointing at the
 * feature artifact in object storage, plus scalar manifest metadata
 * (dimension count, model family, track length — never the numeric vector
 * itself). Raw feature vectors never travel through the control plane.
 *
 * CAPABILITY REQUIREMENTS ARE DECLARED, NOT EXECUTED: the
 * {@link FeatureComputationPort} declares which capability contract each
 * feature kind requires (e.g. the `semantic_video_relevance` capability id
 * from the @mos/capabilities §5 seed catalog). The lab NEVER invokes engines
 * directly (architecture policy lab.noDirectProviderCalls) — an engine-backed
 * computation adapter binds through the Engine Registry (ENG-001/ENG-002) in
 * a later wave.
 */

declare const featureBundleIdBrand: unique symbol;

/** Unique identifier of a feature bundle (stable across all its versions). */
export type FeatureBundleId = string & { readonly [featureBundleIdBrand]: true };

/** The modality-aligned kinds of computed features a bundle can carry. */
export type FeatureKind =
  | 'text-embedding'
  | 'image-features'
  | 'audio-features'
  | 'video-features'
  | 'structured-features';

/** Scalar manifest metadata values — arrays/objects are forbidden BY TYPE. */
export type FeatureMetadataValue = string | number | boolean | null;

/**
 * Feature metadata: a flat scalar manifest (e.g. dimension count, model
 * family, track length). Raw vectors are NOT representable here — they live
 * behind the feature artifact reference.
 */
export type FeatureMetadata = { readonly [key: string]: FeatureMetadataValue };

/**
 * One computed feature: the feature kind, the COMPUTED feature artifact
 * (an object-store reference — never the vector bytes), and its scalar
 * manifest metadata.
 */
export interface FeatureDescriptor {
  readonly kind: FeatureKind;
  readonly artifact: ArtifactRef;
  readonly metadata: FeatureMetadata;
}

/**
 * A multimodal feature bundle: the computed feature descriptors for one
 * reference document. Bundles are versioned (a recomputation is a NEW
 * version; prior versions stay retrievable) and attach/detach to corpus
 * documents append-only (`detachedAt` marks a detachment — bundles are never
 * hard-deleted).
 */
export interface FeatureBundle {
  readonly id: FeatureBundleId;
  readonly version: Version;
  readonly tenantId: TenantId;
  /** The corpus document the features were computed over. */
  readonly documentId: ReferenceDocumentId;
  /** The computed feature descriptors (references + scalar metadata). */
  readonly features: readonly FeatureDescriptor[];
  /** Provenance of the computation run that produced this bundle. */
  readonly provenanceRef: ProvenanceRef;
  /** ISO-8601 timestamp of this bundle version. */
  readonly createdAt: Timestamp;
  /**
   * ISO-8601 timestamp of the (append-only) detachment, or `null` while the
   * bundle is attached.
   */
  readonly detachedAt: Timestamp | null;
}

/** Attach a new feature bundle (version 1) to a corpus document. */
export interface AttachFeatureBundleInput {
  readonly scope: TenantScope;
  readonly id: FeatureBundleId;
  readonly documentId: ReferenceDocumentId;
  readonly features: readonly FeatureDescriptor[];
  readonly provenanceRef: ProvenanceRef;
}

/**
 * Replace the feature set of an attached bundle (append-only: creates
 * version + 1; prior versions stay retrievable).
 */
export interface UpdateFeatureBundleInput {
  readonly scope: TenantScope;
  readonly id: FeatureBundleId;
  readonly features: readonly FeatureDescriptor[];
  readonly provenanceRef: ProvenanceRef;
}

/** Machine-readable failure codes for feature bundle operations. */
export type FeatureBundleErrorCode =
  | 'invalid-input'
  | 'duplicate-bundle'
  | 'bundle-not-found'
  | 'bundle-detached'
  | 'document-not-found'
  | 'cross-tenant-reference';

/** Typed failure value (result union, the MOS domain convention). */
export interface FeatureBundleError {
  readonly error: FeatureBundleErrorCode;
  readonly message: string;
}

/**
 * The feature bundle registry (LAB-002 runtime port): attach / update /
 * detach versioned feature bundles on corpus documents. Five public methods
 * (architecture policy budget: 12).
 *
 * Detachment is APPEND-ONLY: `detachFeatureBundle` records a new version
 * carrying `detachedAt` — the bundle (and its history) stays auditable;
 * detached bundles are excluded from `listFeatureBundles`.
 */
export interface FeatureBundleRegistry {
  /**
   * Attach a new feature bundle (version 1) to a corpus document. The
   * document must exist in the tenant scope, the feature list must be
   * non-empty, and every feature artifact must belong to the scope's tenant.
   * Fails with `invalid-input`, `duplicate-bundle`, `document-not-found` or
   * `cross-tenant-reference`.
   */
  attachFeatureBundle(input: AttachFeatureBundleInput): Promise<FeatureBundle | FeatureBundleError>;

  /**
   * Fetch a feature bundle by id — latest version by default, an exact
   * version when given — or `null` when unknown in this tenant scope.
   */
  getFeatureBundle(
    scope: TenantScope,
    id: FeatureBundleId,
    version?: number,
  ): Promise<FeatureBundle | null>;

  /**
   * Replace the feature set of an attached bundle (creates version + 1).
   * Fails with `bundle-not-found`, `bundle-detached`,
   * `cross-tenant-reference` or `invalid-input`.
   */
  updateFeatureBundle(input: UpdateFeatureBundleInput): Promise<FeatureBundle | FeatureBundleError>;

  /**
   * Detach a bundle (append-only): records a new version with `detachedAt`
   * set. Fails with `bundle-not-found`, `bundle-detached` or
   * `cross-tenant-reference`.
   */
  detachFeatureBundle(scope: TenantScope, id: FeatureBundleId): Promise<FeatureBundle | FeatureBundleError>;

  /**
   * List the latest version of every ATTACHED bundle visible in a tenant
   * scope, optionally filtered to one corpus document. Deterministically
   * ordered by id. Empty array for an unknown tenant scope.
   */
  listFeatureBundles(
    scope: TenantScope,
    documentId?: ReferenceDocumentId,
  ): Promise<readonly FeatureBundle[]>;
}

// ---------------------------------------------------------------------------
// Feature computation capability requirements (declaration only)
// ---------------------------------------------------------------------------

/**
 * The capability contract one feature kind requires, pinned to an exact
 * capability version (`@mos/contracts` `CapabilityRequirement`).
 */
export interface FeatureKindRequirement {
  readonly kind: FeatureKind;
  readonly capability: CapabilityRequirement;
}

/**
 * The feature computation port (LAB-002): DECLARES the capability
 * requirements for computing each feature kind.
 *
 * DECLARE ONLY — no engine is invoked through this port. The lab asks for
 * capabilities and resolves engines through the Engine Registry
 * (architecture §10; AGENTS.md "Capability ≠ Engine"); an engine-backed
 * computation adapter satisfies this seam in a later wave. This port exists
 * so the requirement mapping is explicit, versioned data rather than an
 * implicit assumption buried in engine wiring.
 */
export interface FeatureComputationPort {
  /**
   * The declared capability requirements per feature kind (one entry per
   * kind, order preserved as declared). An empty result means the carrier
   * declares no requirements yet.
   */
  requirements(): readonly FeatureKindRequirement[];
}
