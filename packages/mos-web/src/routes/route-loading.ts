import { LabScope, MissionScope, StudioScope } from './route-scope.js';
import type { TenantScope } from '@mos/contracts';
import type { MosRoute } from './route.js';
import type { MosWebComposition } from '../ports/composition.js';
import type {
  CreateMissionIntentReceipt,
  MissionDetailView,
  MissionSummaryView,
  RewardMetricOptionView,
} from '../ports/mission-catalog.js';
import type {
  StudioSessionDetailView,
  StudioSessionSummaryView,
} from '../ports/studio-directory.js';
import type {
  StudioPackageSummaryView,
  StudioVersionChainView,
} from '../ports/studio-packages.js';
import type {
  LabBenchmarkDigestView,
  LabBenchmarkSummaryView,
} from '../ports/lab-benchmark.js';
import type {
  LabCalibrationChainView,
  LabCalibrationRecordView,
} from '../ports/lab-calibration.js';
import type { AppShellView, ShellSectionView } from '../ports/app-shell.js';

/**
 * Route view-model loading (UX-001). One server-style pass per load: the
 * controller asks this module for the fully resolved page model of the
 * current route, then renders it once. Loading is the pre-mount boot shell;
 * failures become explicit error views — never placeholders
 * (BROWSER-SHELL-REPLACEMENT-PLAN §4 risk 5).
 *
 * This is view orchestration only: it decides WHICH view ports to call for a
 * route and degrades honestly when one fails. No business rule lives here.
 */

/** Fully loaded Missions page model. */
export interface MissionsPageData {
  /** Tenant scope for catalog reads, or `null` when no tenant context resolved. */
  readonly scope: TenantScope | null;
  readonly summaries: readonly MissionSummaryView[];
  /** Reward metric vocabulary for the intent form (empty when unavailable). */
  readonly metricVocabulary: readonly RewardMetricOptionView[];
  /** Mission detail for `?mission=<id>`, when the id resolved. */
  readonly selected: MissionDetailView | null;
  /** Explicit failure marker for a mission selection that did not resolve. */
  readonly selectionError: 'mission-not-found' | 'load-failed' | null;
  /** Receipt for `?intent=<id>`, when found. */
  readonly intentReceipt: CreateMissionIntentReceipt | null;
  /**
   * Declaration-failure marker for `?intent-error=<code>` (the authority
   * refused the declaration), or the literal `intent-receipt-not-found` when
   * `?intent=<id>` did not resolve — a REFUSED declaration and an unresolvable
   * receipt are different states and render as different panels.
   */
  readonly intentError: string | null;
}

/** Fully loaded Studio page model (UX-002). */
export interface StudioPageData {
  /** Tenant scope for studio reads, or `null` when no tenant context resolved. */
  readonly scope: TenantScope | null;
  /** Session directory listing (every lifecycle state the authority reports). */
  readonly sessions: readonly StudioSessionSummaryView[];
  /** Session detail for `?session=<id>`, when the id resolved. */
  readonly selected: StudioSessionDetailView | null;
  /** Explicit failure marker for a session selection that did not resolve. */
  readonly selectionError: 'studio-session-not-found' | 'load-failed' | null;
  /** Package library listing (immutable version chains). */
  readonly packages: readonly StudioPackageSummaryView[];
  /** Version chain for `?package=<id>`, when the id resolved. */
  readonly selectedChain: StudioVersionChainView | null;
  /** Explicit failure marker for a package selection that did not resolve. */
  readonly chainError: 'studio-package-not-found' | 'load-failed' | null;
  /**
   * Honest-unavailable marker for the package library read: the session
   * directory loaded, the library did not — the page renders with an explicit
   * library-unavailable panel instead of pretending an empty library.
   */
  readonly libraryError: 'load-failed' | null;
}

/** Fully loaded Lab page model (UX-003). */
export interface LabPageData {
  /** Tenant scope for lab reads, or `null` when no tenant context resolved. */
  readonly scope: TenantScope | null;
  /** Benchmark record-chain listing (the primary read of the surface). */
  readonly benchmarks: readonly LabBenchmarkSummaryView[];
  /** Benchmark digest for `?benchmark=<id>` (exact `?version=` or latest), when it resolved. */
  readonly selectedDigest: LabBenchmarkDigestView | null;
  /** Explicit failure marker for a benchmark selection that did not resolve. */
  readonly benchmarkSelectionError: 'lab-benchmark-not-found' | 'load-failed' | null;
  /** Online-calibration chain listing (the co-presented calibration surface). */
  readonly calibrationChains: readonly LabCalibrationChainView[];
  /**
   * Honest-unavailable marker for the calibration listing: the benchmark
   * surface loaded, the calibration service did not — the page renders with an
   * explicit calibration-unavailable panel instead of a fabricated empty list.
   */
  readonly calibrationError: 'load-failed' | null;
  /** Calibration records for `?calibration=<id>`, when the id resolved. */
  readonly selectedCalibrationRecords: readonly LabCalibrationRecordView[] | null;
  /** Explicit failure marker for a calibration selection that did not resolve. */
  readonly calibrationSelectionError: 'lab-calibration-not-found' | 'load-failed' | null;
}

/** The resolved page model for the current route. */
export type MosRouteView =
  /** Pre-load surface while the page model resolves (mounted by the boot). */
  | { readonly kind: 'loading'; readonly label: string }
  | { readonly kind: 'home' }
  | { readonly kind: 'missions'; readonly data: MissionsPageData }
  | { readonly kind: 'studio'; readonly data: StudioPageData }
  | { readonly kind: 'lab'; readonly data: LabPageData }
  | {
      readonly kind: 'route-error';
      readonly code: string;
      readonly message: string;
      /** App-internal link that re-attempts the load (full reload). */
      readonly retryHref: string;
    }
  | { readonly kind: 'section'; readonly section: ShellSectionView }
  | { readonly kind: 'unknown-route'; readonly path: string };

function retryHrefFor(route: MosRoute): string {
  if (route.kind === 'missions') {
    return '/missions';
  }
  return route.kind === 'home'
    ? '/'
    : route.kind === 'studio'
      ? '/studio'
      : route.kind === 'lab'
        ? '/lab'
        : `/${route.kind === 'section' ? route.sectionId : ''}`;
}

/**
 * Load the page model for a route. Never throws: failures of required data
 * degrade to the explicit `route-error` view; secondary data degrades inside
 * the page model with named markers.
 */
export async function loadMosRouteView(
  composition: MosWebComposition,
  route: MosRoute,
  shellView: AppShellView,
): Promise<MosRouteView> {
  if (route.kind === 'home') {
    return { kind: 'home' };
  }

  if (route.kind === 'studio') {
    return loadStudioPage(composition, route, shellView, retryHrefFor(route));
  }

  if (route.kind === 'lab') {
    return loadLabPage(composition, route, shellView, retryHrefFor(route));
  }

  if (route.kind === 'section') {
    const section = shellView.sections.find((candidate) => candidate.id === route.sectionId);
    return section ? { kind: 'section', section } : { kind: 'unknown-route', path: `/${route.sectionId}` };
  }

  if (route.kind === 'unknown') {
    return { kind: 'unknown-route', path: route.path };
  }

  return loadMissionsPage(composition, route, shellView, retryHrefFor(route));
}

async function loadStudioPage(
  composition: MosWebComposition,
  route: MosRoute & { readonly kind: 'studio' },
  shellView: AppShellView,
  retryHref: string,
): Promise<MosRouteView> {
  const scope = StudioScope.fromTenantContext(shellView.tenant);

  if (!scope) {
    return {
      kind: 'studio',
      data: {
        scope: null,
        sessions: [],
        selected: null,
        selectionError: null,
        packages: [],
        selectedChain: null,
        chainError: null,
        libraryError: null,
      },
    };
  }

  const sessionsResult = await composition.studioDirectory.listStudioSessions(scope);
  if ('error' in sessionsResult) {
    return {
      kind: 'route-error',
      code: sessionsResult.error,
      message: sessionsResult.message,
      retryHref,
    };
  }

  const packagesResult = await composition.studioPackages.listStudioPackages(scope);
  let packages: readonly StudioPackageSummaryView[] = [];
  let libraryError: StudioPageData['libraryError'] = null;
  if ('error' in packagesResult) {
    // The library is a co-presented section: its failure degrades to the
    // explicit library-unavailable marker — the directory still renders.
    libraryError = 'load-failed';
  } else {
    packages = packagesResult;
  }

  let selected: StudioSessionDetailView | null = null;
  let selectionError: StudioPageData['selectionError'] = null;
  if (route.sessionId) {
    const detailResult = await composition.studioDirectory.loadStudioSessionDetail(
      StudioScope.sessionRef(route.sessionId),
      scope,
    );
    if ('error' in detailResult) {
      selectionError =
        detailResult.error === 'studio-session-not-found' ? 'studio-session-not-found' : 'load-failed';
    } else {
      selected = detailResult;
    }
  }

  let selectedChain: StudioVersionChainView | null = null;
  let chainError: StudioPageData['chainError'] = null;
  if (route.packageId) {
    const chainResult = await composition.studioPackages.loadStudioPackageChain(
      StudioScope.packageRef(route.packageId),
      scope,
    );
    if ('error' in chainResult) {
      chainError =
        chainResult.error === 'studio-package-not-found' ? 'studio-package-not-found' : 'load-failed';
    } else {
      selectedChain = chainResult;
    }
  }

  return {
    kind: 'studio',
    data: {
      scope,
      sessions: sessionsResult,
      selected,
      selectionError,
      packages,
      selectedChain,
      chainError,
      libraryError,
    },
  };
}

/**
 * Load the Lab page model (UX-003): the benchmark listing is the primary
 * read (its failure is a route error); the calibration listing is the
 * co-presented section (its failure degrades to the explicit
 * calibration-unavailable marker — the benchmark surface still renders);
 * selections degrade to named markers, never placeholders.
 */
async function loadLabPage(
  composition: MosWebComposition,
  route: MosRoute & { readonly kind: 'lab' },
  shellView: AppShellView,
  retryHref: string,
): Promise<MosRouteView> {
  const scope = LabScope.fromTenantContext(shellView.tenant);

  if (!scope) {
    return {
      kind: 'lab',
      data: {
        scope: null,
        benchmarks: [],
        selectedDigest: null,
        benchmarkSelectionError: null,
        calibrationChains: [],
        calibrationError: null,
        selectedCalibrationRecords: null,
        calibrationSelectionError: null,
      },
    };
  }

  const benchmarksResult = await composition.labBenchmark.listBenchmarkSummaries(scope);
  if ('error' in benchmarksResult) {
    return {
      kind: 'route-error',
      code: benchmarksResult.error,
      message: benchmarksResult.message,
      retryHref,
    };
  }

  const calibrationResult = await composition.labCalibration.listCalibrationChains(scope);
  let calibrationChains: readonly LabCalibrationChainView[] = [];
  let calibrationError: LabPageData['calibrationError'] = null;
  if ('error' in calibrationResult) {
    // The calibration surface is co-presented: its failure degrades to the
    // explicit calibration-unavailable marker — the benchmarks still render.
    calibrationError = 'load-failed';
  } else {
    calibrationChains = calibrationResult;
  }

  let selectedDigest: LabBenchmarkDigestView | null = null;
  let benchmarkSelectionError: LabPageData['benchmarkSelectionError'] = null;
  if (route.benchmarkId !== null) {
    const digestResult = await composition.labBenchmark.loadBenchmarkDigest(
      LabScope.benchmarkRef(route.benchmarkId),
      route.benchmarkVersion,
      scope,
    );
    if ('error' in digestResult) {
      benchmarkSelectionError =
        digestResult.error === 'lab-benchmark-not-found' ? 'lab-benchmark-not-found' : 'load-failed';
    } else {
      selectedDigest = digestResult;
    }
  }

  let selectedCalibrationRecords: readonly LabCalibrationRecordView[] | null = null;
  let calibrationSelectionError: LabPageData['calibrationSelectionError'] = null;
  if (route.calibrationId !== null) {
    const recordsResult = await composition.labCalibration.loadCalibrationRecords(
      LabScope.calibrationRef(route.calibrationId),
      scope,
    );
    if ('error' in recordsResult) {
      calibrationSelectionError =
        recordsResult.error === 'lab-calibration-not-found'
          ? 'lab-calibration-not-found'
          : 'load-failed';
    } else {
      selectedCalibrationRecords = recordsResult;
    }
  }

  return {
    kind: 'lab',
    data: {
      scope,
      benchmarks: benchmarksResult,
      selectedDigest,
      benchmarkSelectionError,
      calibrationChains,
      calibrationError,
      selectedCalibrationRecords,
      calibrationSelectionError,
    },
  };
}

async function loadMissionsPage(
  composition: MosWebComposition,
  route: MosRoute & { readonly kind: 'missions' },
  shellView: AppShellView,
  retryHref: string,
): Promise<MosRouteView> {
  const catalog = composition.missionCatalog;
  const scope = MissionScope.fromTenantContext(shellView.tenant);

  if (!scope) {
    return {
      kind: 'missions',
      data: {
        scope: null,
        summaries: [],
        metricVocabulary: [],
        selected: null,
        selectionError: null,
        intentReceipt: null,
        intentError: route.intentError,
      },
    };
  }

  const summariesResult = await catalog.listMissionSummaries(scope);
  if ('error' in summariesResult) {
    return {
      kind: 'route-error',
      code: summariesResult.error,
      message: summariesResult.message,
      retryHref,
    };
  }

  const vocabulary: RewardMetricOptionView[] = [];
  const vocabularyResult = await catalog.loadRewardMetricVocabulary();
  if (!('error' in vocabularyResult)) {
    vocabulary.push(...vocabularyResult);
  }

  let selected: MissionDetailView | null = null;
  let selectionError: MissionsPageData['selectionError'] = null;
  if (route.missionId) {
    const detailResult = await catalog.loadMissionDetail(MissionScope.missionRef(route.missionId), scope);
    if ('error' in detailResult) {
      selectionError =
        detailResult.error === 'mission-not-found' ? 'mission-not-found' : 'load-failed';
    } else {
      selected = detailResult;
    }
  }

  let intentReceipt: CreateMissionIntentReceipt | null = null;
  let intentError: string | null = route.intentError;
  if (route.intentId) {
    const receiptResult = await catalog.loadCreateMissionIntentReceipt(route.intentId, scope);
    if (receiptResult === null || 'error' in receiptResult) {
      intentError = 'intent-receipt-not-found';
    } else {
      intentReceipt = receiptResult;
    }
  }

  return {
    kind: 'missions',
    data: {
      scope,
      summaries: summariesResult,
      metricVocabulary: vocabulary,
      selected,
      selectionError,
      intentReceipt,
      intentError,
    },
  };
}
