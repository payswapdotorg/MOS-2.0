/**
 * BRIDGE-001 entry store — the append-only, versioned, tenant-scoped record
 * store behind the Lab → Studio bridge.
 *
 * Construction disciplines (W9-B, by construction):
 * - D1/D2 exact-tenant keys: entries are keyed per tenant with
 *   `JSON.stringify([tenantId, entryId])` array keys (injective over the
 *   tuple — no delimiter-laden tenant id can alias another tenant's entry)
 *   and listings use exact stored-record tenant equality (never a scan).
 * - D3 clone-then-deep-freeze: the store keeps PRIVATE structural copies —
 *   the caller's draft record is never aliased into the store and never
 *   frozen in place; returned records are deep-frozen and bit-for-bit stable.
 * - D4 frozen scope copies: the record owns a frozen copy of the caller's
 *   scope object (mutating the caller's scope after the call moves nothing).
 * - D5 finite guards: the validation layer (bridge-validation.ts) guards
 *   every numeric the record carries BEFORE the store sees it.
 *
 * Append-only discipline: v1 is minted by the entry attempt; the ONLY
 * successor path is `appendPackagedVersion` over an `entered` latest version
 * (the studio-produced package citation, recorded after the studio's own
 * packaging authority composed it). Prior versions stay bit-for-bit immutable
 * and resolvable. There is no update/delete surface.
 */

import type { TenantScope } from "@mos/contracts";

import type { StudioArtifactPackageId } from "../contracts/refs.js";
import type { LabToStudioProductionEntry } from "./contracts/lab-to-studio-entry.js";

// ---------------------------------------------------------------------------
// Deep freeze / clone helpers (pure-data records only — the store's payloads
// carry no functions by construction)
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

/** The store's private structural copy (D3 — never the caller's object). */
function cloneForStore(record: LabToStudioProductionEntry): LabToStudioProductionEntry {
  return {
    ...structuredClone({
      ...record,
      // D4: the record owns a fresh frozen copy of the caller's scope — the
      // caller's live scope object is never aliased into the store.
      scope: { tenantId: record.scope.tenantId, workspaceId: record.scope.workspaceId },
    }),
  };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** The append-only entry store (internal to the bridge; exposed for tests). */
export interface LabToStudioEntryStore {
  /** Append version 1 of a new entry (the entry attempt's own record). */
  appendFirstVersion(record: LabToStudioProductionEntry): LabToStudioProductionEntry;
  /**
   * Append the `packaged` successor version over the entry's `entered`
   * latest. Fails closed (typed string reasons) on unknown/cross-tenant
   * entry ids, non-entered latest versions, or an already-packaged chain.
   */
  appendPackagedVersion(
    scope: TenantScope,
    entryId: string,
    packageRef: { readonly packageId: string; readonly version: number },
  ): { ok: true; record: LabToStudioProductionEntry } | { ok: false; reason: string };
  /** One entry version (latest, or the exact version) — cross-tenant ≡ unknown. */
  getEntry(
    scope: TenantScope,
    entryId: string,
    version?: number,
  ): LabToStudioProductionEntry | undefined;
  /** Every entry chain's latest version of one tenant (creation order). */
  listLatestEntries(scope: TenantScope): readonly LabToStudioProductionEntry[];
  /** The full append-only version chain of one entry (ascending). */
  listEntryVersions(scope: TenantScope, entryId: string): readonly LabToStudioProductionEntry[];
}

/** Create the in-memory append-only entry store (the disclosed store double). */
export function createLabToStudioEntryStore(): LabToStudioEntryStore {
  /** JSON-array keys: tenantId → entryId → version chain (D1/D2 exact keys). */
  const chains = new Map<string, LabToStudioProductionEntry[]>();
  /** tenantId → entryIds in first-seen order (listing discipline). */
  const order = new Map<string, string[]>();

  const tenantKeyOf = (scope: TenantScope): string => JSON.stringify([String(scope.tenantId)]);
  const chainKeyOf = (scope: TenantScope, entryId: string): string =>
    JSON.stringify([String(scope.tenantId), entryId]);

  return {
    appendFirstVersion(record) {
      const chainKey = chainKeyOf(record.scope, record.id);
      const existing = chains.get(chainKey);
      if (existing !== undefined) {
        // Fail loud — the bridge core mints one entry id per attempt; a
        // collision here is a bridge defect, never a silent overwrite.
        throw new Error(`lab-to-studio entry store: entry id collision on ${chainKey}`);
      }
      // D3/D4: clone-then-deep-freeze — the caller's record is never aliased.
      const stored = deepFreeze(cloneForStore(record));
      chains.set(chainKey, [stored]);
      const tenantKey = tenantKeyOf(record.scope);
      order.set(tenantKey, [...(order.get(tenantKey) ?? []), record.id]);
      return stored;
    },
    appendPackagedVersion(scope, entryId, packageRef) {
      const chainKey = chainKeyOf(scope, entryId);
      const chain = chains.get(chainKey);
      if (chain === undefined || chain.length === 0) {
        return { ok: false, reason: `entry-not-found: no entry chain resolves for this tenant scope` };
      }
      const latest = chain[chain.length - 1];
      if (latest === undefined) {
        return { ok: false, reason: "entry-not-found: empty entry chain" };
      }
      if (latest.status === "packaged") {
        return { ok: false, reason: `entry-already-packaged: package ${String(latest.packageRef?.packageId)} is cited at version ${String(latest.version)}` };
      }
      if (latest.status !== "entered") {
        return { ok: false, reason: `entry-not-entered: latest status "${latest.status}" cannot cite a studio package (only entered entries package)` };
      }
      const successor: LabToStudioProductionEntry = {
        ...structuredClone(latest),
        status: "packaged",
        // The single disclosed brand-bridge point: the cited package id is
        // the packaging authority's own id riding the opaque branded ref
        // (the resolve call above already proved it through that authority).
        packageRef: { packageId: packageRef.packageId as StudioArtifactPackageId, version: packageRef.version },
        version: latest.version + 1,
        priorVersion: latest.version,
      };
      const stored = deepFreeze(cloneForStore(successor));
      chain.push(stored);
      return { ok: true, record: stored };
    },
    getEntry(scope, entryId, version) {
      const chain = chains.get(chainKeyOf(scope, entryId));
      if (chain === undefined || chain.length === 0) {
        return undefined;
      }
      if (version === undefined) {
        return chain[chain.length - 1];
      }
      return chain.find((record) => record.version === version);
    },
    listLatestEntries(scope) {
      const tenantKey = tenantKeyOf(scope);
      const entryIds = order.get(tenantKey);
      if (entryIds === undefined) {
        return [];
      }
      const latest: LabToStudioProductionEntry[] = [];
      for (const entryId of entryIds) {
        const chain = chains.get(chainKeyOf(scope, entryId));
        const record = chain?.[chain.length - 1];
        if (record !== undefined) {
          latest.push(record);
        }
      }
      return latest;
    },
    listEntryVersions(scope, entryId) {
      const chain = chains.get(chainKeyOf(scope, entryId));
      return chain === undefined ? [] : [...chain];
    },
  };
}
