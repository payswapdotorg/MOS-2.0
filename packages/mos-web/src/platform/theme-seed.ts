/**
 * MOS theme seed (WEB-001) — the pre-paint theme resolution pattern ported
 * from the audited Zcode web shell (`packages/web/src/webThemeSeed.ts`, UX
 * substrate audit KEEP table) with MOS tokens: storage key `mos-theme`,
 * themes `light` / `dark`, default `dark`.
 *
 * `index.html` inlines a mirror of this resolution so the first paint is
 * themed before the JS bundle executes (the same duplication the audited
 * shell carries); this module is the canonical, tested version.
 */

export type MosThemeSeed = 'light' | 'dark' | 'system';

export const MOS_DEFAULT_THEME: MosThemeSeed = 'dark';

export const MOS_THEME_STORAGE_KEY = 'mos-theme';

export interface ResolveMosInitialThemeInput {
  /** Persisted preference (localStorage under {@link MOS_THEME_STORAGE_KEY}). */
  readonly storedTheme?: string | null;
  /** Injected `prefers-color-scheme: dark` probe result. */
  readonly prefersDark?: boolean;
  readonly defaultTheme?: MosThemeSeed;
}

/** The resolved concrete theme the document should be painted with. */
export type ResolvedMosTheme = 'light' | 'dark';

function isMosThemeSeed(value: unknown): value is MosThemeSeed {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Resolve the initial theme: stored preference wins, `system` resolves
 * through the injected dark-mode probe, anything else (missing, corrupt,
 * foreign) falls back to the default. Never throws — a broken stored value
 * must not break the first paint.
 */
export function resolveMosInitialTheme(input: ResolveMosInitialThemeInput): ResolvedMosTheme {
  const defaultTheme = isMosThemeSeed(input.defaultTheme) ? input.defaultTheme : MOS_DEFAULT_THEME;
  const seed = isMosThemeSeed(input.storedTheme) ? input.storedTheme : defaultTheme;
  if (seed === 'system') {
    return input.prefersDark === false ? 'light' : 'dark';
  }
  return seed;
}

/**
 * Read the persisted theme seed from the browser's `localStorage` (guarded —
 * storage access can throw under privacy settings, and a failure must not
 * break the boot). `null` when absent or unreadable.
 */
export function readStoredMosTheme(storage: { getItem(key: string): string | null } | null): string | null {
  if (storage === null || typeof storage.getItem !== 'function') {
    return null;
  }
  try {
    return storage.getItem(MOS_THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Probe the browser's dark-mode preference. Defaults to `true` (dark) when
 * the probe is unavailable — matching the resolved default and the pre-paint
 * fallback in `index.html`.
 */
export function probePrefersDark(
  win: { matchMedia(query: string): { matches: boolean } } | null,
): boolean {
  if (win === null || typeof win.matchMedia !== 'function') {
    return true;
  }
  try {
    return win.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

/**
 * Apply a resolved theme to a document: sets the `data-mos-theme` surface
 * attribute, the `color-scheme` style and the `dark` class used by the
 * tailwind dark variant. Tolerates a missing document (tests, SSR-style
 * mounting) as a no-op.
 */
export function applyMosThemeToDocument(
  theme: ResolvedMosTheme,
  doc: {
    documentElement: {
      setAttribute(name: string, value: string): void;
      style: { setProperty(name: string, value: string): void };
      classList: { add(cls: string): void; remove(cls: string): void };
    };
  } | null,
): void {
  if (doc === null) {
    return;
  }
  const root = doc.documentElement;
  root.setAttribute('data-mos-theme', theme);
  root.style.setProperty('color-scheme', theme);
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
