/**
 * The MOS TASKS surface's FROZEN ATTACHMENT kit (W40 — the composer's
 * queue at submit, rendered as the task surface's own presentation).
 *
 * WHAT THIS HOLDS: the paperclip glyph, the task-row's attachment count
 * badge (the substrate's TaskListItem badge shape), and the conversation
 * head's frozen chip row (the substrate's attachment chip anatomy: the
 * glyph + the truncated filename + the facts line + the size pill — the
 * seed record renders the name alone). Pure presentational components,
 * null-on-empty; the facts/size laws live in new-task-draft.ts (the
 * substrate's own functions, verbatim).
 *
 * HOOK-FREE like every console section file: the attachments arrive as
 * a prop, nothing here owns state.
 */

import type { MosWorkspaceTaskAttachment } from '../workspace-store.js';
import { mosNewTaskAttachmentFacts, mosNewTaskFormatAttachmentSize } from '../new-task-draft.js';

type ViewNode = unknown;

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

const PAPERCLIP_GLYPH = icon(
  <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></>,
);

/* --------------------------------------------------------------------
 * The task-row's attachment count badge (null when the task carries none)
 * -------------------------------------------------------------------- */

export function TaskAttachmentCountBadge({ count }: { readonly count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      className="mosc-tk-row-badge"
      data-testid="mostk-attachment-badge"
      title={`${count} attachment${count === 1 ? '' : 's'} frozen on this task`}
    >
      {PAPERCLIP_GLYPH}
      <span className="mosc-tk-row-badge-count">{count}</span>
    </span>
  );
}

/* --------------------------------------------------------------------
 * The conversation head's frozen chip row (null when the record carries none)
 * -------------------------------------------------------------------- */

export function TaskFrozenAttachmentRow({
  attachments,
}: {
  readonly attachments: readonly MosWorkspaceTaskAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="mosc-tk-attachments" data-testid="mostk-attachments">
      {attachments.map((attachment, index) => (
        <span
          key={`att-${index}`}
          className="mosc-tk-attachment"
          data-testid="mostk-attachment"
          title={attachment.localPath ?? undefined}
        >
          {PAPERCLIP_GLYPH}
          <span className="mosc-tk-attachment-name">{attachment.filename}</span>
          {attachment.charCount !== null && attachment.lineCount !== null ? (
            <span className="mosc-tk-attachment-facts">
              {mosNewTaskAttachmentFacts(attachment.charCount, attachment.lineCount)}
            </span>
          ) : null}
          {attachment.sizeBytes > 0 ? (
            <span className="mosc-tk-attachment-size">
              {mosNewTaskFormatAttachmentSize(attachment.sizeBytes)}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
