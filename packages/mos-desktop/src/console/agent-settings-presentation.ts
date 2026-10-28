/**
 * The MOS AGENT SETTINGS presentation vocabulary (W38).
 *
 * The copy constants + pure presentation helpers for the Agent Settings
 * console section — the substrate's Settings page copy held verbatim
 * (captured from the substrate's own settings vocabulary: the three
 * sidebar group titles, the fourteen visible section titles, the MCP /
 * Commands / Hooks section descriptions and form labels), so the section
 * and its tests share one truth. Pure module: no imports, no state.
 */

/* --------------------------------------------------------------------
 * The settings sidebar vocabulary (the substrate's own groups + sections,
 * verbatim order — Automations stays hidden per the substrate's own law:
 * it is a workspace main view, not a settings section)
 * -------------------------------------------------------------------- */

/** The settings sidebar's group titles (the substrate's own words). */
export const MOS_SETTINGS_GROUP_BASICS = 'Basics';
export const MOS_SETTINGS_GROUP_AGENT_CAPABILITIES = 'Agent capabilities';
export const MOS_SETTINGS_GROUP_DATA_AND_STATS = 'Data and statistics';

/** One settings sidebar section entry (title + where its content lives). */
export type MosSettingsSectionId =
  | 'general'
  | 'appearance'
  | 'modelProvider'
  | 'browser'
  | 'computerUse'
  | 'shortcuts'
  | 'memory'
  | 'subagents'
  | 'plugin'
  | 'mcp'
  | 'skill'
  | 'commands'
  | 'hooks'
  | 'usage';

export interface MosSettingsSectionEntry {
  readonly id: MosSettingsSectionId;
  /** The sidebar label (the substrate's own section title, verbatim). */
  readonly label: string;
  /** The content pane's h2 heading (verbatim from the section title). */
  readonly heading: string;
  /** Where this section's content lives in the MOS console. */
  readonly kind:
    | 'records-mcp'
    | 'records-commands'
    | 'records-hooks'
    | 'emerged-model-settings'
    | 'emerged-marketplace'
    | 'honest';
  /** The honest line for the non-record sections (the substrate's own description or the emergence note). */
  readonly honestLine: string;
}

/** The settings sidebar's pinned section order (the substrate's own order, Automations hidden). */
export const MOS_SETTINGS_SECTIONS: readonly {
  readonly group: 'basics' | 'agentCapabilities' | 'dataAndStats';
  readonly title: string;
  readonly sections: readonly MosSettingsSectionEntry[];
}[] = [
  {
    group: 'basics',
    title: MOS_SETTINGS_GROUP_BASICS,
    sections: [
      {
        id: 'general',
        label: 'General',
        heading: 'General',
        kind: 'honest',
        honestLine:
          'The substrate app\'s system settings (language, notifications, updates, terminal, proxy) mount with the substrate surface — the MOS console owns its own shell.',
      },
      {
        id: 'appearance',
        label: 'Appearance',
        heading: 'Appearance',
        kind: 'honest',
        honestLine:
          'The substrate app\'s theme (system / dark / light) applies to the substrate surface — the MOS console\'s own theme toggle lives in the console Settings.',
      },
      {
        id: 'modelProvider',
        label: 'Model settings',
        heading: 'Model settings',
        kind: 'emerged-model-settings',
        honestLine:
          'The model roster emerged as a native MOS surface in W35 — the full 22-model GLM roster with per-model facts and the workspace enable state.',
      },
      {
        id: 'browser',
        label: 'Browser Use',
        heading: 'Browser Use',
        kind: 'honest',
        honestLine:
          'The agent\'s embedded-browser configuration mounts with the substrate surface — browser automation runs on the substrate account.',
      },
      {
        id: 'computerUse',
        label: 'Computer Use',
        heading: 'Computer Use',
        kind: 'honest',
        honestLine:
          'The agent\'s computer-control permission mounts with the substrate surface — desktop control runs on the substrate account.',
      },
      {
        id: 'shortcuts',
        label: 'Keyboard Shortcuts',
        heading: 'Keyboard Shortcuts',
        kind: 'honest',
        honestLine:
          'The substrate app\'s keyboard shortcuts mount with the substrate surface — the MOS console navigates through its own rail.',
      },
    ],
  },
  {
    group: 'agentCapabilities',
    title: MOS_SETTINGS_GROUP_AGENT_CAPABILITIES,
    sections: [
      {
        id: 'memory',
        label: 'Memory',
        heading: 'Memory',
        kind: 'honest',
        honestLine:
          'The agent\'s memory entries are substrate-account data — the memory viewer arrives with a connected account, never fabricated here.',
      },
      {
        id: 'subagents',
        label: 'Subagents',
        heading: 'Subagents',
        kind: 'honest',
        honestLine:
          'Subagent definitions live with the substrate workspace directory — they arrive with a connected account.',
      },
      {
        id: 'plugin',
        label: 'Plugins',
        heading: 'Plugins',
        kind: 'emerged-marketplace',
        honestLine:
          'The Plugin Marketplace emerged as a native MOS surface in W37 — the frozen official listing with workspace-record installs.',
      },
      {
        id: 'mcp',
        label: 'MCP Servers',
        heading: 'MCP Servers',
        kind: 'records-mcp',
        honestLine: 'Manage MCP server configurations used by ZCode Agent.',
      },
      {
        id: 'skill',
        label: 'Skills',
        heading: 'Skills',
        kind: 'honest',
        honestLine:
          'Manage workspace and user skills. Enabled skills can be referenced in chat with $skill-name.',
      },
      {
        id: 'commands',
        label: 'Commands',
        heading: 'Commands',
        kind: 'records-commands',
        honestLine:
          'Manage ZCode Agent .md command files. Commands can be invoked with /command-name in chat.',
      },
      {
        id: 'hooks',
        label: 'Hooks',
        heading: 'Hooks',
        kind: 'records-hooks',
        honestLine:
          'Manage task lifecycle hooks to automatically execute commands on specific events.',
      },
    ],
  },
  {
    group: 'dataAndStats',
    title: MOS_SETTINGS_GROUP_DATA_AND_STATS,
    sections: [
      {
        id: 'usage',
        label: 'Usage stats',
        heading: 'Usage stats',
        kind: 'honest',
        honestLine:
          'Usage statistics are substrate-account data — the usage panels arrive with a connected account, never fabricated here.',
      },
    ],
  },
];

/** Resolve a settings section entry by id (undefined when unknown). */
export function mosSettingsSection(id: string): MosSettingsSectionEntry | undefined {
  for (const group of MOS_SETTINGS_SECTIONS) {
    const entry = group.sections.find((section) => section.id === id);
    if (entry !== undefined) {
      return entry;
    }
  }
  return undefined;
}

/** The default active settings section (the substrate's own first section). */
export const MOS_SETTINGS_DEFAULT_SECTION: MosSettingsSectionId = 'general';

/* --------------------------------------------------------------------
 * The MCP Servers section copy (the substrate's own words, verbatim)
 * -------------------------------------------------------------------- */

/** The MCP group header (the substrate's own "Configured MCP servers"). */
export const MOS_MCP_GROUP_LOCAL = 'Configured MCP servers';

/** The MCP header's add affordance (verbatim). */
export const MOS_MCP_ADD_LABEL = 'Add MCP server';

/** The MCP list empty state (verbatim). */
export const MOS_MCP_EMPTY_TITLE = 'No MCP servers yet';
export const MOS_MCP_EMPTY_DESCRIPTION =
  'Add an MCP server to give the agent extra capabilities.';

/** The MCP form titles (verbatim). */
export const MOS_MCP_FORM_CREATE_TITLE = 'New MCP server';
export const MOS_MCP_FORM_EDIT_TITLE = 'Edit MCP server';
export const MOS_MCP_FORM_CREATE_DESCRIPTION =
  'Fill in the new MCP configuration, then save to return to the list.';
export const MOS_MCP_FORM_EDIT_DESCRIPTION =
  'Modify the current MCP configuration, then save to return to the list.';

/** The MCP form field labels (verbatim). */
export const MOS_MCP_FORM_NAME = 'Name';
export const MOS_MCP_FORM_TYPE = 'Type';
export const MOS_MCP_FORM_SCOPE = 'Scope';
export const MOS_MCP_FORM_COMMAND = 'Command';
export const MOS_MCP_FORM_ARGS = 'Arguments (space separated)';
export const MOS_MCP_FORM_ENV = 'Environment variables (optional)';
export const MOS_MCP_FORM_URL = 'URL';
export const MOS_MCP_FORM_HEADERS = 'Headers (optional)';
export const MOS_MCP_FORM_TIMEOUT = 'Timeout MS';
export const MOS_MCP_FORM_PROTOCOL = 'Protocol version';

/** The scope select's own words (the substrate's settings scope vocabulary). */
export const MOS_MCP_SCOPE_USER = 'user';
export const MOS_MCP_SCOPE_WORKSPACE = 'workspace';

/** The type select's own options (verbatim — the substrate's picker). */
export const MOS_MCP_TYPE_STDIO = 'stdio (local command)';
export const MOS_MCP_TYPE_HTTP = 'HTTP';
export const MOS_MCP_TYPE_SSE = 'SSE (Server-Sent Events)';

/** The protocol version select's own options (verbatim). */
export const MOS_MCP_PROTOCOL_AUTO = 'Auto (recommended)';
export const MOS_MCP_PROTOCOL_LEGACY = 'Legacy compatibility';
export const MOS_MCP_PROTOCOL_MODERN = 'v2';

/** The form's save action (the substrate's own Add/Save word). */
export const MOS_MCP_FORM_ADD = 'Add';
export const MOS_MCP_FORM_SAVE = 'Save';
export const MOS_MCP_FORM_BACK = 'Back';

/** The honest disconnected-status reason (the recorded state, never a live claim). */
export const MOS_MCP_STATUS_DISCONNECTED_REASON =
  'Recorded, not connected — the substrate connects this server when an account is connected';

/** The delete confirm (the substrate's own destructive copy, verbatim). */
export function mosMcpDeleteConfirm(serverName: string): string {
  return `Delete MCP server "${serverName}"? This action cannot be undone. The server configuration will be removed from the file.`;
}

/** The MCP row description line (the substrate's own format: the transport label · the endpoint). */
export function mosMcpRowDescription(
  type: string,
  command: string,
  args: readonly string[],
  url: string,
): string {
  const typeLabel = command.length > 0 ? 'stdio' : url.length > 0 ? type : type;
  if (url.length > 0) {
    return `${typeLabel} · ${url}`;
  }
  if (command.length > 0) {
    return `${typeLabel} · ${command} ${args.join(' ')}`.trim();
  }
  return typeLabel;
}

/* --------------------------------------------------------------------
 * The Commands section copy (the substrate's own words, verbatim)
 * -------------------------------------------------------------------- */

/** The user-commands group header (verbatim). */
export const MOS_COMMANDS_GROUP_LOCAL = 'User commands';

/** The plugin-commands group header (verbatim). */
export const MOS_COMMANDS_GROUP_PLUGIN = 'Plugin commands';

/** The Commands header's add affordance (verbatim). */
export const MOS_COMMANDS_ADD_LABEL = 'New';

/** The Commands list empty state (verbatim). */
export const MOS_COMMANDS_EMPTY = 'No user commands';

/** The command form titles (verbatim). */
export const MOS_COMMANDS_FORM_CREATE_TITLE = 'New command';
export const MOS_COMMANDS_FORM_EDIT_TITLE = 'Edit command';
export const MOS_COMMANDS_FORM_CREATE_DESCRIPTION =
  'Fill in the command name and prompt, then save to return to the list.';
export const MOS_COMMANDS_FORM_EDIT_DESCRIPTION =
  'Modify the command and save to return to the list.';

/** The command delete confirm (verbatim). */
export function mosCommandDeleteConfirm(commandName: string): string {
  return `Are you sure you want to delete the command "${commandName}"? This action cannot be undone.`;
}

/** The command form field labels (verbatim). */
export const MOS_COMMANDS_FORM_NAME = 'Name';
export const MOS_COMMANDS_FORM_DESCRIPTION = 'Description (optional)';
export const MOS_COMMANDS_FORM_ARGUMENT_HINT = 'Argument hint (optional)';
export const MOS_COMMANDS_FORM_PROMPT = 'Prompt';

/** The form's placeholders (verbatim). */
export const MOS_COMMANDS_NAME_PLACEHOLDER = 'my-command';
export const MOS_COMMANDS_DESCRIPTION_PLACEHOLDER =
  'Short description shown in command picker';
export const MOS_COMMANDS_ARGUMENT_PLACEHOLDER = 'e.g. <file-path>';
export const MOS_COMMANDS_PROMPT_PLACEHOLDER =
  'Write the prompt that will be sent when this command is invoked...';

/** The no-description line (verbatim). */
export const MOS_COMMANDS_NO_DESCRIPTION = 'No description';

/** The plugin-commands honest empty line. */
export const MOS_COMMANDS_PLUGIN_EMPTY =
  'No plugin commands in this workspace — the substrate syncs them from installed plugins when an account is connected.';

/* --------------------------------------------------------------------
 * The Hooks section copy (the substrate's own words, verbatim)
 * -------------------------------------------------------------------- */

/** The hooks group header (the substrate's own "Configured hooks"). */
export const MOS_HOOKS_GROUP_LOCAL = 'Configured hooks';

/** The Hooks header's add affordance (verbatim). */
export const MOS_HOOKS_ADD_LABEL = 'New hook';

/** The Hooks list empty state (verbatim). */
export const MOS_HOOKS_EMPTY = 'No hooks configured';

/** The hook form field labels (verbatim). */
export const MOS_HOOKS_FORM_EVENT = 'Event';
export const MOS_HOOKS_FORM_MATCHER = 'Matcher';
export const MOS_HOOKS_FORM_TYPE = 'Runner';
export const MOS_HOOKS_FORM_COMMAND = 'Command';
export const MOS_HOOKS_FORM_TIMEOUT = 'Timeout (seconds)';

/** The runner options (verbatim). */
export const MOS_HOOKS_TYPE_COMMAND = 'Shell command';
export const MOS_HOOKS_TYPE_PROCESS = 'Process';

/** The matcher hint (verbatim). */
export const MOS_HOOKS_MATCHER_PLACEHOLDER = 'e.g. Write, Edit, Bash';
export const MOS_HOOKS_MATCHER_HINT =
  'Leave blank to match all input for this event.';
export const MOS_HOOKS_COMMAND_PLACEHOLDER = "e.g. echo 'Hello from hook'";
export const MOS_HOOKS_TIMEOUT_HINT = 'Timeout in seconds';

/** The hook event vocabulary (the substrate's own union, pinned order). */
export const MOS_HOOK_EVENTS: readonly string[] = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
];

/** The matcher-all label (verbatim). */
export const MOS_HOOKS_MATCH_ALL = 'Match all';

/** The delete confirm (the substrate's own destructive copy, verbatim). */
export function mosHookDeleteConfirm(event: string): string {
  return `Delete the ${event} hook? This action cannot be undone.`;
}

/* --------------------------------------------------------------------
 * The emerged-surface cross-links (the honest one-hop notes)
 * -------------------------------------------------------------------- */

export const MOS_SETTINGS_MODEL_SETTINGS_LINK =
  'Model settings is a native MOS surface — open it from the Agent Workbench rail (Model Settings).';
export const MOS_SETTINGS_MARKETPLACE_LINK =
  'Plugins is a native MOS surface — open it from the Agent Workbench rail (Plugin Marketplace).';

/** The honest refresh note (the Skills section's own affordance answered honestly). */
export const MOS_SETTINGS_SKILLS_REFRESH_NOTE =
  'Skills are workspace records the substrate discovers from its workspace directory and installed plugins — there is no remote list to re-fetch in this profile.';

/** The honest New-skill note (the substrate routes skill authoring to a task). */
export const MOS_SETTINGS_SKILLS_NEW_NOTE =
  'Skill authoring runs as an agent task on the substrate — record one from New Task when the account is connected.';
