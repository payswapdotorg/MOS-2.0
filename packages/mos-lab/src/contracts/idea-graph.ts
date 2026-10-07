import type {
  ArtifactRef,
  ProvenanceRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type { ReferenceDocumentId } from './corpus.js';
import type { FeatureBundleId } from './feature-bundle.js';

/**
 * Idea Graph contracts for the Marketing Lab (LAB-003).
 *
 * Basis: spec/mos-architecture-v2.0.md §2 (multimodal features + Idea Graph
 * → idea + transform search), §20 (Lab simulation: Idea Graph),
 * spec/mos-effective-backlog-v2.0.md LAB-003 ("Idea Graph", deps LAB-002).
 *
 * IDEAS ARE DERIVED ARTIFACTS: every {@link IdeaNode} MUST carry derivation
 * provenance to the corpus — references to the corpus documents (and/or the
 * feature bundles) it was derived from. An idea without derivation refs is
 * REJECTED (`empty-derivation`), and every referenced document/bundle must
 * actually resolve in the tenant's corpus (`unknown-derivation-ref`): ideas
 * never float free of evidence, and derivation chains are traceable all the
 * way back to the acquired content artifacts ({@link IdeaGraph.traceDerivation}).
 *
 * RELATIONS ARE TYPED AND WEIGHTED: {@link IdeaEdge} kinds are the fixed
 * vocabulary supports / contradicts / derives-from / combines-with /
 * competes-with; weights are signed numbers in [-1, 1] (e.g. supports > 0,
 * contradicts < 0 — the sign discipline is asserted by tests). Edges are
 * versioned: corrections append version + 1, never mutate history.
 */

declare const ideaNodeIdBrand: unique symbol;
declare const ideaEdgeIdBrand: unique symbol;

/** Unique identifier of an idea node (stable across all its versions). */
export type IdeaNodeId = string & { readonly [ideaNodeIdBrand]: true };

/** Unique identifier of an idea edge (stable across all its versions). */
export type IdeaEdgeId = string & { readonly [ideaEdgeIdBrand]: true };

/** The typed relations an idea edge can express. */
export type IdeaEdgeKind =
  | 'supports'
  | 'contradicts'
  | 'derives-from'
  | 'combines-with'
  | 'competes-with';

/**
 * The derivation provenance of an idea: the corpus documents and feature
 * bundles it was derived from. AT LEAST ONE reference (document or bundle)
 * is mandatory — an idea without derivation is rejected by the port.
 */
export interface IdeaDerivation {
  /** Corpus documents the idea was derived from. */
  readonly documents: readonly ReferenceDocumentId[];
  /** Feature bundles the idea was derived from. */
  readonly featureBundles: readonly FeatureBundleId[];
}

/**
 * An idea node: a statement distilled from corpus evidence.
 *
 * `embeddingRef` (when computed) is a REFERENCE to the statement-embedding
 * artifact — never a raw vector in the control plane. `derivation` carries
 * the mandatory corpus evidence refs; `provenanceRef` records who/what
 * distilled the idea.
 */
export interface IdeaNode {
  readonly id: IdeaNodeId;
  readonly version: Version;
  readonly tenantId: TenantId;
  /** The idea in one statement (non-blank). */
  readonly statement: string;
  /** Statement embedding as a computed artifact reference, or `null`. */
  readonly embeddingRef: ArtifactRef | null;
  /** MANDATORY derivation provenance to corpus documents / feature bundles. */
  readonly derivation: IdeaDerivation;
  /** Provenance record of the distillation step. */
  readonly provenanceRef: ProvenanceRef;
  /** ISO-8601 timestamp of this node version. */
  readonly createdAt: Timestamp;
}

/**
 * A typed, weighted, versioned relation between two idea nodes. Edge
 * direction: `from` is the subject of the relation — for `derives-from`,
 * `from` is derived FROM `to` (so tracing upstream follows outgoing
 * `derives-from` edges).
 */
export interface IdeaEdge {
  readonly id: IdeaEdgeId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly fromNodeId: IdeaNodeId;
  readonly toNodeId: IdeaNodeId;
  readonly kind: IdeaEdgeKind;
  /** Signed weight in [-1, 1]. */
  readonly weight: number;
  /** ISO-8601 timestamp of this edge version. */
  readonly createdAt: Timestamp;
}

/** Add a new idea node (version 1, derivation validated). */
export interface AddIdeaNodeInput {
  readonly scope: TenantScope;
  readonly id: IdeaNodeId;
  readonly statement: string;
  readonly embeddingRef?: ArtifactRef | null;
  readonly derivation: IdeaDerivation;
  readonly provenanceRef: ProvenanceRef;
}

/** Revise an idea node (append-only: creates version + 1, derivation re-validated). */
export interface ReviseIdeaNodeInput {
  readonly scope: TenantScope;
  readonly id: IdeaNodeId;
  readonly statement: string;
  readonly embeddingRef?: ArtifactRef | null;
  readonly derivation: IdeaDerivation;
  readonly provenanceRef: ProvenanceRef;
}

/** Add a typed, weighted relation between two existing idea nodes. */
export interface AddIdeaEdgeInput {
  readonly scope: TenantScope;
  readonly id: IdeaEdgeId;
  readonly fromNodeId: IdeaNodeId;
  readonly toNodeId: IdeaNodeId;
  readonly kind: IdeaEdgeKind;
  readonly weight: number;
}

/** Update an edge's kind and/or weight (append-only: creates version + 1). */
export interface UpdateIdeaEdgeInput {
  readonly scope: TenantScope;
  readonly id: IdeaEdgeId;
  readonly kind?: IdeaEdgeKind;
  readonly weight?: number;
}

/** Neighborhood query options. */
export interface IdeaNeighborhoodQuery {
  /** How many edge hops to traverse from the root (default 1, must be ≥ 0). */
  readonly radius?: number;
}

/** The result of a neighborhood query: the reached nodes and traversed edges. */
export interface IdeaNeighborhood {
  readonly rootId: IdeaNodeId;
  /** The root plus every node reached within the radius, ordered by id. */
  readonly nodes: readonly IdeaNode[];
  /** The traversed edges (latest versions), ordered by id. */
  readonly edges: readonly IdeaEdge[];
}

/**
 * One step of a derivation chain trace, from an idea back to corpus
 * evidence. Feature bundles resolve to their corpus document; corpus
 * documents resolve to the acquired content artifact reference.
 */
export type DerivationStep =
  | { readonly kind: 'idea'; readonly nodeId: IdeaNodeId }
  | {
      readonly kind: 'feature-bundle';
      readonly bundleId: FeatureBundleId;
      readonly documentId: ReferenceDocumentId;
    }
  | {
      readonly kind: 'corpus-document';
      readonly documentId: ReferenceDocumentId;
      readonly artifact: ArtifactRef;
    };

/** Machine-readable failure codes for idea graph operations. */
export type IdeaGraphErrorCode =
  | 'invalid-input'
  | 'duplicate-idea'
  | 'duplicate-edge'
  | 'idea-not-found'
  | 'edge-not-found'
  | 'empty-derivation'
  | 'unknown-derivation-ref'
  | 'cross-tenant-reference';

/** Typed failure value (result union, the MOS domain convention). */
export interface IdeaGraphError {
  readonly error: IdeaGraphErrorCode;
  readonly message: string;
}

/**
 * The Idea Graph port (LAB-003 runtime): derivation-mandatory idea nodes,
 * typed weighted versioned edges, neighborhood queries and derivation chain
 * tracing back to corpus evidence. Eight public methods (architecture
 * policy budget: 12).
 */
export interface IdeaGraph {
  /**
   * Add an idea node (version 1). The derivation MUST name at least one
   * corpus document or feature bundle, and every referenced id must resolve
   * in the tenant scope. Fails with `invalid-input`, `duplicate-idea`,
   * `empty-derivation`, `unknown-derivation-ref` or `cross-tenant-reference`.
   */
  addIdeaNode(input: AddIdeaNodeInput): Promise<IdeaNode | IdeaGraphError>;

  /**
   * Fetch an idea node by id — latest version by default, an exact version
   * when given — or `null` when unknown in this tenant scope.
   */
  getIdeaNode(scope: TenantScope, id: IdeaNodeId, version?: number): Promise<IdeaNode | null>;

  /**
   * Revise an idea node (append-only: version + 1). The new statement,
   * derivation and provenance replace the old ones on the NEW version only;
   * derivation is re-validated. Fails with `idea-not-found`,
   * `cross-tenant-reference`, `invalid-input`, `empty-derivation` or
   * `unknown-derivation-ref`.
   */
  reviseIdeaNode(input: ReviseIdeaNodeInput): Promise<IdeaNode | IdeaGraphError>;

  /**
   * Add a typed, weighted edge between two existing idea nodes of the same
   * tenant. Fails with `invalid-input`, `duplicate-edge`, `idea-not-found`
   * or `cross-tenant-reference`.
   */
  addIdeaEdge(input: AddIdeaEdgeInput): Promise<IdeaEdge | IdeaGraphError>;

  /**
   * Fetch an idea edge by id (latest version), or `null` when unknown in
   * this tenant scope.
   */
  getIdeaEdge(scope: TenantScope, id: IdeaEdgeId): Promise<IdeaEdge | null>;

  /**
   * Update an edge's kind and/or weight (append-only: version + 1). Fails
   * with `edge-not-found`, `cross-tenant-reference` or `invalid-input`.
   */
  updateIdeaEdge(input: UpdateIdeaEdgeInput): Promise<IdeaEdge | IdeaGraphError>;

  /**
   * Query the neighborhood of an idea node: the root plus every node
   * reachable within `radius` edge hops (edges are traversed in both
   * directions). Deterministically ordered. Fails with `idea-not-found`.
   */
  queryNeighborhood(
    scope: TenantScope,
    nodeId: IdeaNodeId,
    query?: IdeaNeighborhoodQuery,
  ): Promise<IdeaNeighborhood | IdeaGraphError>;

  /**
   * Trace the derivation chain of an idea back to corpus evidence: the idea
   * itself, its derivation refs (feature bundles resolved to their corpus
   * documents, documents resolved to their acquired artifact refs), and —
   * transitively — the upstream ideas of every outgoing `derives-from` edge.
   * Fails with `idea-not-found` or `unknown-derivation-ref` (integrity).
   */
  traceDerivation(
    scope: TenantScope,
    nodeId: IdeaNodeId,
  ): Promise<readonly DerivationStep[] | IdeaGraphError>;
}
