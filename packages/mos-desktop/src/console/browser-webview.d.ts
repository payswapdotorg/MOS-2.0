/**
 * The MOS browser pane's WEBVIEW + PRELOAD-BRIDGE type surface (W39).
 *
 * The boundary law forbids every `@zcode/*` import in `packages/mos-*`
 * (and the hygiene pins allow no `react` import in `src/`), so the
 * Electron `<webview>` host element and the substrate preload's browser
 * namespace are declared HERE as local structural types — the same
 * declaration idiom the substrate itself uses
 * (packages/ui/src/electron-webview.d.ts), held to the subset this pane
 * actually exercises.
 *
 * TYPING MECHANICS (import-free by law): the augmentation lives inside
 * `declare module 'react'` — `HTMLAttributes` / `DetailedHTMLProps` /
 * the JSX namespace resolve from react's own module scope there, and
 * because `react/jsx-runtime`'s `IntrinsicElements` EXTENDS
 * `React.JSX.IntrinsicElements`, the `webview` entry propagates to the
 * automatic JSX runtime. The preload bridge is callable from the MOS
 * renderer process by design (the parity matrix's "most reuse-ready"
 * seam — `window.zcode.browserViewAttachGuest`); only the React pane
 * components ever lived behind the `@zcode/ui` import boundary.
 */

declare module 'react' {
  interface WebViewHTMLAttributes<T> extends HTMLAttributes<T> {
    nodeintegrationinsubframes?: string;
    allowpopups?: boolean | string;
  }
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement> & {
        partition?: string;
        src?: string;
      };
    }
  }
}

type ElectronWebviewSimpleEventName =
  | 'did-attach'
  | 'dom-ready'
  | 'did-start-loading'
  | 'did-stop-loading';
type ElectronWebviewNavigationEventName =
  | 'did-navigate'
  | 'did-navigate-in-page'
  | 'will-navigate';
type ElectronWebviewRenderProcessGoneReason =
  | 'clean-exit'
  | 'abnormal-exit'
  | 'killed'
  | 'crashed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure'
  | 'memory-eviction';

declare global {
  interface ElectronWebviewNavigationEvent extends Event {
    url: string;
    isMainFrame?: boolean;
  }

  interface ElectronWebviewDidFailLoadEvent extends Event {
    errorCode: number;
    errorDescription: string;
    validatedURL: string;
    isMainFrame: boolean;
  }

  interface ElectronWebviewTitleEvent extends Event {
    title: string;
    explicitSet: boolean;
  }

  interface ElectronWebviewRenderProcessGoneEvent extends Event {
    details: {
      reason: ElectronWebviewRenderProcessGoneReason;
      exitCode: number;
    };
  }

  /** The Electron `<webview>` host element (the subset this pane drives). */
  interface ElectronWebviewTag extends HTMLElement {
    src: string;
    getURL(): string;
    getTitle(): string;
    loadURL(url: string): Promise<void>;
    getWebContentsId(): number;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    openDevTools(): void;
    addEventListener(
      type: ElectronWebviewSimpleEventName,
      listener: (event: Event) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: 'did-fail-load',
      listener: (event: ElectronWebviewDidFailLoadEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: ElectronWebviewNavigationEventName,
      listener: (event: ElectronWebviewNavigationEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: 'page-title-updated',
      listener: (event: ElectronWebviewTitleEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: 'render-process-gone',
      listener: (event: ElectronWebviewRenderProcessGoneEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener(
      type: ElectronWebviewSimpleEventName,
      listener: (event: Event) => void,
      options?: EventListenerOptions,
    ): void;
    removeEventListener(
      type: 'did-fail-load',
      listener: (event: ElectronWebviewDidFailLoadEvent) => void,
      options?: EventListenerOptions,
    ): void;
    removeEventListener(
      type: ElectronWebviewNavigationEventName,
      listener: (event: ElectronWebviewNavigationEvent) => void,
      options?: EventListenerOptions,
    ): void;
    removeEventListener(
      type: 'page-title-updated',
      listener: (event: ElectronWebviewTitleEvent) => void,
      options?: EventListenerOptions,
    ): void;
    removeEventListener(
      type: 'render-process-gone',
      listener: (event: ElectronWebviewRenderProcessGoneEvent) => void,
      options?: EventListenerOptions,
    ): void;
  }

  interface HTMLWebViewElement extends ElectronWebviewTag {}

  /**
   * The substrate preload's browser namespace, as reachable from this
   * renderer (packages/desktop/src/preload/index.ts — the browserView*
   * contract). Optional throughout: the pane fail-closes honestly when
   * the bridge is absent (non-Electron host, older preload).
   */
  interface Window {
    readonly zcode?: {
      readonly browserViewAttachGuest?: (payload: {
        key: string;
        webContentsId: number;
        active?: boolean;
        workspaceKey?: string;
        remoteSessionId?: string;
        sessionId?: string;
        residencyGeneration?: number;
      }) => Promise<{ ok: boolean; reason?: string; recoveryRequested?: boolean }>;
      readonly browserViewDetachGuest?: (payload: {
        key: string;
        webContentsId: number;
      }) => Promise<boolean>;
      readonly openExternal?: (url: string) => void;
    };
  }
}

export {};
