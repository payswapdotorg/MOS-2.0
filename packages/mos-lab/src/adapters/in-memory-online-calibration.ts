import type { TenantId, TenantScope, Timestamp, Version } from '@mos/contracts';
import type {
  HistoricalObservation,
  HistoricalObservationId,
} from '../contracts/evidence.js';
import type { LabCalibrationId } from '../contracts/online-calibration.js';
import type { RobustBenchmarkId } from '../contracts/robust-benchmark.js';
import type {
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from '../contracts/robust-benchmark-port.js';
import type {
  CalibrationObservationCitation,
  CalibrationPredictedStatement,
  OnlineCalibrationRecord,
  RecordCalibrationErrorInput,
  RealityObservationReaderPort,
} from '../contracts/online-calibration.js';
import type {
  CalibrationContextIntegrityReport,
  CalibrationContextRecord,
  CalibrationIntegrityReport,
  DeriveCalibrationContextInput,
  OnlineCalibrationError,
  OnlineCalibrationPort,
} from '../contracts/online-calibration-port.js';
import { computeRewardValue } from './reward-computation.js';
import { cloneDeep, deepFreeze } from './parametric-support.js';
import {
  checkObservationConsistency,
  validateCalibrationContextRequest,
  validateCalibrationErrorRequest,
} from './calibration-validation.js';
import {
  calibrationContextDigestOf,
  calibrationErrorDigestOf,
  calibrationFailure,
  calibrationSummaryOf,
  computeCalibrationError,
  errorRecordCitationsOf,
  observedMetricMeansOf,
  observedStatsOf,
} from './calibration-support.js';

/**
 * The in-memory online calibration (LAB-018).
 *
 * W10-A DISCLOSURE — ANALYSIS ARTIFACT, NOT AN AUTHORITY. The calibration
 * records the simulation-to-reality prediction error of the DECLARED frozen
 * LAB-017 benchmark prediction (consumed through the injected benchmark
 * reader — the seam LAB-017 declared as pending-reality) against the
 * DECLARED boundary-chain reality observations (resolved through the
 * injected `RealityObservationReaderPort`; `HistoricalObservation` records
 * only — never lab-simulated data, re-validated `counterfactual === false`
 * at runtime). It is NOT an experiment and NOT a measurement (§19/§20 — no
 * second authority); the derived context is DECLARED versioned feedback a
 * later benchmark run MAY cite (§24).
 *
 * HISTORICAL EVIDENCE NEVER REWRITTEN (the backlog acceptance, verbatim):
 * error records chain per (tenant, calibration id) and are append-only
 * (recordCalibrationError is the ONLY error write path); contexts chain per
 * (tenant, benchmark id) and are append-only (deriveCalibrationContext is
 * the ONLY context write path). There is NO update or delete method on
 * either surface; stored records are deep-frozen clone-then-freeze
 * snapshots, digest-sealed for bit-for-bit verification; a LATER
 * calibration NEVER rewrites an earlier error record (it appends), and the
 * cited benchmark record and historical observations are only ever READ.
 *
 * W9-B disciplines by construction: composite keys are JSON array keys;
 * stored records are clone-then-deep-frozen; the tenant scope is read at
 * call time into the key (no caller-aliased scope retention); per-tenant
 * listings compare the STORED record's tenant EXACTLY (never a prefix
 * scan); every numeric field passes a finite guard before storage.
 *
 * Ephemeral process-local scaffold (durable persistence is TL-owned).
 */

/** Options for {@link createInMemoryOnlineCalibration}. */
export interface InMemoryOnlineCalibrationOptions {
  /**
   * The LAB-017 benchmark record reader (the DECLARED seam consumer —
   * read-only). Structurally the `MarketingBenchmarkPort`'s record reads;
   * the composition root (and the testing seam) wires the real benchmark
   * port here, late-bound when the benchmark adapter in turn wires this
   * adapter's context reader (the loop's two-directional wiring).
   */
  readonly benchmark: Pick<
    MarketingBenchmarkPort,
    'getBenchmarkRecord' | 'resolveLatestBenchmarkRecord'
  >;
  /** The boundary-chain reality observation reader. */
  readonly reality: RealityObservationReaderPort;
  /** Injectable clock for deterministic `recordedAt`/`derivedAt` stamps. */
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

export function createInMemoryOnlineCalibration(
  options: InMemoryOnlineCalibrationOptions,
): OnlineCalibrationPort {
  const now = options.now ?? nowDefault;
  /**
   * Error-record chains keyed by JSON array [tenant, calibration id]
   * (W9-B: injective over the tuple — a hostile tenant id containing any
   * delimiter can never alias another tenant's chain).
   */
  const chains = new Map<string, OnlineCalibrationRecord[]>();
  /** Context chains keyed by JSON array [tenant, benchmark id]. */
  const contexts = new Map<string, CalibrationContextRecord[]>();

  const errorChainKey = (scope: TenantScope, id: string): string =>
    JSON.stringify([scope.tenantId as string, id as string]);
  const contextChainKey = (scope: TenantScope, benchmarkId: string): string =>
    JSON.stringify([scope.tenantId as string, benchmarkId as string]);

  /** READ view of one error chain — never creates store entries. */
  const errorChainOf = (scope: TenantScope, id: string): readonly OnlineCalibrationRecord[] =>
    chains.get(errorChainKey(scope, id)) ?? [];
  /** READ view of one context chain — never creates store entries. */
  const contextChainOf = (
    scope: TenantScope,
    benchmarkId: string,
  ): readonly CalibrationContextRecord[] =>
    contexts.get(contextChainKey(scope, benchmarkId)) ?? [];

  /** Every error record citing one benchmark chain, deterministic (id, version) order. */
  const errorsForBenchmark = (
    scope: TenantScope,
    benchmarkId: RobustBenchmarkId,
  ): readonly OnlineCalibrationRecord[] => {
    const matches: OnlineCalibrationRecord[] = [];
    for (const [, chain] of chains) {
      for (const record of chain) {
        // W9-B: EXACT tenant equality on the stored record (never a
        // prefix scan — a delimiter-laden tenant id must not widen it).
        if (
          (record.tenantId as string) === (scope.tenantId as string) &&
          (record.prediction.benchmarkId as string) === (benchmarkId as string)
        ) {
          matches.push(record);
        }
      }
    }
    // Deterministic (id, version) order — the context basis is stable
    // regardless of chain insertion order.
    return matches.sort((a, b) => {
      if ((a.id as string) !== (b.id as string)) {
        return (a.id as string) < (b.id as string) ? -1 : 1;
      }
      return a.version - b.version;
    });
  };

  return {
    async recordCalibrationError(
      input: RecordCalibrationErrorInput,
    ): Promise<OnlineCalibrationRecord | OnlineCalibrationError> {
      // ---- 1. structural validation (fail closed, named codes —
      //      calibration-validation.ts) ----
      const requestFault = validateCalibrationErrorRequest(input);
      if (requestFault !== null) {
        return requestFault;
      }

      // ---- 2. resolve the DECLARED prediction against the frozen
      //      LAB-017 record (the consumed seam — READ ONLY) ----
      const benchmarkRecord: RobustBenchmarkRecord | null =
        await options.benchmark.getBenchmarkRecord(
          input.scope,
          input.prediction.benchmarkId,
          input.prediction.benchmarkVersion,
        );
      if (benchmarkRecord === null) {
        // Scoped latest disclosure only (a foreign tenant's chain is
        // indistinguishable from an unknown one — no existence leak).
        const latest = await options.benchmark.resolveLatestBenchmarkRecord(
          input.scope,
          input.prediction.benchmarkId,
        );
        if (latest === null) {
          return calibrationFailure(
            'unknown-benchmark',
            `no benchmark chain ${input.prediction.benchmarkId} visible in this tenant scope`,
          );
        }
        return calibrationFailure(
          'benchmark-version-not-found',
          `benchmark ${input.prediction.benchmarkId} has no version ${input.prediction.benchmarkVersion} in this tenant scope (latest is ${latest.version})`,
        );
      }
      if (benchmarkRecord.counterfactual !== true) {
        // Runtime label re-validation (the double-cast guard): the frozen
        // benchmark statement being calibrated IS a counterfactual
        // simulation output (lock rule 29) — anything else fails closed.
        return calibrationFailure(
          'prediction-not-counterfactual',
          'the cited benchmark record does not carry the counterfactual label — only frozen counterfactual benchmark predictions are calibratable',
        );
      }
      const ranked = benchmarkRecord.ranked.find(
        (entry) => entry.key === input.prediction.candidateKey,
      );
      if (ranked === undefined) {
        return calibrationFailure(
          'unknown-candidate',
          `candidate key "${input.prediction.candidateKey}" is not part of benchmark ${input.prediction.benchmarkId} v${input.prediction.benchmarkVersion}`,
        );
      }
      if (input.rewardSpec.version !== benchmarkRecord.provenance.rewardSpecVersion) {
        return calibrationFailure(
          'reward-version-mismatch',
          `rewardSpec.version ${input.rewardSpec.version} does not match the calibrated prediction's rewardSpecVersion ${benchmarkRecord.provenance.rewardSpecVersion} — both sides must be valued under the SAME declared objective`,
        );
      }

      // ---- 3. resolve the DECLARED reality observations (READ ONLY) ----
      const resolved: HistoricalObservation[] = [];
      for (const ref of input.observationRefs) {
        const observation = await options.reality.getObservation(
          input.scope,
          ref as HistoricalObservationId,
        );
        if (observation === null) {
          return calibrationFailure(
            'unknown-observation',
            `reality observation "${ref}" does not resolve in this tenant scope — the declared ref must exist before it can be calibrated against`,
          );
        }
        if (observation.counterfactual !== false) {
          // Runtime label re-validation (the double-cast guard): NEVER
          // lab-simulated data as reality (lock rule 29).
          return calibrationFailure(
            'observation-not-historical',
            `observation "${ref}" is not historical evidence (counterfactual !== false) — lab-simulated data can never occupy the reality slot`,
          );
        }
        resolved.push(observation);
      }

      // ---- 4. observation consistency (one regime, one context —
      //      calibration-validation.ts) ----
      const consistencyFault = checkObservationConsistency(resolved);
      if (consistencyFault !== null) {
        return consistencyFault;
      }
      const regime0 = (resolved[0] as HistoricalObservation).regime as string;

      // ---- 5. observed means + observed outcome (LAB-008 discipline) ----
      const stats = observedStatsOf(resolved);
      if ('failure' in stats) {
        return calibrationFailure(stats.failure, stats.detail);
      }
      const observedOutcome = computeRewardValue(input.rewardSpec, {
        predictedMetrics: new Map(),
        predictedDeltas: new Map(),
        observedMeans: stats.means,
      });
      if ('failure' in observedOutcome) {
        return calibrationFailure(
          observedOutcome.failure,
          `reward term source "${observedOutcome.metricSource}" does not resolve in the observed metric domain — reality-side values come from the declared observations only, never invented (LAB-008 discipline)`,
        );
      }

      // ---- 6. the DECLARED error functional (finite-guarded) ----
      const predicted: CalibrationPredictedStatement = {
        expectedReward: ranked.evaluation.expectedReward,
        interval: ranked.evaluation.interval,
        uncertainty: ranked.evaluation.uncertainty,
        provenance: ranked.provenance,
      };
      const error = computeCalibrationError(predicted, observedOutcome.reward);
      if ('failure' in error) {
        return calibrationFailure(
          error.failure,
          'the error computation produced a non-finite value — no NaN/Infinity can enter a stored error record',
        );
      }

      // ---- 7. assemble + append the frozen, digest-sealed record ----
      // CLONE-THEN-FREEZE OWNERSHIP: every caller-supplied object/array is
      // cloned into the record before freezing — the frozen record can
      // never freeze or corrupt data the caller still owns, and the cited
      // benchmark/observation values were READ-ONLY copies already.
      const citations: readonly CalibrationObservationCitation[] = resolved.map(
        (observation) => ({
          observationId: observation.id,
          niche: observation.niche,
          platform: observation.platform,
          observedAt: observation.observedAt,
          sourceRefs: observation.sourceRefs,
          regime: observation.regime as string,
        }),
      );
      const version = (errorChainOf(input.scope, input.calibrationId).length + 1) as Version;
      const base = {
        id: input.calibrationId as LabCalibrationId,
        version,
        tenantId: input.scope.tenantId as TenantId,
        prediction: cloneDeep(input.prediction),
        predicted,
        observations: citations,
        observedMetricMeans: observedMetricMeansOf(stats),
        observedOutcome: observedOutcome.reward,
        rewardSpecVersion: input.rewardSpec.version,
        functional: cloneDeep(input.functional),
        signedError: error.signedError,
        absoluteError: error.absoluteError,
        relativeError: error.relativeError,
        intervalContainment: error.intervalContainment,
        regime: regime0,
        note: input.note ?? null,
        recordedAt: now(),
        errorDigest: '',
        recordKind: 'lab-calibration-analysis' as const,
        disclosure: 'calibration-analysis-over-frozen-benchmark-and-declared-reality-observations' as const,
        labOnly:
          'calibration analysis records simulation-to-reality prediction error for the frozen benchmark prediction it cites — it never becomes an experiment or measurement authority (§19/§20), never rewrites the benchmark record or the historical observations, and feeds back only as DECLARED versioned context the benchmark may cite (§24)' as const,
      };
      const withDigest: OnlineCalibrationRecord = deepFreeze({
        ...base,
        errorDigest: calibrationErrorDigestOf(base),
      });
      const key = errorChainKey(input.scope, input.calibrationId);
      const chain = chains.get(key) ?? [];
      chain.push(withDigest);
      chains.set(key, chain);
      return withDigest;
    },

    async getCalibrationErrorRecord(
      scope: TenantScope,
      id: LabCalibrationId,
      version: number,
    ): Promise<OnlineCalibrationRecord | null> {
      return errorChainOf(scope, id).find((record) => record.version === version) ?? null;
    },

    async resolveLatestCalibrationErrorRecord(
      scope: TenantScope,
      id: LabCalibrationId,
    ): Promise<OnlineCalibrationRecord | null> {
      const chain = errorChainOf(scope, id);
      return chain.length === 0 ? null : (chain[chain.length - 1] as OnlineCalibrationRecord);
    },

    async listCalibrationErrorVersions(
      scope: TenantScope,
      id: LabCalibrationId,
    ): Promise<readonly OnlineCalibrationRecord[]> {
      return [...errorChainOf(scope, id)];
    },

    async listCalibrationErrorsForBenchmark(
      scope: TenantScope,
      benchmarkId: RobustBenchmarkId,
    ): Promise<readonly OnlineCalibrationRecord[]> {
      return errorsForBenchmark(scope, benchmarkId);
    },

    async verifyCalibrationErrorRecordIntegrity(
      scope: TenantScope,
      id: LabCalibrationId,
      version: number,
    ): Promise<CalibrationIntegrityReport | null> {
      const record = errorChainOf(scope, id).find((entry) => entry.version === version);
      if (record === undefined) {
        return null;
      }
      const recomputedDigest = calibrationErrorDigestOf(record);
      return {
        calibrationId: record.id,
        version,
        status: recomputedDigest === record.errorDigest ? 'intact' : 'tampered',
        recordedDigest: record.errorDigest,
        recomputedDigest,
      };
    },

    async deriveCalibrationContext(
      input: DeriveCalibrationContextInput,
    ): Promise<CalibrationContextRecord | OnlineCalibrationError> {
      const contextFault = validateCalibrationContextRequest(input);
      if (contextFault !== null) {
        return contextFault;
      }
      const folded = errorsForBenchmark(input.scope, input.benchmarkId);
      if (folded.length === 0) {
        return calibrationFailure(
          'no-calibration-evidence',
          `no calibration error records cite benchmark ${input.benchmarkId} in this tenant scope — an empty context would be a fabricated calibration basis`,
        );
      }
      const version = (contextChainOf(input.scope, input.benchmarkId).length + 1) as Version;
      const base = {
        benchmarkId: input.benchmarkId,
        version,
        tenantId: input.scope.tenantId as TenantId,
        summary: calibrationSummaryOf(folded),
        errorRecords: errorRecordCitationsOf(folded),
        derivedAt: now(),
        contextDigest: '',
        recordKind: 'lab-calibration-context' as const,
        disclosure: 'derived-calibration-context-for-benchmark-citation' as const,
        labOnly:
          'the calibration context is DECLARED versioned analysis feedback a later benchmark run may cite — it never implies calibrated simulator output, never becomes an experiment/measurement authority, and never rewrites the error records or benchmark records it summarizes' as const,
      };
      const withDigest: CalibrationContextRecord = deepFreeze({
        ...base,
        contextDigest: calibrationContextDigestOf(base),
      });
      const key = contextChainKey(input.scope, input.benchmarkId);
      const chain = contexts.get(key) ?? [];
      chain.push(withDigest);
      contexts.set(key, chain);
      return withDigest;
    },

    async getCalibrationContext(
      scope: TenantScope,
      benchmarkId: RobustBenchmarkId,
      version: number,
    ): Promise<CalibrationContextRecord | null> {
      return contextChainOf(scope, benchmarkId).find((record) => record.version === version) ?? null;
    },

    async resolveLatestCalibrationContext(
      scope: TenantScope,
      benchmarkId: RobustBenchmarkId,
    ): Promise<CalibrationContextRecord | null> {
      const chain = contextChainOf(scope, benchmarkId);
      return chain.length === 0 ? null : (chain[chain.length - 1] as CalibrationContextRecord);
    },

    async listCalibrationContextVersions(
      scope: TenantScope,
      benchmarkId: RobustBenchmarkId,
    ): Promise<readonly CalibrationContextRecord[]> {
      return [...contextChainOf(scope, benchmarkId)];
    },

    async verifyCalibrationContextIntegrity(
      scope: TenantScope,
      benchmarkId: RobustBenchmarkId,
      version: number,
    ): Promise<CalibrationContextIntegrityReport | null> {
      const record = contextChainOf(scope, benchmarkId).find((entry) => entry.version === version);
      if (record === undefined) {
        return null;
      }
      const recomputedDigest = calibrationContextDigestOf(record);
      return {
        benchmarkId,
        version,
        status: recomputedDigest === record.contextDigest ? 'intact' : 'tampered',
        recordedDigest: record.contextDigest,
        recomputedDigest,
      };
    },
  };
}
