/**
 * Transform pawn organization composition (LAB-013) — pure compose +
 * validation over the pawn-body index.
 *
 * Composes the canonical {@link TransformPawnOrganizationRecord} from pawn
 * citations, enforcing the pawn-specific discipline with EVERY named
 * rejection reason at once (mirroring the @mos/agents registry's
 * all-reasons-at-once convention):
 * - nodes cite REGISTERED pawn kinds (resolved to their latest body);
 * - unique node ids; edges reference existing nodes; no self-references;
 *   typed edge kinds; acyclic `delegates-to` subgraph;
 * - DETERMINISTIC pawn nodes carry NO model assignment (a typed rejection
 *   when they do — §9: they never bind a model);
 * - LLM-FLAVORED nodes carry EXACTLY ONE model assignment (the assignment
 *   is DATA resolved at the boundary — lock rule 9);
 * - valid memory/budget/termination policies and a non-blank evaluator.
 *
 * Pure functions: no registry mutation (the append-only registry semantics
 * live in the adapter).
 */

import type {
  AgentOrganizationEdge,
  AgentOrganizationNode,
  BudgetPolicy,
  MemoryPolicy,
  ModelAssignment,
  TenantId,
  TerminationPolicy,
  Version,
} from "@mos/contracts";

import type { TransformPawnBody } from "../contracts/pawn-body.js";
import type { PawnAgentOrganizationId } from "../contracts/pawn-ids.js";
import type {
  ComposeTransformPawnOrganizationInput,
  PawnOrganizationEdgeKind,
  PawnOrganizationRejectionReason,
  TransformPawnOrganizationRecord,
} from "../contracts/pawn-organization.js";

const EDGE_KINDS: readonly PawnOrganizationEdgeKind[] = [
  "delegates-to",
  "communicates-with",
  "reports-to",
];

const DEFAULT_MEMORY_POLICY: MemoryPolicy = { scope: "none" };

const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  organization: { maxCost: { amount: 10, currency: "USD" }, maxDurationMs: 600_000 },
  perNode: { maxCost: { amount: 5, currency: "USD" }, maxDurationMs: 300_000 },
};

const DEFAULT_TERMINATION_POLICY: TerminationPolicy = {
  maxIterations: 8,
  timeoutMs: 600_000,
};

function reason(
  code: PawnOrganizationRejectionReason["code"],
  detail: string,
): PawnOrganizationRejectionReason {
  return { code, detail };
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function delegationCycle(
  edges: readonly { fromNodeId: string; toNodeId: string; kind: string }[],
): string | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "delegates-to") continue;
    const targets = adjacency.get(edge.fromNodeId) ?? [];
    targets.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, targets);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const visit = (node: string): string | null => {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) return next;
      if (state === WHITE) {
        const found = visit(next);
        if (found !== null) return found;
      }
    }
    color.set(node, BLACK);
    return null;
  };
  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const found = visit(node);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Composes one pawn organization record from the input, resolved against
 * the pawn-body index (kind → registered pawn body). Returns the composed
 * record, or `null` plus EVERY named rejection reason when invalid.
 */
export function composeTransformPawnOrganization(
  input: ComposeTransformPawnOrganizationInput,
  pawnBodies: readonly TransformPawnBody[],
): { record: TransformPawnOrganizationRecord | null; reasons: readonly PawnOrganizationRejectionReason[] } {
  const reasons: PawnOrganizationRejectionReason[] = [];

  if (!isNonBlankString(input?.organizationId)) {
    reasons.push(reason("invalid-tenant-scope", "organizationId must be a non-blank string"));
  }
  if (!isNonBlankString(input?.scope?.tenantId)) {
    reasons.push(reason("invalid-tenant-scope", "scope.tenantId must be a non-blank tenant id"));
  }
  if (!isNonBlankString(input?.evaluator)) {
    reasons.push(reason("invalid-evaluator", "evaluator must be a non-blank evaluator ref"));
  }

  const byKind = new Map<string, TransformPawnBody>();
  for (const pawn of pawnBodies) {
    byKind.set(pawn.role.pawnKind, pawn);
  }

  const nodesInput = Array.isArray(input?.nodes) ? input.nodes : [];
  if (nodesInput.length === 0) {
    reasons.push(reason("empty-organization", "an organization must declare at least one node"));
  }

  const nodeIds = new Set<string>();
  const nodes: AgentOrganizationNode[] = [];
  const nodeFlavor = new Map<string, "deterministic" | "llm-flavored">();
  for (const node of nodesInput) {
    if (nodeIds.has(node.nodeId)) {
      reasons.push(reason("duplicate-node-id", `node id ${node.nodeId} is declared more than once`));
      continue;
    }
    nodeIds.add(node.nodeId);
    const pawn = byKind.get(node.pawnKind);
    if (pawn === undefined) {
      reasons.push(
        reason("unknown-pawn-kind", `node ${node.nodeId} cites unregistered pawn kind ${String(node.pawnKind)}`),
      );
      continue;
    }
    nodes.push({ nodeId: node.nodeId, bodyId: pawn.agentBody.id });
    nodeFlavor.set(node.nodeId, pawn.role.modelFlavor);
  }

  const edgesInput = Array.isArray(input?.edges) ? input.edges : [];
  const edges: AgentOrganizationEdge[] = [];
  for (const edge of edgesInput) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      reasons.push(
        reason("unknown-edge-node", `edge ${edge.fromNodeId}→${edge.toNodeId} references an unknown node`),
      );
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) {
      reasons.push(reason("self-referencing-edge", `edge ${edge.fromNodeId} references itself`));
      continue;
    }
    if (!EDGE_KINDS.includes(edge.kind)) {
      reasons.push(reason("invalid-edge-kind", `edge ${edge.fromNodeId}→${edge.toNodeId} has untyped kind ${String(edge.kind)}`));
      continue;
    }
    edges.push({ fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId, kind: edge.kind });
  }
  const cycleNode = delegationCycle(edges);
  if (cycleNode !== null) {
    reasons.push(reason("delegation-cycle", `the delegates-to subgraph has a cycle through node ${cycleNode}`));
  }

  const assignmentsInput = Array.isArray(input?.modelAssignments) ? input.modelAssignments : [];
  const assignedNodes = new Set<string>();
  const modelAssignments: ModelAssignment[] = [];
  for (const assignment of assignmentsInput) {
    if (!nodeIds.has(assignment.nodeId)) {
      reasons.push(
        reason("unknown-edge-node", `model assignment references unknown node ${assignment.nodeId}`),
      );
      continue;
    }
    if (assignedNodes.has(assignment.nodeId)) {
      reasons.push(
        reason("duplicate-model-assignment", `node ${assignment.nodeId} has more than one model assignment`),
      );
      continue;
    }
    assignedNodes.add(assignment.nodeId);
    if (!isNonBlankString(assignment.modelRef)) {
      reasons.push(
        reason("missing-model-assignment", `model assignment for node ${assignment.nodeId} must carry a non-blank modelRef`),
      );
      continue;
    }
    if (nodeFlavor.get(assignment.nodeId) === "deterministic") {
      reasons.push(
        reason(
          "model-assignment-for-deterministic-pawn",
          `node ${assignment.nodeId} is a deterministic pawn and must carry NO model assignment (§9: deterministic pawns never bind a model)`,
        ),
      );
      continue;
    }
    modelAssignments.push({ nodeId: assignment.nodeId, modelRef: assignment.modelRef });
  }
  for (const [nodeId, flavor] of nodeFlavor) {
    if (flavor === "llm-flavored" && !assignedNodes.has(nodeId)) {
      reasons.push(
        reason(
          "missing-model-assignment",
          `node ${nodeId} is an llm-flavored pawn and must carry exactly one model assignment`,
        ),
      );
    }
  }

  const memoryPolicy = input?.memoryPolicy ?? DEFAULT_MEMORY_POLICY;
  if (!["none", "session", "persistent"].includes(String(memoryPolicy?.scope))) {
    reasons.push(reason("invalid-memory-policy", "memoryPolicy.scope must be none | session | persistent"));
  }
  const budgetPolicy = input?.budgetPolicy ?? DEFAULT_BUDGET_POLICY;
  const orgBudget = budgetPolicy?.organization;
  const nodeBudget = budgetPolicy?.perNode;
  if (
    !orgBudget?.maxCost ||
    !Number.isFinite(orgBudget.maxCost.amount) ||
    orgBudget.maxCost.amount < 0 ||
    !isNonBlankString(orgBudget.maxCost.currency) ||
    !Number.isFinite(orgBudget.maxDurationMs) ||
    orgBudget.maxDurationMs < 0
  ) {
    reasons.push(reason("invalid-budget-policy", "budgetPolicy.organization must carry a valid cost and duration budget"));
  }
  if (
    !nodeBudget?.maxCost ||
    !Number.isFinite(nodeBudget.maxCost.amount) ||
    nodeBudget.maxCost.amount < 0 ||
    !isNonBlankString(nodeBudget.maxCost.currency) ||
    !Number.isFinite(nodeBudget.maxDurationMs) ||
    nodeBudget.maxDurationMs < 0
  ) {
    reasons.push(reason("invalid-budget-policy", "budgetPolicy.perNode must carry a valid cost and duration budget"));
  }
  const terminationPolicy = input?.terminationPolicy ?? DEFAULT_TERMINATION_POLICY;
  if (
    !Number.isInteger(terminationPolicy?.maxIterations) ||
    (terminationPolicy.maxIterations as number) < 1 ||
    !Number.isFinite(terminationPolicy?.timeoutMs) ||
    (terminationPolicy.timeoutMs as number) <= 0
  ) {
    reasons.push(reason("invalid-termination-policy", "terminationPolicy must carry maxIterations >= 1 and timeoutMs > 0"));
  }

  if (reasons.length > 0 || !isNonBlankString(input?.scope?.tenantId)) {
    return { record: null, reasons };
  }

  const record: TransformPawnOrganizationRecord = {
    id: input.organizationId as PawnAgentOrganizationId,
    version: 1 as Version,
    tenantId: input.scope.tenantId as TenantId,
    nodes,
    edges,
    modelAssignments,
    memoryPolicy,
    budgetPolicy,
    terminationPolicy,
    evaluator: input.evaluator,
  };
  return { record, reasons: [] };
}
