/**
 * Shared failure constructors of the Studio runtime (STUDIO-001).
 *
 * Tiny helpers split out of `studio-runtime.ts` (file-length policy):
 * `notFound` for unknown sessions and `stateError` for operations attempted
 * in a lifecycle state that does not allow them.
 */

import type { StudioSessionId } from "../contracts/refs.js";
import type { StudioRuntimeError } from "./errors.js";
import type { StudioSessionRecord } from "./session-state.js";

/** `session-not-found` failure for an unknown session id. */
export function notFound(sessionId: StudioSessionId): { ok: false; error: StudioRuntimeError } {
  return { ok: false, error: { kind: "session-not-found", sessionId } };
}

/** `operation-not-allowed-in-state` failure for the session's current state. */
export function stateError(operation: string, record: StudioSessionRecord): { ok: false; error: StudioRuntimeError } {
  return {
    ok: false,
    error: { kind: "operation-not-allowed-in-state", operation, state: record.session.lifecycle.state },
  };
}
