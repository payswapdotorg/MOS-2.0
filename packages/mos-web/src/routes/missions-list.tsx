import type { MissionSummaryView } from '../ports/mission-catalog.js';

/**
 * The Missions list (UX-001): one row per mission visible in the tenant
 * scope — id, title, lifecycle state, record version, versioned reward-spec
 * summary, tenant context, last mutation. Rows are real links to the detail
 * view (`?mission=<id>`); the lifecycle badge is presentation of the state
 * the Missions authority reports, never a mutation control.
 */

const LIFECYCLE_BADGE_CLASSES: Record<MissionSummaryView['lifecycleState'], string> = {
  draft: 'bg-slate-700/60 text-slate-200',
  active: 'bg-emerald-500/15 text-emerald-300',
  completed: 'bg-sky-500/15 text-sky-300',
  archived: 'bg-amber-500/15 text-amber-300',
};

function MissionRow({
  mission,
  selected,
}: {
  readonly mission: MissionSummaryView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/missions?mission=${encodeURIComponent(mission.missionId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`mission-row-${mission.missionId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">{mission.title}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                LIFECYCLE_BADGE_CLASSES[mission.lifecycleState]
              }`}
            >
              {mission.lifecycleState}
            </span>
          </span>
          <span className="font-mono text-xs text-slate-500">{mission.missionId}</span>
          <span className="text-xs text-slate-400">{mission.rewardSpecSummary}</span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>
            record v{mission.recordVersion} · reward spec v{mission.rewardSpecVersion}
          </span>
          <span className="font-mono" data-testid="mission-row-tenant">
            {mission.tenantId}
            {mission.workspaceId === null ? '' : ` / ${mission.workspaceId}`}
          </span>
          <span>updated {mission.updatedAt}</span>
        </span>
      </a>
    </li>
  );
}

/** The mission list. Empty state is explicit, never placeholder rows. */
export function MissionsListView({
  summaries,
  selectedMissionId,
}: {
  readonly summaries: readonly MissionSummaryView[];
  readonly selectedMissionId: string | null;
}) {
  if (summaries.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500"
        data-testid="missions-empty"
      >
        No missions are visible in this tenant scope. Either none exist yet, or the scope genuinely
        sees none — the shell does not fabricate examples.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="missions-list">
      {summaries.map((mission) => (
        <MissionRow
          key={mission.missionId}
          mission={mission}
          selected={mission.missionId === selectedMissionId}
        />
      ))}
    </ul>
  );
}
