import type { TenantScope } from '@mos/contracts';
import type {
  HistoricalObservation,
  ObservedMetric,
} from '../contracts/evidence.js';
import type { ObservedMetricMean } from '../contracts/off-policy-evaluation.js';
import type {
  CalibrationPredictedStatement,
  OnlineCalibrationRecord,
} from '../contracts/online-calibration.js';
import type { LabCalibrationId } from '../contracts/online-calibration.js';
import type {
  CalibrationContextRecord,
  CalibrationContextSummary,
  CalibrationErrorRecordCitation,
  OnlineCalibrationError,
} from '../contracts/online-calibration-port.js';
import type {
  BenchmarkCalibrationCitation,
  BenchmarkCalibrationCitationRequest,
  RobustBenchmarkError,
  RobustBenchmarkId,
} from '../contracts/robust-benchmark.js';
import { benchmarkCalibrationCitationOf } from '../contracts/robust-benchmark.js';
import { digestOf } from './benchmark-support.js';
import { cloneDeep } from './parametric-support.js';

/**
 * INTERNAL pure support for the LAB-018 in-memory online calibration
 * adapter. NOT exported from the package index — implementation detail,
 * not surface.
 *
 * Contains the documented DECLARED error functional math
 * (`calib-signed-error-v1`), the observed-means aggregation (the LAB-008
 * discipline), the §22 uncertainty summary of the error, the deterministic
 * digest helpers for both record kinds (reusing the LAB-017 canonical-JSON
 * + FNV-1a digest — the same bit-for-bit change detector, never a security
 * claim), and the DECLARED calibration-context citation resolution the
 * benchmark's run path delegates to (fail-closed provenance validation).
 */

// ---------------------------------------------------------------------------
// The DECLARED citation resolution (the LAB-017 run-path half of the loop)
// ---------------------------------------------------------------------------

/**
 * The citation resolution result: the frozen normalized citation
 * (`null` when the run declared none — the first run of a loop cites
 * nothing), or the typed fail-closed failure.
 */
export type BenchmarkCitationResolution =
  | { readonly citation: BenchmarkCalibrationCitation | null }
  | { readonly failure: RobustBenchmarkError };

/**
 * Resolve a DECLARED `citedCalibrationContext` request into the frozen
 * record-side citation — the benchmark run path's citation validation,
 * extracted here to respect the managed-file line budget (W10-A recovery
 * audit: the first attempt inlined this block and pushed the adapter over
 * the oxlint max-lines discipline).
 *
 * Fail-closed, in order: structurally invalid version → `invalid-input`;
 * declared without the wired context reader seam →
 * `calibration-context-reader-required` (an unresolvable citation must
 * never be silently recorded as provenance); unresolvable exact version in
 * this tenant scope → `calibration-context-not-found` (citing a
 * nonexistent context would be a fabricated calibration claim). The
 * citation is PROVENANCE — it never alters the evaluation grid.
 */
export const resolveBenchmarkCitation = async (
  declared: BenchmarkCalibrationCitationRequest | null | undefined,
  scope: TenantScope,
  benchmarkId: RobustBenchmarkId,
  reader:
    | {
        readonly getCalibrationContext: (
          scope: TenantScope,
          benchmarkId: RobustBenchmarkId,
          version: number,
        ) => Promise<CalibrationContextRecord | null>;
      }
    | null
    | undefined,
): Promise<BenchmarkCitationResolution> => {
  if (declared === undefined || declared === null) {
    return { citation: null };
  }
  // CLONE-THEN-NORMALIZE: the caller's request object is never retained
  // or frozen — the citation is the adapter's own normalized copy.
  const citation = benchmarkCalibrationCitationOf(cloneDeep(declared));
  if (!Number.isInteger(citation.version) || citation.version < 1) {
    return {
      failure: {
        error: 'invalid-input',
        message:
          'citedCalibrationContext.version must be an integer >= 1 (the EXACT calibration-context version cited)',
      },
    };
  }
  if (reader === undefined || reader === null) {
    return {
      failure: {
        error: 'calibration-context-reader-required',
        message:
          'the run cites calibration context but no calibration-context reader seam is wired — a declared citation must resolve fail-closed, never be silently recorded as provenance',
      },
    };
  }
  const context = await reader.getCalibrationContext(scope, benchmarkId, citation.version);
  if (context === null) {
    return {
      failure: {
        error: 'calibration-context-not-found',
        message: `cited calibration context version ${citation.version} for benchmark ${benchmarkId} does not resolve in this tenant scope — citing a nonexistent context would be a fabricated calibration claim`,
      },
    };
  }
  return { citation };
};

/**
 * THE DOCUMENTED ERROR FUNCTIONAL (`calib-signed-error-v1` — no invented
 * sophistication; every quantity is a plainly-derived value):
 *
 * ```
 * signedError         = observedOutcome − predictedExpectedReward
 *                       (reality minus prediction: positive = the simulation
 *                       UNDER-estimated reality)
 * absoluteError       = |signedError|
 * relativeError       = |signedError| / |predictedExpectedReward|
 *                       (0 when both are 0; 1 when the prediction is exactly
 *                       0 and the error is not — the parametric-support
 *                       relative-spread convention)
 * intervalContainment = observedOutcome ∈ [interval.lower, interval.upper]
 *                       (the §22 interval-coverage discipline)
 * ```
 */
export interface CalibrationErrorComputation {
  readonly signedError: number;
  readonly absoluteError: number;
  readonly relativeError: number;
  readonly intervalContainment: boolean;
}

/** Compute the declared error functional (finite-guarded, pure). */
export const computeCalibrationError = (
  predicted: CalibrationPredictedStatement,
  observedOutcome: number,
): CalibrationErrorComputation | { readonly failure: 'non-finite-error' } => {
  const signedError = observedOutcome - predicted.expectedReward;
  const absoluteError = Math.abs(signedError);
  const magnitude = Math.abs(predicted.expectedReward);
  const relativeError =
    magnitude === 0 ? (absoluteError === 0 ? 0 : 1) : absoluteError / magnitude;
  if (
    !Number.isFinite(signedError) ||
    !Number.isFinite(absoluteError) ||
    !Number.isFinite(relativeError) ||
    !Number.isFinite(observedOutcome)
  ) {
    // The W9-B D5 finite guard: no NaN/Infinity can ever enter a stored
    // error record, whatever the inputs produced upstream.
    return { failure: 'non-finite-error' };
  }
  return {
    signedError,
    absoluteError,
    relativeError,
    intervalContainment:
      observedOutcome >= predicted.interval.lower &&
      observedOutcome <= predicted.interval.upper,
  };
};

// ---------------------------------------------------------------------------
// Observed means (the LAB-008 discipline, with W10-A fail-closed additions)
// ---------------------------------------------------------------------------

/** One metric's aggregated observed statistics (internal shape). */
interface ObservedStats {
  readonly means: ReadonlyMap<string, number>;
  readonly units: ReadonlyMap<string, string>;
}

/**
 * Aggregate the cited observations' metrics into per-metric means (each
 * metric averaged over the observations that carry it — the LAB-008
 * discipline). W10-A fail-closed additions vs LAB-008: a metric value that
 * is not a finite number fails closed (`invalid-observation-metric` — the
 * W9-B D5 guard on numeric recording), and inconsistent units for one
 * metric name fail closed (`observation-unit-mismatch` — a silent
 * first-unit-wins would corrupt the error record's provenance).
 */
export const observedStatsOf = (
  observations: readonly HistoricalObservation[],
): ObservedStats | { readonly failure: 'invalid-observation-metric' | 'observation-unit-mismatch'; readonly detail: string } => {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  const units = new Map<string, string>();
  for (const observation of observations) {
    for (const metric of observation.metrics as readonly ObservedMetric[]) {
      if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) {
        return {
          failure: 'invalid-observation-metric',
          detail: `observation ${observation.id}: metric "${metric.metric}" carries a non-finite value (${String(metric.value)}) — never recorded`,
        };
      }
      const current = sums.get(metric.metric) ?? 0;
      sums.set(metric.metric, current + metric.value);
      counts.set(metric.metric, (counts.get(metric.metric) ?? 0) + 1);
      const knownUnit = units.get(metric.metric);
      if (knownUnit === undefined) {
        units.set(metric.metric, metric.unit);
      } else if (knownUnit !== metric.unit) {
        return {
          failure: 'observation-unit-mismatch',
          detail: `metric "${metric.metric}" is observed in inconsistent units ("${knownUnit}" vs "${metric.unit}") — the observed mean would be meaningless`,
        };
      }
    }
  }
  const means = new Map<string, number>();
  for (const [metric, sum] of sums) {
    means.set(metric, sum / (counts.get(metric) ?? 1));
  }
  return { means, units };
};

/** The means as the LAB-008-shaped observed-metric-mean list (deterministic order). */
export const observedMetricMeansOf = (stats: ObservedStats): readonly ObservedMetricMean[] => {
  const entries = [...stats.means.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([metric, mean]) => ({
    metric,
    mean,
    unit: stats.units.get(metric) ?? '',
  }));
};

// ---------------------------------------------------------------------------
// Digests (the LAB-017 canonical-JSON + FNV-1a discipline, reused verbatim)
// ---------------------------------------------------------------------------

/** The deterministic digest of one frozen error-record payload. */
export const calibrationErrorDigestOf = (record: OnlineCalibrationRecord): string => {
  const payload: Record<string, unknown> = { ...record };
  delete payload.errorDigest;
  return digestOf(payload);
};

/** The deterministic digest of one frozen context-record payload. */
export const calibrationContextDigestOf = (record: CalibrationContextRecord): string => {
  const payload: Record<string, unknown> = { ...record };
  delete payload.contextDigest;
  return digestOf(payload);
};

// ---------------------------------------------------------------------------
// The context summary (the plainly-derived feedback statistics)
// ---------------------------------------------------------------------------

/**
 * Fold the error records (already in deterministic (id, version) order)
 * into the context summary. Every quantity is a mean / max / fraction /
 * distinct-set — documented, no invented sophistication:
 * - meanSignedError = mean(signedError) — the simulation bias;
 * - meanAbsoluteError = mean(absoluteError) — the MAE;
 * - worstAbsoluteError = max(absoluteError);
 * - intervalCoverage = count(intervalContainment) / count — §22 coverage;
 * - calibratedBenchmarkVersions = distinct(prediction.benchmarkVersion), asc;
 * - regimes = distinct(regime), sorted.
 */
export const calibrationSummaryOf = (
  records: readonly OnlineCalibrationRecord[],
): CalibrationContextSummary => {
  const count = records.length;
  let signedSum = 0;
  let absoluteSum = 0;
  let worstAbsolute = 0;
  let contained = 0;
  const versions = new Set<number>();
  const regimes = new Set<string>();
  for (const record of records) {
    signedSum += record.signedError;
    absoluteSum += record.absoluteError;
    worstAbsolute = Math.max(worstAbsolute, record.absoluteError);
    if (record.intervalContainment) {
      contained += 1;
    }
    versions.add(record.prediction.benchmarkVersion);
    regimes.add(record.regime);
  }
  return {
    errorRecordCount: count,
    meanSignedError: count === 0 ? 0 : signedSum / count,
    meanAbsoluteError: count === 0 ? 0 : absoluteSum / count,
    worstAbsoluteError: worstAbsolute,
    intervalCoverage: count === 0 ? 0 : contained / count,
    calibratedBenchmarkVersions: [...versions].sort((a, b) => a - b),
    regimes: [...regimes].sort(),
  };
};

/** The citations of the folded records in deterministic (id, version) order. */
export const errorRecordCitationsOf = (
  records: readonly OnlineCalibrationRecord[],
): readonly CalibrationErrorRecordCitation[] =>
  records.map((record) => ({
    calibrationId: record.id as LabCalibrationId,
    version: record.version,
  }));

/** Convenience: the typed failure value builder. */
export const calibrationFailure = (
  error: OnlineCalibrationError['error'],
  message: string,
): OnlineCalibrationError => ({ error, message });
