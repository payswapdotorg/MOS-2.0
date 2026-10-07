import type { TenantScope } from '@mos/contracts';
import type { TransformDefinitionRegistry } from '../contracts/transform-definition.js';
import type {
  ArtifactFlowEdge,
  TransformApplicationNode,
  TransformGraphError,
} from '../contracts/transform-graph.js';
import { isBlankString, isPlainObject, isPositiveInteger } from './parametric-support.js';

/**
 * INTERNAL write-time validation for the in-memory transform graph
 * (LAB-011). NOT exported from the package index — implementation detail.
 *
 * Enforced on EVERY create/append, so every stored graph version is a
 * well-formed DAG over resolvable definitions:
 * - node and edge ids are unique within the graph;
 * - at most ONE artifact-flow edge per node pair (one edge carries the
 *   upstream output; multi-output binding is an execution-time concern);
 * - every edge connects nodes present in the graph;
 * - every node cites a transform definition that resolves at the EXACT cited
 *   version (`unknown-transform-definition` / `transform-definition-version-mismatch`);
 * - the artifact flow stays ACYCLIC (a production graph is a DAG);
 * - external input artifact refs belong to the tenant scope.
 *
 * Input-constraint satisfaction (types / modality / cardinality / rights) is
 * NOT checked here — graphs are built incrementally and intermediate
 * versions may legitimately have nodes whose upstream edges arrive in later
 * appends; `validateTransformGraph` performs that check on demand.
 */

const fail = (error: TransformGraphError['error'], message: string): TransformGraphError => ({
  error,
  message,
});

/** Structural check of one external artifact ref (canonical ArtifactRef shape). */
const artifactRefProblem = (artifact: unknown, nodeId: string, index: number): string | null => {
  if (!isPlainObject(artifact)) {
    return `node ${nodeId} input #${index} must be an ArtifactRef object`;
  }
  const requiredNonBlank: readonly string[] = [
    'artifactId',
    'digest',
    'type',
    'storageRef',
    'provenanceRef',
  ];
  for (const field of requiredNonBlank) {
    const value = artifact[field];
    if (typeof value !== 'string' || isBlankString(value)) {
      return `node ${nodeId} input #${index} artifact ref field ${field} must be a non-blank string`;
    }
  }
  if (!isPositiveInteger(artifact.version)) {
    return `node ${nodeId} input #${index} artifact ref version must be an integer ≥ 1`;
  }
  if (typeof artifact.tenantId !== 'string' || isBlankString(artifact.tenantId)) {
    return `node ${nodeId} input #${index} artifact ref tenantId must be a non-blank string`;
  }
  // rightsRef must be PRESENT as a string but MAY be blank: carrying a
  // rights reference is a DECLARED input constraint, validated where
  // declared (`input-rights-missing`), never a blanket write-time rule.
  if (typeof artifact.rightsRef !== 'string') {
    return `node ${nodeId} input #${index} artifact ref rightsRef must be a string (blank means no rights context attached)`;
  }
  return null;
};

const nodeProblem = (node: unknown): string | null => {
  if (!isPlainObject(node)) {
    return 'every node must be a TransformApplicationNode object';
  }
  if (typeof node.nodeId !== 'string' || isBlankString(node.nodeId)) {
    return 'node.nodeId must be a non-blank string';
  }
  if (typeof node.definitionId !== 'string' || isBlankString(node.definitionId)) {
    return `node ${node.nodeId} definitionId must be a non-blank string`;
  }
  if (!isPositiveInteger(node.definitionVersion)) {
    return `node ${node.nodeId} definitionVersion must be an integer ≥ 1`;
  }
  if (!Array.isArray(node.inputs)) {
    return `node ${node.nodeId} inputs must be an array of artifact refs`;
  }
  for (const [index, artifact] of node.inputs.entries()) {
    const problem = artifactRefProblem(artifact, node.nodeId, index);
    if (problem !== null) {
      return problem;
    }
  }
  if (!isPlainObject(node.parameterization)) {
    return `node ${node.nodeId} parameterization must be a JSON object (schema satisfaction is an execution-time concern)`;
  }
  return null;
};

const edgeProblem = (edge: unknown): string | null => {
  if (!isPlainObject(edge)) {
    return 'every edge must be an ArtifactFlowEdge object';
  }
  if (typeof edge.edgeId !== 'string' || isBlankString(edge.edgeId)) {
    return 'edge.edgeId must be a non-blank string';
  }
  if (typeof edge.fromNodeId !== 'string' || isBlankString(edge.fromNodeId)) {
    return `edge ${edge.edgeId} fromNodeId must be a non-blank string`;
  }
  if (typeof edge.toNodeId !== 'string' || isBlankString(edge.toNodeId)) {
    return `edge ${edge.edgeId} toNodeId must be a non-blank string`;
  }
  return null;
};

/** Would adding `fromNodeId` → `toNodeId` close a cycle over the given edges? */
const closesCycle = (
  edges: readonly ArtifactFlowEdge[],
  fromNodeId: string,
  toNodeId: string,
): boolean => {
  if (fromNodeId === toNodeId) {
    return true;
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, list);
  }
  const visited = new Set<string>([toNodeId]);
  let frontier = [toNodeId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const target of adjacency.get(nodeId) ?? []) {
        if (target === fromNodeId) {
          return true;
        }
        if (!visited.has(target)) {
          visited.add(target);
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  return false;
};

/**
 * Validate a combined node/edge set (existing + new) against the write-time
 * invariants. Returns a typed failure or `null` when the append is sound.
 */
export const validateGraphWrite = async (
  scope: TenantScope,
  definitions: Pick<TransformDefinitionRegistry, 'getTransformDefinition'>,
  existingNodes: readonly TransformApplicationNode[],
  existingEdges: readonly ArtifactFlowEdge[],
  newNodes: readonly TransformApplicationNode[],
  newEdges: readonly ArtifactFlowEdge[],
): Promise<TransformGraphError | null> => {
  const nodeIds = new Set<string>(existingNodes.map((node) => node.nodeId));
  for (const node of newNodes) {
    const problem = nodeProblem(node);
    if (problem !== null) {
      return fail('invalid-input', problem);
    }
    if (nodeIds.has(node.nodeId)) {
      return fail('duplicate-node', `node id already exists in this graph: ${node.nodeId}`);
    }
    nodeIds.add(node.nodeId);
  }
  for (const node of newNodes) {
    // External artifact refs must belong to the tenant scope.
    for (const artifact of node.inputs) {
      if (artifact.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `node ${node.nodeId} input artifact ${artifact.artifactId} belongs to tenant ${artifact.tenantId}, not ${scope.tenantId}`,
        );
      }
    }
    // The cited definition must resolve at the EXACT cited version.
    const exact = await definitions.getTransformDefinition(
      scope,
      node.definitionId,
      node.definitionVersion,
    );
    if (exact === null) {
      const latest = await definitions.getTransformDefinition(scope, node.definitionId);
      if (latest === null) {
        return fail(
          'unknown-transform-definition',
          `node ${node.nodeId} cites unknown transform definition: ${node.definitionId}`,
        );
      }
      return fail(
        'transform-definition-version-mismatch',
        `node ${node.nodeId} cites definition ${node.definitionId} at version ${node.definitionVersion}, which does not resolve (latest is version ${latest.version})`,
      );
    }
  }
  const edgeIds = new Set<string>(existingEdges.map((edge) => edge.edgeId));
  const pairs = new Set<string>(
    existingEdges.map((edge) => `${edge.fromNodeId}\u0000${edge.toNodeId}`),
  );
  const workingEdges = [...existingEdges];
  for (const edge of newEdges) {
    const problem = edgeProblem(edge);
    if (problem !== null) {
      return fail('invalid-input', problem);
    }
    if (edgeIds.has(edge.edgeId)) {
      return fail('duplicate-edge', `edge id already exists in this graph: ${edge.edgeId}`);
    }
    edgeIds.add(edge.edgeId);
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      return fail(
        'unknown-node',
        `artifact-flow edge ${edge.edgeId} references a node that is not in the graph (${edge.fromNodeId} → ${edge.toNodeId})`,
      );
    }
    const pairKey = `${edge.fromNodeId}\u0000${edge.toNodeId}`;
    if (pairs.has(pairKey)) {
      return fail(
        'invalid-input',
        `duplicate artifact flow between the same node pair (${edge.fromNodeId} → ${edge.toNodeId}): one edge carries the upstream output; multi-output binding is an execution-time concern`,
      );
    }
    pairs.add(pairKey);
    if (closesCycle(workingEdges, edge.fromNodeId, edge.toNodeId)) {
      return fail(
        'artifact-flow-cycle',
        `artifact-flow edge ${edge.edgeId} (${edge.fromNodeId} → ${edge.toNodeId}) would close a cycle in the artifact flow — a production graph is a DAG`,
      );
    }
    workingEdges.push(edge);
  }
  return null;
};
