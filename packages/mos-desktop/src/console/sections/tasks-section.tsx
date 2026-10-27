/**
 * The MOS TASKS section (W36 — the substrate's task list + chat view,
 * EMERGED as a native MOS console surface, "exactly as is" per the
 * owner's directive).
 *
 * WHAT THIS REPLICATES (the substrate's workspace shell, verbatim
 * structure + copy): the two-pane surface — the task LIST (the
 * WorkspaceSidebar's rows: the leading pin slot, the mask-fade title,
 * the relative-time metadata, the hover archive action with the
 * two-click Confirm, the "Pinned" section header, the "New task"
 * button, the "No tasks yet" empty state, the Archived view) beside the
 * CONVERSATION (the SessionPane's timeline: the user-input bubbles
 * `rounded-xl rounded-tr-xs border bg-surface px-4 py-3` right-aligned,
 * the timelineMarker divider rows, the composer dock with the "Ask for
 * follow-up changes" placeholder). The Rename dialog is the
 * substrate's TaskRenameDialog copy (title / "Task name" placeholder /
 * Cancel / Confirm).
 *
 * HOOK-FREE like every console section: the workspace snapshot + the
 * selected task id + the archived-view toggle arrive as props, the
 * commands leave through the callbacks (the entry owns every piece of
 * state and re-mounts), the composer textarea is UNCONTROLLED (typing
 * never re-renders — the send button updates through the DOM), and the
 * rename dialog is a native <dialog> (its open state is DOM-local).
 *
 * THE HONEST WRITE: the follow-up composer appends a REAL workspace
 * turn (the store's appendTaskFollowUp); pin/archive/rename are REAL
 * workspace decisions (setTaskPinned / setTaskArchived / renameTask).
 * No assistant response is ever fabricated — the timeline ends with
 * the honest recorded-state marker.
 */

import type { MosConsoleSectionId, MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot, MosWorkspaceTask } from '../workspace-store.js';
import {
  MOS_TASK_ARCHIVED_EMPTY,
  MOS_TASK_CONVERSATION_PLACEHOLDER,
  MOS_TASK_LIST_EMPTY,
  mosTaskConversation,
  mosTaskListSections,
  mosTaskRecordedMarkerLine,
  mosTaskRelativeTime,
  mosTaskTitle,
} from '../task-conversation.js';
import { MOS_NEW_TASK_MODES } from '../new-task-draft.js';
import { ReceiptLine } from './shared.js';

type ViewNode = unknown;

/* --------------------------------------------------------------------
 * The DOM-local helpers (uncontrolled-input law: typing never re-renders)
 * -------------------------------------------------------------------- */

function updateSendState(textarea: HTMLTextAreaElement): void {
  const form = textarea.closest('form');
  const send = form?.querySelector('button[data-testid="mostk-send"]') ?? null;
  if (send !== null) {
    (send as HTMLButtonElement).disabled = textarea.value.trim().length === 0;
  }
}

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

const NEW_TASK_GLYPH = icon(<><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z" /><path d="M12 8.2v6.6M8.7 11.5h6.6" /></>);
const PIN_GLYPH = icon(<><path d="M12 17v5" /><path d="M9 10.8 5 12.5V9.6l4-3.1V3h6v3.5l4 3.1v2.9l-4-1.7" /></>);
const ARCHIVE_GLYPH = icon(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9M10 13h4" /></>);
const RENAME_GLYPH = icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);
const ARROW_UP_GLYPH = icon(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);
const MARKER_GLYPH = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v4.2l2.8 1.7" /></>);

/* --------------------------------------------------------------------
 * One task-list row (the substrate's TaskListItem replica)
 * -------------------------------------------------------------------- */

function TaskRow({
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

/* --------------------------------------------------------------------
 * The section
 * -------------------------------------------------------------------- */

export function TasksSection({
  section,
  workspace,
  selectedTaskId,
  showArchived,
  receipt,
  now,
  onSelectTask,
  onToggleArchived,
  onTaskPinned,
  onTaskArchived,
  onRenameTask,
  onAppendFollowUp,
  onNavigate,
}: {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The selected conversation's task id (null = the empty state). */
  readonly selectedTaskId: string | null;
  /** The archived-view toggle (the substrate's Archived toolbar toggle). */
  readonly showArchived: boolean;
  readonly receipt: string | null;
  /** The render-time ISO now (the relative labels are pure functions of it). */
  readonly now: string;
  readonly onSelectTask: (id: string | null) => void;
  readonly onToggleArchived: () => void;
  readonly onTaskPinned: (id: string, pinned: boolean) => void;
  readonly onTaskArchived: (id: string, archived: boolean) => void;
  readonly onRenameTask: (id: string, title: string) => void;
  readonly onAppendFollowUp: (id: string, prompt: string) => void;
  readonly onNavigate: (section: MosConsoleSectionId) => void;
}) {
  const sections = mosTaskListSections(workspace.tasks);
  const rows = showArchived ? sections.archived : sections.active;
  const pinnedRows = showArchived ? [] : sections.pinned;
  const selected =
    selectedTaskId === null
      ? undefined
      : workspace.tasks.find((task) => task.id === selectedTaskId);
  const modeDescriptor = selected === undefined ? undefined : MOS_NEW_TASK_MODES.find((candidate) => candidate.id === selected.mode);
  const mission =
    selected === undefined || selected.missionId === null
      ? undefined
      : workspace.missions.find((entry) => entry.id === selected.missionId);

  const rowProps = {
    now,
    archivedView: showArchived,
    onSelect: onSelectTask,
    onPin: onTaskPinned,
    onArchive: onTaskArchived,
    onRename: onRenameTask,
  };

  return (
    <section
      aria-labelledby="mosc-tasks-heading"
      className="mosc-section mosc-tk"
      data-testid="mosc-section-tasks"
    >
      <h1 id="mosc-tasks-heading" className="mosc-sr-only">
        {section.title}
      </h1>

      <div className="mosc-tk-shell">
        <aside className="mosc-tk-list" aria-label="Task list">
          <div className="mosc-tk-list-head">
            <button
              type="button"
              className="mosc-tk-newtask"
              data-testid="mostk-new-task"
              onClick={() => {
                onNavigate('new-task');
              }}
            >
              {NEW_TASK_GLYPH}
              <span>New task</span>
              <span className="mosc-tk-newtask-kbd">⌘N</span>
            </button>
            <button
              type="button"
              className={showArchived ? 'mosc-tk-archtoggle is-on' : 'mosc-tk-archtoggle'}
              data-testid="mostk-archived-toggle"
              aria-pressed={showArchived}
              onClick={() => {
                onToggleArchived();
              }}
            >
              {ARCHIVE_GLYPH}
              <span>Archived</span>
            </button>
          </div>

          <div className="mosc-tk-list-body">
            {pinnedRows.length > 0 ? (
              <h3 className="mosc-tk-list-heading">Pinned</h3>
            ) : null}
            <ul className="mosc-tk-list-ul">
              {pinnedRows.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  active={selectedTaskId === task.id}
                  {...rowProps}
                />
              ))}
            </ul>
            {pinnedRows.length > 0 && rows.length > 0 ? <h3 className="mosc-tk-list-heading">Tasks</h3> : null}
            <ul className="mosc-tk-list-ul">
              {rows.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  active={selectedTaskId === task.id}
                  {...rowProps}
                />
              ))}
            </ul>
            {rows.length === 0 && pinnedRows.length === 0 ? (
              <p className="mosc-tk-list-empty" role="status">
                {showArchived ? MOS_TASK_ARCHIVED_EMPTY : MOS_TASK_LIST_EMPTY}
              </p>
            ) : null}
          </div>
        </aside>

        <div className="mosc-tk-pane">
          {selected === undefined ? (
            <div className="mosc-tk-empty" role="status">
              <p className="mosc-tk-empty-title">Select a task to read its conversation</p>
              <p className="mosc-tk-empty-line">
                Every recorded task, its follow-ups, and its honest run state render here — or start a new one.
              </p>
              <button
                type="button"
                className="mosc-button mosc-button--primary"
                data-testid="mostk-empty-new"
                onClick={() => {
                  onNavigate('new-task');
                }}
              >
                New task
              </button>
            </div>
          ) : (
            <>
              <header className="mosc-tk-pane-head">
                <h2 className="mosc-tk-pane-title" data-testid="mostk-title">{mosTaskTitle(selected)}</h2>
                <p className="mosc-tk-pane-facts">
                  <span className="mosc-tk-chip">{selected.modelId}</span>
                  <span className="mosc-tk-chip">{modeDescriptor === undefined ? selected.mode : modeDescriptor.label}</span>
                  {selected.planEnabled ? <span className="mosc-tk-chip">Plan mode</span> : null}
                  {mission !== undefined ? <span className="mosc-tk-chip mosc-tk-chip--mission">{truncate(mission.statement, 36)}</span> : null}
                </p>
              </header>

              <div className="mosc-tk-timeline" data-testid="mostk-timeline">
                {mosTaskConversation(selected).map((row) =>
                  row.kind === 'user-input' ? (
                    <div key={row.id} className="mosc-tk-turn" data-v4-turn-unit="true">
                      <div className="mosc-tk-bubble" data-v4-user-input-bubble="true">
                        <p>{row.prompt}</p>
                      </div>
                    </div>
                  ) : (
                    <div key={row.id} className="mosc-tk-marker" role="separator" aria-orientation="horizontal">
                      <span className="mosc-tk-marker-line" aria-hidden="true" />
                      {MARKER_GLYPH}
                      <span className="mosc-tk-marker-label">{mosTaskRecordedMarkerLine(selected)}</span>
                      <span className="mosc-tk-marker-line" aria-hidden="true" />
                    </div>
                  ),
                )}
              </div>

              <form
                className="mosc-tk-composer"
                data-testid="mostk-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  const textarea = event.currentTarget.querySelector<HTMLTextAreaElement>('textarea');
                  if (textarea === null) {
                    return;
                  }
                  const prompt = textarea.value.trim();
                  if (prompt.length === 0) {
                    return;
                  }
                  onAppendFollowUp(selected.id, prompt);
                  event.currentTarget.reset();
                }}
              >
                <textarea
                  className="mosc-tk-input"
                  data-testid="mostk-input"
                  rows={2}
                  placeholder={MOS_TASK_CONVERSATION_PLACEHOLDER}
                  aria-label="Follow-up prompt"
                  onInput={(event) => {
                    updateSendState(event.currentTarget);
                  }}
                />
                <button
                  type="submit"
                  className="mosc-tk-send"
                  data-testid="mostk-send"
                  disabled
                  title="Send"
                  aria-label="Send"
                >
                  {ARROW_UP_GLYPH}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}

      <dialog className="mosc-tk-dialog" data-testid="mostk-rename-dialog">
        <form
          method="dialog"
          onSubmit={(event) => {
            const dialog = event.currentTarget.closest('dialog');
            if (dialog === null) {
              return;
            }
            const input = event.currentTarget.querySelector<HTMLInputElement>('input');
            const taskId = dialog.dataset.taskId;
            if (input !== null && taskId !== undefined && input.value.trim().length > 0) {
              onRenameTask(taskId, input.value);
            }
          }}
        >
          <h3 className="mosc-tk-dialog-title">Rename task</h3>
          <input
            className="mosc-tk-dialog-input"
            data-testid="mostk-rename-input"
            type="text"
            placeholder="Task name"
            maxLength={200}
            aria-label="Task name"
          />
          <div className="mosc-tk-dialog-actions">
            <button type="button" className="mosc-button" onClick={(event) => {
              const dialog = event.currentTarget.closest('dialog');
              if (dialog !== null) {
                dialog.close('cancel');
              }
            }}>
              Cancel
            </button>
            <button type="submit" className="mosc-button mosc-button--primary" data-testid="mostk-rename-confirm">
              Confirm
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}

function truncate(value: string, cap: number): string {
  return value.length <= cap ? value : `${value.slice(0, cap - 1).trimEnd()}…`;
}
