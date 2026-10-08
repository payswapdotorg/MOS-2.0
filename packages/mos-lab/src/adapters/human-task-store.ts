import type { HumanProductionTaskId, TenantScope, Timestamp } from '@mos/contracts';
import type {
  HumanFulfillmentPath,
  HumanTaskAbandonment,
  HumanTaskLifecycleEvent,
} from '../contracts/human-task-lifecycle.js';
import type { LabHumanProductionTask } from '../contracts/human-production-task.js';
import { cloneDeep, deepFreeze } from './parametric-support.js';
import { sameFulfillmentPath } from './human-task-field-validation.js';

/**
 * APPEND-ONLY store primitives for the in-memory human production task
 * adapter (LAB-012/LAB-014 internals): version chains, the lifecycle event
 * log, abandonment construction and ordered-substitute selection.
 *
 * Split from in-memory-human-production-task.ts to respect the
 * managed-file line budget (the W3-A/W5-A split precedent). Everything here
 * is internal — NOT exported from the package index.
 */

/** One APPEND-ONLY lifecycle event minus the fields the store fills in. */
export type HumanTaskEventDraft = Omit<HumanTaskLifecycleEvent, 'seq' | 'taskId' | 'recordedAt'>;

/** The append-only task store surface the adapter drives. */
export interface HumanTaskStore {
  /** Latest version of a task, or `undefined` when unknown in this tenant. */
  readonly latestOf: (tenantId: string, taskId: HumanProductionTaskId) => LabHumanProductionTask | undefined;
  /** Start a task's version chain (version 1 — creation only). */
  readonly seed: (scope: TenantScope, record: LabHumanProductionTask) => void;
  /** Append version + 1 (clone-then-freeze; prior versions stay bit-for-bit). */
  readonly appendVersion: (
    scope: TenantScope,
    current: LabHumanProductionTask,
    changes: Partial<LabHumanProductionTask>,
  ) => LabHumanProductionTask;
  /** Append one lifecycle event to the audit log. */
  readonly appendEvent: (scope: TenantScope, taskId: HumanProductionTaskId, event: HumanTaskEventDraft) => void;
  /** Exact-version (or latest) read — `null` when unknown/cross-tenant. */
  readonly read: (
    scope: TenantScope,
    taskId: HumanProductionTaskId,
    version?: number,
  ) => LabHumanProductionTask | null;
  /** The latest version of every task in this tenant scope (insertion order). */
  readonly listLatest: (scope: TenantScope) => readonly LabHumanProductionTask[];
  /** The task's append-only lifecycle event log (oldest first). */
  readonly history: (scope: TenantScope, taskId: HumanProductionTaskId) => readonly HumanTaskLifecycleEvent[];
}

/** Build the append-only store over per-(tenant, task id) chains + logs. */
export const createHumanTaskStore = (now: () => Timestamp): HumanTaskStore => {
  /** Task version chains keyed per (tenant, task id). */
  const chains = new Map<string, LabHumanProductionTask[]>();
  /** Append-only lifecycle event logs keyed per (tenant, task id). */
  const histories = new Map<string, HumanTaskLifecycleEvent[]>();

  // W9-B: JSON array key — injective over the (tenant, task) tuple, so a
  // hostile tenant id containing the old NUL delimiter can never alias
  // another tenant's task chain (the W3-A hostile-id-factory class).
  const key = (tenantId: string, taskId: HumanProductionTaskId): string =>
    JSON.stringify([tenantId, taskId as string]);

  const appendEvent = (scope: TenantScope, taskId: HumanProductionTaskId, event: HumanTaskEventDraft): void => {
    const log = histories.get(key(scope.tenantId, taskId)) ?? [];
    log.push(
      deepFreeze({
        ...event,
        seq: log.length + 1,
        taskId,
        recordedAt: now(),
      }),
    );
    histories.set(key(scope.tenantId, taskId), log);
  };

  return {
    latestOf: (tenantId, taskId) => {
      const chain = chains.get(key(tenantId, taskId));
      return chain === undefined || chain.length === 0 ? undefined : chain[chain.length - 1];
    },

    seed: (scope, record) => {
      chains.set(key(scope.tenantId, record.id), [record]);
    },

    appendVersion: (scope, current, changes) => {
      // deepFreeze (not Object.freeze): nested fields must stay frozen too —
      // a top-level-only freeze would let a returned record's nested objects
      // mutate the STORED version (the W5-A nested-freeze lesson, pinned by
      // the lifecycle deep-freeze test).
      const next = deepFreeze({
        ...(cloneDeep(current) as object),
        ...changes,
        version: current.version + 1,
        updatedAt: now(),
      }) as LabHumanProductionTask;
      chains.get(key(scope.tenantId, current.id))?.push(next);
      return next;
    },

    appendEvent,

    read: (scope, taskId, version) => {
      const chain = chains.get(key(scope.tenantId, taskId));
      if (chain === undefined) {
        return null;
      }
      const record =
        version === undefined ? chain[chain.length - 1] : chain.find((entry) => entry.version === version);
      return record === undefined ? null : record;
    },

    listLatest: (scope) => {
      const latest: LabHumanProductionTask[] = [];
      for (const [, chain] of chains) {
        // W9-B: EXACT tenant equality on the stored record (never a prefix
        // scan — a delimiter-laden tenant id must not widen the match).
        const record = chain[chain.length - 1];
        if (record !== undefined && (record.tenantId as string) === (scope.tenantId as string)) {
          latest.push(record);
        }
      }
      return latest;
    },

    history: (scope, taskId) => [...(histories.get(key(scope.tenantId, taskId)) ?? [])],
  };
};

/** Statuses from which a task may be abandoned (everything non-terminal). */
export const ABANDONABLE_STATUSES: readonly LabHumanProductionTask['status'][] = [
  'created',
  'offered',
  'in-progress',
  'delivered',
  'evaluated',
];

/** The next untried substitute from the ordered preference list (or null). */
export const nextSubstitute = (
  current: LabHumanProductionTask,
): HumanFulfillmentPath | null => {
  const tried = current.fulfillmentPath === null ? [] : [current.fulfillmentPath];
  for (const substitute of current.acceptableSubstitutes.ordered) {
    if (!tried.some((path) => sameFulfillmentPath(path, substitute.path))) {
      return substitute.path;
    }
  }
  return null;
};

/**
 * Record an abandonment (always terminal): the abandonment record carries
 * the cause, reason, the original path and — when the ordered list yielded
 * one — the substitute path (the switch is recorded, never silent).
 */
export const abandonTask = (
  store: HumanTaskStore,
  scope: TenantScope,
  current: LabHumanProductionTask,
  cause: HumanTaskAbandonment['cause'],
  reason: string,
  substitutePath: HumanFulfillmentPath | null,
  now: () => Timestamp,
): LabHumanProductionTask => {
  const abandonment: HumanTaskAbandonment = deepFreeze({
    cause,
    reason,
    originalPath: current.fulfillmentPath === null ? null : cloneDeep(current.fulfillmentPath),
    substitutePath: substitutePath === null ? null : cloneDeep(substitutePath),
    abandonedAt: now(),
  });
  const abandoned = store.appendVersion(scope, current, { status: 'abandoned', abandonment });
  store.appendEvent(scope, current.id, {
    taskVersion: abandoned.version,
    kind: 'abandoned',
    detail:
      substitutePath === null
        ? `task abandoned (${cause}): ${reason}`
        : `task abandoned (${cause}): ${reason} — substitute path yielded: ${substitutePath.kind}`,
    ...(substitutePath === null ? {} : { substitutePath: deepFreeze(cloneDeep(substitutePath)) }),
  });
  return abandoned;
};
