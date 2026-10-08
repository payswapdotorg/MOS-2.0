/**
 * DISCLOSED TEST DOUBLE — in-memory DurableJobStorePort (JOBS-001).
 *
 * ⚠ IN-MEMORY ADAPTER ONLY — NEVER A DURABILITY CLAIM ⚠
 *
 * Process-local persistence for the durable-job authority: records are
 * keyed per (tenant, id) — the cross-tenant bleed lesson of W3-A is baked
 * into the keying — and per (tenant, jobKey) for idempotency. Events are
 * appended with per-job monotonic sequences and NEVER updated or deleted.
 * Everything returned is deep-frozen.
 *
 * The REAL durable store (PostgreSQL-backed MOS authority, or the Zcode
 * task-infra adapter) implements the same port; the queue and all
 * consumers stay unchanged (documented future seam, §26). Synchronous
 * execution makes the queue's claim scan/save atomic in-process; real
 * adapters must serialize that sequence (see the port's atomicity note).
 */

import type { TenantScope } from "@mos/contracts";

import type { DurableJobRecord } from "../contracts/durable-job.js";
import type {
  DurableJobEvent,
  DurableJobEventInput,
} from "../contracts/job-events.js";
import type { DurableJobId, JobKey } from "../contracts/ids.js";
import type {
  ClaimableJobsQuery,
  DurableJobStorePort,
} from "../ports/durable-job-store.port.js";

/** Recursively freezes JSON-shaped data (records, events, payloads). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const entry of value) {
        deepFreeze(entry);
      }
    } else {
      for (const key of Object.keys(value)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Clone-then-freeze: the store takes OWNERSHIP of everything it saves.
 * Caller-supplied records/events and every nested payload are deep-cloned
 * BEFORE freezing, so no object the caller keeps (a submission, a typed
 * failure, a runner observability record) is ever mutated or frozen in
 * place — the frozen authority copy is always a private structural copy.
 */
function owned<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

/** Creates the DISCLOSED in-memory {@link DurableJobStorePort}. */
export function createInMemoryDurableJobStore(): DurableJobStorePort {
  /** (tenant, jobId) → record. Composite keys: no cross-tenant bleed. */
  const jobs = new Map<string, DurableJobRecord>();
  /** (tenant, jobKey) → jobId (idempotency index). */
  const byKey = new Map<string, DurableJobId>();
  /** (tenant, jobId) → ordered events. */
  const events = new Map<string, DurableJobEvent[]>();
  /** jobId → next sequence (scoped by construction to one job). */
  const sequences = new Map<string, number>();
  /** Composite keys in insertion order for FIFO claim/list scans. */
  const insertion: string[] = [];

  // W9-B: composite keys are JSON array keys (injective over string
  // tuples). The old `${tenant}:${id}` concatenation was injectable — a
  // hostile tenant id containing ":" aliased another tenant's records and
  // could silently corrupt the (tenant, jobKey) IDEMPOTENCY INDEX (the
  // W3-A hostile-id-factory class). JSON.stringify escapes/quots make
  // component boundaries unambiguous, so no delimiter can blur.
  const jobKeyOf = (tenantId: string, id: string): string => JSON.stringify([tenantId, id]);
  const keyKeyOf = (tenantId: string, key: string): string => JSON.stringify([tenantId, key]);

  function storedEvent(
    tenantId: string,
    jobId: DurableJobId,
    event: DurableJobEventInput,
  ): DurableJobEvent {
    const mapKey = jobKeyOf(tenantId, jobId as string);
    const next = (sequences.get(mapKey) ?? 0) + 1;
    sequences.set(mapKey, next);
    return owned({ ...event, sequence: next }) as DurableJobEvent;
  }

  const store: DurableJobStorePort = {
    saveJob(record: DurableJobRecord): void {
      const tenantId = record.scope.tenantId as string;
      const mapKey = jobKeyOf(tenantId, record.id as string);
      if (!jobs.has(mapKey)) {
        insertion.push(mapKey);
      }
      jobs.set(mapKey, owned(record) as DurableJobRecord);
      byKey.set(keyKeyOf(tenantId, record.jobKey as string), record.id);
    },

    findJobById(scope: TenantScope, jobId: DurableJobId) {
      const record = jobs.get(jobKeyOf(scope.tenantId as string, jobId as string));
      if (record === undefined || record.scope.workspaceId !== scope.workspaceId) {
        return undefined;
      }
      return record;
    },

    findJobByKey(scope: TenantScope, key: JobKey) {
      const jobId = byKey.get(keyKeyOf(scope.tenantId as string, key as string));
      if (jobId === undefined) {
        return undefined;
      }
      return store.findJobById(scope, jobId);
    },

    listJobs(query) {
      const results: DurableJobRecord[] = [];
      for (const mapKey of insertion) {
        const record = jobs.get(mapKey);
        const candidate = record !== undefined
          && (record.scope.tenantId as string) === (query.tenantId as string)
          && (query.workspaceId === undefined
            || record.scope.workspaceId === query.workspaceId)
          && (query.statuses === undefined || query.statuses.includes(record.status))
          && (query.kinds === undefined || query.kinds.includes(record.kind));
        if (candidate) {
          results.push(record);
          if (query.limit !== undefined && results.length >= query.limit) {
            break;
          }
        }
      }
      return results;
    },

    appendJobEvent(scope: TenantScope, event: DurableJobEventInput) {
      const tenantId = scope.tenantId as string;
      const mapKey = jobKeyOf(tenantId, event.jobId as string);
      const stored = storedEvent(tenantId, event.jobId, event);
      const list = events.get(mapKey) ?? [];
      list.push(stored);
      events.set(mapKey, list);
      return stored;
    },

    listJobEvents(scope: TenantScope, jobId: DurableJobId) {
      return events.get(jobKeyOf(scope.tenantId as string, jobId as string));
    },

    findClaimableJobs(query: ClaimableJobsQuery) {
      const claimable: DurableJobRecord[] = [];
      for (const mapKey of insertion) {
        const record = jobs.get(mapKey);
        if (record === undefined) {
          continue;
        }
        if (query.tenantId !== undefined && record.scope.tenantId !== query.tenantId) {
          continue;
        }
        if (query.kinds !== undefined && !query.kinds.includes(record.kind)) {
          continue;
        }
        const queuedReady =
          record.status === "queued"
          && (record.nextAttemptAtMs === null || record.nextAttemptAtMs <= query.nowMs);
        const leaseExpired =
          record.status === "running"
          && record.lease !== null
          && record.lease.expiresAtMs <= query.nowMs;
        if (queuedReady || leaseExpired) {
          claimable.push(record);
        }
      }
      return claimable;
    },
  };

  return store;
}
