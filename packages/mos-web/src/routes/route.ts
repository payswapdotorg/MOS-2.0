import type { ShellSectionId } from '../ports/app-shell.js';

/**
 * Hand-rolled route dispatch (WEB-001) — the audited pattern
 * (`packages/web/src/main.tsx` route table; BROWSER-SHELL-REPLACEMENT-PLAN
 * §2.1: "routing stays hand-rolled dispatch … no router dependency").
 *
 * The shell renders ONE route per load and navigates with real links, so the
 * route model is a pure function of the URL — there is no client-side route
 * state, which keeps the presentation-only discipline structural: every
 * interaction is either a link (full load) or an intent declaration through
 * a view port.
 */

export interface MissionsRoute {
  readonly kind: 'missions';
  /** Selected mission id (`?mission=<id>`), when given. */
  readonly missionId: string | null;
  /** Receipt of a freshly declared intent (`?intent=<id>`), when given. */
  readonly intentId: string | null;
  /** Typed failure code from a failed intent declaration (`?intent-error=<code>`). */
  readonly intentError: string | null;
}

export type MosRoute =
  | { readonly kind: 'home' }
  | MissionsRoute
  | { readonly kind: 'section'; readonly sectionId: ShellSectionId }
  | { readonly kind: 'unknown'; readonly path: string };

const SECTION_ROUTES: Readonly<Record<string, ShellSectionId>> = {
  '/studio': 'studio',
  '/lab': 'lab',
  '/connections': 'connections',
};

function firstParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value === null || value.length === 0 ? null : value;
}

/**
 * Parse a location into a route. Pure: `pathname` is the raw path, `search`
 * the raw query string (with or without a leading `?`). Unknown paths map to
 * the explicit `unknown` route — never to a silent fallback.
 */
export function parseMosRoute(pathname: string, search: string): MosRoute {
  const cleanPath =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (cleanPath === '/' || cleanPath === '') {
    return { kind: 'home' };
  }

  if (cleanPath === '/missions') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return {
      kind: 'missions',
      missionId: firstParam(params, 'mission'),
      intentId: firstParam(params, 'intent'),
      intentError: firstParam(params, 'intent-error'),
    };
  }

  const sectionId = SECTION_ROUTES[cleanPath];
  if (sectionId) {
    return { kind: 'section', sectionId };
  }

  return { kind: 'unknown', path: cleanPath };
}

/** Route display title used for the document title per route. */
export function mosRouteTitle(route: MosRoute): string {
  switch (route.kind) {
    case 'home':
      return 'MOS — Home';
    case 'missions':
      return route.missionId ? 'MOS — Missions · mission detail' : 'MOS — Missions';
    case 'section':
      return `MOS — ${route.sectionId}`;
    case 'unknown':
      return 'MOS — page not found';
  }
}
