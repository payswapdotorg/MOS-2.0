import type { NotificationsRenderState } from '../views/notifications/notifications-view.js';
import type { MosWebComposition } from '../ports/composition.js';
import type { MosRoute } from './route.js';
import type { MosRouteView } from './route-loading.js';

/**
 * Notifications route helpers (NOTIFY-CS). The shell's hand-rolled dispatch
 * (`route.ts`) parses `/notifications` into the dedicated `notifications`
 * route kind; these helpers carry the surface's honest loading/fallback
 * verdicts for orchestration and tests. Pure — no route state, per WEB-001.
 */
export const NOTIFICATIONS_ROUTE_PATH = '/notifications';

export function parseNotificationsRoute(
  path: string,
): { section: 'notifications' } | null {
  return path === NOTIFICATIONS_ROUTE_PATH ||
    path.startsWith(NOTIFICATIONS_ROUTE_PATH + '/')
    ? { section: 'notifications' }
    : null;
}

export function notificationsRouteLoading(): { loading: true; section: 'notifications' } {
  return { loading: true, section: 'notifications' };
}

/** Honest fallback — a verdict, never a placeholder. */
export function notificationsFallback(reason: string): NotificationsRenderState {
  return { state: 'error', message: `notifications surface unavailable: ${reason}` };
}

/**
 * Load the Notifications page model (NOTIFY-CS): one honest read of the
 * recipient inbox through the notifications view port. The port's own
 * availability verdicts live INSIDE the view models; a thrown failure of
 * the read itself is a route error — never a placeholder surface.
 */
export async function loadNotificationsPage(
  composition: MosWebComposition,
  route: MosRoute & { readonly kind: 'notifications' },
  retryHref: string,
): Promise<MosRouteView> {
  try {
    const data = await composition.notifications.getNotificationsViewData();
    return {
      kind: 'notifications',
      data,
    };
  } catch (error) {
    return {
      kind: 'route-error',
      code: 'notifications-load-failed',
      message: error instanceof Error ? error.message : String(error),
      retryHref,
    };
  }
}
