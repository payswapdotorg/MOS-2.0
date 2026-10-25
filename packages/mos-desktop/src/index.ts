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

// ---- The MOS console (W32 — the payswap-pattern product surface) ----
export {
  MOS_ACTION_SET,
  MOS_CONSOLE_SECTIONS,
  MOS_WORKBENCH_NAV_ITEMS,
  mosAction,
  mosConsoleSection,
  mosConsoleSectionFromPath,
  mosConsoleSectionPath,
  mosConsoleSectionTitle,
} from './console/console-nav.js';
export type {
  MosActionDescriptor,
  MosActionId,
  MosConsoleSectionId,
  MosConsoleSectionRecord,
  MosWorkbenchNavDescriptor,
} from './console/console-nav.js';
export {
  MOS_PROVIDER_CATALOGUE,
  MOS_REWARD_METRIC_VOCABULARY,
  MOS_SOCIAL_CAPABILITY_MATRIX,
  MOS_SOCIAL_PLATFORMS,
  MOS_AD_PLATFORMS,
  MOS_MISSION_DIRECTIONS,
  MOS_WORKSPACE_DURABILITY_FACT,
  MOS_WORKSPACE_STORE_KEY,
  createMosWorkspaceStore,
  MosWorkspaceStoreError,
} from './console/workspace-store.js';
export type {
  MosCampaignIntakeInput,
  MosMissionDirection,
  MosMissionIntakeInput,
  MosPostComposerInput,
  MosWorkspaceAccount,
  MosWorkspaceApproval,
  MosWorkspaceCampaign,
  MosWorkspaceEvent,
  MosWorkspaceMission,
  MosWorkspacePost,
  MosWorkspaceSnapshot,
  MosWorkspaceStorage,
  MosWorkspaceStore,
  MosWorkspaceStoreHealth,
  MosWorkspaceStoreOptions,
} from './console/workspace-store.js';
export { MosConsoleApp } from './console/console-app.js';
export type {
  MosConsoleAppProps,
  MosConsoleController,
  MosConsoleReceipts,
} from './console/console-app.js';
export {
  MOS_AGENT_UNKNOWN_REPLY,
  routeMosAgentText,
} from './console/agent-routing.js';
export type { MosAgentReply } from './console/agent-routing.js';
export type { MosAgentTranscriptEntry } from './console/agent-rail.js';
export type { MosMissionPrefill } from './console/sections/missions-section.js';

