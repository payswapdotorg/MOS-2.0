/**
 * Re-entrant global-fetch denial guard (ENG-003).
 *
 * The sandbox context's network seam is the ONLY sanctioned network path,
 * but an in-process adapter could also reach for the ambient `fetch`
 * directly. This guard closes that door for the duration of every adapter
 * invocation: `globalThis.fetch` is replaced with a stub that throws the
 * typed `network-access-denied` violation, and the ORIGINAL fetch is
 * returned to the runner so the explicitly-granted network seam can still
 * delegate to real transport when policy allows.
 *
 * Re-entrancy: concurrent `submit` calls in one process nest the guard;
 * the original is restored only when the last invocation releases it.
 *
 * DISCLOSED LIMIT (in-memory runner): a real production runner isolates
 * engines in a separate process/container where the ambient network
 * posture is enforced by the OS/sandbox, not by monkey-patching. This
 * guard is the in-process enforcement double of that contract — honest
 * about what an in-memory adapter can and cannot do.
 */

import { EngineSandboxViolationError } from "../domain/errors.js";

/** Replacement installed while the guard is held. */
function deniedFetch(): Promise<Response> {
  return Promise.reject(
    new EngineSandboxViolationError(
      "network-access-denied",
      "ambient fetch() is denied inside the engine sandbox; use the sandbox network seam (context.network.request)",
    ),
  );
}

export interface FetchGuard {
  /**
   * Enters the guarded window (nests). Returns the ORIGINAL fetch (may be
   * `undefined` on platforms without ambient fetch) for the granted
   * network seam to delegate through.
   */
  acquire(): typeof fetch | undefined;
  /** Leaves the guarded window (restores the original on the last exit). */
  release(): void;
}

/** Creates the re-entrant ambient-fetch denial guard. */
export function createFetchGuard(): FetchGuard {
  let depth = 0;
  let held: { readonly original: typeof fetch } | undefined;

  return {
    acquire(): typeof fetch | undefined {
      if (depth === 0) {
        const ambient = globalThis.fetch;
        if (ambient !== undefined) {
          globalThis.fetch = deniedFetch;
          held = { original: ambient };
        }
      }
      depth += 1;
      return held?.original;
    },

    release(): void {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && held !== undefined) {
        globalThis.fetch = held.original;
        held = undefined;
      }
    },
  };
}
