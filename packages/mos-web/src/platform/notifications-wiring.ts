/**
 * Platform wiring for the Notifications section (NOTIFY-CS). The composition
 * root (OUTSIDE `src/`, see `testing/notifications-composition-double.ts` at
 * the package root) satisfies `NotificationsViewPort` with REAL-shaped data.
 * Presentation-only: this wiring module carries NO platform behavior beyond
 * the declared port handshake the shell mounts.
 */
import type { NotificationsViewPort } from '../ports/notifications-views.js';

export interface NotificationsWiring {
  readonly port: NotificationsViewPort;
  readonly sectionId: 'notifications';
}

export function wireNotifications(port: NotificationsViewPort): NotificationsWiring {
  return { port, sectionId: 'notifications' };
}
