import type {
  AgentOrganizationEdge,
  AgentOrganizationNode,
  ArtifactRef,
  BudgetPolicy,
  CostModel,
  EngineBenchmark,
  EvaluatorRef,
  JsonSchemaObject,
  JsonObject,
  LatencyModel,
  MemoryPolicy,
  ModelAssignment,
  ProvenanceRef,
  RightsRef,
  StrategyRef,
  TenantId,
  Timestamp,
  Transform,
  TransformCapabilityRequirement,
  TransformId,
  UncertaintySummary,
  Version,
} from '@mos/contracts';
import type { PredictionIntervalFixture } from './lab-fixture-workspace-shapes.js';

/**
 * REAL-shaped lab record mirrors for the UX-003 Lab WORKSPACE composition
 * seam (OUTSIDE `src/`) — the LAB-007..012 surfaces.
 *
 * Same discipline as `lab-fixture-shapes.ts`: field-for-field mirrors with
 * the source path cited on every block, importing only the shared
 * `@mos/contracts` vocabulary (the canonical `Transform`, agent-organization
 * and engine-benchmark shapes are ALREADY contracts types — used AS IS
 * where the authority composes them).
 *
 * Mirrored sources (all in packages/mos-lab/src/contracts/):
 * - ensemble.ts             — WorldModelEnsemble, EnsembleMember (LAB-007)
 * - reward.ts               — LabRewardSpec, CandidateProgramDescriptor (LAB-008/009)
 * - strategy-learning.ts    — LearningTrace, LearnedStrategyCandidate (LAB-009)
 * - organization-features.ts + organization-search.ts — §23 candidates,
 *   evaluations, provenance, the three-way comparison (LAB-010)
 * - transform-definition.ts — TransformDefinition (+input/output contracts)
 * - transform-graph.ts      — TransformGraph, nodes, edges (LAB-011)
 * - transform-candidate.ts + transform-promotion-gates.ts +
 *   transform-discovery.ts — candidates, the seven §8 gates, attempts (LAB-012)
 */

// ——— branded id mirrors ———

declare const worldModelEnsembleIdBrandW: unique symbol;
/** Mirror of LAB-007 `WorldModelEnsembleId`. */
export type WorldModelEnsembleIdFixture = string & {
  readonly [worldModelEnsembleIdBrandW]: true;
};

declare const learnedStrategyCandidateIdBrandW: unique symbol;
/** Mirror of LAB-009 `LearnedStrategyCandidateId`. */
export type LearnedStrategyCandidateIdFixture = string & {
  readonly [learnedStrategyCandidateIdBrandW]: true;
};

declare const organizationSearchIdBrandW: unique symbol;
/** Mirror of LAB-010 `OrganizationSearchResultId`. */
export type OrganizationSearchResultIdFixture = string & {
  readonly [organizationSearchIdBrandW]: true;
};

declare const transformGraphIdBrandW: unique symbol;
/** Mirror of LAB-011 `TransformGraphId`. */
export type TransformGraphIdFixture = string & {
  readonly [transformGraphIdBrandW]: true;
};

declare const transformCandidateIdBrandW: unique symbol;
/** Mirror of LAB-012 `TransformCandidateId`. */
export type TransformCandidateIdFixture = string & {
  readonly [transformCandidateIdBrandW]: true;
};

// ——— LAB-007: World Model Ensemble ———

/** Mirror of LAB-007 `EnsembleMember`. */
export interface EnsembleMemberFixture {
  readonly id: string;
  readonly worldModelId: string;
  readonly worldModelVersion: number;
  readonly weight?: number;
  readonly notes?: string | null;
}

/** Mirror of LAB-007 `WorldModelEnsemble` (versioned, append-only). */
export interface WorldModelEnsembleFixture {
  readonly id: WorldModelEnsembleIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly members: readonly EnsembleMemberFixture[];
  readonly weightingPolicy: {
    readonly id: string;
    readonly version: number;
    readonly kind: 'uniform' | 'declared-member-weights';
  };
  readonly status: 'active' | 'frozen';
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  readonly disclosure: 'synthetic-ensemble-of-disclosed-response-functions';
}

// ——— LAB-008/009: reward vocabulary + program descriptors ———

/** Mirror of LAB-008 `LabRewardTerm` (explicit metric-source binding, §21). */
export interface LabRewardTermFixture {
  readonly metric: string;
  readonly weight: number;
  readonly direction: 'maximize' | 'minimize';
  readonly definition: string;
  readonly metricSource: string;
}

/** Mirror of LAB-008 `LabRewardSpec` (versioned). */
export interface LabRewardSpecFixture {
  readonly version: number;
  readonly terms: readonly LabRewardTermFixture[];
}

/** Mirror of LAB-008 `CandidateProgramStrategy` (the action seam shape). */
export interface CandidateProgramStrategyFixture {
  readonly strategyRef: StrategyRef;
  readonly kind: 'content' | 'repost' | 'no-op';
  readonly cadencePerWeek: number;
  readonly novelty: number;
  readonly engagementEffort: number;
}

// ——— LAB-009: Sequential Strategy Learning ———

/** Mirror of LAB-009 `VariantEvaluation`. */
export interface VariantEvaluationFixture {
  readonly candidate: CandidateProgramStrategyFixture;
  readonly estimatedReward: number;
  readonly interval: PredictionIntervalFixture;
}

/** Mirror of LAB-009 `LearningTraceIteration` + `IterationCostDimensions`. */
export interface LearningTraceIterationFixture {
  readonly iteration: number;
  readonly evaluated: readonly VariantEvaluationFixture[];
  readonly chosen: CandidateProgramStrategyFixture;
  readonly improvement: number;
  readonly improved: boolean;
  readonly costs: {
    readonly simulatedSteps: number;
    readonly cumulativeSimulatedSteps: number;
  };
}

/** Mirror of LAB-009 `LearningTrace`. */
export interface LearningTraceFixture {
  readonly iterations: readonly LearningTraceIterationFixture[];
  readonly stoppingReason: 'budget-exhausted' | 'iteration-cap-reached' | 'plateau-detected';
  readonly stoppingDetail: string;
  readonly totalSimulatedSteps: number;
  readonly finalEstimate: {
    readonly reward: number;
    readonly interval: PredictionIntervalFixture;
    readonly uncertainty: UncertaintySummary;
  } | null;
}

/** Mirror of LAB-009 `LearningProvenance`. */
export interface LearningProvenanceFixture {
  readonly ensembleId: WorldModelEnsembleIdFixture;
  readonly ensembleVersion: number;
  readonly memberWorldModelVersions: readonly number[];
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  readonly seed: number;
  readonly iterationCount: number;
  readonly stoppingReason: 'budget-exhausted' | 'iteration-cap-reached' | 'plateau-detected';
  readonly parentStrategyRef: StrategyRef;
  readonly learnedAt: Timestamp;
}

/** Mirror of LAB-009 `LearnedStrategyCandidate` (counterfactual, lab-only). */
export interface LearnedStrategyCandidateFixture {
  readonly id: LearnedStrategyCandidateIdFixture;
  readonly tenantId: TenantId;
  readonly candidate: CandidateProgramStrategyFixture;
  readonly horizonSteps: number;
  readonly trace: LearningTraceFixture;
  readonly provenance: LearningProvenanceFixture;
  readonly counterfactual: true;
  readonly disclosure: 'learned-in-simulation';
  readonly labOnly: string;
}

// ——— LAB-010: §23 organization search ———

/** Mirror of the @mos/agents `OrganizationNode` extension (role label). */
export interface OrganizationNodeFixture extends AgentOrganizationNode {
  readonly role: string;
}

/** Mirror of the @mos/agents typed organization edge (§23 dimensions). */
export interface OrganizationEdgeFixture extends AgentOrganizationEdge {
  readonly kind: 'delegates-to' | 'communicates-with' | 'reports-to';
}

/** Mirror of the @mos/agents `OrganizationMemoryPolicy` (§23 sharing). */
export interface OrganizationMemoryPolicyFixture extends MemoryPolicy {
  readonly sharing: 'shared' | 'isolated' | 'hybrid';
}

/** Mirror of the @mos/agents `AgentOrganizationRecord` (used BY VALUE). */
export interface AgentOrganizationRecordFixture {
  readonly id: string;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly nodes: readonly OrganizationNodeFixture[];
  readonly edges: readonly OrganizationEdgeFixture[];
  readonly modelAssignments: readonly ModelAssignment[];
  readonly memoryPolicy: OrganizationMemoryPolicyFixture;
  readonly budgetPolicy: BudgetPolicy;
  readonly terminationPolicy: {
    readonly maxIterations: number;
    readonly timeoutMs: number;
  };
  readonly evaluator: string;
}

/** Mirror of LAB-010 `DeclaredOrganizationFeatures` (no silent defaults). */
export interface DeclaredOrganizationFeaturesFixture {
  readonly criticNodeIds: readonly string[];
  readonly toolAllocation: {
    readonly perNode: readonly { readonly nodeId: string; readonly toolRefs: readonly string[] }[];
  };
  readonly executionOrdering: 'sequential' | 'parallel' | 'staged';
}

/** Mirror of LAB-010 `SearchedOrganizationCandidate`. */
export interface SearchedOrganizationCandidateFixture {
  readonly organization: AgentOrganizationRecordFixture;
  readonly features: DeclaredOrganizationFeaturesFixture;
  readonly origin:
    | 'generalist-single-agent-baseline'
    | 'hand-designed'
    | 'composed'
    | 'generated';
}

/** Mirror of LAB-010 `OrganizationCandidateEvaluation` (§22, counterfactual). */
export interface OrganizationCandidateEvaluationFixture {
  readonly expectedReward: number;
  readonly interval: PredictionIntervalFixture;
  readonly uncertainty: UncertaintySummary;
  readonly disagreementHalfWidth: number;
  readonly seedRobustness: {
    readonly seeds: readonly number[];
    readonly perSeedExpected: readonly number[];
    readonly spread: number;
    readonly halfSpread: number;
  };
  readonly ood: {
    readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
    readonly flagged: boolean;
  };
  readonly calibration: { readonly status: 'pending-reality' };
  readonly simulatedMemberSteps: number;
  readonly effectiveHorizonSteps: number;
  readonly counterfactual: true;
  readonly disclosure: 'ensemble-evaluated-simulation-estimate';
}

/** Mirror of LAB-010 `OrganizationSearchProvenance` (twelve-dimension fingerprint). */
export interface OrganizationSearchProvenanceFixture {
  readonly origin: SearchedOrganizationCandidateFixture['origin'];
  readonly simulatorVersion: number;
  readonly ensembleId: WorldModelEnsembleIdFixture;
  readonly ensembleVersion: number;
  readonly memberWorldModelVersions: readonly number[];
  readonly rewardSpecVersion: number;
  readonly seed: number;
  readonly evaluationSeeds: readonly number[];
  readonly horizonSteps: number;
  readonly fingerprint: Readonly<Record<string, string>>;
  readonly variedDimensions: readonly string[];
  readonly parentFingerprint: Readonly<Record<string, string>> | null;
  readonly generationIndex: number | null;
  readonly pruned: boolean;
  readonly pruningRule: 'none' | 'interval-dominance';
  readonly searchedAt: Timestamp;
}

/** Mirror of LAB-010 `RankedOrganizationCandidate`. */
export interface RankedOrganizationCandidateFixture {
  readonly rank: number;
  readonly candidate: SearchedOrganizationCandidateFixture;
  readonly evaluation: OrganizationCandidateEvaluationFixture;
  readonly provenance: OrganizationSearchProvenanceFixture;
  readonly intervalOverlapWithLeader: { readonly overlaps: boolean; readonly note: string } | null;
}

/** Mirror of LAB-010 `OrganizationSearchResult` (three-way comparison required). */
export interface OrganizationSearchResultFixture {
  readonly id: OrganizationSearchResultIdFixture;
  readonly tenantId: TenantId;
  readonly ranked: readonly RankedOrganizationCandidateFixture[];
  readonly comparison: {
    readonly baseline: RankedOrganizationCandidateFixture;
    readonly handDesigned: RankedOrganizationCandidateFixture;
    readonly generated: readonly RankedOrganizationCandidateFixture[];
  };
  readonly budget: {
    readonly maxMemberSteps: number;
    readonly consumedMemberSteps: number;
    readonly evaluationsExecuted: number;
    readonly generatedEvaluated: number;
  };
  readonly stopping: {
    readonly reason: 'budget-exhausted' | 'plateau-detected' | 'generation-cap-reached';
    readonly detail: string;
    readonly generationsExecuted: number;
  };
  readonly counterfactual: true;
  readonly disclosure: 'organization-search-over-disclosed-synthetic-simulation';
  readonly labOnly: string;
}

// ——— LAB-011: Transform Definitions + Transform Graph ———

/** Mirror of LAB-011 `TransformKind` (the thirteen frozen §5 kinds). */
export type TransformKindFixture =
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

/** Mirror of LAB-011 `TransformInputConstraint`. */
export interface TransformInputConstraintFixture {
  readonly name: string;
  readonly acceptedTypes: readonly string[];
  readonly acceptedModalities: readonly string[];
  readonly minInputs: number;
  readonly maxInputs: number;
  readonly requiresRights: boolean;
}

/** Mirror of LAB-011 `TransformOutputContract`. */
export interface TransformOutputContractFixture {
  readonly outputTypes: readonly string[];
  readonly outputCount: number;
}

/** Mirror of LAB-011 `TransformDefinition` (canonical Transform + declared structure). */
export interface TransformDefinitionFixture extends Transform {
  readonly tenantId: TenantId;
  readonly kind: TransformKindFixture;
  readonly inputConstraint: TransformInputConstraintFixture;
  readonly outputContract: TransformOutputContractFixture;
  readonly humanParticipation: boolean;
  readonly createdAt: Timestamp;
}

/** Mirror of LAB-011 `TransformApplicationNode` + `ArtifactFlowEdge`. */
export interface TransformApplicationNodeFixture {
  readonly nodeId: string;
  readonly definitionId: TransformId;
  readonly definitionVersion: Version;
  readonly inputs: readonly ArtifactRef[];
  readonly parameterization: JsonObject;
}

export interface ArtifactFlowEdgeFixture {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

/** Mirror of LAB-011 `TransformGraph` (append-only declarative DAG). */
export interface TransformGraphFixture {
  readonly id: TransformGraphIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly nodes: readonly TransformApplicationNodeFixture[];
  readonly edges: readonly ArtifactFlowEdgeFixture[];
  readonly createdAt: Timestamp;
}

// ——— LAB-012: Transform Discovery ———

/** Mirror of LAB-012 `TransformCandidateDerivation` (gate 7 surface). */
export interface TransformCandidateDerivationFixture {
  readonly ideaNodeIds: readonly string[];
  readonly featureBundleIds: readonly string[];
  readonly corpusId: string | null;
  readonly corpusVersion: number | null;
  readonly learnedStrategyCandidateIds: readonly string[];
  readonly organizationSearchResultIds: readonly string[];
  readonly provenanceRef: ProvenanceRef;
}

/** Mirror of LAB-012 `ProposedTransformContract` (the registry-shaped proposal). */
export interface ProposedTransformContractFixture {
  readonly kind: TransformKindFixture;
  readonly inputConstraint: TransformInputConstraintFixture;
  readonly outputContract: TransformOutputContractFixture;
  readonly parameters: JsonSchemaObject;
  readonly capabilityRequirements: readonly TransformCapabilityRequirement[];
  readonly humanParticipation: boolean;
  readonly evaluator: EvaluatorRef;
  readonly costModel: CostModel;
  readonly latencyModel: LatencyModel;
  readonly rightsRequirements: readonly RightsRef[];
  readonly policyRequirements: readonly string[];
  readonly lineageRules: readonly string[];
}

/** Mirror of LAB-012 `TransformCandidate` (versioned, append-only). */
export interface TransformCandidateFixture {
  readonly id: TransformCandidateIdFixture;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly origin: 'known' | 'composed' | 'discovered';
  readonly citation:
    | { readonly kind: 'known'; readonly definitionId: TransformId; readonly definitionVersion: number }
    | {
        readonly kind: 'composed';
        readonly graphId: TransformGraphIdFixture;
        readonly graphVersion: number;
        readonly members: readonly { readonly definitionId: TransformId; readonly definitionVersion: number }[];
      }
    | null;
  readonly derivation: TransformCandidateDerivationFixture;
  readonly proposedContract: ProposedTransformContractFixture;
  readonly targetDefinitionId: TransformId;
  readonly createdAt: Timestamp;
}

/** Mirror of LAB-012 `TransformGateEvidence` (the seven §8 gates). */
export type TransformGateEvidenceFixture =
  | {
      readonly gate: 'contract-validation';
      readonly validated: {
        readonly kind: TransformKindFixture;
        readonly inputConstraintName: string;
        readonly outputTypes: readonly string[];
        readonly humanParticipation: boolean;
      };
    }
  | {
      readonly gate: 'capability-feasibility';
      readonly resolvedRequirements: readonly TransformCapabilityRequirement[];
    }
  | {
      readonly gate: 'rights-policy-feasibility';
      readonly rightsRequirements: readonly RightsRef[];
      readonly policyRequirements: readonly string[];
      readonly evaluation: 'structural-declaration-only';
    }
  | {
      readonly gate: 'evaluator';
      readonly evaluatorRef: EvaluatorRef;
      readonly inputSchema: JsonSchemaObject;
      readonly outputSchema: JsonSchemaObject;
    }
  | { readonly gate: 'bounded-benchmark-evidence'; readonly benchmark: EngineBenchmark }
  | {
      readonly gate: 'immutable-version';
      readonly candidateVersion: number;
      readonly promotionPath: 'registry-append-only';
    }
  | { readonly gate: 'provenance' };

/** Mirror of LAB-012 `TransformGateEvidenceEntry` (append-only log). */
export interface TransformGateEvidenceEntryFixture {
  readonly entryId: string;
  readonly candidateId: TransformCandidateIdFixture;
  readonly candidateVersion: number;
  readonly evidence: TransformGateEvidenceFixture;
  readonly recordedAt: Timestamp;
}

/** Mirror of LAB-012 `TransformPromotionAttempt` (audit trail). */
export interface TransformPromotionAttemptFixture {
  readonly attempt: number;
  readonly candidateId: TransformCandidateIdFixture;
  readonly candidateVersion: number;
  readonly outcome: 'promoted' | 'rejected';
  readonly failedGate: string | null;
  readonly reason: string;
  readonly definitionId: TransformId | null;
  readonly definitionVersion: number | null;
  readonly attemptedAt: Timestamp;
}
