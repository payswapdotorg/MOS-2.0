/**
 * BRIDGE-003 outcome contracts — the analysis verdict + the outcome
 * observation the LAB-018 calibration authority consumes.
 *
 * The ANALYSIS record (§24 → Learning/Calibration segment, experiments
 * side): the plainly-derived observed metric means over the folded
 * platform-said evidence, the counterfactual expectation citation VERBATIM
 * (staying counterfactual FOREVER — only MEASURED evidence is real), the
 * §21 reward-spec citation the LAB values the outcome under (the
 * experiments authority NEVER computes reward — that is the lab's
 * observed-domain valuation discipline, LAB-008), and the §22 uncertainty.
 *
 * THE OUTCOME CITATION SURFACE (the acceptance's LEARNING/CALIBRATION
 * FEED): the experiments package exposes outcome observations THROUGH THE
 * LAB-018 DECLARED BOUNDARY — `ExperimentOutcomeObservation` is
 * structurally EXACTLY the lab's `HistoricalObservation` shape (id,
 * version, tenantId, niche, platform, metrics, observedAt, sourceRefs,
 * regime, `counterfactual: false`), pinned assignable in both directions
 * in compat/lab-authority-compat.ts and driven end-to-end over the REAL
 * LAB-018 calibration authority in the compat battery. BY REFERENCE ONLY:
 * there is NO second calibration authority here and NO write path into lab
 * state (this surface is read-only projection — the LAB decides when and
 * how to consume it).
 */

import type { TenantId, Timestamp, UncertaintyLevel, Version } from "@mos/contracts";

import type { REAL_EXPERIMENT_BOUNDARY_STATEMENT } from "./experiment-boundary.js";
import type { ExperimentId, ExperimentObservationId } from "./ids.js";
import type { LabCandidateExpectations } from "./lab-candidate-seam.js";
import type { ExperimentObservationCitation } from "./evidence.js";

// ---------------------------------------------------------------------------
// The observed metric mean (plainly derived, LAB-008 discipline)
// ---------------------------------------------------------------------------

/**
 * ONE observed metric mean: the arithmetic mean of the NUMERIC members of
 * the platform-reported payloads that carry this metric name across the
 * folded observations (documented derivation — numeric members only;
 * non-numeric members are cited by the evidence record but never
 * aggregated; `unit` is the honest `platform-reported` label because the
 * platform payload is unit-undeclared).
 */
export interface ExperimentObservedMetricMean {
  readonly metric: string;
  readonly value: number;
  readonly unit: "platform-reported";
}

// ---------------------------------------------------------------------------
// The analysis outcome record (append-only version chain)
// ---------------------------------------------------------------------------

/**
 * The frozen v1 analysis conclusion vocabulary: the outcome record states
 * the measured outcome was recorded — the prediction-error computation and
 * calibration are the LAB-018 authority's domain (cited by reference, this
 * record never implies them).
 */
export type ExperimentOutcomeConclusion = "measured-outcome-recorded";

/**
 * ONE analysis outcome record version — the analysis verdict feeding
 * calibration. Append-only per (tenant, outcome id); re-analysis appends
 * the next version over NEW evidence (a later measured evidence version);
 * prior versions stay bit-for-bit immutable.
 */
export interface ExperimentOutcomeRecord {
  readonly id: ExperimentId;
  readonly version: Version;
  readonly tenantId: TenantId;
  /** The experiment this outcome belongs to (chain key ≡ the experiment id). */
  readonly experimentRef: { readonly experimentId: ExperimentId; readonly experimentVersion: number };
  /** The EXACT evidence record version folded. */
  readonly evidenceRef: { readonly evidenceId: ExperimentId; readonly version: number };
  /** The observed metric means (plainly derived, LAB-008 discipline). */
  readonly observedMetricMeans: readonly ExperimentObservedMetricMean[];
  /** The observations folded (verbatim citations — the measurement trail). */
  readonly observations: readonly ExperimentObservationCitation[];
  /** The counterfactual expectation citation, VERBATIM (stays counterfactual FOREVER). */
  readonly counterfactualExpectation: LabCandidateExpectations & {
    /** The canonical lab-candidate ref encoding (the LAB-018 prediction ref form). */
    readonly labCandidateRef: string;
  };
  /**
   * The §21 reward-spec citation: which mission reward spec version the
   * LAB values this outcome under (the experiments authority never
   * computes reward — cited, never re-valued).
   */
  readonly rewardSpecCitation: {
    readonly missionRef: string;
    readonly missionVersion: number;
    readonly rewardSpecVersion: number;
  };
  /** The §22 uncertainty declaration of the analysis. */
  readonly uncertainty: {
    readonly level: UncertaintyLevel;
    readonly note: string;
    readonly observationCount: number;
    readonly distinctProviders: number;
  };
  readonly conclusion: ExperimentOutcomeConclusion;
  /** The outcome-observation id this record projects (the lab's citation). */
  readonly outcomeObservationId: ExperimentObservationId;
  readonly analysedAt: string;
  /** The §24 boundary statement (verbatim, every record). */
  readonly boundaryStatement: typeof REAL_EXPERIMENT_BOUNDARY_STATEMENT;
  readonly outcomeDigest: string;
}

// ---------------------------------------------------------------------------
// The outcome observation (the LAB-018 declared boundary projection)
// ---------------------------------------------------------------------------

/**
 * ONE outcome observation — the experiments authority's projection of one
 * analysis outcome record onto the LAB-018 reality-observation boundary.
 * STRUCTURALLY EXACTLY the lab's `HistoricalObservation` (compat-pinned
 * mutually assignable — zero drift): `counterfactual: false` by literal
 * type AND runtime re-validation in the reader adapter (the LAB-018
 * double-cast-guard discipline). Field derivations (documented):
 * - `metrics` — the analysis's observed metric means;
 * - `observedAt` — the measurement window END (when the full measurement
 *   became true in the real world — the Time Machine visibility key);
 * - `sourceRefs` — the REAL platform-said observation ids + the
 *   platform-confirmed publication id (non-empty, traceable, never invented);
 * - `niche`/`regime` — the declared measurement context, carried verbatim;
 * - `platform` — the REAL publication's provider id (never caller-claimed);
 * - `version` — the outcome record version it projects.
 */
export interface ExperimentOutcomeObservation {
  readonly id: ExperimentObservationId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly metrics: readonly { readonly metric: string; readonly value: number; readonly unit: string }[];
  readonly observedAt: Timestamp;
  readonly sourceRefs: readonly string[];
  readonly regime: string;
  /** LOCK RULE 29 PIN: real measured evidence — never a counterfactual model output. */
  readonly counterfactual: false;
}
