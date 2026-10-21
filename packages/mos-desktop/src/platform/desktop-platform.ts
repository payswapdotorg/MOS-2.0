/**
 * MOS desktop platform port (registry module `desktop`) — the host
 * capability-parity seam mirroring `@mos/web`'s `WebMosPlatform`
 * (`createWebMosPlatform()`, the audited KEEP-table pattern), adapted for
 * the Electron renderer's `file://` origin:
 *
 *  - `hostKind` is `'desktop-host'` (the host discriminator stays explicit;
 *    differences between hosts live HERE, never in components);
 *  - `setDocumentTitle` drives the same `document.title` surface the web
 *    platform does (per-route titles work identically in Electron);
 *  - `openExternalUrl` reports the honest outcome of the host's
 *    `window.open` (the desktop main process owns whether external URLs
 *    actually open — a blocked outcome is an ordinary result, not an
 *    exception), and `canOpenExternalUrls` is conservatively `false` until
 *    a desktop shell-open capability is wired (no fake capability claims).
 *
 * Browser globals are reached only inside method bodies, so the module can
 * be imported and type-checked anywhere (the same discipline as the web
 * port).
 */

/** Host capabilities the MOS desktop shell runs with. */
export interface DesktopMosPlatform {
  /** Discriminator for the host this platform was created for. */
  readonly hostKind: 'desktop-host';
  /**
   * Whether THIS host can open external URLs in a new context. `false` in
   * the desktop build: no shell-open capability is wired yet, and the
   * platform never claims a capability the host has not bound.
   */
  readonly canOpenExternalUrls: boolean;
  /** Set the document title (used for per-route titles). */
  setDocumentTitle(title: string): void;
  /**
   * Open an external URL in a new context. Returns `'opened'` or
   * `'blocked'` — a missing `window.open` or a blocked popup is an ordinary
   * outcome, not an exception (mirrors the web port contract).
   */
  openExternalUrl(url: string): 'opened' | 'blocked';
}

/**
 * Create the desktop platform. Reaches only for browser globals inside
 * method bodies, so the module can be imported and type-checked anywhere.
 */
export function createDesktopMosPlatform(): DesktopMosPlatform {
  return {
    hostKind: 'desktop-host',
    canOpenExternalUrls: false,
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
