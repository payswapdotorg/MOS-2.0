import type {
  ContentDigest,
  ProvenanceRef,
  RightsRef,
  TenantId,
  TenantScope,
} from '@mos/content';

/**
 * Corpus contracts sketch for the Marketing Lab (LAB-001 — TYPES ONLY).
 *
 * SCAFFOLD DISCLOSURE: LAB-001 ("Reference-First Niche Corpus", deps
 * CORE-004 + CORE-005) is grounded in this wave by pinning the corpus
 * vocabulary ONLY. There is deliberately NO corpus storage, NO ingest
 * runtime, NO query engine, and NO simulator here — the full implementation
 * is later waves (LAB-002 multimodal feature bundles, LAB-003 idea graph,
 * LAB-004 social simulator all build on this contract). Tests assert
 * type-level invariants only.
 *
 * Types are imported from `@mos/content` (the lab module's declared registry
 * dependency that exists in this wave) rather than from `@mos/identity` /
 * `@mos/rights` directly — the registry declares lab deps as
 * `[contracts, content, production, agents, capabilities, engines, jobs]`, and
 * content re-exports the shared id/ref vocabulary. The remaining declared
 * dependencies bind as those packages land in later waves.
 */

declare const referenceDocumentIdBrand: unique symbol;
declare const corpusIdBrand: unique symbol;

/** Unique identifier of a reference document. */
export type ReferenceDocumentId = string & { readonly [referenceDocumentIdBrand]: true };

/** Unique identifier of a corpus. */
export type CorpusId = string & { readonly [corpusIdBrand]: true };

/** Content modality of a reference document. */
export type ReferenceModality = 'text' | 'image' | 'audio' | 'video' | 'structured' | 'mixed';

/**
 * A reference document: one acquired, rights-cleared unit of the niche corpus.
 *
 * The `rightsRef` is a REQUIRED field — a document without an explicit rights
 * grant cannot exist in the corpus model at all (CORE-003/CORE-004 rule:
 * URL accessibility NEVER implies rights; `sourceRefs` describe where content
 * came from, `rightsRef` is the only rights authority). `contentDigest` pins
 * the acquired bytes; the bytes themselves live in object storage, referenced
 * by digest — never inlined.
 */
export interface ReferenceDocument {
  readonly id: ReferenceDocumentId;
  readonly version: number;
  readonly tenantId: TenantId;
  /** External source references the document was acquired from. */
  readonly sourceRefs: readonly string[];
  /** ISO-8601 timestamp of acquisition. */
  readonly acquiredAt: string;
  /** The explicit rights grant covering this acquisition. */
  readonly rightsRef: RightsRef;
  /** Provenance record describing the acquisition step. */
  readonly provenanceRef: ProvenanceRef;
  /** Content digest (`sha256:<hex>`) of the stored document bytes. */
  readonly contentDigest: ContentDigest;
  readonly modality: ReferenceModality;
}

/**
 * An immutable snapshot of a corpus at a point in time. New documents or
 * removals produce a NEW corpus version — versions are never mutated (the
 * same discipline as CORE-004's artifact version chains). `LabScenario`'s
 * `corpusVersion` field (frozen contracts YAML) points at exactly this kind
 * of versioned snapshot so simulations are reproducible.
 */
export interface CorpusVersion {
  readonly corpusId: CorpusId;
  readonly version: number;
  readonly tenantId: TenantId;
  /** Documents included in this snapshot (immutable membership). */
  readonly documentRefs: readonly ReferenceDocumentId[];
  /** ISO-8601 timestamp of the snapshot. */
  readonly createdAt: string;
  readonly notes: string | null;
}

/** Draft of a reference document being registered (version assigned by the port). */
export interface ReferenceDocumentDraft {
  readonly id: ReferenceDocumentId;
  readonly sourceRefs: readonly string[];
  readonly acquiredAt: string;
  readonly rightsRef: RightsRef;
  readonly provenanceRef: ProvenanceRef;
  readonly contentDigest: ContentDigest;
  readonly modality: ReferenceModality;
}

export interface RegisterReferenceDocumentInput {
  readonly scope: TenantScope;
  readonly document: ReferenceDocumentDraft;
}

export interface SnapshotCorpusVersionInput {
  readonly scope: TenantScope;
  readonly corpusId: CorpusId;
  readonly documentRefs: readonly ReferenceDocumentId[];
  readonly notes?: string | null;
}

/** Machine-readable failure codes for the future corpus ports. */
export type CorpusPortErrorCode =
  | 'invalid-input'
  | 'duplicate-document'
  | 'document-not-found'
  | 'duplicate-corpus-version'
  | 'corpus-not-found'
  | 'no-explicit-grant'
  | 'cross-tenant-reference';

/** Typed failure value (result union, the MOS domain convention). */
export interface CorpusPortError {
  readonly error: CorpusPortErrorCode;
  readonly message: string;
}

/**
 * Ingest boundary of the reference corpus (FUTURE RUNTIME — not implemented
 * in this wave). Async because ingest crosses storage/process boundaries,
 * matching `@mos/content`'s async `ArtifactStorage` port.
 *
 * The rights gate is part of the contract's error model: registering a
 * document whose `rightsRef` does not resolve to an explicit active grant
 * fails with `no-explicit-grant`.
 */
export interface CorpusIngestPort {
  /** Register an acquired reference document (rights-gated, append-only). */
  registerReferenceDocument(
    input: RegisterReferenceDocumentInput,
  ): Promise<ReferenceDocument | CorpusPortError>;
  /** Snapshot a new immutable corpus version. */
  snapshotCorpusVersion(
    input: SnapshotCorpusVersionInput,
  ): Promise<CorpusVersion | CorpusPortError>;
}

/**
 * Query boundary of the reference corpus (FUTURE RUNTIME — not implemented in
 * this wave).
 */
export interface CorpusQueryPort {
  /** List the reference documents visible in a tenant scope. */
  listReferenceDocuments(scope: TenantScope): Promise<readonly ReferenceDocument[]>;
  /** Fetch a corpus version snapshot, or `null` when unknown in scope. */
  getCorpusVersion(
    scope: TenantScope,
    corpusId: CorpusId,
    version: number,
  ): Promise<CorpusVersion | null>;
}
