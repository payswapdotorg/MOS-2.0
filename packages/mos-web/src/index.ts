/**
 * Public surface of `@mos/web` (MOS v2.0 WEB-001 + UX-001).
 *
 * Exports the presentation-only shell surface: the declared view ports
 * (`AppShellPort`, `MissionCatalogPort`), the composition interface, the
 * hand-rolled route model + page-model loader, the create-mission intent
 * declaration flow, the view-model form parser, the §2 Home narration data,
 * the ported platform patterns (theme seed, OAuth state codec, web platform
 * port) and the React view components (`mos-desktop` mounts the same route
 * component tree through the platform port pattern).
 *
 * The package imports ONLY `@mos/contracts` (the registry dependency list
 * for `web` is `[contracts]`) plus its own modules. Domain packages are
 * imported exclusively by the disclosed composition seam in `testing/`,
 * outside `src/`.
 *
 * Exported runtime surface: 36 exports (3 route parsing/loading + 3
 * route-scope helpers + 2 intent-declaration flow + 2 intent-form parsing +
 * 3 Home narration data + 6 theme seed + 3 OAuth state codec + 1 web
 * platform + 13 React view components [app shell + 3 status views + 4
 * fallback views + 5 route views]). All other exports are type-only. Port
 * method budgets: AppShellPort 1, MissionCatalogPort 5 (≤12 policy).
 */

// ---- View ports + view models ----
export type {
  AppShellLoadFailure,
  AppShellPort,
  AppShellView,
  ShellSectionId,
  ShellSectionView,
  SurfaceAvailabilityView,
  TenantContextView,
} from './ports/app-shell.js';
export type {
  CreateMissionIntentDeclaration,
  CreateMissionIntentReceipt,
  CreateMissionIntentTermDeclaration,
  MissionCatalogFailure,
  MissionCatalogPort,
  MissionConstraintView,
  MissionDetailView,
  MissionLifecycleStateView,
  MissionSummaryView,
  MissionTransitionView,
  ObjectiveMetricView,
  RewardDirectionView,
  RewardMetricOptionView,
  RewardSpecVersionView,
  RewardTermView,
} from './ports/mission-catalog.js';
export type { MosWebComposition } from './ports/composition.js';
export type { MosServiceConnection, MosServiceTransport } from './services/mos-services.js';

// ---- Route model + page-model loading ----
export type { MissionsPageData, MosRouteView } from './routes/route-loading.js';
export { loadMosRouteView } from './routes/route-loading.js';
export type { MissionsRoute, MosRoute } from './routes/route.js';
export { mosRouteTitle, parseMosRoute } from './routes/route.js';
export {
  MissionScope,
  missionRefFromQueryValue,
  missionScopeFromTenantContext,
} from './routes/route-scope.js';

// ---- Create-mission intent declaration (port-routed, no business logic) ----
export type { DeclareMissionIntentOutcome } from './routes/intent-declaration.js';
export {
  declareMissionIntentThroughPort,
  missionIntentOutcomeHref,
} from './routes/intent-declaration.js';
export {
  MISSION_INTENT_FORM_FIELDS,
  missionIntentDeclarationFromFormData,
} from './views/mission-intent-form-data.js';
export type { MissionIntentFormError } from './views/mission-intent-form-data.js';

// ---- Home narration (§2 complete loop, presentation data) ----
export {
  MOS_COOPERATING_LOOPS,
  MOS_COMPLETE_LOOP_STAGES,
  MOS_PRODUCT_THESIS,
} from './views/home-loop.js';
export type { CompleteLoopStageView, CooperatingLoopView } from './views/home-loop.js';

// ---- Platform patterns (ported from the audited shell, MOS-owned) ----
export {
  MOS_DEFAULT_THEME,
  MOS_THEME_STORAGE_KEY,
  applyMosThemeToDocument,
  probePrefersDark,
  readStoredMosTheme,
  resolveMosInitialTheme,
} from './platform/theme-seed.js';
export type {
  MosThemeSeed,
  ResolvedMosTheme,
  ResolveMosInitialThemeInput,
} from './platform/theme-seed.js';
export {
  encodeMosOAuthState,
  parseMosOAuthState,
  resolveSafeMosAppReturnTo,
} from './platform/oauth-state-codec.js';
export type { MosOAuthStatePayload } from './platform/oauth-state-codec.js';
export { createWebMosPlatform } from './platform/web-platform.js';
export type { MosWebPlatform } from './platform/web-platform.js';

// ---- React view components (mounted by the browser shell entry; the
//      future `@mos/desktop` shell mounts the same tree through the
//      platform port pattern) ----
export { MosAppShell } from './shell/mos-app-shell.js';
export type { MosAppShellProps } from './shell/mos-app-shell.js';
export {
  MosBootstrapErrorView,
  MosLoadingView,
  MosAppErrorView,
} from './shell/status-views.js';
export {
  MosNoTenantContextView,
  MosRouteErrorView,
  MosSectionNotAvailableView,
  MosUnknownRouteView,
} from './shell/route-fallbacks.js';
export { HomeView } from './routes/home-view.js';
export { MissionsView } from './routes/missions-view.js';
export { MissionsListView } from './routes/missions-list.js';
export { MissionDetailPanel } from './routes/mission-detail.js';
export { MissionIntentForm } from './routes/mission-intent-form.js';
export type { MissionIntentFormProps } from './routes/mission-intent-form.js';
