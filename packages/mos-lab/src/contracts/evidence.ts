import type {
  LabScenarioId,
  StrategyRef,
  TenantId,
  Timestamp,
  UncertaintySummary,
  Version,
} from '@mos/contracts';

/**
 * Historical evidence vs counterfactual prediction contracts for the
 * Marketing Lab (LAB-004+).
 *
 * Basis: spec/mos-architecture-v2.0.md §20 ("Historical fact and
 * counterfactual model output must remain distinct"), §22 ("Simulator
 * outputs are never treated as ground truth") and architecture LOCK RULES
 * 29/30: historical evidence and counterfactual predictions are distinct,
 * and the Time Machine delayed mode forbids future-information leakage.
 *
 * TYPE SEPARATION (lock rule 29) is enforced three ways:
 *
 * 1. Branded identifier types — a `HistoricalObservationId` is not a
 *    `SimulationPredictionId` and vice versa.
 * 2. Literal discriminants — `HistoricalObservation.counterfactual` is the
 *    literal type `false` and `SimulationPrediction.counterfactual` is the
 *    literal type `true`, so neither record is assignable where the other
 *    is required (pinned by the compile-time assertions at the bottom of
 *    this file — a SimulationPrediction can NEVER be stored or returned
 *    where a HistoricalObservation is required, and vice versa).
 * 3. Runtime label checks — the Time Machine branch registry re-validates
 *    `counterfactual === true` before accepting a record into a
 *    counterfactual branch, so even a double-cast caller cannot smuggle an
 *    unlabeled record past the separation.
 *
 * `@mos/contracts` supplies the shared vocabulary (LabScenarioId,
 * StrategyRef, TenantId, Timestamp, UncertaintySummary, Version); everything
 * here is lab-local (sim-specific types stay local per the worker contract).
 */

declare const historicalObservationIdBrand: unique symbol;
declare const simulationPredictionIdBrand: unique symbol;

/** Unique identifier of a historical observation record. */
export type HistoricalObservationId = string & {
  readonly [historicalObservationIdBrand]: true;
};

/** Unique identifier of a simulation prediction record. */
export type SimulationPredictionId = string & {
  readonly [simulationPredictionIdBrand]: true;
};

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** One observed metric value on a historical observation (real-world evidence). */
export interface ObservedMetric {
  /** Metric name (e.g. `qualified-reach`, `engagement-rate`). */
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
}

/**
 * A predicted uncertainty interval [lower, upper] (spec §22: expected value +
 * interval are first-class on every simulator output).
 */
export interface PredictionInterval {
  readonly lower: number;
  readonly upper: number;
}

/** One predicted metric on a simulation prediction: expected value + envelope. */
export interface PredictedMetric {
  readonly metric: string;
  readonly expectedValue: number;
  readonly interval: PredictionInterval;
  readonly unit: string;
}

// ---------------------------------------------------------------------------
// HistoricalObservation (from corpus/evidence — REAL observed data)
// ---------------------------------------------------------------------------

/**
 * A historical observation: a REAL observed metric record sourced from
 * evidence (corpus analytics exports, platform observations, calibration
 * observations). It is the only record type the Time Machine's historical
 * timeline accepts, and the only type its replay modes serve.
 *
 * Historical observations are APPEND-ONLY and immutable once recorded: the
 * Time Machine assigns `version` (always 1) and freezes the record. They are
 * never synthesized, never mutated, and never confused with counterfactual
 * model output (lock rule 29).
 */
export interface HistoricalObservation {
  readonly id: HistoricalObservationId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  /** Observed metric values (real-world evidence — never synthetic). */
  readonly metrics: readonly ObservedMetric[];
  /**
   * When the observation became true in the real world. This is the Time
   * Machine visibility key: replay modes filter strictly on `observedAt`.
   */
  readonly observedAt: Timestamp;
  /** Non-empty external source references backing the observation. */
  readonly sourceRefs: readonly string[];
  /** Regime label the observation was taken under (e.g. market/behavioral regime). */
  readonly regime?: string;
  /** LOCK RULE 29 PIN: historical evidence — never a counterfactual model output. */
  readonly counterfactual: false;
}

// ---------------------------------------------------------------------------
// SimulationPrediction (synthetic, counterfactual, DISCLOSED)
// ---------------------------------------------------------------------------

/**
 * A simulation prediction: SYNTHETIC output of a disclosed deterministic
 * response function (the in-memory simulator/dynamics adapters). It is a
 * counterfactual model output, never ground truth (spec §22), and it can
 * never be stored or returned where a {@link HistoricalObservation} is
 * required (lock rule 29 — pinned at compile time below).
 *
 * `disclosure` names the synthetic provenance explicitly: every prediction
 * declares that it came from a synthetic response function, NOT a real
 * platform model.
 */
export interface SimulationPrediction {
  readonly id: SimulationPredictionId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly scenarioRef: LabScenarioId;
  /** World model version the prediction was produced under. */
  readonly worldModelVersion: Version;
  /** Simulator version the prediction was produced with. */
  readonly simulatorVersion: Version;
  readonly strategyRef: StrategyRef;
  /** Determinism seed (seed-required stepping — never null on predictions). */
  readonly seed: number;
  /** Simulation step index the prediction belongs to (>= 0). */
  readonly step: number;
  /** Predicted metric values with uncertainty envelopes (spec §22). */
  readonly metrics: readonly PredictedMetric[];
  /** When the prediction record was produced. */
  readonly predictedAt: Timestamp;
  readonly uncertainty: UncertaintySummary;
  /** LOCK RULE 29 PIN: counterfactual model output — NEVER ground truth. */
  readonly counterfactual: true;
  /** DISCLOSURE: output of a disclosed synthetic response function. */
  readonly disclosure: 'synthetic-response-function';
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rule 29)
// ---------------------------------------------------------------------------

/** Compile-time assertion helper (same technique as @mos/contracts type-tests). */
type Expect<T extends true> = T;

/** Strict type equality (same technique as @mos/contracts type-tests). */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** `true` only when `Source` is assignable to `Target`. */
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _HistoricalObservationsAreNeverCounterfactual = Expect<
  Equal<HistoricalObservation['counterfactual'], false>
>;
type _SimulationPredictionsAreAlwaysCounterfactual = Expect<
  Equal<SimulationPrediction['counterfactual'], true>
>;
type _PredictionCanNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<SimulationPrediction, HistoricalObservation>, false>
>;
type _HistoricalRecordCanNeverOccupyAPredictionSlot = Expect<
  Equal<IsAssignable<HistoricalObservation, SimulationPrediction>, false>
>;
type _PredictionIdsAndHistoricalIdsAreDistinctBrands = Expect<
  Equal<IsAssignable<HistoricalObservationId, SimulationPredictionId>, false>
>;
