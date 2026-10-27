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
  type MosMissionIntakeInput,
  type MosPostComposerInput,
  type MosWorkspaceAccount,
  type MosWorkspaceApproval,
  type MosWorkspaceAutomation,
  type MosWorkspaceAutomationSettings,
  type MosWorkspaceCampaign,
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
} from './workspace-records.js';
import { mosAgentModel, mosModelConnectionMode } from './model-catalog.js';
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
