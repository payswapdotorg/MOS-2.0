import type {
  CalibrationRecord,
  CalibrationRecordId,
  LabRunId,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
  Version,
} from '@mos/contracts';
import type {
  HistoricalObservation,
  HistoricalObservationId,
  PredictionInterval,
  SimulationPrediction,
} from './evidence.js';
import type { ObservedMetricMean } from './off-policy-evaluation.js';
import type { LabRewardSpec } from './reward.js';
import type { BenchmarkCandidateProvenance } from './robust-benchmark-result.js';
import type { RobustBenchmarkId } from './robust-benchmark.js';

/**
 * ONLINE CALIBRATION contracts (LAB-018) — the simulation-to-reality
 * prediction-error surface.
 *
 * Basis: spec/mos-architecture-v2.0.md §20 ("calibration" is a Lab
 * capability; "Historical fact and counterfactual model output must remain
 * distinct"), §22 ("calibration" is part of the uncertainty discipline;
 * "simulator outputs are never treated as ground truth"), §24 (the
 * real-world boundary chain ends at Evidence/Measurement/Experiment →
 * Learning/Calibration — calibration CONSUMES reality-grade observations,
 * it never creates them), §19/§20 boundary discipline (calibration records
 * are ANALYSIS artifacts — NOT a second experiment or measurement
 * authority), lock rules 29/32, and the LAB-018 backlog acceptance
 * (verbatim): "simulation-to-reality prediction error recorded; historical
 * evidence never rewritten."
 *
 * THE CONSUMED SEAM (LAB-017, do not re-invent): the declared prediction is
 * ONE FROZEN `RobustBenchmarkRecord` entry — {@link CalibrationPredictionRef}
 * names (benchmark id, benchmark record version, candidate key); the record
 * carries the per-candidate expected reward + interval + §22 uncertainty +
 * full version provenance, and its `BenchmarkCalibrationDeclaration` already
 * declares this exact surface as `pending-reality`. This module READS those
 * frozen records through the injected benchmark reader; it never re-runs,
 * re-ranks or rewrites them.
 *
 * THE REALITY SIDE: observation refs resolve through the injected
 * {@link RealityObservationReaderPort} to `HistoricalObservation` records
 * (the boundary-chain reality surface — `counterfactual: false` by branded
 * type AND runtime re-validation). Lab-simulated data can NEVER occupy the
 * reality slot (lock rule 29; a double-cast smuggle fails closed with the
 * named code `observation-not-historical`).
 *
 * APPEND-ONLY, IMMUTABLE, VERSIONED (the acceptance's second clause): error
 * records chain per (tenant, calibration id); `recordCalibrationError` is
 * the ONLY write path; stored records are deep-frozen clone-then-freeze
 * snapshots digest-sealed for bit-for-bit verification. A LATER calibration
 * NEVER rewrites an earlier error record — it only appends. The cited
 * benchmark record and the cited historical observations are NEVER rewritten
 * either (they are the historical evidence).
 *
 * FEEDBACK (the closed loop: measure → calibrate → next run): the derived
 * DECLARED versioned calibration context (online-calibration-port.ts) is the
 * artifact a later benchmark run may cite through its declared citation
 * input (see `MarketingBenchmarkInput.citedCalibrationContext`). The
 * citation is provenance — it never implies calibrated output.
 */

declare const labCalibrationIdBrand: unique symbol;

/**
 * Unique identifier of one calibration error-record chain. Records append
 * per (tenant, calibration id) — `version` is assigned by the store.
 */
export type LabCalibrationId = string & {
  readonly [labCalibrationIdBrand]: true;
};

// ---------------------------------------------------------------------------
// The consumed LAB-017 seam: the declared prediction reference
// ---------------------------------------------------------------------------

/**
 * THE DECLARED PREDICTION REF (the LAB-017 seam consumed): which frozen
 * benchmark record (id + exact version) and which ranked candidate key is
 * being calibrated. Resolves through the injected benchmark reader;
 * unresolvable refs fail closed with named codes.
 */
export interface CalibrationPredictionRef {
  readonly benchmarkId: RobustBenchmarkId;
  /** The EXACT benchmark record version whose prediction is calibrated. */
  readonly benchmarkVersion: number;
  /** A candidate key present in that record's `ranked` set. */
  readonly candidateKey: string;
}

/**
 * The frozen prediction statement copied VERBATIM from the cited benchmark
 * record's per-candidate evaluation (never reinterpreted): the expected
 * reward, the §22 interval, the §22 uncertainty summary, and the full
 * version provenance of the prediction (which simulator / reward spec /
 * policy / seeds / world-model pins produced it).
 */
export interface CalibrationPredictedStatement {
  readonly expectedReward: number;
  readonly interval: PredictionInterval;
  readonly uncertainty: UncertaintySummary;
  readonly provenance: BenchmarkCandidateProvenance;
}

// ---------------------------------------------------------------------------
// The reality side: declared observation refs + resolved citations
// ---------------------------------------------------------------------------

/**
 * One DECLARED reality observation ref — a `HistoricalObservationId` from
 * the boundary chain (evidence/measurement). Resolved through the
 * {@link RealityObservationReaderPort}; NEVER lab-simulated data.
 */
export type CalibrationObservationRef = HistoricalObservationId;

/**
 * The resolved citation of one reality observation, carried on the error
 * record verbatim from the observation (provenance on every field: when it
 * became true, which external sources back it, under which regime, in which
 * niche/platform context).
 */
export interface CalibrationObservationCitation {
  readonly observationId: HistoricalObservationId;
  readonly niche: string;
  readonly platform: string;
  readonly observedAt: Timestamp;
  /** Non-empty external source references backing the observation. */
  readonly sourceRefs: readonly string[];
  /** The regime label the observation was taken under (non-null, consistent). */
  readonly regime: string;
}

// ---------------------------------------------------------------------------
// The declared versioned error functional
// ---------------------------------------------------------------------------

/**
 * The DECLARED VERSIONED error functional (frozen vocabulary for v1).
 * Documented formulas (no invented sophistication — see
 * adapters/calibration-support.ts for the full derivation):
 *
 * ```
 * signedError        = observedOutcome − predictedExpectedReward
 *                      (reality minus prediction: positive = the simulation
 *                      UNDER-estimated reality)
 * absoluteError      = |signedError|
 * relativeError      = |signedError| / |predictedExpectedReward|
 *                      (0 when both are 0; 1 when the prediction is 0 and
 *                      the error is not — the parametric-support
 *                      relative-spread convention)
 * intervalContainment= observedOutcome ∈ [interval.lower, interval.upper]
 *                      (the §22 interval-coverage discipline: did the
 *                      predicted interval actually contain reality?)
 * ```
 */
export interface CalibrationErrorFunctional {
  readonly id: 'calib-signed-error-v1';
  readonly version: 1;
  /** Mandatory rationale (never blank). */
  readonly note: string;
}

/** The supported v1 error functional (the declared input must equal it). */
export const CALIBRATION_ERROR_FUNCTIONAL_V1: CalibrationErrorFunctional = Object.freeze({
  id: 'calib-signed-error-v1',
  version: 1,
  note: 'declared v1 functional: signed reality-minus-prediction error with absolute/relative decomposition and §22 interval containment',
} as const);

// ---------------------------------------------------------------------------
// Run input
// ---------------------------------------------------------------------------

/**
 * One online-calibration error-record request. `rewardSpec` is the DECLARED
 * reward spec under which BOTH sides are valued — its `version` MUST equal
 * the cited benchmark record's `provenance.rewardSpecVersion` (comparing a
 * prediction against a differently-versioned objective is meaningless and
 * fails closed). The observed outcome is the reward of the mean observed
 * metric values of the declared observations under that spec (the LAB-008
 * observed-domain discipline: terms resolve from observed data only, never
 * invented).
 */
export interface RecordCalibrationErrorInput {
  readonly scope: TenantScope;
  readonly calibrationId: LabCalibrationId;
  readonly prediction: CalibrationPredictionRef;
  /** DECLARED reality observation refs (>= 1, distinct, resolvable). */
  readonly observationRefs: readonly CalibrationObservationRef[];
  readonly rewardSpec: LabRewardSpec;
  readonly functional: CalibrationErrorFunctional;
  /** Optional provenance note. */
  readonly note?: string | null;
}

// ---------------------------------------------------------------------------
// The append-only error record
// ---------------------------------------------------------------------------

/**
 * One ONLINE CALIBRATION error record: the DECLARED prediction (frozen
 * benchmark statement copied verbatim) versus the DECLARED reality
 * observations, joined by the DECLARED error functional.
 *
 * NOT an experiment and NOT a measurement (§19/§20): this is an ANALYSIS
 * artifact over the frozen prediction and the boundary-chain observations —
 * there is no second experiment/measurement authority here. NOT historical
 * evidence either (it is not a `HistoricalObservation` — compile-pinned
 * below). APPEND-ONLY and immutable: a later calibration appends a new
 * version; this record is never rewritten.
 */
export interface OnlineCalibrationRecord {
  readonly id: LabCalibrationId;
  /** Record version within the (tenant, calibration id) append-only chain. */
  readonly version: Version;
  readonly tenantId: TenantId;
  /** The consumed LAB-017 seam reference (verbatim from the request). */
  readonly prediction: CalibrationPredictionRef;
  /** The frozen prediction statement copied from the cited benchmark record. */
  readonly predicted: CalibrationPredictedStatement;
  /** The resolved reality observation citations (verbatim fields). */
  readonly observations: readonly CalibrationObservationCitation[];
  /** Mean observed metric values across the cited observations (LAB-008 discipline). */
  readonly observedMetricMeans: readonly ObservedMetricMean[];
  /** The observed outcome: the reward of `observedMetricMeans` under the reward spec. */
  readonly observedOutcome: number;
  /** The reward spec version both sides were valued under (must match the prediction's). */
  readonly rewardSpecVersion: number;
  /** The DECLARED error functional that produced the error fields. */
  readonly functional: CalibrationErrorFunctional;
  /** observedOutcome − predicted.expectedReward (reality minus prediction). */
  readonly signedError: number;
  readonly absoluteError: number;
  readonly relativeError: number;
  /** §22 interval containment: was reality inside the predicted interval? */
  readonly intervalContainment: boolean;
  /** The shared regime the cited observations were taken under. */
  readonly regime: string;
  readonly note: string | null;
  readonly recordedAt: Timestamp;
  /** Deterministic digest of the frozen record payload (bit-for-bit immutability). */
  readonly errorDigest: string;
  readonly recordKind: 'lab-calibration-analysis';
  readonly disclosure: 'calibration-analysis-over-frozen-benchmark-and-declared-reality-observations';
  /** §24 boundary statement carried on EVERY record. */
  readonly labOnly:
    'calibration analysis records simulation-to-reality prediction error for the frozen benchmark prediction it cites — it never becomes an experiment or measurement authority (§19/§20), never rewrites the benchmark record or the historical observations, and feeds back only as DECLARED versioned context the benchmark may cite (§24)';
}

// ---------------------------------------------------------------------------
// The reality observation reader seam (the boundary-chain surface)
// ---------------------------------------------------------------------------

/**
 * The reality observation reader (LAB-018's reality-side seam): resolves
 * one DECLARED observation ref to its `HistoricalObservation` record in the
 * tenant scope. The boundary chain (evidence/measurement — the §24 chain's
 * reality side) stands behind this port; the lab-owned in-memory double and
 * the Time Machine composition adapter are the shipped implementations.
 *
 * `null` when the ref is unknown in this tenant scope (no existence leak).
 * The return type IS `HistoricalObservation` — a `SimulationPrediction`
 * can never be served here (lock rule 29), and the calibration adapter
 * re-validates `counterfactual === false` at runtime (double-cast guard).
 */
export interface RealityObservationReaderPort {
  getObservation(
    scope: TenantScope,
    id: HistoricalObservationId,
  ): Promise<HistoricalObservation | null>;
}

// ---------------------------------------------------------------------------
// The canonical CORE-001 CalibrationRecord projection
// ---------------------------------------------------------------------------

/**
 * Project one error record onto the frozen CORE-001 `CalibrationRecord`
 * contract (required fields exactly). Field mapping (documented):
 * - `id` — the calibration record id (branded to `CalibrationRecordId`);
 * - `labRunRef` — the canonical run reference of the calibrated prediction:
 *   the LAB-017 benchmark record chain + version, encoded
 *   `benchmark:<benchmarkId>:v<version>` (the benchmark record IS the run
 *   whose prediction is calibrated on this surface);
 * - `worldModelVersion` — the FIRST declared world-model pin's FIRST member
 *   world-model version (the primary world; the full pin set stays on the
 *   extended record — the canonical contract assumes a single world model);
 * - `simulatedPrediction` — `predicted.expectedReward`;
 * - `uncertainty` — `predicted.uncertainty` (§22 carried);
 * - `observedOutcome` — the record's observed outcome;
 * - `predictionError` — `signedError` (the signed reality-minus-prediction);
 * - `regime` — the record's shared regime;
 * - `updateVersion` — supplied by the caller: the calibration-CONTEXT
 *   version the record feeds (from `deriveCalibrationContext`), mirroring
 *   the canonical "world model update version it fed" semantics.
 */
export const canonicalCalibrationView = (
  record: OnlineCalibrationRecord,
  updateVersion: Version,
): CalibrationRecord => ({
  id: record.id as unknown as CalibrationRecordId,
  version: record.version,
  labRunRef: `benchmark:${record.prediction.benchmarkId}:v${record.prediction.benchmarkVersion}` as LabRunId,
  worldModelVersion: canonicalWorldModelVersionOf(record.predicted.provenance),
  simulatedPrediction: record.predicted.expectedReward,
  uncertainty: record.predicted.uncertainty,
  observedOutcome: record.observedOutcome,
  predictionError: record.signedError,
  regime: record.regime,
  updateVersion,
});

/** The primary world-model pin's first member version (fail-loud on impossible shapes). */
const canonicalWorldModelVersionOf = (provenance: BenchmarkCandidateProvenance): Version => {
  const primary = provenance.worldModels[0];
  const version = primary?.memberWorldModelVersions[0];
  if (version === undefined) {
    throw new Error(
      'canonical calibration view: the prediction provenance carries no world-model pin — the record shape is corrupt (store-corruption territory, never silently defaulted)',
    );
  }
  return version as Version;
};

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 29/32 + §19/§20)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

/** A calibration record is never historical evidence (it is analysis). */
type _CalibrationRecordsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<OnlineCalibrationRecord, HistoricalObservation>, false>
>;
type _HistoricalObservationsNeverOccupyACalibrationSlot = Expect<
  Equal<IsAssignable<HistoricalObservation, OnlineCalibrationRecord>, false>
>;
/** A calibration record is never a raw simulation prediction either. */
type _CalibrationRecordsAreNotSimulationPredictions = Expect<
  Equal<IsAssignable<OnlineCalibrationRecord, SimulationPrediction>, false>
>;
/** The error functional vocabulary stays frozen (a v1 single value, versioned). */
type _ErrorFunctionalIsFrozen = Expect<
  Equal<CalibrationErrorFunctional['id'], 'calib-signed-error-v1'>
>;
