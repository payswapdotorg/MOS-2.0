import type { SocialPlatformView } from '../ports/social-workspace.js';
import {
  SOCIAL_BROWSER_EMBEDDED_NOTE,
  SOCIAL_BROWSER_FALLBACK_NOTE,
  SOCIAL_BROWSER_FALLBACK_TITLE,
  SOCIAL_BROWSER_PANE_TITLE,
  SOCIAL_BROWSER_RETURN_LABEL,
  SOCIAL_BROWSER_SECURITY_NOTE,
} from './social-presentation.js';

/**
 * The MOS guided browser pane (the UXR social wave, §8.2) — an
 * ELECTRON-ONLY surface over the desktop substrate's `<webview>` tag.
 *
 * DISCIPLINE (all of it inherited, none of it re-implemented):
 *  - The main window's `webviewTag: true` + `will-attach-webview`
 *    hardening (sandbox, preload swap, URL protocol allowlist) applies to
 *    EVERY webview — this pane inherits it and performs NO window.zcode
 *    calls of its own. The pane renders the tag plus OUR OWN nav bar; it
 *    never scripts into the page contents and never collects tokens.
 *  - `partition="persist:mos-guided-browser"` isolates the pane's cookies
 *    from the app origin; `allowpopups` is deliberately NOT set.
 *  - In the browser shell (vite preview / any non-Electron DOM) the pane
 *    renders the HONEST fallback verdict + the secure system-browser
 *    fallback link (the handoff's sanctioned path for providers that block
 *    embedded sign-in): a plain external anchor, `target="_blank"`,
 *    `rel="noopener noreferrer"`.
 *
 * HOOK-FREE by house discipline (render-tree-testable): the webview's own
 * navigation state lives in the ELEMENT and the DOM, not React state — the
 * same "the browser owns state" posture as the uncontrolled intent forms.
 * The nav handlers query the pane's own DOM at click time.
 */

/* ---------- the Electron webview tag's typed surface (structural) ---------- */

/** The `<webview>` event payloads this pane listens to (Electron's contract). */
interface WebviewEventDetail {
  readonly url?: string;
  readonly errorCode?: number;
  readonly errorDescription?: string;
  readonly validatedURL?: string;
  readonly isMainFrame?: boolean;
}

type WebviewEvent = Event & { readonly detail?: WebviewEventDetail };

/**
 * The Electron webview element as this pane uses it (imperative nav only —
 * a STRUCTURAL view over the tag; React's own `webview` JSX typing stays
 * untouched, and the cast below is the only place the tag is narrowed).
 */
interface WebviewElement extends HTMLElement {
  goBack(): void;
  goForward(): void;
  reload(): void;
  getURL(): string;
}

function asWebviewElement(node: HTMLElement | null): WebviewElement | null {
  if (node === null) {
    return null;
  }
  return node as WebviewElement;
}

/** The pane's DOM ids (shared by the render and the imperative handlers). */
const WEBVIEW_ID = 'mos-guided-webview';
const URL_DISPLAY_ID = 'mos-guided-browser-url';
const LOADING_ID = 'mos-guided-browser-loading';
const ERROR_ID = 'mos-guided-browser-error';

/**
 * Feature-detect the embedded provider view. The honest discriminator:
 * Electron registers `<webview>` as a custom element when `webviewTag` is
 * enabled on the window; a plain browser DOM creates an unknown element
 * for the same tag. The pane therefore renders the webview ONLY where the
 * substrate actually provides it — everywhere else it renders the honest
 * fallback verdict, never a decorative iframe-shaped frame.
 */
function isWebviewTagAvailable(): boolean {
  if (typeof document === 'undefined' || !document.createElement('webview')) {
    return false;
  }
  return typeof customElements !== 'undefined' && customElements.get('webview') !== undefined;
}

function setTextOf(id: string, text: string): void {
  const node = typeof document === 'undefined' ? null : document.getElementById(id);
  if (node !== null) {
    node.textContent = text;
  }
}

function setHiddenOf(id: string, hidden: boolean): void {
  const node = typeof document === 'undefined' ? null : document.getElementById(id);
  if (node !== null) {
    node.hidden = hidden;
  }
}

/* ---------- the honest fallback (browser shell + missing public URL) ---------- */

function SocialGuidedBrowserFallback({ platform }: { readonly platform: SocialPlatformView }) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      data-testid="social-guided-browser-fallback"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">
          {SOCIAL_BROWSER_PANE_TITLE} · {platform.displayName} sources
        </p>
        {platform.publicSiteUrl !== null ? (
          <a
            href={platform.publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            data-testid="social-guided-browser-open-external"
          >
            Open {platform.displayName} externally ↗
          </a>
        ) : null}
      </div>
      <p
        className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
        data-testid="social-guided-browser-unavailable"
      >
        {SOCIAL_BROWSER_FALLBACK_TITLE}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        {SOCIAL_BROWSER_FALLBACK_NOTE}
      </p>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {SOCIAL_BROWSER_SECURITY_NOTE}.
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        {SOCIAL_BROWSER_EMBEDDED_NOTE} — the external link opens the provider site in the system
        browser (`target="_blank" rel="noopener noreferrer"`), never inside this shell.
      </p>
    </div>
  );
}

/* ---------- the Electron pane (webview + OUR OWN nav bar) ---------- */

function webviewElementOf(): WebviewElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return asWebviewElement(document.getElementById(WEBVIEW_ID));
}

/**
 * Attach the pane's honest state wiring: loading start/stop, URL display,
 * and the fail-load error state. Imperative on purpose — the webview owns
 * its state; React re-renders nothing on navigation.
 */
function attachWebviewWiring(node: HTMLElement): void {
  const webview = asWebviewElement(node);
  if (webview === null) {
    return;
  }
  const onStart = (): void => setHiddenOf(LOADING_ID, false);
  const onStop = (): void => setHiddenOf(LOADING_ID, true);
  const onUrl = (event: WebviewEvent): void => {
    const url = event.detail?.url;
    if (typeof url === 'string' && url.length > 0) {
      setTextOf(URL_DISPLAY_ID, url);
    }
  };
  const onFail = (event: WebviewEvent): void => {
    if (event.detail?.isMainFrame === false) {
      return;
    }
    setHiddenOf(ERROR_ID, false);
    setTextOf(
      ERROR_ID,
      `The provider page could not load (code ${String(event.detail?.errorCode ?? '?')}: ${
        event.detail?.errorDescription ?? 'no description'
      }). Retry with the reload control, or open the site externally.`,
    );
    setHiddenOf(LOADING_ID, true);
  };
  webview.addEventListener('did-start-loading', onStart);
  webview.addEventListener('did-stop-loading', onStop);
  webview.addEventListener('did-navigate', onUrl);
  webview.addEventListener('did-navigate-in-page', onUrl);
  webview.addEventListener('did-fail-load', onFail);
}

function SocialGuidedBrowserWebview({
  platform,
  src,
}: {
  readonly platform: SocialPlatformView;
  readonly src: string;
}) {
  const externalHref = platform.publicSiteUrl;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-slate-100 p-2"
      data-testid="social-guided-browser-webview"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => webviewElementOf()?.goBack()}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
          data-testid="social-guided-browser-back"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => webviewElementOf()?.goForward()}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
          data-testid="social-guided-browser-forward"
        >
          Forward →
        </button>
        <button
          type="button"
          onClick={() => webviewElementOf()?.reload()}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
          data-testid="social-guided-browser-reload"
        >
          ↻ Reload
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof document === 'undefined') {
              return;
            }
            const main = document.getElementById('mos-main');
            if (main !== null) {
              main.scrollIntoView({ block: 'start' });
              main.focus({ preventScroll: true });
            }
          }}
          className="rounded-md border border-mos-navy bg-mos-navy px-2 py-1 text-[11px] font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
          data-testid="social-guided-browser-return"
        >
          {SOCIAL_BROWSER_RETURN_LABEL}
        </button>
        <span
          className="ml-auto hidden max-w-full truncate rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-600 sm:inline-block"
          data-testid="social-guided-browser-url-display"
          title={src}
        >
          <span id={URL_DISPLAY_ID}>{src}</span>
          <span className="text-slate-400"> • secure provider route</span>
        </span>
      </div>
      <p
        id={LOADING_ID}
        hidden
        className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800"
        data-testid="social-guided-browser-loading"
        role="status"
      >
        Loading the provider page…
      </p>
      <p
        id={ERROR_ID}
        hidden
        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800"
        data-testid="social-guided-browser-error"
        role="alert"
      />
      <webview
        id={WEBVIEW_ID}
        src={src}
        partition="persist:mos-guided-browser"
        className="h-[420px] w-full rounded-md border border-slate-300 bg-white"
        aria-label={`${SOCIAL_BROWSER_PANE_TITLE} · ${platform.displayName} sources`}
        ref={(node) => {
          if (node !== null) {
            attachWebviewWiring(node);
          }
        }}
      />
      <p className="text-[11px] leading-snug text-slate-500" data-testid="social-guided-browser-security-note">
        {SOCIAL_BROWSER_SECURITY_NOTE}.
      </p>
      <p className="text-[11px] leading-snug text-slate-500" data-testid="social-guided-browser-embedded-note">
        {SOCIAL_BROWSER_EMBEDDED_NOTE}
        {externalHref === null ? (
          '.'
        ) : (
          <>
            {' '}
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sky-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              data-testid="social-guided-browser-open-external"
            >
              Open {platform.displayName} externally ↗
            </a>
            (system browser, `noopener noreferrer` — the secure fallback for providers that block
            embedded sign-in).
          </>
        )}
      </p>
    </div>
  );
}

/** The guided browser pane: webview where the substrate provides it, honest fallback otherwise. */
export function SocialGuidedBrowser({ platform }: { readonly platform: SocialPlatformView }) {
  const src = platform.publicSiteUrl;
  if (src === null || !isWebviewTagAvailable()) {
    return <SocialGuidedBrowserFallback platform={platform} />;
  }
  return <SocialGuidedBrowserWebview platform={platform} src={src} />;
}
