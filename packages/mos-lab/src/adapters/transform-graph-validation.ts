import type { ArtifactRef, TransformId } from '@mos/contracts';
import type { TransformDefinition } from '../contracts/transform-definition.js';
import type { ReferenceModality } from '../contracts/corpus.js';
import type {
  ArtifactFlowEdge,
  TransformApplicationNode,
  TransformGraph,
  TransformGraphValidationFailure,
} from '../contracts/transform-graph.js';

/**
 * INTERNAL pure validation logic for the in-memory transform graph
 * (LAB-011). NOT exported from the package index — implementation detail.
 *
 * Validates one stored graph version: STRUCTURE (every node's transform
 * definition resolves at its EXACT cited version; every artifact-flow edge
 * connects existing nodes; the artifact flow is acyclic — a production graph
 * is a DAG) and CONSTRAINTS (per node: total input cardinality, external
 * input artifact types/modalities/rights, and upstream output types, all
 * against the definition's NAMED input constraint).
 *
 * The modality of an artifact type is derived by the DOCUMENTED coarse
 * mapping below (top-level MIME class; single-token coarse labels pass
 * through; anything else is `structured`). This is classification of a
 * DECLARED type string — never inference from content or accessibility.
 */

/**
 * Derive the content modality of a declared artifact type. Documented coarse
 * mapping: `video/*`→video, `audio/*`→audio, `image/*`→image, `text/*`→text,
 * `multipart/*`→mixed, coarse single-token labels (`video`, `audio`, …)
 * pass through, everything else (e.g. `application/json`) is `structured`.
 */
export const deriveModality = (artifactType: string): ReferenceModality => {
  if (artifactType === 'mixed') {
    return 'mixed';
  }
  switch (artifactType.split('/')[0]) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'text':
      return 'text';
    case 'multipart':
      return 'mixed';
    default:
      return 'structured';
  }
};

/** Definition resolver: exact version when given, latest when omitted. */
export type DefinitionResolver = (
  definitionId: TransformId,
  version?: number,
) => Promise<TransformDefinition | null>;

const failure = (
  code: TransformGraphValidationFailure['code'],
  nodeId: string,
  message: string,
  constraintName?: string,
): TransformGraphValidationFailure => ({
  code,
  nodeId,
  constraintName,
  message,
});

/** In-degree table over the given nodes, induced by the given edges. */
const inDegrees = (
  nodes: readonly TransformApplicationNode[],
  edges: readonly ArtifactFlowEdge[],
): Map<string, number> => {
  const degrees = new Map<string, number>(nodes.map((node) => [node.nodeId, 0]));
  for (const edge of edges) {
    if (degrees.has(edge.fromNodeId) && degrees.has(edge.toNodeId)) {
      degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
    }
  }
  return degrees;
};

/**
 * Kahn topological order over the given node list (the list's own order is
 * the deterministic tie-break; edges are induced by node membership). Nodes
 * that cannot be emitted form a cycle (`cyclic`).
 */
export const topologicalOrder = (
  nodes: readonly TransformApplicationNode[],
  edges: readonly ArtifactFlowEdge[],
): { readonly ordered: readonly TransformApplicationNode[]; readonly cyclic: readonly string[] } => {
  const degrees = inDegrees(nodes, edges);
  const ordered: TransformApplicationNode[] = [];
  const remaining = new Map(degrees);
  while (remaining.size > 0) {
    const ready = nodes.find(
      (node) => remaining.has(node.nodeId) && remaining.get(node.nodeId) === 0,
    );
    if (ready === undefined) {
      break;
    }
    remaining.delete(ready.nodeId);
    ordered.push(ready);
    for (const edge of edges) {
      if (edge.fromNodeId === ready.nodeId && remaining.has(edge.toNodeId)) {
        remaining.set(edge.toNodeId, (remaining.get(edge.toNodeId) ?? 1) - 1);
      }
    }
  }
  return { ordered, cyclic: [...remaining.keys()] };
};

/**
 * Validate one graph version (structural + constraint). Returns every named
 * failure in deterministic order: per-node definition resolution (graph
 * order), edge endpoints (edge order), one cycle failure, then per-node
 * constraint failures (graph order: cardinality, external inputs in order,
 * incoming edges in order).
 */
export const validateTransformGraphVersion = async (
  graph: TransformGraph,
  resolveDefinition: DefinitionResolver,
): Promise<readonly TransformGraphValidationFailure[]> => {
  const failures: TransformGraphValidationFailure[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));

  // ---- Structural: definition resolution at the EXACT cited versions ----
  const resolved = new Map<string, TransformDefinition>();
  for (const node of graph.nodes) {
    const exact = await resolveDefinition(node.definitionId, node.definitionVersion);
    if (exact !== null) {
      resolved.set(node.nodeId, exact);
      continue;
    }
    const latest = await resolveDefinition(node.definitionId);
    if (latest === null) {
      failures.push(
        failure(
          'unknown-transform-definition',
          node.nodeId,
          `transform node ${node.nodeId} cites unknown transform definition: ${node.definitionId}`,
        ),
      );
    } else {
      failures.push(
        failure(
          'transform-definition-version-mismatch',
          node.nodeId,
          `transform node ${node.nodeId} cites definition ${node.definitionId} at version ${node.definitionVersion}, which does not resolve (latest is version ${latest.version})`,
        ),
      );
    }
  }

  // ---- Structural: edge endpoints ----
  for (const edge of graph.edges) {
    for (const endpoint of [edge.fromNodeId, edge.toNodeId]) {
      if (!nodeIds.has(endpoint)) {
        failures.push(
          failure(
            'unknown-node',
            endpoint,
            `artifact-flow edge ${edge.edgeId} references node that is not in the graph: ${endpoint}`,
          ),
        );
      }
    }
  }

  // ---- Structural: the artifact flow is a DAG ----
  const { cyclic } = topologicalOrder(graph.nodes, graph.edges);
  if (cyclic.length > 0) {
    failures.push(
      failure(
        'artifact-flow-cycle',
        cyclic[0] as string,
        `the artifact flow is cyclic (a production graph is a DAG): cycle participants: ${cyclic.join(', ')}`,
      ),
    );
  }

  // ---- Constraints: the named input constraint of every resolvable node ----
  const incoming = new Map<string, ArtifactFlowEdge[]>(
    graph.nodes.map((node) => [node.nodeId, []]),
  );
  for (const edge of graph.edges) {
    incoming.get(edge.toNodeId)?.push(edge);
  }
  for (const node of graph.nodes) {
    const definition = resolved.get(node.nodeId);
    if (definition === undefined) {
      continue;
    }
    const constraint = definition.inputConstraint;
    const nodeIncoming = incoming.get(node.nodeId) ?? [];
    const totalInputs = node.inputs.length + nodeIncoming.length;
    if (totalInputs < constraint.minInputs) {
      failures.push(
        failure(
          'input-count-below-minimum',
          node.nodeId,
          `transform node ${node.nodeId} has ${totalInputs} input(s) but definition ${definition.id}@${definition.version} requires at least ${constraint.minInputs} (constraint '${constraint.name}')`,
          constraint.name,
        ),
      );
    }
    if (totalInputs > constraint.maxInputs) {
      failures.push(
        failure(
          'input-count-above-maximum',
          node.nodeId,
          `transform node ${node.nodeId} has ${totalInputs} input(s) but definition ${definition.id}@${definition.version} accepts at most ${constraint.maxInputs} (constraint '${constraint.name}')`,
          constraint.name,
        ),
      );
    }
    // External input artifacts: declared types, derived modalities, rights.
    for (const artifact of node.inputs) {
      checkArtifactAgainstConstraint(artifact, node, definition, failures);
    }
    // Upstream outputs: every declared output type of each upstream node
    // must satisfy the downstream constraint (conservative fail-closed).
    for (const edge of nodeIncoming) {
      const upstream = graph.nodes.find((entry) => entry.nodeId === edge.fromNodeId);
      const upstreamDefinition =
        upstream === undefined ? undefined : resolved.get(upstream.nodeId);
      if (upstreamDefinition === undefined) {
        continue;
      }
      for (const outputType of upstreamDefinition.outputContract.outputTypes) {
        if (!constraint.acceptedTypes.includes(outputType)) {
          failures.push(
            failure(
              'input-type-mismatch',
              node.nodeId,
              `transform node ${node.nodeId} (constraint '${constraint.name}') cannot accept the declared output type '${outputType}' of upstream ${edge.fromNodeId} (definition ${upstreamDefinition.id}@${upstreamDefinition.version})`,
              constraint.name,
            ),
          );
        }
        if (!constraint.acceptedModalities.includes(deriveModality(outputType))) {
          failures.push(
            failure(
              'input-modality-mismatch',
              node.nodeId,
              `transform node ${node.nodeId} (constraint '${constraint.name}') does not accept modality '${deriveModality(outputType)}' of the declared output type '${outputType}' of upstream ${edge.fromNodeId}`,
              constraint.name,
            ),
          );
        }
      }
    }
  }
  return failures;
};

/** Check one external artifact ref against a node definition's input constraint. */
const checkArtifactAgainstConstraint = (
  artifact: ArtifactRef,
  node: TransformApplicationNode,
  definition: TransformDefinition,
  failures: TransformGraphValidationFailure[],
): void => {
  const constraint = definition.inputConstraint;
  if (!constraint.acceptedTypes.includes(artifact.type)) {
    failures.push(
      failure(
        'input-type-mismatch',
        node.nodeId,
        `transform node ${node.nodeId} (constraint '${constraint.name}') does not accept artifact type '${artifact.type}' (artifact ${artifact.artifactId}@${artifact.version})`,
        constraint.name,
      ),
    );
  }
  const modality = deriveModality(artifact.type);
  if (!constraint.acceptedModalities.includes(modality)) {
    failures.push(
      failure(
        'input-modality-mismatch',
        node.nodeId,
        `transform node ${node.nodeId} (constraint '${constraint.name}') does not accept modality '${modality}' of artifact type '${artifact.type}' (artifact ${artifact.artifactId}@${artifact.version})`,
        constraint.name,
      ),
    );
  }
  if (constraint.requiresRights && artifact.rightsRef.trim().length === 0) {
    failures.push(
      failure(
        'input-rights-missing',
        node.nodeId,
        `transform node ${node.nodeId} (constraint '${constraint.name}') requires input artifacts to carry a rights reference, but artifact ${artifact.artifactId}@${artifact.version} carries none`,
        constraint.name,
      ),
    );
  }
};
