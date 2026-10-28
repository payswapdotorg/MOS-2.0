/**
 * The MOS AGENT SETTINGS Hooks content (W38 — the substrate's Hooks
 * settings section replica): the hook rows (the Anchor icon tile, the
 * event + matcher + runner line, the enable switch, the armed two-click
 * Delete) and the New/Edit hook form (the event select with the
 * substrate's own seven-event vocabulary, the optional matcher with its
 * hint, the runner select, the command, the timeout — the substrate's
 * own HookForm vocabulary). Hook-free like every console section.
 */

import type { MosWorkspaceHook } from '../workspace-store.js';
import type { MosHookFormState } from '../agent-settings-forms.js';
import {
  MOS_HOOKS_ADD_LABEL,
  MOS_HOOKS_FORM_EVENT,
  MOS_HOOKS_FORM_MATCHER,
  MOS_HOOKS_FORM_TYPE,
  MOS_HOOKS_FORM_COMMAND,
  MOS_HOOKS_FORM_TIMEOUT,
  MOS_HOOKS_TYPE_COMMAND,
  MOS_HOOKS_TYPE_PROCESS,
  MOS_HOOK_EVENTS,
  MOS_HOOKS_MATCHER_PLACEHOLDER,
  MOS_HOOKS_MATCHER_HINT,
  MOS_HOOKS_COMMAND_PLACEHOLDER,
  MOS_HOOKS_TIMEOUT_HINT,
  MOS_HOOKS_MATCH_ALL,
  mosHookDeleteConfirm,
  MOS_MCP_FORM_ADD,
  MOS_MCP_FORM_SAVE,
  MOS_MCP_FORM_BACK,
} from '../agent-settings-presentation.js';
import { SectionIconTile, BACK_GLYPH, armDeleteButton } from './agent-settings-glyphs.js';

type ViewNode = unknown;

export function HookRow({
  record,
  onToggle,
  onEdit,
  onDelete,
}: {
  readonly record: MosWorkspaceHook;
  readonly onToggle: (id: string, enabled: boolean) => void;
  readonly onEdit: (record: MosWorkspaceHook) => void;
  readonly onDelete: (id: string) => void;
}) {
  return (
    <div className="mosc-aset-row" data-testid={`mosaset-hook-row-${record.event}`}>
      <SectionIconTile sectionId="hooks" />
      <div className="mosc-aset-rowbody">
        <div className="mosc-aset-rowtitle">
          <span className="mosc-aset-rowname">{record.event}</span>
          <span className="mosc-aset-arghint">
            {record.matcher.length > 0 ? record.matcher : MOS_HOOKS_MATCH_ALL}
          </span>
        </div>
        <p className="mosc-aset-rowline">
          {record.type === 'command' ? 'Shell command' : 'Process'} · {record.command}
          {record.timeoutSeconds !== null ? ` · ${record.timeoutSeconds}s` : ''}
        </p>
      </div>
      <div className="mosc-aset-rowactions">
        <button
          type="button"
          role="switch"
          aria-checked={record.enabled}
          aria-label={record.enabled ? `Disable the ${record.event} hook` : `Enable the ${record.event} hook`}
          data-testid="mosaset-hook-toggle"
          data-hook-id={record.id}
          className={record.enabled ? 'mosc-switch is-on' : 'mosc-switch'}
          onClick={() => {
            onToggle(record.id, !record.enabled);
          }}
        >
          <span className="mosc-switch-knob" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mosc-aset-editbtn"
          data-testid="mosaset-hook-edit"
          title={`Edit the ${record.event} hook`}
          onClick={() => {
            onEdit(record);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="mosc-aset-deletebtn"
          data-testid="mosaset-hook-delete"
          title={mosHookDeleteConfirm(record.event)}
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

export function HookFormView({
  form,
  onChange,
  onCancel,
  onSubmit,
}: {
  readonly form: MosHookFormState;
  readonly onChange: (partial: Partial<MosHookFormState>) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  const isEdit = form.editingId !== null;
  return (
    <div className="mosc-aset-form" data-testid="mosaset-hook-form">
      <div className="mosc-aset-formhead">
        <h3 className="mosc-aset-formtitle">{isEdit ? 'Edit hook' : MOS_HOOKS_ADD_LABEL}</h3>
        <p className="mosc-aset-formdesc">
          {MOS_HOOKS_FORM_EVENT} + {MOS_HOOKS_FORM_COMMAND}
        </p>
      </div>
      <div className="mosc-aset-formgrid">
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-hook-event">
            {MOS_HOOKS_FORM_EVENT}
          </label>
          <select
            id="mosaset-hook-event"
            className="mosc-select"
            data-testid="mosaset-hook-event"
            value={form.event}
            onChange={(event) => {
              onChange({ event: event.currentTarget.value });
            }}
          >
            {MOS_HOOK_EVENTS.map((event) => (
              <option key={event} value={event}>
                {event}
              </option>
            ))}
          </select>
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-hook-matcher">
            {MOS_HOOKS_FORM_MATCHER}
          </label>
          <input
            id="mosaset-hook-matcher"
            className="mosc-input"
            data-testid="mosaset-hook-matcher"
            placeholder={MOS_HOOKS_MATCHER_PLACEHOLDER}
            value={form.matcher}
            onChange={(event) => {
              onChange({ matcher: event.currentTarget.value });
            }}
          />
          <p className="mosc-aset-fieldhint">{MOS_HOOKS_MATCHER_HINT}</p>
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-hook-type">
            {MOS_HOOKS_FORM_TYPE}
          </label>
          <select
            id="mosaset-hook-type"
            className="mosc-select"
            data-testid="mosaset-hook-type"
            value={form.type}
            onChange={(event) => {
              onChange({ type: event.currentTarget.value === 'process' ? 'process' : 'command' });
            }}
          >
            <option value="command">{MOS_HOOKS_TYPE_COMMAND}</option>
            <option value="process">{MOS_HOOKS_TYPE_PROCESS}</option>
          </select>
        </div>
        <div className="mosc-aset-field mosc-aset-field--wide">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-hook-command">
            {MOS_HOOKS_FORM_COMMAND}
          </label>
          <input
            id="mosaset-hook-command"
            className="mosc-input"
            data-testid="mosaset-hook-command"
            placeholder={MOS_HOOKS_COMMAND_PLACEHOLDER}
            value={form.command}
            onChange={(event) => {
              onChange({ command: event.currentTarget.value });
            }}
          />
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-hook-timeout">
            {MOS_HOOKS_FORM_TIMEOUT}
          </label>
          <input
            id="mosaset-hook-timeout"
            className="mosc-input"
            data-testid="mosaset-hook-timeout"
            inputMode="numeric"
            value={form.timeoutSeconds}
            onChange={(event) => {
              onChange({ timeoutSeconds: event.currentTarget.value });
            }}
          />
          <p className="mosc-aset-fieldhint">{MOS_HOOKS_TIMEOUT_HINT}</p>
        </div>
      </div>
      <div className="mosc-aset-formactions">
        <button type="button" className="mosc-aset-backbtn" data-testid="mosaset-hook-cancel" onClick={onCancel}>
          {BACK_GLYPH}
          <span>{MOS_MCP_FORM_BACK}</span>
        </button>
        <button
          type="button"
          className="mosc-button mosc-button--primary"
          data-testid="mosaset-hook-submit"
          onClick={onSubmit}
        >
          {isEdit ? MOS_MCP_FORM_SAVE : MOS_MCP_FORM_ADD}
        </button>
      </div>
    </div>
  );
}
