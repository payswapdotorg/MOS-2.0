/**
 * The versioned script-graph store (STUDIO-003) — REAL studio-owned logic.
 *
 * Responsibilities (§6 versioning discipline, same shape as the format
 * registry / artifact packages):
 * - VALIDATE every draft (unique node ids, entry node exists, edge endpoints
 *   exist, no duplicate (from, answer) branch keys, synthetic provenance
 *   names its generating intent);
 * - VERSION: registering a draft for a NEW graph id starts at version 1;
 *   `addVersion` on an existing graph id assigns the NEXT version and leaves
 *   every prior version untouched and resolvable (immutable versions);
 * - FREEZE stored graphs deeply (runtime immutability of returned values);
 * - RESOLVE by exact (graphId, version) — never a silent latest-version
 *   substitution; `latest()` is an explicit separate query.
 *
 * The store holds no engine, no agent and no I/O: it is pure in-process
 * versioned state (durable persistence is a later-wave concern, disclosed).
 */

import type {
  ScriptGraph,
  ScriptGraphDraft,
  ScriptGraphRevision,
  ScriptGraphVersionRef,
} from "../../contracts/script-graph.js";
import type { ScriptGraphId, Timestamp, Version } from "../../contracts/refs.js";

/** Registration/validation failure modes (typed, never thrown). */
export type ScriptGraphStoreError =
  | { readonly kind: "duplicate-graph-id"; readonly graphId: ScriptGraphId }
  | { readonly kind: "graph-not-found"; readonly graphId: ScriptGraphId }
  | { readonly kind: "invalid-graph"; readonly reasons: readonly string[] };

/** Options for {@link createScriptGraphStore}. */
export interface ScriptGraphStoreOptions {
  /** Injectable clock for `createdAt` stamps (deterministic tests). */
  readonly clock?: () => Timestamp;
  /** Injectable graph-id source (default: an internal monotonic counter). */
  readonly nextGraphId?: () => string;
}

/** Stored-graph handle returned by mutations (read-only view). */
export interface RegisteredScriptGraph {
  readonly graph: ScriptGraph;
  readonly versions: readonly Version[];
}

/** The versioned script-graph store surface (STUDIO-003). */
export interface ScriptGraphStore {
  /** Validate + register a draft as version 1 of a NEW graph. */
  register(draft: ScriptGraphDraft): { ok: true; value: RegisteredScriptGraph } | { ok: false; error: ScriptGraphStoreError };
  /** Validate + add the next immutable version of an EXISTING graph. */
  addVersion(graphId: ScriptGraphId, revision: ScriptGraphRevision): { ok: true; value: RegisteredScriptGraph } | { ok: false; error: ScriptGraphStoreError };
  /** Resolve EXACTLY one version (null when unknown — never a substitution). */
  resolve(ref: ScriptGraphVersionRef): ScriptGraph | null;
  /** Explicitly query the latest version of a graph. */
  latest(graphId: ScriptGraphId): { readonly ref: ScriptGraphVersionRef; readonly graph: ScriptGraph } | null;
  /** All stored versions of one graph, ascending. */
  versions(graphId: ScriptGraphId): readonly Version[];
}

/** Deep-freeze stored graphs (runtime immutability; finite depth by construction). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Structural validation of one draft (explicit, machine-readable reasons). */
export function validateScriptGraphDraft(draft: ScriptGraphDraft): readonly string[] {
  const reasons: string[] = [];
  if (draft.nodes.length === 0) {
    reasons.push("graph declares no nodes");
  }
  const nodeIds = new Set<string>();
  for (const node of draft.nodes) {
    if (nodeIds.has(node.nodeId)) {
      reasons.push(`duplicate node id: ${node.nodeId}`);
    }
    nodeIds.add(node.nodeId);
    if (node.provenance.origin === "synthetic-generated" && node.provenance.generatedFromIntent === undefined) {
      reasons.push(`synthetic node ${node.nodeId} does not name its generating intent`);
    }
  }
  if (!nodeIds.has(draft.entryNodeId)) {
    reasons.push(`entry node not in graph: ${draft.entryNodeId}`);
  }
  const branchKeys = new Set<string>();
  const edgeIds = new Set<string>();
  for (const edge of draft.branchEdges) {
    if (edgeIds.has(edge.edgeId)) {
      reasons.push(`duplicate edge id: ${edge.edgeId}`);
    }
    edgeIds.add(edge.edgeId);
    if (!nodeIds.has(edge.fromNodeId)) {
      reasons.push(`branch edge ${edge.edgeId} starts at unknown node: ${edge.fromNodeId}`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      reasons.push(`branch edge ${edge.edgeId} points at unknown node: ${edge.toNodeId}`);
    }
    const key = `${edge.fromNodeId}|${String(edge.answerRef)}`;
    if (branchKeys.has(key)) {
      reasons.push(`duplicate branch key (node ${edge.fromNodeId}, answer ${String(edge.answerRef)})`);
    }
    branchKeys.add(key);
  }
  for (const node of draft.nodes) {
    if (node.defaultNextNodeId !== undefined && !nodeIds.has(node.defaultNextNodeId)) {
      reasons.push(`node ${node.nodeId} falls back to unknown node: ${node.defaultNextNodeId}`);
    }
  }
  if (draft.provenance.origin === "synthetic-generated" && draft.intentId === undefined) {
    reasons.push("synthetic graph does not name its generating intent");
  }
  return reasons;
}

/** Create the versioned script-graph store (REAL studio logic, STUDIO-003). */
export function createScriptGraphStore(options: ScriptGraphStoreOptions = {}): ScriptGraphStore {
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  let graphCounter = 0;
  const nextGraphId = options.nextGraphId ?? (() => `script-graph-${++graphCounter}`);
  const graphs = new Map<string, { readonly versions: Map<number, ScriptGraph> }>();

  const storeRevision = (graphId: ScriptGraphId, version: number, draft: ScriptGraphDraft): ScriptGraph => {
    const graph: ScriptGraph = {
      graphId,
      version: version as Version,
      intentId: draft.intentId,
      provenance: { ...draft.provenance },
      entryNodeId: draft.entryNodeId,
      nodes: draft.nodes.map((node) => ({ ...node })),
      branchEdges: draft.branchEdges.map((edge) => ({ ...edge })),
      createdAt: clock(),
    };
    return deepFreeze(graph);
  };

  const versionsOf = (graphId: ScriptGraphId): readonly Version[] => {
    const entry = graphs.get(String(graphId));
    return entry ? ([...entry.versions.keys()].sort((a, b) => a - b) as Version[]) : [];
  };

  const registered = (graphId: ScriptGraphId): RegisteredScriptGraph => {
    const versions = versionsOf(graphId);
    const latestVersion = versions[versions.length - 1] as number;
    const entry = graphs.get(String(graphId)) as { readonly versions: Map<number, ScriptGraph> };
    return { graph: entry.versions.get(latestVersion) as ScriptGraph, versions };
  };

  return {
    register(draft) {
      const reasons = validateScriptGraphDraft(draft);
      if (reasons.length > 0) {
        return { ok: false, error: { kind: "invalid-graph", reasons } };
      }
      const graphId = nextGraphId() as ScriptGraphId;
      if (graphs.has(String(graphId))) {
        return { ok: false, error: { kind: "duplicate-graph-id", graphId } };
      }
      graphs.set(String(graphId), { versions: new Map([[1, storeRevision(graphId, 1, draft)]]) });
      return { ok: true, value: registered(graphId) };
    },
    addVersion(graphId, revision) {
      const entry = graphs.get(String(graphId));
      if (entry === undefined) {
        return { ok: false, error: { kind: "graph-not-found", graphId } };
      }
      const reasons = validateScriptGraphDraft(revision);
      if (reasons.length > 0) {
        return { ok: false, error: { kind: "invalid-graph", reasons } };
      }
      const versions = [...entry.versions.keys()].sort((a, b) => a - b);
      const next = (versions[versions.length - 1] as number) + 1;
      entry.versions.set(next, storeRevision(graphId, next, revision));
      return { ok: true, value: registered(graphId) };
    },
    resolve(ref) {
      const entry = graphs.get(String(ref.graphId));
      return entry?.versions.get(ref.version) ?? null;
    },
    latest(graphId) {
      const versions = versionsOf(graphId);
      if (versions.length === 0) {
        return null;
      }
      const version = versions[versions.length - 1] as number;
      const entry = graphs.get(String(graphId)) as { readonly versions: Map<number, ScriptGraph> };
      const graph = entry.versions.get(version) as ScriptGraph;
      return { ref: { graphId, version: version as Version }, graph };
    },
    versions: versionsOf,
  };
}
