/**
 * MOS service transport port (WEB-001) — the DECLARED shape of the service
 * access layer over the retained WS/RPC substrate
 * (BROWSER-SHELL-REPLACEMENT-PLAN §2.3: `connectViaWebSocket` +
 * `RemoteServiceAccess` mechanics behind the `@mos/substrate-adapters` RPC
 * facade, BOOT-003).
 *
 * TYPES ONLY. The binding is deliberately NOT implemented in this package:
 * the frozen boundary harness (harness/mos-boundary-check.mjs) forbids bare
 * non-`@mos/*` imports in every scanned `packages/mos-web` source file, so
 * importing `@mos/substrate-adapters` here would fail the boundary battery —
 * and the registry dependency list for `web` is `[contracts]` regardless.
 * The TL-planned `MOS-WEB-PRESENTATION-ONLY` boundary-rule extension (plan
 * §5 step 3) is the vehicle to wire this transport at a typed composition
 * root. Until then the view ports are bound directly at the composition seam
 * (`testing/`), which is exactly what UX-001 runs on.
 */

/** A live connection to the MOS server transport. */
export interface MosServiceConnection {
  /** ISO-8601 timestamp at which the connection was established. */
  readonly connectedAt: string;
}

/**
 * The transport seam the production composition implements over the RPC
 * facade. The shell never touches a socket itself.
 */
export interface MosServiceTransport {
  /** Establish the connection; rejects when the MOS server is unreachable. */
  connect(): Promise<MosServiceConnection>;
  /** Close the connection (idempotent). */
  close(): void;
}
