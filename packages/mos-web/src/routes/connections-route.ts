import type { ConnectionsRenderState } from '../views/connections/connections-view.js';

/**
 * Connections route helpers (UX-004). The shell's hand-rolled dispatch
 * (`route.ts`) parses `/connections` into the dedicated `connections` route
 * kind; these helpers carry the surface's honest loading/fallback verdicts
 * for orchestration and tests. Pure — no route state, per WEB-001.
 */
export const CONNECTIONS_ROUTE_PATH = '/connections';

export function parseConnectionsRoute(
  path: string,
): { section: 'connections' } | null {
  return path === CONNECTIONS_ROUTE_PATH || path.startsWith(CONNECTIONS_ROUTE_PATH + '/')
    ? { section: 'connections' }
    : null;
}

export function connectionsRouteLoading(): { loading: true; section: 'connections' } {
  return { loading: true, section: 'connections' };
}

/** Honest fallback — a verdict, never a placeholder. */
export function connectionsFallback(reason: string): ConnectionsRenderState {
  return { state: 'error', message: `connections surface unavailable: ${reason}` };
}
