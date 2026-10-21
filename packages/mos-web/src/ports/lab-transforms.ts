import type { ArtifactRef, TenantId, TenantScope, Timestamp } from '@mos/contracts';

/**
 * Lab transforms view port (UX-003, over LAB-011 + LAB-012).
 *
 * The Lab workspace's Transforms section: the VERSIONED transform
 * definitions (LAB-011 — the thirteen frozen §5 kinds, each a canonical
 * contract with a named input constraint, an output contract, declared
 * capability requirements and the human-participation flag; NO-OP/REPOST
 * first-class with a real zero-capability definition), the append-only
 * transform graph (LAB-011 — versioned tenant-scoped DAG of transform
 * applications over artifact refs), and the §8 discovery candidates
 * (LAB-012 — known / composed / discovered) with THE SEVEN PROMOTION
 * GATES' explicit pass/fail evidence and the append-only promotion-attempt
 * audit trail.
 *
 * A TRANSFORM IS A CONTRACT, NOT AN ENGINE (§5): nothing here resolves
 * engines, executes transforms or materializes artifacts — the view models
 * are DECLARED contracts only. NO AUTO-PRODUCTION (§24): a promoted
 * candidate only becomes AVAILABLE to program search; the views state
 * that boundary explicitly.
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models re-declared from the LAB-011/012 record shapes, importing only
 * `@mos/contracts` types; composition OUTSIDE `src/`.
 */

/** The thirteen frozen §5 transform kinds (the complete vocabulary). */
export type LabTransformKindView =
  | 'no-op-repost'
  | 'clip'
  | 'crop-reframe'
  | 'remix'
  | 'compilation'
  | 'reaction'
  | 'podcast'
  | 'translation-dubbing'
  | 'voiceover'
  | 'stylization-anime'
  | 'ai-generated'
  | 'human-contribution'
  | 'hybrid';

/** The declared input constraint of a transform definition. */
export interface LabTransformInputConstraintView {
  /** Constraint name (non-blank; cited by every validation failure). */
  readonly name: string;
  /** Artifact types accepted (exact match on the declared type). */
  readonly acceptedTypes: readonly string[];
  /** Content modalities accepted (the LAB-001 modality vocabulary). */
  readonly acceptedModalities: readonly string[];
  /** Min/max total input count (external artifacts + upstream outputs). */
  readonly minInputs: number;
  readonly maxInputs: number;
  /** Whether every input artifact must carry a rights reference. */
  readonly requiresRights: boolean;
}

/** The declared output contract of a transform definition. */
export interface LabTransformOutputContractView {
  readonly outputTypes: readonly string[];
  /** Declared number of output artifacts the transform produces. */
  readonly outputCount: number;
}

/** One declared capability requirement (structural ref, exact version). */
export interface LabCapabilityRequirementView {
  readonly capabilityId: string;
  readonly capabilityVersion: number;
}

/** One versioned transform definition as presented (LAB-011). */
export interface LabTransformDefinitionView {
  /** The definition id (the authority's `TransformId`, as a string). */
  readonly definitionId: string;
  /** Append-only definition version (revisions append version + 1). */
  readonly version: number;
  readonly tenantId: TenantId;
  readonly kind: LabTransformKindView;
  readonly inputConstraint: LabTransformInputConstraintView;
  readonly outputContract: LabTransformOutputContractView;
  /**
   * Declared capability requirements (structural refs; possibly EMPTY —
   * the no-op state is a VALID declared state, lock rule 5).
   */
  readonly capabilityRequirements: readonly LabCapabilityRequirementView[];
  /** Whether executing this transform requires human participation. */
  readonly humanParticipation: boolean;
  /** The bound evaluator reference. */
  readonly evaluatorRef: string;
  /** Rights requirements the contract declares (explicit refs). */
  readonly rightsRequirements: readonly string[];
  /** Policy requirements the contract declares (explicit refs). */
  readonly policyRequirements: readonly string[];
  /** ISO-8601 timestamp of this definition version. */
  readonly createdAt: Timestamp;
}

/** One transform application node of a graph version (LAB-011). */
export interface LabTransformApplicationNodeView {
  readonly nodeId: string;
  /** The transform definition pinned to an EXACT version. */
  readonly definitionId: string;
  readonly definitionVersion: number;
  /** External input artifact refs entering the graph at this node. */
  readonly inputs: readonly ArtifactRef[];
  /** The declared parameterization (carried verbatim, never interpreted). */
  readonly parameterization: Readonly<Record<string, unknown>>;
}

/** One artifact-flow edge of a graph version (output feeds input). */
export interface LabArtifactFlowEdgeView {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

/** One append-only transform graph version (LAB-011, declarative DAG). */
export interface LabTransformGraphView {
  /** The graph id (the authority's `TransformGraphId`, as a string). */
  readonly graphId: string;
  /** Append-only graph version (appends create version + 1). */
  readonly version: number;
  readonly tenantId: TenantId;
  readonly nodes: readonly LabTransformApplicationNodeView[];
  readonly edges: readonly LabArtifactFlowEdgeView[];
  readonly createdAt: Timestamp;
}

/** The three §8 candidate origins. */
export type LabTransformCandidateOriginView = 'known' | 'composed' | 'discovered';

/** The seven §8 promotion gates, in evaluation order (frozen). */
export type LabTransformGateNameView =
  | 'contract-validation'
  | 'capability-feasibility'
  | 'rights-policy-feasibility'
  | 'evaluator'
  | 'bounded-benchmark-evidence'
  | 'immutable-version'
  | 'provenance';

/**
 * One gate's standing against the CURRENT candidate version — derived
 * mechanically from the append-only evidence log: evidence recorded at
 * this version, evidence recorded only at an OLDER version (STALE —
 * promotion fails closed naming the gate until fresh evidence lands), or
 * no evidence at all.
 */
export interface LabTransformGateStandingView {
  readonly gate: LabTransformGateNameView;
  readonly status: 'evidence-recorded' | 'evidence-stale' | 'evidence-missing';
  /** The evidence log entry covering the current version, when recorded. */
  readonly entryId: string | null;
  /** The candidate version the recorded evidence covers. */
  readonly evidenceCandidateVersion: number | null;
  /**
   * One presentation line describing the recorded evidence (verbatim
   * facts from the entry — e.g. resolved requirement count, the frozen
   * benchmark record's result); null when no evidence is recorded.
   */
  readonly summary: string | null;
}

/** One append-only promotion attempt (success or named-gate rejection). */
export interface LabTransformPromotionAttemptView {
  /** Deterministic 1-based attempt sequence for the candidate. */
  readonly attempt: number;
  readonly outcome: 'promoted' | 'rejected';
  /** The named §8 gate that failed (rejections only). */
  readonly failedGate: LabTransformGateNameView | null;
  readonly reason: string;
  /** The definition version a successful promotion appended, when promoted. */
  readonly definitionVersion: number | null;
  readonly attemptedAt: Timestamp;
}

/** One §8 discovery candidate with its gates + audit trail (LAB-012). */
export interface LabTransformCandidateDetailView {
  readonly candidateId: string;
  /** Append-only candidate version (revisions append version + 1). */
  readonly version: number;
  readonly tenantId: TenantId;
  readonly origin: LabTransformCandidateOriginView;
  /**
   * Origin citation: KNOWN → definition id+version; COMPOSED → graph
   * id+version (+ member count); DISCOVERED → null (the derivation
   * carries the provenance instead).
   */
  readonly citation: {
    readonly kind: 'known' | 'composed';
    readonly definitionId: string | null;
    readonly definitionVersion: number | null;
    readonly graphId: string | null;
    readonly graphVersion: number | null;
    readonly memberCount: number | null;
  } | null;
  /** Derivation provenance counts (gate 7 surface). */
  readonly derivation: {
    readonly ideaNodeCount: number;
    readonly featureBundleCount: number;
    readonly corpusId: string | null;
    readonly corpusVersion: number | null;
    readonly learnedStrategyCandidateCount: number;
    readonly organizationSearchResultCount: number;
  };
  /** The proposed contract's declared kind + constraint summary. */
  readonly proposedKind: LabTransformKindView;
  readonly proposedInputConstraintName: string;
  readonly proposedOutputTypes: readonly string[];
  readonly proposedHumanParticipation: boolean;
  readonly proposedCapabilityRequirementCount: number;
  /** The definition id promotion materializes the candidate as. */
  readonly targetDefinitionId: string;
  /** ALL SEVEN gates in §8 order with their explicit standing. */
  readonly gates: readonly LabTransformGateStandingView[];
  /** The append-only promotion-attempt audit trail (oldest first). */
  readonly promotionAttempts: readonly LabTransformPromotionAttemptView[];
  /** Whether a promotion attempt succeeded at this candidate version. */
  readonly promoted: boolean;
  readonly createdAt: Timestamp;
}

/** Typed failure shapes for the transforms port. */
export type LabTransformsFailure =
  | { readonly error: 'lab-transforms-unavailable'; readonly message: string }
  | { readonly error: 'lab-candidate-not-found'; readonly message: string };

/**
 * The declared Lab transforms view surface (read-only, 4 methods ≤ 12
 * policy budget). Async by design; unknown and cross-tenant candidate ids
 * are the SAME explicit miss (§31, no existence leak).
 */
export interface LabTransformsViewPort {
  /**
   * The latest version of every transform definition visible in one
   * tenant scope (the thirteen §5 kinds as declared contracts).
   */
  listTransformDefinitions(
    scope: TenantScope,
  ): Promise<readonly LabTransformDefinitionView[] | LabTransformsFailure>;

  /**
   * The latest version of every transform graph visible in the tenant
   * scope (append-only declarative DAGs over artifact refs).
   */
  listTransformGraphs(
    scope: TenantScope,
  ): Promise<readonly LabTransformGraphView[] | LabTransformsFailure>;

  /**
   * Every §8 discovery candidate with the seven promotion gates' explicit
   * standing and the promotion-attempt audit trail.
   */
  listDiscoveryCandidates(
    scope: TenantScope,
  ): Promise<readonly LabTransformCandidateDetailView[] | LabTransformsFailure>;

  /**
   * One §8 discovery candidate's detail (gates + audit trail).
   * `lab-candidate-not-found` for unknown/cross-tenant ids (no existence
   * leak across tenants, §31).
   */
  loadDiscoveryCandidate(
    candidateId: string,
    scope: TenantScope,
  ): Promise<LabTransformCandidateDetailView | LabTransformsFailure>;
}
