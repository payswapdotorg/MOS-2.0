import type { TenantId, TenantScope } from '@mos/contracts';

/**
 * Lab online-calibration view port (UX-003, over LAB-018).
 *
 * The Lab surface's READ side over the online-calibration authority
 * (LAB-018 `OnlineCalibrationPort`): it lists the calibration error-record
 * chains visible in one tenant scope with their status — record counts,
 * digest-integrity state, and the DECLARED versioned feedback context when
 * one has been derived (or the honest "calibration pending" state when none
 * has) — and loads one chain's prediction-error records plus the benchmark
 * chain's derived context.
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models re-declared from the LAB-018 record shapes, importing only
 * `@mos/contracts` types; composition OUTSIDE `src/`.
 *
 * HISTORICAL vs COUNTERFACTUAL, VISIBLY DISTINCT (§20, lock rule 29 — the
 * core honesty rule of this surface): one calibration record joins a
 * PREDICTION (a frozen LAB-017 benchmark statement — simulation-derived,
 * `counterfactual: true`) with REALITY observations (boundary-chain
 * historical observations — `counterfactual: false`). The view models carry
 * BOTH literal flags, and the views render the prediction side as
 * counterfactual-labeled and the observed side as measured reality — never
 * conflated, never laundered. Calibration is ANALYSIS over the two, never an
 * experiment or measurement authority (§19/§20), and historical evidence is
 * never rewritten (records append; the §24 statement renders with every
 * record).
 */

/** The frozen v1 error functional every record declares (LAB-018 vocabulary). */
export interface LabCalibrationFunctionalView {
  readonly id: 'calib-signed-error-v1';
  readonly version: 1;
  readonly note: string;
}

/** The counterfactual-labeled prediction side of one error record. */
export interface LabCalibrationPredictionView {
  /** The frozen benchmark statement's expected reward (SIMULATED estimate). */
  readonly expectedReward: number;
  /** §22: the prediction's reported interval. */
  readonly interval: { readonly lower: number; readonly upper: number };
  /** §22 uncertainty level of the prediction (the authority's summary). */
  readonly uncertaintyLevel: string;
  /** §20/§24 PIN: the prediction is simulation-derived — never measured. */
  readonly counterfactual: true;
  /** The disclosure the cited benchmark record carries. */
  readonly disclosure: string;
}

/** One reality observation cited by a calibration record (boundary chain). */
export interface LabCalibrationObservationView {
  readonly observationId: string;
  /** ISO-8601: when the observation became true in the real world. */
  readonly observedAt: string;
  readonly regime: string;
  /** External source references backing the observation (count for display). */
  readonly sourceRefCount: number;
  /** LOCK RULE 29 PIN: historical evidence — never a counterfactual output. */
  readonly counterfactual: false;
}

/** One append-only prediction-error record of a calibration chain. */
export interface LabCalibrationRecordView {
  /** The chain id (the authority's `LabCalibrationId`, as a string). */
  readonly calibrationId: string;
  /** Append-only chain position (records never rewrite). */
  readonly version: number;
  /** The tenant the chain belongs to (§31 — always explicit). */
  readonly tenantId: TenantId;
  /** Which frozen benchmark record + candidate the prediction cites. */
  readonly benchmarkRef: {
    readonly benchmarkId: string;
    readonly benchmarkVersion: number;
    readonly candidateKey: string;
  };
  /** The counterfactual-labeled prediction side (§20/§24). */
  readonly predicted: LabCalibrationPredictionView;
  /** The reality side: the observed outcome + its boundary-chain citations. */
  readonly observed: {
    readonly outcome: number;
    readonly observations: readonly LabCalibrationObservationView[];
  };
  /** The reward spec version both sides were valued under. */
  readonly rewardSpecVersion: number;
  /** The DECLARED frozen v1 error functional that produced the error fields. */
  readonly functional: LabCalibrationFunctionalView;
  readonly errors: {
    /** observed − predicted (positive = simulation UNDER-estimated reality). */
    readonly signedError: number;
    readonly absoluteError: number;
    readonly relativeError: number;
    /** §22: was reality inside the predicted interval? */
    readonly intervalContainment: boolean;
  };
  /** The shared regime the cited observations were taken under. */
  readonly regime: string;
  readonly recordedAt: string;
  readonly integrity: {
    readonly status: 'intact' | 'tampered';
    readonly digest: string;
  };
  /** §24 boundary statement carried on EVERY record (rendered verbatim). */
  readonly labOnly: string;
}

/** Summary statistics of one derived calibration context (plainly derived). */
export interface LabCalibrationContextSummaryView {
  readonly errorRecordCount: number;
  /** The bias: does simulation under/over-estimate reality? */
  readonly meanSignedError: number;
  readonly meanAbsoluteError: number;
  readonly worstAbsoluteError: number;
  /** §22 interval coverage: fraction of records whose outcome hit the interval. */
  readonly intervalCoverage: number;
  readonly regimes: readonly string[];
}

/** The DECLARED versioned feedback context of one benchmark chain (LAB-018). */
export interface LabCalibrationContextView {
  readonly benchmarkId: string;
  /** Context version within the benchmark chain's append-only context chain. */
  readonly version: number;
  readonly tenantId: TenantId;
  readonly derivedAt: string;
  readonly summary: LabCalibrationContextSummaryView;
  /** The exact error records folded, in deterministic order. */
  readonly errorRecordCitations: readonly {
    readonly calibrationId: string;
    readonly version: number;
  }[];
  readonly integrity: {
    readonly status: 'intact' | 'tampered';
    readonly digest: string;
  };
  /** §24 boundary statement carried on EVERY context record. */
  readonly labOnly: string;
}

/**
 * One calibration chain as listed: status over the error records plus the
 * derived-context state. `context: null` is the FIRST-CLASS honest
 * "calibration pending" state — the benchmark's calibration surface is
 * DECLARED pending reality and no context has been derived yet; the surface
 * renders it as such, never as a fabricated context.
 */
export interface LabCalibrationChainView {
  readonly calibrationId: string;
  /** The benchmark chain this calibration cites. */
  readonly benchmarkId: string;
  readonly tenantId: TenantId;
  readonly errorRecordCount: number;
  readonly latestErrorVersion: number;
  readonly latestErrorAt: string;
  /** Integrity of the latest error record (digest-sealed chain). */
  readonly latestIntegrity: 'intact' | 'tampered';
  /** The derived context when one exists, or null = calibration pending. */
  readonly context: LabCalibrationContextView | null;
  /** The distinct regimes the folded observations were taken under. */
  readonly regimes: readonly string[];
}

/** Typed failure shapes for the calibration port. */
export type LabCalibrationStatusFailure =
  | { readonly error: 'lab-calibration-unavailable'; readonly message: string }
  | { readonly error: 'lab-calibration-not-found'; readonly message: string };

/**
 * The declared Lab online-calibration view surface (read-only, 3 methods ≤
 * 12 policy budget). Async by design; failures are typed, never placeholders.
 */
export interface LabCalibrationStatusPort {
  /**
   * Every calibration chain visible in one tenant scope (§31 — cross-tenant
   * chains are never listed or leaked), ascending by calibration id.
   */
  listCalibrationChains(
    scope: TenantScope,
  ): Promise<readonly LabCalibrationChainView[] | LabCalibrationStatusFailure>;

  /**
   * Every append-only error-record version of one chain, oldest first — or
   * `lab-calibration-not-found` for unknown/cross-tenant ids.
   */
  loadCalibrationRecords(
    calibrationId: string,
    scope: TenantScope,
  ): Promise<readonly LabCalibrationRecordView[] | LabCalibrationStatusFailure>;

  /**
   * The latest derived calibration context of one benchmark chain, or `null`
   * when none has been derived in this tenant scope — the honest
   * calibration-pending state (a typed failure only for an unavailable
   * service; absence of a context is NOT a failure).
   */
  loadCalibrationContext(
    benchmarkId: string,
    scope: TenantScope,
  ): Promise<LabCalibrationContextView | null | LabCalibrationStatusFailure>;
}
