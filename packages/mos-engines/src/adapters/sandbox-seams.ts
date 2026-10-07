/**
 * Sandbox execution seams for the in-memory engine runner (ENG-003).
 *
 * - the fail-closed network seam (the ONLY network surface an adapter
 *   sees; denied unless the effective policy explicitly grants, and even
 *   then only to granted hosts through the configured transport);
 * - the default timer seam (real setTimeout; tests inject manual timers
 *   so deadline enforcement is deterministic);
 * - the internal timeout signal for the deadline race.
 */

import { EngineSandboxViolationError } from "../domain/errors.js";
import type { NetworkPolicy, SandboxNetworkPort } from "../ports/engine-runner.port.js";

/** Injectable timer seam (default: real setTimeout). */
export interface EngineRunnerTimers {
  /** Schedules `callback` after `ms`; returns the cancel function. */
  set(ms: number, callback: () => void): () => void;
}

const defaultTimers: EngineRunnerTimers = {
  set: (ms, callback) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Creates the sandbox network seam. Every request under a denied policy —
 * or to a non-granted host, or without a configured transport — fails
 * closed with the typed violation; the runner converts it into the job's
 * typed failure so the run NEVER silently proceeds.
 */
export function createSandboxNetwork(
  policy: NetworkPolicy,
  fetchImpl: ((url: string) => Promise<Uint8Array>) | undefined,
): SandboxNetworkPort {
  return {
    policy,
    async request(url: string): Promise<Uint8Array> {
      if (policy.access === "denied") {
        throw new EngineSandboxViolationError(
          "network-access-denied",
          `network is denied by the engine sandbox policy (requested ${url})`,
          { url },
        );
      }
      const host = hostOf(url);
      if (!policy.allowedHosts.includes(host)) {
        throw new EngineSandboxViolationError(
          "network-host-not-granted",
          `host "${host}" is not in the granted host list`,
          { url, host },
        );
      }
      if (fetchImpl === undefined) {
        throw new EngineSandboxViolationError(
          "network-access-denied",
          "no network transport is configured for the sandbox seam",
          { url },
        );
      }
      return fetchImpl(url);
    },
  };
}

/** Internal signal for the deadline race (never escapes the runner). */
export class EngineJobTimeoutSignal extends Error {
  constructor(readonly limitMs: number) {
    super(`engine job exceeded its ${limitMs}ms wall-clock deadline`);
    this.name = "EngineJobTimeoutSignal";
  }
}

export { defaultTimers };
