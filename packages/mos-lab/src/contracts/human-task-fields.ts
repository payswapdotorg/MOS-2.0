import type {
  ArtifactRef,
  ConsentRef,
  EvaluatorRef,
  JsonSchemaObject,
  Milliseconds,
  MoneyAmount,
  RightsRef,
  Timestamp,
} from '@mos/contracts';
import type { ReferenceModality } from './corpus.js';
import type { HumanTaskSubstitute } from './human-task-lifecycle.js';

/**
 * The TWELVE §17 human-production-task fields, each an explicit typed record
 * (LAB-014). Split from human-production-task.ts to respect the contract
 * file line budget (the W3-A/W5-A split precedent).
 *
 * Basis: spec/mos-architecture-v2.0.md §17 (the Lab creates a Human
 * Production Task with objective, source/reference, script/questions,
 * capture instructions, target modality, required artifacts, consent/rights,
 * evaluator, deadline, delay economics, acceptable substitutes). The §17
 * compound "consent/rights" field resolves into TWO records here — the
 * consent record carrying the `ConsentRef` and the rights record carrying
 * the `RightsRef`s — both from the `@mos/contracts` vocabulary, making the
 * twelve-field surface explicit.
 */

/** 1. Objective: what the human contribution is for. */
export interface HumanTaskObjective {
  /** The objective statement (non-blank). */
  readonly statement: string;
  /** Declared success criteria (non-empty). */
  readonly successCriteria: readonly string[];
}

/** 2. Source/reference: the source material the human works from (reference-first). */
export interface HumanTaskSourceReference {
  /** Source artifact references (non-empty; context travels with the reference). */
  readonly artifactRefs: readonly ArtifactRef[];
  /** Notes for the contributor (optional). */
  readonly notes?: string;
}

/** 3. Script or questions: the production script, or the interview questions (§14). */
export type HumanTaskScriptOrQuestions =
  | { readonly kind: 'script'; readonly beats: readonly string[] }
  | { readonly kind: 'questions'; readonly questions: readonly string[] };

/** 4. Capture instructions: how the human output must be captured. */
export interface HumanTaskCaptureInstructions {
  /** The capture brief (non-blank). */
  readonly brief: string;
  /** Declared capture requirements (equipment/environment/etc.). */
  readonly requirements: readonly string[];
}

/** 5. Target modality: the modality the human output must be in. */
export interface HumanTaskTargetModality {
  readonly modality: ReferenceModality;
}

/** 6. Required artifacts: what the fulfillment must contain. */
export interface HumanTaskRequiredArtifact {
  readonly artifactType: string;
  /** Minimum count of artifacts of this type (integer ≥ 1). */
  readonly minCount: number;
}

/** The required-artifacts record (non-empty). */
export interface HumanTaskRequiredArtifacts {
  readonly artifacts: readonly HumanTaskRequiredArtifact[];
}

/** 7. Consent: the consent record covering the human's contribution. */
export interface HumanTaskConsent {
  /** Consent record reference (@mos/contracts vocabulary; non-blank). */
  readonly consentRef: ConsentRef;
  /** What the consent covers (non-blank). */
  readonly scope: string;
}

/** 8. Rights: the declared rights requirements for source and output. */
export interface HumanTaskRights {
  /** Rights record references (non-empty; @mos/contracts vocabulary). */
  readonly rightsRefs: readonly RightsRef[];
}

/** 9. Evaluator: the bound evaluator reference plus its contract shape (execution is not this item). */
export interface HumanTaskEvaluator {
  readonly evaluatorRef: EvaluatorRef;
  /** Declared evaluator contract shape: what it consumes. */
  readonly inputSchema: JsonSchemaObject;
  /** Declared evaluator contract shape: the verdict it produces. */
  readonly outputSchema: JsonSchemaObject;
}

/** 10. Deadline: when the contribution stops being worth waiting for. */
export interface HumanTaskDeadline {
  readonly deadlineAt: Timestamp;
}

/** 11. Delay economics: the §2 delay-expectation first-class variable, as DECLARED expectations. */
export interface HumanTaskDelayEconomics {
  /** Pinned disclosure: these are declared expectations, never guarantees. */
  readonly declaration: 'declared-expectations';
  /** Estimated wait for the human contribution (ms, finite ≥ 0). */
  readonly expectedWaitMs: Milliseconds;
  /** Expected incremental value of the contribution (§18). */
  readonly expectedIncrementalValue: MoneyAmount;
  /** Delay cost per the declared dimensions (§18). */
  readonly delayCost: MoneyAmount;
  /** Acquisition cost of obtaining the contribution (§18). */
  readonly acquisitionCost: MoneyAmount;
  /** Probability the dependency resolves successfully, in [0, 1]. */
  readonly successProbability: number;
  /** Signed quality impact estimate. */
  readonly qualityImpact: number;
}

/** 12. Acceptable substitutes: the ordered preference list of alternative fulfillment paths. */
export interface HumanTaskAcceptableSubstitutes {
  readonly ordered: readonly HumanTaskSubstitute[];
}

/** The twelve-field surface (named failures cite the field). */
export type HumanProductionTaskFieldName =
  | 'objective'
  | 'source-reference'
  | 'script-or-questions'
  | 'capture-instructions'
  | 'target-modality'
  | 'required-artifacts'
  | 'consent'
  | 'rights'
  | 'evaluator'
  | 'deadline'
  | 'delay-economics'
  | 'acceptable-substitutes';
