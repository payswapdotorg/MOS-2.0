/**
 * DISCLOSED TEST DOUBLE — clock-driven job poller (JOBS-001).
 *
 * ⚠ IN-MEMORY DOUBLE ONLY — NEVER A SCHEDULING AUTHORITY ⚠
 *
 * The package has NO cron/HTTP-timer authority (§26: no synchronous HTTP
 * or Hobby-Cron scheduling authority): the ONLY dispatch surface is the
 * work-polling port `JobQueuePort.claimNextRunnable`. This double exists
 * so that consumption model is demonstrable in tests and local
 * development: a plain interval loop that claims the next runnable job
 * and hands it to a handler. Production worker mechanics (process
 * supervision, distribution, restarts) are substrate work — the future
 * Zcode task-infra adapter (documented seam) — and will call the SAME
 * claim port.
 *
 * Timers are injectable for determinism; the interval is stopped by
 * `stop()` and never restarted implicitly.
 */

import type { TenantId } from "@mos/contracts";

import type { DurableJobKind } from "../contracts/durable-job.js";
import type { JobClaim, JobClaimQuery, JobQueuePort } from "../ports/job-queue.port.js";

/** Injectable timers (defaults: real setInterval/clearInterval). */
export interface JobPollerTimers {
  setInterval(callback: () => void, ms: number): object;
  clearInterval(handle: object): void;
}

const realTimers: JobPollerTimers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Options for the disclosed poller double. */
export interface JobPollerDoubleOptions {
  readonly queue: JobQueuePort;
  readonly workerId: string;
  readonly tenantId?: TenantId;
  readonly kinds?: readonly DurableJobKind[];
  /** Poll interval in milliseconds. */
  readonly intervalMs: number;
  /** Worker logic for each claimed job (may be async). */
  readonly handler: (claim: JobClaim) => void | Promise<void>;
  /** Injectable timers (tests drive them manually). */
  readonly timers?: JobPollerTimers;
}

/** The running poller handle. */
export interface JobPollerDouble {
  start(): void;
  stop(): void;
  readonly started: boolean;
  /** How many poll ticks have run. */
  readonly pollCount: number;
  /** The claims handed to the handler, in order. */
  readonly claimed: readonly JobClaim[];
}

/** Creates the DISCLOSED clock-driven poller double. */
export function createJobPollerDouble(
  options: JobPollerDoubleOptions,
): JobPollerDouble {
  const timers = options.timers ?? realTimers;
  const query: JobClaimQuery = {
    workerId: options.workerId,
    ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
    ...(options.kinds === undefined ? {} : { kinds: options.kinds }),
  };
  let handle: object | undefined;
  let pollCount = 0;
  const claimed: JobClaim[] = [];

  async function poll(): Promise<void> {
    pollCount += 1;
    const claim = options.queue.claimNextRunnable(query);
    if (claim === null) {
      return;
    }
    claimed.push(claim);
    await options.handler(claim);
  }

  return {
    start(): void {
      if (handle !== undefined) {
        return;
      }
      handle = timers.setInterval(() => {
        void poll();
      }, options.intervalMs);
    },

    stop(): void {
      if (handle !== undefined) {
        timers.clearInterval(handle);
        handle = undefined;
      }
    },

    get started(): boolean {
      return handle !== undefined;
    },

    get pollCount(): number {
      return pollCount;
    },

    get claimed(): readonly JobClaim[] {
      return claimed;
    },
  };
}
