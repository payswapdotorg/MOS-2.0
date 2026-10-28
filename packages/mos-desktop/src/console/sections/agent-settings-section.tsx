/**
 * The MOS AGENT SETTINGS section (W38 — the substrate's Settings page,
 * EMERGED as a native MOS console surface, "exactly as is" per the
 * owner's directive). This is the LAST substrate-gated nav item: after
 * this emerge, every Agent Workbench rail entry except the chat
 * workbench itself is a native MOS surface.
 *
 * WHAT THIS REPLICATES (the substrate's SettingsPage, verbatim
 * structure + copy): the settings hub shell — the left sidebar with the
 * three groups (Basics / Agent capabilities / Data and statistics), the
 * fourteen visible section entries with their own icons and titles
 * (General, Appearance, Model settings, Browser Use, Computer Use,
 * Keyboard Shortcuts, Memory, Subagents, Plugins, MCP Servers, Skills,
 * Commands, Hooks, Usage stats — Automations hidden per the substrate's
 * own law), and the content pane with the active section's h2 heading
 * and content.
 *
 * WHAT IS REAL: the three Agent-capability write sections carry REAL
 * workspace records — MCP Servers, Commands, and Hooks (their rows +
 * forms live in their own modules: agent-settings-mcp/commands/hooks).
 * Model settings and Plugins cross-link to their emerged native
 * surfaces (W35/W37). The remaining sections answer honestly — General
 * / Appearance / Browser Use / Computer Use / Keyboard Shortcuts mount
 * with the substrate surface, and Memory / Subagents / Skills / Usage
 * stats are substrate-account data that arrives with a connected
 * account, never fabricated here.
 *
 * HOOK-FREE like every console section: the snapshot + the active
 * settings section + the three form drafts + the receipts arrive as
 * props, the commands leave through the callbacks (the entry owns every
 * piece of state and re-mounts).
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import type {
  MosWorkspaceHook,
  MosWorkspaceMcpServer,
  MosWorkspaceSnapshot,
  MosWorkspaceUserCommand,
} from '../workspace-store.js';
import type {
  MosCommandFormState,
  MosHookFormState,
  MosMcpFormState,
} from '../agent-settings-forms.js';
import {
  MOS_SETTINGS_SECTIONS,
  MOS_SETTINGS_MODEL_SETTINGS_LINK,
  MOS_SETTINGS_MARKETPLACE_LINK,
  MOS_MCP_ADD_LABEL,
  MOS_MCP_EMPTY_TITLE,
  MOS_MCP_EMPTY_DESCRIPTION,
  MOS_MCP_GROUP_LOCAL,
  MOS_COMMANDS_ADD_LABEL,
  MOS_COMMANDS_EMPTY,
  MOS_COMMANDS_GROUP_LOCAL,
  MOS_COMMANDS_GROUP_PLUGIN,
  MOS_COMMANDS_PLUGIN_EMPTY,
  MOS_HOOKS_ADD_LABEL,
  MOS_HOOKS_EMPTY,
  MOS_HOOKS_GROUP_LOCAL,
  type MosSettingsSectionId,
} from '../agent-settings-presentation.js';
import { ReceiptLine } from './shared.js';
import { SECTION_ICONS, PLUS_GLYPH, CHECK_GLYPH } from './agent-settings-glyphs.js';
import { McpServerRow, McpFormView } from './agent-settings-mcp.js';
import { CommandRow, CommandFormView } from './agent-settings-commands.js';
import { HookRow, HookFormView } from './agent-settings-hooks.js';

type ViewNode = unknown;

export function AgentSettingsSection({
  section,
  workspace,
  activeSection,
  mcpForm,
  commandForm,
  hookForm,
  receipt,
  onSelectSection,
  onOpenMcpForm,
  onEditMcpForm,
  onMcpFormChange,
  onMcpFormCancel,
  onMcpFormSubmit,
  onToggleMcpServer,
  onDeleteMcpServer,
  onOpenCommandForm,
  onEditCommandForm,
  onCommandFormChange,
  onCommandFormCancel,
  onCommandFormSubmit,
  onDeleteUserCommand,
  onOpenHookForm,
  onEditHookForm,
  onHookFormChange,
  onHookFormCancel,
  onHookFormSubmit,
  onToggleHook,
  onDeleteHook,
  onOpenModelSettings,
  onOpenMarketplace,
  onSkillsNote,
}: {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The settings sidebar's active section (the entry owns it). */
  readonly activeSection: MosSettingsSectionId;
  /** The MCP form draft (null = the list view shows). */
  readonly mcpForm: MosMcpFormState | null;
  /** The command form draft (null = the list view shows). */
  readonly commandForm: MosCommandFormState | null;
  /** The hook form draft (null = the list view shows). */
  readonly hookForm: MosHookFormState | null;
  readonly receipt: string | null;
  readonly onSelectSection: (id: MosSettingsSectionId) => void;
  readonly onOpenMcpForm: () => void;
  readonly onEditMcpForm: (record: MosWorkspaceMcpServer) => void;
  readonly onMcpFormChange: (partial: Partial<MosMcpFormState>) => void;
  readonly onMcpFormCancel: () => void;
  readonly onMcpFormSubmit: () => void;
  readonly onToggleMcpServer: (id: string, enabled: boolean) => void;
  readonly onDeleteMcpServer: (id: string) => void;
  readonly onOpenCommandForm: () => void;
  readonly onEditCommandForm: (record: MosWorkspaceUserCommand) => void;
  readonly onCommandFormChange: (partial: Partial<MosCommandFormState>) => void;
  readonly onCommandFormCancel: () => void;
  readonly onCommandFormSubmit: () => void;
  readonly onDeleteUserCommand: (id: string) => void;
  readonly onOpenHookForm: () => void;
  readonly onEditHookForm: (record: MosWorkspaceHook) => void;
  readonly onHookFormChange: (partial: Partial<MosHookFormState>) => void;
  readonly onHookFormCancel: () => void;
  readonly onHookFormSubmit: () => void;
  readonly onToggleHook: (id: string, enabled: boolean) => void;
  readonly onDeleteHook: (id: string) => void;
  /** Cross-nav to the emerged native surfaces (real navigation). */
  readonly onOpenModelSettings: () => void;
  readonly onOpenMarketplace: () => void;
  /** The Skills section's honest affordances. */
  readonly onSkillsNote: (note: 'refresh' | 'new') => void;
}) {
  return (
    <section
      aria-labelledby="mosc-agent-settings-heading"
      className="mosc-section mosc-aset"
      data-testid="mosc-section-agent-settings"
    >
      <h1 id="mosc-agent-settings-heading" className="mosc-sr-only">
        {section.title}
      </h1>

      <div className="mosc-aset-shell" data-testid="settings-page" data-active-section={activeSection}>
        <nav className="mosc-aset-nav" aria-label="Settings sections">
          {MOS_SETTINGS_SECTIONS.map((group) => (
            <div key={group.group} className="mosc-aset-navgroup" role="group" aria-label={group.title}>
              <p className="mosc-aset-navgrouptitle">{group.title}</p>
              {group.sections.map((entry) => {
                const isActive = entry.id === activeSection;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={isActive ? 'mosc-aset-navitem is-active' : 'mosc-aset-navitem'}
                    data-testid={`settings-section-nav-${entry.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      onSelectSection(entry.id);
                    }}
                  >
                    {SECTION_ICONS[entry.id]}
                    <span className="mosc-aset-navlabel">{entry.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="mosc-aset-content">
          {activeSection === 'mcp' ? (
            mcpForm !== null ? (
              <McpFormView
                form={mcpForm}
                onChange={onMcpFormChange}
                onCancel={onMcpFormCancel}
                onSubmit={onMcpFormSubmit}
              />
            ) : (
              <div className="mosc-aset-sectionview">
                <div className="mosc-aset-viewhead">
                  <h2 className="mosc-aset-viewtitle">MCP Servers</h2>
                  <button
                    type="button"
                    className="mosc-aset-addbtn"
                    data-testid="mosaset-mcp-add"
                    onClick={() => {
                      onOpenMcpForm();
                    }}
                  >
                    {PLUS_GLYPH}
                    <span>{MOS_MCP_ADD_LABEL}</span>
                  </button>
                </div>
                <p className="mosc-aset-viewnote">Manage MCP server configurations used by ZCode Agent.</p>
                {workspace.mcpServers.length > 0 ? (
                  <div className="mosc-aset-list">
                    <p className="mosc-aset-grouphead">{MOS_MCP_GROUP_LOCAL}</p>
                    {workspace.mcpServers.map((record) => (
                      <McpServerRow
                        key={record.id}
                        record={record}
                        onEdit={onEditMcpForm}
                        onToggle={onToggleMcpServer}
                        onDelete={onDeleteMcpServer}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mosc-aset-empty" role="status">
                    <p className="mosc-aset-emptytitle">{MOS_MCP_EMPTY_TITLE}</p>
                    <p className="mosc-aset-emptydesc">{MOS_MCP_EMPTY_DESCRIPTION}</p>
                    <button
                      type="button"
                      className="mosc-aset-addbtn"
                      onClick={() => {
                        onOpenMcpForm();
                      }}
                    >
                      {PLUS_GLYPH}
                      <span>{MOS_MCP_ADD_LABEL}</span>
                    </button>
                  </div>
                )}
                {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
              </div>
            )
          ) : activeSection === 'commands' ? (
            commandForm !== null ? (
              <CommandFormView
                form={commandForm}
                onChange={onCommandFormChange}
                onCancel={onCommandFormCancel}
                onSubmit={onCommandFormSubmit}
              />
            ) : (
              <div className="mosc-aset-sectionview">
                <div className="mosc-aset-viewhead">
                  <h2 className="mosc-aset-viewtitle">Commands</h2>
                  <button
                    type="button"
                    className="mosc-aset-addbtn"
                    data-testid="mosaset-command-add"
                    onClick={() => {
                      onOpenCommandForm();
                    }}
                  >
                    {PLUS_GLYPH}
                    <span>{MOS_COMMANDS_ADD_LABEL}</span>
                  </button>
                </div>
                <p className="mosc-aset-viewnote">
                  Manage ZCode Agent .md command files. Commands can be invoked with /command-name in chat.
                </p>
                <div className="mosc-aset-list">
                  {workspace.userCommands.length > 0 ? (
                    <>
                      <p className="mosc-aset-grouphead">{MOS_COMMANDS_GROUP_LOCAL}</p>
                      {workspace.userCommands.map((record) => (
                        <CommandRow
                          key={record.id}
                          record={record}
                          onEdit={onEditCommandForm}
                          onDelete={onDeleteUserCommand}
                        />
                      ))}
                    </>
                  ) : (
                    <p className="mosc-aset-emptyline" role="status">
                      {MOS_COMMANDS_EMPTY}
                    </p>
                  )}
                  <p className="mosc-aset-grouphead">{MOS_COMMANDS_GROUP_PLUGIN}</p>
                  <p className="mosc-aset-emptyline" role="status">
                    {MOS_COMMANDS_PLUGIN_EMPTY}
                  </p>
                </div>
                {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
              </div>
            )
          ) : activeSection === 'hooks' ? (
            hookForm !== null ? (
              <HookFormView
                form={hookForm}
                onChange={onHookFormChange}
                onCancel={onHookFormCancel}
                onSubmit={onHookFormSubmit}
              />
            ) : (
              <div className="mosc-aset-sectionview">
                <div className="mosc-aset-viewhead">
                  <h2 className="mosc-aset-viewtitle">Hooks</h2>
                  <button
                    type="button"
                    className="mosc-aset-addbtn"
                    data-testid="mosaset-hook-add"
                    onClick={() => {
                      onOpenHookForm();
                    }}
                  >
                    {PLUS_GLYPH}
                    <span>{MOS_HOOKS_ADD_LABEL}</span>
                  </button>
                </div>
                <p className="mosc-aset-viewnote">
                  Manage task lifecycle hooks to automatically execute commands on specific events.
                </p>
                {workspace.hooks.length > 0 ? (
                  <div className="mosc-aset-list">
                    <p className="mosc-aset-grouphead">{MOS_HOOKS_GROUP_LOCAL}</p>
                    {workspace.hooks.map((record) => (
                      <HookRow
                        key={record.id}
                        record={record}
                        onToggle={onToggleHook}
                        onEdit={onEditHookForm}
                        onDelete={onDeleteHook}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mosc-aset-empty" role="status">
                    <p className="mosc-aset-emptytitle">{MOS_HOOKS_EMPTY}</p>
                    <button
                      type="button"
                      className="mosc-aset-addbtn"
                      onClick={() => {
                        onOpenHookForm();
                      }}
                    >
                      {PLUS_GLYPH}
                      <span>{MOS_HOOKS_ADD_LABEL}</span>
                    </button>
                  </div>
                )}
                {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
              </div>
            )
          ) : (
            <HonestSectionView
              sectionId={activeSection}
              onOpenModelSettings={onOpenModelSettings}
              onOpenMarketplace={onOpenMarketplace}
              onSkillsNote={onSkillsNote}
              receipt={receipt}
            />
          )}
        </main>
      </div>
    </section>
  );
}

/** The honest non-record sections: the heading + the honest line + the cross-links where they exist. */
function HonestSectionView({
  sectionId,
  onOpenModelSettings,
  onOpenMarketplace,
  onSkillsNote,
  receipt,
}: {
  readonly sectionId: MosSettingsSectionId;
  readonly onOpenModelSettings: () => void;
  readonly onOpenMarketplace: () => void;
  readonly onSkillsNote: (note: 'refresh' | 'new') => void;
  readonly receipt: string | null;
}) {
  let heading = '';
  let honestLine = '';
  for (const group of MOS_SETTINGS_SECTIONS) {
    const entry = group.sections.find((candidate) => candidate.id === sectionId);
    if (entry !== undefined) {
      heading = entry.heading;
      honestLine = entry.honestLine;
      break;
    }
  }
  return (
    <div className="mosc-aset-sectionview">
      <h2 className="mosc-aset-viewtitle">{heading}</h2>
      <p className="mosc-aset-viewnote">{honestLine}</p>
      {sectionId === 'modelProvider' ? (
        <button
          type="button"
          className="mosc-aset-crosbtn"
          data-testid="mosaset-open-model-settings"
          onClick={onOpenModelSettings}
        >
          {CHECK_GLYPH}
          <span>{MOS_SETTINGS_MODEL_SETTINGS_LINK}</span>
        </button>
      ) : null}
      {sectionId === 'plugin' ? (
        <button
          type="button"
          className="mosc-aset-crosbtn"
          data-testid="mosaset-open-marketplace"
          onClick={onOpenMarketplace}
        >
          {CHECK_GLYPH}
          <span>{MOS_SETTINGS_MARKETPLACE_LINK}</span>
        </button>
      ) : null}
      {sectionId === 'skill' ? (
        <div className="mosc-aset-skillactions">
          <button
            type="button"
            className="mosc-aset-addbtn"
            data-testid="mosaset-skills-refresh"
            onClick={() => {
              onSkillsNote('refresh');
            }}
          >
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="mosc-aset-addbtn"
            data-testid="mosaset-skills-new"
            onClick={() => {
              onSkillsNote('new');
            }}
          >
            {PLUS_GLYPH}
            <span>New skill</span>
          </button>
        </div>
      ) : null}
      {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
    </div>
  );
}
