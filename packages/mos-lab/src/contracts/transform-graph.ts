import type {
  ArtifactId,
  ArtifactRef,
  JsonObject,
  TenantId,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from '@mos/contracts';
import type { TransformDefinition } from './transform-definition.js';

/**
 * Transform Graph contracts for the Marketing Lab (LAB-011).
 *
 * Basis: spec/mos-architecture-v2.0.md §5 (transforms compose; "a transform
 * is a contract, not an engine"), §6 (the artifact graph: transforms consume
 * and produce artifact nodes), §7 (production search over transform chains —
 * the no-op path is always a valid baseline), §8 (composite transforms are
 * multi-node compositions of known transforms), architecture lock rules 5/6
 * (no-op first-class; transforms atomic, composed or discovered) and 14
 * (artifact lineage immutable across every transformation),
 * spec/mos-effective-backlog-v2.0.md LAB-011.
 *
 * A {@link TransformGraph} is a VERSIONED, TENANT-SCOPED, APPEND-ONLY DAG of
 * transform applications over artifact refs:
 * - nodes ({@link TransformApplicationNode}) are transform applications — a
 *   definition ref pinned to an EXACT version, the external input artifact
 *   refs entering the graph at that node, and the declared parameterization;
 * - edges ({@link ArtifactFlowEdge}) are artifact flow — the output of one
 *   node feeds the input of the next;
 * - composite transforms (remix / compilation / hybrid) express naturally as
 *   multi-node graphs.
 *
 * DECLARATIVE ONLY — the graph records WHAT would be produced and from WHAT.
 * No node is executed, no engine is selected and no artifact is materialized
 * here; execution is Lab runs / production programs / the ENG runner
 * (LAB-012 / LAB-016 territory). The README documents this boundary.
 */

declare const transformGraphIdBrand: unique symbol;

/** Unique identifier of a transform graph (stable across all its versions). */
export type TransformGraphId = string & { readonly [transformGraphIdBrand]: true };

/**
 * One transform application: the transform definition (pinned to an EXACT
 * version) applied to declared inputs with a declared parameterization.
 *
 * `inputs` are the EXTERNAL artifact refs entering the graph at this node;
 * further inputs arrive as upstream node outputs over artifact-flow edges
 * (the total input count is checked against the definition's input
 * constraint during validation). `parameterization` is the declared
 * parameter instance (an object); its satisfaction of the definition's
 * parameter JSON schema is an EXECUTION-time concern, not a structural one.
 */
export interface TransformApplicationNode {
  readonly nodeId: string;
  readonly definitionId: TransformId;
  readonly definitionVersion: Version;
  readonly inputs: readonly ArtifactRef[];
  readonly parameterization: JsonObject;
}

/** An artifact-flow edge: the output of `fromNodeId` feeds `toNodeId`. */
export interface ArtifactFlowEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

/**
 * One immutable version of a transform graph. Versions are append-only
 * snapshots: appending nodes/edges creates version + 1 and every prior
 * version stays resolvable bit-for-bit — nothing is mutated in place and
 * nothing is deleted.
 */
export interface TransformGraph {
  readonly id: TransformGraphId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly nodes: readonly TransformApplicationNode[];
  readonly edges: readonly ArtifactFlowEdge[];
  readonly createdAt: Timestamp;
}

/** Create a transform graph (version 1), optionally with initial nodes and edges. */
export interface CreateTransformGraphInput {
  readonly scope: TenantScope;
  readonly id: TransformGraphId;
  readonly nodes?: readonly TransformApplicationNode[];
  readonly edges?: readonly ArtifactFlowEdge[];
}

/**
 * Append-only correction/extension: appends nodes and/or edges to a graph in
 * ONE atomic operation, creating version + 1. The resulting version must
 * stay a well-formed DAG over resolvable definitions (reference integrity,
 * no duplicate ids, no cycles); input-constraint satisfaction is checked by
 * {@link TransformGraphPort.validateTransformGraph}.
 */
export interface AppendToTransformGraphInput {
  readonly scope: TenantScope;
  readonly graphId: TransformGraphId;
  readonly nodes?: readonly TransformApplicationNode[];
  readonly edges?: readonly ArtifactFlowEdge[];
}

/** Identifies one artifact by id + exact version for lineage/subgraph queries. */
export interface TransformArtifactQuery {
  readonly artifactId: ArtifactId;
  readonly version: Version;
}

/**
 * The lineage of one external artifact within a graph version: which
 * transforms (directly and transitively) consume it, and therefore which
 * declared outputs derive from it. `definitions[i]` resolves
 * `downstreamNodes[i]`'s (definitionId, definitionVersion) — each carries
 * the output contract, so the trace answers "which transforms produce which
 * outputs from this artifact".
 */
export interface TransformLineage {
  readonly graphId: TransformGraphId;
  readonly graphVersion: Version;
  /** The matched external input artifact reference. */
  readonly artifact: ArtifactRef;
  /** Nodes whose external inputs include the traced artifact. */
  readonly directConsumerNodeIds: readonly string[];
  /** Every node downstream of the artifact (transitive over artifact flow), topological order. */
  readonly downstreamNodes: readonly TransformApplicationNode[];
  /** Definitions aligned by index with `downstreamNodes`. */
  readonly definitions: readonly TransformDefinition[];
  /** The artifact-flow edges among the downstream nodes. */
  readonly edges: readonly ArtifactFlowEdge[];
}

/**
 * The induced subgraph around one external artifact: the artifact's
 * downstream nodes PLUS their transitive upstream ancestors (the full
 * production cone the artifact participates in), with the edges induced on
 * that node set.
 */
export interface TransformSubgraph {
  readonly graphId: TransformGraphId;
  readonly graphVersion: Version;
  /** The matched external input artifact reference. */
  readonly artifact: ArtifactRef;
  readonly nodes: readonly TransformApplicationNode[];
  readonly edges: readonly ArtifactFlowEdge[];
}

/** Machine-readable failure codes for transform graph operations. */
export type TransformGraphErrorCode =
  | 'invalid-input'
  | 'duplicate-graph'
  | 'duplicate-node'
  | 'duplicate-edge'
  | 'graph-not-found'
  | 'unknown-node'
  | 'unknown-transform-definition'
  | 'transform-definition-version-mismatch'
  | 'artifact-flow-cycle'
  | 'cross-tenant-reference'
  | 'artifact-not-in-graph';

/** Typed failure value (result union, the MOS domain convention). */
export interface TransformGraphError {
  readonly error: TransformGraphErrorCode;
  readonly message: string;
}

/** Machine-readable codes for structural/constraint validation failures. */
export type TransformGraphValidationFailureCode =
  | 'unknown-transform-definition'
  | 'transform-definition-version-mismatch'
  | 'unknown-node'
  | 'artifact-flow-cycle'
  | 'input-count-below-minimum'
  | 'input-count-above-maximum'
  | 'input-type-mismatch'
  | 'input-modality-mismatch'
  | 'input-rights-missing';

/** One named validation failure (the constraint name is cited when applicable). */
export interface TransformGraphValidationFailure {
  readonly code: TransformGraphValidationFailureCode;
  /** The node the failure implicates. */
  readonly nodeId: string;
  /** The named input constraint implicated (constraint-level failures only). */
  readonly constraintName?: string;
  readonly message: string;
}

/** The result of validating one graph version (structural + constraint). */
export interface TransformGraphValidation {
  readonly graphId: TransformGraphId;
  readonly graphVersion: Version;
  readonly valid: boolean;
  /** Every named failure (empty when valid). */
  readonly failures: readonly TransformGraphValidationFailure[];
}

/**
 * The Transform Graph port (LAB-011 runtime). Six public methods
 * (architecture policy budget: 12): create, append (version + 1), exact
 * version get, validation, lineage tracing and subgraph queries.
 *
 * Write-time invariants (enforced on EVERY create/append, so every stored
 * version is well-formed): node/edge ids unique within the graph; every node
 * cites a definition that resolves at the EXACT cited version; edge
 * endpoints exist; no self-edges; the artifact flow is ACYCLIC (a production
 * graph is a DAG — a cycle-introducing append is rejected); external input
 * artifact refs belong to the tenant scope. Input-constraint satisfaction
 * (types / modality / cardinality / rights) is validated on demand by
 * {@link TransformGraphPort.validateTransformGraph} because graphs are built
 * incrementally and intermediate versions may legitimately have nodes whose
 * upstream edges arrive in later appends.
 */
export interface TransformGraphPort {
  /**
   * Create a transform graph (version 1), optionally with initial nodes and
   * edges (composite transforms arrive as multi-node graphs). Write-time
   * invariants are enforced; duplicate graph ids are rejected
   * (`duplicate-graph`). Fails with `invalid-input`, `duplicate-graph`,
   * `duplicate-node`, `duplicate-edge`, `unknown-node`,
   * `unknown-transform-definition`, `transform-definition-version-mismatch`,
   * `artifact-flow-cycle` or `cross-tenant-reference`.
   */
  createTransformGraph(
    input: CreateTransformGraphInput,
  ): Promise<TransformGraph | TransformGraphError>;

  /**
   * Append nodes and/or edges (append-only correction: version + 1; prior
   * versions stay resolvable bit-for-bit). Same write-time invariants. Fails
   * with `graph-not-found` / `cross-tenant-reference` when the graph does not
   * resolve in this tenant scope, plus the codes above.
   */
  appendToTransformGraph(
    input: AppendToTransformGraphInput,
  ): Promise<TransformGraph | TransformGraphError>;

  /**
   * Fetch a graph — latest version by default, the EXACT version when given
   * (never a silent latest fallback) — or `null` when unknown in this tenant
   * scope (unknown and cross-tenant are indistinguishable on reads).
   */
  getTransformGraph(
    scope: TenantScope,
    graphId: TransformGraphId,
    version?: number,
  ): Promise<TransformGraph | null>;

  /**
   * Validate one graph version (structural + constraint): reference
   * integrity, DAG, and the input constraints of every node (external
   * artifact types / modalities / rights and cardinality, plus upstream
   * output types) against the definitions cited at their EXACT versions.
   * Returns every named failure; fails with `graph-not-found` when the graph
   * does not resolve in this tenant scope.
   */
  validateTransformGraph(
    scope: TenantScope,
    graphId: TransformGraphId,
    version?: number,
  ): Promise<TransformGraphValidation | TransformGraphError>;

  /**
   * Trace the lineage of one external artifact within a graph version: its
   * direct consumers and every downstream transform application with its
   * resolved definition (which transforms produce which outputs). Fails with
   * `graph-not-found` or `artifact-not-in-graph`.
   */
  traceArtifactLineage(
    scope: TenantScope,
    graphId: TransformGraphId,
    query: TransformArtifactQuery,
    version?: number,
  ): Promise<TransformLineage | TransformGraphError>;

  /**
   * Query the subgraph around one external artifact (the artifact's
   * downstream cone plus its transitive upstream ancestors, induced edges).
   * Fails with `graph-not-found` or `artifact-not-in-graph`.
   */
  querySubgraph(
    scope: TenantScope,
    graphId: TransformGraphId,
    query: TransformArtifactQuery,
    version?: number,
  ): Promise<TransformSubgraph | TransformGraphError>;
}
