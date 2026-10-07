/**
 * Public surface of `@mos/lab` (MOS v2.0 LAB-001..003 + LAB-004..006 +
 * LAB-007..009 + LAB-011).
 *
 * Exports the corpus / feature-bundle / idea-graph / evidence-separation /
 * social-simulator / dynamics / Time Machine / world-model-ensemble /
 * off-policy-evaluation / strategy-learning / transform-definition /
 * transform-graph contract types plus fourteen runtime factories (in-memory
 * corpus store, static feature computation declaration carrier, in-memory
 * feature bundle registry, in-memory idea graph, in-memory social world
 * model store, in-memory simulator engine, in-memory dynamics model store,
 * in-memory dynamics stepper, in-memory Time Machine, in-memory world model
 * ensemble, in-memory off-policy evaluator, in-memory strategy learner,
 * in-memory transform definition registry, in-memory transform graph). No
 * helper constructors, error classes, or internals are exposed.
 *
 * W3-A: LAB-004/005/006 add the TYPE-SEPARATED evidence layer — a
 * `SimulationPrediction` (counterfactual: true, disclosed synthetic) can
 * NEVER be stored or returned where a `HistoricalObservation`
 * (counterfactual: false, from corpus/evidence) is required (architecture
 * lock rule 29, compile-time pinned in the contracts) — and the Time
 * Machine whose delayed-information mode never leaks future information
 * (lock rule 30).
 *
 * W4-A: LAB-007/008/009 extend the same separation through the ensemble /
 * off-policy / learning surfaces — `EnsemblePrediction` extends
 * `SimulationPrediction`, the OPE score and the learned candidate carry
 * `counterfactual: true` literal pins, and every reward term binds its
 * value source EXPLICITLY (§21: vanity metrics never silently replace the
 * declared objective; a non-derivable or ambiguous source fails closed).
 *
 * W5-A: LAB-011 adds the DECLARATIVE transform layer — the thirteen frozen
 * §5 kinds as VERSIONED `TransformDefinition`s (each a canonical CORE-001
 * `Transform` contract with a named input constraint, an output contract,
 * capability requirements and the human-participation flag; NO-OP/REPOST
 * first-class with a real zero-capability definition) and the VERSIONED
 * tenant-scoped append-only `TransformGraph` DAG of transform applications
 * over artifact refs with structural validation, lineage tracing and
 * subgraph queries. A TRANSFORM IS A CONTRACT, NOT AN ENGINE: nothing here
 * resolves engines, executes transforms or materializes artifacts
 * (execution is Lab runs / production programs / the ENG runner —
 * LAB-012 / LAB-016).
 *
 * RECONCILED (W2-A / RECONCILE-A): all shared value types (TenantId,
 * TenantScope, Version, Timestamp, RightsRef, ProvenanceRef, ArtifactRef,
 * …) come from `@mos/contracts`; the W1-A scaffold's `@mos/content`
 * re-export path is retired.
 *
 * Cross-package usage note: this package imports `@mos/capabilities` for the
 * §5 seed capability catalog ids used as TEST fixtures in the feature
 * computation requirement declarations and the transform definition
 * fixtures (registry-declared dependency). The rights gate
 * (`RightsCheckPort`) is a lab-owned STRUCTURAL port — the rights module is
 * not among the lab module's registry dependencies; a real adapter over
 * `@mos/rights` is wired at the composition root.
 *
 * LAB-008/LAB-009 reward seam (W4-A design call, disclosed): the missions
 * module is not a registry dependency of the lab, so the lab declares a
 * STRUCTURALLY COMPATIBLE local reward spec (`LabRewardSpec`) whose metric
 * vocabulary mirrors the missions `RewardMetricId` union exactly; the
 * composition root binds a real `@mos/missions` reward spec onto it.
 */

// ---- LAB-001: reference-first niche corpus ----
export type {
  CorpusError,
  CorpusErrorCode,
  CorpusId,
  CorpusQuery,
  CorpusStore,
  CorpusVersion,
  IngestReferenceDocumentInput,
  ReferenceDocument,
  ReferenceDocumentDraft,
  ReferenceDocumentId,
  ReferenceModality,
  RightsCheckDenialReason,
  RightsCheckInput,
  RightsCheckPort,
  RightsCheckVerdict,
  SnapshotCorpusVersionInput,
} from './contracts/corpus.js';

// ---- LAB-002: multimodal feature bundles ----
export type {
  AttachFeatureBundleInput,
  FeatureBundle,
  FeatureBundleError,
  FeatureBundleErrorCode,
  FeatureBundleId,
  FeatureBundleRegistry,
  FeatureComputationPort,
  FeatureDescriptor,
  FeatureKind,
  FeatureKindRequirement,
  FeatureMetadata,
  FeatureMetadataValue,
  UpdateFeatureBundleInput,
} from './contracts/feature-bundle.js';

// ---- LAB-003: Idea Graph ----
export type {
  AddIdeaEdgeInput,
  AddIdeaNodeInput,
  DerivationStep,
  IdeaDerivation,
  IdeaEdge,
  IdeaEdgeId,
  IdeaEdgeKind,
  IdeaGraph,
  IdeaGraphError,
  IdeaGraphErrorCode,
  IdeaNeighborhood,
  IdeaNeighborhoodQuery,
  IdeaNode,
  IdeaNodeId,
  ReviseIdeaNodeInput,
  UpdateIdeaEdgeInput,
} from './contracts/idea-graph.js';

// ---- LAB-004+: historical evidence vs counterfactual predictions ----
export type {
  HistoricalObservation,
  HistoricalObservationId,
  ObservedMetric,
  PredictedMetric,
  PredictionInterval,
  SimulationPrediction,
  SimulationPredictionId,
} from './contracts/evidence.js';

// ---- LAB-004: Social Simulator ----
export type {
  RegisterWorldModelInput,
  SimulatedMetricDelta,
  SimulatorEnginePort,
  SimulatorError,
  SimulatorErrorCode,
  SimulatorStepInput,
  SocialSimulationResult,
  SocialWorldModel,
  SocialWorldModelDraft,
  SocialWorldModelId,
  SocialWorldModelState,
  SocialWorldModelStore,
  StrategyActionCandidate,
  StrategyActionKind,
} from './contracts/simulator.js';

// ---- LAB-005: user/creator/competition dynamics ----
export type {
  DynamicsError,
  DynamicsErrorCode,
  DynamicsModel,
  DynamicsModelDraft,
  DynamicsModelId,
  DynamicsModelStore,
  DynamicsPopulationKind,
  DynamicsSegmentState,
  DynamicsState,
  DynamicsStepInput,
  DynamicsStepPort,
  DynamicsStepResult,
  PopulationResponse,
  PopulationSegment,
  RegisterDynamicsModelInput,
} from './contracts/dynamics.js';

// ---- LAB-006: Time Machine ----
export type {
  AppendHistoricalObservationInput,
  BranchRecordId,
  CounterfactualBranch,
  CounterfactualBranchRecord,
  CreateBranchInput,
  DelayedInformationQuery,
  HistoricalObservationDraft,
  HistoricalTimelineQuery,
  RecordBranchPredictionInput,
  TimeMachineBranchId,
  TimeMachineError,
  TimeMachineErrorCode,
  TimeMachineIntervention,
  TimeMachinePort,
} from './contracts/time-machine.js';

// ---- LAB-007: World Model Ensemble ----
export type {
  AddEnsembleMemberInput,
  CalibrationPlaceholder,
  EnsembleDisagreement,
  EnsembleError,
  EnsembleErrorCode,
  EnsembleEvaluationInput,
  EnsembleMember,
  EnsembleOodSignal,
  EnsemblePort,
  EnsemblePrediction,
  EnsembleWeightingPolicy,
  MemberCoverage,
  MemberOodVerdict,
  MemberPrediction,
  MetricDisagreement,
  CoverageRange,
  RegisterEnsembleInput,
  SeedRobustnessMetricSweep,
  SeedRobustnessSweep,
  WorldModelEnsemble,
  WorldModelEnsembleDraft,
  WorldModelEnsembleId,
} from './contracts/ensemble.js';

// ---- LAB-008/LAB-009: mission-compatible reward vocabulary + program descriptors ----
export type {
  CandidateProgramDescriptor,
  CandidateProgramStrategy,
  LabRewardDirection,
  LabRewardMetricId,
  LabRewardSpec,
  LabRewardTerm,
} from './contracts/reward.js';

// ---- LAB-008: Offline / Off-Policy Evaluation ----
export type {
  EvaluationBasis,
  OffPolicyError,
  OffPolicyErrorCode,
  OffPolicyEvaluationId,
  OffPolicyEvaluationInput,
  OffPolicyEvaluationPort,
  OffPolicyEvaluationResult,
  OffPolicyEvaluationScore,
  OffPolicyInsufficientHistory,
  OffPolicyUncertaintyBreakdown,
  OffPolicyValidityDisclosure,
  ObservedMetricMean,
  RewardTermContribution,
} from './contracts/off-policy-evaluation.js';

// ---- LAB-009: Sequential Strategy Learning ----
export type {
  IterationCostDimensions,
  LearnedStrategyCandidate,
  LearnedStrategyCandidateId,
  LearningProvenance,
  LearningStopReason,
  LearningStoppingPolicy,
  LearningTrace,
  LearningTraceIteration,
  StrategyLearningError,
  StrategyLearningErrorCode,
  StrategyLearningInput,
  StrategyLearningPort,
  VariantEvaluation,
} from './contracts/strategy-learning.js';

// ---- LAB-011: Transform Definitions ----
export type {
  TransformDefinition,
  TransformDefinitionError,
  TransformDefinitionErrorCode,
  TransformDefinitionInput,
  TransformDefinitionRegistry,
  TransformInputConstraint,
  TransformKind,
  TransformOutputContract,
} from './contracts/transform-definition.js';

// ---- LAB-011: Transform Graph ----
export type {
  AppendToTransformGraphInput,
  ArtifactFlowEdge,
  CreateTransformGraphInput,
  TransformApplicationNode,
  TransformArtifactQuery,
  TransformGraph,
  TransformGraphError,
  TransformGraphErrorCode,
  TransformGraphId,
  TransformGraphPort,
  TransformGraphValidation,
  TransformGraphValidationFailure,
  TransformGraphValidationFailureCode,
  TransformLineage,
  TransformSubgraph,
} from './contracts/transform-graph.js';

// ---- Runtime factories (in-memory scaffolds, disclosed) ----
export type { InMemoryCorpusStoreOptions } from './adapters/in-memory-corpus-store.js';
export type { InMemoryFeatureBundleRegistryOptions } from './adapters/in-memory-feature-bundle-registry.js';
export type { InMemoryIdeaGraphOptions } from './adapters/in-memory-idea-graph.js';
export type { InMemorySocialWorldModelStoreOptions } from './adapters/in-memory-social-simulator.js';
export type { InMemorySimulatorEngineOptions } from './adapters/in-memory-social-simulator.js';
export type { InMemoryDynamicsModelStoreOptions } from './adapters/in-memory-dynamics.js';
export type { InMemoryDynamicsStepperOptions } from './adapters/in-memory-dynamics.js';
export type { InMemoryTimeMachineOptions } from './adapters/in-memory-time-machine.js';
export type { InMemoryEnsembleOptions } from './adapters/in-memory-ensemble.js';
export type { InMemoryOffPolicyEvaluatorOptions } from './adapters/in-memory-off-policy-evaluation.js';
export type { InMemoryStrategyLearnerOptions } from './adapters/in-memory-strategy-learner.js';
export type { InMemoryTransformDefinitionRegistryOptions } from './adapters/in-memory-transform-definition-registry.js';
export type { InMemoryTransformGraphOptions } from './adapters/in-memory-transform-graph.js';

export { createInMemoryCorpusStore } from './adapters/in-memory-corpus-store.js';
export { createStaticFeatureComputationPort } from './adapters/static-feature-computation.js';
export { createInMemoryFeatureBundleRegistry } from './adapters/in-memory-feature-bundle-registry.js';
export { createInMemoryIdeaGraph } from './adapters/in-memory-idea-graph.js';
export { createInMemorySocialWorldModelStore } from './adapters/in-memory-social-simulator.js';
export { createInMemorySimulatorEngine } from './adapters/in-memory-social-simulator.js';
export { createInMemoryDynamicsModelStore } from './adapters/in-memory-dynamics.js';
export { createInMemoryDynamicsStepper } from './adapters/in-memory-dynamics.js';
export { createInMemoryTimeMachine } from './adapters/in-memory-time-machine.js';
export { createInMemoryEnsemble } from './adapters/in-memory-ensemble.js';
export { createInMemoryOffPolicyEvaluator } from './adapters/in-memory-off-policy-evaluation.js';
export { createInMemoryStrategyLearner } from './adapters/in-memory-strategy-learner.js';
export { createInMemoryTransformDefinitionRegistry } from './adapters/in-memory-transform-definition-registry.js';
export { createInMemoryTransformGraph } from './adapters/in-memory-transform-graph.js';
