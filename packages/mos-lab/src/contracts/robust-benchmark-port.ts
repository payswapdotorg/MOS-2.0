import type { TenantScope, Timestamp, Version } from '@mos/contracts';
import type { HistoricalObservation } from './evidence.js';
import type {
  MarketingBenchmarkInput,
  RobustBenchmarkError,
  RobustBenchmarkId,
} from './robust-benchmark.js';
import type { RobustBenchmarkResult } from './robust-benchmark-result.js';

/**
 * The robust marketing benchmark RECORD + PORT contracts (LAB-017). Split
 * from robust-benchmark-result.ts to respect the contract file line
 * budget (the W3-A/W5-A delay-decision-port precedent).
 *
 * `MarketingBenchmarkPort` — 5 public methods (≤ 12 policy budget): the
 * benchmark run (which APPENDS the frozen versioned record — the ONLY
 * write path), the append-only chain reads, and the bit-for-bit integrity
 * verification. Deterministic given (candidates, policy version, seeds,
 * the wired ensembles' stored versions).
 *
 * Records are VERSIONED per (tenant, benchmark id), APPEND-ONLY
 * (runBenchmark is the only write path — there is no update or delete
 * method on the port), tenant-scoped, deep-frozen and DIGEST-SEALED: the
 * deterministic `resultDigest` over the result payload is recomputable
 * from the stored payload and any divergence is reported as `tampered`
 * (a branch reachable only when the underlying store corrupts —
 * durable-adapter territory, disclosed).
 */

/**
 * A stored benchmark record: the frozen result EXTENDED with the
 * append-only chain bookkeeping — the record version within the
 * (tenant, benchmark id) chain and the deterministic `resultDigest` over
 * the result payload (bit-for-bit immutability).
 */
export interface RobustBenchmarkRecord extends RobustBenchmarkResult {
  /** Record version within the (tenant, benchmark id) append-only chain. */
  readonly version: Version;
  /** Deterministic digest of the frozen result payload. */
  readonly resultDigest: string;
  readonly recordedAt: Timestamp;
}

/** The bit-for-bit immutability verification of one stored record. */
export interface BenchmarkIntegrityReport {
  readonly benchmarkId: RobustBenchmarkId;
  readonly version: number;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

/**
 * The robust marketing benchmark port (LAB-017). Fails closed with every
 * typed code in the failure model (candidate/policy/seed validation,
 * unresolvable ensemble refs, reward version/term resolution, evaluation
 * failures); a failed run appends NO record.
 */
export interface MarketingBenchmarkPort {
  /**
   * Run the robust benchmark and APPEND the frozen record (§22 as a
   * benchmark: multi-seed sweep, multi-world-model evaluation, expected
   * value + additive interval, OOD vs declared coverage, the no-op
   * baseline always present, calibration declared pending reality).
   */
  runBenchmark(
    input: MarketingBenchmarkInput,
  ): Promise<RobustBenchmarkRecord | RobustBenchmarkError>;
  /** Fetch one record version, or `null` when unknown in this tenant scope. */
  getBenchmarkRecord(
    scope: TenantScope,
    id: RobustBenchmarkId,
    version: number,
  ): Promise<RobustBenchmarkRecord | null>;
  /** Fetch the latest record version, or `null` when unknown in this tenant scope. */
  resolveLatestBenchmarkRecord(
    scope: TenantScope,
    id: RobustBenchmarkId,
  ): Promise<RobustBenchmarkRecord | null>;
  /** List record versions visible in the tenant scope, oldest first. */
  listBenchmarkRecordVersions(
    scope: TenantScope,
    id: RobustBenchmarkId,
  ): Promise<readonly RobustBenchmarkRecord[]>;
  /**
   * Verify one record's bit-for-bit integrity (recompute the result
   * digest). `null` when the record is unknown in this tenant scope.
   */
  verifyBenchmarkRecordIntegrity(
    scope: TenantScope,
    id: RobustBenchmarkId,
    version: number,
  ): Promise<BenchmarkIntegrityReport | null>;
}

// ---------------------------------------------------------------------------
// Compile-time separation pins (architecture lock rules 29/32)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

type _RecordsAreAlwaysCounterfactual = Expect<
  Equal<RobustBenchmarkRecord['counterfactual'], true>
>;
type _RecordsNeverOccupyAHistoricalSlot = Expect<
  Equal<IsAssignable<RobustBenchmarkRecord, HistoricalObservation>, false>
>;
type _HistoricalObservationsNeverOccupyARecordSlot = Expect<
  Equal<IsAssignable<HistoricalObservation, RobustBenchmarkRecord>, false>
>;
