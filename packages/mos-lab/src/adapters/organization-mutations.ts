import type {
  AgentOrganizationId,
  AgentOrganizationRecord,
  OrganizationEdge,
  OrganizationMemorySharing,
} from '@mos/agents';
import type { Version } from '@mos/contracts';
import type {
  DeclaredOrganizationFeatures,
  OrganizationSearchDimension,
  SearchedOrganizationCandidate,
} from '../contracts/organization-features.js';
import { ORGANIZATION_SEARCH_DIMENSIONS } from '../contracts/organization-features.js';
import type { OrganizationSearchPolicy } from '../contracts/organization-search.js';

/**
 * INTERNAL twelve-dimension mutation operators for the LAB-010 organization
 * search (NOT exported from the package index).
 *
 * Every mutation varies EXACTLY the dimensions whose fingerprints change —
 * structural side effects are honest (e.g. adding a node also grows the
 * model-assignment signature, and BOTH dimensions are recorded as varied).
 * All mutations preserve the organization record invariants BY CONSTRUCTION
 * (unique node ids, edge endpoints exist, no self-edges, acyclic + functional
 * delegation, acyclic reporting, exact per-node model coverage, per-node ≤
 * organization budgets, maxIterations >= 1, timeoutMs > 0) and every mutant
 * is re-validated fail-closed by the search before evaluation.
 *
 * Move set per dimension (fixed order, deterministic given parent + policy):
 * - agent-count: +1 node (clones the last node's role/body/model under a
 *   fresh deterministic node id; the new node starts unconnected, uncritic,
 *   unallocated — explicit states) / −1 node (drops the LAST node with its
 *   edges, assignment, critic and tool entries; never below one node);
 * - roles: advance the FIRST node's role / the LAST node's role to the next
 *   role-vocabulary entry (cyclic);
 * - topology: add the first missing reports-to edge (node-declaration-order
 *   pair, skipping pairs that would create a reporting cycle) / remove the
 *   last reports-to edge;
 * - delegation: add a delegates-to edge from the first node without an
 *   outgoing one (to the first node that keeps delegation acyclic) / remove
 *   the last delegates-to edge;
 * - communication: add the first missing unordered communicates-with pair
 *   (declaration-order direction) / remove the last communicates-with edge;
 * - memory-sharing: cycle shared → isolated → hybrid → shared;
 * - critics: add the first non-critic node / remove the last critic;
 * - tool-allocation: allocate the first vocabulary tool missing for the
 *   node with the fewest tools (ties: first in declaration order) /
 *   deallocate the last tool of the node with the most tools (ties: last);
 * - model-assignment: advance the FIRST node's modelRef / the LAST node's
 *   modelRef to the next model-vocabulary entry (cyclic);
 * - budget: scale all four budget values (org/per-node cost + duration) up
 *   or down by the declared factor (amounts quantized 1e-6);
 * - execution-ordering: cycle sequential → parallel → staged → sequential;
 * - stopping-conditions: maxIterations ± the declared delta (floor 1).
 */

/** One generated mutation outcome. */
export interface OrganizationMutation {
  readonly dimension: OrganizationSearchDimension;
  readonly moveIndex: number;
  readonly candidate: SearchedOrganizationCandidate;
}

type MutableNode = {
  nodeId: string;
  role: string;
  bodyId: AgentOrganizationRecord['nodes'][number]['bodyId'];
};
type MutableEdge = {
  fromNodeId: string;
  toNodeId: string;
  kind: OrganizationEdge['kind'];
};
type MutableAssignment = {
  nodeId: string;
  modelRef: AgentOrganizationRecord['modelAssignments'][number]['modelRef'];
};
type MutableMoney = { amount: number; currency: string };
interface MutableRecord {
  id: AgentOrganizationRecord['id'];
  version: AgentOrganizationRecord['version'];
  tenantId: AgentOrganizationRecord['tenantId'];
  nodes: MutableNode[];
  edges: MutableEdge[];
  modelAssignments: MutableAssignment[];
  memoryPolicy: { scope: AgentOrganizationRecord['memoryPolicy']['scope']; sharing: OrganizationMemorySharing };
  budgetPolicy: {
    organization: { maxCost: MutableMoney; maxDurationMs: number };
    perNode: { maxCost: MutableMoney; maxDurationMs: number };
  };
  terminationPolicy: { maxIterations: number; timeoutMs: number };
  evaluator: string;
}

/** Mutable working copy of a (possibly frozen) record. */
const mutableCopyOf = (org: AgentOrganizationRecord): MutableRecord => ({
  id: org.id,
  version: org.version,
  tenantId: org.tenantId,
  nodes: org.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, bodyId: node.bodyId })),
  edges: org.edges.map((edge) => ({
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    kind: edge.kind,
  })),
  modelAssignments: org.modelAssignments.map((assignment) => ({
    nodeId: assignment.nodeId,
    modelRef: assignment.modelRef,
  })),
  memoryPolicy: { scope: org.memoryPolicy.scope, sharing: org.memoryPolicy.sharing },
  budgetPolicy: {
    organization: {
      maxCost: {
        amount: org.budgetPolicy.organization.maxCost.amount,
        currency: org.budgetPolicy.organization.maxCost.currency,
      },
      maxDurationMs: org.budgetPolicy.organization.maxDurationMs,
    },
    perNode: {
      maxCost: {
        amount: org.budgetPolicy.perNode.maxCost.amount,
        currency: org.budgetPolicy.perNode.maxCost.currency,
      },
      maxDurationMs: org.budgetPolicy.perNode.maxDurationMs,
    },
  },
  terminationPolicy: {
    maxIterations: org.terminationPolicy.maxIterations,
    timeoutMs: org.terminationPolicy.timeoutMs,
  },
  evaluator: org.evaluator,
});

const quantizeMoney = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Smallest k >= 1 such that `agent-${k}` is not an existing node id. */
const nextNodeId = (org: AgentOrganizationRecord): string => {
  const existing = new Set(org.nodes.map((node) => node.nodeId));
  let k = 1;
  while (existing.has(`agent-${k}`)) {
    k += 1;
  }
  return `agent-${k}`;
};

/** `true` when `to` reaches `from` over `kind` edges (so from→to cycles). */
const reachesOver = (
  org: AgentOrganizationRecord,
  from: string,
  to: string,
  kind: OrganizationEdge['kind'],
): boolean => {
  const next = new Map<string, string[]>();
  for (const edge of org.edges) {
    if (edge.kind === kind) {
      const targets = next.get(edge.fromNodeId) ?? [];
      targets.push(edge.toNodeId);
      next.set(edge.fromNodeId, targets);
    }
  }
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === from) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return false;
};

const nextVocabularyEntry = <T extends string>(vocabulary: readonly T[], current: T): T =>
  vocabulary[(vocabulary.indexOf(current) + 1) % vocabulary.length] as T;

const generatedCandidate = (
  parent: SearchedOrganizationCandidate,
  org: MutableRecord,
  features: DeclaredOrganizationFeatures,
  generation: number,
  dimension: OrganizationSearchDimension,
  moveIndex: number,
): SearchedOrganizationCandidate => ({
  organization: {
    ...org,
    id: `${parent.organization.id}-g${generation}-${dimension}-${moveIndex}` as AgentOrganizationId,
    version: 1 as Version,
  },
  features,
  origin: 'generated',
});

/** All mutants of `parent` in fixed dimension order (deterministic). */
export function organizationMutationsOf(
  parent: SearchedOrganizationCandidate,
  policy: OrganizationSearchPolicy,
  generation: number,
): readonly OrganizationMutation[] {
  const mutations: OrganizationMutation[] = [];
  const org = parent.organization;
  const nodeIds = org.nodes.map((node) => node.nodeId);

  for (const dimension of ORGANIZATION_SEARCH_DIMENSIONS) {
    let moveIndex = 0;
    const emit = (mutated: MutableRecord, features: DeclaredOrganizationFeatures): void => {
      mutations.push({
        dimension,
        moveIndex,
        candidate: generatedCandidate(parent, mutated, features, generation, dimension, moveIndex),
      });
      moveIndex += 1;
    };

    if (dimension === 'agent-count') {
      // +1 node: clone the last node (role/body/model), unconnected.
      const addOrg = mutableCopyOf(org);
      const lastNode = org.nodes[org.nodes.length - 1] as (typeof org.nodes)[number];
      const lastAssignment = org.modelAssignments.find(
        (assignment) => assignment.nodeId === lastNode.nodeId,
      ) as (typeof org.modelAssignments)[number];
      const nodeId = nextNodeId(org);
      addOrg.nodes.push({ nodeId, role: lastNode.role, bodyId: lastNode.bodyId });
      addOrg.modelAssignments.push({ nodeId, modelRef: lastAssignment.modelRef });
      emit(addOrg, parent.features);
      // −1 node: drop the last node with its edges/assignment/critic/tools.
      if (org.nodes.length > 1) {
        const dropped = nodeIds[nodeIds.length - 1] as string;
        const removeOrg = mutableCopyOf(org);
        removeOrg.nodes.pop();
        removeOrg.edges = removeOrg.edges.filter(
          (edge) => edge.fromNodeId !== dropped && edge.toNodeId !== dropped,
        );
        removeOrg.modelAssignments = removeOrg.modelAssignments.filter(
          (assignment) => assignment.nodeId !== dropped,
        );
        const features: DeclaredOrganizationFeatures = {
          criticNodeIds: parent.features.criticNodeIds.filter((id) => id !== dropped),
          toolAllocation: {
            perNode: parent.features.toolAllocation.perNode.filter(
              (entry) => entry.nodeId !== dropped,
            ),
          },
          executionOrdering: parent.features.executionOrdering,
        };
        emit(removeOrg, features);
      }
    } else if (dimension === 'roles') {
      for (const position of ['first', 'last'] as const) {
        const mutated = mutableCopyOf(org);
        const node =
          position === 'first' ? mutated.nodes[0] : mutated.nodes[mutated.nodes.length - 1];
        (node as { role: string }).role = nextVocabularyEntry(
          policy.roleVocabulary,
          (node as { role: string }).role,
        );
        emit(mutated, parent.features);
      }
    } else if (
      dimension === 'topology' ||
      dimension === 'delegation' ||
      dimension === 'communication'
    ) {
      const kind: OrganizationEdge['kind'] =
        dimension === 'topology'
          ? 'reports-to'
          : dimension === 'delegation'
            ? 'delegates-to'
            : 'communicates-with';
      // Add the first missing edge of the kind (skipping cyclic pairs).
      const addOrg = mutableCopyOf(org);
      let added = false;
      outer: for (let i = 0; i < nodeIds.length; i += 1) {
        const from = nodeIds[i] as string;
        if (
          kind === 'delegates-to' &&
          addOrg.edges.some((e) => e.kind === 'delegates-to' && e.fromNodeId === from)
        ) {
          continue; // delegation is functional: one outgoing edge per node
        }
        for (let j = 0; j < nodeIds.length; j += 1) {
          const to = nodeIds[j] as string;
          if (from === to) {
            continue;
          }
          const exists = addOrg.edges.some(
            (e) => e.kind === kind && e.fromNodeId === from && e.toNodeId === to,
          );
          const reverseExists =
            kind === 'communicates-with'
              ? addOrg.edges.some((e) => e.kind === kind && e.fromNodeId === to && e.toNodeId === from)
              : false;
          if (exists || reverseExists) {
            continue;
          }
          if (kind !== 'communicates-with' && reachesOver(org, from, to, kind)) {
            continue; // would create a cycle
          }
          addOrg.edges.push({ fromNodeId: from, toNodeId: to, kind });
          added = true;
          break outer;
        }
      }
      if (added) {
        emit(addOrg, parent.features);
      }
      // Remove the last edge of the kind.
      const reversedIndex = [...org.edges].reverse().findIndex((edge) => edge.kind === kind);
      if (reversedIndex !== -1) {
        const removeIndex = org.edges.length - 1 - reversedIndex;
        const removeOrg = mutableCopyOf(org);
        removeOrg.edges.splice(removeIndex, 1);
        emit(removeOrg, parent.features);
      }
    } else if (dimension === 'memory-sharing') {
      const sharing = org.memoryPolicy.sharing;
      const nextSharing = sharing === 'shared' ? 'isolated' : sharing === 'isolated' ? 'hybrid' : 'shared';
      const mutated = mutableCopyOf(org);
      mutated.memoryPolicy = { ...org.memoryPolicy, sharing: nextSharing };
      emit(mutated, parent.features);
    } else if (dimension === 'critics') {
      const nonCritic = nodeIds.find((id) => !parent.features.criticNodeIds.includes(id));
      if (nonCritic !== undefined) {
        const features: DeclaredOrganizationFeatures = {
          ...parent.features,
          criticNodeIds: [...parent.features.criticNodeIds, nonCritic],
        };
        emit(mutableCopyOf(org), features);
      }
      if (parent.features.criticNodeIds.length > 0) {
        const features: DeclaredOrganizationFeatures = {
          ...parent.features,
          criticNodeIds: parent.features.criticNodeIds.slice(0, -1),
        };
        emit(mutableCopyOf(org), features);
      }
    } else if (dimension === 'tool-allocation') {
      if (policy.toolVocabulary.length > 0) {
        let target: string | null = null;
        let fewest = Number.POSITIVE_INFINITY;
        for (const nodeId of nodeIds) {
          const entry = parent.features.toolAllocation.perNode.find((e) => e.nodeId === nodeId);
          const count = entry?.toolRefs.length ?? 0;
          const canReceive = policy.toolVocabulary.some(
            (tool) => !(entry?.toolRefs ?? []).includes(tool),
          );
          if (count < fewest && canReceive) {
            fewest = count;
            target = nodeId;
          }
        }
        if (target !== null) {
          const entry = parent.features.toolAllocation.perNode.find((e) => e.nodeId === target);
          const existing = entry?.toolRefs ?? [];
          const tool = policy.toolVocabulary.find((t) => !existing.includes(t)) as string;
          const perNode = entry
            ? parent.features.toolAllocation.perNode.map((e) =>
                e.nodeId === target ? { nodeId: e.nodeId, toolRefs: [...e.toolRefs, tool] } : e,
              )
            : [...parent.features.toolAllocation.perNode, { nodeId: target, toolRefs: [tool] }];
          const features: DeclaredOrganizationFeatures = {
            ...parent.features,
            toolAllocation: { perNode },
          };
          emit(mutableCopyOf(org), features);
        }
      }
      const allocated = parent.features.toolAllocation.perNode.filter((e) => e.toolRefs.length > 0);
      if (allocated.length > 0) {
        let target = allocated[0] as { nodeId: string; toolRefs: readonly string[] };
        for (const entry of allocated) {
          if (entry.toolRefs.length >= target.toolRefs.length) {
            target = entry; // ties: LAST in declaration order
          }
        }
        const perNode = parent.features.toolAllocation.perNode
          .map((e) =>
            e.nodeId === target.nodeId ? { nodeId: e.nodeId, toolRefs: e.toolRefs.slice(0, -1) } : e,
          )
          .filter((e) => e.toolRefs.length > 0);
        const features: DeclaredOrganizationFeatures = {
          ...parent.features,
          toolAllocation: { perNode },
        };
        emit(mutableCopyOf(org), features);
      }
    } else if (dimension === 'model-assignment') {
      for (const position of ['first', 'last'] as const) {
        const mutated = mutableCopyOf(org);
        const nodeId =
          position === 'first'
            ? (nodeIds[0] as string)
            : (nodeIds[nodeIds.length - 1] as string);
        const assignment = mutated.modelAssignments.find(
          (a) => a.nodeId === nodeId,
        ) as { nodeId: string; modelRef: string };
        assignment.modelRef = nextVocabularyEntry(policy.modelVocabulary, assignment.modelRef);
        emit(mutated, parent.features);
      }
    } else if (dimension === 'budget') {
      for (const factor of [policy.budgetScaleFactor, 1 / policy.budgetScaleFactor]) {
        const mutated = mutableCopyOf(org);
        mutated.budgetPolicy.organization.maxCost.amount = quantizeMoney(
          org.budgetPolicy.organization.maxCost.amount * factor,
        );
        mutated.budgetPolicy.organization.maxDurationMs = quantizeMoney(
          org.budgetPolicy.organization.maxDurationMs * factor,
        );
        mutated.budgetPolicy.perNode.maxCost.amount = quantizeMoney(
          org.budgetPolicy.perNode.maxCost.amount * factor,
        );
        mutated.budgetPolicy.perNode.maxDurationMs = quantizeMoney(
          org.budgetPolicy.perNode.maxDurationMs * factor,
        );
        emit(mutated, parent.features);
      }
    } else if (dimension === 'execution-ordering') {
      const mode = parent.features.executionOrdering;
      const nextMode =
        mode === 'sequential' ? 'parallel' : mode === 'parallel' ? 'staged' : 'sequential';
      const features: DeclaredOrganizationFeatures = { ...parent.features, executionOrdering: nextMode };
      emit(mutableCopyOf(org), features);
    } else if (dimension === 'stopping-conditions') {
      for (const delta of [policy.stoppingIterationDelta, -policy.stoppingIterationDelta]) {
        const mutated = mutableCopyOf(org);
        mutated.terminationPolicy = {
          ...org.terminationPolicy,
          maxIterations: Math.max(1, org.terminationPolicy.maxIterations + delta),
        };
        emit(mutated, parent.features);
      }
    }
  }
  return mutations;
}
