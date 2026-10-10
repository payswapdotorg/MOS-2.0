/**
 * BRIDGE-003 outcome analysis — the pure analysis verdict over the folded
 * platform-said evidence (the experiments side of the §24 →
 * Learning/Calibration segment).
 *
 * THE ANALYSIS NEVER COMPUTES REWARD (the authority split): the outcome
 * carries the plainly-derived observed metric MEANS (the LAB-008
 * observed-domain discipline — arithmetic means of the numeric members of
 * the platform-reported payloads, keyed by metric name; non-numeric
 * members are cited by the evidence record but never aggregated), the
 * counterfactual expectation citation VERBATIM (staying counterfactual
 * FOREVER — only MEASURED evidence is real), and the §21 reward-spec
 * CITATION the LAB-018 values the outcome under. The prediction-error
 * computation and calibration are the LAB-018 authority's domain — this
 * surface only feeds it by reference.
 *
 * Aggregation rules (documented, deterministic):
 * - a metric name aggregates over the observations whose `reported` payload
 *   carries a FINITE NUMBER under that key (non-numeric members are
 *   ignored by aggregation, never coerced);
 * - the mean is the arithmetic mean (finite by construction);
 * - the metric order in the result is the first-seen order over the
 *   observations (deterministic — the evidence citations arrive in
 *   observedAt order);
 * - `unit` is the honest `platform-reported` label (platform payloads are
 *   unit-undeclared).
 */

import type { UncertaintyLevel } from "@mos/contracts";

import type {
  ExperimentObservedMetricMean,
  ExperimentOutcomeRecord,
} from "../contracts/outcome.js";
import type { MeasuredExperimentEvidence } from "../contracts/evidence.js";
import type { LabCandidateExpectations } from "../contracts/lab-candidate-seam.js";
import type { ExperimentId, ExperimentObservationId } from "../contracts/ids.js";
import { experimentObservationIdOf } from "../contracts/ids.js";

/** One entry of the mean computation (internal). */
interface MetricAccumulator {
  sum: number;
  count: number;
}

/**
 * The observed metric means over the folded evidence (numeric members
 * only — documented derivation, never invented).
 */
export const observedMetricMeansOf = (
  evidence: MeasuredExperimentEvidence,
): readonly ExperimentObservedMetricMean[] => {
  const accumulators = new Map<string, MetricAccumulator>();
  for (const observation of evidence.observations) {
    const reported = observation.reported as Record<string, unknown>;
    if (reported === null || typeof reported !== "object") {
      continue;
    }
    for (const [metric, value] of Object.entries(reported)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue; // non-numeric members: cited, never aggregated.
      }
      const current = accumulators.get(metric) ?? { sum: 0, count: 0 };
      accumulators.set(metric, { sum: current.sum + value, count: current.count + 1 });
    }
  }
  return [...accumulators.entries()].map(([metric, accumulator]) => ({
    metric,
    value: accumulator.sum / accumulator.count,
    unit: "platform-reported" as const,
  }));
};

/** The §22 uncertainty level of the analysis (reuses the evidence heuristic). */
export const analysisUncertaintyLevelOf = (observationCount: number): UncertaintyLevel => {
  if (observationCount < 2) {
    return "high";
  }
  if (observationCount < 5) {
    return "moderate";
  }
  return "low";
};

/** The frozen analysis-note statement (verbatim on every outcome record). */
export const EXPERIMENT_ANALYSIS_NOTE =
  "observed metric means are arithmetic means of the numeric members of the platform-reported payloads (LAB-008 observed-domain discipline — never invented; the reward valuation and prediction error are the LAB-018 authority's domain, cited by reference)" as const;

/**
 * Assemble the analysis outcome record over one measured evidence version
 * (pure — the store assigns nothing; the caller supplies the chain
 * bookkeeping). The counterfactual expectation citation rides VERBATIM
 * from the experiment record's lab segment (rule 29).
 */
export const assembleOutcomeRecord = (input: {
  readonly experimentId: ExperimentId;
  readonly tenantId: string;
  readonly experimentVersion: number;
  readonly evidence: MeasuredExperimentEvidence;
  readonly counterfactualExpectation: LabCandidateExpectations;
  readonly labCandidateRef: string;
  readonly rewardSpecCitation: {
    readonly missionRef: string;
    readonly missionVersion: number;
    readonly rewardSpecVersion: number;
  };
  readonly measurement: {
    readonly niche: string;
    readonly platform: string;
    readonly regime: string;
    readonly windowEnd: import("@mos/contracts").Timestamp;
  };
  readonly analysedAt: string;
  readonly digest: string;
}): ExperimentOutcomeRecord => {
  const outcomeObservationId: ExperimentObservationId = experimentObservationIdOf(input.experimentId);
  return {
    id: input.experimentId,
    version: 1 as ExperimentOutcomeRecord["version"],
    tenantId: input.tenantId as ExperimentOutcomeRecord["tenantId"],
    experimentRef: {
      experimentId: input.experimentId,
      experimentVersion: input.experimentVersion,
    },
    evidenceRef: { evidenceId: input.experimentId, version: input.evidence.version },
    observedMetricMeans: observedMetricMeansOf(input.evidence),
    observations: input.evidence.observations.map((citation) => ({
      ...citation,
      reported: structuredClone(citation.reported),
    })),
    counterfactualExpectation: {
      ...structuredClone(input.counterfactualExpectation),
      labCandidateRef: input.labCandidateRef,
    },
    rewardSpecCitation: { ...input.rewardSpecCitation },
    uncertainty: {
      level: analysisUncertaintyLevelOf(input.evidence.observations.length),
      note: EXPERIMENT_ANALYSIS_NOTE,
      observationCount: input.evidence.observations.length,
      distinctProviders: input.evidence.uncertainty.distinctProviders,
    },
    conclusion: "measured-outcome-recorded",
    outcomeObservationId,
    analysedAt: input.analysedAt,
    boundaryStatement: input.evidence.boundaryStatement,
    outcomeDigest: input.digest,
  };
};

/**
 * Project one outcome record onto the LAB-018 boundary observation (pure —
 * field derivations documented on {@link ExperimentOutcomeObservation}).
 */
export const projectOutcomeObservation = (
  outcome: ExperimentOutcomeRecord,
  measurement: {
    readonly niche: string;
    readonly platform: string;
    readonly regime: string;
    readonly windowEnd: import("@mos/contracts").Timestamp;
    readonly publicationId: string;
  },
): {
  readonly id: ExperimentObservationId;
  readonly version: ExperimentOutcomeRecord["version"];
  readonly tenantId: ExperimentOutcomeRecord["tenantId"];
  readonly niche: string;
  readonly platform: string;
  readonly metrics: readonly { readonly metric: string; readonly value: number; readonly unit: string }[];
  readonly observedAt: import("@mos/contracts").Timestamp;
  readonly sourceRefs: readonly string[];
  readonly regime: string;
  readonly counterfactual: false;
} => {
  if (outcome.observations.length === 0) {
    // Fail loud — an outcome record always folds at least one observation
    // (the analyse path fails closed on empty evidence; this branch is
    // store-corruption territory, never silently defaulted).
    throw new Error(
      "project outcome observation: the outcome record folds zero observations — the record shape is corrupt (never silently defaulted)",
    );
  }
  const sourceRefs = [
    ...outcome.observations.map((observation) => String(observation.observationId)),
    `social-publication:${measurement.publicationId}`,
  ];
  return {
    id: outcome.outcomeObservationId,
    version: outcome.version,
    tenantId: outcome.tenantId,
    niche: measurement.niche,
    platform: measurement.platform,
    metrics: outcome.observedMetricMeans.map((mean) => ({
      metric: mean.metric,
      value: mean.value,
      unit: mean.unit,
    })),
    observedAt: measurement.windowEnd,
    sourceRefs,
    regime: measurement.regime,
    counterfactual: false,
  };
};
