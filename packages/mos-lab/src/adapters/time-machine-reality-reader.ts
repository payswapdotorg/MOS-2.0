import type { TenantScope, Timestamp } from '@mos/contracts';
import type {
  HistoricalObservation,
  HistoricalObservationId,
} from '../contracts/evidence.js';
import type { TimeMachinePort } from '../contracts/time-machine.js';
import type { RealityObservationReaderPort } from '../contracts/online-calibration.js';

/**
 * The `RealityObservationReaderPort` binding over the REAL LAB-006 Time
 * Machine (LAB-018's reality-side seam, real-surface composition).
 *
 * The reader resolves a DECLARED observation ref by replaying the tenant's
 * historical timeline (mode 1 — `replayHistorical`) at the DECLARED
 * visibility horizon `asOf` and matching the id: an observation resolves
 * ONLY when it is part of the tenant's append-only timeline AND its
 * `observedAt <= asOf` (the same visibility rule as mode-1 replay — a
 * future observation is unresolvable, `null`, never leaked). Everything
 * else about the timeline — append-only immutability, tenant scoping,
 * ascending order — is the REAL Time Machine's own discipline.
 *
 * This is a shipped IN-PACKAGE composition adapter (both surfaces are this
 * package's own); it is the binding the in-package calibration loop tests
 * and the compat battery run over, and the shape the production
 * evidence/measurement authority's adapter mirrors.
 */

/** Options for {@link createTimeMachineRealityReader}. */
export interface TimeMachineRealityReaderOptions {
  /** The REAL Time Machine (mode-1 replay ONLY). */
  readonly machine: Pick<TimeMachinePort, 'replayHistorical'>;
  /**
   * The DECLARED visibility horizon: an observation resolves only when
   * `observedAt <= asOf` (mode-1 replay semantics — never a future leak).
   */
  readonly asOf: Timestamp;
}

export function createTimeMachineRealityReader(
  options: TimeMachineRealityReaderOptions,
): RealityObservationReaderPort {
  const { machine, asOf } = options;
  return {
    async getObservation(
      scope: TenantScope,
      id: HistoricalObservationId,
    ): Promise<HistoricalObservation | null> {
      const replay = await machine.replayHistorical(scope, { asOf });
      if ('error' in replay) {
        // The replay query is a fixed valid one; an error here means the
        // machine itself failed — surface it loudly, never as a null
        // (a null would masquerade as "observation does not exist").
        throw new Error(
          `time-machine reality reader: replayHistorical failed: [${replay.error}] ${replay.message}`,
        );
      }
      return replay.find((observation) => observation.id === id) ?? null;
    },
  };
}
