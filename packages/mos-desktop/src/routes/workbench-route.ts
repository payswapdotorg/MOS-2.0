/**
 * The AGENT WORKBENCH route helper (the owner's build-ON-ZCode directive):
 * the pure path match deciding which SUBSTRATE surface a `/workbench*`
 * route names. Deliberately DEPENDENCY-FREE (no `@mos/web` import) so the
 * module is directly consumable from the node test runner through the
 * package's built dist — the desktop route bridge re-exports it alongside
 * its own parser (see desktop-route.ts).
 *
 * W35 EMERGENCE NOTE: `/workbench/new-task` is NO LONGER a substrate
 * route — the substrate's New Task page EMERGED as a native MOS console
 * section (path `/workbench/new-task` resolves through the console
 * section mapping in console-nav.ts; the entry renders it in the MOS
 * surface with no account gate). `/workbench/models` (Model Settings)
 * is native the same way. W36: `/workbench/tasks` (the Tasks list +
 * conversation view) and `/workbench/automations` (the Automations main
 * view) emerged native too. W37: `/workbench/plugins` (the Plugin
 * Marketplace) emerged native the same way. The remaining substrate
 * routes: `/workbench` the substrate workspace (sessions, groups and
 * projects) and `/workbench/settings` the substrate Settings page. The
 * desktop entry hands these surfaces to the host renderer's
 * `onRequestSubstrateSurface` (see mos-desktop-entry.jsx); the MOS page
 * model is never resolved for these routes.
 */

/** The substrate surface a workbench route names. */
export type WorkbenchSurface = 'chat' | 'settings';

const WORKBENCH_ROUTE_BY_PATH: Readonly<Record<string, WorkbenchSurface>> = {
  '/workbench': 'chat',
  '/workbench/': 'chat',
  '/workbench/settings': 'settings',
};

/**
 * Resolve an app-internal path (or href) to the workbench surface it
 * names, or `null` when the path is not a substrate workbench route
 * (native workbench routes — `/workbench/new-task`, `/workbench/models`,
 * `/workbench/tasks`, `/workbench/automations` — resolve through the
 * console section mapping instead). Query strings and trailing slashes
 * are tolerated (only the path decides the surface).
 */
export function workbenchSurfaceFromAppPath(path: string): WorkbenchSurface | null {
  const withoutQuery = (path.split('?', 1)[0] ?? path).replace(/\/+$/, '') || '/';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return WORKBENCH_ROUTE_BY_PATH[normalized] ?? null;
}
