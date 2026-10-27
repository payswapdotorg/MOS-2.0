/**
 * The MOS TASKS surface's pure presentation model (W36 — the
 * substrate's task list + conversation view, emerged as a native MOS
 * console surface, "exactly as is" per the owner's directive).
 *
 * WHAT THIS REPLICATES (the substrate's pure functions, verbatim law):
 * - `formatTaskRelativeTime` (packages/ui/src/lib/taskListItemPresentation.ts):
 *   "now" / "{minutes}m" / "{hours}h" / "{days}d" — the task-row time
 *   label vocabulary.
 * - The task-list ORDERING (taskListOrdering.ts): the running layer
 *   first (MOS tasks never run — the layer collapses honestly), then
 *   the Updated sort (updatedAt desc), and the PINNED section split
 *   (WorkspaceSidebar's Pinned header + the active list + the archived
 *   view).
 * - The CONVERSATION projection (the SessionPane timeline rows the MOS
 *   record can render honestly): the user-input bubbles (the recorded
 *   prompt + every follow-up turn) + the honest recorded-state marker
 *   row (the substrate's timelineMarker divider shape — a state marker,
 *   never a fabricated assistant response).
 * - The title fallback "New task" (taskList.untitled).
 *
 * Pure data + pure functions, no imports: directly consumable by the
 * node test runner through the package's built dist.
 */

import type { MosWorkspaceTask } from './workspace-records.js';

/** The conversation placeholder (the substrate's chatPlaceholder, verbatim for the follow-up case). */
export const MOS_TASK_CONVERSATION_PLACEHOLDER = 'Ask for follow-up changes';

/** The untitled-task fallback (the substrate's taskList.untitled, verbatim). */
export const MOS_TASK_UNTITLED_FALLBACK = 'New task';

/** The empty-list copy (the substrate's taskList.noTasks, verbatim). */
export const MOS_TASK_LIST_EMPTY = 'No tasks yet';

/** The archived-view copy (the substrate's taskList.noArchivedTasks, verbatim). */
export const MOS_TASK_ARCHIVED_EMPTY = 'No archived tasks';

/**
 * The task-row relative time label — the substrate's exact vocabulary:
 * "now" under a minute, "{minutes}m" under an hour, "{hours}h" under a
 * day, "{days}d" after that. Pure function of the timestamps.
 */
export function mosTaskRelativeTime(at: string, now: string): string {
  const then = Date.parse(at);
  const current = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(current)) {
    return ''; // honest: no fabricated label for an unparsable timestamp
  }
  const elapsedMs = Math.max(0, current - then);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/** The task title with the substrate's "New task" fallback for an empty title. */
export function mosTaskTitle(task: MosWorkspaceTask): string {
  return task.title.trim().length === 0 ? MOS_TASK_UNTITLED_FALLBACK : task.title;
}

/**
 * The task-list view model: the substrate's section split + ordering —
 * PINNED tasks (the always-on-top Pinned section), then the ACTIVE list
 * (unarchived, unpinned, Updated-sorted: updatedAt desc, seq desc as
 * the stable tie-break), then the ARCHIVED list (the archived view's
 * rows). The substrate's running-first layer collapses honestly: MOS
 * tasks are DRAFT records that never ran.
 */
export interface MosTaskListSections {
  readonly pinned: readonly MosWorkspaceTask[];
  readonly active: readonly MosWorkspaceTask[];
  readonly archived: readonly MosWorkspaceTask[];
}

/** Split + order the workspace tasks into the task list's sections. */
export function mosTaskListSections(tasks: readonly MosWorkspaceTask[]): MosTaskListSections {
  const byUpdated = (a: MosWorkspaceTask, b: MosWorkspaceTask): number => {
    const delta = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    return Number.isNaN(delta) || delta === 0 ? b.seq - a.seq : delta;
  };
  const unarchived = tasks.filter((task) => !task.archived);
  return {
    pinned: unarchived.filter((task) => task.pinned).sort(byUpdated),
    active: unarchived.filter((task) => !task.pinned).sort(byUpdated),
    archived: tasks.filter((task) => task.archived).sort(byUpdated),
  };
}

/**
 * One conversation row the MOS record renders honestly. `user-input` is
 * the substrate's userInput row shape (the recorded prompt / follow-up
 * turn); `recorded-marker` is the substrate's timelineMarker divider
 * shape carrying the honest state line (a workspace record awaiting the
 * substrate account — never a fabricated assistant response).
 */
export type MosTaskConversationRow =
  | { readonly kind: 'user-input'; readonly id: string; readonly prompt: string; readonly at: string }
  | { readonly kind: 'recorded-marker'; readonly id: string; readonly at: string };

/**
 * Project a workspace task's conversation: the recorded prompt, every
 * follow-up turn, and the honest recorded-state marker. Oldest-first
 * (the timeline reads forward), the marker last.
 */
export function mosTaskConversation(task: MosWorkspaceTask): readonly MosTaskConversationRow[] {
  const rows: MosTaskConversationRow[] = [
    { kind: 'user-input', id: `${task.id}-turn-1`, prompt: task.prompt, at: task.createdAt },
    ...task.followUps.map(
      (turn, index): MosTaskConversationRow => ({
        kind: 'user-input',
        id: turn.id.length > 0 ? turn.id : `${task.id}-turn-${index + 2}`,
        prompt: turn.prompt,
        at: turn.at,
      }),
    ),
  ];
  return [...rows, { kind: 'recorded-marker', id: `${task.id}-marker`, at: task.updatedAt }];
}

/**
 * The recorded-state marker's honest line (the substrate's marker-label
 * shape, MOS's own disclosure copy — the W35 receipt law).
 */
export function mosTaskRecordedMarkerLine(task: MosWorkspaceTask): string {
  return `Recorded ${task.status === 'DRAFT' ? 'as a workspace draft' : 'in this workspace'} — the substrate runs this task when an account is connected.`;
}

/**
 * The conversation's turn count (the composer receipts and the list
 * metadata render it): the recorded prompt + the follow-up turns.
 */
export function mosTaskTurnCount(task: MosWorkspaceTask): number {
  return 1 + task.followUps.length;
}
