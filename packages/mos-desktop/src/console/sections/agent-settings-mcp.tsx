/**
 * The MOS AGENT SETTINGS MCP Servers content (W38 — the substrate's MCP
 * settings section replica): the server rows (the Cable icon tile with
 * the honest recorded-status dot, the name + scope badge + transport
 * description, the enable switch, the armed two-click Delete) and the
 * New/Edit MCP server form (Name, Scope, Type, the stdio command/args/
 * env fields, the http-family url/headers fields, the timeout + the
 * protocol version select — the substrate's own form vocabulary).
 * Hook-free: the draft + the record arrive as props, the commands leave
 * through the callbacks.
 */

import type { MosWorkspaceMcpServer } from '../workspace-store.js';
import type { MosMcpFormState } from '../agent-settings-forms.js';
import {
  MOS_MCP_GROUP_LOCAL,
  MOS_MCP_ADD_LABEL,
  MOS_MCP_EMPTY_TITLE,
  MOS_MCP_EMPTY_DESCRIPTION,
  MOS_MCP_FORM_CREATE_TITLE,
  MOS_MCP_FORM_EDIT_TITLE,
  MOS_MCP_FORM_CREATE_DESCRIPTION,
  MOS_MCP_FORM_EDIT_DESCRIPTION,
  MOS_MCP_FORM_NAME,
  MOS_MCP_FORM_TYPE,
  MOS_MCP_FORM_SCOPE,
  MOS_MCP_FORM_COMMAND,
  MOS_MCP_FORM_ARGS,
  MOS_MCP_FORM_ENV,
  MOS_MCP_FORM_URL,
  MOS_MCP_FORM_HEADERS,
  MOS_MCP_FORM_TIMEOUT,
  MOS_MCP_FORM_PROTOCOL,
  MOS_MCP_SCOPE_USER,
  MOS_MCP_SCOPE_WORKSPACE,
  MOS_MCP_TYPE_STDIO,
  MOS_MCP_TYPE_HTTP,
  MOS_MCP_TYPE_SSE,
  MOS_MCP_PROTOCOL_AUTO,
  MOS_MCP_PROTOCOL_LEGACY,
  MOS_MCP_PROTOCOL_MODERN,
  MOS_MCP_FORM_ADD,
  MOS_MCP_FORM_SAVE,
  MOS_MCP_FORM_BACK,
  MOS_MCP_STATUS_DISCONNECTED_REASON,
  mosMcpDeleteConfirm,
  mosMcpRowDescription,
} from '../agent-settings-presentation.js';
import { SECTION_ICONS, BACK_GLYPH, PLUS_GLYPH, armDeleteButton } from './agent-settings-glyphs.js';

type ViewNode = unknown;

export function McpServerRow({
  record,
  onEdit,
  onToggle,
  onDelete,
}: {
  readonly record: MosWorkspaceMcpServer;
  readonly onEdit: (record: MosWorkspaceMcpServer) => void;
  readonly onToggle: (id: string, enabled: boolean) => void;
  readonly onDelete: (id: string) => void;
}) {
  const description = mosMcpRowDescription(record.type, record.command, record.args, record.url);
  return (
    <div
      className="mosc-aset-row"
      data-testid={`mcp-server-row-${record.name}`}
      data-mcp-status={record.enabled ? 'disconnected' : 'disabled'}
    >
      <span className="mosc-aset-rowicon is-mcp" aria-hidden="true">
        {SECTION_ICONS.mcp}
        <span
          className={record.enabled ? 'mosc-aset-statusdot is-recorded' : 'mosc-aset-statusdot is-off'}
          title={record.enabled ? MOS_MCP_STATUS_DISCONNECTED_REASON : 'Disabled'}
          aria-label={record.enabled ? 'Recorded, not connected' : 'Disabled'}
        />
      </span>
      <div className="mosc-aset-rowbody">
        <div className="mosc-aset-rowtitle">
          <span className="mosc-aset-rowname">{record.name}</span>
          <span className={record.storageLevel === 'workspace' ? 'mosc-aset-scope is-workspace' : 'mosc-aset-scope'}>
            {record.storageLevel}
          </span>
        </div>
        <p className="mosc-aset-rowline">{description}</p>
      </div>
      <div className="mosc-aset-rowactions">
        <button
          type="button"
          role="switch"
          aria-checked={record.enabled}
          aria-label={record.enabled ? `Disable ${record.name}` : `Enable ${record.name}`}
          data-testid="mosaset-mcp-toggle"
          data-mcp-id={record.id}
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
          data-testid="mosaset-mcp-edit"
          title={`Edit ${record.name}`}
          onClick={() => {
            onEdit(record);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="mosc-aset-deletebtn"
          data-testid="mosaset-mcp-delete"
          title={mosMcpDeleteConfirm(record.name)}
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

export function McpFormView({
  form,
  onChange,
  onCancel,
  onSubmit,
}: {
  readonly form: MosMcpFormState;
  readonly onChange: (partial: Partial<MosMcpFormState>) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  const isEdit = form.editingId !== null;
  const typeLabel =
    form.type === 'stdio' ? MOS_MCP_TYPE_STDIO : form.type === 'http' ? MOS_MCP_TYPE_HTTP : MOS_MCP_TYPE_SSE;
  return (
    <div className="mosc-aset-form" data-testid="mosaset-mcp-form">
      <div className="mosc-aset-formhead">
        <h3 className="mosc-aset-formtitle">{isEdit ? MOS_MCP_FORM_EDIT_TITLE : MOS_MCP_FORM_CREATE_TITLE}</h3>
        <p className="mosc-aset-formdesc">
          {isEdit ? MOS_MCP_FORM_EDIT_DESCRIPTION : MOS_MCP_FORM_CREATE_DESCRIPTION}
        </p>
      </div>
      <div className="mosc-aset-formgrid">
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-name">
            {MOS_MCP_FORM_NAME}
          </label>
          <input
            id="mosaset-mcp-name"
            className="mosc-input"
            data-testid="mosaset-mcp-name"
            placeholder="my-mcp-server"
            value={form.name}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
            }}
          />
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-scope">
            {MOS_MCP_FORM_SCOPE}
          </label>
          <select
            id="mosaset-mcp-scope"
            className="mosc-select"
            data-testid="mosaset-mcp-scope"
            value={form.storageLevel}
            onChange={(event) => {
              onChange({ storageLevel: event.currentTarget.value === 'workspace' ? 'workspace' : 'user' });
            }}
          >
            <option value="user">{MOS_MCP_SCOPE_USER}</option>
            <option value="workspace">{MOS_MCP_SCOPE_WORKSPACE}</option>
          </select>
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-type">
            {MOS_MCP_FORM_TYPE}
          </label>
          <select
            id="mosaset-mcp-type"
            className="mosc-select"
            data-testid="mosaset-mcp-type"
            value={form.type}
            aria-label={typeLabel}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange({ type: value === 'stdio' || value === 'http' || value === 'sse' ? value : 'stdio' });
            }}
          >
            <option value="stdio">{MOS_MCP_TYPE_STDIO}</option>
            <option value="http">{MOS_MCP_TYPE_HTTP}</option>
            <option value="sse">{MOS_MCP_TYPE_SSE}</option>
          </select>
        </div>
        {form.type === 'stdio' ? (
          <>
            <div className="mosc-aset-field">
              <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-command">
                {MOS_MCP_FORM_COMMAND}
              </label>
              <input
                id="mosaset-mcp-command"
                className="mosc-input"
                data-testid="mosaset-mcp-command"
                value={form.command}
                onChange={(event) => {
                  onChange({ command: event.currentTarget.value });
                }}
              />
            </div>
            <div className="mosc-aset-field">
              <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-args">
                {MOS_MCP_FORM_ARGS}
              </label>
              <input
                id="mosaset-mcp-args"
                className="mosc-input"
                data-testid="mosaset-mcp-args"
                value={form.args}
                onChange={(event) => {
                  onChange({ args: event.currentTarget.value });
                }}
              />
            </div>
            <div className="mosc-aset-field mosc-aset-field--wide">
              <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-env">
                {MOS_MCP_FORM_ENV}
              </label>
              <textarea
                id="mosaset-mcp-env"
                className="mosc-textarea"
                data-testid="mosaset-mcp-env"
                rows={3}
                placeholder='{ "API_KEY": "..." }'
                value={form.envJson}
                onChange={(event) => {
                  onChange({ envJson: event.currentTarget.value });
                }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="mosc-aset-field mosc-aset-field--wide">
              <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-url">
                {MOS_MCP_FORM_URL}
              </label>
              <input
                id="mosaset-mcp-url"
                className="mosc-input"
                data-testid="mosaset-mcp-url"
                placeholder="https://example.com/mcp"
                value={form.url}
                onChange={(event) => {
                  onChange({ url: event.currentTarget.value });
                }}
              />
            </div>
            <div className="mosc-aset-field mosc-aset-field--wide">
              <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-headers">
                {MOS_MCP_FORM_HEADERS}
              </label>
              <textarea
                id="mosaset-mcp-headers"
                className="mosc-textarea"
                data-testid="mosaset-mcp-headers"
                rows={3}
                placeholder='{ "Authorization": "Bearer ..." }'
                value={form.headersJson}
                onChange={(event) => {
                  onChange({ headersJson: event.currentTarget.value });
                }}
              />
            </div>
          </>
        )}
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-timeout">
            {MOS_MCP_FORM_TIMEOUT}
          </label>
          <input
            id="mosaset-mcp-timeout"
            className="mosc-input"
            data-testid="mosaset-mcp-timeout"
            inputMode="numeric"
            value={form.timeoutMs}
            onChange={(event) => {
              onChange({ timeoutMs: event.currentTarget.value });
            }}
          />
        </div>
        <div className="mosc-aset-field">
          <label className="mosc-aset-fieldlabel" htmlFor="mosaset-mcp-protocol">
            {MOS_MCP_FORM_PROTOCOL}
          </label>
          <select
            id="mosaset-mcp-protocol"
            className="mosc-select"
            data-testid="mosaset-mcp-protocol"
            value={form.protocolVersion}
            onChange={(event) => {
              onChange({ protocolVersion: event.currentTarget.value });
            }}
          >
            <option value="">{MOS_MCP_PROTOCOL_AUTO}</option>
            <option value="2025-06-18">{MOS_MCP_PROTOCOL_MODERN}</option>
            <option value="2024-11-05">{MOS_MCP_PROTOCOL_LEGACY}</option>
          </select>
        </div>
      </div>
      <div className="mosc-aset-formactions">
        <button type="button" className="mosc-aset-backbtn" data-testid="mosaset-mcp-cancel" onClick={onCancel}>
          {BACK_GLYPH}
          <span>{MOS_MCP_FORM_BACK}</span>
        </button>
        <button
          type="button"
          className="mosc-button mosc-button--primary"
          data-testid="mosaset-mcp-submit"
          onClick={onSubmit}
        >
          {isEdit ? MOS_MCP_FORM_SAVE : MOS_MCP_FORM_ADD}
        </button>
      </div>
    </div>
  );
}
