import type { TenantId, Timestamp } from '@mos/contracts';
import type { DelayDecisionAnalysis } from './delay-decision.js';
import type {
  DelayAbandonmentRecordId,
  DelayDecisionAnalysisId,
  DelayEstimateDerivation,
  DelayOptionKind,
  DelayOptionTarget,
} from './delay-economics.js';

/**
 * Abandoned decision paths as AUDITABLE records (LAB-015, §18).
 *
 * Basis: spec/mos-architecture-v2.0.md §18 ("Abandoned branches remain
 * auditable and may be learning data"), §2 (abandonment is first-class,
 * never silent), architecture lock rule 26 (human waiting may be abandoned
 * when delay cost dominates expected incremental value).
 *
 * A {@link DelayAbandonmentRecord} captures WHAT was abandoned (the
 * dependency + the abandoned option path and its BY-REFERENCE target), WHY
 * (the caller's non-blank reason), THE ANALYSIS THAT JUSTIFIED IT (the full
 * immutable analysis snapshot — bit-for-bit, so the justification stays
 * interpretable even as policies evolve) and the LEARNING-RELEVANT OUTCOMES
 * recorded WHEN LATER KNOWN (append-only — the record's version chain grows,
 * nothing is rewritten). The record SHAPE feeds LAB-017/018 later; NO
 * learning is implemented here (disclosed, pinned by the learningFeed
 * literal).
 */

// ---------------------------------------------------------------------------
// What was abandoned
// ---------------------------------------------------------------------------

/**
 * WHAT was abandoned: the abandoned path's option kind and its
 * BY-REFERENCE target (e.g. the `wait` path on a human dependency, or the
 * `abandon` option itself when the whole dependency is given up). The target
 * shape is validated against the option kind exactly like an option
 * declaration's target.
 */
export interface DelayAbandonedPath {
  readonly optionKind: DelayOptionKind;
  readonly target: DelayOptionTarget;
}

// ---------------------------------------------------------------------------
// Learning-relevant outcomes (recorded when later known)
// ---------------------------------------------------------------------------

/**
 * One learning-relevant outcome of an abandonment, recorded WHEN LATER
 * KNOWN: what actually happened after the branch was abandoned (e.g. the
 * dependency resolved anyway; the substitute delivered at a different
 * quality; nothing happened). The outcome carries the SAME provenance
 * vocabulary as every §18 estimate — an outcome without provenance is
 * rejected, exactly like an estimate.
 */
export interface DelayLearningRelevantOutcome {
  /** When the outcome became known (ISO-8601). */
  readonly observedAt: Timestamp;
  /** The declared outcome (non-blank; a declaration, never an inference). */
  readonly outcome: string;
  readonly derivation: DelayEstimateDerivation;
}

// ---------------------------------------------------------------------------
// The abandonment record (versioned, tenant-scoped, append-only)
// ---------------------------------------------------------------------------

/**
 * The AUDITABLE abandoned-branch record. Created by
 * `recordDelayAbandonment` (version 1, outcomes empty — outcomes are
 * recorded when later known); every outcome append produces version + 1 and
 * prior versions stay resolvable BIT-FOR-BIT. Records are deep-frozen; the
 * analysis snapshot is the full immutable analysis that justified the
 * abandonment.
 */
export interface DelayAbandonmentRecord {
  readonly id: DelayAbandonmentRecordId;
  /** Append-only version chain per (tenant, record id). */
  readonly version: number;
  readonly tenantId: TenantId;
  /** The analysis that justified the abandonment (full immutable snapshot). */
  readonly analysisId: DelayDecisionAnalysisId;
  /** The dependency that was being decided on (carried verbatim). */
  readonly dependency: string;
  /** WHAT was abandoned (the option path + its BY-REFERENCE target). */
  readonly abandonedPath: DelayAbandonedPath;
  /** WHY (non-blank, caller-declared). */
  readonly reason: string;
  /** THE ANALYSIS THAT JUSTIFIED IT (snapshotted bit-for-bit). */
  readonly analysis: DelayDecisionAnalysis;
  /** Learning-relevant outcomes, appended when later known (never invented). */
  readonly outcomes: readonly DelayLearningRelevantOutcome[];
  readonly abandonedAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** PIN: abandoned branches are learning data — the shape feeds LAB-017/018; no learning is implemented here. */
  readonly learningFeed: 'abandoned-branches-are-learning-data-no-learning-implemented';
}
