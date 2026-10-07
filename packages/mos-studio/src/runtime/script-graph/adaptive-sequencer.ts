/**
 * The adaptive sequencer (STUDIO-003) — REAL deterministic selection over the
 * declared branch graph (§14).
 *
 * Selection rule (declared data only, never invented):
 * 1. the branch edge whose (fromNodeId, answerRef) matches the input wins;
 * 2. otherwise the current node's declared `defaultNextNodeId`;
 * 3. otherwise `null` — the path is complete.
 *
 * The graph version is resolved EXACTLY: an unknown version is an explicit
 * `graph-version-not-found` failure, never a silent latest-version fallback.
 */

import type { AdaptiveSelectionInput, AdaptiveSelectionResult, AdaptiveSequencerPort } from "../../ports/adaptive-sequencer.js";
import type { ScriptGraphVersionRef } from "../../contracts/script-graph.js";
import type { ScriptGraphStore } from "./script-graph-store.js";

/** Options for {@link createAdaptiveSequencer}. */
export interface AdaptiveSequencerOptions {
  /** The versioned store the sequencer resolves exact graph versions from. */
  readonly store: ScriptGraphStore;
}

/** Create the deterministic adaptive sequencer over a versioned store. */
export function createAdaptiveSequencer(options: AdaptiveSequencerOptions): AdaptiveSequencerPort {
  const { store } = options;
  return {
    async selectNextNode(input: AdaptiveSelectionInput): Promise<AdaptiveSelectionResult> {
      const ref: ScriptGraphVersionRef = { graphId: input.graphId, version: input.version };
      const graph = store.resolve(ref);
      if (graph === null) {
        // Distinguish "no such graph" from "graph exists, version does not".
        if (store.versions(input.graphId).length === 0) {
          return { ok: false, error: { kind: "graph-not-found", graphId: input.graphId } };
        }
        return { ok: false, error: { kind: "graph-version-not-found", ref } };
      }
      const current = graph.nodes.find((node) => node.nodeId === input.currentNodeId);
      if (current === undefined) {
        return { ok: false, error: { kind: "node-not-in-graph", nodeId: input.currentNodeId } };
      }
      // Rule 1: declared branch edge matching (node, answer) — first in
      // declared order (validation guarantees the key is unique anyway).
      const branch = graph.branchEdges.find(
        (edge) => edge.fromNodeId === input.currentNodeId && edge.answerRef === input.answerRef,
      );
      if (branch !== undefined) {
        return { ok: true, nextNodeId: branch.toNodeId };
      }
      // Rule 2: the node's declared fallback successor.
      if (current.defaultNextNodeId !== undefined) {
        return { ok: true, nextNodeId: current.defaultNextNodeId };
      }
      // Rule 3: no declared successor — this path is complete.
      return { ok: true, nextNodeId: null };
    },
  };
}
