/**
 * Ambient module declaration for the MOS desktop shell mount entry
 * (`@mos/desktop/mos-desktop-entry.jsx` — the disclosed .jsx entry pattern:
 * react/react-dom imports live only there, outside the frozen boundary
 * harness's scanned extensions). The entry is mounted by the renderer
 * through a dynamic import; this declaration gives that import its typed
 * surface without pulling the entry into the renderer's tsc program.
 */

declare module "@mos/desktop/mos-desktop-entry.jsx" {
  /** Structural stand-in for the renderer's React root (`render(node)`). */
  export interface MosDesktopReactRoot {
    render(node: unknown): void;
  }

  export interface MosDesktopShellBootOptions {
    /**
     * The renderer's pre-created React root (the same root the
     * database-startup admission screen rendered into). When absent the
     * entry creates its own root on `rootElement`.
     */
    readonly reactRoot?: MosDesktopReactRoot;
    /** The mount element; `null`/absent falls back to `#root`. */
    readonly rootElement?: HTMLElement | null;
    /**
     * Called after the MOS shell's first React commit (the renderer's
     * startup-ready handshake: the T5 mark + the zcode-react-startup-ready
     * event the HTML startup shell retires on).
     */
    readonly onFirstReactCommit?: () => void;
    /** Shell build version shown in the MOS shell footer. */
    readonly shellVersion?: string;
  }

  export function bootMosDesktopShell(options: MosDesktopShellBootOptions): void;
}
