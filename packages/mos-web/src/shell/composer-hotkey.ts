/**
 * The universal agent composer's global hotkey (the §6 P0 universal-composer
 * wave — the "Ask MOS" toggle, UXR-WC).
 *
 * A scanned, hook-free, React-free module: it installs ONE capture-phase
 * `keydown` listener on the document and calls the toggle callback when the
 * operator presses the composer's action key (Ctrl+J everywhere; Cmd+J is
 * additionally honored on darwin so the macOS convention works — the
 * Electron-safe combination the target design pins on the header control).
 * Repeats are ignored (holding the key does not strobe the overlay). The
 * returned disposer removes the listener — the install/dispose pattern the
 * entries already use for the soft-link navigation bridges.
 *
 * Presentation-only by construction: no state lives here beyond the listener
 * registration; the toggle callback is whatever the shell entry provides.
 */

/**
 * The composer's action key as PLAIN DATA (test-facing): the key, the
 * cross-platform modifier, and the darwin alternate. Electron-safe — no
 * globalShortcut/native accelerator registration, only the renderer's own
 * document listener, so nothing here can conflict with menu accelerators.
 */
export const MOS_COMPOSER_HOTKEY = Object.freeze({
  /** The action key (case-insensitive; matches both `j` and `J`). */
  key: 'j',
  /** The primary modifier on every platform. */
  modifier: 'Control',
  /** The alternate modifier honored ONLY on darwin (Cmd+J). */
  darwinAlternateModifier: 'Meta',
} as const);

/** The platform vocabulary the matcher understands (plain data for tests). */
export type ComposerHotkeyPlatform = 'darwin' | 'other';

/**
 * Resolve the current platform from the renderer globals (best effort): the
 * navigator's platform/userAgent strings are the only platform signal a
 * presentation-only renderer may read. Unknown/absent resolves to `'other'`
 * — the Ctrl-only combination, never a guess.
 */
export function composerHotkeyPlatform(): ComposerHotkeyPlatform {
  const nav = globalThis.navigator;
  if (nav === undefined || nav === null) {
    return 'other';
  }
  const platform = typeof nav.platform === 'string' ? nav.platform : '';
  const userAgent = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  if (platform.startsWith('Mac') || /\bMac\b/.test(userAgent)) {
    return 'darwin';
  }
  return 'other';
}

/** The minimal event surface the matcher reads (plain data for tests). */
export interface ComposerHotkeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
}

/**
 * Does this keyboard event activate the composer toggle? Pure: Ctrl+J on
 * every platform (Cmd+J additionally on darwin), case-insensitive key,
 * repeats ignored, and plain Shift/Alt combinations refused (they belong to
 * other shortcuts).
 */
export function composerHotkeyMatches(
  event: ComposerHotkeyEvent,
  platform: ComposerHotkeyPlatform,
): boolean {
  if (event.repeat) {
    return false;
  }
  if (event.key.toLowerCase() !== MOS_COMPOSER_HOTKEY.key) {
    return false;
  }
  if (event.shiftKey || event.altKey) {
    return false;
  }
  if (event.ctrlKey) {
    return true;
  }
  return platform === 'darwin' && event.metaKey;
}

/**
 * Install the composer hotkey as a CAPTURE-phase document keydown listener.
 * Capture phase so the toggle fires before any route surface's own key
 * handling; `preventDefault` keeps the combination from scrolling or
 * triggering anything else in the Electron renderer. Returns a disposer
 * that removes the listener (idempotent).
 */
export function installMosComposerHotkey(onToggle: () => void): () => void {
  const doc = globalThis.document;
  if (!doc || typeof doc.addEventListener !== 'function') {
    // No document (SSR/worker): nothing to install — a no-op disposer keeps
    // the entry's cleanup symmetric.
    return () => undefined;
  }
  const handler = (event: KeyboardEvent): void => {
    if (composerHotkeyMatches(event, composerHotkeyPlatform())) {
      event.preventDefault();
      onToggle();
    }
  };
  doc.addEventListener('keydown', handler, true);
  return () => {
    doc.removeEventListener('keydown', handler, true);
  };
}
