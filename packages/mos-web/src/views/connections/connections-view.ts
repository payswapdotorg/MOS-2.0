/**
 * Connections section root presentation (UX-004) — composes the two DISTINCT
 * authority presentations. Loading / error / empty states explicit; no
 * fabricated numbers. PRESENTATION ONLY.
 */
import type {
  ConnectionsViewData,
  ConnectionsViewPort,
} from '../../ports/connections-views.js';
import { renderDirectory } from './provider-directory-view.js';
import { renderBindings } from './binding-lifecycle-view.js';

export type ConnectionsRenderState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'empty' }
  | { state: 'ready'; lines: string[] };

export async function renderConnections(
  port: ConnectionsViewPort,
): Promise<ConnectionsRenderState> {
  let data: ConnectionsViewData;
  try {
    data = await port.getConnectionsViewData();
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? err.message : String(err) };
  }
  const lines = [
    ...renderDirectory(data.directory),
    '',
    ...renderBindings(data.bindings),
  ];
  if (
    data.directory.providers.length === 0 &&
    data.bindings.bindings.length === 0 &&
    data.directory.availability.kind === 'available' &&
    data.bindings.availability.kind === 'available'
  ) {
    return { state: 'empty' };
  }
  return { state: 'ready', lines };
}
