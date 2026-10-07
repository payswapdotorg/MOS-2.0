/**
 * MOS web platform port (WEB-001) — the host capability-parity seam ported
 * from the audited `createWebPlatform()` pattern in `packages/web/src/main.tsx`
 * (UX substrate audit KEEP table), with MOS naming and no Zcode imports.
 *
 * The desktop host (`packages/mos-desktop`, registry: presentation-only,
 * owner worker-c) presents the same interface with desktop capabilities
 * later; differences between hosts stay explicit here instead of leaking
 * into components.
 */

/** Host capabilities the MOS shell runs with. */
export interface MosWebPlatform {
  /** Discriminator for the host this platform was created for. */
  readonly hostKind: 'web-host';
  /** Whether this host can open external URLs in a new tab. */
  readonly canOpenExternalUrls: boolean;
  /** Set the document title (used for per-route titles). */
  setDocumentTitle(title: string): void;
  /**
   * Open an external URL in a new context. Returns `'opened'` or
   * `'blocked'` — popup-blocking and missing `window.open` are ordinary
   * outcomes, not exceptions.
   */
  openExternalUrl(url: string): 'opened' | 'blocked';
}

/**
 * Create the web platform. Reaches only for browser globals inside method
 * bodies, so the module can be imported and type-checked anywhere.
 */
export function createWebMosPlatform(): MosWebPlatform {
  return {
    hostKind: 'web-host',
    canOpenExternalUrls: true,
    setDocumentTitle(title: string): void {
      const doc = globalThis.document;
      if (doc) {
        doc.title = title;
      }
    },
    openExternalUrl(url: string): 'opened' | 'blocked' {
      const win = globalThis.window;
      if (!win || typeof win.open !== 'function') {
        return 'blocked';
      }
      const opened = win.open(url, '_blank', 'noopener,noreferrer');
      return opened ? 'opened' : 'blocked';
    },
  };
}
