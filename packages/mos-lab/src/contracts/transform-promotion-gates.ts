import type {
  ArtifactType,
  CapabilityRequirement,
  EngineBenchmark,
  EvaluatorRef,
  JsonSchemaObject,
  PolicyRef,
  RightsRef,
  TenantScope,
  Timestamp,
} from '@mos/contracts';
import type {
  ComposedTransformCitation,
  KnownTransformCitation,
  TransformCandidateDerivation,
  TransformCandidateId,
  TransformCandidateOrigin,
} from './transform-candidate.js';
import type { TransformKind } from './transform-definition.js';

/**
 * THE SEVEN §8 PROMOTION GATES (LAB-012).
 *
 * Basis: spec/mos-architecture-v2.0.md §8 (promotion requires: 1 contract
 * validation, 2 capability feasibility, 3 rights/policy feasibility,
 * 4 evaluator, 5 bounded benchmark evidence, 6 immutable version,
 * 7 provenance), architecture lock rule 7 (discovered transforms require
 * contracts and bounded evaluation before reusable promotion).
 *
 * Each gate is an EXPLICIT, FAIL-CLOSED, TEST-PINNED record
 * ({@link TransformGateEvidence}): evidence is recorded per gate against an
 * EXACT candidate version; a candidate missing ANY gate record at the
 * version being promoted cannot promote (the failure names the gate). Gate
 * 5 accepts COMPLETE frozen `EngineBenchmark` records only — the ENG-004
 * discipline (structural completeness check via the contracts package's
 * frozen required-field index; incomplete records never attach, and a
 * complete-but-not-passed benchmark fails promotion by name).
 */

/**
 * The seven gate names in §8 order. Promotion evaluates them in THIS order
 * and the FIRST failing gate is the named failure.
 */
export type TransformPromotionGateName =
  | 'contract-validation'
  | 'capability-feasibility'
  | 'rights-policy-feasibility'
  | 'evaluator'
  | 'bounded-benchmark-evidence'
  | 'immutable-version'
  | 'provenance';

/**
 * Gate 1 — contract validation (structural, the same rules the W5-A
 * registry applies). DERIVED evidence: the port validates the candidate's
 * proposed contract and snapshots the validated surface.
 */
export interface ContractValidationEvidence {
  readonly gate: 'contract-validation';
  /** Snapshot of the validated contract surface (derived by the port). */
  readonly validated: {
    readonly kind: TransformKind;
    readonly inputConstraintName: string;
    readonly outputTypes: readonly ArtifactType[];
    readonly humanParticipation: boolean;
  };
}

/**
 * Gate 2 — capability feasibility (declarative): every declared
 * `CapabilityRequirement` resolves in the `@mos/capabilities` vocabulary.
 * DERIVED evidence: the port resolves the refs; ZERO requirements is the
 * valid declared no-op state (lock rule 5 — no-op/repost flows through
 * discovery identically).
 */
export interface CapabilityFeasibilityEvidence {
  readonly gate: 'capability-feasibility';
  /** Every declared requirement, resolved at its exact version. */
  readonly resolvedRequirements: readonly CapabilityRequirement[];
}

/**
 * Gate 3 — rights/policy feasibility (STRUCTURAL declarations; the real
 * rights/policy evaluation is composition-root wiring — the lab does not
 * import the rights/policy modules). CALLER-DECLARED evidence: must cover
 * EXACTLY the rights and policy requirements the proposed contract
 * declares (`rights-policy-declaration-mismatch` otherwise — the gate
 * record can never under-declare what the contract requires).
 */
export interface RightsPolicyFeasibilityEvidence {
  readonly gate: 'rights-policy-feasibility';
  /** Declared rights requirements (must equal the contract's, in order). */
  readonly rightsRequirements: readonly RightsRef[];
  /** Declared policy constraint refs (must equal the contract's, in order). */
  readonly policyRequirements: readonly PolicyRef[];
  /** Structural declarations only — pinned disclosure. */
  readonly evaluation: 'structural-declaration-only';
}

/**
 * Gate 4 — evaluator: an evaluator ref must be BOUND together with its
 * contract shape. Evaluator EXECUTION is not this item — the reference plus
 * the declared input/output schema shape is the gate. The bound ref must be
 * the proposed contract's own evaluator (`evaluator-binding-mismatch`).
 */
export interface EvaluatorBindingEvidence {
  readonly gate: 'evaluator';
  readonly evaluatorRef: EvaluatorRef;
  /** Declared evaluator contract shape: what it consumes. */
  readonly inputSchema: JsonSchemaObject;
  /** Declared evaluator contract shape: the verdict it produces. */
  readonly outputSchema: JsonSchemaObject;
}

/**
 * Gate 5 — bounded benchmark evidence: a COMPLETE frozen `EngineBenchmark`
 * record (the canonical contracts shape — the same record the ENG-004
 * golden-corpus stack freezes and the ENG-001 activation gate consumes).
 * Incomplete records never attach (named missing fields). A complete record
 * with `result` other than `"passed"` attaches but fails promotion by name.
 */
export interface BoundedBenchmarkEvidence {
  readonly gate: 'bounded-benchmark-evidence';
  readonly benchmark: EngineBenchmark;
}

/**
 * Gate 6 — immutable version: promotion FREEZES the candidate at an exact
 * version. The freeze declaration must cite the candidate's CURRENT version
 * (`stale-freeze-declaration` otherwise) and the append-only promotion path
 * (register for a new target id / revise for an existing one — never
 * in-place mutation).
 */
export interface ImmutableVersionEvidence {
  readonly gate: 'immutable-version';
  /** The exact candidate version this declaration freezes. */
  readonly candidateVersion: number;
  /** The only legal promotion path (pinned literal). */
  readonly promotionPath: 'registry-append-only';
}

/**
 * Gate 7 — provenance: the full derivation chain recorded. DERIVED
 * evidence: the port validates the candidate's derivation completeness
 * (discovered → at least one derivation reference; composed → the cited
 * graph version re-resolves with its members; known → the cited definition
 * version re-resolves) and snapshots the chain.
 */
export interface ProvenanceEvidence {
  readonly gate: 'provenance';
  readonly origin: TransformCandidateOrigin;
  readonly derivation: TransformCandidateDerivation;
  readonly citation: KnownTransformCitation | ComposedTransformCitation | null;
}

/** The seven evidence records, discriminated by `gate`. */
export type TransformGateEvidence =
  | ContractValidationEvidence
  | CapabilityFeasibilityEvidence
  | RightsPolicyFeasibilityEvidence
  | EvaluatorBindingEvidence
  | BoundedBenchmarkEvidence
  | ImmutableVersionEvidence
  | ProvenanceEvidence;

/** Caller-supplied evidence payload (discriminated by `gate`). */
export type TransformGateEvidenceInput =
  | { readonly gate: 'contract-validation' }
  | { readonly gate: 'capability-feasibility' }
  | {
      readonly gate: 'rights-policy-feasibility';
      readonly rightsRequirements: readonly RightsRef[];
      readonly policyRequirements: readonly PolicyRef[];
    }
  | {
      readonly gate: 'evaluator';
      readonly evaluatorRef: EvaluatorRef;
      readonly inputSchema: JsonSchemaObject;
      readonly outputSchema: JsonSchemaObject;
    }
  | {
      readonly gate: 'bounded-benchmark-evidence';
      readonly benchmark: EngineBenchmark;
    }
  | {
      readonly gate: 'immutable-version';
      readonly candidateVersion: number;
      readonly promotionPath: 'registry-append-only';
    }
  | { readonly gate: 'provenance' };

/** Record one gate's evidence against a candidate (append-only log). */
export interface RecordTransformGateEvidenceInput {
  readonly scope: TenantScope;
  readonly candidateId: TransformCandidateId;
  readonly evidence: TransformGateEvidenceInput;
}

/**
 * One APPEND-ONLY gate-evidence log entry. Entries cite the EXACT candidate
 * version they were recorded against: after a candidate revision, entries
 * citing older versions are STALE and promotion fails closed naming the
 * gate until fresh evidence is recorded (fail-closed staleness discipline).
 * Re-recording a gate appends a new entry — history is never rewritten.
 */
export interface TransformGateEvidenceEntry {
  /** Deterministic 1-based sequence within the candidate's evidence log. */
  readonly entryId: string;
  readonly candidateId: TransformCandidateId;
  /** The candidate version this evidence covers. */
  readonly candidateVersion: number;
  readonly evidence: TransformGateEvidence;
  readonly recordedAt: Timestamp;
}
