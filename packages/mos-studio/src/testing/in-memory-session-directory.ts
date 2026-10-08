/**
 * DISCLOSED in-memory double of the StudioSessionDirectory (STUDIO-014).
 *
 * Keeps the LATEST runtime-published summary per (tenant, session) with
 * exact-equality keys (no delimiter-injectable composite key exists, W9-B
 * D1/D2) and lists per tenant in creation order. The records are
 * clone-then-deep-frozen (D3): the runtime's summary is never aliased and a
 * returned record is immutable bit-for-bit. NOT a production binding — the
 * TL composition root binds a durable store behind the same port.
 */

import type {
  StudioSessionDirectory,
  StudioSessionSummaryRecord,
} from "../ports/session-directory.port.js";

/** Deep-freeze a plain-data summary record (W9-B D3). */
function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Options of {@link createInMemorySessionDirectory}. */
export interface InMemorySessionDirectoryOptions {
  /**
   * Observation hook for tests: invoked on EVERY recorded summary (the full
   * append-only observation trail — the listing surface keeps only latest).
   */
  readonly onRecorded?: (summary: StudioSessionSummaryRecord) => void;
}

/** Create the in-memory session directory (disclosed test double). */
export function createInMemorySessionDirectory(
  options: InMemorySessionDirectoryOptions = {},
): StudioSessionDirectory & {
  /** Test inspection: every summary the runtime published, in order. */
  readonly recordedSummaries: readonly StudioSessionSummaryRecord[];
} {
  /** tenantId → sessionId → latest summary (exact keys, D1/D2). */
  const latest = new Map<string, Map<string, StudioSessionSummaryRecord>>();
  /** tenantId → sessionIds in first-seen (creation) order. */
  const order = new Map<string, string[]>();
  const trail: StudioSessionSummaryRecord[] = [];

  const recordSessionSummary = (summary: StudioSessionSummaryRecord): void => {
    const tenantKey = String(summary.tenantId);
    const sessionKey = String(summary.sessionRef);
    let byTenant = latest.get(tenantKey);
    if (byTenant === undefined) {
      byTenant = new Map<string, StudioSessionSummaryRecord>();
      latest.set(tenantKey, byTenant);
    }
    if (!byTenant.has(sessionKey)) {
      order.set(tenantKey, [...(order.get(tenantKey) ?? []), sessionKey]);
    }
    // Clone-then-deep-freeze: the caller's record is never aliased (D3).
    const frozen = deepFreeze(structuredClone(summary)) as StudioSessionSummaryRecord;
    byTenant.set(sessionKey, frozen);
    trail.push(frozen);
    options.onRecorded?.(frozen);
  };

  return {
    recordSessionSummary,
    listSessionSummaries(scope) {
      const tenantKey = String(scope.tenantId);
      const byTenant = latest.get(tenantKey);
      if (byTenant === undefined) {
        return [];
      }
      return (order.get(tenantKey) ?? []).map(
        (sessionKey) => byTenant.get(sessionKey) as StudioSessionSummaryRecord,
      );
    },
    getSessionSummary(scope, sessionId) {
      return latest.get(String(scope.tenantId))?.get(String(sessionId));
    },
    get recordedSummaries(): readonly StudioSessionSummaryRecord[] {
      return [...trail];
    },
  };
}
