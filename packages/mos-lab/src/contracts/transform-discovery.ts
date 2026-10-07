import type { TenantScope, Timestamp, TransformId } from '@mos/contracts';
import type {
  ProposeTransformCandidateInput,
  ReviseTransformCandidateInput,
  TransformCandidate,
  TransformCandidateId,
  TransformCandidateOrigin,
} from './transform-candidate.js';
import type {
  RecordTransformGateEvidenceInput,
  TransformGateEvidenceEntry,
  TransformPromotionGateName,
} from './transform-promotion-gates.js';

/**
 * Transform Discovery port contracts for the Marketing Lab (LAB-012, §8).
 *
 * Basis: spec/mos-architecture-v2.0.md §8 (known / composed / discovered
 * candidates; the seven promotion gates), §7 (a promoted transform becomes
 * AVAILABLE to production program search), §24 (no auto-production —
 * promotion never deploys, never publishes), architecture lock rules 5/6/7,
 * spec/mos-effective-backlog-v2.0.md LAB-012.
 *
 * The {@link TransformDiscoveryPort} manages candidates and their promotion:
 * proposal/revision (append-only candidate versions), gate-evidence
 * recording (append-only log, one explicit record per §8 gate), promotion
 * (all seven gates evaluated fail-closed IN §8 ORDER — the first failing
 * gate is the named failure) and the promotion-attempt audit trail. A
 * PROMOTED candidate becomes a new {@link TransformDefinition} version in
 * the W5-A registry through its append-only register/revise paths —
 * discovery NEVER mutates a definition in place, and nothing here deploys
 * or publishes anything (the §24 boundary is untouched; LAB-016 program
 * search is the consumer).
 */

/** One evaluated gate outcome on a successful promotion. */
export interface TransformGateOutcome {
  readonly gate: TransformPromotionGateName;
  readonly passed: true;
  /** The evidence log entry that satisfied the gate. */
  readonly entryId: string;
}

/**
 * A successful promotion: the candidate FROZEN at an exact version (§8 gate
 * 6) and materialized as a NEW definition version in the W5-A registry
 * through the append-only path — plus the seven evaluated gate outcomes.
 */
export interface TransformPromotion {
  readonly candidateId: TransformCandidateId;
  /** The exact candidate version frozen by this promotion. */
  readonly candidateVersion: number;
  readonly origin: TransformCandidateOrigin;
  readonly definitionId: TransformId;
  /** The NEW definition version this promotion appended. */
  readonly definitionVersion: number;
  readonly promotionPath: 'registry-append-only';
  /** All seven gates, in §8 order, each with its satisfying evidence entry. */
  readonly gates: readonly TransformGateOutcome[];
  readonly promotedAt: Timestamp;
}

/** One APPEND-ONLY promotion attempt (success or named-gate rejection). */
export interface TransformPromotionAttempt {
  /** Deterministic 1-based attempt sequence for the candidate. */
  readonly attempt: number;
  readonly candidateId: TransformCandidateId;
  /** The candidate version the attempt froze/evaluated. */
  readonly candidateVersion: number;
  readonly outcome: 'promoted' | 'rejected';
  /** The named §8 gate that failed (rejections only). */
  readonly failedGate: TransformPromotionGateName | null;
  readonly reason: string;
  readonly definitionId: TransformId | null;
  readonly definitionVersion: number | null;
  readonly attemptedAt: Timestamp;
}

/** Machine-readable failure codes for transform discovery operations. */
export type TransformDiscoveryErrorCode =
  | 'invalid-input'
  | 'duplicate-candidate'
  | 'candidate-not-found'
  | 'unknown-cited-definition'
  | 'unknown-cited-graph'
  | 'empty-derivation'
  | 'unknown-derivation-ref'
  | 'unresolved-capability-requirement'
  | 'rights-policy-declaration-mismatch'
  | 'evaluator-binding-mismatch'
  | 'incomplete-benchmark-record'
  | 'stale-freeze-declaration'
  | 'gate-evidence-missing'
  | 'contract-validation-failed'
  | 'capability-feasibility-failed'
  | 'benchmark-not-passed'
  | 'provenance-incomplete'
  | 'already-promoted'
  | 'promotion-registry-failure';

/**
 * Typed failure value (result union, the MOS domain convention). Promotion
 * failures carry the named §8 gate in `gate`.
 */
export interface TransformDiscoveryError {
  readonly error: TransformDiscoveryErrorCode;
  readonly message: string;
  /** The named §8 gate (gate-evidence and promotion failures only). */
  readonly gate?: TransformPromotionGateName;
}

/**
 * The Transform Discovery port (LAB-012 runtime). Eight public methods
 * (architecture policy budget: 12).
 *
 * NO AUTO-PRODUCTION (§24): promotion makes a transform AVAILABLE to
 * program search — the port has no deploy/publish surface at all.
 */
export interface TransformDiscoveryPort {
  /**
   * Propose a transform candidate (version 1). KNOWN candidates must cite a
   * definition resolving at its EXACT version; COMPOSED candidates must cite
   * a graph version resolving with all member definitions (the members are
   * resolved and frozen onto the candidate); DISCOVERED candidates must
   * carry at least one derivation reference. The proposed contract is
   * validated by the SAME structural rules the W5-A registry applies.
   * Fails with `invalid-input`, `duplicate-candidate`,
   * `unknown-cited-definition`, `unknown-cited-graph`, `empty-derivation`
   * or `unknown-derivation-ref`.
   */
  proposeTransformCandidate(
    input: ProposeTransformCandidateInput,
  ): Promise<TransformCandidate | TransformDiscoveryError>;

  /**
   * Revise a candidate (append-only: version + 1; prior versions stay
   * resolvable bit-for-bit). Gate evidence recorded against earlier versions
   * goes STALE — promotion fails closed naming the gate until fresh evidence
   * is recorded. Same validation as proposal; fails with
   * `candidate-not-found` (unknown and cross-tenant indistinguishable) plus
   * the proposal codes.
   */
  reviseTransformCandidate(
    input: ReviseTransformCandidateInput,
  ): Promise<TransformCandidate | TransformDiscoveryError>;

  /**
   * Fetch a candidate — latest version by default, the EXACT version when
   * given — or `null` when unknown in this tenant scope (unknown and
   * cross-tenant are indistinguishable on reads).
   */
  getTransformCandidate(
    scope: TenantScope,
    candidateId: TransformCandidateId,
    version?: number,
  ): Promise<TransformCandidate | null>;

  /** The latest version of every candidate in this tenant scope (insertion order). */
  listTransformCandidates(scope: TenantScope): Promise<readonly TransformCandidate[]>;

  /**
   * Record one §8 gate's evidence against the CURRENT candidate version
   * (append-only log; re-recording appends, never rewrites). Each gate's
   * evidence is validated fail-closed at attach: derived gates (1, 2, 7) are
   * computed from the candidate; declared gates must match the contract they
   * gate. Fails with `candidate-not-found`, `invalid-input`,
   * `unresolved-capability-requirement`,
   * `rights-policy-declaration-mismatch`, `evaluator-binding-mismatch`,
   * `incomplete-benchmark-record` (naming every missing benchmark field) or
   * `stale-freeze-declaration`.
   */
  recordTransformGateEvidence(
    input: RecordTransformGateEvidenceInput,
  ): Promise<TransformGateEvidenceEntry | TransformDiscoveryError>;

  /** The candidate's append-only gate-evidence log (oldest first). */
  listTransformGateEvidence(
    scope: TenantScope,
    candidateId: TransformCandidateId,
  ): Promise<readonly TransformGateEvidenceEntry[]>;

  /**
   * Promote a candidate: evaluate ALL SEVEN §8 gates fail-closed in order
   * against the CURRENT candidate version. On success the candidate is
   * FROZEN at that exact version and materialized as a NEW definition
   * version in the W5-A registry through the append-only register/revise
   * path. A candidate rejected at any gate stays recorded — the attempt is
   * appended to the audit trail with the NAMED gate failure. Fails with
   * `candidate-not-found`, `already-promoted` (this candidate version),
   * `gate-evidence-missing` (+ gate), `contract-validation-failed`,
   * `capability-feasibility-failed`, `benchmark-not-passed`,
   * `provenance-incomplete` or `promotion-registry-failure`.
   */
  promoteTransformCandidate(
    scope: TenantScope,
    candidateId: TransformCandidateId,
  ): Promise<TransformPromotion | TransformDiscoveryError>;

  /**
   * The candidate's append-only promotion-attempt audit trail (oldest
   * first): every promotion attempt with its outcome and — for rejections —
   * the named gate that failed. Rejected candidates stay recorded here.
   */
  listTransformPromotionAttempts(
    scope: TenantScope,
    candidateId: TransformCandidateId,
  ): Promise<readonly TransformPromotionAttempt[]>;
}
