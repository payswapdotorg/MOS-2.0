import type { MosWebComposition } from '../ports/composition.js';
import type { AppShellView } from '../ports/app-shell.js';
import type { MissionSummaryView } from '../ports/mission-catalog.js';
import type {
  ConsoleAgentsData,
  ConsoleControlData,
  ConsoleDirectData,
  ConsolePlanData,
  ConsoleResearchData,
  ConsoleResultsData,
} from '../ports/agent-console.js';
import type { ConsoleIntentLedgerRecord } from '../ports/console-intents.js';
import type { MosRoute } from './route.js';
import { MissionScope } from './route-scope.js';
import type { TenantScope } from '@mos/contracts';

/**
 * The Agent Console page model + loader (the CONSOLE wave), split from
 * `route-loading.ts` to respect the 400-line managed-file budget.
 *
 * EVERY mode load starts with the mission rail (the tenant's mission
 * summaries — the left region's mission switching) — its failure is
 * SECONDARY: the rail degrades to a named marker and the mode still loads.
 * The selected mission's MODE read is PRIMARY: its failure is a route
 * error carrying the console port's own vocabulary. The write-intent
 * outcome (`?receipt=` marker) resolves through the console-intents ledger
 * and lands on the outcome panel with the same prominence discipline as
 * the Lab surface (wave-21).
 */

/** One console page model — the per-mode data union the view renders. */
export type ConsolePageData =
  | { readonly mode: 'direct'; readonly data: ConsoleDirectData }
  | { readonly mode: 'plan'; readonly data: ConsolePlanData; readonly agents: ConsoleAgentsData | null; readonly agentsError: 'load-failed' | null }
  | { readonly mode: 'research'; readonly data: ConsoleResearchData }
  | { readonly mode: 'results'; readonly data: ConsoleResultsData }
  | { readonly mode: 'control'; readonly data: ConsoleControlData };

/** The console route's resolved page model. */
export interface ConsoleRoutePageModel {
  /** The tenant scope every read went through (null = no tenant context). */
  readonly scope: TenantScope | null;
  /** The mission rail (left region): mission summaries, or the failure marker. */
  readonly missions: readonly MissionSummaryView[] | null;
  readonly missionsError: 'load-failed' | null;
  /** The selected mission id, when the route carried one. */
  readonly selectedMissionId: string | null;
  /** The write-intent outcome the receipt marker resolved (null = no marker). */
  readonly intentOutcome: ConsoleIntentLedgerRecord | null;
  readonly intentOutcomeError: 'console-intent-not-found' | 'load-failed' | null;
  /** The working mode's data. */
  readonly page: ConsolePageData;
}

/** The no-tenant-context console page (the honest empty workspace). */
export function emptyConsolePageData(): ConsoleRoutePageModel {
  return {
    scope: null,
    missions: null,
    missionsError: null,
    selectedMissionId: null,
    intentOutcome: null,
    intentOutcomeError: null,
    page: { mode: 'direct', data: emptyDirectData() },
  };
}

function emptyDirectData(): ConsoleDirectData {
  return {
    mission: {
      missionId: '',
      title: 'No mission selected',
      objective: '',
      status: 'draft',
      recordVersion: 0,
      successCriteria: [],
      constraints: [],
    },
    standings: {
      plansCount: 0,
      strategiesCount: 0,
      runsCount: 0,
      runsAwaitingAuthorization: 0,
      runsArmed: 0,
      runsOther: 0,
    },
    readiness: {
      intelligenceRecords: 0,
      rightsGrants: 0,
      experiments: 0,
      plans: 0,
    },
  };
}

/**
 * Load the Agent Console page model: mission rail + the mode's primary
 * read + the receipt-marker outcome. Never throws — failures degrade to
 * the typed route error or the named markers above.
 */
export async function loadConsolePage(
  composition: MosWebComposition,
  route: MosRoute & { readonly kind: 'console' },
  shellView: AppShellView,
  retryHref: string,
): Promise<
  | { readonly kind: 'console'; readonly data: ConsoleRoutePageModel }
  | { readonly kind: 'route-error'; readonly code: string; readonly message: string; readonly retryHref: string }
> {
  const scope = MissionScope.fromTenantContext(shellView.tenant);

  if (!scope) {
    return { kind: 'console', data: emptyConsolePageData() };
  }

  // ——— the mission rail (secondary on every mode) ———
  let missions: readonly MissionSummaryView[] | null = null;
  let missionsError: 'load-failed' | null = null;
  const missionsResult = await composition.missionCatalog.listMissionSummaries(scope);
  if ('error' in missionsResult) {
    missionsError = 'load-failed';
  } else {
    missions = missionsResult;
  }

  // ——— the receipt-marker outcome (secondary; verbatim verdict) ———
  let intentOutcome: ConsoleIntentLedgerRecord | null = null;
  let intentOutcomeError: ConsoleRoutePageModel['intentOutcomeError'] = null;
  if (route.intentReceiptId !== null) {
    const outcome = await composition.consoleIntents.loadConsoleIntentLedgerRecord(
      route.intentReceiptId,
      scope,
    );
    if (outcome === null) {
      intentOutcomeError = 'console-intent-not-found';
    } else {
      intentOutcome = outcome;
    }
  }

  const missionId = route.missionId;

  // ——— the mode's PRIMARY read ———
  const port = composition.agentConsole;
  let page: ConsolePageData;
  switch (route.mode) {
    case 'plan': {
      const result = await port.loadConsolePlan(missionId, scope);
      if ('error' in result) {
        return { kind: 'route-error', code: result.error, message: result.message, retryHref };
      }
      // The agents registry is the plan mode's SECONDARY read (the org
      // validation context the compiler gate rides) — degrade to a marker.
      let agents: ConsoleAgentsData | null = null;
      let agentsError: 'load-failed' | null = null;
      const agentsResult = await port.loadConsoleAgents(scope);
      if ('error' in agentsResult) {
        agentsError = 'load-failed';
      } else {
        agents = agentsResult;
      }
      page = { mode: 'plan', data: result, agents, agentsError };
      break;
    }
    case 'research': {
      const result = await port.loadConsoleResearch(missionId, scope);
      if ('error' in result) {
        return { kind: 'route-error', code: result.error, message: result.message, retryHref };
      }
      page = { mode: 'research', data: result };
      break;
    }
    case 'results': {
      const result = await port.loadConsoleResults(missionId, scope);
      if ('error' in result) {
        return { kind: 'route-error', code: result.error, message: result.message, retryHref };
      }
      page = { mode: 'results', data: result };
      break;
    }
    case 'control': {
      const result = await port.loadConsoleControl(missionId, scope);
      if ('error' in result) {
        return { kind: 'route-error', code: result.error, message: result.message, retryHref };
      }
      page = { mode: 'control', data: result };
      break;
    }
    default: {
      const result = await port.loadConsoleDirect(missionId, scope);
      if ('error' in result) {
        return { kind: 'route-error', code: result.error, message: result.message, retryHref };
      }
      page = { mode: 'direct', data: result };
      break;
    }
  }

  return {
    kind: 'console',
    data: {
      scope,
      missions,
      missionsError,
      selectedMissionId: missionId,
      intentOutcome,
      intentOutcomeError,
      page,
    },
  };
}
