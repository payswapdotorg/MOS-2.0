import { MissionScope } from './route-scope.js';
import type { TenantScope } from '@mos/contracts';
import type { MosRoute } from './route.js';
import type { MosWebComposition } from '../ports/composition.js';
import type {
  CreateMissionIntentReceipt,
  MissionDetailView,
  MissionSummaryView,
  RewardMetricOptionView,
} from '../ports/mission-catalog.js';
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

/** The resolved page model for the current route. */
export type MosRouteView =
  /** Pre-load surface while the page model resolves (mounted by the boot). */
  | { readonly kind: 'loading'; readonly label: string }
  | { readonly kind: 'home' }
  | { readonly kind: 'missions'; readonly data: MissionsPageData }
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
  return route.kind === 'home' ? '/' : `/${route.kind === 'section' ? route.sectionId : ''}`;
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

  if (route.kind === 'section') {
    const section = shellView.sections.find((candidate) => candidate.id === route.sectionId);
    return section ? { kind: 'section', section } : { kind: 'unknown-route', path: `/${route.sectionId}` };
  }

  if (route.kind === 'unknown') {
    return { kind: 'unknown-route', path: route.path };
  }

  return loadMissionsPage(composition, route, shellView, retryHrefFor(route));
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
