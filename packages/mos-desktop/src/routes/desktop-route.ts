import { parseMosRoute } from '@mos/web';
import type { MosRoute } from '@mos/web';
// The workbench route helper lives in its own dependency-free module so
// the node test runner can consume it directly through the built dist.
export {
  workbenchSurfaceFromAppPath,
  type WorkbenchSurface,
} from './workbench-route.js';

/**
 * Desktop route bridging (registry module `desktop`, presentation-only).
 *
 * The MOS shell's hand-rolled route model is a pure function of the URL —
 * one route per load, real navigation, no client route state (the audited
 * WEB-001 discipline). On the web host the route lives in the PATH; the
 * Electron main window loads the renderer over a `file://` origin where
 * there is no path to route on. The desktop bridge therefore carries the
 * SAME route state in the URL QUERY:
 *
 *   file://…/index.html?route=/lab&benchmark=<id>&version=<n>
 *
 * This module is the ONLY place that translation exists — `@mos/web`'s
 * route parser stays untouched, and the desktop shell reuses it verbatim:
 * `desktopRouteFromSearch` extracts the `route` param as the app path and
 * forwards every REMAINING query parameter (`mission`, `intent`,
 * `benchmark`, `calibration`, `provider`, …) as the parser's search input,
 * so the full route model — selections, receipts, failure markers — works
 * identically behind the `file://` origin.
 */

/** The query parameter that carries the app-internal route path. */
export const DESKTOP_ROUTE_QUERY_PARAM = 'route';

/**
 * Resolve the current desktop route from the window query string. The
 * `route` param supplies the app path (default `/` when absent — the home
 * route, exactly what the web shell does for the bare origin); every other
 * param is forwarded to `@mos/web`'s parser verbatim.
 */
export function desktopRouteFromSearch(search: string): MosRoute {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const routeParam = params.get(DESKTOP_ROUTE_QUERY_PARAM);
  params.delete(DESKTOP_ROUTE_QUERY_PARAM);
  const appPath = routeParam === null || routeParam.length === 0 ? '/' : routeParam;
  return parseMosRoute(appPath, params.toString());
}

/** Characters safe to serialize unescaped in the route query value. */
const SAFE_ROUTE_VALUE = /^[A-Za-z0-9/._~-]*$/;

function encodeRouteValue(value: string): string {
  return SAFE_ROUTE_VALUE.test(value) ? value : encodeURIComponent(value);
}

/**
 * Translate an app-internal href (`/missions?intent=<id>`, `/lab`, `/`) into
 * the desktop window's query form (`?route=/missions&intent=<id>`). Pure —
 * the caller decides how to navigate.
 */
export function desktopQueryFromAppHref(href: string): string {
  const questionIndex = href.indexOf('?');
  const rawPath = (questionIndex === -1 ? href : href.slice(0, questionIndex)).trim();
  const rest = questionIndex === -1 ? '' : href.slice(questionIndex + 1);
  const appPath = rawPath.length === 0 ? '/' : rawPath;
  const routeValue = encodeRouteValue(appPath.startsWith('/') ? appPath : `/${appPath}`);
  return rest.length === 0
    ? `?${DESKTOP_ROUTE_QUERY_PARAM}=${routeValue}`
    : `?${DESKTOP_ROUTE_QUERY_PARAM}=${routeValue}&${rest}`;
}

/**
 * Navigate the desktop window to an app-internal href by REWRITING the
 * `file://` URL's query — a real full load, preserving the shell's one
 * route per load discipline (`location.search` assignment reloads the
 * document, exactly like the web shell's `location.assign`).
 */
export function navigateDesktopAppHref(href: string): void {
  const win = globalThis.window;
  if (!win || !win.location) {
    throw new Error('desktop navigation requires a window location');
  }
  win.location.search = desktopQueryFromAppHref(href);
}

/** Whether an href is an app-internal route link (`/…`, not `//…`). */
export function isAppInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Install the desktop shell's link-navigation bridge: a capture-phase
 * document click listener that turns clicks on app-internal anchors
 * (the shell renders real `<a href="/missions">` links) into query-param
 * navigation on the `file://` origin instead of a broken filesystem
 * navigation. Modifier-key clicks, non-primary buttons, `target` other
 * than `_self`, download links and `rel="external"` links are left to the
 * host untouched.
 *
 * UX-003 wave 3: when the host passes `onAppInternalNavigate`, internal
 * link clicks go through the SOFT navigation the declared-intent refresh
 * established — `history.replaceState` rewrites the query (the URL stays
 * the route truth) and the host re-resolves the page model against the
 * SAME composition without a document reload. The per-load composition
 * therefore SURVIVES section navigation for the whole document session
 * (the in-process lab runtimes keep their records); without it every link
 * click would reload the document and wipe them. Hosts without the
 * callback keep the hard-navigation behavior verbatim.
 *
 * Returns the dispose function (idempotent) so hosts can tear the bridge
 * down on unmount; installing twice installs two bridges — hosts own the
 * lifecycle.
 */
export function installDesktopShellLinkNavigation(
  onAppInternalNavigate?: (href: string) => void,
): () => void {
  const doc = globalThis.document;
  if (!doc || typeof doc.addEventListener !== 'function') {
    return () => undefined;
  }

  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || !isPlainLeftClick(event)) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    if (anchor.target !== '' && anchor.target !== '_self') {
      return;
    }
    if (anchor.hasAttribute('download')) {
      return;
    }
    const rel = anchor.getAttribute('rel') ?? '';
    if (/\bexternal\b/i.test(rel)) {
      return;
    }
    const href = anchor.getAttribute('href');
    if (href === null || !isAppInternalHref(href)) {
      return;
    }
    event.preventDefault();
    if (onAppInternalNavigate) {
      onAppInternalNavigate(href);
      return;
    }
    navigateDesktopAppHref(href);
  };

  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('click', onClick, true);
  };
}
