import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsoleRoutePageModel, ConsolePageData } from '../routes/console-page-loading.js';
import type { ConsoleModeId } from '../routes/route.js';
import { ConsoleIntentOutcomePanel } from './console-intent-outcome-panel.js';
import { ConsoleViewModeContent } from './console-mode-views.js';

/**
 * The Agent Console workspace view (the CONSOLE wave, foundation skeleton):
 * the mission-first layout the FINAL TL HANDOFF §4 defines — left mission
 * rail, center mission banner + working modes, right contextual inspector
 * (Worker B deepens the per-mode renderers + the inspector + responsive
 * drawers; this skeleton wires the structure every mode shares).
 *
 * Presentation-only: every value renders from the page model; every write
 * is a DECLARED intent through the console-intents port; nothing executes
 * here, nothing is fabricated. The 5 working modes render honest states —
 * loading/empty/not-found/failure markers arrive through the page model.
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
        <a href="/missions" className="text-xs text-sky-400 underline-offset-2 hover:underline">
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
          className={`rounded-md px-2 py-1.5 text-xs ${
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
  if (page.mode === 'direct' && mission.missionId === '') {
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
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
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

/** The Agent Console workspace (foundation skeleton). */
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
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex flex-col gap-3 lg:w-56 lg:shrink-0" data-testid="console-left-region">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missions</p>
          <MissionRail data={data} selectedMissionId={data.selectedMissionId} mode={mode} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4" data-testid="console-center-region">
          <MissionBanner page={data.page} />
          <ModeRail missionId={data.selectedMissionId} mode={mode} />
          <ConsoleIntentOutcomePanel outcome={data.intentOutcome} outcomeError={data.intentOutcomeError} />
          <ConsoleViewModeContent
            page={data.page}
            onDeclareConsoleIntent={onDeclareConsoleIntent}
            missionId={data.selectedMissionId}
          />
        </div>
      </div>
    </div>
  );
}
