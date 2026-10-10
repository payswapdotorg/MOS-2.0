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
export type {
  LabBaselineComparisonView,
  LabBenchmarkCandidateOriginView,
  LabBenchmarkCandidateView,
  LabBenchmarkDigestFailure,
  LabBenchmarkDigestPort,
  LabBenchmarkDigestView,
  LabBenchmarkSummaryView,
  LabBenchmarkProvenanceView,
  LabCalibrationPendingView,
  LabIntervalView,
  LabOodSignalView,
  LabRecordIntegrityView,
  LabRobustnessPolicyView,
  LabWorldDisagreementView,
  LabWorldRobustnessView,
} from './ports/lab-benchmark.js';
export { LAB_NOOP_BASELINE_ORIGIN } from './ports/lab-benchmark.js';
export type {
  LabCalibrationChainView,
  LabCalibrationContextSummaryView,
  LabCalibrationContextView,
  LabCalibrationFunctionalView,
  LabCalibrationObservationView,
  LabCalibrationPredictionView,
  LabCalibrationRecordView,
  LabCalibrationStatusFailure,
  LabCalibrationStatusPort,
} from './ports/lab-calibration.js';
export type {
  StudioConsentRequirementView,
  StudioConsentStateView,
  StudioDecisionActorView,
  StudioDirectoryFailure,
  StudioDirectoryPort,
  StudioParticipantView,
  StudioReviewRecordView,
  StudioSessionDetailView,
  StudioSessionLifecycleStateView,
  StudioSessionSummaryView,
  StudioSessionTransitionView,
} from './ports/studio-directory.js';
export type {
  StudioArtifactLabelView,
  StudioArtifactStageView,
  StudioPackageConsentView,
  StudioPackageEvaluationView,
  StudioPackageLibraryFailure,
  StudioPackageLibraryPort,
  StudioPackageProvenanceView,
  StudioPackageSummaryView,
  StudioPackageVersionView,
  StudioVersionChainView,
} from './ports/studio-packages.js';

// ---- Route model + page-model loading ----
export type {
  LabPageData,
  MissionsPageData,
  MosRouteView,
  StudioPageData,
} from './routes/route-loading.js';
export { loadMosRouteView } from './routes/route-loading.js';
export type { LabRoute, MissionsRoute, MosRoute, StudioRoute } from './routes/route.js';
export { mosRouteTitle, parseMosRoute } from './routes/route.js';
export {
  LabScope,
  MissionScope,
  StudioScope,
  labBenchmarkRefFromQueryValue,
  labCalibrationRefFromQueryValue,
  missionRefFromQueryValue,
  missionScopeFromTenantContext,
  studioPackageRefFromQueryValue,
  studioSessionRefFromQueryValue,
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

// ---- Studio presentation data (UX-002 — §14 labels, lifecycle badges, hand-off) ----
export {
  STUDIO_CONSENT_STATE_PRESENTATION,
  STUDIO_FORMAT_LABELS,
  STUDIO_HANDOFF_NOTE,
  STUDIO_LIFECYCLE_BADGE_CLASSES,
  STUDIO_LIFECYCLE_DESCRIPTIONS,
  STUDIO_LOOP_NARRATION,
  STUDIO_SESSION_LIFECYCLE_STATES,
  isSyntheticCreationMethod,
  studioCreationMethodLabel,
  studioDecisionActorLabel,
  studioEvaluationOutcomeLabel,
  studioFormatLabel,
} from './views/studio-presentation.js';

// ---- Lab presentation data (UX-003 — §20/§24 counterfactual labels, §22 badges) ----
export {
  LAB_BOUNDARY_NOTE,
  LAB_CALIBRATION_PENDING_LABEL,
  LAB_COUNTERFACTUAL_LABEL,
  LAB_CANDIDATE_ORIGIN_DESCRIPTIONS,
  LAB_CANDIDATE_ORIGIN_LABELS,
  LAB_LOOP_NARRATION,
  LAB_MEASURED_LABEL,
  LAB_OOD_PRESENTATION,
  formatLabDigestShort,
  formatLabExpectedWithInterval,
  formatLabNumber,
  labAggregationLabel,
  labIntegrityLabel,
  labSweepDimensionLabel,
} from './views/lab-presentation.js';

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
export { StudioView } from './routes/studio-view.js';
export { StudioSessionDirectoryView } from './views/studio-session-directory.js';
export { StudioSessionDetailPanel } from './views/studio-session-detail.js';
export {
  StudioPackageChainPanel,
  StudioPackageLibraryView,
} from './views/studio-packages.js';
export { LabView } from './routes/lab-view.js';
export { LabBenchmarkDirectoryView } from './views/lab-benchmark-directory.js';
export { LabBenchmarkDigestPanel } from './views/lab-benchmark-digest.js';
export { LabCalibrationStatusView } from './views/lab-calibration-status.js';
export { LabCalibrationDetailPanel } from './views/lab-calibration-detail.js';
