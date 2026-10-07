/**
 * ProductionGraph contract (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   ProductionGraph.required = [id, version, inputs, nodes, edges,
 *     acceptanceCriteria, budget, stoppingPolicy]
 *
 * Basis: spec/mos-architecture-v2.0.md §5 ("the executable production
 * program for producing a target artifact" — it can contain inputs,
 * transformations, human tasks, capability calls, engine selections, agent
 * organization nodes, review gates, branching, acceptance criteria,
 * budgets, stopping rules), §7 (production search), §18 (stopping and
 * substitution policy).
 */

import type {
  AcceptanceCriterion,
  Budget,
  ProductionGraphId,
  Version,
} from "./value-types.js";
import type { ArtifactRef } from "./artifact.js";

/**
 * Node kinds of the production program. Engine selections are explicit
 * nodes: the graph records WHERE the Engine Registry's choice applies, and
 * the choice itself remains with the registry (no silent engine
 * replacement — spec/mos-engine-policy-v2.0.yaml).
 */
export type ProductionGraphNodeKind =
  | "transform"
  | "human-task"
  | "capability-call"
  | "engine-selection"
  | "agent-organization"
  | "review-gate"
  | "branch";

/** One node of the production graph. `targetRef` points at the node's target record (transform id, human task id, ...). */
export interface ProductionGraphNode {
  readonly nodeId: string;
  readonly kind: ProductionGraphNodeKind;
  /** Target record of the node (opaque: interpreted per `kind` by the production authority). */
  readonly targetRef?: string;
}

/** Directed edge between production graph nodes. */
export interface ProductionGraphEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

/**
 * What to do when the budget is exhausted (spec §18: wait, retry,
 * substitute, reduce scope, abandon — abandoned branches remain auditable).
 */
export interface StoppingPolicy {
  readonly maxIterations: number;
  readonly onBudgetExhaustion: "abandon" | "reduce-scope" | "substitute";
}

/**
 * The executable production program for producing a target artifact.
 * `inputs` are acquired/authorized source artifact references; `outputs`
 * are produced by executing the graph under `budget` and `stoppingPolicy`,
 * judged by `acceptanceCriteria`.
 */
export interface ProductionGraph {
  readonly id: ProductionGraphId;
  readonly version: Version;
  readonly inputs: readonly ArtifactRef[];
  readonly nodes: readonly ProductionGraphNode[];
  readonly edges: readonly ProductionGraphEdge[];
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly budget: Budget;
  readonly stoppingPolicy: StoppingPolicy;
}
