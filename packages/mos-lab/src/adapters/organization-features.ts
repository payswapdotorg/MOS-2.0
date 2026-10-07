import type {
  AgentOrganizationRecord,
  OrganizationEdge,
  OrganizationEdgeKind,
  OrganizationMemorySharing,
} from '@mos/agents';
import { ORGANIZATION_SEARCH_DIMENSIONS } from '../contracts/organization-features.js';
import type {
  DeclaredOrganizationFeatures,
  OrganizationFeatureFingerprint,
  OrganizationSearchDimension,
  SearchedOrganizationCandidate,
} from '../contracts/organization-features.js';

/**
 * INTERNAL feature derivation + fingerprint + structural validation for the
 * LAB-010 organization search (NOT exported from the package index).
 *
 * SCOPE DISCIPLINE (disclosed): this validation is deliberately STRUCTURAL
 * ONLY — it mirrors the @mos/agents organization record invariants minus
 * body-registry resolution. Body refs are OPAQUE to the lab; body
 * existence/validation is the agents module's authority (the lab must not
 * become the organization authority). Mutations preserve body refs from
 * their parents.
 */

const EDGE_KINDS: readonly OrganizationEdgeKind[] = ['delegates-to', 'communicates-with', 'reports-to'];
const MEMORY_SHARINGS: readonly OrganizationMemorySharing[] = ['shared', 'isolated', 'hybrid'];
const MEMORY_SCOPES = new Set(['none', 'session', 'persistent']);
const ORDERING_MODES = new Set(['sequential', 'parallel', 'staged']);
const ORIGINS = new Set([
  'generalist-single-agent-baseline',
  'hand-designed',
  'composed',
  'generated',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const quantize = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Fault accumulator entry: a named structural rejection reason. */
export interface CandidateFault {
  readonly code: string;
  readonly detail: string;
}

/**
 * Structural validation of a searched candidate (fail-closed, EVERY named
 * reason at once). Empty result = valid. See the module docblock for the
 * deliberate scope (no body resolution — that is @mos/agents' authority).
 */
export function organizationCandidateFaults(
  candidate: SearchedOrganizationCandidate,
): readonly CandidateFault[] {
  const faults: CandidateFault[] = [];
  const fault = (code: string, detail: string): void => {
    faults.push({ code, detail });
  };
  if (!isPlainObject(candidate) || !isPlainObject(candidate.organization)) {
    return [{ code: 'invalid-candidate', detail: 'candidate must carry an organization record' }];
  }
  if (!ORIGINS.has(candidate.origin)) {
    fault('invalid-origin', `origin must be one of the four §23 origins (got: ${String(candidate.origin)})`);
  }
  const org = candidate.organization;
  if (!isNonBlank(org.id)) {
    fault('missing-required-field', 'organization.id must be a non-blank string');
  }
  if (!Number.isInteger(org.version) || (org.version as number) < 1) {
    fault('missing-required-field', 'organization.version must be an integer >= 1');
  }
  if (!isNonBlank(org.tenantId)) {
    fault('invalid-tenant-scope', 'organization.tenantId must be a non-blank tenant identifier');
  }
  if (!isNonBlank(org.evaluator)) {
    fault('invalid-evaluator', 'organization.evaluator must be a non-blank evaluator ref');
  }

  const nodes = org.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    fault('empty-organization', 'an organization must declare at least one node');
    return faults;
  }
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!isNonBlank(node.nodeId)) {
      fault('missing-required-field', 'every node must carry a non-blank nodeId');
      continue;
    }
    if (nodeIds.has(node.nodeId)) {
      fault('duplicate-node-id', `node id ${node.nodeId} is declared more than once`);
      continue;
    }
    nodeIds.add(node.nodeId);
    if (!isNonBlank(node.role)) {
      fault('missing-required-field', `node ${node.nodeId} must carry a non-blank role label`);
    }
    if (!isNonBlank(node.bodyId)) {
      fault('missing-required-field', `node ${node.nodeId} must reference a body id`);
    }
  }

  const edges = org.edges;
  if (!Array.isArray(edges)) {
    fault('missing-required-field', 'edges must be an array of typed edges');
  } else {
    for (const edge of edges) {
      if (!isPlainObject(edge)) {
        fault('missing-required-field', 'every edge must be an object');
        continue;
      }
      const { fromNodeId, toNodeId, kind } = edge;
      if (fromNodeId === toNodeId) {
        fault('self-referencing-edge', `edge ${String(fromNodeId)} -> ${String(toNodeId)} references the same node`);
      }
      if (!nodeIds.has(String(fromNodeId))) {
        fault('unknown-edge-endpoint', `edge references unknown from-node ${String(fromNodeId)}`);
      }
      if (!nodeIds.has(String(toNodeId))) {
        fault('unknown-edge-endpoint', `edge references unknown to-node ${String(toNodeId)}`);
      }
      if (!EDGE_KINDS.includes(kind as OrganizationEdgeKind)) {
        fault('invalid-edge-kind', `edge kind ${String(kind)} is not one of ${EDGE_KINDS.join(' | ')}`);
      }
    }
    if (hasCycleOver(edges as readonly OrganizationEdge[], 'delegates-to', nodeIds)) {
      fault('delegation-cycle', 'delegates-to edges form a cycle');
    }
    if (hasCycleOver(edges as readonly OrganizationEdge[], 'reports-to', nodeIds)) {
      fault('reporting-cycle', 'reports-to edges form a cycle');
    }
    const outDelegation = new Map<string, number>();
    for (const edge of edges as readonly OrganizationEdge[]) {
      if (edge.kind === 'delegates-to') {
        const count = (outDelegation.get(edge.fromNodeId) ?? 0) + 1;
        outDelegation.set(edge.fromNodeId, count);
        if (count > 1) {
          fault('duplicate-delegation', `node ${edge.fromNodeId} has more than one outgoing delegates-to edge`);
        }
      }
    }
  }

  const assignments = org.modelAssignments;
  if (!Array.isArray(assignments)) {
    fault('missing-required-field', 'modelAssignments must be an array');
  } else {
    const assigned = new Set<string>();
    for (const assignment of assignments) {
      if (!isPlainObject(assignment)) {
        fault('missing-required-field', 'every model assignment must be an object');
        continue;
      }
      const nodeId = String(assignment.nodeId);
      if (!nodeIds.has(nodeId)) {
        fault('unknown-model-assignment-node', `model assignment references unknown node ${nodeId}`);
        continue;
      }
      if (assigned.has(nodeId)) {
        fault('duplicate-model-assignment', `node ${nodeId} has more than one model assignment`);
        continue;
      }
      assigned.add(nodeId);
      if (!isNonBlank(assignment.modelRef)) {
        fault('missing-required-field', `model assignment for node ${nodeId} must carry a non-blank modelRef`);
      }
    }
    for (const nodeId of nodeIds) {
      if (!assigned.has(nodeId)) {
        fault('missing-model-assignment', `node ${nodeId} has no model assignment (must be explicit)`);
      }
    }
  }

  const memoryPolicy = org.memoryPolicy as unknown;
  if (
    !isPlainObject(memoryPolicy) ||
    !MEMORY_SCOPES.has(memoryPolicy.scope as string) ||
    !MEMORY_SHARINGS.includes(memoryPolicy.sharing as OrganizationMemorySharing)
  ) {
    fault('invalid-memory-policy', 'memoryPolicy must carry a scope (none | session | persistent) and a sharing mode (shared | isolated | hybrid)');
  }

  const budgetPolicy = org.budgetPolicy as unknown;
  if (!isPlainObject(budgetPolicy) || !isPlainObject(budgetPolicy.organization) || !isPlainObject(budgetPolicy.perNode)) {
    fault('invalid-budget-policy', 'budgetPolicy must carry organization and perNode budgets');
  } else {
    const moneyFault = (path: string, value: unknown): void => {
      if (!isPlainObject(value) || typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount < 0 || !isNonBlank(value.currency)) {
        fault('invalid-budget-policy', `${path} must carry a finite maxCost.amount >= 0 and a non-blank currency`);
      }
    };
    moneyFault('budgetPolicy.organization.maxCost', budgetPolicy.organization.maxCost);
    moneyFault('budgetPolicy.perNode.maxCost', budgetPolicy.perNode.maxCost);
    const duration = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    const orgDuration = duration(budgetPolicy.organization.maxDurationMs);
    const nodeDuration = duration(budgetPolicy.perNode.maxDurationMs);
    if (orgDuration === null || nodeDuration === null) {
      fault('invalid-budget-policy', 'budgetPolicy maxDurationMs values must be finite numbers >= 0');
    } else if (nodeDuration > orgDuration) {
      fault('budget-per-node-exceeds-organization', 'per-node maxDurationMs exceeds the organization maxDurationMs');
    }
    const orgCost = isPlainObject(budgetPolicy.organization.maxCost) ? budgetPolicy.organization.maxCost.amount : undefined;
    const nodeCost = isPlainObject(budgetPolicy.perNode.maxCost) ? budgetPolicy.perNode.maxCost.amount : undefined;
    if (typeof orgCost === 'number' && typeof nodeCost === 'number' && nodeCost > orgCost) {
      fault('budget-per-node-exceeds-organization', 'per-node maxCost exceeds the organization maxCost');
    }
  }

  const terminationPolicy = org.terminationPolicy as unknown;
  if (
    !isPlainObject(terminationPolicy) ||
    !Number.isInteger(terminationPolicy.maxIterations) ||
    (terminationPolicy.maxIterations as number) < 1 ||
    typeof terminationPolicy.timeoutMs !== 'number' ||
    !Number.isFinite(terminationPolicy.timeoutMs) ||
    (terminationPolicy.timeoutMs as number) <= 0
  ) {
    fault('invalid-termination-policy', 'terminationPolicy must carry maxIterations >= 1 and timeoutMs > 0');
  }

  const features = candidate.features as unknown;
  if (!isPlainObject(features)) {
    fault('missing-declared-features', 'features must declare critics, toolAllocation and executionOrdering (no silent defaults)');
    return faults;
  }
  if (!Array.isArray(features.criticNodeIds)) {
    fault('missing-declared-features', 'features.criticNodeIds must be an array of node ids');
  } else {
    const seen = new Set<string>();
    for (const id of features.criticNodeIds) {
      if (typeof id !== 'string' || !nodeIds.has(id)) {
        fault('unknown-critic-node', `critic node ${String(id)} is not a node of the organization`);
      } else if (seen.has(id)) {
        fault('duplicate-critic-node', `critic node ${id} is declared more than once`);
      } else {
        seen.add(id);
      }
    }
  }
  if (!isPlainObject(features.toolAllocation) || !Array.isArray(features.toolAllocation.perNode)) {
    fault('missing-declared-features', 'features.toolAllocation.perNode must be an array');
  } else {
    const allocatedNodes = new Set<string>();
    for (const entry of features.toolAllocation.perNode) {
      if (!isPlainObject(entry)) {
        fault('missing-declared-features', 'every tool allocation entry must be an object');
        continue;
      }
      const nodeId = String(entry.nodeId);
      if (!nodeIds.has(nodeId)) {
        fault('unknown-tool-allocation-node', `tool allocation references unknown node ${nodeId}`);
      } else if (allocatedNodes.has(nodeId)) {
        fault('duplicate-tool-allocation-node', `node ${nodeId} has more than one tool allocation entry`);
      } else {
        allocatedNodes.add(nodeId);
      }
      if (!Array.isArray(entry.toolRefs) || entry.toolRefs.length === 0 || !entry.toolRefs.every(isNonBlank)) {
        fault('invalid-tool-allocation', `tool allocation for node ${nodeId} must list non-blank tool refs (or the node is omitted entirely)`);
      }
    }
  }
  if (!ORDERING_MODES.has(features.executionOrdering as string)) {
    fault('missing-declared-features', 'features.executionOrdering must be sequential | parallel | staged');
  }
  return faults;
}

/** Directed-cycle check over one edge kind (three-color DFS, diamonds OK). */
function hasCycleOver(
  edges: readonly OrganizationEdge[],
  kind: OrganizationEdgeKind,
  nodeIds: ReadonlySet<string>,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind === kind) {
      const targets = adjacency.get(edge.fromNodeId) ?? [];
      targets.push(edge.toNodeId);
      adjacency.set(edge.fromNodeId, targets);
    }
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const visit = (node: string): boolean => {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === GRAY || (state === WHITE && visit(next))) {
        return true;
      }
    }
    color.set(node, BLACK);
    return false;
  };
  for (const node of nodeIds) {
    if ((color.get(node) ?? WHITE) === WHITE && visit(node)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Feature derivation + fingerprint
// ---------------------------------------------------------------------------

const sortedDistinct = (values: readonly string[]): string[] =>
  [...new Set(values)].sort();

const edgesOfKind = (org: AgentOrganizationRecord, kind: OrganizationEdgeKind): readonly OrganizationEdge[] =>
  org.edges.filter((edge) => edge.kind === kind);

/** Longest chain length following `kind` edges forward from any node. */
export function longestChainOver(
  org: AgentOrganizationRecord,
  kind: OrganizationEdgeKind,
): number {
  const next = new Map<string, string>();
  for (const edge of edgesOfKind(org, kind)) {
    next.set(edge.fromNodeId, edge.toNodeId);
  }
  let longest = 0;
  for (const node of org.nodes) {
    let length = 0;
    let current: string | undefined = node.nodeId;
    const seen = new Set<string>();
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      length += 1;
      current = next.get(current);
    }
    longest = Math.max(longest, length);
  }
  return longest;
}

/**
 * The twelve-dimension feature fingerprint: one deterministic string
 * signature per §23 dimension (see the contract docblock). Pure function.
 */
export function organizationFeatureFingerprint(
  candidate: SearchedOrganizationCandidate,
): OrganizationFeatureFingerprint {
  const org = candidate.organization;
  const features: DeclaredOrganizationFeatures = candidate.features;
  const edgeSignature = (kind: OrganizationEdgeKind): string =>
    edgesOfKind(org, kind)
      .map((edge) => `${edge.fromNodeId}>${edge.toNodeId}`)
      .sort()
      .join(';');
  const budget = org.budgetPolicy;
  const tools = features.toolAllocation.perNode
    .map((entry) => `${entry.nodeId}:${[...entry.toolRefs].sort().join('+')}`)
    .sort()
    .join(';');
  return {
    'agent-count': String(org.nodes.length),
    roles: sortedDistinct(org.nodes.map((node) => node.role)).join(','),
    topology: edgeSignature('reports-to'),
    delegation: edgeSignature('delegates-to'),
    communication: edgeSignature('communicates-with'),
    'memory-sharing': org.memoryPolicy.sharing,
    critics: [...features.criticNodeIds].sort().join(','),
    'tool-allocation': tools,
    'model-assignment': org.modelAssignments
      .map((assignment) => `${assignment.nodeId}=${assignment.modelRef}`)
      .sort()
      .join(';'),
    budget: [
      quantize(budget.organization.maxCost.amount),
      budget.organization.maxCost.currency,
      quantize(budget.organization.maxDurationMs),
      quantize(budget.perNode.maxCost.amount),
      quantize(budget.perNode.maxDurationMs),
    ].join('|'),
    'execution-ordering': features.executionOrdering,
    'stopping-conditions': [
      org.terminationPolicy.maxIterations,
      quantize(org.terminationPolicy.timeoutMs),
    ].join('|'),
  };
}

/** The dimensions whose fingerprints differ between two candidates. */
export function variedDimensionsBetween(
  parent: OrganizationFeatureFingerprint,
  child: OrganizationFeatureFingerprint,
): readonly OrganizationSearchDimension[] {
  return ORGANIZATION_SEARCH_DIMENSIONS.filter(
    (dimension) => parent[dimension] !== child[dimension],
  );
}

/** Mean tools per node (0 when no allocations). */
export function meanToolsPerNode(candidate: SearchedOrganizationCandidate): number {
  const total = candidate.features.toolAllocation.perNode.reduce(
    (sum, entry) => sum + entry.toolRefs.length,
    0,
  );
  return total / candidate.organization.nodes.length;
}
