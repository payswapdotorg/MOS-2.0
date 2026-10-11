/**
 * Platform wiring for the Connections section (UX-004). The composition root
 * (OUTSIDE `src/`, see `testing/connections-composition-double.ts` at the
 * package root) satisfies `ConnectionsViewPort` with REAL-shaped data.
 * Presentation-only: this wiring module carries NO platform behavior beyond
 * the declared port handshake the shell mounts.
 */
import type { ConnectionsViewPort } from '../ports/connections-views.js';

export interface ConnectionsWiring {
  readonly port: ConnectionsViewPort;
  readonly sectionId: 'connections';
}

export function wireConnections(port: ConnectionsViewPort): ConnectionsWiring {
  return { port, sectionId: 'connections' };
}
