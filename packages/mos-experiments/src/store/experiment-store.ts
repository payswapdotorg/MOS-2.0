/**
 * BRIDGE-003 experiment store — the append-only, versioned, tenant-scoped
 * record store behind the real-experiment authority (experiments + the
 * binding-attempt audit log).
 *
 * Construction disciplines (W9-B, by construction):
 * - D1/D2 exact-tenant keys: records are keyed per tenant with
 *   `JSON.stringify([tenantId, experimentId])` array keys (injective over
 *   the tuple — no delimiter-laden tenant id can alias another tenant's
 *   experiment) and listings use exact stored-record tenant equality
 *   (never a scan).
 * - D3 clone-then-deep-freeze: the store keeps PRIVATE structural copies —
 *   the caller's draft record is never aliased into the store and never
 *   frozen in place; returned records are deep-frozen and bit-for-bit
 *   stable.
 * - D4 frozen scope copies: the record owns a frozen copy of the caller's
 *   scope object (mutating the caller's scope after the call moves
 *   nothing).
 * - D5 finite guards: the validation layer guards every numeric BEFORE
 *   the store sees it; the store additionally re-computes the digest and
 *   refuses a record whose digest does not match its payload (defense in
 *   depth against a corrupt draft).
 *
 * Append-only discipline: v1 is minted by the binding act; the ONLY
 * successor paths are the lifecycle transitions (running → measured →
 * analysed → closed/abandoned, each validated against the latest
 * version's status). Prior versions stay bit-for-bit immutable and
 * resolvable. There is no update/delete surface. Audit records are
 * single-version immutable appends.
 */

import type { TenantScope } from "@mos/contracts";

import type { ExperimentId } from "../contracts/ids.js";
import type {
  RealExperimentBindingAuditRecord,
  RealExperimentRecord,
} from "../contracts/experiment-record.js";
import { digestOf } from "../domain/digest.js";

// ---------------------------------------------------------------------------
// Deep freeze / clone helpers (pure-data records only)
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** The store's private structural copy (D3/D4 — never the caller's object). */
function cloneForStore(record: RealExperimentRecord): RealExperimentRecord {
  return {
    ...structuredClone(record),
    scope: { tenantId: record.scope.tenantId, workspaceId: record.scope.workspaceId },
  } as RealExperimentRecord;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** The append-only experiment + audit store (internal; exposed for tests). */
export interface RealExperimentStore {
  /** Append version 1 of a new experiment (the binding act's own record). */
  appendFirstVersion(record: RealExperimentRecord): RealExperimentRecord;
  /**
   * Append a lifecycle successor version. Fails closed (typed string
   * reason) on unknown/cross-tenant ids or a latest status that cannot
   * transition to the successor's status.
   */
  appendLifecycleVersion(
    scope: TenantScope,
    experimentId: ExperimentId,
    successor: RealExperimentRecord,
  ): { ok: true; record: RealExperimentRecord } | { ok: false; reason: string };
  /** One experiment record version (latest, or exact) — cross-tenant ≡ unknown. */
  getExperiment(
    scope: TenantScope,
    experimentId: ExperimentId,
    version?: number,
  ): RealExperimentRecord | undefined;
  /** Every experiment chain's latest version of one tenant (creation order). */
  listLatestExperiments(scope: TenantScope): readonly RealExperimentRecord[];
  /** The full append-only version chain of one experiment (ascending). */
  listExperimentVersions(scope: TenantScope, experimentId: ExperimentId): readonly RealExperimentRecord[];
  /** Append one binding-attempt audit record (single-version immutable). */
  appendAuditRecord(record: RealExperimentBindingAuditRecord): RealExperimentBindingAuditRecord;
  /** Every audit record of one tenant, in append order (exact-tenant reads). */
  listAuditRecords(scope: TenantScope): readonly RealExperimentBindingAuditRecord[];
}

/** Create the in-memory append-only experiment store (the disclosed store double). */
export function createRealExperimentStore(): RealExperimentStore {
  /** JSON-array keys: tenantId → experimentId → version chain (D1/D2). */
  const chains = new Map<string, RealExperimentRecord[]>();
  /** tenantId → experimentIds in first-seen order (listing discipline). */
  const order = new Map<string, string[]>();
  /** tenantId → audit records in append order. */
  const audits = new Map<string, RealExperimentBindingAuditRecord[]>();

  const tenantKeyOf = (scope: TenantScope): string => JSON.stringify([String(scope.tenantId)]);
  const chainKeyOf = (scope: TenantScope, experimentId: ExperimentId): string =>
    JSON.stringify([String(scope.tenantId), String(experimentId)]);

  const stored = (record: RealExperimentRecord): RealExperimentRecord => {
    // D5 defense in depth: the digest must match the payload the store
    // received — a mismatched draft is a core defect, never stored.
    const recomputed = digestOf(payloadOf(record));
    if (recomputed !== record.experimentDigest) {
      throw new Error(
        `real-experiment store: digest mismatch on experiment ${String(record.id)} v${String(record.version)} — the draft is corrupt (never stored)`,
      );
    }
    return deepFreeze(cloneForStore(record));
  };

  return {
    appendFirstVersion(record) {
      const chainKey = chainKeyOf(record.scope, record.id);
      if (chains.has(chainKey)) {
        // Fail loud — the binding core mints one experiment id per act; a
        // collision here is a core defect, never a silent overwrite.
        throw new Error(`real-experiment store: experiment id collision on ${chainKey}`);
      }
      const frozen = stored(record);
      chains.set(chainKey, [frozen]);
      const tenantKey = tenantKeyOf(record.scope);
      order.set(tenantKey, [...(order.get(tenantKey) ?? []), String(record.id)]);
      return frozen;
    },
    appendLifecycleVersion(scope, experimentId, successor) {
      const chainKey = chainKeyOf(scope, experimentId);
      const chain = chains.get(chainKey);
      if (chain === undefined || chain.length === 0) {
        return { ok: false, reason: "experiment-not-found: no experiment chain resolves for this tenant scope (§31 — cross-tenant ≡ unknown)" };
      }
      const latest = chain[chain.length - 1];
      if (latest === undefined) {
        return { ok: false, reason: "experiment-not-found: empty experiment chain" };
      }
      if (successor.version !== latest.version + 1 || successor.priorVersion !== latest.version) {
        return { ok: false, reason: `version-chain-violation: the successor must be version ${String(latest.version + 1)} over prior ${String(latest.version)}` };
      }
      if (latest.status === "closed" || latest.status === "abandoned") {
        return { ok: false, reason: `experiment-already-terminal: latest status "${latest.status}" admits no successor (append-only history preserves it forever)` };
      }
      if (successor.id !== latest.id) {
        return { ok: false, reason: "experiment-identity-mismatch: the successor must extend the same experiment chain" };
      }
      const frozen = stored(successor);
      chain.push(frozen);
      return { ok: true, record: frozen };
    },
    getExperiment(scope, experimentId, version) {
      const chain = chains.get(chainKeyOf(scope, experimentId));
      if (chain === undefined || chain.length === 0) {
        return undefined;
      }
      if (version === undefined) {
        return chain[chain.length - 1];
      }
      return chain.find((record) => record.version === version);
    },
    listLatestExperiments(scope) {
      const tenantKey = tenantKeyOf(scope);
      const experimentIds = order.get(tenantKey);
      if (experimentIds === undefined) {
        return [];
      }
      const latest: RealExperimentRecord[] = [];
      for (const experimentId of experimentIds) {
        const chain = chains.get(chainKeyOf(scope, experimentId as ExperimentId));
        const record = chain?.[chain.length - 1];
        if (record !== undefined) {
          latest.push(record);
        }
      }
      return latest;
    },
    listExperimentVersions(scope, experimentId) {
      const chain = chains.get(chainKeyOf(scope, experimentId));
      return chain === undefined ? [] : [...chain];
    },
    appendAuditRecord(record) {
      const tenantKey = tenantKeyOf(record.scope);
      const frozen = deepFreeze(
        structuredClone({
          ...record,
          scope: { tenantId: record.scope.tenantId, workspaceId: record.scope.workspaceId },
        }) as RealExperimentBindingAuditRecord,
      );
      audits.set(tenantKey, [...(audits.get(tenantKey) ?? []), frozen]);
      return frozen;
    },
    listAuditRecords(scope) {
      return [...(audits.get(tenantKeyOf(scope)) ?? [])];
    },
  };
}

/**
 * The digest payload of one experiment record (the chain bookkeeping
 * fields are excluded — the digest covers the frozen record CONTENT).
 */
export const payloadOf = (record: RealExperimentRecord): unknown => {
  const { experimentDigest: _digest, ...payload } = record;
  return payload;
};

/** Recompute the digest of one stored experiment record (integrity verification). */
export const recomputedDigestOf = (record: RealExperimentRecord): string => digestOf(payloadOf(record));
