import type { RobustBenchmarkId } from './robust-benchmark.js';
import type { TenantId, TenantScope, Timestamp, Version } from '@mos/contracts';
import type {
  LabCalibrationId,
  OnlineCalibrationRecord,
  RecordCalibrationErrorInput,
} from './online-calibration.js';

/**
 * ONLINE CALIBRATION port contracts (LAB-018) — the derived calibration
 * CONTEXT (the feedback half of the closed loop), the integrity reports and
 * the port itself. Split from online-calibration.ts to respect the contract
 * file line budget (the W3-A/W5-A/W9-A split precedent).
 *
 * THE CONTEXT (the feedback artifact): `deriveCalibrationContext` folds
 * EVERY error record visible in the tenant scope that cites the declared
 * benchmark chain into a versioned, append-only, digest-sealed SUMMARY —
 * the DECLARED versioned context a later benchmark run may cite through
 * `MarketingBenchmarkInput.citedCalibrationContext` (measure → calibrate →
 * next run). Deriving a context NEVER rewrites prior contexts or the error
 * records it summarizes; it only appends the next context version.
 *
 * THE PORT — ELEVEN public methods (≤ 12 policy budget):
 * recordCalibrationError (the ONLY error write path), the four error-chain
 * reads (get / resolveLatest / list / listForBenchmark), the error
 * integrity verification, deriveCalibrationContext (the ONLY context write
 * path) and the three context reads + context integrity verification.
 * There is NO update or delete method on either surface.
 */

// ---------------------------------------------------------------------------
// The context summary
// ---------------------------------------------------------------------------

/**
 * The summary statistics over the folded error records. Every quantity is
 * a plainly-derived mean/max/fraction (documented, no invented
 * sophistication); the full per-record detail stays citable through
 * {@link CalibrationContextRecord.errorRecords}.
 */
export interface CalibrationContextSummary {
  /** How many error records were folded. */
  readonly errorRecordCount: number;
  /** Mean of the signed errors (the bias: does simulation under/over-estimate?). */
  readonly meanSignedError: number;
  /** Mean of the absolute errors (the MAE). */
  readonly meanAbsoluteError: number;
  /** The worst (largest) absolute error folded. */
  readonly worstAbsoluteError: number;
  /**
   * §22 interval coverage: the fraction of folded records whose observed
   * outcome fell inside the cited prediction interval (0 when none did,
   * 1 when all did).
   */
  readonly intervalCoverage: number;
  /** The DISTINCT benchmark record versions calibrated (ascending). */
  readonly calibratedBenchmarkVersions: readonly number[];
  /** The DISTINCT regimes the folded observations were taken under (sorted). */
  readonly regimes: readonly string[];
}

/** The citation of one error record folded into a context. */
export interface CalibrationErrorRecordCitation {
  readonly calibrationId: LabCalibrationId;
  readonly version: number;
}

/**
 * One derived calibration CONTEXT record: the DECLARED versioned feedback
 * artifact for one (tenant, benchmark chain). Append-only per chain — a
 * later derivation appends the next version and NEVER rewrites this one;
 * the error records it summarizes are never rewritten either.
 *
 * §24 statement on every record: the context is analysis output feeding
 * DECLARED citation — it never implies calibrated output and never becomes
 * an authority.
 */
export interface CalibrationContextRecord {
  /** The benchmark chain this context summarizes (the context identity). */
  readonly benchmarkId: RobustBenchmarkId;
  /** Context version within the (tenant, benchmark id) append-only chain. */
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly summary: CalibrationContextSummary;
  /**
   * The EXACT error records folded in, in deterministic (calibration id,
   * version) order — every number in `summary` is recomputable from these.
   */
  readonly errorRecords: readonly CalibrationErrorRecordCitation[];
  readonly derivedAt: Timestamp;
  /** Deterministic digest of the frozen context payload. */
  readonly contextDigest: string;
  readonly recordKind: 'lab-calibration-context';
  readonly disclosure: 'derived-calibration-context-for-benchmark-citation';
  /** §24 boundary statement carried on EVERY record. */
  readonly labOnly:
    'the calibration context is DECLARED versioned analysis feedback a later benchmark run may cite — it never implies calibrated simulator output, never becomes an experiment/measurement authority, and never rewrites the error records or benchmark records it summarizes';
}

/** Derive (append) the next calibration context version for one benchmark chain. */
export interface DeriveCalibrationContextInput {
  readonly scope: TenantScope;
  /** The benchmark chain whose calibration error records are folded. */
  readonly benchmarkId: RobustBenchmarkId;
}

// ---------------------------------------------------------------------------
// Integrity reports
// ---------------------------------------------------------------------------

/** The bit-for-bit immutability verification of one stored error record. */
export interface CalibrationIntegrityReport {
  readonly calibrationId: LabCalibrationId;
  readonly version: number;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

/** The bit-for-bit immutability verification of one stored context record. */
export interface CalibrationContextIntegrityReport {
  readonly benchmarkId: RobustBenchmarkId;
  readonly version: number;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

// ---------------------------------------------------------------------------
// Failure model
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for online calibration. */
export type OnlineCalibrationErrorCode =
  | 'invalid-input'
  | 'duplicate-observation-ref'
  | 'unknown-benchmark'
  | 'benchmark-version-not-found'
  | 'prediction-not-counterfactual'
  | 'unknown-candidate'
  | 'reward-version-mismatch'
  | 'unknown-observation'
  | 'observation-not-historical'
  | 'observation-regime-missing'
  | 'observation-regime-mismatch'
  | 'observation-context-mismatch'
  | 'observation-unit-mismatch'
  | 'invalid-observation-metric'
  | 'reward-term-not-derivable'
  | 'reward-term-ambiguous'
  | 'unsupported-error-functional'
  | 'no-calibration-evidence'
  | 'non-finite-error';

/** Typed failure value (result union, the MOS domain convention). */
export interface OnlineCalibrationError {
  readonly error: OnlineCalibrationErrorCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The online calibration port (LAB-018) — ELEVEN public methods (≤ 12
 * policy budget). Fails closed with every typed code in the failure model;
 * a failed call appends NO record and NO context.
 */
export interface OnlineCalibrationPort {
  /**
   * Record one simulation-to-reality prediction error and APPEND the frozen
   * record (the ONLY error write path). Resolves the declared prediction
   * ref against the frozen LAB-017 benchmark record (the consumed seam) and
   * the declared observation refs against the boundary-chain reality
   * reader, values both sides under the declared reward spec, applies the
   * declared error functional and appends the digest-sealed record.
   */
  recordCalibrationError(
    input: RecordCalibrationErrorInput,
  ): Promise<OnlineCalibrationRecord | OnlineCalibrationError>;
  /** Fetch one error record version, or `null` when unknown in this tenant scope. */
  getCalibrationErrorRecord(
    scope: TenantScope,
    id: LabCalibrationId,
    version: number,
  ): Promise<OnlineCalibrationRecord | null>;
  /** Fetch the latest error record version, or `null` when unknown in this tenant scope. */
  resolveLatestCalibrationErrorRecord(
    scope: TenantScope,
    id: LabCalibrationId,
  ): Promise<OnlineCalibrationRecord | null>;
  /** List error record versions visible in the tenant scope, oldest first. */
  listCalibrationErrorVersions(
    scope: TenantScope,
    id: LabCalibrationId,
  ): Promise<readonly OnlineCalibrationRecord[]>;
  /**
   * List EVERY error record visible in the tenant scope citing the declared
   * benchmark chain (any calibration id), in deterministic (id, version)
   * order — the context derivation's basis and the benchmark-citation
   * audit surface.
   */
  listCalibrationErrorsForBenchmark(
    scope: TenantScope,
    benchmarkId: RobustBenchmarkId,
  ): Promise<readonly OnlineCalibrationRecord[]>;
  /**
   * Verify one error record's bit-for-bit integrity (recompute the digest).
   * `null` when the record is unknown in this tenant scope.
   */
  verifyCalibrationErrorRecordIntegrity(
    scope: TenantScope,
    id: LabCalibrationId,
    version: number,
  ): Promise<CalibrationIntegrityReport | null>;
  /**
   * Derive (APPEND) the next calibration context version for one benchmark
   * chain — the ONLY context write path. Fails closed with
   * `no-calibration-evidence` when the tenant scope holds no error records
   * citing the chain (an empty context would be a fake calibration basis).
   */
  deriveCalibrationContext(
    input: DeriveCalibrationContextInput,
  ): Promise<CalibrationContextRecord | OnlineCalibrationError>;
  /** Fetch one context version, or `null` when unknown in this tenant scope. */
  getCalibrationContext(
    scope: TenantScope,
    benchmarkId: RobustBenchmarkId,
    version: number,
  ): Promise<CalibrationContextRecord | null>;
  /** Fetch the latest context version, or `null` when unknown in this tenant scope. */
  resolveLatestCalibrationContext(
    scope: TenantScope,
    benchmarkId: RobustBenchmarkId,
  ): Promise<CalibrationContextRecord | null>;
  /** List context versions visible in the tenant scope, oldest first. */
  listCalibrationContextVersions(
    scope: TenantScope,
    benchmarkId: RobustBenchmarkId,
  ): Promise<readonly CalibrationContextRecord[]>;
  /**
   * Verify one context record's bit-for-bit integrity. `null` when the
   * context is unknown in this tenant scope.
   */
  verifyCalibrationContextIntegrity(
    scope: TenantScope,
    benchmarkId: RobustBenchmarkId,
    version: number,
  ): Promise<CalibrationContextIntegrityReport | null>;
}
