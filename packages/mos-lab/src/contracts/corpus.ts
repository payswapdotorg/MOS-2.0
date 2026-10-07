import type {
  ArtifactRef,
  ProvenanceRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';

/**
 * Reference-first niche corpus contracts for the Marketing Lab (LAB-001 full).
 *
 * Basis: spec/mos-architecture-v2.0.md §2 (complete loop: broad reference-first
 * corpus → multimodal features + Idea Graph), §20 (Lab simulation:
 * reference-first corpus), spec/mos-effective-backlog-v2.0.md LAB-001
 * ("Reference-First Niche Corpus", deps CORE-004 + CORE-005 — both done).
 *
 * REFERENCE-FIRST DISCIPLINE: a corpus document NEVER contains content bytes
 * or fabricated text — it is a REFERENCE to one acquired content artifact
 * (`artifact: ArtifactRef` from `@mos/contracts`, CORE-004) plus the
 * acquisition context (source refs, acquisition time, niche/platform
 * labels, modality). The acquired bytes live in object storage behind the
 * artifact's `storageRef`; the control plane only ever carries the reference.
 *
 * RIGHTS GATE (CORE-003): acquiring a document into the corpus requires an
 * EXPLICIT rights grant — `rightsRef` must resolve through the injected
 * {@link RightsCheckPort} to an active, tenant-matching grant. URL/storageRef
 * accessibility NEVER implies rights; without a resolvable explicit grant the
 * ingestion fails with `no-explicit-grant`.
 *
 * TENANT SCOPING: every corpus record carries `tenantId` explicitly, every
 * port operation names its {@link TenantScope}, and cross-tenant reads never
 * leak existence (`null` / empty-array misses).
 *
 * RECONCILED (W2-A / RECONCILE-A): the shared vocabulary (`TenantId`,
 * `TenantScope`, `Version`, `Timestamp`, `RightsRef`, `ProvenanceRef`,
 * `ArtifactRef`) is imported from `@mos/contracts` (CORE-001 canonical
 * authority) instead of the previous `@mos/content` re-exports. The W1-A
 * scaffold's `CorpusIngestPort` / `CorpusQueryPort` evolved into the single
 * {@link CorpusStore} port; `ReferenceDocument.contentDigest` was superseded
 * by the full `artifact` reference (the digest travels inside it).
 */

declare const referenceDocumentIdBrand: unique symbol;
declare const corpusIdBrand: unique symbol;

/** Unique identifier of a reference document. */
export type ReferenceDocumentId = string & { readonly [referenceDocumentIdBrand]: true };

/** Unique identifier of a corpus (namespace for corpus version snapshots). */
export type CorpusId = string & { readonly [corpusIdBrand]: true };

/** Content modality of a reference document. */
export type ReferenceModality = 'text' | 'image' | 'audio' | 'video' | 'structured' | 'mixed';

// ---------------------------------------------------------------------------
// Rights gate (injected structural port)
// ---------------------------------------------------------------------------

/** Why an acquisition rights check failed. */
export type RightsCheckDenialReason =
  | 'grant-not-found'
  | 'grant-revoked'
  | 'grant-expired'
  | 'grant-tenant-mismatch';

/** Request for an acquisition rights verdict on one explicit rights ref. */
export interface RightsCheckInput {
  readonly scope: TenantScope;
  readonly rightsRef: RightsRef;
}

/** Verdict of an acquisition rights check. `reason` is set when `ok` is false. */
export interface RightsCheckVerdict {
  readonly ok: boolean;
  readonly reason?: RightsCheckDenialReason;
  readonly message?: string;
}

/**
 * Rights gate for corpus ingestion (CORE-003 rule: explicit grants only).
 *
 * DECLARED HERE, NOT IMPORTED from `@mos/rights`: the module registry does
 * not list rights among the lab module's dependencies, so the lab owns this
 * narrow STRUCTURAL port. A real adapter over `@mos/rights`'
 * `RightsRepository.getRights` (checking existence, tenant match, revocation
 * and expiry) satisfies this shape and is wired at the composition root;
 * tests use a disclosed double (see the in-memory corpus store test).
 */
export interface RightsCheckPort {
  /**
   * Resolve whether `rightsRef` is an explicit, active, tenant-matching
   * rights grant covering the acquisition.
   */
  checkAcquisitionRights(input: RightsCheckInput): Promise<RightsCheckVerdict>;
}

// ---------------------------------------------------------------------------
// Reference documents
// ---------------------------------------------------------------------------

/**
 * A reference document: one acquired, rights-cleared unit of the niche corpus.
 *
 * `artifact` is the acquired content artifact (versioned, digest-pinned,
 * object-store-backed — the reference-first discipline); `rightsRef` is the
 * explicit grant that authorized the acquisition; `sourceRefs` describe where
 * the content was acquired from; `niche` / `platform` / `modality` are the
 * corpus query dimensions; `acquiredAt` is the acquisition time (the
 * time-window query dimension).
 */
export interface ReferenceDocument {
  readonly id: ReferenceDocumentId;
  readonly version: Version;
  readonly tenantId: TenantId;
  /** Niche label the document was acquired under (query dimension). */
  readonly niche: string;
  /** Platform label the document was acquired from (query dimension). */
  readonly platform: string;
  readonly modality: ReferenceModality;
  /** The acquired content artifact — a reference, never content bytes. */
  readonly artifact: ArtifactRef;
  /** External source references the document was acquired from (non-empty). */
  readonly sourceRefs: readonly string[];
  /** ISO-8601 timestamp of acquisition (time-window query dimension). */
  readonly acquiredAt: Timestamp;
  /** The explicit rights grant covering this acquisition. */
  readonly rightsRef: RightsRef;
  /** Provenance record describing the acquisition step. */
  readonly provenanceRef: ProvenanceRef;
}

/** Draft of a reference document being ingested (version assigned by the port). */
export interface ReferenceDocumentDraft {
  readonly id: ReferenceDocumentId;
  readonly niche: string;
  readonly platform: string;
  readonly modality: ReferenceModality;
  readonly artifact: ArtifactRef;
  readonly sourceRefs: readonly string[];
  readonly acquiredAt: Timestamp;
  readonly rightsRef: RightsRef;
  readonly provenanceRef: ProvenanceRef;
}

/** Ingest one acquired reference document under a tenant scope (rights-gated). */
export interface IngestReferenceDocumentInput {
  readonly scope: TenantScope;
  readonly document: ReferenceDocumentDraft;
}

// ---------------------------------------------------------------------------
// Corpus versions (append-only snapshots)
// ---------------------------------------------------------------------------

/**
 * An immutable snapshot of a corpus at a point in time. New snapshots are
 * APPENDED with `version + 1` — existing versions are never mutated (the
 * same discipline as CORE-004's artifact version chains). `LabScenario`'s
 * `corpusVersion` field (frozen contracts YAML) points at exactly this kind
 * of versioned snapshot so simulations are reproducible.
 */
export interface CorpusVersion {
  readonly corpusId: CorpusId;
  readonly version: Version;
  readonly tenantId: TenantId;
  /** Documents included in this snapshot (immutable membership). */
  readonly documentRefs: readonly ReferenceDocumentId[];
  /** ISO-8601 timestamp of the snapshot. */
  readonly createdAt: Timestamp;
  readonly notes: string | null;
}

/** Snapshot a new immutable corpus version (append-only). */
export interface SnapshotCorpusVersionInput {
  readonly scope: TenantScope;
  readonly corpusId: CorpusId;
  /** Document ids to include; every id must resolve in the tenant scope. */
  readonly documentRefs: readonly ReferenceDocumentId[];
  readonly notes?: string | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Corpus query filter: combine any of niche (exact), platform (exact),
 * modality (exact) and an inclusive acquisition time window
 * [`acquiredFrom`, `acquiredTo`]. An empty query matches every document
 * visible in the scope.
 */
export interface CorpusQuery {
  readonly niche?: string;
  readonly platform?: string;
  readonly modality?: ReferenceModality;
  readonly acquiredFrom?: Timestamp;
  readonly acquiredTo?: Timestamp;
}

// ---------------------------------------------------------------------------
// Failure model + port
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for corpus port operations. */
export type CorpusErrorCode =
  | 'invalid-input'
  | 'duplicate-document'
  | 'document-not-found'
  | 'no-explicit-grant'
  | 'rights-grant-revoked'
  | 'rights-grant-expired'
  | 'rights-grant-tenant-mismatch'
  | 'cross-tenant-reference';

/** Typed failure value (result union, the MOS domain convention). */
export interface CorpusError {
  readonly error: CorpusErrorCode;
  readonly message: string;
}

/**
 * The reference corpus store (LAB-001 runtime port): rights-gated ingestion,
 * document lookup, corpus queries and append-only corpus version snapshots.
 * Six public methods (architecture policy budget: 12).
 *
 * Async because ingestion crosses the injected rights gate (and, in a durable
 * adapter, storage/process boundaries) — matching `@mos/content`'s async
 * `ArtifactStorage` port convention.
 */
export interface CorpusStore {
  /**
   * Ingest an acquired reference document. The draft's `rightsRef` must pass
   * the injected {@link RightsCheckPort} (explicit, active, tenant-matching
   * grant), and `artifact.tenantId` must match the scope. Fails with
   * `invalid-input`, `duplicate-document`, `cross-tenant-reference`,
   * `no-explicit-grant`, `rights-grant-revoked`, `rights-grant-expired` or
   * `rights-grant-tenant-mismatch`.
   */
  ingestReferenceDocument(input: IngestReferenceDocumentInput): Promise<ReferenceDocument | CorpusError>;

  /**
   * Fetch a reference document by id, or `null` when unknown in this tenant
   * scope (cross-tenant reads never leak existence).
   */
  getReferenceDocument(
    scope: TenantScope,
    id: ReferenceDocumentId,
  ): Promise<ReferenceDocument | null>;

  /**
   * Query the documents visible in a tenant scope by niche / platform /
   * modality / acquisition time window. Deterministically ordered by id.
   */
  queryReferenceDocuments(scope: TenantScope, query: CorpusQuery): Promise<readonly ReferenceDocument[]>;

  /**
   * Snapshot a new immutable corpus version (append-only: version =
   * previous + 1 for this corpus, starting at 1). Every document ref must
   * resolve in the tenant scope. Fails with `invalid-input`,
   * `document-not-found` or `cross-tenant-reference`.
   */
  snapshotCorpusVersion(input: SnapshotCorpusVersionInput): Promise<CorpusVersion | CorpusError>;

  /**
   * Fetch one corpus version snapshot, or `null` when unknown in this tenant
   * scope.
   */
  getCorpusVersion(
    scope: TenantScope,
    corpusId: CorpusId,
    version: number,
  ): Promise<CorpusVersion | null>;

  /**
   * List the corpus version snapshots visible in a tenant scope, oldest
   * first (append-only history is readable). Empty array for an unknown or
   * foreign corpus (no existence leak).
   */
  listCorpusVersions(scope: TenantScope, corpusId: CorpusId): Promise<readonly CorpusVersion[]>;
}
