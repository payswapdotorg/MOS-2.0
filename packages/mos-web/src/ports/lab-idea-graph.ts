import type { ArtifactRef, TenantId, TenantScope, Timestamp } from '@mos/contracts';

/**
 * Lab Idea Graph view port (UX-003, over LAB-003).
 *
 * The Lab workspace's Idea Graph section: idea nodes (statements distilled
 * from corpus evidence, versioned, derivation-mandatory), the typed
 * weighted versioned edges between them (supports / contradicts /
 * derives-from / combines-with / competes-with, signed weights in [-1, 1]),
 * and the DERIVATION CHAINS that link every idea back to its source
 * evidence (corpus documents resolved to their acquired artifact refs,
 * feature bundles resolved to their documents, upstream ideas over
 * `derives-from` edges).
 *
 * IDEAS NEVER FLOAT FREE OF EVIDENCE (LAB-003's core rule): every node
 * view carries its derivation reference counts, and the derivation trace
 * is a first-class port method — exactly the operations the authority
 * actually supports (neighborhood query, derivation trace). The view
 * renders a structured, navigable DAG (expandable derivation chains +
 * evidence back-links); every node and edge is real data with its real
 * operations — no decorative canvas.
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models re-declared from the LAB-003 record shapes, importing only
 * `@mos/contracts` types; composition OUTSIDE `src/`.
 */

/** The typed relation vocabulary of idea edges (LAB-003, frozen). */
export type LabIdeaEdgeKindView =
  | 'supports'
  | 'contradicts'
  | 'derives-from'
  | 'combines-with'
  | 'competes-with';

/** One idea node as presented (versioned, derivation-mandatory). */
export interface LabIdeaNodeView {
  readonly nodeId: string;
  readonly version: number;
  /** The tenant the idea belongs to — always explicit (§31). */
  readonly tenantId: TenantId;
  /** The idea in one statement (verbatim from the authority). */
  readonly statement: string;
  /**
   * Statement embedding as a computed artifact reference, or null when
   * none was computed (references only — never vectors, AGENTS.md Media).
   */
  readonly embeddingRef: ArtifactRef | null;
  /** Derivation provenance counts (documents / feature bundles). */
  readonly derivation: {
    readonly documentCount: number;
    readonly featureBundleCount: number;
  };
  /** Provenance record of the distillation step. */
  readonly provenanceRef: string;
  /** ISO-8601 timestamp of this node version. */
  readonly createdAt: Timestamp;
}

/** One typed, weighted, versioned edge as presented. */
export interface LabIdeaEdgeView {
  readonly edgeId: string;
  readonly version: number;
  /** `from` is the subject: for `derives-from`, `from` is derived FROM `to`. */
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: LabIdeaEdgeKindView;
  /** Signed weight in [-1, 1] (supports > 0, contradicts < 0). */
  readonly weight: number;
  /** ISO-8601 timestamp of this edge version. */
  readonly createdAt: Timestamp;
}

/** The whole idea graph as navigated (nodes + edges, deterministically ordered). */
export interface LabIdeaGraphView {
  readonly tenantId: TenantId;
  /** Every idea node visible in the tenant scope, ordered by node id. */
  readonly nodes: readonly LabIdeaNodeView[];
  /** Every edge (latest versions), ordered by edge id. */
  readonly edges: readonly LabIdeaEdgeView[];
}

/**
 * One step of a derivation chain trace, from an idea back to corpus
 * evidence — the LAB-003 `DerivationStep` surface, presentation-shaped.
 */
export type LabDerivationStepView =
  | { readonly kind: 'idea'; readonly nodeId: string }
  | {
      readonly kind: 'feature-bundle';
      readonly bundleId: string;
      readonly documentId: string;
    }
  | {
      readonly kind: 'corpus-document';
      readonly documentId: string;
      readonly artifact: ArtifactRef;
    };

/**
 * One idea's full detail: the node, its neighborhood (the root plus every
 * node reachable within the declared radius — the authority's own query),
 * and its derivation chain traced back to corpus evidence.
 */
export interface LabIdeaDetailView {
  readonly node: LabIdeaNodeView;
  /** The traversed neighborhood: reached nodes + traversed edges. */
  readonly neighborhood: {
    readonly radius: number;
    readonly nodes: readonly LabIdeaNodeView[];
    readonly edges: readonly LabIdeaEdgeView[];
  };
  /**
   * The derivation chain (oldest-evidence-first ordering as the authority
   * traces it): the idea itself, its derivation refs (feature bundles
   * resolved to documents, documents to artifact refs) and the upstream
   * ideas of every outgoing `derives-from` edge.
   */
  readonly derivationChain: readonly LabDerivationStepView[];
}

/** Typed failure shapes for the idea-graph port. */
export type LabIdeaGraphFailure =
  | { readonly error: 'lab-idea-graph-unavailable'; readonly message: string }
  | { readonly error: 'lab-idea-not-found'; readonly message: string };

/**
 * The declared Lab Idea Graph view surface (read-only, 3 methods ≤ 12
 * policy budget — mirroring the authority's own read operations: list,
 * neighborhood query, derivation trace). Async by design; unknown and
 * cross-tenant idea ids are the SAME explicit miss (§31, no existence
 * leak).
 */
export interface LabIdeaGraphViewPort {
  /**
   * The whole idea graph visible in one tenant scope — nodes with their
   * derivation reference counts and the typed weighted edges between them.
   */
  listIdeaGraph(scope: TenantScope): Promise<LabIdeaGraphView | LabIdeaGraphFailure>;

  /**
   * One idea node's navigable detail: the node, its neighborhood (radius
   * 2 hops — the workspace's declared browsing radius) and its derivation
   * chain back to corpus evidence. `lab-idea-not-found` for
   * unknown/cross-tenant ids.
   */
  loadIdeaDetail(
    nodeId: string,
    scope: TenantScope,
  ): Promise<LabIdeaDetailView | LabIdeaGraphFailure>;

  /**
   * One idea's derivation chain alone (the LAB-003 traceDerivation
   * operation, surfaced directly): the steps from the idea back to the
   * acquired content artifacts. `lab-idea-not-found` for unknown/
   * cross-tenant ids.
   */
  loadIdeaDerivation(
    nodeId: string,
    scope: TenantScope,
  ): Promise<readonly LabDerivationStepView[] | LabIdeaGraphFailure>;
}
