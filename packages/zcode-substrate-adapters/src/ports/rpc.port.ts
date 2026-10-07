/**
 * RpcPort — transport-agnostic request/response + notification surface.
 *
 * MOS v2.0 (W0-B / BOOT-003). This file is MOS-owned contract surface.
 * PORT INVARIANT: files under `src/ports/**` NEVER import `@zcode/*`.
 * Only files under `src/adapters/**` may import allowlisted `@zcode/*`
 * package entries (see `harness/mos-boundary-rules.json`).
 *
 * Design notes:
 * - The port models the two substrate mechanics MOS domain code actually
 *   consumes today: request/response calls and inbound notification (event)
 *   streams. Outbound fire-and-forget notifications are deliberately NOT
 *   modeled at this stage: the underlying `@zcode/rpc` channel primitive
 *   (call/listen) has no client-originated notification form, so adding one
 *   here would create a fake contract surface. Revisit with a follow-up work
 *   item if a concrete need appears.
 * - Payload typing at this level is the caller's responsibility: the
 *   substrate channel is untyped end-to-end, so `request<Res>` is an
 *   assertion, not a guarantee. Typed request/response contracts belong to
 *   `@mos/contracts` (CORE-001), which layers on top of this port.
 */

/** JSON value shape that can safely cross a transport boundary. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Per-call options for an RPC request. */
export interface RpcCallOptions {
  /**
   * Reject the call with {@link RpcTimeoutError} if no response arrives in
   * time. The underlying substrate call is not cancelled — only the caller's
   * promise is rejected.
   */
  readonly timeoutMs?: number;
}

/** Raised when a request exceeds its `timeoutMs`. */
export class RpcTimeoutError extends Error {
  readonly code = "MOS_RPC_TIMEOUT";
  readonly method: string;
  readonly timeoutMs: number;

  constructor(method: string, timeoutMs: number) {
    super(`RPC request "${method}" timed out after ${timeoutMs}ms`);
    this.name = "RpcTimeoutError";
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
}

/** Handle for an active notification subscription. */
export interface RpcSubscription {
  /** Stop delivering notifications to the listener. Idempotent. */
  dispose(): void;
}

/** Listener invoked for each inbound notification payload. */
export type RpcNotificationListener<T> = (payload: T) => void;

/**
 * Transport-agnostic RPC port.
 *
 * Implementations are expected to be full-duplex channel facades
 * (WebSocket, IPC, in-process). The port is intentionally narrow:
 * request/response + notification subscription only.
 */
export interface RpcPort {
  /**
   * Send a request and await the response.
   *
   * @param method   Remote method name.
   * @param params   Optional request payload (must be transport-safe JSON).
   * @param options  Optional per-call options (timeout).
   * @returns The response payload. Typed by caller assertion.
   */
  request<Res>(method: string, params?: JsonValue, options?: RpcCallOptions): Promise<Res>;

  /**
   * Subscribe to an inbound notification/event stream.
   *
   * @param event    Notification/event name on the substrate channel.
   * @param listener Invoked for every payload delivered for `event`.
   * @returns Subscription handle; call `dispose()` to unsubscribe.
   */
  onNotification<T>(event: string, listener: RpcNotificationListener<T>): RpcSubscription;
}
