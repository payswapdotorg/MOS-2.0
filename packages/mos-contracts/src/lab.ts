/**
 * LabScenario, LabRun, CalibrationRecord and RealExperimentBinding
 * contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   LabScenario.required = [id, version, niche, platform, objective,
 *     context, budget, informationLag, corpusVersion, simulatorVersion,
 *     rewardVersion]
 *   LabRun.required = [id, version, scenarioRef, seed, cutoff,
 *     worldModelVersion, strategyCandidates, lifecycle, predictionSummary,
 *     uncertaintySummary]
 *   CalibrationRecord.required = [id, version, labRunRef, worldModelVersion,
 *     simulatedPrediction, uncertainty, observedOutcome, predictionError,
 *     regime, updateVersion]
 *   RealExperimentBinding.required = [id, labCandidateRef, missionRef,
 *     productionRequestRef, policyRef, rightsRef, distributionRef,
 *     experimentRef, evidenceRef]
 *
 * Basis: spec/mos-architecture-v2.0.md §20 (Lab simulation: reference-first
 * corpus, social world model, Time Machine with information lag L — at T
 * the agent sees only information available by T-L; historical fact and
 * counterfactual model output remain distinct), §21 (reward), §22
 * (uncertainty summaries are first-class), §24 (real-world boundary: real
 * experiments are bound to lab candidates with policy/rights/evidence),
 * spec/mos-architecture-policy-v2.0.yaml lab rules (no direct publication,
 * no direct provider calls, counterfactuals labeled, delayed mode prevents
 * future leakage).
 *
 * The lab module (@mos/lab, LAB-001+) implements against these types.
 */

import type {
  Budget,
  CalibrationRecordId,
  EvidenceRef,
  ExperimentBindingId,
  ExperimentRef,
  DistributionRef,
  JsonSchemaObject,
  LabCandidateRef,
  LabRunId,
  LabScenarioId,
  MissionRef,
  PolicyRef,
  ProductionRequestId,
  RightsRef,
  StrategyRef,
  Timestamp,
  UncertaintySummary,
  Version,
} from "./value-types.js";

// ---------------------------------------------------------------------------
// LabScenario
// ---------------------------------------------------------------------------

/**
 * A simulation scenario: the niche and platform under study, the objective,
 * scenario context, budget, the Time Machine information lag L (spec §20),
 * and the exact versions of the reference corpus, simulator and reward
 * model the scenario runs against.
 */
export interface LabScenario {
  readonly id: LabScenarioId;
  readonly version: Version;
  readonly niche: string;
  readonly platform: string;
  readonly objective: string;
  readonly context: JsonSchemaObject;
  readonly budget: Budget;
  /** Time Machine information lag L: at T the agent sees only information available by T-L. */
  readonly informationLag: number;
  readonly corpusVersion: Version;
  readonly simulatorVersion: Version;
  readonly rewardVersion: Version;
}

// ---------------------------------------------------------------------------
// LabRun
// ---------------------------------------------------------------------------

/** Lifecycle states of one Lab run. */
export type LabRunLifecycleState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "abandoned";

/**
 * One simulation run of a scenario: the seed and cutoff (Time Machine T),
 * the world model version, the strategy candidates under evaluation, the
 * run lifecycle, the prediction summary and its uncertainty summary.
 * Historical and counterfactual data are distinct (counterfactuals
 * labeled — the scenario context and cutoff carry the mode).
 */
export interface LabRun {
  readonly id: LabRunId;
  readonly version: Version;
  readonly scenarioRef: LabScenarioId;
  /** Determinism seed for the run; `null` when the simulator is not seeded. */
  readonly seed: number | null;
  /** Time Machine cutoff T (the run sees only information available by T-L). */
  readonly cutoff: Timestamp;
  readonly worldModelVersion: Version;
  readonly strategyCandidates: readonly StrategyRef[];
  readonly lifecycle: LabRunLifecycleState;
  readonly predictionSummary: string;
  readonly uncertaintySummary: UncertaintySummary;
}

// ---------------------------------------------------------------------------
// CalibrationRecord
// ---------------------------------------------------------------------------

/**
 * One calibration point: what the world model predicted for a Lab run, the
 * uncertainty of that prediction, the observed real-world outcome, the
 * signed prediction error, the regime it was observed under, and the world
 * model update version it fed.
 */
export interface CalibrationRecord {
  readonly id: CalibrationRecordId;
  readonly version: Version;
  readonly labRunRef: LabRunId;
  readonly worldModelVersion: Version;
  readonly simulatedPrediction: number;
  readonly uncertainty: UncertaintySummary;
  readonly observedOutcome: number;
  readonly predictionError: number;
  /** Regime label the observation was taken under (e.g. market/behavioral regime). */
  readonly regime: string;
  readonly updateVersion: Version;
}

// ---------------------------------------------------------------------------
// RealExperimentBinding
// ---------------------------------------------------------------------------

/**
 * The binding of a Lab strategy candidate to a real experiment: which
 * mission, production request, policy, rights record, distribution run,
 * experiment and evidence record the real-world test consists of. The
 * real-world boundary (spec §24) — every real claim is bound to its lab
 * candidate and its evidence.
 *
 * Projected exactly as the frozen contract list (no `version` field on
 * this contract).
 */
export interface RealExperimentBinding {
  readonly id: ExperimentBindingId;
  readonly labCandidateRef: LabCandidateRef;
  readonly missionRef: MissionRef;
  readonly productionRequestRef: ProductionRequestId;
  readonly policyRef: PolicyRef;
  readonly rightsRef: RightsRef;
  readonly distributionRef: DistributionRef;
  readonly experimentRef: ExperimentRef;
  readonly evidenceRef: EvidenceRef;
}
