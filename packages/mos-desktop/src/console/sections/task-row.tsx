/**
 * The MOS TASKS surface's LIST ROW (W36 — the substrate's TaskListItem
 * replica, split from the section per the W38 file-size discipline).
 *
 * WHAT THIS HOLDS: one task-list row (the leading pin slot with the
 * always-rendered pin button, the row-main button with the mask-fade
 * title + the W40 frozen-attachment count badge + the relative-time
 * metadata, the hover actions with the Rename button and the archive
 * button's two-click Confirm), plus the row's own DOM-local helpers
 * (the rename dialog opener + the archive arming law — the substrate's
 * TaskListItem law: the first click arms, the second commits, the armed
 * state resets after 2.5s).
 *
 * HOOK-FREE: the task + the flags arrive as props, the commands leave
 * through the callbacks (the entry owns every piece of state).
 */

import type { MosWorkspaceTask } from '../workspace-store.js';
import { mosTaskRelativeTime, mosTaskTitle } from '../task-conversation.js';
import { TaskAttachmentCountBadge } from './task-attachments.js';

type ViewNode = unknown;

/* --------------------------------------------------------------------
 * The DOM-local helpers (the row's own dialog + arming laws)
 * -------------------------------------------------------------------- */

function openRenameDialog(sectionRoot: HTMLElement, task: MosWorkspaceTask): void {
  const dialog = sectionRoot.querySelector<HTMLDialogElement>('dialog[data-testid="mostk-rename-dialog"]');
  if (dialog === null) {
    return;
  }
  dialog.dataset.taskId = task.id;
  const input = dialog.querySelector<HTMLInputElement>('input[data-testid="mostk-rename-input"]');
  if (input !== null) {
    input.value = task.title;
  }
  dialog.showModal();
}

/**
 * The archive button's two-click Confirm (the substrate's TaskListItem
 * law: the first click arms, the second click commits; the armed state
 * resets after 2.5s).
 */
function armArchiveButton(button: HTMLButtonElement, commit: () => void): void {
  if (button.dataset.armed === 'true') {
    delete button.dataset.armed;
    commit();
    return;
  }
  button.dataset.armed = 'true';
  button.setAttribute('aria-label', 'Confirm');
  const reset = (): void => {
    delete button.dataset.armed;
    button.removeAttribute('aria-label');
  };
  window.setTimeout(reset, 2500);
}

/* --------------------------------------------------------------------
 * The inline glyph kit (presentation-only, stroke = currentColor)
 * -------------------------------------------------------------------- */

function icon(children: ViewNode): never {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children as never}
    </svg>
  ) as never;
}

const PIN_GLYPH = icon(<><path d="M12 17v5" /><path d="M9 10.8 5 12.5V9.6l4-3.1V3h6v3.5l4 3.1v2.9l-4-1.7" /></>);
export const ARCHIVE_GLYPH = icon(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9M10 13h4" /></>);
const RENAME_GLYPH = icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);

/* --------------------------------------------------------------------
 * One task-list row (the substrate's TaskListItem replica)
 * -------------------------------------------------------------------- */

export function TaskRow({
  task,
  active,
  now,
  archivedView,
  onSelect,
  onPin,
  onArchive,
  onRename,
}: {
  readonly task: MosWorkspaceTask;
  readonly active: boolean;
  readonly now: string;
  readonly archivedView: boolean;
  readonly onSelect: (id: string) => void;
  readonly onPin: (id: string, pinned: boolean) => void;
  readonly onArchive: (id: string, archived: boolean) => void;
  readonly onRename: (id: string, title: string) => void;
}) {
  const sectionRoot = (node: Element): HTMLElement | null =>
    node.closest('[data-testid="mosc-section-tasks"]');
  return (
    <li className={active ? 'mosc-tk-row is-active' : 'mosc-tk-row'} data-testid="mostk-item" data-task-id={task.id}>
      <div className="mosc-tk-row-lead">
        <button
          type="button"
          className="mosc-tk-pinbtn"
          data-testid="mostk-pin"
          aria-label={task.pinned ? 'Unpin task' : 'Pin task'}
          title={task.pinned ? 'Unpin task' : 'Pin task'}
          onClick={() => {
            onPin(task.id, !task.pinned);
          }}
        >
          <span className={task.pinned ? 'mosc-tk-pindot is-pinned' : 'mosc-tk-pindot'} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="mosc-tk-row-main"
        data-testid="mostk-row-main"
        aria-current={active ? 'true' : undefined}
        onClick={() => {
          onSelect(task.id);
        }}
      >
        <span className="mosc-tk-row-title">{mosTaskTitle(task)}</span>
        <TaskAttachmentCountBadge count={task.attachments.length} />
        <span className="mosc-tk-row-meta" data-task-row-metadata="true">
          {mosTaskRelativeTime(task.updatedAt, now)}
        </span>
      </button>
      <span className="mosc-tk-row-actions" data-task-row-actions="true">
        <button
          type="button"
          className="mosc-tk-iconbtn"
          data-testid="mostk-rename"
          aria-label="Rename task"
          title="Rename task"
          onClick={(event) => {
            const root = sectionRoot(event.currentTarget);
            if (root !== null) {
              openRenameDialog(root, task);
            }
          }}
        >
          {RENAME_GLYPH}
        </button>
        <button
          type="button"
          className="mosc-tk-iconbtn"
          data-testid="mostk-archive"
          aria-label={archivedView ? 'Unarchive task' : 'Archive task'}
          title={archivedView ? 'Unarchive task' : 'Archive task'}
          onClick={(event) => {
            const button = event.currentTarget;
            armArchiveButton(button, () => {
              onArchive(task.id, !archivedView);
            });
          }}
        >
          {ARCHIVE_GLYPH}
        </button>
      </span>
    </li>
  );
}
