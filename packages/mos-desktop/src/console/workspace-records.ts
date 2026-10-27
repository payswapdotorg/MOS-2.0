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
};

/** @internal The empty document (the quarantined store's fail-closed start). */
export function emptyMosWorkspacePersisted(): MosWorkspacePersisted {
  return EMPTY_PERSISTED;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  return {
    ...(value as unknown as MosWorkspacePersisted),
    tasks: value.tasks === undefined ? [] : (value.tasks as unknown as MosWorkspaceTask[]),
    modelSettings:
      value.modelSettings === undefined
        ? { disabledModelIds: [] }
        : (value.modelSettings as unknown as MosWorkspaceModelSettings),
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
  health(): MosWorkspaceStoreHealth;
  quarantineEntries(): readonly MosWorkspaceQuarantineEntry[];
}
