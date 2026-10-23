import type { ComposerActionId } from './composer-actions.js';

/**
 * The composer OPEN bridge (the §6 P0 universal-composer wave — UXR-WC).
 *
 * A presentation-only, module-level registry that lets ANY rendered view
 * open the shell-owned composer overlay without prop-drilling an open
 * callback through the route tree: an action-aware surface calls
 * {@link openMosComposer} with the action it preloads; the shell entry
 * subscribed through {@link subscribeMosComposerOpen} receives the entry and
 * routes it into the composer state machine.
 *
 * NO React state lives here — this module holds only the listener set; the
 * owning entry decides what an open event means (the shell chrome prop is
 * the rendered projection of that decision). The registry is per-document
 * (module-scope), matching the one-shell-per-document boot the entries use.
 */

/**
 * The entry an action-aware surface hands the composer: WHICH declared
 * action to preload, plus an optional free-form context label naming where
 * the ask came from (rendered verbatim in the composer's context line).
 */
export interface ComposerActionEntry {
  /** The declared action to preload (must exist in the action catalog). */
  readonly actionId: ComposerActionId;
  /** Where the ask came from, e.g. `'Missions surface'` (rendered verbatim). */
  readonly contextLabel?: string;
}

/** Open-event handlers: receive the entry, or `null` for a plain toggle-open. */
export type ComposerOpenHandler = (entry: ComposerActionEntry | null) => void;

const openHandlers = new Set<ComposerOpenHandler>();

/**
 * Open the Ask MOS composer. With an entry, the composer preloads that
 * declared action (the action-aware path: "Connect YouTube"-style buttons
 * on existing surfaces); with no entry, it opens on the current composer
 * state — the picker when nothing is in flight.
 */
export function openMosComposer(entry?: ComposerActionEntry): void {
  const settled: ComposerActionEntry | null = entry ?? null;
  for (const handler of [...openHandlers]) {
    handler(settled);
  }
}

/**
 * Subscribe to composer open events. Returns a disposer that unsubscribes
 * (idempotent) — the shell entry subscribes once per document.
 */
export function subscribeMosComposerOpen(handler: ComposerOpenHandler): () => void {
  openHandlers.add(handler);
  return () => {
    openHandlers.delete(handler);
  };
}
