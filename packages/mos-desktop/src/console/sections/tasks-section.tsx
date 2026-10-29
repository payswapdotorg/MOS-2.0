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
import type { MosWorkspaceSnapshot } from '../workspace-store.js';
import {
  MOS_TASK_ARCHIVED_EMPTY,
  MOS_TASK_CONVERSATION_PLACEHOLDER,
  MOS_TASK_LIST_EMPTY,
  mosTaskConversation,
  mosTaskListSections,
  mosTaskRecordedMarkerLine,
  mosTaskTitle,
} from '../task-conversation.js';
import { MOS_NEW_TASK_MODES } from '../new-task-draft.js';
import { ReceiptLine } from './shared.js';
import { TaskRow, ARCHIVE_GLYPH } from './task-row.js';
import { TaskFrozenAttachmentRow } from './task-attachments.js';

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
const ARROW_UP_GLYPH = icon(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);
const MARKER_GLYPH = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v4.2l2.8 1.7" /></>);

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
                <TaskFrozenAttachmentRow attachments={selected.attachments} />
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
