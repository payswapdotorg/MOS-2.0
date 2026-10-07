import type { TenantScope } from '@mos/contracts';
import type {
  DelayAbandonmentRecord,
  DelayAbandonedPath,
  DelayLearningRelevantOutcome,
} from './delay-abandonment.js';
import type {
  DelayAbandonmentRecordId,
  DelayDecisionAnalysisId,
  DelayDimensionName,
  DelayOptionKind,
} from './delay-economics.js';
import type {
  DelayDecisionAnalysis,
  DelayEvaluationInput,
} from './delay-decision.js';

/**
 * The Delay Decision PORT + failure model (LAB-015, §18). Split from
 * delay-decision.ts to respect the contract file line budget (the W3-A/W5-A
 * split precedent).
 *
 * SEVEN public methods (≤ 12 policy budget): evaluate (the ten §18 options
 * analyzed + ranked under the declared versioned policy), analysis reads
 * (get/list), the abandoned-path audit records (record abandonment citing
 * the analysis that justified it, append learning-relevant outcomes when
 * later known, get/list).
 */

/** Machine-readable failure codes for delay decision operations. */
export type DelayDecisionErrorCode =
  | 'invalid-input'
  | 'invalid-option-declaration'
  | 'missing-dimension'
  | 'invalid-dimension'
  | 'estimate-without-provenance'
  | 'invalid-interval'
  | 'currency-mismatch'
  | 'reward-spec-mismatch'
  | 'policy-version-mismatch'
  | 'duplicate-analysis'
  | 'no-applicable-options'
  | 'ensemble-derivation-unresolved'
  | 'analysis-not-found'
  | 'abandonment-not-found'
  | 'duplicate-abandonment-record'
  | 'invalid-abandonment';

/** Typed failure value (result union, the MOS domain convention). */
export interface DelayDecisionError {
  readonly error: DelayDecisionErrorCode;
  readonly message: string;
  /** The named dimension (dimension-validation failures only). */
  readonly dimension?: DelayDimensionName;
  /** The named option kind (option-validation failures only). */
  readonly option?: DelayOptionKind;
}

/** The Delay Decision port (LAB-015). */
export interface DelayDecisionPort {
  /**
   * Evaluate a delay decision: validate the ten option declarations
   * (dimensions, provenance, targets, reward-spec denomination), compute the
   * EV of delay per the DECLARED VERSIONED policy, rank the applicable
   * options deterministically and record the immutable analysis. Fails
   * closed with the typed codes above (naming the dimension / option).
   */
  evaluateDelayDecision(
    input: DelayEvaluationInput,
  ): Promise<DelayDecisionAnalysis | DelayDecisionError>;

  /**
   * Fetch one analysis, or `null` when unknown in this tenant scope (unknown
   * and cross-tenant are indistinguishable on reads).
   */
  getDelayDecisionAnalysis(
    scope: TenantScope,
    analysisId: DelayDecisionAnalysisId,
  ): Promise<DelayDecisionAnalysis | null>;

  /** The analyses visible in this tenant scope (insertion order). */
  listDelayDecisionAnalyses(scope: TenantScope): Promise<readonly DelayDecisionAnalysis[]>;

  /**
   * Record an AUDITABLE abandoned decision path: what was abandoned, why,
   * and the analysis that justified it (snapshotted). Abandoned branches
   * are learning data — the record shape feeds LAB-017/018 later; no
   * learning is implemented here. Fails with `analysis-not-found`,
   * `duplicate-abandonment-record` or `invalid-abandonment`.
   */
  recordDelayAbandonment(
    input: RecordDelayAbandonmentInput,
  ): Promise<DelayAbandonmentRecord | DelayDecisionError>;

  /**
   * Append one learning-relevant outcome to an abandonment record (append
   * only — version + 1; prior versions stay resolvable bit-for-bit;
   * outcomes are recorded WHEN LATER KNOWN, never invented). Fails with
   * `abandonment-not-found` / `invalid-abandonment` /
   * `estimate-without-provenance`.
   */
  recordDelayAbandonmentOutcome(
    input: RecordDelayAbandonmentOutcomeInput,
  ): Promise<DelayAbandonmentRecord | DelayDecisionError>;

  /**
   * Fetch one abandonment record (latest version, or the EXACT version when
   * given), or `null` when unknown in this tenant scope.
   */
  getDelayAbandonmentRecord(
    scope: TenantScope,
    recordId: DelayAbandonmentRecordId,
    version?: number,
  ): Promise<DelayAbandonmentRecord | null>;

  /** The latest version of every abandonment record in scope (insertion order). */
  listDelayAbandonmentRecords(
    scope: TenantScope,
  ): Promise<readonly DelayAbandonmentRecord[]>;
}

/** Record an abandoned decision path (see {@link DelayDecisionPort.recordDelayAbandonment}). */
export interface RecordDelayAbandonmentInput {
  readonly scope: TenantScope;
  readonly recordId: DelayAbandonmentRecordId;
  /** The analysis that justified the abandonment (must resolve in this tenant scope). */
  readonly analysisId: DelayDecisionAnalysisId;
  /** WHAT was abandoned: the abandoned path's option kind + target. */
  readonly abandonedPath: DelayAbandonedPath;
  /** WHY (non-blank). */
  readonly reason: string;
}

/** Append one learning-relevant outcome (recorded when later known). */
export interface RecordDelayAbandonmentOutcomeInput {
  readonly scope: TenantScope;
  readonly recordId: DelayAbandonmentRecordId;
  readonly outcome: DelayLearningRelevantOutcome;
}
