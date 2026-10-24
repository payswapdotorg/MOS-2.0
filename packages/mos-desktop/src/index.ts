/**
 * Public surface of `@mos/desktop` (MOS v2.0 registry module `desktop`).
 *
 * Presentation-only desktop shell package: exports the desktop platform
 * port (the host capability-parity seam mirroring `@mos/web`'s web
 * platform) and the `file://` route bridge (query-param route state that
 * reuses `@mos/web`'s hand-rolled route parser verbatim). The shell's view
 * components are NOT re-exported — the desktop mounts `@mos/web`'s route
 * component tree directly through these ports.
 *
 * The PRODUCTION composition root lives OUTSIDE `src/`
 * (`composition/compose-production-mos-web.ts` — the @mos/web seam
 * discipline: domain runtimes are imported only there, by relative
 * built-dist paths). The package-ROOT mount entry
 * (`mos-desktop-entry.jsx`) is the disclosed react/react-dom mount point
 * outside the frozen boundary harness's scanned extensions.
 *
 * This package imports ONLY `@mos/web` + `@mos/contracts` (types and the
 * pure route/platform functions); react/react-dom are imported exclusively
 * by the `.jsx` entry. All exports here are runtime-safe presentation
 * modules (no React import anywhere in `src/`).
 */

// ---- Desktop platform port (host capabilities) ----
export { createDesktopMosPlatform } from './platform/desktop-platform.js';
export type { DesktopMosPlatform } from './platform/desktop-platform.js';

// ---- file:// route bridging (query-param route state) ----
export {
  DESKTOP_ROUTE_QUERY_PARAM,
  desktopQueryFromAppHref,
  desktopRouteFromSearch,
  installDesktopShellLinkNavigation,
  isAppInternalHref,
  navigateDesktopAppHref,
} from './routes/desktop-route.js';
export { workbenchSurfaceFromAppPath } from './routes/workbench-route.js';
export type { WorkbenchSurface } from './routes/workbench-route.js';
