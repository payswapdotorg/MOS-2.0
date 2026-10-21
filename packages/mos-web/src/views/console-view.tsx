import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsoleRoutePageModel, ConsolePageData } from '../routes/console-page-loading.js';
import type { ConsoleModeId } from '../routes/route.js';
import { ConsoleIntentOutcomePanel } from './console-intent-outcome-panel.js';
import { ConsoleViewModeContent } from './console-mode-views.js';
import { ConsoleInspector } from './console-inspector.js';

/**
 * The Agent Console workspace view (the CONSOLE wave, Worker B deepening):
 * the mission-first layout the FINAL TL HANDOFF §4 defines — LEFT mission
 * rail (mission switching), CENTER mission banner + working modes + the
 * write-intent outcome, RIGHT contextual inspector (content follows the
 * active mode). At the lg: breakpoint the three regions sit side by side;
 * below it the rail and inspector stack around the preserved center (the
 * 375px smoke target keeps the mission banner, mode rail and primary
 * controls).
 *
 * Presentation-only: every value renders from the page model; every write
 * is a DECLARED intent through the console-intents port; nothing executes
 * here, nothing is fabricated. Honest states only — loading/empty/not-
 * found/failure markers arrive through the page model.
 */

const MODES: readonly { readonly id: ConsoleModeId; readonly label: string }[] = [
  { id: 'direct', label: 'Direct' },
  { id: 'plan', label: 'Plan' },
  { id: 'research', label: 'Research' },
  { id: 'results', label: 'Results' },
  { id: 'control', label: 'Control' },
];

function missionHref(missionId: string, mode: ConsoleModeId): string {
  return `/console?mission=${encodeURIComponent(missionId)}&mode=${mode}`;
}

function modeHref(missionId: string | null, mode: ConsoleModeId): string {
  const missionPart = missionId === null ? '' : `mission=${encodeURIComponent(missionId)}&`;
  return `/console?${missionPart}mode=${mode}`;
}

function MissionRail({
  data,
  selectedMissionId,
  mode,
}: {
  readonly data: ConsoleRoutePageModel;
  readonly selectedMissionId: string | null;
  readonly mode: ConsoleModeId;
}) {
  if (data.scope === null) {
    return (
      <aside aria-label="Mission rail" className="text-xs text-slate-400" data-testid="console-mission-rail-no-tenant">
        No tenant context resolved — the console cannot list missions.
      </aside>
    );
  }
  if (data.missionsError !== null) {
    return (
      <aside aria-label="Mission rail" className="text-xs text-amber-200/90" data-testid="console-mission-rail-error">
        The mission directory failed to load — the missions authority failed explicitly.
      </aside>
    );
  }
  const missions = data.missions ?? [];
  if (missions.length === 0) {
    return (
      <aside aria-label="Mission rail" className="flex flex-col gap-2" data-testid="console-mission-rail-empty">
        <p className="text-xs text-slate-400">
          No missions yet — create one from the Missions surface to start directing work.
        </p>
        <a href="/missions" className="text-xs text-sky-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
          Go to Missions
        </a>
      </aside>
    );
  }
  return (
    <nav aria-label="Mission rail" className="flex flex-col gap-1" data-testid="console-mission-rail">
      {missions.map((mission) => (
        <a
          key={mission.missionId}
          href={missionHref(mission.missionId, mode)}
          aria-current={mission.missionId === selectedMissionId ? 'page' : undefined}
          className={`rounded-md px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
            mission.missionId === selectedMissionId
              ? 'bg-sky-500/15 text-sky-200'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="block font-medium">{mission.title}</span>
          <span className="block text-[10px] text-slate-500">
            {mission.lifecycleState} · v{mission.recordVersion}
          </span>
        </a>
      ))}
    </nav>
  );
}

function MissionBanner({
  page,
}: {
  readonly page: ConsolePageData;
}) {
  const mission = page.data.mission;
  if (mission.missionId === '') {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4" data-testid="console-banner-none">
        <p className="text-sm font-semibold text-slate-200">No mission selected</p>
        <p className="text-xs text-slate-400">
          Select a mission from the rail, or create one from the Missions surface — the console
          directs work in a mission context.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4" data-testid="console-banner">
      <p className="text-sm font-semibold text-slate-100">{mission.title}</p>
      <p className="mt-1 text-xs text-slate-400">{mission.objective}</p>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
        {mission.status} · record v{mission.recordVersion}
        {mission.successCriteria.length > 0
          ? ` · ${mission.successCriteria.length} success criteria`
          : ''}
        {mission.constraints.length > 0 ? ` · ${mission.constraints.length} constraints` : ''}
      </p>
    </div>
  );
}

function ModeRail({
  missionId,
  mode,
}: {
  readonly missionId: string | null;
  readonly mode: ConsoleModeId;
}) {
  return (
    <nav aria-label="Console working modes" className="flex flex-wrap items-center gap-1" data-testid="console-mode-rail">
      {MODES.map((entry) => (
        <a
          key={entry.id}
          href={modeHref(missionId, entry.id)}
          aria-current={entry.id === mode ? 'page' : undefined}
          className={`rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
            entry.id === mode
              ? 'bg-sky-500/15 text-sky-200'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}

/** The Agent Console workspace (the FINAL TL HANDOFF §4 layout). */
export function ConsoleView({
  data,
  onDeclareConsoleIntent,
}: {
  readonly data: ConsoleRoutePageModel;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
}) {
  const mode = data.page.mode;
  return (
    <div className="flex flex-col gap-4" data-testid="console-workspace">
      <header>
        <h1 className="text-xl font-bold">Agent Console</h1>
        <p className="mt-1 text-sm text-slate-400">
          The mission-first orchestration workspace — select a mission, then work the authorized
          path: research the evidence, compose the plan, compile the strategy, create the run, and
          authorize it.
        </p>
        <p className="mt-1 text-xs text-slate-500" data-testid="console-workspace-note">
          The console declares intent and renders what the authorities hold — it never executes,
          never fabricates, and shows waiting states as waiting states.
        </p>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div
          className="flex flex-col gap-3 lg:w-56 lg:shrink-0"
          data-testid="console-left-region"
          aria-label="Mission rail region"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missions</p>
          <MissionRail data={data} selectedMissionId={data.selectedMissionId} mode={mode} />
        </div>
        <section
          className="flex min-w-0 flex-1 flex-col gap-4"
          data-testid="console-center-region"
          aria-label="Console working region"
        >
          <MissionBanner page={data.page} />
          <ModeRail missionId={data.selectedMissionId} mode={mode} />
          <ConsoleIntentOutcomePanel outcome={data.intentOutcome} outcomeError={data.intentOutcomeError} />
          <ConsoleViewModeContent
            page={data.page}
            onDeclareConsoleIntent={onDeclareConsoleIntent}
            missionId={data.selectedMissionId}
          />
        </section>
        <aside
          className="flex flex-col gap-2 lg:w-80 lg:shrink-0"
          data-testid="console-right-region"
          aria-label="Contextual inspector region"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inspector</p>
          <ConsoleInspector page={data.page} />
        </aside>
      </div>
    </div>
  );
}
