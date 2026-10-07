import type { TenantScope, Timestamp, Version } from '@mos/contracts';
import type { CorpusStore, ReferenceDocumentId } from '../contracts/corpus.js';
import type { FeatureBundleId, FeatureBundleRegistry } from '../contracts/feature-bundle.js';
import type {
  AddIdeaEdgeInput,
  AddIdeaNodeInput,
  DerivationStep,
  IdeaEdge,
  IdeaEdgeId,
  IdeaGraph,
  IdeaGraphError,
  IdeaGraphErrorCode,
  IdeaNeighborhood,
  IdeaNeighborhoodQuery,
  IdeaNode,
  IdeaNodeId,
  ReviseIdeaNodeInput,
  UpdateIdeaEdgeInput,
} from '../contracts/idea-graph.js';

/**
 * Options for {@link createInMemoryIdeaGraph}.
 *
 * `corpus` and `bundles` are narrow structural views used to validate idea
 * derivations against the tenant's corpus evidence (documents) and feature
 * bundles, and to resolve derivation chains during tracing. `now` is
 * injectable for deterministic timestamps.
 */
export interface InMemoryIdeaGraphOptions {
  readonly corpus: Pick<CorpusStore, 'getReferenceDocument'>;
  readonly bundles: Pick<FeatureBundleRegistry, 'getFeatureBundle'>;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

/**
 * Build an in-memory {@link IdeaGraph}.
 *
 * W2-A GROUNDWORK DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). Nodes and edges are versioned append-only:
 * revisions append version + 1 and prior versions stay retrievable through
 * `getIdeaNode(scope, id, version)`; nothing is ever hard-deleted.
 *
 * DERIVATION INTEGRITY is enforced at write time: an idea without derivation
 * refs is rejected (`empty-derivation`), and every referenced corpus
 * document / feature bundle must resolve in the tenant scope
 * (`unknown-derivation-ref`) — ideas never float free of corpus evidence.
 */
export function createInMemoryIdeaGraph(options: InMemoryIdeaGraphOptions): IdeaGraph {
  const now = options.now ?? nowDefault;
  const corpus = options.corpus;
  const bundles = options.bundles;

  /** Idea node version chains: node id → versions, oldest first. */
  const nodeChains = new Map<IdeaNodeId, IdeaNode[]>();
  /** Idea edge version chains: edge id → versions, oldest first. */
  const edgeChains = new Map<IdeaEdgeId, IdeaEdge[]>();

  const fail = (error: IdeaGraphErrorCode, message: string): IdeaGraphError => ({
    error,
    message,
  });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  const latestNode = (id: IdeaNodeId): IdeaNode | undefined => {
    const chain = nodeChains.get(id);
    return chain === undefined || chain.length === 0 ? undefined : chain[chain.length - 1];
  };

  const latestEdge = (id: IdeaEdgeId): IdeaEdge | undefined => {
    const chain = edgeChains.get(id);
    return chain === undefined || chain.length === 0 ? undefined : chain[chain.length - 1];
  };

  const resolveNodeInScope = (scope: TenantScope, id: IdeaNodeId): IdeaNode | null => {
    const node = latestNode(id);
    if (node === undefined || node.tenantId !== scope.tenantId) {
      // Unknown and cross-tenant are indistinguishable on reads: no leak.
      return null;
    }
    return node;
  };

  const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

  /**
   * DERIVATION VALIDATION (LAB-003 acceptance): at least one derivation ref
   * overall, and every referenced corpus document / feature bundle must
   * resolve in the tenant scope.
   */
  const validateDerivation = async (
    scope: TenantScope,
    nodeId: string,
    derivation: { documents: readonly ReferenceDocumentId[]; featureBundles: readonly FeatureBundleId[] },
  ): Promise<IdeaGraphError | null> => {
    if (derivation.documents.length === 0 && derivation.featureBundles.length === 0) {
      return fail(
        'empty-derivation',
        `idea ${nodeId} carries no derivation refs — every idea must derive from corpus documents and/or feature bundles`,
      );
    }
    for (const documentId of derivation.documents) {
      const document = await corpus.getReferenceDocument(scope, documentId);
      if (document === null) {
        return fail(
          'unknown-derivation-ref',
          `idea ${nodeId} derives from unknown corpus document: ${documentId}`,
        );
      }
    }
    for (const bundleId of derivation.featureBundles) {
      const bundle = await bundles.getFeatureBundle(scope, bundleId);
      if (bundle === null) {
        return fail(
          'unknown-derivation-ref',
          `idea ${nodeId} derives from unknown feature bundle: ${bundleId}`,
        );
      }
    }
    return null;
  };

  const freezeNode = (node: IdeaNode): IdeaNode =>
    Object.freeze({
      ...node,
      derivation: Object.freeze({
        documents: Object.freeze([...node.derivation.documents]),
        featureBundles: Object.freeze([...node.derivation.featureBundles]),
      }),
      embeddingRef: node.embeddingRef === null ? null : Object.freeze({ ...node.embeddingRef }),
    });

  const validateEmbeddingRef = (
    scope: TenantScope,
    nodeId: string,
    embeddingRef: IdeaNode['embeddingRef'],
  ): IdeaGraphError | null => {
    if (embeddingRef !== null && embeddingRef.tenantId !== scope.tenantId) {
      return fail(
        'cross-tenant-reference',
        `idea ${nodeId} embedding artifact ${embeddingRef.artifactId} belongs to tenant ${embeddingRef.tenantId}, not ${scope.tenantId}`,
      );
    }
    return null;
  };

  return {
    async addIdeaNode(input: AddIdeaNodeInput): Promise<IdeaNode | IdeaGraphError> {
      if (isBlank(input.id)) {
        return fail('invalid-input', 'idea node id must not be blank');
      }
      if (isBlank(input.statement)) {
        return fail('invalid-input', 'idea statement must not be blank');
      }
      if (isBlank(input.provenanceRef)) {
        return fail('invalid-input', 'idea provenanceRef must not be blank');
      }
      if (nodeChains.has(input.id)) {
        return fail('duplicate-idea', `idea node already exists: ${input.id}`);
      }
      const embeddingError = validateEmbeddingRef(input.scope, input.id, input.embeddingRef ?? null);
      if (embeddingError !== null) {
        return embeddingError;
      }
      const derivationError = await validateDerivation(input.scope, input.id, input.derivation);
      if (derivationError !== null) {
        return derivationError;
      }
      const node = freezeNode({
        id: input.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        statement: input.statement,
        embeddingRef: input.embeddingRef ?? null,
        derivation: input.derivation,
        provenanceRef: input.provenanceRef,
        createdAt: now(),
      });
      nodeChains.set(node.id, [node]);
      return node;
    },

    async getIdeaNode(
      scope: TenantScope,
      id: IdeaNodeId,
      version?: number,
    ): Promise<IdeaNode | null> {
      const chain = nodeChains.get(id);
      if (chain === undefined) {
        return null;
      }
      const record =
        version === undefined ? chain[chain.length - 1] : chain.find((entry) => entry.version === version);
      if (record === undefined || record.tenantId !== scope.tenantId) {
        return null;
      }
      return record;
    },

    async reviseIdeaNode(input: ReviseIdeaNodeInput): Promise<IdeaNode | IdeaGraphError> {
      const current = latestNode(input.id);
      if (current === undefined) {
        return fail('idea-not-found', `idea node does not exist: ${input.id}`);
      }
      if (current.tenantId !== input.scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `idea node ${input.id} does not belong to tenant ${input.scope.tenantId}`,
        );
      }
      if (isBlank(input.statement)) {
        return fail('invalid-input', 'idea statement must not be blank');
      }
      if (isBlank(input.provenanceRef)) {
        return fail('invalid-input', 'idea provenanceRef must not be blank');
      }
      const embeddingError = validateEmbeddingRef(input.scope, input.id, input.embeddingRef ?? null);
      if (embeddingError !== null) {
        return embeddingError;
      }
      const derivationError = await validateDerivation(input.scope, input.id, input.derivation);
      if (derivationError !== null) {
        return derivationError;
      }
      // Append-only revision: the prior version stays retrievable.
      const revised = freezeNode({
        id: input.id,
        version: (current.version + 1) as Version,
        tenantId: input.scope.tenantId,
        statement: input.statement,
        embeddingRef: input.embeddingRef ?? null,
        derivation: input.derivation,
        provenanceRef: input.provenanceRef,
        createdAt: now(),
      });
      nodeChains.get(input.id)?.push(revised);
      return revised;
    },

    async addIdeaEdge(input: AddIdeaEdgeInput): Promise<IdeaEdge | IdeaGraphError> {
      if (isBlank(input.id)) {
        return fail('invalid-input', 'idea edge id must not be blank');
      }
      if (input.fromNodeId === input.toNodeId) {
        return fail('invalid-input', 'idea edges must connect two distinct nodes');
      }
      if (!(input.weight >= -1 && input.weight <= 1)) {
        return fail(
          'invalid-input',
          `idea edge weight must be within [-1, 1]: ${input.weight}`,
        );
      }
      if (edgeChains.has(input.id)) {
        return fail('duplicate-edge', `idea edge already exists: ${input.id}`);
      }
      const from = resolveNodeInScope(input.scope, input.fromNodeId);
      if (from === null) {
        return fail('idea-not-found', `idea node does not exist in this tenant scope: ${input.fromNodeId}`);
      }
      const to = resolveNodeInScope(input.scope, input.toNodeId);
      if (to === null) {
        return fail('idea-not-found', `idea node does not exist in this tenant scope: ${input.toNodeId}`);
      }
      const edge: IdeaEdge = Object.freeze({
        id: input.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        kind: input.kind,
        weight: input.weight,
        createdAt: now(),
      });
      edgeChains.set(edge.id, [edge]);
      return edge;
    },

    async getIdeaEdge(scope: TenantScope, id: IdeaEdgeId): Promise<IdeaEdge | null> {
      const edge = latestEdge(id);
      if (edge === undefined || edge.tenantId !== scope.tenantId) {
        return null;
      }
      return edge;
    },

    async updateIdeaEdge(input: UpdateIdeaEdgeInput): Promise<IdeaEdge | IdeaGraphError> {
      const current = latestEdge(input.id);
      if (current === undefined) {
        return fail('edge-not-found', `idea edge does not exist: ${input.id}`);
      }
      if (current.tenantId !== input.scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `idea edge ${input.id} does not belong to tenant ${input.scope.tenantId}`,
        );
      }
      const kind = input.kind ?? current.kind;
      const weight = input.weight ?? current.weight;
      if (!(weight >= -1 && weight <= 1)) {
        return fail('invalid-input', `idea edge weight must be within [-1, 1]: ${weight}`);
      }
      // Append-only correction: the prior version stays retrievable.
      const updated: IdeaEdge = Object.freeze({
        ...current,
        version: (current.version + 1) as Version,
        kind,
        weight,
        createdAt: now(),
      });
      edgeChains.get(input.id)?.push(updated);
      return updated;
    },

    async queryNeighborhood(
      scope: TenantScope,
      nodeId: IdeaNodeId,
      query?: IdeaNeighborhoodQuery,
    ): Promise<IdeaNeighborhood | IdeaGraphError> {
      const root = resolveNodeInScope(scope, nodeId);
      if (root === null) {
        return fail('idea-not-found', `idea node does not exist in this tenant scope: ${nodeId}`);
      }
      const radius = query?.radius ?? 1;
      if (!(radius >= 0)) {
        return fail('invalid-input', `neighborhood radius must be ≥ 0: ${radius}`);
      }
      // Latest-version edges of this tenant only.
      const tenantEdges: IdeaEdge[] = [];
      for (const chain of edgeChains.values()) {
        const latest = chain[chain.length - 1];
        if (latest !== undefined && latest.tenantId === scope.tenantId) {
          tenantEdges.push(latest);
        }
      }
      // Undirected BFS by hop distance from the root.
      const reached = new Map<IdeaNodeId, IdeaNode>([[root.id, root]]);
      let frontier = new Set<IdeaNodeId>([root.id]);
      for (let depth = 1; depth <= radius && frontier.size > 0; depth++) {
        const next = new Set<IdeaNodeId>();
        for (const edge of tenantEdges) {
          let otherId: IdeaNodeId | null = null;
          if (frontier.has(edge.fromNodeId) && !reached.has(edge.toNodeId)) {
            otherId = edge.toNodeId;
          } else if (frontier.has(edge.toNodeId) && !reached.has(edge.fromNodeId)) {
            otherId = edge.fromNodeId;
          }
          if (otherId !== null) {
            const other = resolveNodeInScope(scope, otherId);
            if (other !== null) {
              reached.set(otherId, other);
              next.add(otherId);
            }
          }
        }
        frontier = next;
      }
      // The neighborhood is the induced subgraph: every tenant edge whose
      // both endpoints lie within the reached set.
      const edges = tenantEdges
        .filter((edge) => reached.has(edge.fromNodeId) && reached.has(edge.toNodeId))
        .sort((a, b) => compareIds(a.id, b.id));
      const nodes = [...reached.values()].sort((a, b) => compareIds(a.id, b.id));
      return { rootId: root.id, nodes, edges };
    },

    async traceDerivation(
      scope: TenantScope,
      nodeId: IdeaNodeId,
    ): Promise<readonly DerivationStep[] | IdeaGraphError> {
      const root = resolveNodeInScope(scope, nodeId);
      if (root === null) {
        return fail('idea-not-found', `idea node does not exist in this tenant scope: ${nodeId}`);
      }
      const steps: DerivationStep[] = [];
      const seenIdeas = new Set<IdeaNodeId>();
      const seenDocuments = new Set<ReferenceDocumentId>();
      const seenBundles = new Set<FeatureBundleId>();

      // BFS upstream over outgoing `derives-from` edges (X derives-from Y
      // means Y is upstream evidence for X), plus each idea's own
      // derivation refs resolved back to corpus evidence.
      let frontier: IdeaNode[] = [root];
      while (frontier.length > 0) {
        const next: IdeaNode[] = [];
        for (const idea of frontier) {
          if (seenIdeas.has(idea.id)) {
            continue;
          }
          seenIdeas.add(idea.id);
          steps.push({ kind: 'idea', nodeId: idea.id });
          // Feature bundles resolve to their corpus document.
          const bundleIds = [...idea.derivation.featureBundles].sort(compareIds);
          for (const bundleId of bundleIds) {
            if (seenBundles.has(bundleId)) {
              continue;
            }
            seenBundles.add(bundleId);
            const bundle = await bundles.getFeatureBundle(scope, bundleId);
            if (bundle === null) {
              return fail(
                'unknown-derivation-ref',
                `idea ${idea.id} derives from feature bundle missing from this tenant scope: ${bundleId}`,
              );
            }
            steps.push({
              kind: 'feature-bundle',
              bundleId,
              documentId: bundle.documentId,
            });
          }
          // Corpus documents resolve to the acquired artifact reference.
          const documentIds = [...idea.derivation.documents].sort(compareIds);
          for (const documentId of documentIds) {
            if (seenDocuments.has(documentId)) {
              continue;
            }
            seenDocuments.add(documentId);
            const document = await corpus.getReferenceDocument(scope, documentId);
            if (document === null) {
              return fail(
                'unknown-derivation-ref',
                `idea ${idea.id} derives from corpus document missing from this tenant scope: ${documentId}`,
              );
            }
            steps.push({
              kind: 'corpus-document',
              documentId,
              artifact: document.artifact,
            });
          }
          // Follow outgoing derives-from edges one level upstream.
          for (const chain of edgeChains.values()) {
            const latest = chain[chain.length - 1];
            if (
              latest === undefined ||
              latest.tenantId !== scope.tenantId ||
              latest.kind !== 'derives-from' ||
              latest.fromNodeId !== idea.id
            ) {
              continue;
            }
            const upstream = resolveNodeInScope(scope, latest.toNodeId);
            if (upstream !== null && !seenIdeas.has(upstream.id)) {
              next.push(upstream);
            }
          }
        }
        frontier = next;
      }
      return steps;
    },
  };
}
