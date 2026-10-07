import type {
  ArtifactRef,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type {
  TransformDefinition,
  TransformDefinitionRegistry,
} from '../contracts/transform-definition.js';
import type {
  AppendToTransformGraphInput,
  ArtifactFlowEdge,
  CreateTransformGraphInput,
  TransformApplicationNode,
  TransformArtifactQuery,
  TransformGraph,
  TransformGraphError,
  TransformGraphId,
  TransformGraphPort,
  TransformGraphValidation,
  TransformLineage,
  TransformSubgraph,
} from '../contracts/transform-graph.js';
import { cloneDeep, deepFreeze, isBlankString, isPlainObject } from './parametric-support.js';
import { validateGraphWrite } from './transform-graph-write-checks.js';
import { topologicalOrder, validateTransformGraphVersion } from './transform-graph-validation.js';

/**
 * Options for {@link createInMemoryTransformGraph}.
 *
 * `definitions` is the narrow structural view of a transform definition
 * registry used to resolve the definitions graph nodes cite (at their EXACT
 * cited versions). `now` is injectable for deterministic timestamps.
 */
export interface InMemoryTransformGraphOptions {
  readonly definitions: Pick<TransformDefinitionRegistry, 'getTransformDefinition'>;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

/**
 * Build an in-memory {@link TransformGraphPort}.
 *
 * W5-A GROUNDWORK DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). Graphs are VERSIONED append-only snapshots keyed
 * per (tenant, graph id): every append creates version + 1 and every prior
 * version stays resolvable bit-for-bit through
 * `getTransformGraph(scope, id, version)`; records are deep-frozen with
 * CLONE-THEN-FREEZE ownership semantics (caller data is never frozen or
 * retained in place).
 *
 * Write-time invariants (enforced on every create/append by the internal
 * write-checks module, so every stored version is a well-formed DAG over
 * resolvable definitions): unique node and edge ids, at most ONE
 * artifact-flow edge per node pair, edge endpoints exist, no cycles,
 * external input artifact refs carry the tenant scope, and every node cites
 * a definition resolving at its EXACT cited version. Input-constraint
 * satisfaction (types / modality / cardinality / rights) is validated on
 * demand by `validateTransformGraph` — graphs are built incrementally and
 * intermediate versions may legitimately have nodes whose upstream edges
 * arrive in later appends.
 *
 * DECLARATIVE ONLY: nothing here executes a transform, selects an engine or
 * materializes an artifact (execution is Lab runs / production programs /
 * the ENG runner — LAB-012 / LAB-016).
 */
export function createInMemoryTransformGraph(
  options: InMemoryTransformGraphOptions,
): TransformGraphPort {
  const now = options.now ?? nowDefault;
  const definitions = options.definitions;

  /** Graph version chains keyed per (tenant, graph id): composite key → versions, oldest first. */
  const chains = new Map<string, TransformGraph[]>();

  const key = (tenantId: string, graphId: TransformGraphId): string =>
    `${tenantId}\u0000${graphId}`;

  const fail = (
    error: TransformGraphError['error'],
    message: string,
  ): TransformGraphError => ({ error, message });

  const graphNotFound = (graphId: TransformGraphId, version?: number): TransformGraphError =>
    fail(
      'graph-not-found',
      `transform graph ${graphId}${version === undefined ? ' (latest)' : `@${version}`} does not resolve in this tenant scope`,
    );

  const resolveVersion = (
    scope: TenantScope,
    graphId: TransformGraphId,
    version?: number,
  ): TransformGraph | undefined => {
    const chain = chains.get(key(scope.tenantId, graphId));
    if (chain === undefined) {
      return undefined;
    }
    return version === undefined
      ? chain[chain.length - 1]
      : chain.find((entry) => entry.version === version);
  };

  // -------------------------------------------------------------------------
  // Version snapshots (clone-then-freeze ownership)
  // -------------------------------------------------------------------------

  const freezeNode = (node: TransformApplicationNode): TransformApplicationNode =>
    Object.freeze({
      nodeId: node.nodeId,
      definitionId: node.definitionId,
      definitionVersion: node.definitionVersion,
      inputs: Object.freeze(node.inputs.map((artifact) => Object.freeze({ ...artifact }))),
      // Deep-freeze the cloned parameterization: it is arbitrary nested JSON,
      // and a stored graph version must be immutable all the way down (the
      // bit-for-bit append-only guarantee would not survive a mutable nested
      // parameterization).
      parameterization: deepFreeze(cloneDeep(node.parameterization)),
    });

  const freezeEdge = (edge: ArtifactFlowEdge): ArtifactFlowEdge => Object.freeze({ ...edge });

  const buildVersion = (
    scope: TenantScope,
    graphId: TransformGraphId,
    version: Version,
    nodes: readonly TransformApplicationNode[],
    edges: readonly ArtifactFlowEdge[],
  ): TransformGraph =>
    Object.freeze({
      id: graphId,
      version,
      tenantId: scope.tenantId,
      nodes: Object.freeze(nodes.map(freezeNode)),
      edges: Object.freeze(edges.map(freezeEdge)),
      createdAt: now(),
    });

  // -------------------------------------------------------------------------
  // Lineage / subgraph traversal helpers
  // -------------------------------------------------------------------------

  const consumingNodes = (
    graph: TransformGraph,
    query: TransformArtifactQuery,
  ): readonly TransformApplicationNode[] =>
    graph.nodes.filter((node) =>
      node.inputs.some(
        (artifact) =>
          artifact.artifactId === query.artifactId && artifact.version === query.version,
      ),
    );

  const matchedArtifact = (
    consumer: TransformApplicationNode,
    query: TransformArtifactQuery,
  ): ArtifactRef => {
    const artifact = consumer.inputs.find(
      (entry) => entry.artifactId === query.artifactId && entry.version === query.version,
    );
    return artifact as ArtifactRef;
  };

  /** Nodes reachable downstream from the given start set (start set included, transitive). */
  const downstreamClosure = (
    graph: TransformGraph,
    startNodeIds: readonly string[],
  ): Set<string> => {
    const reached = new Set<string>(startNodeIds);
    let frontier = [...startNodeIds];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        for (const edge of graph.edges) {
          if (edge.fromNodeId === nodeId && !reached.has(edge.toNodeId)) {
            reached.add(edge.toNodeId);
            next.push(edge.toNodeId);
          }
        }
      }
      frontier = next;
    }
    return reached;
  };

  /** Nodes that can reach the given target set (upstream ancestors, targets included). */
  const upstreamClosure = (
    graph: TransformGraph,
    targetNodeIds: readonly string[],
  ): Set<string> => {
    const reached = new Set<string>(targetNodeIds);
    let frontier = [...targetNodeIds];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        for (const edge of graph.edges) {
          if (edge.toNodeId === nodeId && !reached.has(edge.fromNodeId)) {
            reached.add(edge.fromNodeId);
            next.push(edge.fromNodeId);
          }
        }
      }
      frontier = next;
    }
    return reached;
  };

  const inducedEdges = (
    graph: TransformGraph,
    nodeSet: ReadonlySet<string>,
  ): readonly ArtifactFlowEdge[] =>
    graph.edges.filter((edge) => nodeSet.has(edge.fromNodeId) && nodeSet.has(edge.toNodeId));

  return {
    async createTransformGraph(
      input: CreateTransformGraphInput,
    ): Promise<TransformGraph | TransformGraphError> {
      if (!isPlainObject(input) || typeof input.id !== 'string' || isBlankString(input.id)) {
        return fail('invalid-input', 'transform graph id must be a non-blank string');
      }
      const newNodes = [...(input.nodes ?? [])];
      const newEdges = [...(input.edges ?? [])];
      if (newNodes.length === 0 && newEdges.length > 0) {
        return fail('invalid-input', 'edges cannot be created without nodes');
      }
      if (chains.get(key(input.scope.tenantId, input.id)) !== undefined) {
        return fail(
          'duplicate-graph',
          `transform graph already exists in this tenant scope: ${input.id}`,
        );
      }
      const writeProblem = await validateGraphWrite(
        input.scope,
        definitions,
        [],
        [],
        newNodes,
        newEdges,
      );
      if (writeProblem !== null) {
        return writeProblem;
      }
      const version1 = buildVersion(input.scope, input.id, 1 as Version, newNodes, newEdges);
      chains.set(key(input.scope.tenantId, input.id), [version1]);
      return version1;
    },

    async appendToTransformGraph(
      input: AppendToTransformGraphInput,
    ): Promise<TransformGraph | TransformGraphError> {
      if (!isPlainObject(input) || typeof input.graphId !== 'string' || isBlankString(input.graphId)) {
        return fail('invalid-input', 'graphId must be a non-blank string');
      }
      const newNodes = [...(input.nodes ?? [])];
      const newEdges = [...(input.edges ?? [])];
      if (newNodes.length === 0 && newEdges.length === 0) {
        return fail(
          'invalid-input',
          'append must carry at least one node or edge (append-only corrections have content)',
        );
      }
      const current = resolveVersion(input.scope, input.graphId);
      if (current === undefined) {
        return graphNotFound(input.graphId);
      }
      const writeProblem = await validateGraphWrite(
        input.scope,
        definitions,
        current.nodes,
        current.edges,
        newNodes,
        newEdges,
      );
      if (writeProblem !== null) {
        return writeProblem;
      }
      // Append-only correction: prior versions stay resolvable bit-for-bit
      // (their node/edge records are shared frozen objects, never rewritten).
      const appended = buildVersion(
        input.scope,
        input.graphId,
        (current.version + 1) as Version,
        [...current.nodes, ...newNodes],
        [...current.edges, ...newEdges],
      );
      chains.get(key(input.scope.tenantId, input.graphId))?.push(appended);
      return appended;
    },

    async getTransformGraph(
      scope: TenantScope,
      graphId: TransformGraphId,
      version?: number,
    ): Promise<TransformGraph | null> {
      const graph = resolveVersion(scope, graphId, version);
      return graph === undefined ? null : graph;
    },

    async validateTransformGraph(
      scope: TenantScope,
      graphId: TransformGraphId,
      version?: number,
    ): Promise<TransformGraphValidation | TransformGraphError> {
      const graph = resolveVersion(scope, graphId, version);
      if (graph === undefined) {
        return graphNotFound(graphId, version);
      }
      const failures = await validateTransformGraphVersion(graph, (definitionId, atVersion) =>
        definitions.getTransformDefinition(scope, definitionId, atVersion),
      );
      return Object.freeze({
        graphId: graph.id,
        graphVersion: graph.version,
        valid: failures.length === 0,
        failures: Object.freeze([...failures]),
      });
    },

    async traceArtifactLineage(
      scope: TenantScope,
      graphId: TransformGraphId,
      query: TransformArtifactQuery,
      version?: number,
    ): Promise<TransformLineage | TransformGraphError> {
      const graph = resolveVersion(scope, graphId, version);
      if (graph === undefined) {
        return graphNotFound(graphId, version);
      }
      const consumers = consumingNodes(graph, query);
      if (consumers.length === 0) {
        return fail(
          'artifact-not-in-graph',
          `artifact ${query.artifactId}@${query.version} is not an external input of graph ${graphId}@${graph.version}`,
        );
      }
      // The artifact's downstream cone: the direct consumers plus every node
      // reachable from them, in deterministic topological order.
      const downstream = downstreamClosure(
        graph,
        consumers.map((node) => node.nodeId),
      );
      const downstreamNodes = topologicalOrder(
        graph.nodes.filter((node) => downstream.has(node.nodeId)),
        graph.edges,
      ).ordered;
      const definitionsFor: TransformDefinition[] = [];
      for (const node of downstreamNodes) {
        const definition = await definitions.getTransformDefinition(
          scope,
          node.definitionId,
          node.definitionVersion,
        );
        if (definition === null) {
          return fail(
            'unknown-transform-definition',
            `integrity failure: node ${node.nodeId} cites definition ${node.definitionId}@${node.definitionVersion} which no longer resolves`,
          );
        }
        definitionsFor.push(definition);
      }
      const firstConsumer = consumers[0] as TransformApplicationNode;
      return Object.freeze({
        graphId: graph.id,
        graphVersion: graph.version,
        artifact: matchedArtifact(firstConsumer, query),
        directConsumerNodeIds: Object.freeze(consumers.map((node) => node.nodeId)),
        downstreamNodes: Object.freeze(downstreamNodes),
        definitions: Object.freeze(definitionsFor),
        edges: Object.freeze(inducedEdges(graph, downstream)),
      });
    },

    async querySubgraph(
      scope: TenantScope,
      graphId: TransformGraphId,
      query: TransformArtifactQuery,
      version?: number,
    ): Promise<TransformSubgraph | TransformGraphError> {
      const graph = resolveVersion(scope, graphId, version);
      if (graph === undefined) {
        return graphNotFound(graphId, version);
      }
      const consumers = consumingNodes(graph, query);
      if (consumers.length === 0) {
        return fail(
          'artifact-not-in-graph',
          `artifact ${query.artifactId}@${query.version} is not an external input of graph ${graphId}@${graph.version}`,
        );
      }
      // The production cone around the artifact: its downstream nodes plus
      // their transitive upstream ancestors (co-input branches included).
      const downstream = downstreamClosure(
        graph,
        consumers.map((node) => node.nodeId),
      );
      const cone = upstreamClosure(graph, [...downstream]);
      const firstConsumer = consumers[0] as TransformApplicationNode;
      return Object.freeze({
        graphId: graph.id,
        graphVersion: graph.version,
        artifact: matchedArtifact(firstConsumer, query),
        nodes: Object.freeze(graph.nodes.filter((node) => cone.has(node.nodeId))),
        edges: Object.freeze(inducedEdges(graph, cone)),
      });
    },
  };
}
