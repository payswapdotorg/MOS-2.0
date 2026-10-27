/**
 * The MOS AUTOMATIONS surface's pure presentation model (W36 — the
 * substrate's Automations main view, emerged as a native MOS console
 * surface, "exactly as is" per the owner's directive).
 *
 * WHAT THIS REPLICATES (the substrate's pure functions, verbatim law):
 * - `resolveAutomationStatusKind` (settings/automationFormat.ts): the
 *   status kind ordering failed > completed > paused > active — MOS's
 *   honest workspace statuses are active/paused (completed/failed stay
 *   in the vocabulary for validation but no record reaches them without
 *   a dispatched run).
 * - The card badge line "{schedule} · Next run {when}" and the
 *   "Ran {count} times" run-count chip (automations.nextRun /
 *   automations.runCount, verbatim).
 * - The status-filter vocabulary "All / In progress / Completed /
 *   Failed" with the "No tasks match this filter" empty line
 *   (automationStatusFilter.ts + the i18n keys, verbatim).
 * - The page copy constants (AutomationsSection.tsx + en-US.ts,
 *   verbatim; the one disclosed noun-swap: ZCode → MOS in the
 *   keep-awake line).
 *
 * Pure data + pure functions, no imports: directly consumable by the
 * node test runner through the package's built dist.
 */

import type { MosWorkspaceAutomation } from './workspace-records.js';

/** The page title (the substrate's settings.automations.title, verbatim). */
export const MOS_AUTOMATIONS_TITLE = 'Automations';

/** The populated-state description (settings.automations.description.populated, verbatim). */
export const MOS_AUTOMATIONS_DESCRIPTION_POPULATED = 'Run tasks on a schedule or whenever you need them.';

/** The empty-state description (settings.automations.description.empty, verbatim). */
export const MOS_AUTOMATIONS_DESCRIPTION_EMPTY =
  'Schedule recurring tasks or queue background work that runs during idle time.';

/** The single visible tab (offPeak.tabs.scheduled, verbatim — the idle-time tab stays gray-off). */
export const MOS_AUTOMATIONS_TAB = 'Scheduled tasks';

/** The list section label (automations.createdLabel, verbatim). */
export const MOS_AUTOMATIONS_CREATED_LABEL = 'Task created';

/** The empty-state title (automations.empty.title, verbatim). */
export const MOS_AUTOMATIONS_EMPTY_TITLE = 'No scheduled tasks yet.';

/** The create affordance (automations.create.split, verbatim). */
export const MOS_AUTOMATIONS_CREATE_LABEL = 'Create scheduled task';

/** The create-in-chat dropdown item (automations.createViaChat.label, verbatim). */
export const MOS_AUTOMATIONS_CREATE_IN_CHAT = 'Create in chat';

/** The substrate's own create-in-chat prompt example (verbatim — the surface seeds and prefills it). */
export const MOS_AUTOMATIONS_CREATE_EXAMPLE_PROMPT =
  'Every weekday at 9 AM, summarize code changes and follow-ups for this project.';

/** The keep-awake line (automations.keepAwake, verbatim with the one disclosed ZCode → MOS noun-swap). */
export const MOS_AUTOMATIONS_KEEP_AWAKE_LINE = 'Keep your computer awake while MOS is running a chat.';

/** The filter-empty line (automations.filterEmpty, verbatim). */
export const MOS_AUTOMATIONS_FILTER_EMPTY = 'No tasks match this filter';

/** The status words (the lifecycle i18n keys, verbatim). */
export const MOS_AUTOMATION_STATUS_WORDS: Readonly<Record<MosWorkspaceAutomation['lifecycleStatus'], string>> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failure',
};

/** The run-count chip (automations.runCount, verbatim). */
export function mosAutomationRunCountLabel(automation: MosWorkspaceAutomation): string {
  return `Ran ${automation.runCount} times`;
}

/** The card's schedule badge: "{schedule} · Next run {when}" (verbatim shape; `now` optional for pure tests). */
export function mosAutomationScheduleBadge(
  automation: MosWorkspaceAutomation,
  now?: string,
): string {
  if (automation.lifecycleStatus !== 'active' || automation.nextRunAt === null) {
    return automation.schedule;
  }
  return `${automation.schedule} · Next run ${mosAutomationNextRunLabel(automation.nextRunAt, now)}`;
}

/**
 * The next-run label — the substrate's formatAutomationCardNextRun law:
 * relative under a day ("in 3h" / "in 45m"), an absolute local
 * datetime after that. Pure function of the timestamps.
 */
export function mosAutomationNextRunLabel(nextRunAt: string, now?: string): string {
  const target = Date.parse(nextRunAt);
  const current = now === undefined ? Date.now() : Date.parse(now);
  if (Number.isNaN(target) || Number.isNaN(current)) {
    return nextRunAt; // honest passthrough — never a fabricated "when"
  }
  const deltaMs = target - current;
  if (deltaMs > 0 && deltaMs < 86_400_000) {
    const minutes = Math.max(1, Math.round(deltaMs / 60_000));
    if (minutes < 60) {
      return `in ${minutes}m`;
    }
    return `in ${Math.round(minutes / 60)}h`;
  }
  const date = new Date(target);
  if (Number.isNaN(date.getTime())) {
    return nextRunAt;
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The status filter vocabulary (the substrate's pills, verbatim). */
export type MosAutomationStatusFilter = 'all' | 'in-progress' | 'completed' | 'failed';

/** The filter pills (order + labels, verbatim). */
export const MOS_AUTOMATION_FILTERS: readonly { readonly id: MosAutomationStatusFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

/**
 * The substrate's status-kind resolution (automationFormat.ts): a
 * failure surfaces by lifecycleStatus; the filter buckets are
 * failed > completed > paused > active with "in progress" = active. A
 * PAUSED task matches no bucket except "all" — the honest substrate
 * behavior (the widened return type carries it).
 */
export function mosAutomationFilterBucket(
  automation: MosWorkspaceAutomation,
): MosAutomationStatusFilter | 'paused' {
  if (automation.lifecycleStatus === 'failed') {
    return 'failed';
  }
  if (automation.lifecycleStatus === 'completed') {
    return 'completed';
  }
  return automation.lifecycleStatus === 'paused' ? 'paused' : 'in-progress';
}

/**
 * Filter the automations to a status filter (the substrate's
 * automationStatusFilter law: "all" passes everything; a paused task
 * matches no bucket except "all" — the honest substrate behavior).
 */
export function mosAutomationsForFilter(
  automations: readonly MosWorkspaceAutomation[],
  filter: MosAutomationStatusFilter,
): readonly MosWorkspaceAutomation[] {
  if (filter === 'all') {
    return automations;
  }
  return automations.filter((automation) => mosAutomationFilterBucket(automation) === filter);
}
