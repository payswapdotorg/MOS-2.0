/**
 * Studio-owned adaptive sequencer port (STUDIO-003, §14).
 *
 * §14: "Adaptive follow-up questions can be selected from a declared
 * question/branch graph based on answers." The selection is DETERMINISTIC
 * data-driven logic over the DECLARED branch edges — the studio implements it
 * for real (runtime/script-graph/adaptive-sequencer.ts); this port is the
 * seam consumers (interviewer drivers, formats) depend on.
 *
 * Determinism contract: same (graph version, current node, answer ref) →
 * same next node, always. An unknown graph version is an explicit failure —
 * the sequencer NEVER silently falls back to the latest version.
 */

import type { AnswerRef } from "../contracts/refs.js";
import type { ScriptGraphVersionRef } from "../contracts/script-graph.js";

/** Input of {@link AdaptiveSequencerPort.selectNextNode}. */
export interface AdaptiveSelectionInput extends ScriptGraphVersionRef {
  /** Node the participant just answered (or the entry node when starting). */
  readonly currentNodeId: string;
  /** Ref of the recorded answer that drives the branch selection. */
  readonly answerRef: AnswerRef;
}

/** Deterministic next-node selection result. */
export type AdaptiveSelectionResult =
  | { readonly ok: true; readonly nextNodeId: string | null }
  | { readonly ok: false; readonly error: AdaptiveSelectionError };

/** Failure modes of adaptive selection (explicit, never silent). */
export type AdaptiveSelectionError =
  | { readonly kind: "graph-not-found"; readonly graphId: ScriptGraphVersionRef["graphId"] }
  | { readonly kind: "graph-version-not-found"; readonly ref: ScriptGraphVersionRef }
  | { readonly kind: "node-not-in-graph"; readonly nodeId: string }
  | { readonly kind: "sequencer-unavailable"; readonly reason: string };

/**
 * Narrow port selecting the next interview node from the declared branch
 * graph based on the participant's answer refs (§14). `null` means the graph
 * has no further node (interview complete on this path).
 */
export interface AdaptiveSequencerPort {
  /** Select the next node from the declared branch graph. */
  selectNextNode(input: AdaptiveSelectionInput): Promise<AdaptiveSelectionResult>;
}
