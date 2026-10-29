/**
 * The MOS console WORKSPACE RECORDS (W32): the record types the store
 * persists (missions, posts, campaigns, accounts, events, approvals),
 * the intake input shapes, the typed store error (fail-closed writes),
 * the storage adapter port, the persisted document shape + validation,
 * and the health report contract.
 *
 * Pure types + pure functions, no imports: directly consumable by the
 * node test runner through the package's built dist.
 */

import type {
  MosAdPlatformId,
  MosMissionDirection,
  MosSocialPlatformId,
} from './workspace-vocabulary.js';

/** A workspace mission (a declared objective — append-only versions). */
export interface MosWorkspaceMission {
  readonly id: string;
  readonly seq: number;
  readonly direction: MosMissionDirection;
  readonly statement: string;
  readonly metric: string;
  readonly target: string;
  readonly horizon: string;
  readonly audience: string;
  readonly constraints: string;
  /** INTENT_RECORDED → (PLANNING) — this release records intent honestly. */
  readonly status: 'INTENT_RECORDED' | 'PLANNING';
  readonly createdAt: string;
}

/** A social post record (DRAFT or SCHEDULED — PUBLISHED needs a transport). */
export interface MosWorkspacePost {
  readonly id: string;
  readonly seq: number;
  readonly platform: MosSocialPlatformId;
  readonly missionId: string | null;
  readonly content: string;
  readonly status: 'DRAFT' | 'SCHEDULED';
  readonly scheduledFor: string | null;
  readonly createdAt: string;
}

/** The campaign lifecycle (the 7-path workflow's surfaced rungs). */
export type MosCampaignStatus = 'DRAFT' | 'COMPILED' | 'ARMED' | 'HALTED';

/**
 * A paid-promotion campaign — an INTENT record with an explicit budget.
 * `counterfactual` is the Lab's SIMULATION-labeled projection; measured
 * results stay absent until a live ad transport exists (the honest-state
 * law: nothing here claims platform truth).
 */
export interface MosWorkspaceCampaign {
  readonly id: string;
  readonly seq: number;
  readonly platform: MosAdPlatformId;
  readonly objective: string;
  readonly budget: string;
  readonly dailyCap: string;
  readonly audience: string;
  readonly missionId: string | null;
  readonly status: MosCampaignStatus;
  readonly counterfactual: string | null;
  readonly measured: string | null;
  readonly createdAt: string;
}

/** A provider connection record (honest: SETUP_REQUIRED until a transport exists). */
export interface MosWorkspaceAccount {
  readonly id: string;
  readonly seq: number;
  readonly providerId: string;
  readonly status: 'SETUP_REQUIRED';
  readonly createdAt: string;
}

/** One append-only timeline event (the Activity surface's truth). */
export interface MosWorkspaceEvent {
  readonly id: string;
  readonly seq: number;
  readonly kind: string;
  readonly line: string;
  readonly at: string;
}

/** One approvals-queue record (the arm gate — a REAL human decision). */
export interface MosWorkspaceApproval {
  readonly id: string;
  readonly seq: number;
  readonly kind: 'arm-gate';
  readonly campaignId: string;
  readonly status: 'PENDING' | 'APPROVED' | 'DENIED';
  readonly decidedAt: string | null;
  readonly createdAt: string;
}

/**
 * An agent task record (W35 — the New Task page's honest write): a task
 * DRAFT composed on the emerged surface (title derived from the prompt,
 * model + mode + mission context frozen at send). The substrate runs the
 * task when an account is connected; this record is the workspace intent.
 *
 * W36 — the record grew the conversation-view facts: `followUps` (the
 * session composer's appended prompts), `updatedAt` (the list ordering
 * truth), and the pin/archive workspace decisions. The original `prompt`
 * stays the FIRST turn (pre-W36 snapshots default the new fields).
 *
 * W40 — the record grew the frozen attachment queue: the composer's
 * chips at submit, the substrate's own attachment facts verbatim (the
 * REAL local path the substrate's temp-attachment IPC wrote, the
 * clipboard-text char/line counts, the picked-path basename). Pre-W40
 * snapshots default the queue empty.
 */
export interface MosWorkspaceTask {
  readonly id: string;
  readonly seq: number;
  readonly title: string;
  readonly prompt: string;
  readonly modelId: string;
  readonly connectionMode: string;
  readonly mode: string;
  readonly planEnabled: boolean;
  readonly reasoningLevel: string;
  readonly missionId: string | null;
  readonly status: 'DRAFT';
  readonly createdAt: string;
  /** W36 — the last turn's time (defaults to createdAt pre-W36). */
  readonly updatedAt: string;
  /** W36 — the pin workspace decision (the task list's Pinned section). */
  readonly pinned: boolean;
  /** W36 — the archive workspace decision (the archived view). */
  readonly archived: boolean;
  /** W36 — the conversation's follow-up turns, oldest-first. */
  readonly followUps: readonly MosWorkspaceTaskFollowUp[];
  /** W40 — the frozen attachment queue (defaults to [] pre-W40). */
  readonly attachments: readonly MosWorkspaceTaskAttachment[];
}

/** One follow-up turn on a task's conversation (the session composer's write). */
export interface MosWorkspaceTaskFollowUp {
  readonly id: string;
  readonly prompt: string;
  readonly at: string;
}

/**
 * One frozen attachment on a task record (W40 — the composer's queue at
 * submit). The substrate's own ChatComposerAttachment facts, frozen
 * verbatim: the filename, the source kind (the substrate's closed
 * vocabulary plus the firstboot-only 'seed'), the MIME type, the byte
 * size, the clipboard-text char/line counts (null for picked paths),
 * the REAL local path the substrate's own temp-attachment IPC wrote
 * (null for the disclosed seed record), and the freeze time.
 */
export interface MosWorkspaceTaskAttachment {
  readonly filename: string;
  readonly sourceKind: 'clipboard-text' | 'picker-path' | 'seed';
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly charCount: number | null;
  readonly lineCount: number | null;
  readonly localPath: string | null;
  readonly addedAt: string;
}

/**
 * A scheduled agent task (W36 — the Automations surface's record, the
 * substrate's ZCodeAutomation adapted to the workspace-intent law): the
 * schedule + prompt + lifecycle are THIS store's workspace truth; no run
 * dispatches without the substrate account, so `runCount` stays the
 * honest zero until a real dispatch exists and `nextRunAt` is schedule
 * math (an intent), never platform truth.
 */
export interface MosWorkspaceAutomation {
  readonly id: string;
  readonly seq: number;
  readonly title: string;
  readonly prompt: string;
  /** The cron expression record (schedule math truth). */
  readonly cronExpr: string;
  /** The human schedule line the card badge renders ("Every weekday at 9:00 AM"). */
  readonly schedule: string;
  /** active | paused are the workspace decisions this store can make honestly. */
  readonly lifecycleStatus: 'active' | 'paused' | 'completed' | 'failed';
  readonly runCount: number;
  /** The next scheduled run (schedule math; null when paused/no recurrence). */
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The Automations workspace settings (W36): the keep-awake record. */
export interface MosWorkspaceAutomationSettings {
  readonly keepAwake: boolean;
}

/**
 * The model-list workspace settings (W35): the DISABLED model ids (absent
 * = every catalog model enabled — the honest default that keeps the full
 * roster visible). Enable state is a workspace record, never provider
 * truth.
 */
export interface MosWorkspaceModelSettings {
  readonly disabledModelIds: readonly string[];
}

/**
 * One installed marketplace plugin record (W37): the workspace's plugin
 * inventory decision. The catalog id must resolve against the frozen
 * marketplace catalog; the substrate syncs the skills/MCP servers when
 * an account is connected — the record itself never claims execution.
 */
export interface MosWorkspaceMarketplacePlugin {
  /** The catalog plugin id (`{slug}@{marketplace}` — the store's own vocabulary). */
  readonly pluginId: string;
  /** The catalog display name at install time (the receipt basis). */
  readonly name: string;
  readonly installedAt: string;
}

/**
 * One configured MCP server record (W38): the Agent Settings hub's MCP
 * Servers section write. The record carries the substrate's own config
 * vocabulary (stdio command/args/env or http-family url/headers, the
 * user/workspace storage level, the optional timeout + protocol version);
 * the substrate connects the server when an account is connected — the
 * record itself never claims a live connection.
 */
export interface MosWorkspaceMcpServer {
  readonly id: string;
  readonly seq: number;
  /** The server name (the row's identity; unique across the list). */
  readonly name: string;
  /** The storage level — 'user' or 'workspace' (the scope badge truth). */
  readonly storageLevel: 'user' | 'workspace';
  /** The transport family — stdio or one of the http-family types. */
  readonly type: 'stdio' | 'http' | 'sse' | 'streamableHttp';
  /** stdio: the executable command. */
  readonly command: string;
  /** stdio: the space-separated arguments (stored split). */
  readonly args: readonly string[];
  /** stdio: the env JSON text (validated on write; stored verbatim). */
  readonly envJson: string;
  /** http family: the server URL. */
  readonly url: string;
  /** http family: the headers JSON text (validated on write; stored verbatim). */
  readonly headersJson: string;
  /** The optional timeout in milliseconds. */
  readonly timeoutMs: number | null;
  /** The protocol version preference ('' = auto). */
  readonly protocolVersion: string;
  /** The enabled state (the row switch). */
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One user command record (W38): the Agent Settings hub's Commands section
 * write — the substrate's custom slash-command shape (name, description,
 * argument hint, prompt). The substrate reads commands from the workspace
 * directory; here the workspace record IS the directory entry's honest
 * mirror (the substrate syncs when an account is connected).
 */
export interface MosWorkspaceUserCommand {
  readonly id: string;
  readonly seq: number;
  /** The command name (slash-invoked; unique across the list). */
  readonly name: string;
  readonly description: string;
  readonly argumentHint: string;
  /** The prompt the command expands to. */
  readonly prompt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One hook record (W38): the Agent Settings hub's Hooks section write —
 * the substrate's hook shape (event, optional matcher, the command/process
 * runner, the optional timeout). The substrate executes hooks on real
 * events; the workspace record is the configuration the substrate reads
 * when an account is connected.
 */
export interface MosWorkspaceHook {
  readonly id: string;
  readonly seq: number;
  /** The hook event (the substrate's own event vocabulary). */
  readonly event: 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PermissionRequest' | 'PostToolUse' | 'PostToolUseFailure' | 'Stop';
  /** The optional tool matcher (blank = match all input for the event). */
  readonly matcher: string;
  /** The runner type — shell command or process. */
  readonly type: 'command' | 'process';
  /** The command text. */
  readonly command: string;
  /** The optional timeout in seconds. */
  readonly timeoutSeconds: number | null;
  /** The enabled state (the row switch). */
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The whole store snapshot (rebuilt on every change; sections are pure). */
export interface MosWorkspaceSnapshot {
  readonly missions: readonly MosWorkspaceMission[];
  readonly posts: readonly MosWorkspacePost[];
  readonly campaigns: readonly MosWorkspaceCampaign[];
  readonly accounts: readonly MosWorkspaceAccount[];
  readonly events: readonly MosWorkspaceEvent[];
  readonly approvals: readonly MosWorkspaceApproval[];
  readonly tasks: readonly MosWorkspaceTask[];
  readonly modelSettings: MosWorkspaceModelSettings;
  /** W36 — the scheduled agent tasks + the Automations settings. */
  readonly automations: readonly MosWorkspaceAutomation[];
  readonly automationSettings: MosWorkspaceAutomationSettings;
  /** W37 — the installed marketplace plugin inventory (workspace decisions). */
  readonly marketplacePlugins: readonly MosWorkspaceMarketplacePlugin[];
  /** W38 — the Agent Settings hub's configured MCP servers. */
  readonly mcpServers: readonly MosWorkspaceMcpServer[];
  /** W38 — the Agent Settings hub's user commands. */
  readonly userCommands: readonly MosWorkspaceUserCommand[];
  /** W38 — the Agent Settings hub's hooks. */
  readonly hooks: readonly MosWorkspaceHook[];
  /** W39 — the Browser surface's session record (null = no URL confirmed yet). */
  readonly browserSession: MosWorkspaceBrowserSession | null;
}

/**
 * The browser session record (W39): the emerged Browser surface's
 * persisted state — the last confirmed URL. The substrate's human tab
 * persists its restorable URL the same way; here the workspace record IS
 * the restorable state (the pane re-enters to it). It is a navigation
 * fact, never capability truth — the substrate account is not involved.
 */
export interface MosWorkspaceBrowserSession {
  /** The last confirmed URL (about:blank never records). */
  readonly url: string;
  readonly firstSeenAt: string;
  readonly updatedAt: string;
}

/* --------------------------------------------------------------------
 * Inputs + typed errors (fail-closed writes)
 * -------------------------------------------------------------------- */

export interface MosMissionIntakeInput {
  readonly direction: string;
  readonly statement: string;
  readonly metric: string;
  readonly target: string;
  readonly horizon: string;
  readonly audience: string;
  readonly constraints: string;
}

export interface MosPostComposerInput {
  readonly platform: string;
  readonly missionId: string | null;
  readonly content: string;
  readonly scheduledFor: string | null;
}

export interface MosCampaignIntakeInput {
  readonly platform: string;
  readonly objective: string;
  readonly budget: string;
  readonly dailyCap: string;
  readonly audience: string;
  readonly missionId: string | null;
}

/** The New Task page's composer submit (W35 — the emerged surface's write). */
export interface MosAgentTaskIntakeInput {
  readonly title: string;
  readonly prompt: string;
  readonly modelId: string;
  readonly connectionMode: string;
  readonly mode: string;
  readonly planEnabled: boolean;
  readonly reasoningLevel: string;
  readonly missionId: string | null;
  /** W40 — the composer's attachment queue at submit (frozen on the record). */
  readonly attachments: readonly MosAgentTaskIntakeAttachmentInput[];
}

/** One queued attachment on the submit's intake (the draft chip minus the id; 'seed' is firstboot-only). */
export interface MosAgentTaskIntakeAttachmentInput {
  readonly filename: string;
  readonly sourceKind: 'clipboard-text' | 'picker-path';
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly charCount: number | null;
  readonly lineCount: number | null;
  readonly localPath: string | null;
}

/** The MCP server upsert input (W38 — id null = create). */
export interface MosMcpServerInput {
  readonly id: string | null;
  readonly name: string;
  readonly storageLevel: 'user' | 'workspace';
  readonly type: 'stdio' | 'http' | 'sse' | 'streamableHttp';
  readonly command: string;
  readonly args: string;
  readonly envJson: string;
  readonly url: string;
  readonly headersJson: string;
  readonly timeoutMs: string;
  readonly protocolVersion: string;
}

/** The user command upsert input (W38 — id null = create). */
export interface MosUserCommandInput {
  readonly id: string | null;
  readonly name: string;
  readonly description: string;
  readonly argumentHint: string;
  readonly prompt: string;
}

/** The hook upsert input (W38 — id null = create). */
export interface MosHookInput {
  readonly id: string | null;
  readonly event: MosWorkspaceHook['event'];
  readonly matcher: string;
  readonly type: 'command' | 'process';
  readonly command: string;
  readonly timeoutSeconds: string;
}

/** The typed store error (fail-closed: state unchanged when thrown). */
export class MosWorkspaceStoreError extends Error {
  readonly kind: 'validation' | 'not-found' | 'storage';
  constructor(kind: 'validation' | 'not-found' | 'storage', message: string) {
    super(message);
    this.name = 'MosWorkspaceStoreError';
    this.kind = kind;
  }
}

/* --------------------------------------------------------------------
 * The storage adapter (localStorage in the renderer; a map in tests)
 * -------------------------------------------------------------------- */

export interface MosWorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The localStorage key (one schema version; bump = new key). */
export const MOS_WORKSPACE_STORE_KEY = 'mos.workspace.v1';

/** The honest durability fact (rendered verbatim in the footer + settings). */
export const MOS_WORKSPACE_DURABILITY_FACT =
  'BROWSER_PROFILE — the workspace records live in this desktop profile\'s local storage; they are intent records, never platform truth.';

/* --------------------------------------------------------------------
 * The persisted shape + validation
 * -------------------------------------------------------------------- */

export interface MosWorkspacePersisted {
  readonly schema: 1;
  readonly nextSeq: number;
  readonly missions: readonly MosWorkspaceMission[];
  readonly posts: readonly MosWorkspacePost[];
  readonly campaigns: readonly MosWorkspaceCampaign[];
  readonly accounts: readonly MosWorkspaceAccount[];
  readonly events: readonly MosWorkspaceEvent[];
  readonly approvals: readonly MosWorkspaceApproval[];
  /** W35 fields — absent in pre-W35 v1 snapshots; validation defaults them. */
  readonly tasks: readonly MosWorkspaceTask[];
  readonly modelSettings: MosWorkspaceModelSettings;
  /** W36 fields — absent in pre-W36 v1 snapshots; validation defaults them. */
  readonly automations: readonly MosWorkspaceAutomation[];
  readonly automationSettings: MosWorkspaceAutomationSettings;
  /** W37 fields — absent in pre-W37 v1 snapshots; validation defaults them. */
  readonly marketplacePlugins: readonly MosWorkspaceMarketplacePlugin[];
  /** W38 fields — absent in pre-W38 v1 snapshots; validation defaults them. */
  readonly mcpServers: readonly MosWorkspaceMcpServer[];
  readonly userCommands: readonly MosWorkspaceUserCommand[];
  readonly hooks: readonly MosWorkspaceHook[];
  /** W39 field — absent in pre-W39 v1 snapshots; validation defaults it to null. */
  readonly browserSession: MosWorkspaceBrowserSession | null;
}

const EMPTY_PERSISTED: MosWorkspacePersisted = {
  schema: 1,
  nextSeq: 1,
  missions: [],
  posts: [],
  campaigns: [],
  accounts: [],
  events: [],
  approvals: [],
  tasks: [],
  modelSettings: { disabledModelIds: [] },
  automations: [],
  automationSettings: { keepAwake: false },
  marketplacePlugins: [],
  mcpServers: [],
  userCommands: [],
  hooks: [],
  browserSession: null,
};

/** @internal The empty document (the quarantined store's fail-closed start). */
export function emptyMosWorkspacePersisted(): MosWorkspacePersisted {
  return EMPTY_PERSISTED;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TASK_ATTACHMENT_SOURCE_KINDS: readonly string[] = ['clipboard-text', 'picker-path', 'seed'];

/** W40 — the attachments field's structural law (each entry: closed sourceKind vocabulary, non-negative integers, path-or-null). */
function isValidTaskAttachments(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    if (typeof entry.filename !== 'string' || entry.filename.length === 0) {
      return false;
    }
    if (typeof entry.sourceKind !== 'string' || !TASK_ATTACHMENT_SOURCE_KINDS.includes(entry.sourceKind)) {
      return false;
    }
    if (typeof entry.mimeType !== 'string' || entry.mimeType.length === 0) {
      return false;
    }
    if (typeof entry.sizeBytes !== 'number' || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
      return false;
    }
    if (entry.charCount !== null && (typeof entry.charCount !== 'number' || !Number.isSafeInteger(entry.charCount) || entry.charCount < 0)) {
      return false;
    }
    if (entry.lineCount !== null && (typeof entry.lineCount !== 'number' || !Number.isSafeInteger(entry.lineCount) || entry.lineCount < 0)) {
      return false;
    }
    if (entry.localPath !== null && (typeof entry.localPath !== 'string' || entry.localPath.length === 0)) {
      return false;
    }
    return typeof entry.addedAt === 'string';
  });
}

/** Shape validation: every persisted record must be structurally sound. */
export function validateMosWorkspacePersisted(value: unknown): MosWorkspacePersisted {
  if (!isRecord(value) || value.schema !== 1 || typeof value.nextSeq !== 'number') {
    throw new Error('workspace snapshot is not a v1 document');
  }
  const arrayFields = ['missions', 'posts', 'campaigns', 'accounts', 'events', 'approvals'] as const;
  for (const field of arrayFields) {
    const list = value[field];
    if (!Array.isArray(list) || list.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.seq !== 'number')) {
      throw new Error(`workspace snapshot field "${field}" is malformed`);
    }
  }
  // W35 back-compat: pre-W35 v1 snapshots carry no tasks/modelSettings —
  // absent fields default honestly (no tasks; every model enabled); a
  // PRESENT-but-malformed field still fails closed.
  if (
    value.tasks !== undefined &&
    (!Array.isArray(value.tasks) ||
      value.tasks.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.seq !== 'number'))
  ) {
    throw new Error('workspace snapshot field "tasks" is malformed');
  }
  if (
    value.modelSettings !== undefined &&
    (!isRecord(value.modelSettings) ||
      !Array.isArray(value.modelSettings.disabledModelIds) ||
      value.modelSettings.disabledModelIds.some((entry) => typeof entry !== 'string'))
  ) {
    throw new Error('workspace snapshot field "modelSettings" is malformed');
  }
  // W36 back-compat: pre-W36 tasks carry no updatedAt/pinned/archived/
  // followUps — absent fields default honestly (updatedAt = createdAt,
  // unpinned, unarchived, no follow-ups); a PRESENT-but-malformed field
  // still fails closed.
  if (Array.isArray(value.tasks)) {
    for (const task of value.tasks) {
      if (!isRecord(task)) continue;
      if (task.updatedAt !== undefined && typeof task.updatedAt !== 'string') {
        throw new Error('workspace snapshot field "tasks" is malformed (updatedAt)');
      }
      if (task.pinned !== undefined && typeof task.pinned !== 'boolean') {
        throw new Error('workspace snapshot field "tasks" is malformed (pinned)');
      }
      if (task.archived !== undefined && typeof task.archived !== 'boolean') {
        throw new Error('workspace snapshot field "tasks" is malformed (archived)');
      }
      if (
        task.followUps !== undefined &&
        (!Array.isArray(task.followUps) ||
          task.followUps.some(
            (entry) => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.prompt !== 'string' || typeof entry.at !== 'string',
          ))
      ) {
        throw new Error('workspace snapshot field "tasks" is malformed (followUps)');
      }
      // W40 back-compat: pre-W40 tasks carry no attachments — absent
      // defaults to [] (no frozen queue); a PRESENT-but-malformed field
      // still fails closed.
      if (task.attachments !== undefined && !isValidTaskAttachments(task.attachments)) {
        throw new Error('workspace snapshot field "tasks" is malformed (attachments)');
      }
    }
  }
  if (
    value.automations !== undefined &&
    (!Array.isArray(value.automations) ||
      value.automations.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.id !== 'string' ||
          typeof entry.seq !== 'number' ||
          typeof entry.title !== 'string' ||
          typeof entry.prompt !== 'string' ||
          typeof entry.cronExpr !== 'string' ||
          typeof entry.schedule !== 'string' ||
          typeof entry.lifecycleStatus !== 'string' ||
          typeof entry.runCount !== 'number' ||
          typeof entry.createdAt !== 'string' ||
          typeof entry.updatedAt !== 'string',
      ))
  ) {
    throw new Error('workspace snapshot field "automations" is malformed');
  }
  if (
    value.automationSettings !== undefined &&
    (!isRecord(value.automationSettings) || typeof value.automationSettings.keepAwake !== 'boolean')
  ) {
    throw new Error('workspace snapshot field "automationSettings" is malformed');
  }
  // W37 back-compat: pre-W37 v1 snapshots carry no marketplacePlugins —
  // the absent field defaults to an empty inventory; a PRESENT-but-
  // malformed field still fails closed. Every record's pluginId must be
  // a non-empty string (catalog resolution is the store's write-time
  // law; the validator only pins the persisted shape).
  if (
    value.marketplacePlugins !== undefined &&
    (!Array.isArray(value.marketplacePlugins) ||
      value.marketplacePlugins.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.pluginId !== 'string' ||
          entry.pluginId.length === 0 ||
          typeof entry.name !== 'string' ||
          typeof entry.installedAt !== 'string',
      ))
  ) {
    throw new Error('workspace snapshot field "marketplacePlugins" is malformed');
  }
  // W38 back-compat: pre-W38 v1 snapshots carry no mcpServers/userCommands/
  // hooks — the absent fields default to empty lists; a PRESENT-but-
  // malformed field still fails closed.
  if (
    value.mcpServers !== undefined &&
    (!Array.isArray(value.mcpServers) ||
      value.mcpServers.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.id !== 'string' ||
          typeof entry.seq !== 'number' ||
          typeof entry.name !== 'string' ||
          (entry.storageLevel !== 'user' && entry.storageLevel !== 'workspace') ||
          typeof entry.type !== 'string' ||
          typeof entry.command !== 'string' ||
          !Array.isArray(entry.args) ||
          typeof entry.envJson !== 'string' ||
          typeof entry.url !== 'string' ||
          typeof entry.headersJson !== 'string' ||
          typeof entry.protocolVersion !== 'string' ||
          typeof entry.enabled !== 'boolean' ||
          typeof entry.createdAt !== 'string' ||
          typeof entry.updatedAt !== 'string',
      ))
  ) {
    throw new Error('workspace snapshot field "mcpServers" is malformed');
  }
  if (
    value.userCommands !== undefined &&
    (!Array.isArray(value.userCommands) ||
      value.userCommands.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.id !== 'string' ||
          typeof entry.seq !== 'number' ||
          typeof entry.name !== 'string' ||
          typeof entry.description !== 'string' ||
          typeof entry.argumentHint !== 'string' ||
          typeof entry.prompt !== 'string' ||
          typeof entry.createdAt !== 'string' ||
          typeof entry.updatedAt !== 'string',
      ))
  ) {
    throw new Error('workspace snapshot field "userCommands" is malformed');
  }
  if (
    value.hooks !== undefined &&
    (!Array.isArray(value.hooks) ||
      value.hooks.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.id !== 'string' ||
          typeof entry.seq !== 'number' ||
          typeof entry.event !== 'string' ||
          typeof entry.matcher !== 'string' ||
          (entry.type !== 'command' && entry.type !== 'process') ||
          typeof entry.command !== 'string' ||
          typeof entry.enabled !== 'boolean' ||
          typeof entry.createdAt !== 'string' ||
          typeof entry.updatedAt !== 'string',
      ))
  ) {
    throw new Error('workspace snapshot field "hooks" is malformed');
  }
  // W39 back-compat: pre-W39 snapshots carry no browserSession — absent
  // defaults to null (no URL confirmed); a PRESENT-but-malformed field
  // still fails closed.
  if (
    value.browserSession !== undefined &&
    value.browserSession !== null &&
    (!isRecord(value.browserSession) ||
      typeof value.browserSession.url !== 'string' ||
      typeof value.browserSession.updatedAt !== 'string' ||
      (value.browserSession.firstSeenAt !== undefined &&
        typeof value.browserSession.firstSeenAt !== 'string'))
  ) {
    throw new Error('workspace snapshot field "browserSession" is malformed');
  }
  const tasks = (value.tasks === undefined ? [] : (value.tasks as unknown as MosWorkspaceTask[])).map(
    (task) => ({
      ...task,
      updatedAt: task.updatedAt ?? task.createdAt,
      pinned: task.pinned ?? false,
      archived: task.archived ?? false,
      followUps: task.followUps ?? [],
      attachments: task.attachments ?? [],
    }),
  );
  return {
    ...(value as unknown as MosWorkspacePersisted),
    tasks,
    modelSettings:
      value.modelSettings === undefined
        ? { disabledModelIds: [] }
        : (value.modelSettings as unknown as MosWorkspaceModelSettings),
    automations:
      value.automations === undefined ? [] : (value.automations as unknown as MosWorkspaceAutomation[]),
    automationSettings:
      value.automationSettings === undefined
        ? { keepAwake: false }
        : (value.automationSettings as unknown as MosWorkspaceAutomationSettings),
    marketplacePlugins:
      value.marketplacePlugins === undefined
        ? []
        : (value.marketplacePlugins as unknown as MosWorkspaceMarketplacePlugin[]),
    mcpServers:
      value.mcpServers === undefined ? [] : (value.mcpServers as unknown as MosWorkspaceMcpServer[]),
    userCommands:
      value.userCommands === undefined ? [] : (value.userCommands as unknown as MosWorkspaceUserCommand[]),
    hooks: value.hooks === undefined ? [] : (value.hooks as unknown as MosWorkspaceHook[]),
    browserSession:
      value.browserSession === undefined || value.browserSession === null
        ? null
        : (value.browserSession as unknown as MosWorkspaceBrowserSession),
  };
}

/* --------------------------------------------------------------------
 * The health report
 * -------------------------------------------------------------------- */

/** The store's health report (surfaced in Settings — quarantines shown, never dropped). */
export interface MosWorkspaceStoreHealth {
  readonly durability: 'BROWSER_PROFILE';
  readonly key: string;
  readonly missionCount: number;
  readonly postCount: number;
  readonly campaignCount: number;
  readonly eventCount: number;
  readonly taskCount: number;
  /** W36 — the scheduled agent tasks count. */
  readonly automationCount: number;
  /** W37 — the installed marketplace plugin count. */
  readonly marketplacePluginCount: number;
  /** W38 — the Agent Settings hub's record counts. */
  readonly mcpServerCount: number;
  readonly userCommandCount: number;
  readonly hookCount: number;
  /** W39 — whether the Browser surface's URL record exists. */
  readonly browserUrlRecorded: boolean;
  /** W40 — the frozen task-attachment records count (across all tasks). */
  readonly taskAttachmentCount: number;
  readonly quarantinedCount: number;
}

/** One quarantined snapshot entry (surfaced verbatim; never silently dropped). */
export interface MosWorkspaceQuarantineEntry {
  readonly at: string;
  readonly reason: string;
  readonly rawExcerpt: string;
}

/* --------------------------------------------------------------------
 * The store contract (the creation function lives in workspace-store.ts)
 * -------------------------------------------------------------------- */

export interface MosWorkspaceStoreOptions {
  readonly storage?: MosWorkspaceStorage;
  readonly clock?: () => string;
  /** First-boot seed (default true; tests disable or supply their own). */
  readonly seed?: boolean;
}

export interface MosWorkspaceStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): MosWorkspaceSnapshot;
  recordMissionIntent(input: MosMissionIntakeInput, now?: string): MosWorkspaceMission;
  recordPostDraft(input: MosPostComposerInput, now?: string): MosWorkspacePost;
  schedulePost(id: string, scheduledFor: string, now?: string): MosWorkspacePost;
  recordCampaignDraft(input: MosCampaignIntakeInput, now?: string): MosWorkspaceCampaign;
  compileCampaign(id: string, now?: string): MosWorkspaceCampaign;
  decideApproval(id: string, decision: 'approve' | 'deny', now?: string): MosWorkspaceApproval;
  beginProviderSetup(providerId: string, now?: string): MosWorkspaceAccount;
  recordAgentTask(input: MosAgentTaskIntakeInput, now?: string): MosWorkspaceTask;
  setModelDisabled(modelId: string, disabled: boolean, now?: string): MosWorkspaceModelSettings;
  /** W36 — the task list + conversation workspace decisions. */
  setTaskPinned(id: string, pinned: boolean, now?: string): MosWorkspaceTask;
  setTaskArchived(id: string, archived: boolean, now?: string): MosWorkspaceTask;
  renameTask(id: string, title: string, now?: string): MosWorkspaceTask;
  appendTaskFollowUp(id: string, prompt: string, now?: string): MosWorkspaceTask;
  /** W36 — the Automations workspace records. */
  setAutomationPaused(id: string, paused: boolean, now?: string): MosWorkspaceAutomation;
  requestAutomationRun(id: string, now?: string): MosWorkspaceAutomation;
  deleteAutomation(id: string, now?: string): MosWorkspaceAutomation;
  setAutomationKeepAwake(enabled: boolean, now?: string): MosWorkspaceAutomationSettings;
  /** W37 — the marketplace plugin inventory workspace decisions. */
  installMarketplacePlugin(pluginId: string, now?: string): MosWorkspaceMarketplacePlugin;
  uninstallMarketplacePlugin(pluginId: string, now?: string): MosWorkspaceMarketplacePlugin;
  /** W38 — the Agent Settings hub's MCP server workspace records. */
  upsertMcpServer(input: MosMcpServerInput, now?: string): MosWorkspaceMcpServer;
  deleteMcpServer(id: string, now?: string): MosWorkspaceMcpServer;
  setMcpServerEnabled(id: string, enabled: boolean, now?: string): MosWorkspaceMcpServer;
  /** W38 — the Agent Settings hub's user command workspace records. */
  upsertUserCommand(input: MosUserCommandInput, now?: string): MosWorkspaceUserCommand;
  deleteUserCommand(id: string, now?: string): MosWorkspaceUserCommand;
  /** W38 — the Agent Settings hub's hook workspace records. */
  upsertHook(input: MosHookInput, now?: string): MosWorkspaceHook;
  deleteHook(id: string, now?: string): MosWorkspaceHook;
  setHookEnabled(id: string, enabled: boolean, now?: string): MosWorkspaceHook;
  /** W39 — the Browser surface's session record (the last confirmed URL). */
  recordBrowserUrl(url: string, now?: string): MosWorkspaceBrowserSession;
  clearBrowserUrl(now?: string): MosWorkspaceBrowserSession | null;
  health(): MosWorkspaceStoreHealth;
  quarantineEntries(): readonly MosWorkspaceQuarantineEntry[];
}
