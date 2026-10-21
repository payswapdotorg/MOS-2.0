import type { ArtifactRef, TenantId, TenantScope, Timestamp } from '@mos/contracts';

/**
 * Lab corpus & evidence view port (UX-003, over LAB-001 + LAB-002).
 *
 * The Lab workspace's Corpus & Evidence section: the reference-first
 * niche corpus (LAB-001) — corpus version snapshots with their reference
 * documents (source references, provenance, acquisition time boundaries,
 * modality, rights/consent status as the EXPLICIT grant refs the authority
 * required at ingestion) — and the multimodal feature-bundle declarations
 * (LAB-002) computed over those documents (feature kinds as COMPUTED
 * artifact references + scalar manifest metadata, never vectors; plus the
 * DECLARED capability requirements per feature kind).
 *
 * REFERENCE-FIRST DISCIPLINE (§20/AGENTS.md "Media"): no document ever
 * carries content bytes — every document IS an `ArtifactRef` reference
 * plus acquisition context. The view models re-declare those reference
 * fields presentation-shaped; the composition seam OUTSIDE `src/` adapts
 * the real LAB-001/LAB-002 records (Worker C's binding) and the disclosed
 * in-memory double runs on REAL-shaped fixtures.
 *
 * NO INGESTION SURFACE: acquiring documents, snapshotting corpus versions
 * and attaching feature bundles are lab-authority actions gated by the
 * explicit rights check (CORE-003). This port is READ-ONLY; the views
 * render those capabilities as declared affordances with their gating
 * explanations, never as controls that could imply successful ingestion.
 */

/** The modality vocabulary of reference documents (LAB-001). */
export type LabReferenceModalityView =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'structured'
  | 'mixed';

/** The feature-kind vocabulary of feature bundles (LAB-002). */
export type LabFeatureKindView =
  | 'text-embedding'
  | 'image-features'
  | 'audio-features'
  | 'video-features'
  | 'structured-features';

/**
 * One reference document as presented: the acquired content artifact
 * REFERENCE (never bytes), where it was acquired from, when, under which
 * explicit rights grant and provenance record.
 */
export interface LabReferenceDocumentView {
  readonly documentId: string;
  readonly version: number;
  /** The acquired content artifact — a reference, never content bytes. */
  readonly artifact: ArtifactRef;
  /** External source references the document was acquired from (non-empty). */
  readonly sourceRefs: readonly string[];
  /** ISO-8601 acquisition time (the time-window dimension). */
  readonly acquiredAt: Timestamp;
  readonly modality: LabReferenceModalityView;
  /**
   * The EXPLICIT rights grant covering the acquisition (CORE-003: URL
   * accessibility never implies rights — the grant ref is always shown).
   */
  readonly rightsRef: string;
  /** Provenance record of the acquisition step. */
  readonly provenanceRef: string;
}

/** One computed feature as presented: kind + artifact reference + manifest. */
export interface LabFeatureDescriptorView {
  readonly kind: LabFeatureKindView;
  /** The COMPUTED feature artifact (object-store reference — never the vector). */
  readonly artifact: ArtifactRef;
  /** Scalar manifest metadata (dimension count, model family, …). */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * The DECLARED capability requirement one feature kind needs (LAB-002
 * declaration-only surface: capability contract refs, never engine calls).
 */
export interface LabFeatureKindRequirementView {
  readonly kind: LabFeatureKindView;
  /** The capability contract id the computation declares. */
  readonly capabilityId: string;
  /** Exact capability version pinned by the declaration. */
  readonly capabilityVersion: number;
}

/** One feature bundle (versioned, attach/detach append-only). */
export interface LabFeatureBundleView {
  readonly bundleId: string;
  readonly version: number;
  /** The corpus document the features were computed over. */
  readonly documentId: string;
  readonly features: readonly LabFeatureDescriptorView[];
  /** Provenance of the computation run that produced this bundle. */
  readonly provenanceRef: string;
  /** ISO-8601 timestamp of this bundle version. */
  readonly createdAt: Timestamp;
  /** ISO-8601 detachment timestamp, or null while attached (append-only). */
  readonly detachedAt: Timestamp | null;
}

/** One corpus version snapshot as listed (append-only chain summary). */
export interface LabCorpusSummaryView {
  /** The corpus id (the authority's `CorpusId`, as a string). */
  readonly corpusId: string;
  /** The tenant the corpus belongs to — always explicit (§31). */
  readonly tenantId: TenantId;
  /** Latest snapshot version of the append-only chain. */
  readonly latestVersion: number;
  readonly versionCount: number;
  /** Documents in the latest snapshot (immutable membership). */
  readonly documentCount: number;
  /** The niche/platform labels the corpus was acquired under. */
  readonly niche: string;
  readonly platform: string;
  /** Distinct modalities across the snapshot's documents. */
  readonly modalities: readonly LabReferenceModalityView[];
  /** ISO-8601 timestamp of the latest snapshot. */
  readonly latestSnapshotAt: Timestamp;
  /** The acquisition window of the snapshot's documents (time boundaries). */
  readonly acquiredFrom: Timestamp;
  readonly acquiredTo: Timestamp;
  /** Feature bundles attached across the snapshot (latest versions). */
  readonly attachedBundleCount: number;
}

/** The full corpus detail: every version + documents + bundles + declarations. */
export interface LabCorpusDetailView {
  readonly summary: LabCorpusSummaryView;
  /** Every append-only snapshot version, oldest first. */
  readonly versions: readonly {
    readonly version: number;
    readonly documentCount: number;
    readonly createdAt: Timestamp;
    readonly notes: string | null;
  }[];
  /** The LATEST snapshot's documents (the browsable evidence). */
  readonly documents: readonly LabReferenceDocumentView[];
  /** Feature bundles over the latest snapshot's documents (latest versions). */
  readonly featureBundles: readonly LabFeatureBundleView[];
  /** The DECLARED capability requirements per feature kind (LAB-002). */
  readonly featureRequirements: readonly LabFeatureKindRequirementView[];
}

/** Typed failure shapes for the corpus port. */
export type LabCorpusFailure =
  | { readonly error: 'lab-corpus-unavailable'; readonly message: string }
  | { readonly error: 'lab-corpus-not-found'; readonly message: string };

/**
 * The declared Lab corpus & evidence view surface (read-only, 2 methods ≤
 * 12 policy budget). Async by design; failures are typed, never
 * placeholders; unknown and cross-tenant corpus ids are the SAME explicit
 * miss (no existence leak across tenants, §31).
 */
export interface LabCorpusViewPort {
  /**
   * Latest summaries of every corpus chain visible in one tenant scope
   * (§31 — cross-tenant corpora are never listed or leaked).
   */
  listCorpusSummaries(
    scope: TenantScope,
  ): Promise<readonly LabCorpusSummaryView[] | LabCorpusFailure>;

  /**
   * One corpus chain's full detail — the LATEST snapshot's documents and
   * bundles plus the append-only version history. `lab-corpus-not-found`
   * for unknown/cross-tenant ids (no existence leak across tenants).
   */
  loadCorpusDetail(
    corpusId: string,
    scope: TenantScope,
  ): Promise<LabCorpusDetailView | LabCorpusFailure>;
}
