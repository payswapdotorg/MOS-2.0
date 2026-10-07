/**
 * SessionEventsPort — session lifecycle + event subscription.
 *
 * MOS v2.0 (W0-B / BOOT-003). MOS-owned contract surface.
 * PORT INVARIANT: files under `src/ports/**` NEVER import `@zcode/*`.
 *
 * Architecture role: the ZCode substrate provides session lifecycle and
 * eventing mechanics (see substrate inventory, "Session/eventing" row).
 * MOS keeps its own session authority separate from the substrate; this
 * port exposes only the mechanics MOS domain code needs: open/close a
 * substrate session and subscribe to its ordered event stream inside a
 * MOS-owned envelope. Session business state (who owns it, what it means)
 * stays in MOS modules, never in the substrate.
 */

import type { JsonValue } from "./rpc.port.ts";

/** Opaque substrate session identifier. */
export type SessionId = string;

/** Tenant identifier the session is scoped to. */
export type TenantId = string;

/** Session lifecycle state. */
export type SessionLifecycleState = "active" | "closed";

/** Session event types (MOS-owned vocabulary; substrate-agnostic). */
export type SessionEventType =
  | "session.created"
  | "session.closed"
  | "message.appended"
  | "message.updated"
  | "participant.joined"
  | "participant.left"
  | "state.changed";

/**
 * MOS-owned event envelope delivered by {@link SessionEventsPort.subscribe}.
 * `sequence` is monotonic per session; consumers detect gaps and reorderings
 * by comparing sequence numbers.
 */
export interface SessionEventEnvelope {
  readonly sessionId: SessionId;
  readonly sequence: number;
  /** RFC 3339 timestamp of occurrence. */
  readonly occurredAt: string;
  readonly type: SessionEventType;
  readonly payload: JsonValue;
  /** Envelope schema version — allows evolution without silent rewrites. */
  readonly schemaVersion: 1;
}

/** Request to open a substrate session. */
export interface SessionOpenRequest {
  readonly tenantId: TenantId;
  /** Logical session kind (e.g. `studio`, `lab`); substrate-opaque. */
  readonly kind?: string;
  /** Arbitrary transport-safe metadata recorded at open time. */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Summary of an opened session. */
export interface SessionSummary {
  readonly sessionId: SessionId;
  readonly tenantId: TenantId;
  readonly state: SessionLifecycleState;
  /** RFC 3339 open timestamp. */
  readonly openedAt: string;
  /** Highest event sequence observed for this session, if any. */
  readonly lastEventSequence?: number;
}

/** Result of closing a session. */
export interface SessionCloseResult {
  readonly sessionId: SessionId;
  readonly closed: boolean;
}

/** Listener invoked for each event envelope. */
export type SessionEventListener = (envelope: SessionEventEnvelope) => void;

/** Handle for an active event subscription. */
export interface SessionEventSubscription {
  /** Stop delivering events. Idempotent. */
  dispose(): void;
}

/** Session lifecycle + event subscription surface. */
export interface SessionEventsPort {
  openSession(request: SessionOpenRequest): Promise<SessionSummary>;
  closeSession(sessionId: SessionId): Promise<SessionCloseResult>;
  subscribe(
    sessionId: SessionId,
    listener: SessionEventListener,
  ): Promise<SessionEventSubscription>;
}
