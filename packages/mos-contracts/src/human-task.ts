/**
 * HumanProductionTask and BottleneckDecision contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   HumanProductionTask.required = [id, version, objective, sourceRefs,
 *     scriptOrQuestions, captureBrief, targetOutput, rightsConsent,
 *     evaluator, deadline, expectedValueOfWaiting, acceptableSubstitutions]
 *   BottleneckDecision.required = [id, version, dependency,
 *     expectedIncrementalValue, expectedWait, delayCost, acquisitionCost,
 *     successProbability, qualityImpact, selectedAction]
 *
 * Basis: spec/mos-architecture-v2.0.md §17 (human production and Arena: the
 * Lab creates a Human Production Task with objective, source/reference,
 * script/questions, capture instructions, target modality, required
 * artifacts, consent/rights, evaluator, deadline, delay economics,
 * acceptable substitutes; human output returns as an INTERMEDIATE
 * artifact), §18 (production bottleneck economics: the Expected Value of
 * Delay is a first-class variable — expected incremental value, estimated
 * wait, delay cost, acquisition cost, probability of success, quality
 * impact, alternative paths; the Lab may wait, retry, substitute
 * engine/capability/provider, switch organization/transform, reduce scope,
 * proceed without human, or abandon).
 */

import type {
  ArtifactType,
  ConsentRef,
  EvaluatorRef,
  HumanProductionTaskId,
  BottleneckDecisionId,
  Milliseconds,
  MoneyAmount,
  Timestamp,
  Version,
} from "./value-types.js";

import type { ArtifactRef } from "./artifact.js";

// ---------------------------------------------------------------------------
// HumanProductionTask
// ---------------------------------------------------------------------------

/** Target output specification for a human production task. */
export interface TargetOutput {
  /** Modality of the required human output (e.g. "audio", "video", "text"). */
  readonly modality: ArtifactType;
  /** Artifact types the fulfillment must contain. */
  readonly requiredArtifactTypes: readonly ArtifactType[];
}

/**
 * Acceptable substitutes when human contribution cannot be obtained in
 * time (spec §18 substitution options).
 */
export type AcceptableSubstitution =
  | "engine"
  | "capability"
  | "provider"
  | "organization"
  | "transform"
  | "reduced-scope"
  | "proceed-without-human";

/**
 * A task for a human contribution to production. Fulfillment may come from
 * the project owner, an authorized collaborator, or the Arena provider
 * (through Integration — never a second MOS marketplace). Human output
 * returns to the organization as an intermediate artifact, never silently
 * final.
 */
export interface HumanProductionTask {
  readonly id: HumanProductionTaskId;
  readonly version: Version;
  readonly objective: string;
  readonly sourceRefs: readonly ArtifactRef[];
  readonly scriptOrQuestions: readonly string[];
  /** Capture instructions for the contributing human. */
  readonly captureBrief: string;
  readonly targetOutput: TargetOutput;
  /** Consent record covering the human's contribution and its rights. */
  readonly rightsConsent: ConsentRef;
  readonly evaluator: EvaluatorRef;
  readonly deadline: Timestamp;
  /** Expected value of waiting for the human contribution (spec §18). */
  readonly expectedValueOfWaiting: MoneyAmount;
  readonly acceptableSubstitutions: readonly AcceptableSubstitution[];
}

// ---------------------------------------------------------------------------
// BottleneckDecision
// ---------------------------------------------------------------------------

/** Actions the Lab may take at a production bottleneck (spec §18). */
export type BottleneckAction =
  | "wait"
  | "retry"
  | "substitute-engine"
  | "substitute-capability"
  | "substitute-provider"
  | "switch-organization"
  | "switch-transform"
  | "reduce-scope"
  | "proceed-without-human"
  | "abandon";

/**
 * The recorded decision at one production bottleneck: the dependency being
 * waited on, the economics of waiting versus acting, and the selected
 * action. Abandoned branches remain auditable and may be learning data.
 */
export interface BottleneckDecision {
  readonly id: BottleneckDecisionId;
  readonly version: Version;
  /** The dependency this decision is about (opaque descriptor). */
  readonly dependency: string;
  readonly expectedIncrementalValue: MoneyAmount;
  readonly expectedWait: Milliseconds;
  readonly delayCost: MoneyAmount;
  readonly acquisitionCost: MoneyAmount;
  /** Probability the dependency resolves successfully, in [0, 1]. */
  readonly successProbability: number;
  /** Signed quality impact estimate of the selected action. */
  readonly qualityImpact: number;
  readonly selectedAction: BottleneckAction;
}
