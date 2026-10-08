/**
 * StudioSessionDirectory (STUDIO-014) — the runtime-observation seam behind
 * the operator product surface.
 *
 * The Studio runtime owns its sessions; the standalone product surface needs
 * session LISTING/DETAIL without a new runtime method (the runtime is AT the
 * 12-method policy budget — new surfaces go on NEW ports). This directory is
 * that port: the runtime's centralized state mutators (creation, lifecycle
 * transitions, participant joins, package attachments — all in
 * runtime/session-state.ts) notify the summary of the session they just
 * changed, and the implementation keeps the latest summary per
 * (tenant, session) for exact-tenant listing.
 *
 * 3 public methods (architecture policy budget: 12). The summaries are
 * projections of the runtime's OWN published state (never caller-supplied
 * session data): `recordSessionSummary` is only ever called by the runtime's
 * own mutators; the read side lists what the runtime published.
 */

import type { TenantScope } from "@mos/contracts";

import type {
  StudioSessionId,
  TenantId,
  Timestamp,
} from "../contracts/refs.js";

/** The summary projection the runtime publishes on every mutation. */
export interface StudioSessionSummaryRecord {
  readonly sessionRef: StudioSessionId;
  readonly tenantId: TenantId;
  readonly formatId: string;
  readonly formatVersion: number;
  readonly lifecycleState: string;
  readonly createdAt: Timestamp;
  readonly participantCount: number;
  readonly organizationRef: { readonly id: string; readonly version: number };
  readonly artifactPackageRef: { readonly packageId: string; readonly version: number } | null;
}

/**
 * The session directory seam. Implementations keep the LATEST summary per
 * (tenant, session) — exact-tenant equality on listing (the W9-B D2
 * discipline); histories live on the session's own append-only lifecycle.
 */
export interface StudioSessionDirectory {
  /** Record (replace) the latest summary of one session (runtime mutators only). */
  recordSessionSummary(summary: StudioSessionSummaryRecord): void;
  /** Latest summaries of every session of ONE tenant, ascending by creation. */
  listSessionSummaries(scope: TenantScope): readonly StudioSessionSummaryRecord[];
  /** The latest summary of one session (exact tenant + session; no existence leak across tenants). */
  getSessionSummary(scope: TenantScope, sessionId: StudioSessionId): StudioSessionSummaryRecord | undefined;
}
