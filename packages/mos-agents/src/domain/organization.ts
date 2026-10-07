/**
 * AgentOrganization domain: record types, validation and topology queries
 * (AGT-003).
 *
 * Contract basis (spec/contracts/core-contracts-v2.0.yaml):
 *   AgentOrganization.required = [id, version, nodes, edges,
 *     modelAssignments, memoryPolicy, budgetPolicy, terminationPolicy,
 *     evaluator]
 *
 * Architecture basis: §5 (an organization is a graph of agent bodies with
 * communication/delegation edges), §23 (organizations are searchable
 * objects — every search dimension is explicit, queryable data on the
 * record: number of agents, roles, topology, delegation, communication,
 * memory sharing, model assignment, budget, stopping conditions), lock
 * rule 8 (pawns use the MOS Agent Body/Instance runtime) and rule 9 (model
 * selection stays behind the single model-runtime boundary — organization
 * `modelAssignments` are DATA refs, resolved only at instance binding in
 * @mos/agent-runtime).
 *
 * Tenant scoping: organization records carry an explicit `tenantId` and the
 * registry's mutating operations take an explicit scope (architecture
 * policy `requireTenantScopeOnMutableArtifacts` — there is no ambient
 * tenant). Records are frozen and versioned; a new version is a new record.
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
import { assertRequiredFields } from "@mos/contracts";

import type { AgentBodyRegistryPort } from "../ports/agent-body-registry.port.js";
import type { AgentBodyId, AgentOrganizationId } from "./ids.js";
import type { OrganizationRejectionReason } from "../errors.js";

/** Typed organization edge vocabulary (AGT-003). */
export type OrganizationEdgeKind = "delegates-to" | "communicates-with" | "reports-to";

/** The three typed edge kinds, in declaration order. */
export const ORGANIZATION_EDGE_KINDS: readonly OrganizationEdgeKind[] = Object.freeze([
  "delegates-to",
  "communicates-with",
  "reports-to",
] as const);

/** How organization memory is shared between nodes (§23 memory sharing). */
export type OrganizationMemorySharing = "shared" | "isolated" | "hybrid";

/**
 * Organization-level memory policy: the per-agent memory contract
 * (@mos/contracts `MemoryPolicy`: none | session | persistent) extended with
 * the §23 memory-sharing dimension (shared | isolated | hybrid). The
 * extension keeps the record assignable to the frozen contract's
 * `memoryPolicy: MemoryPolicy` field while making sharing explicit.
 */
export interface OrganizationMemoryPolicy extends MemoryPolicy {
  readonly sharing: OrganizationMemorySharing;
}

/**
 * One organization node: a named slot occupied by one agent body, with an
 * explicit role label (the §23 "roles" search dimension). Assignable to the
 * frozen contract's `AgentOrganizationNode`.
 */
export interface OrganizationNode extends AgentOrganizationNode {
  readonly role: string;
}

/** One typed organization edge between two distinct nodes. */
export interface OrganizationEdge extends AgentOrganizationEdge {
  readonly kind: OrganizationEdgeKind;
}

/**
 * A versioned, immutable, tenant-scoped, searchable agent organization.
 * Carries every §23 search dimension as explicit data — no hidden state.
 */
export interface AgentOrganizationRecord {
  readonly id: AgentOrganizationId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly nodes: readonly OrganizationNode[];
  readonly edges: readonly OrganizationEdge[];
  readonly modelAssignments: readonly ModelAssignment[];
  readonly memoryPolicy: OrganizationMemoryPolicy;
  readonly budgetPolicy: BudgetPolicy;
  readonly terminationPolicy: TerminationPolicy;
  readonly evaluator: string;
}

function reason(code: OrganizationRejectionReason["code"], detail: string): OrganizationRejectionReason {
  return { code, detail };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMoneyAmount(path: string, value: unknown, reasons: OrganizationRejectionReason[]): void {
  if (!isPlainObject(value)) {
    reasons.push(reason("invalid-budget-policy", `${path} must be an object with amount and currency`));
    return;
  }
  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0) {
    reasons.push(reason("invalid-budget-policy", `${path}.amount must be a finite number >= 0`));
  }
  if (!isNonBlankString(value.currency)) {
    reasons.push(reason("invalid-budget-policy", `${path}.currency must be a non-blank ISO-4217 code`));
  }
}

/**
 * True when the subgraph of `kind` edges reachable from `from` contains a
 * directed cycle. Three-color DFS (white/gray/black): a cycle exists iff a
 * gray (on-stack) node is reached. Converging paths (diamonds) are NOT
 * cycles and do not trigger a false positive.
 */
function hasCycleOver(
  edges: readonly OrganizationEdge[],
  kind: OrganizationEdgeKind,
  from: string,
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
  const hasCycleFrom = (node: string): boolean => {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) {
        return true;
      }
      if (state === WHITE && hasCycleFrom(next)) {
        return true;
      }
    }
    color.set(node, BLACK);
    return false;
  };
  return hasCycleFrom(from);
}

/**
 * Validates one organization record against the frozen contract and the body
 * registry. Returns EVERY named rejection reason (an empty array means the
 * organization is valid). Pure function.
 *
 * Checks (fail-closed, each named):
 * - frozen required-field completeness (via @mos/contracts, YAML authority);
 * - non-empty organization, tenant scope present;
 * - unique node ids, non-blank node roles, node body refs resolve to
 *   registered bodies (any version of the body id);
 * - edge endpoints exist, no self-referencing edges, typed edge kinds only;
 * - `delegates-to` and `reports-to` edge subgraphs are acyclic, and each
 *   node has at most one outgoing `delegates-to` edge (delegation is
 *   functional, so delegation chains are well-defined linear queries);
 * - model assignments reference existing nodes, one per node, every node
 *   covered (explicit model assignment — §23 search dimension);
 * - memory policy carries a valid scope AND sharing mode;
 * - budget policy: valid org + per-node budgets and perNode <= organization
 *   on both cost and duration (budget consistency);
 * - termination policy: maxIterations >= 1, timeoutMs > 0;
 * - evaluator is a non-blank ref.
 */
export function organizationRejectionReasons(
  organization: AgentOrganizationRecord,
  bodyRegistry: AgentBodyRegistryPort,
): OrganizationRejectionReason[] {
  const reasons: OrganizationRejectionReason[] = [];

  // Frozen required-field completeness first.
  try {
    assertRequiredFields(organization, "AgentOrganization");
  } catch (error) {
    reasons.push(
      reason("missing-required-field", error instanceof Error ? error.message : String(error)),
    );
    return reasons;
  }

  if (!isNonBlankString(organization.id)) {
    reasons.push(reason("missing-required-field", "id must be a non-blank string"));
  }
  if (!Number.isInteger(organization.version) || (organization.version as number) < 1) {
    reasons.push(reason("missing-required-field", "version must be an integer >= 1"));
  }
  if (!isNonBlankString(organization.tenantId)) {
    reasons.push(reason("invalid-tenant-scope", "tenantId must be a non-blank tenant identifier"));
  }

  const nodes = organization.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    reasons.push(reason("empty-organization", "an organization must declare at least one node"));
    return reasons;
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!isPlainObject(node)) {
      reasons.push(reason("missing-required-field", "every node must be an object"));
      continue;
    }
    if (!isNonBlankString(node.nodeId)) {
      reasons.push(reason("missing-required-field", "every node must carry a non-blank nodeId"));
      continue;
    }
    if (nodeIds.has(node.nodeId)) {
      reasons.push(reason("duplicate-node-id", `node id ${node.nodeId} is declared more than once`));
      continue;
    }
    nodeIds.add(node.nodeId);
    if (!isNonBlankString(node.role)) {
      reasons.push(
        reason("missing-required-field", `node ${node.nodeId} must carry a non-blank role label`),
      );
    }
    if (!isNonBlankString(node.bodyId)) {
      reasons.push(
        reason("missing-required-field", `node ${node.nodeId} must reference a body id`),
      );
    } else if (bodyRegistry.getLatest(node.bodyId as AgentBodyId) === undefined) {
      reasons.push(
        reason(
          "unknown-node-body",
          `node ${node.nodeId} references unknown agent body ${node.bodyId} (register the body first)`,
        ),
      );
    }
  }

  const edges = organization.edges;
  if (!Array.isArray(edges)) {
    reasons.push(reason("missing-required-field", "edges must be an array of typed edges"));
  } else {
    for (const edge of edges) {
      if (!isPlainObject(edge)) {
        reasons.push(reason("missing-required-field", "every edge must be an object"));
        continue;
      }
      const { fromNodeId, toNodeId, kind } = edge;
      if (fromNodeId === toNodeId) {
        reasons.push(
          reason(
            "self-referencing-edge",
            `edge ${String(fromNodeId)} -> ${String(toNodeId)} references the same node`,
          ),
        );
      }
      if (!nodeIds.has(String(fromNodeId))) {
        reasons.push(
          reason("unknown-edge-endpoint", `edge references unknown from-node ${String(fromNodeId)}`),
        );
      }
      if (!nodeIds.has(String(toNodeId))) {
        reasons.push(
          reason("unknown-edge-endpoint", `edge references unknown to-node ${String(toNodeId)}`),
        );
      }
      if (!ORGANIZATION_EDGE_KINDS.includes(kind as OrganizationEdgeKind)) {
        reasons.push(
          reason(
            "invalid-edge-kind",
            `edge ${String(fromNodeId)} -> ${String(toNodeId)} has invalid kind ${String(kind)} (allowed: ${ORGANIZATION_EDGE_KINDS.join(", ")})`,
          ),
        );
      }
    }
    for (const node of nodeIds) {
      if (hasCycleOver(edges as readonly OrganizationEdge[], "delegates-to", node)) {
        reasons.push(
          reason("delegation-cycle", `delegates-to edges form a cycle reachable from node ${node}`),
        );
        break;
      }
    }
    const delegationOutDegree = new Map<string, number>();
    for (const edge of edges as readonly OrganizationEdge[]) {
      if (edge.kind === "delegates-to") {
        const count = (delegationOutDegree.get(edge.fromNodeId) ?? 0) + 1;
        delegationOutDegree.set(edge.fromNodeId, count);
        if (count > 1) {
          reasons.push(
            reason(
              "duplicate-delegation",
              `node ${edge.fromNodeId} has more than one outgoing delegates-to edge (delegation must be functional so delegation chains are well-defined; use communicates-with for fan-out)`,
            ),
          );
        }
      }
    }
    for (const node of nodeIds) {
      if (hasCycleOver(edges as readonly OrganizationEdge[], "reports-to", node)) {
        reasons.push(
          reason("reporting-cycle", `reports-to edges form a cycle reachable from node ${node}`),
        );
        break;
      }
    }
  }

  const assignments = organization.modelAssignments;
  const assignedNodes = new Set<string>();
  if (!Array.isArray(assignments)) {
    reasons.push(reason("missing-required-field", "modelAssignments must be an array"));
  } else {
    for (const assignment of assignments) {
      if (!isPlainObject(assignment)) {
        reasons.push(reason("missing-required-field", "every model assignment must be an object"));
        continue;
      }
      const nodeId = String(assignment.nodeId);
      if (!nodeIds.has(nodeId)) {
        reasons.push(
          reason("unknown-model-assignment-node", `model assignment references unknown node ${nodeId}`),
        );
        continue;
      }
      if (assignedNodes.has(nodeId)) {
        reasons.push(
          reason("duplicate-model-assignment", `node ${nodeId} has more than one model assignment`),
        );
        continue;
      }
      assignedNodes.add(nodeId);
      if (!isNonBlankString(assignment.modelRef)) {
        reasons.push(
          reason("missing-required-field", `model assignment for node ${nodeId} must carry a non-blank modelRef`),
        );
      }
    }
    for (const nodeId of nodeIds) {
      if (!assignedNodes.has(nodeId)) {
        reasons.push(
          reason(
            "missing-model-assignment",
            `node ${nodeId} has no model assignment (organization model assignment must be explicit)`,
          ),
        );
      }
    }
  }

  const memoryPolicy = organization.memoryPolicy as unknown;
  const SHARING_MODES = new Set(["shared", "isolated", "hybrid"]);
  const MEMORY_SCOPES = new Set(["none", "session", "persistent"]);
  if (
    !isPlainObject(memoryPolicy) ||
    !MEMORY_SCOPES.has(memoryPolicy.scope as string) ||
    !SHARING_MODES.has(memoryPolicy.sharing as string)
  ) {
    reasons.push(
      reason(
        "invalid-memory-policy",
        "memoryPolicy must carry a scope (none | session | persistent) and a sharing mode (shared | isolated | hybrid)",
      ),
    );
  }

  const budgetPolicy = organization.budgetPolicy as unknown;
  if (!isPlainObject(budgetPolicy) || !isPlainObject(budgetPolicy.organization) || !isPlainObject(budgetPolicy.perNode)) {
    reasons.push(
      reason("invalid-budget-policy", "budgetPolicy must carry organization and perNode budgets"),
    );
  } else {
    validateMoneyAmount("budgetPolicy.organization.maxCost", budgetPolicy.organization.maxCost, reasons);
    validateMoneyAmount("budgetPolicy.perNode.maxCost", budgetPolicy.perNode.maxCost, reasons);
    const orgMaxCost = isPlainObject(budgetPolicy.organization.maxCost)
      ? budgetPolicy.organization.maxCost.amount
      : undefined;
    const nodeMaxCost = isPlainObject(budgetPolicy.perNode.maxCost)
      ? budgetPolicy.perNode.maxCost.amount
      : undefined;
    const orgDuration = budgetPolicy.organization.maxDurationMs;
    const nodeDuration = budgetPolicy.perNode.maxDurationMs;
    if (
      typeof orgDuration !== "number" || !Number.isFinite(orgDuration) || orgDuration < 0 ||
      typeof nodeDuration !== "number" || !Number.isFinite(nodeDuration) || nodeDuration < 0
    ) {
      reasons.push(
        reason("invalid-budget-policy", "budgetPolicy maxDurationMs values must be finite numbers >= 0"),
      );
    } else if (nodeDuration > orgDuration) {
      reasons.push(
        reason(
          "budget-per-node-exceeds-organization",
          "per-node budget maxDurationMs exceeds the organization budget maxDurationMs",
        ),
      );
    }
    if (
      typeof orgMaxCost === "number" && typeof nodeMaxCost === "number" &&
      nodeMaxCost > orgMaxCost
    ) {
      reasons.push(
        reason(
          "budget-per-node-exceeds-organization",
          "per-node budget maxCost exceeds the organization budget maxCost",
        ),
      );
    }
  }

  const terminationPolicy = organization.terminationPolicy as unknown;
  if (
    !isPlainObject(terminationPolicy) ||
    !Number.isInteger(terminationPolicy.maxIterations) ||
    (terminationPolicy.maxIterations as number) < 1 ||
    typeof terminationPolicy.timeoutMs !== "number" ||
    !Number.isFinite(terminationPolicy.timeoutMs) ||
    (terminationPolicy.timeoutMs as number) <= 0
  ) {
    reasons.push(
      reason(
        "invalid-termination-policy",
        "terminationPolicy must carry maxIterations >= 1 and timeoutMs > 0",
      ),
    );
  }

  if (!isNonBlankString(organization.evaluator)) {
    reasons.push(reason("invalid-evaluator", "evaluator must be a non-blank evaluator ref"));
  }

  return reasons;
}

/** All edges that touch `nodeId` (either endpoint), in declaration order. */
export function organizationNeighbors(
  organization: AgentOrganizationRecord,
  nodeId: string,
): readonly OrganizationEdge[] {
  return organization.edges.filter(
    (edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId,
  );
}

/**
 * The delegation chain from `fromNodeId`: the node ids reachable by following
 * `delegates-to` edges forward, starting with `fromNodeId` itself. Empty when
 * `fromNodeId` is not a node of the organization. Well-defined and acyclic by
 * construction — validation rejects delegation cycles AND nodes with more
 * than one outgoing delegates-to edge (delegation is functional), so the
 * chain is a linear query.
 */
export function organizationDelegationChain(
  organization: AgentOrganizationRecord,
  fromNodeId: string,
): readonly string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = fromNodeId;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const next = organization.edges.find(
      (edge) => edge.kind === "delegates-to" && edge.fromNodeId === current,
    );
    current = next === undefined ? undefined : next.toNodeId;
  }
  return chain;
}
