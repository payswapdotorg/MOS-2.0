import type {
  ArtifactRef,
  ProvenanceRef,
  RightsRef,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  UncertaintySummary,
  Version,
} from '@mos/contracts';

/**
 * REAL-shaped lab record mirrors for the UX-003 Lab WORKSPACE composition
 * seam (OUTSIDE `src/`) — the LAB-001..006 surfaces.
 *
 * Same discipline as `lab-fixture-shapes.ts` (the LAB-017/018 mirrors):
 * the web package's frozen registry dependency list is `[contracts]`, so
 * these interfaces re-declare the authority record shapes FIELD-FOR-FIELD
 * with the source path cited on every block, importing only the shared
 * `@mos/contracts` vocabulary. The workspace double feeds fixtures in
 * these REAL shapes; Worker C's production composition binds the same
 * view ports over the real `@mos/lab` records (structurally identical to
 * these mirrors) without touching `src/`.
 *
 * Mirrored sources (all in packages/mos-lab/src/contracts/):
 * - corpus.ts            — ReferenceDocument, CorpusVersion (LAB-001)
 * - feature-bundle.ts    — FeatureDescriptor, FeatureBundle, requirements (LAB-002)
 * - idea-graph.ts        — IdeaNode, IdeaEdge, IdeaDerivation (LAB-003)
 * - evidence.ts          — ObservedMetric, PredictedMetric, PredictionInterval,
 *                          HistoricalObservation, SimulationPrediction
 * - simulator.ts         — SocialWorldModel(+State), SocialSimulationResult (LAB-004)
 * - dynamics.ts          — DynamicsModel, PopulationSegment (LAB-005)
 * - time-machine.ts      — CounterfactualBranch(+Record), intervention (LAB-006)
 */

// ——— branded id mirrors (the authority's local brands, mirrored) ———

declare const referenceDocumentIdBrand: unique symbol;
/** Mirror of LAB-001 `ReferenceDocumentId`. */
export type ReferenceDocumentIdFixture = string & {
  readonly [referenceDocumentIdBrand]: true;
};

declare const corpusIdBrand: unique symbol;
/** Mirror of LAB-001 `CorpusId`. */
export type CorpusIdFixture = string & { readonly [corpusIdBrand]: true };

declare const featureBundleIdBrand: unique symbol;
/** Mirror of LAB-002 `FeatureBundleId`. */
export type FeatureBundleIdFixture = string & {
  readonly [featureBundleIdBrand]: true;
};

declare const ideaNodeIdBrand: unique symbol;
/** Mirror of LAB-003 `IdeaNodeId`. */
export type IdeaNodeIdFixture = string & { readonly [ideaNodeIdBrand]: true };

declare const ideaEdgeIdBrand: unique symbol;
/** Mirror of LAB-003 `IdeaEdgeId`. */
export type IdeaEdgeIdFixture = string & { readonly [ideaEdgeIdBrand]: true };

declare const socialWorldModelIdBrand: unique symbol;
/** Mirror of LAB-004 `SocialWorldModelId`. */
export type SocialWorldModelIdFixture = string & {
  readonly [socialWorldModelIdBrand]: true;
};

declare const dynamicsModelIdBrand: unique symbol;
/** Mirror of LAB-005 `DynamicsModelId`. */
export type DynamicsModelIdFixture = string & {
  readonly [dynamicsModelIdBrand]: true;
};

declare const timeMachineBranchIdBrand: unique symbol;
/** Mirror of LAB-006 `TimeMachineBranchId`. */
export type TimeMachineBranchIdFixture = string & {
  readonly [timeMachineBranchIdBrand]: true;
};

declare const branchRecordIdBrand: unique symbol;
/** Mirror of LAB-006 `BranchRecordId`. */
export type BranchRecordIdFixture = string & {
  readonly [branchRecordIdBrand]: true;
};

declare const historicalObservationIdBrandW: unique symbol;
/** Mirror of `HistoricalObservationId` (evidence.ts). */
export type HistoricalObservationIdFixture = string & {
  readonly [historicalObservationIdBrandW]: true;
};

declare const simulationPredictionIdBrandW: unique symbol;
/** Mirror of `SimulationPredictionId` (evidence.ts). */
export type SimulationPredictionIdFixture = string & {
  readonly [simulationPredictionIdBrandW]: true;
};

// ——— LAB-001: reference-first niche corpus ———

/** Mirror of LAB-001 `ReferenceModality`. */
export type ReferenceModalityFixture =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'structured'
  | 'mixed';

/** Mirror of LAB-001 `ReferenceDocument` — a reference, never content bytes. */
export interface ReferenceDocumentFixture {
  readonly id: ReferenceDocumentIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly modality: ReferenceModalityFixture;
  readonly artifact: ArtifactRef;
  readonly sourceRefs: readonly string[];
  readonly acquiredAt: Timestamp;
  readonly rightsRef: RightsRef;
  readonly provenanceRef: ProvenanceRef;
}

/** Mirror of LAB-001 `CorpusVersion` (append-only snapshot). */
export interface CorpusVersionFixture {
  readonly corpusId: CorpusIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly documentRefs: readonly ReferenceDocumentIdFixture[];
  readonly createdAt: Timestamp;
  readonly notes: string | null;
}

// ——— LAB-002: multimodal feature bundles ———

/** Mirror of LAB-002 `FeatureKind`. */
export type FeatureKindFixture =
  | 'text-embedding'
  | 'image-features'
  | 'audio-features'
  | 'video-features'
  | 'structured-features';

/** Mirror of LAB-002 `FeatureMetadataValue` + `FeatureMetadata`. */
export type FeatureMetadataValueFixture = string | number | boolean | null;
export type FeatureMetadataFixture = { readonly [key: string]: FeatureMetadataValueFixture };

/** Mirror of LAB-002 `FeatureDescriptor` — artifact reference + scalar manifest. */
export interface FeatureDescriptorFixture {
  readonly kind: FeatureKindFixture;
  readonly artifact: ArtifactRef;
  readonly metadata: FeatureMetadataFixture;
}

/** Mirror of LAB-002 `FeatureBundle` (versioned; detach is append-only). */
export interface FeatureBundleFixture {
  readonly id: FeatureBundleIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly documentId: ReferenceDocumentIdFixture;
  readonly features: readonly FeatureDescriptorFixture[];
  readonly provenanceRef: ProvenanceRef;
  readonly createdAt: Timestamp;
  readonly detachedAt: Timestamp | null;
}

/** Mirror of LAB-002 `FeatureKindRequirement` (declaration only). */
export interface FeatureKindRequirementFixture {
  readonly kind: FeatureKindFixture;
  readonly capability: {
    readonly capabilityId: string;
    readonly version: number;
  };
}

// ——— LAB-003: Idea Graph ———

/** Mirror of LAB-003 `IdeaDerivation`. */
export interface IdeaDerivationFixture {
  readonly documents: readonly ReferenceDocumentIdFixture[];
  readonly featureBundles: readonly FeatureBundleIdFixture[];
}

/** Mirror of LAB-003 `IdeaNode` (versioned, derivation-mandatory). */
export interface IdeaNodeFixture {
  readonly id: IdeaNodeIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly statement: string;
  readonly embeddingRef: ArtifactRef | null;
  readonly derivation: IdeaDerivationFixture;
  readonly provenanceRef: ProvenanceRef;
  readonly createdAt: Timestamp;
}

/** Mirror of LAB-003 `IdeaEdgeKind` + `IdeaEdge`. */
export type IdeaEdgeKindFixture =
  | 'supports'
  | 'contradicts'
  | 'derives-from'
  | 'combines-with'
  | 'competes-with';

export interface IdeaEdgeFixture {
  readonly id: IdeaEdgeIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly fromNodeId: IdeaNodeIdFixture;
  readonly toNodeId: IdeaNodeIdFixture;
  readonly kind: IdeaEdgeKindFixture;
  readonly weight: number;
  readonly createdAt: Timestamp;
}

// ——— LAB-004+ evidence separation (evidence.ts) ———

/** Mirror of `ObservedMetric` (the MEASURED side). */
export interface ObservedMetricFixture {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
}

/** Mirror of `PredictionInterval` (§22 — [lower, upper]). */
export interface PredictionIntervalFixture {
  readonly lower: number;
  readonly upper: number;
}

/** Mirror of `PredictedMetric` (expected value + envelope). */
export interface PredictedMetricFixture {
  readonly metric: string;
  readonly expectedValue: number;
  readonly interval: PredictionIntervalFixture;
  readonly unit: string;
}

/** Mirror of `HistoricalObservation` — REAL observed data (lock rule 29). */
export interface HistoricalObservationFixture {
  readonly id: HistoricalObservationIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly metrics: readonly ObservedMetricFixture[];
  readonly observedAt: Timestamp;
  readonly sourceRefs: readonly string[];
  readonly regime?: string;
  readonly counterfactual: false;
}

/** Mirror of `SimulationPrediction` — synthetic, counterfactual, disclosed. */
export interface SimulationPredictionFixture {
  readonly id: SimulationPredictionIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly scenarioRef: string;
  readonly worldModelVersion: Version;
  readonly simulatorVersion: Version;
  readonly strategyRef: StrategyRef;
  readonly seed: number;
  readonly step: number;
  readonly metrics: readonly PredictedMetricFixture[];
  readonly predictedAt: Timestamp;
  readonly uncertainty: UncertaintySummary;
  readonly counterfactual: true;
  readonly disclosure: 'synthetic-response-function';
}

// ——— LAB-004: Social Simulator ———

/** Mirror of LAB-004 `SocialWorldModelState`. */
export interface SocialWorldModelStateFixture {
  readonly baseAudience: number;
  readonly fatigue: number;
  readonly competitorShare: number;
  readonly seasonalFactor: number;
}

/** Mirror of LAB-004 `SocialWorldModel` (append-only versioned, disclosed). */
export interface SocialWorldModelFixture {
  readonly id: SocialWorldModelIdFixture;
  readonly worldModelVersion: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly state: SocialWorldModelStateFixture;
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  readonly disclosure: 'synthetic-parametric-world-model';
}

/** Mirror of LAB-004 `StrategyActionKind` + `StrategyActionCandidate`. */
export type StrategyActionKindFixture = 'content' | 'repost' | 'no-op';

export interface StrategyActionCandidateFixture {
  readonly strategyRef: StrategyRef;
  readonly kind: StrategyActionKindFixture;
  readonly cadencePerWeek: number;
  readonly novelty: number;
  readonly engagementEffort: number;
}

/** Mirror of LAB-004 `SimulatedMetricDelta` + `SocialSimulationResult`. */
export interface SimulatedMetricDeltaFixture {
  readonly metric: string;
  readonly expectedDelta: number;
  readonly interval: PredictionIntervalFixture;
  readonly unit: string;
}

export interface SocialSimulationResultFixture extends SimulationPredictionFixture {
  readonly deltas: readonly SimulatedMetricDeltaFixture[];
  readonly nextWorldState: SocialWorldModelStateFixture;
}

// ——— LAB-005: user/creator/competition dynamics ———

/** Mirror of LAB-005 `DynamicsPopulationKind` + `PopulationSegment`. */
export type DynamicsPopulationKindFixture = 'user' | 'creator' | 'competitor-profile';

export interface PopulationSegmentFixture {
  readonly id: string;
  readonly kind: DynamicsPopulationKindFixture;
  readonly label: string;
  readonly share: number;
  readonly fatigueSensitivity: number;
  readonly noveltySeeking: number;
  readonly engagementPropensity: number;
  readonly aggressiveness?: number;
}

/** Mirror of LAB-005 `DynamicsModel` (versioned, disclosed synthetic). */
export interface DynamicsModelFixture {
  readonly id: DynamicsModelIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly populations: readonly PopulationSegmentFixture[];
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  readonly disclosure: 'synthetic-parametric-dynamics-model';
}

// ——— LAB-006: Time Machine ———

/** Mirror of LAB-006 `TimeMachineIntervention`. */
export interface TimeMachineInterventionFixture {
  readonly description: string;
  readonly changedParameters: Record<string, unknown>;
}

/** Mirror of LAB-006 `CounterfactualBranch` (immutable audit record). */
export interface CounterfactualBranchFixture {
  readonly id: TimeMachineBranchIdFixture;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly parentBranchId: TimeMachineBranchIdFixture | null;
  readonly forkPoint: Timestamp;
  readonly intervention: TimeMachineInterventionFixture;
  readonly label: string | null;
  readonly createdAt: Timestamp;
  readonly counterfactual: true;
}

/** Mirror of LAB-006 `CounterfactualBranchRecord` (counterfactual, labeled). */
export interface CounterfactualBranchRecordFixture {
  readonly id: BranchRecordIdFixture;
  readonly branchId: TimeMachineBranchIdFixture;
  readonly prediction: SimulationPredictionFixture;
  readonly recordedAt: Timestamp;
  readonly counterfactual: true;
}

/** Exact-tenant scope check for the seam's read guards (§31, no leaks). */
export function sameWorkspaceTenant(scope: TenantScope, tenantId: string): boolean {
  return scope.tenantId === tenantId;
}
