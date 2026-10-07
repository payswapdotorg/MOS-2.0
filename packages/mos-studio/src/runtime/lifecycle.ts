/**
 * Studio session lifecycle state machine (STUDIO-001 runtime).
 *
 * Implements EXACTLY the legal transition table documented on the W0-C
 * `StudioSessionLifecycle` contract (spec/mos-architecture-v2.0.md §13
 * standalone flow: → capture → processing → review → packaged; Lab mode adds
 * evaluation after packaging, outside the session):
 *
 * - requested  → loading | abandoned | failed
 * - loading    → capturing | abandoned | failed
 * - capturing  → processing | abandoned | failed
 * - processing → review | capturing (re-capture/treatment loop) | abandoned | failed
 * - review     → processing (treatment requested) | packaged | abandoned | failed
 * - packaged   → closed
 * - closed / abandoned / failed are TERMINAL
 *
 * Transitions are append-only: the history recorded on the session is never
 * rewritten (architecture policy requireAppendOnlyHistoryWhereDeclared).
 */

import type { StudioSessionLifecycleState } from "../contracts/studio-session.js";

/** Legal forward transitions of the Studio session lifecycle. */
const LEGAL_TRANSITIONS: Readonly<Record<StudioSessionLifecycleState, readonly StudioSessionLifecycleState[]>> = {
  requested: ["loading", "abandoned", "failed"],
  loading: ["capturing", "abandoned", "failed"],
  capturing: ["processing", "abandoned", "failed"],
  processing: ["review", "capturing", "abandoned", "failed"],
  review: ["processing", "packaged", "abandoned", "failed"],
  packaged: ["closed"],
  closed: [],
  abandoned: [],
  failed: [],
};

/** Terminal states — no outgoing transitions, history retained forever. */
export const TERMINAL_SESSION_STATES: readonly StudioSessionLifecycleState[] = [
  "closed",
  "abandoned",
  "failed",
];

/** Whether `from → to` is a legal lifecycle transition. */
export function isLegalTransition(
  from: StudioSessionLifecycleState,
  to: StudioSessionLifecycleState,
): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** All states a transition is legal to from `from`. */
export function legalTargets(from: StudioSessionLifecycleState): readonly StudioSessionLifecycleState[] {
  return LEGAL_TRANSITIONS[from] ?? [];
}
