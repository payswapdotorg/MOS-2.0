/**
 * The MOS AGENT SETTINGS Commands content (W38 — the substrate's
 * Commands settings section replica): the user-command rows (the
 * Terminal icon tile, the /name + argument hint + description, the
 * armed two-click Delete) and the New/Edit command form (name,
 * description, argument hint, prompt — the substrate's own CommandForm
 * vocabulary, placeholders verbatim). Hook-free like every console
 * section.
 */

import type { MosWorkspaceUserCommand } from '../workspace-store.js';
import type { MosCommandFormState } from '../agent-settings-forms.js';
import {
  MOS_COMMANDS_FORM_CREATE_TITLE,
  MOS_COMMANDS_FORM_EDIT_TITLE,
  MOS_COMMANDS_FORM_CREATE_DESCRIPTION,
  MOS_COMMANDS_FORM_EDIT_DESCRIPTION,
  MOS_COMMANDS_FORM_NAME,
  MOS_COMMANDS_FORM_DESCRIPTION,
  MOS_COMMANDS_FORM_ARGUMENT_HINT,
  MOS_COMMANDS_FORM_PROMPT,
  MOS_COMMANDS_NAME_PLACEHOLDER,
  MOS_COMMANDS_DESCRIPTION_PLACEHOLDER,
  MOS_COMMANDS_ARGUMENT_PLACEHOLDER,
  MOS_COMMANDS_PROMPT_PLACEHOLDER,
  MOS_COMMANDS_NO_DESCRIPTION,
  mosCommandDeleteConfirm,
  MOS_MCP_FORM_ADD,
  MOS_MCP_FORM_SAVE,
  MOS_MCP_FORM_BACK,
} from '../agent-settings-presentation.js';
import { SectionIconTile, BACK_GLYPH, armDeleteButton } from './agent-settings-glyphs.js';

type ViewNode = unknown;

export function CommandRow({
  record,
  onEdit,
  onDelete,
}: {
  readonly record: MosWorkspaceUserCommand;
  readonly onEdit: (record: MosWorkspaceUserCommand) => void;
  readonly onDelete: (id: string) => void;
}) {
  return (
    <div className="mosc-aset-row" data-testid={`mosaset-command-row-${record.name}`}>
      <SectionIconTile sectionId="commands" />
      <div className="mosc-aset-rowbody">
        <div className="mosc-aset-rowtitle">
          <span className="mosc-aset-rowname">/{record.name}</span>
          {record.argumentHint.length > 0 ? (
            <span className="mosc-aset-arghint">{record.argumentHint}</span>
          ) : null}
        </div>
        <p className="mosc-aset-rowline">
          {record.description.length > 0 ? record.description : MOS_COMMANDS_NO_DESCRIPTION}
        </p>
      </div>
      <div className="mosc-aset-rowactions">
        <button
          type="button"
          className="mosc-aset-editbtn"
          data-testid="mosaset-command-edit"
          title={`Edit /${record.name}`}
          onClick={() => {
            onEdit(record);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="mosc-aset-deletebtn"
          data-testid="mosaset-command-delete"
          title={mosCommandDeleteConfirm(record.name)}
          onClick={(event) => {
            armDeleteButton(event.currentTarget, () => {
              onDelete(record.id);
            });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function CommandFormView({
  form,
  onChange,
  onCancel,
  onSubmit,
}: {
  readonly form: MosCommandFormState;
  readonly onChange: (partial: Partial<MosCommandFormState>) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  const isEdit = form.editingId !== null;
  return (
    <div className="mosc-aset-form" data-testid="mosaset-command-form">
      <div className="mosc-aset-formhead">
        <h3 className="mosc-aset-formtitle">{isEdit ? MOS_COMMANDS_FORM_EDIT_TITLE : MOS_COMMANDS_FORM_CREATE_TITLE}</h3>
        <p className="mosc-aset-formdesc">
          {isEdit ? MOS_COMMANDS_FORM_EDIT_DESCRIPTION : MOS_COMMANDS_FORM_CREATE_DESCRIPTION}
        </p>
      </div>
      <div className="mosc-aset-formgrid">
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-command-name">
            {MOS_COMMANDS_FORM_NAME}
          </label>
          <input
            id="mosaset-command-name"
            className="mosc-input"
            data-testid="mosaset-command-name"
            placeholder={MOS_COMMANDS_NAME_PLACEHOLDER}
            value={form.name}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
            }}
          />
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-command-description">
            {MOS_COMMANDS_FORM_DESCRIPTION}
          </label>
          <input
            id="mosaset-command-description"
            className="mosc-input"
            data-testid="mosaset-command-description"
            placeholder={MOS_COMMANDS_DESCRIPTION_PLACEHOLDER}
            value={form.description}
            onChange={(event) => {
              onChange({ description: event.currentTarget.value });
            }}
          />
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-command-arghint">
            {MOS_COMMANDS_FORM_ARGUMENT_HINT}
          </label>
          <input
            id="mosaset-command-arghint"
            className="mosc-input"
            data-testid="mosaset-command-arghint"
            placeholder={MOS_COMMANDS_ARGUMENT_PLACEHOLDER}
            value={form.argumentHint}
            onChange={(event) => {
              onChange({ argumentHint: event.currentTarget.value });
            }}
          />
        </div>
        <div className="mosc-aset-field mosc-aset-field--wide">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-command-prompt">
            {MOS_COMMANDS_FORM_PROMPT}
          </label>
          <textarea
            id="mosaset-command-prompt"
            className="mosc-textarea"
            data-testid="mosaset-command-prompt"
            rows={5}
            placeholder={MOS_COMMANDS_PROMPT_PLACEHOLDER}
            value={form.prompt}
            onChange={(event) => {
              onChange({ prompt: event.currentTarget.value });
            }}
          />
        </div>
      </div>
      <div className="mosc-aset-formactions">
        <button type="button" className="mosc-aset-backbtn" data-testid="mosaset-command-cancel" onClick={onCancel}>
          {BACK_GLYPH}
          <span>{MOS_MCP_FORM_BACK}</span>
        </button>
        <button
          type="button"
          className="mosc-button mosc-button--primary"
          data-testid="mosaset-command-submit"
          onClick={onSubmit}
        >
          {isEdit ? MOS_MCP_FORM_SAVE : MOS_MCP_FORM_ADD}
        </button>
      </div>
    </div>
  );
}
