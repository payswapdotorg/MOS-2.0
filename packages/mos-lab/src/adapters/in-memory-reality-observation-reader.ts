import type { TenantId, TenantScope, Version } from '@mos/contracts';
import type {
  HistoricalObservation,
  HistoricalObservationId,
} from '../contracts/evidence.js';
import type { HistoricalObservationDraft } from '../contracts/time-machine.js';
import type { RealityObservationReaderPort } from '../contracts/online-calibration.js';
import { cloneDeep, deepFreeze } from './parametric-support.js';

/**
 * The DISCLOSED in-memory `RealityObservationReaderPort` double (LAB-018's
 * reality-side seam).
 *
 * What is doubled: the resolution of DECLARED observation refs against the
 * boundary chain's reality storage. What is REAL: nothing — the records are
 * SEEDED here as frozen `HistoricalObservation` values (the one record type
 * the lab treats as real-world evidence; `counterfactual: false` by
 * branded type AND by the stored literal). The production adapter resolves
 * refs against the real evidence/measurement authority through the same
 * port; the shipped Time Machine composition adapter
 * (time-machine-reality-reader.ts) is the real-surface in-package binding.
 *
 * W9-B disciplines by construction: composite keys are JSON array keys
 * (injective over the (tenant, id) tuple); stored records are
 * clone-then-deep-frozen (caller-owned data is never frozen or retained);
 * the tenant scope is read at call time into the key (no caller-aliased
 * scope retention — post-hoc tenant forgery is structurally impossible);
 * reads are pure (an unknown tenant/id observes `null`, never an existence
 * leak).
 */

/** One seed row: a draft observation plus the scope it is recorded under. */
export interface RealityObservationSeedInput {
  readonly scope: TenantScope;
  readonly observation: HistoricalObservationDraft;
}

/** Options for {@link createInMemoryRealityObservationReader}. */
export interface InMemoryRealityObservationReaderOptions {
  /** Initial seed rows (registered in order; duplicate ids fail closed). */
  readonly seeds?: readonly RealityObservationSeedInput[];
}

/**
 * Typed fail-closed seed rejection (the W10-B named-error defense-in-depth
 * pattern): the double's registration path throws a NAMED typed error —
 * callers can discriminate a seeding fault (malformed draft, blank id,
 * duplicate id in the tenant scope) from an unrelated store bug. The
 * message texts are load-bearing (the adversarial battery pins them).
 */
export class RealityObservationSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealityObservationSeedError';
  }
}

const isBlank = (value: string): boolean => value.trim().length === 0;

export function createInMemoryRealityObservationReader(
  options: InMemoryRealityObservationReaderOptions = {},
): RealityObservationReaderPort & {
  /** Seed one more observation draft (the double's registration path). */
  seed(input: RealityObservationSeedInput): void;
} {
  /** Frozen observations keyed by JSON array [tenant, id] (W9-B: injective). */
  const observations = new Map<string, HistoricalObservation>();

  const keyOf = (scope: TenantScope, id: HistoricalObservationId): string =>
    JSON.stringify([scope.tenantId as string, id as string]);

  const seed = (input: RealityObservationSeedInput): void => {
    const draft = input.observation;
    if (draft === null || typeof draft !== 'object') {
      throw new RealityObservationSeedError(
        'reality observation seed: the draft must be an object',
      );
    }
    if (typeof draft.id !== 'string' || isBlank(draft.id)) {
      throw new RealityObservationSeedError(
        'reality observation seed: the draft id must be a non-empty string',
      );
    }
    const key = keyOf(input.scope, draft.id);
    if (observations.has(key)) {
      throw new RealityObservationSeedError(
        `reality observation seed: duplicate observation id "${draft.id}" in this tenant scope`,
      );
    }
    // CLONE-THEN-FREEZE OWNERSHIP (the W10-A recovery audit fix — the first
    // attempt passed the caller's `metrics`/`sourceRefs` arrays straight
    // into deepFreeze, freezing CALLER-owned data in place): every
    // caller-supplied field is cloned into the adapter's own structure
    // before freezing, so the frozen record can never freeze or corrupt
    // data the seeder still owns.
    const record: HistoricalObservation = deepFreeze(cloneDeep({
      id: draft.id,
      version: 1 as Version,
      tenantId: input.scope.tenantId as TenantId,
      niche: draft.niche,
      platform: draft.platform,
      metrics: draft.metrics,
      observedAt: draft.observedAt,
      sourceRefs: draft.sourceRefs,
      ...(draft.regime !== undefined ? { regime: draft.regime } : {}),
      counterfactual: false,
    }));
    observations.set(key, record);
  };

  for (const row of options.seeds ?? []) {
    seed(row);
  }

  return {
    seed,
    async getObservation(
      scope: TenantScope,
      id: HistoricalObservationId,
    ): Promise<HistoricalObservation | null> {
      return observations.get(keyOf(scope, id)) ?? null;
    },
  };
}
