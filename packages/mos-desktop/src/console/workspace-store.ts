/**
 * The MOS console WORKSPACE STORE (W32 — the payswap-3.0
 * browserWorkspaceStore law adapted to MOS's domain).
 *
 * WHAT THIS STORE HOLDS: demand-side workspace INTENT records only —
 * missions (declared objectives), social post drafts/schedules, ad
 * campaign drafts and their lifecycle verdicts, provider connection
 * records, the append-only event timeline, and the approvals queue. It
 * NEVER holds platform truth (no fabricated analytics, no invented
 * spend), NEVER authorization (the arm gate is a workspace decision
 * record, not a live ad-platform state), and NEVER capability state
 * (capability verdicts come from the frozen provider profiles — see
 * workspace-vocabulary.ts).
 *
 * DURABILITY: BROWSER_PROFILE — the records persist to this desktop
 * profile's localStorage under `mos.workspace.v1`. A snapshot that fails
 * validation is QUARANTINED (the raw excerpt kept, surfaced in the health
 * report — never silently dropped) and the store starts EMPTY: fail
 * closed, never guessed. Writes are FAIL-CLOSED: an invalid record or a
 * storage failure leaves the state unchanged and reports the typed error.
 *
 * The vocabulary, the record types, the validation helpers and the
 * first-boot records live in their own modules; this module re-exports
 * them as the one surface the console consumes.
 */

import { MOS_PROVIDER_CATALOGUE } from './workspace-vocabulary.js';
import {
  MOS_WORKSPACE_STORE_KEY,
  MosWorkspaceStoreError,
  emptyMosWorkspacePersisted,
  validateMosWorkspacePersisted,
  type MosAgentTaskIntakeInput,
  type MosCampaignIntakeInput,
  type MosHookInput,
  type MosMissionIntakeInput,
  type MosMcpServerInput,
  type MosPostComposerInput,
  type MosUserCommandInput,
  type MosWorkspaceAccount,
  type MosWorkspaceApproval,
  type MosWorkspaceAutomation,
  type MosWorkspaceAutomationSettings,
  type MosWorkspaceCampaign,
  type MosWorkspaceHook,
  type MosWorkspaceMarketplacePlugin,
  type MosWorkspaceMcpServer,
  type MosWorkspaceMission,
  type MosWorkspaceModelSettings,
  type MosWorkspacePersisted,
  type MosWorkspacePost,
  type MosWorkspaceQuarantineEntry,
  type MosWorkspaceSnapshot,
  type MosWorkspaceStorage,
  type MosWorkspaceStore,
  type MosWorkspaceStoreOptions,
  type MosWorkspaceTask,
  type MosWorkspaceUserCommand,
} from './workspace-records.js';
import { mosAgentModel, mosModelConnectionMode } from './model-catalog.js';
import { mosMarketplacePluginById } from './marketplace-catalog.js';
import { MOS_HOOK_EVENTS } from './agent-settings-presentation.js';

/** The hook event ids as a set (fail-closed write validation). */
const HOOK_EVENT_IDS: ReadonlySet<string> = new Set<string>(MOS_HOOK_EVENTS);
import { mosNewTaskMode } from './new-task-draft.js';
import { mosWorkspaceFirstbootRecords } from './workspace-firstboot.js';
import {
  requireAdPlatform,
  requireDirection,
  requireMetric,
  requirePositiveAmount,
  requireSocialPlatform,
  requireStatement,
} from './workspace-validation.js';

// ---- The one surface the console consumes (the seam re-exports) ----
export * from './workspace-vocabulary.js';
export * from './workspace-records.js';
export * from './workspace-validation.js';

function defaultStorage(): MosWorkspaceStorage {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (storage === undefined) {
    throw new MosWorkspaceStoreError(
      'storage',
      'no localStorage is available in this environment — pass an explicit storage adapter',
    );
  }
  return storage;
}

/** Create the workspace store (see the module header for the law). */
export function createMosWorkspaceStore(options: MosWorkspaceStoreOptions = {}): MosWorkspaceStore {
  const storage = options.storage ?? defaultStorage();
  const clock = options.clock ?? (() => new Date().toISOString());
  const listeners = new Set<() => void>();
  const quarantined: MosWorkspaceQuarantineEntry[] = [];
  let state: MosWorkspacePersisted = emptyMosWorkspacePersisted();

  // LOAD: absent key → the first-boot records; corrupt snapshot →
  // quarantine + EMPTY start (fail closed — the records are NOT guessed
  // back, and a quarantined store never re-seeds).
  const raw = storage.getItem(MOS_WORKSPACE_STORE_KEY);
  if (raw === null) {
    state = options.seed === false ? emptyMosWorkspacePersisted() : mosWorkspaceFirstbootRecords();
    persist();
  } else {
    try {
      state = validateMosWorkspacePersisted(JSON.parse(raw) as unknown);
    } catch (error) {
      quarantined.push({
        at: clock(),
        reason: `snapshot failed validation: ${error instanceof Error ? error.message : String(error)}`,
        rawExcerpt: raw.slice(0, 240),
      });
      state = emptyMosWorkspacePersisted();
    }
  }

  function persist(): void {
    try {
      storage.setItem(MOS_WORKSPACE_STORE_KEY, JSON.stringify(state));
    } catch (error) {
      throw new MosWorkspaceStoreError(
        'storage',
        `the workspace could not persist: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function notify(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function nextId(prefix: string): { id: string; seq: number } {
    const seq = state.nextSeq;
    state = { ...state, nextSeq: seq + 1 };
    return { id: `${prefix}-${String(seq).padStart(3, '0')}`, seq };
  }

  function appendEvent(kind: string, line: string, at: string): void {
    const { id, seq } = nextId('evt');
    state = { ...state, events: [...state.events, { id, seq, kind, line, at }] };
  }

  /**
   * The write transaction: run the mutations, persist + notify ONLY when
   * the state actually changed (a no-op write notifies nobody), and hand
   * the mutation's return value back typed.
   */
  function commit<T>(mutations: () => T): T {
    const before = JSON.stringify(state);
    const result = mutations();
    if (JSON.stringify(state) !== before) {
      persist();
      notify();
    }
    return result;
  }

  function missionById(id: string): MosWorkspaceMission {
    const mission = state.missions.find((entry) => entry.id === id);
    if (mission === undefined) {
      throw new MosWorkspaceStoreError('not-found', `no mission ${id} exists in this workspace`);
    }
    return mission;
  }

  function campaignById(id: string): MosWorkspaceCampaign {
    const campaign = state.campaigns.find((entry) => entry.id === id);
    if (campaign === undefined) {
      throw new MosWorkspaceStoreError('not-found', `no campaign ${id} exists in this workspace`);
    }
    return campaign;
  }

  function taskById(id: string): MosWorkspaceTask {
    const task = state.tasks.find((entry) => entry.id === id);
    if (task === undefined) {
      throw new MosWorkspaceStoreError('not-found', `no task ${id} exists in this workspace`);
    }
    return task;
  }

  function automationById(id: string): MosWorkspaceAutomation {
    const automation = state.automations.find((entry) => entry.id === id);
    if (automation === undefined) {
      throw new MosWorkspaceStoreError('not-found', `no automation ${id} exists in this workspace`);
    }
    return automation;
  }

  const store: MosWorkspaceStore = {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): MosWorkspaceSnapshot {
      return {
        missions: [...state.missions].sort((a, b) => b.seq - a.seq),
        posts: [...state.posts].sort((a, b) => b.seq - a.seq),
        campaigns: [...state.campaigns].sort((a, b) => b.seq - a.seq),
        accounts: [...state.accounts].sort((a, b) => b.seq - a.seq),
        // Timeline reads oldest-first (the append-only ledger reads forward).
        events: [...state.events].sort((a, b) => a.seq - b.seq).slice(-60),
        approvals: [...state.approvals].sort((a, b) => b.seq - a.seq),
        tasks: [...state.tasks].sort((a, b) => b.seq - a.seq),
        modelSettings: state.modelSettings,
        automations: [...state.automations].sort((a, b) => b.seq - a.seq),
        automationSettings: state.automationSettings,
        marketplacePlugins: [...state.marketplacePlugins].sort(
          (a, b) => (a.installedAt < b.installedAt ? 1 : a.installedAt > b.installedAt ? -1 : a.pluginId < b.pluginId ? -1 : 1),
        ),
        mcpServers: [...state.mcpServers].sort((a, b) => a.name.localeCompare(b.name)),
        userCommands: [...state.userCommands].sort((a, b) => a.name.localeCompare(b.name)),
        hooks: [...state.hooks].sort((a, b) => a.seq - b.seq),
      };
    },

    recordMissionIntent(input: MosMissionIntakeInput, now?: string): MosWorkspaceMission {
      const at = now ?? clock();
      const statement = requireStatement(input.statement);
      const direction = requireDirection(input.direction);
      const metric = requireMetric(input.metric);
      if (input.target.trim().length === 0) {
        throw new MosWorkspaceStoreError('validation', 'the target is required — a mission without a target cannot be evaluated');
      }
      return commit((): MosWorkspaceMission => {
        const { id, seq } = nextId('mis');
        const mission: MosWorkspaceMission = {
          id,
          seq,
          direction,
          statement,
          metric,
          target: input.target.trim(),
          horizon: input.horizon.trim(),
          audience: input.audience.trim(),
          constraints: input.constraints.trim(),
          status: 'INTENT_RECORDED',
          createdAt: at,
        };
        state = { ...state, missions: [...state.missions, mission] };
        appendEvent('mission-intent-recorded', `Mission declared — "${statement}" (${direction}, reward metric: ${metric})`, at);
        return mission;
      });
    },

    recordPostDraft(input: MosPostComposerInput, now?: string): MosWorkspacePost {
      const at = now ?? clock();
      const platform = requireSocialPlatform(input.platform);
      const content = input.content.trim();
      if (content.length < 12) {
        throw new MosWorkspaceStoreError('validation', 'the post content needs at least 12 characters');
      }
      if (input.missionId !== null) {
        missionById(input.missionId); // fail-closed: the link must name a real mission
      }
      return commit((): MosWorkspacePost => {
        const { id, seq } = nextId('pst');
        const scheduled = input.scheduledFor !== null && input.scheduledFor.trim().length > 0 ? input.scheduledFor.trim() : null;
        const post: MosWorkspacePost = {
          id,
          seq,
          platform,
          missionId: input.missionId,
          content,
          status: scheduled === null ? 'DRAFT' : 'SCHEDULED',
          scheduledFor: scheduled,
          createdAt: at,
        };
        state = { ...state, posts: [...state.posts, post] };
        appendEvent(
          'post-recorded',
          scheduled === null
            ? `Draft recorded on ${platform} — "${content.slice(0, 48)}${content.length > 48 ? '…' : ''}"`
            : `Post scheduled on ${platform} for ${scheduled} — "${content.slice(0, 48)}${content.length > 48 ? '…' : ''}"`,
          at,
        );
        return post;
      });
    },

    schedulePost(id: string, scheduledFor: string, now?: string): MosWorkspacePost {
      const at = now ?? clock();
      const when = scheduledFor.trim();
      if (when.length === 0) {
        throw new MosWorkspaceStoreError('validation', 'the schedule time is required');
      }
      return commit((): MosWorkspacePost => {
        const post = state.posts.find((entry) => entry.id === id);
        if (post === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no post ${id} exists in this workspace`);
        }
        const updated: MosWorkspacePost = { ...post, status: 'SCHEDULED', scheduledFor: when };
        state = { ...state, posts: state.posts.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent('post-scheduled', `Post ${id} scheduled on ${post.platform} for ${when}`, at);
        return updated;
      });
    },

    recordCampaignDraft(input: MosCampaignIntakeInput, now?: string): MosWorkspaceCampaign {
      const at = now ?? clock();
      const platform = requireAdPlatform(input.platform);
      const objective = requireStatement(input.objective);
      const budget = requirePositiveAmount(input.budget, 'budget');
      const dailyCap = requirePositiveAmount(input.dailyCap, 'daily cap');
      if (input.missionId !== null) {
        missionById(input.missionId);
      }
      return commit((): MosWorkspaceCampaign => {
        const { id, seq } = nextId('cmp');
        const campaign: MosWorkspaceCampaign = {
          id,
          seq,
          platform,
          objective,
          budget,
          dailyCap,
          audience: input.audience.trim(),
          missionId: input.missionId,
          status: 'DRAFT',
          counterfactual: null,
          measured: null,
          createdAt: at,
        };
        state = { ...state, campaigns: [...state.campaigns, campaign] };
        appendEvent('campaign-draft-recorded', `Campaign drafted — "${objective}" (${platform}, budget ${budget}, cap ${dailyCap}/day). Nothing spends before the arm gate.`, at);
        return campaign;
      });
    },

    compileCampaign(id: string, now?: string): MosWorkspaceCampaign {
      const at = now ?? clock();
      return commit((): MosWorkspaceCampaign => {
        const campaign = campaignById(id);
        if (campaign.status !== 'DRAFT') {
          throw new MosWorkspaceStoreError('validation', `campaign ${id} is ${campaign.status} — only a DRAFT compiles`);
        }
        const { id: approvalId, seq } = nextId('apv');
        const updated: MosWorkspaceCampaign = {
          ...campaign,
          status: 'COMPILED',
          counterfactual: `SIMULATION — the Lab's counterfactual projection for ${campaign.budget} across ${campaign.audience || 'the declared audience'}: reach and conversion bands recorded in the Lab, labelled simulation, never platform truth.`,
        };
        state = {
          ...state,
          campaigns: state.campaigns.map((entry) => (entry.id === id ? updated : entry)),
          approvals: [
            ...state.approvals,
            { id: approvalId, seq, kind: 'arm-gate' as const, campaignId: id, status: 'PENDING' as const, decidedAt: null, createdAt: at },
          ],
        };
        appendEvent('campaign-compiled', `Campaign ${id} compiled — the arm gate is pending human approval`, at);
        return updated;
      });
    },

    decideApproval(id: string, decision: 'approve' | 'deny', now?: string): MosWorkspaceApproval {
      const at = now ?? clock();
      return commit((): MosWorkspaceApproval => {
        const approval = state.approvals.find((entry) => entry.id === id);
        if (approval === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no approval ${id} exists in this workspace`);
        }
        if (approval.status !== 'PENDING') {
          throw new MosWorkspaceStoreError('validation', `approval ${id} is already ${approval.status}`);
        }
        const updated: MosWorkspaceApproval = { ...approval, status: decision === 'approve' ? 'APPROVED' : 'DENIED', decidedAt: at };
        state = { ...state, approvals: state.approvals.map((entry) => (entry.id === id ? updated : entry)) };
        if (decision === 'approve') {
          const campaign = state.campaigns.find((entry) => entry.id === approval.campaignId);
          if (campaign !== undefined && campaign.status === 'COMPILED') {
            state = {
              ...state,
              campaigns: state.campaigns.map((entry) =>
                entry.id === approval.campaignId ? { ...entry, status: 'ARMED' as const } : entry,
              ),
            };
            appendEvent('gate-approved', `Arm gate approved — campaign ${approval.campaignId} is ARMED (workspace record; live spend still awaits a connected ad transport)`, at);
          }
        } else {
          appendEvent('gate-denied', `Arm gate denied for campaign ${approval.campaignId} — the denial is relayed verbatim`, at);
        }
        return updated;
      });
    },

    beginProviderSetup(providerId: string, now?: string): MosWorkspaceAccount {
      const at = now ?? clock();
      const provider = MOS_PROVIDER_CATALOGUE.find((entry) => entry.id === providerId);
      if (provider === undefined) {
        throw new MosWorkspaceStoreError('validation', `unknown provider "${providerId}" — the catalogue is closed`);
      }
      return commit((): MosWorkspaceAccount => {
        const existing = state.accounts.find((entry) => entry.providerId === providerId);
        if (existing !== undefined) {
          return existing; // idempotent: the setup request is already recorded
        }
        const { id, seq } = nextId('acc');
        const account: MosWorkspaceAccount = { id, seq, providerId, status: 'SETUP_REQUIRED', createdAt: at };
        state = { ...state, accounts: [...state.accounts, account] };
        appendEvent('provider-setup-requested', `Setup requested for ${provider.name} — SETUP_REQUIRED (no live transport is bound in this release)`, at);
        return account;
      });
    },

    recordAgentTask(input: MosAgentTaskIntakeInput, now?: string): MosWorkspaceTask {
      const at = now ?? clock();
      const title = input.title.trim();
      const prompt = input.prompt.trim();
      if (prompt.length < 3) {
        throw new MosWorkspaceStoreError('validation', 'the task prompt needs at least 3 characters');
      }
      if (title.length === 0) {
        throw new MosWorkspaceStoreError('validation', 'the task title is required — it is derived from the prompt');
      }
      if (mosAgentModel(input.modelId) === undefined) {
        throw new MosWorkspaceStoreError('validation', `unknown model "${input.modelId}" — the roster is frozen to the substrate builtin catalog`);
      }
      if (mosModelConnectionMode(input.connectionMode) === undefined) {
        throw new MosWorkspaceStoreError('validation', `unknown connection mode "${input.connectionMode}"`);
      }
      if (mosNewTaskMode(input.mode) === undefined) {
        throw new MosWorkspaceStoreError('validation', `unknown permission mode "${input.mode}"`);
      }
      if (input.missionId !== null) {
        missionById(input.missionId); // fail-closed: the context must name a real mission
      }
      return commit((): MosWorkspaceTask => {
        const { id, seq } = nextId('tsk');
        const task: MosWorkspaceTask = {
          id,
          seq,
          title,
          prompt,
          modelId: input.modelId,
          connectionMode: input.connectionMode,
          mode: input.mode,
          planEnabled: input.planEnabled,
          reasoningLevel: input.reasoningLevel,
          missionId: input.missionId,
          status: 'DRAFT',
          createdAt: at,
          updatedAt: at,
          pinned: false,
          archived: false,
          followUps: [],
        };
        state = { ...state, tasks: [...state.tasks, task] };
        appendEvent(
          'agent-task-recorded',
          `Task ${id} drafted — "${title.slice(0, 48)}${title.length > 48 ? '…' : ''}" on ${input.modelId} (${input.mode} mode). The substrate runs it when an account is connected.`,
          at,
        );
        return task;
      });
    },

    setModelDisabled(modelId: string, disabled: boolean, now?: string): MosWorkspaceModelSettings {
      const at = now ?? clock();
      if (mosAgentModel(modelId) === undefined) {
        throw new MosWorkspaceStoreError('validation', `unknown model "${modelId}" — the roster is frozen to the substrate builtin catalog`);
      }
      return commit((): MosWorkspaceModelSettings => {
        const current = state.modelSettings.disabledModelIds;
        const next = disabled
          ? current.includes(modelId)
            ? current
            : [...current, modelId]
          : current.filter((entry) => entry !== modelId);
        if (next === current) {
          return state.modelSettings; // idempotent no-op: nobody is notified
        }
        state = { ...state, modelSettings: { disabledModelIds: next } };
        appendEvent(
          'model-list-changed',
          `${modelId} ${disabled ? 'disabled' : 'enabled'} in the model list — the workspace record the composer picker follows`,
          at,
        );
        return state.modelSettings;
      });
    },

    /* ------------------------------------------------------------------
     * W36 — the Tasks surface's workspace decisions (pin / archive /
     * rename / follow-up turns): every write is a REAL record change,
     * fail-closed, appended to the timeline.
     * ------------------------------------------------------------------ */

    setTaskPinned(id: string, pinned: boolean, now?: string): MosWorkspaceTask {
      const at = now ?? clock();
      return commit((): MosWorkspaceTask => {
        const task = taskById(id);
        if (task.pinned === pinned) {
          return task; // idempotent no-op: nobody is notified
        }
        const updated: MosWorkspaceTask = { ...task, pinned, updatedAt: at };
        state = { ...state, tasks: state.tasks.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent('task-pinned', `Task ${id} ${pinned ? 'pinned' : 'unpinned'} — the task list's Pinned section follows it`, at);
        return updated;
      });
    },

    setTaskArchived(id: string, archived: boolean, now?: string): MosWorkspaceTask {
      const at = now ?? clock();
      return commit((): MosWorkspaceTask => {
        const task = taskById(id);
        if (task.archived === archived) {
          return task; // idempotent no-op: nobody is notified
        }
        const updated: MosWorkspaceTask = { ...task, archived };
        state = { ...state, tasks: state.tasks.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent(
          'task-archived',
          `Task ${id} ${archived ? 'archived — it leaves the active task list (a workspace decision, the record is kept)' : 'restored to the active task list'}`,
          at,
        );
        return updated;
      });
    },

    renameTask(id: string, title: string, now?: string): MosWorkspaceTask {
      const at = now ?? clock();
      const trimmed = title.trim();
      if (trimmed.length === 0) {
        throw new MosWorkspaceStoreError('validation', 'the task name is required — an empty title cannot be saved');
      }
      if (trimmed.length > 200) {
        throw new MosWorkspaceStoreError('validation', 'the task name is capped at 200 characters');
      }
      return commit((): MosWorkspaceTask => {
        const task = taskById(id);
        const updated: MosWorkspaceTask = { ...task, title: trimmed, updatedAt: at };
        state = { ...state, tasks: state.tasks.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent('task-renamed', `Task ${id} renamed to "${trimmed}" — the operator's own title, kept verbatim`, at);
        return updated;
      });
    },

    appendTaskFollowUp(id: string, prompt: string, now?: string): MosWorkspaceTask {
      const at = now ?? clock();
      const trimmed = prompt.trim();
      if (trimmed.length < 3) {
        throw new MosWorkspaceStoreError('validation', 'the follow-up prompt needs at least 3 characters');
      }
      return commit((): MosWorkspaceTask => {
        const task = taskById(id);
        const { id: turnId } = nextId('tsk-fu');
        const updated: MosWorkspaceTask = {
          ...task,
          followUps: [...task.followUps, { id: turnId, prompt: trimmed, at }],
          updatedAt: at,
        };
        state = { ...state, tasks: state.tasks.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent(
          'task-follow-up-recorded',
          `Follow-up on task ${id} — "${trimmed.slice(0, 48)}${trimmed.length > 48 ? '…' : ''}". A workspace record; the substrate runs it when an account is connected.`,
          at,
        );
        return updated;
      });
    },

    /* ------------------------------------------------------------------
     * W36 — the Automations surface's workspace records (pause/continue,
     * run request, delete, keep-awake): honest intent records — no run
     * dispatches without the substrate account.
     * ------------------------------------------------------------------ */

    setAutomationPaused(id: string, paused: boolean, now?: string): MosWorkspaceAutomation {
      const at = now ?? clock();
      return commit((): MosWorkspaceAutomation => {
        const automation = automationById(id);
        if (automation.lifecycleStatus === 'completed' || automation.lifecycleStatus === 'failed') {
          throw new MosWorkspaceStoreError('validation', `automation ${id} is ${automation.lifecycleStatus} — its lifecycle no longer toggles`);
        }
        const next = paused ? 'paused' : 'active';
        if (automation.lifecycleStatus === next) {
          return automation; // idempotent no-op: nobody is notified
        }
        // The nextRunAt RECORD stays (schedule math truth — the badge hides
        // it by lifecycle status, and a Continue restores it untouched);
        // only the lifecycle decision flips.
        const updated: MosWorkspaceAutomation = {
          ...automation,
          lifecycleStatus: next,
          updatedAt: at,
        };
        state = { ...state, automations: state.automations.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent(
          'automation-lifecycle-changed',
          `Automation ${id} (${automation.title}) ${paused ? 'paused' : 'continued'} — a workspace decision; the schedule record ${paused ? 'holds with no next run' : 'resumes'}`,
          at,
        );
        return updated;
      });
    },

    requestAutomationRun(id: string, now?: string): MosWorkspaceAutomation {
      const at = now ?? clock();
      return commit((): MosWorkspaceAutomation => {
        const automation = automationById(id);
        // The honest record: the run is REQUESTED (the event + the last-run
        // request time); runCount stays the honest count of dispatched
        // runs — no dispatch exists without the substrate account.
        const updated: MosWorkspaceAutomation = { ...automation, lastRunAt: at, updatedAt: at };
        state = { ...state, automations: state.automations.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent(
          'automation-run-requested',
          `Run requested for automation ${id} (${automation.title}) — the substrate dispatches it when an account is connected`,
          at,
        );
        return updated;
      });
    },

    deleteAutomation(id: string, now?: string): MosWorkspaceAutomation {
      const at = now ?? clock();
      return commit((): MosWorkspaceAutomation => {
        const automation = automationById(id);
        state = { ...state, automations: state.automations.filter((entry) => entry.id !== id) };
        appendEvent('automation-deleted', `Automation ${id} (${automation.title}) deleted — the schedule record is removed; this cannot be undone`, at);
        return automation;
      });
    },

    setAutomationKeepAwake(enabled: boolean, now?: string): MosWorkspaceAutomationSettings {
      const at = now ?? clock();
      return commit((): MosWorkspaceAutomationSettings => {
        if (state.automationSettings.keepAwake === enabled) {
          return state.automationSettings; // idempotent no-op: nobody is notified
        }
        state = { ...state, automationSettings: { keepAwake: enabled } };
        appendEvent(
          'automation-keep-awake-changed',
          `Keep-awake ${enabled ? 'on' : 'off'} — the workspace record the app follows while a chat runs`,
          at,
        );
        return state.automationSettings;
      });
    },

    /* ------------------------------------------------------------------
     * W37 — the Marketplace surface's workspace records (install /
     * uninstall): the plugin inventory decisions. The catalog id must
     * resolve against the frozen marketplace catalog (fail-closed); the
     * record NEVER claims the substrate synced anything — skills and MCP
     * servers arrive with a connected substrate account.
     * ------------------------------------------------------------------ */

    installMarketplacePlugin(pluginId: string, now?: string): MosWorkspaceMarketplacePlugin {
      const at = now ?? clock();
      const catalogEntry = mosMarketplacePluginById(pluginId);
      if (catalogEntry === undefined) {
        throw new MosWorkspaceStoreError(
          'validation',
          `unknown marketplace plugin "${pluginId}" — the catalog is frozen to the official listing captured in this build`,
        );
      }
      return commit((): MosWorkspaceMarketplacePlugin => {
        const existing = state.marketplacePlugins.find((entry) => entry.pluginId === pluginId);
        if (existing !== undefined) {
          throw new MosWorkspaceStoreError('validation', `plugin ${pluginId} (${existing.name}) is already installed in this workspace`);
        }
        const record: MosWorkspaceMarketplacePlugin = {
          pluginId,
          name: catalogEntry.name,
          installedAt: at,
        };
        state = { ...state, marketplacePlugins: [...state.marketplacePlugins, record] };
        appendEvent(
          'marketplace-plugin-installed',
          `Plugin ${pluginId} (${catalogEntry.name}) installed — a workspace record; the substrate syncs its skills and MCP servers when an account is connected`,
          at,
        );
        return record;
      });
    },

    uninstallMarketplacePlugin(pluginId: string, now?: string): MosWorkspaceMarketplacePlugin {
      const at = now ?? clock();
      return commit((): MosWorkspaceMarketplacePlugin => {
        const existing = state.marketplacePlugins.find((entry) => entry.pluginId === pluginId);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `plugin ${pluginId} is not installed in this workspace`);
        }
        state = { ...state, marketplacePlugins: state.marketplacePlugins.filter((entry) => entry.pluginId !== pluginId) };
        appendEvent(
          'marketplace-plugin-uninstalled',
          `Plugin ${pluginId} (${existing.name}) uninstalled — the workspace record is removed; this cannot be undone`,
          at,
        );
        return existing;
      });
    },

    /* ------------------------------------------------------------------
     * W38 — the Agent Settings hub's workspace records: the MCP server
     * configs, the user commands, and the hooks. Every write is fail-closed
     * (duplicate names throw; invalid JSON env/headers throw; a stdio
     * server without a command or an http-family server without a URL
     * throws; unknown ids throw) and every record stays a configuration
     * record — the substrate connects/executes when an account is
     * connected, never before.
     * ------------------------------------------------------------------ */

    upsertMcpServer(input: MosMcpServerInput, now?: string): MosWorkspaceMcpServer {
      const at = now ?? clock();
      const name = input.name.trim();
      if (name.length === 0) {
        throw new MosWorkspaceStoreError('validation', 'the MCP server name is required');
      }
      if (input.type === 'stdio' && input.command.trim().length === 0) {
        throw new MosWorkspaceStoreError('validation', `MCP server "${name}" needs a command — a stdio server without one cannot start`);
      }
      if (input.type !== 'stdio' && input.url.trim().length === 0) {
        throw new MosWorkspaceStoreError('validation', `MCP server "${name}" needs a URL — an ${input.type} server without one cannot connect`);
      }
      const timeoutMs = input.timeoutMs.trim().length === 0 ? null : Number(input.timeoutMs.trim());
      if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
        throw new MosWorkspaceStoreError('validation', `MCP server "${name}" has a malformed timeout — enter a positive number of milliseconds or leave it blank`);
      }
      if (input.type === 'stdio' && input.envJson.trim().length > 0) {
        try {
          const parsed: unknown = JSON.parse(input.envJson);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('not an object');
          }
        } catch {
          throw new MosWorkspaceStoreError('validation', `MCP server "${name}" has malformed environment variables JSON — JSON parsing failed`);
        }
      }
      if (input.type !== 'stdio' && input.headersJson.trim().length > 0) {
        try {
          const parsed: unknown = JSON.parse(input.headersJson);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('not an object');
          }
        } catch {
          throw new MosWorkspaceStoreError('validation', `MCP server "${name}" has malformed headers JSON — JSON parsing failed`);
        }
      }
      return commit((): MosWorkspaceMcpServer => {
        const duplicate = state.mcpServers.find(
          (entry) => entry.name === name && entry.id !== input.id,
        );
        if (duplicate !== undefined) {
          throw new MosWorkspaceStoreError('validation', `an MCP server named "${name}" already exists in this workspace`);
        }
        const args = input.args.trim().length === 0 ? [] : input.args.trim().split(/\s+/);
        if (input.id === null) {
          const { id, seq } = nextId('mcp');
          const record: MosWorkspaceMcpServer = {
            id,
            seq,
            name,
            storageLevel: input.storageLevel,
            type: input.type,
            command: input.type === 'stdio' ? input.command.trim() : '',
            args,
            envJson: input.type === 'stdio' ? input.envJson : '',
            url: input.type === 'stdio' ? '' : input.url.trim(),
            headersJson: input.type === 'stdio' ? '' : input.headersJson,
            timeoutMs,
            protocolVersion: input.protocolVersion,
            enabled: true,
            createdAt: at,
            updatedAt: at,
          };
          state = { ...state, mcpServers: [...state.mcpServers, record] };
          appendEvent(
            'mcp-server-added',
            `MCP server "${name}" added (${input.type}${input.type === 'stdio' ? ' · ' + input.command.trim() : ' · ' + input.url.trim()}) — a workspace record; the substrate connects it when an account is connected`,
            at,
          );
          return record;
        }
        const existing = state.mcpServers.find((entry) => entry.id === input.id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no MCP server ${input.id} exists in this workspace`);
        }
        const updated: MosWorkspaceMcpServer = {
          ...existing,
          name,
          storageLevel: input.storageLevel,
          type: input.type,
          command: input.type === 'stdio' ? input.command.trim() : '',
          args,
          envJson: input.type === 'stdio' ? input.envJson : '',
          url: input.type === 'stdio' ? '' : input.url.trim(),
          headersJson: input.type === 'stdio' ? '' : input.headersJson,
          timeoutMs,
          protocolVersion: input.protocolVersion,
          updatedAt: at,
        };
        state = { ...state, mcpServers: state.mcpServers.map((entry) => (entry.id === updated.id ? updated : entry)) };
        appendEvent(
          'mcp-server-updated',
          `MCP server "${name}" updated — the workspace record changed; the substrate re-reads it when an account is connected`,
          at,
        );
        return updated;
      });
    },

    deleteMcpServer(id: string, now?: string): MosWorkspaceMcpServer {
      const at = now ?? clock();
      return commit((): MosWorkspaceMcpServer => {
        const existing = state.mcpServers.find((entry) => entry.id === id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no MCP server ${id} exists in this workspace`);
        }
        state = { ...state, mcpServers: state.mcpServers.filter((entry) => entry.id !== id) };
        appendEvent(
          'mcp-server-deleted',
          `MCP server "${existing.name}" deleted — the workspace record is removed; this cannot be undone`,
          at,
        );
        return existing;
      });
    },

    setMcpServerEnabled(id: string, enabled: boolean, now?: string): MosWorkspaceMcpServer {
      const at = now ?? clock();
      return commit((): MosWorkspaceMcpServer => {
        const existing = state.mcpServers.find((entry) => entry.id === id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no MCP server ${id} exists in this workspace`);
        }
        if (existing.enabled === enabled) {
          return existing; // idempotent no-op: nobody is notified
        }
        const updated: MosWorkspaceMcpServer = { ...existing, enabled, updatedAt: at };
        state = { ...state, mcpServers: state.mcpServers.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent(
          'mcp-server-enabled-changed',
          `MCP server "${existing.name}" ${enabled ? 'enabled' : 'disabled'} — the workspace record the substrate follows when an account is connected`,
          at,
        );
        return updated;
      });
    },

    upsertUserCommand(input: MosUserCommandInput, now?: string): MosWorkspaceUserCommand {
      const at = now ?? clock();
      const name = input.name.trim();
      if (name.length === 0) {
        throw new MosWorkspaceStoreError('validation', 'the command name is required');
      }
      if (name.startsWith('/') || /\s/.test(name)) {
        throw new MosWorkspaceStoreError('validation', `the command name "${name}" is invalid — use the bare name (no leading slash, no spaces), the picker shows it as /${name.replace(/^\/+/, '')}`);
      }
      if (input.prompt.trim().length === 0) {
        throw new MosWorkspaceStoreError('validation', `command "${name}" needs a prompt — a command without one expands to nothing`);
      }
      return commit((): MosWorkspaceUserCommand => {
        const duplicate = state.userCommands.find(
          (entry) => entry.name === name && entry.id !== input.id,
        );
        if (duplicate !== undefined) {
          throw new MosWorkspaceStoreError('validation', `a command named "${name}" already exists in this workspace`);
        }
        if (input.id === null) {
          const { id, seq } = nextId('cmd');
          const record: MosWorkspaceUserCommand = {
            id,
            seq,
            name,
            description: input.description.trim(),
            argumentHint: input.argumentHint.trim(),
            prompt: input.prompt.trim(),
            createdAt: at,
            updatedAt: at,
          };
          state = { ...state, userCommands: [...state.userCommands, record] };
          appendEvent(
            'user-command-added',
            `Command /${name} added — a workspace record; the substrate's command picker reads it when an account is connected`,
            at,
          );
          return record;
        }
        const existing = state.userCommands.find((entry) => entry.id === input.id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no command ${input.id} exists in this workspace`);
        }
        const updated: MosWorkspaceUserCommand = {
          ...existing,
          name,
          description: input.description.trim(),
          argumentHint: input.argumentHint.trim(),
          prompt: input.prompt.trim(),
          updatedAt: at,
        };
        state = { ...state, userCommands: state.userCommands.map((entry) => (entry.id === updated.id ? updated : entry)) };
        appendEvent(
          'user-command-updated',
          `Command /${name} updated — the workspace record changed`,
          at,
        );
        return updated;
      });
    },

    deleteUserCommand(id: string, now?: string): MosWorkspaceUserCommand {
      const at = now ?? clock();
      return commit((): MosWorkspaceUserCommand => {
        const existing = state.userCommands.find((entry) => entry.id === id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no command ${id} exists in this workspace`);
        }
        state = { ...state, userCommands: state.userCommands.filter((entry) => entry.id !== id) };
        appendEvent(
          'user-command-deleted',
          `Command /${existing.name} deleted — the workspace record is removed; this cannot be undone`,
          at,
        );
        return existing;
      });
    },

    upsertHook(input: MosHookInput, now?: string): MosWorkspaceHook {
      const at = now ?? clock();
      if (!HOOK_EVENT_IDS.has(input.event)) {
        throw new MosWorkspaceStoreError('validation', `"${String(input.event)}" is not a hook event — the substrate's own event vocabulary is the only truth`);
      }
      if (input.command.trim().length === 0) {
        throw new MosWorkspaceStoreError('validation', `a ${input.event} hook needs a command — a hook without one never runs`);
      }
      const timeoutSeconds = input.timeoutSeconds.trim().length === 0 ? null : Number(input.timeoutSeconds.trim());
      if (timeoutSeconds !== null && (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)) {
        throw new MosWorkspaceStoreError('validation', `the ${input.event} hook has a malformed timeout — enter a positive number of seconds or leave it blank`);
      }
      return commit((): MosWorkspaceHook => {
        if (input.id === null) {
          const { id, seq } = nextId('hook');
          const record: MosWorkspaceHook = {
            id,
            seq,
            event: input.event,
            matcher: input.matcher.trim(),
            type: input.type,
            command: input.command.trim(),
            timeoutSeconds,
            enabled: true,
            createdAt: at,
            updatedAt: at,
          };
          state = { ...state, hooks: [...state.hooks, record] };
          appendEvent(
            'hook-added',
            `${input.event} hook added — a workspace record; the substrate executes it on the real event when an account is connected`,
            at,
          );
          return record;
        }
        const existing = state.hooks.find((entry) => entry.id === input.id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no hook ${input.id} exists in this workspace`);
        }
        const updated: MosWorkspaceHook = {
          ...existing,
          event: input.event,
          matcher: input.matcher.trim(),
          type: input.type,
          command: input.command.trim(),
          timeoutSeconds,
          updatedAt: at,
        };
        state = { ...state, hooks: state.hooks.map((entry) => (entry.id === updated.id ? updated : entry)) };
        appendEvent(
          'hook-updated',
          `${input.event} hook updated — the workspace record changed`,
          at,
        );
        return updated;
      });
    },

    deleteHook(id: string, now?: string): MosWorkspaceHook {
      const at = now ?? clock();
      return commit((): MosWorkspaceHook => {
        const existing = state.hooks.find((entry) => entry.id === id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no hook ${id} exists in this workspace`);
        }
        state = { ...state, hooks: state.hooks.filter((entry) => entry.id !== id) };
        appendEvent(
          'hook-deleted',
          `${existing.event} hook deleted — the workspace record is removed; this cannot be undone`,
          at,
        );
        return existing;
      });
    },

    setHookEnabled(id: string, enabled: boolean, now?: string): MosWorkspaceHook {
      const at = now ?? clock();
      return commit((): MosWorkspaceHook => {
        const existing = state.hooks.find((entry) => entry.id === id);
        if (existing === undefined) {
          throw new MosWorkspaceStoreError('not-found', `no hook ${id} exists in this workspace`);
        }
        if (existing.enabled === enabled) {
          return existing; // idempotent no-op: nobody is notified
        }
        const updated: MosWorkspaceHook = { ...existing, enabled, updatedAt: at };
        state = { ...state, hooks: state.hooks.map((entry) => (entry.id === id ? updated : entry)) };
        appendEvent(
          'hook-enabled-changed',
          `${existing.event} hook ${enabled ? 'enabled' : 'disabled'} — the workspace record the substrate follows`,
          at,
        );
        return updated;
      });
    },

    health() {
      return {
        durability: 'BROWSER_PROFILE' as const,
        key: MOS_WORKSPACE_STORE_KEY,
        missionCount: state.missions.length,
        postCount: state.posts.length,
        campaignCount: state.campaigns.length,
        eventCount: state.events.length,
        taskCount: state.tasks.length,
        automationCount: state.automations.length,
        marketplacePluginCount: state.marketplacePlugins.length,
        mcpServerCount: state.mcpServers.length,
        userCommandCount: state.userCommands.length,
        hookCount: state.hooks.length,
        quarantinedCount: quarantined.length,
      };
    },

    /** The quarantine entries (surfaced verbatim; tests assert them). */
    quarantineEntries(): readonly MosWorkspaceQuarantineEntry[] {
      return [...quarantined];
    },
  };

  return store;
}
