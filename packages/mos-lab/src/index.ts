/**
 * Public surface of `@mos/lab` (MOS v2.0 LAB-001..003 + LAB-004..006).
 *
 * Exports the corpus / feature-bundle / idea-graph / evidence-separation /
 * social-simulator / dynamics / Time Machine contract types plus nine
 * runtime factories (in-memory corpus store, static feature computation
 * declaration carrier, in-memory feature bundle registry, in-memory idea
 * graph, in-memory social world model store, in-memory simulator engine,
 * in-memory dynamics model store, in-memory dynamics stepper, in-memory
 * Time Machine). No helper constructors, error classes, or internals are
 * exposed.
 *
 * W3-A: LAB-004/005/006 add the TYPE-SEPARATED evidence layer — a
 * `SimulationPrediction` (counterfactual: true, disclosed synthetic) can
 * NEVER be stored or returned where a `HistoricalObservation`
 * (counterfactual: false, from corpus/evidence) is required (architecture
 * lock rule 29, compile-time pinned in the contracts) — and the Time
 * Machine whose delayed-information mode never leaks future information
 * (lock rule 30).
 *
 * RECONCILED (W2-A / RECONCILE-A): all shared value types (TenantId,
 * TenantScope, Version, Timestamp, RightsRef, ProvenanceRef, ArtifactRef,
 * …) come from `@mos/contracts`; the W1-A scaffold's `@mos/content`
 * re-export path is retired.
 *
 * Cross-package usage note: this package imports `@mos/capabilities` for the
 * §5 seed capability catalog ids used as TEST fixtures in the feature
 * computation requirement declarations (registry-declared dependency). The
 * rights gate (`RightsCheckPort`) is a lab-owned STRUCTURAL port — the
 * rights module is not among the lab module's registry dependencies; a real
 * adapter over `@mos/rights` is wired at the composition root.
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

// ---- Runtime factories (in-memory scaffolds, disclosed) ----
export type { InMemoryCorpusStoreOptions } from './adapters/in-memory-corpus-store.js';
export type { InMemoryFeatureBundleRegistryOptions } from './adapters/in-memory-feature-bundle-registry.js';
export type { InMemoryIdeaGraphOptions } from './adapters/in-memory-idea-graph.js';
export type { InMemorySocialWorldModelStoreOptions } from './adapters/in-memory-social-simulator.js';
export type { InMemorySimulatorEngineOptions } from './adapters/in-memory-social-simulator.js';
export type { InMemoryDynamicsModelStoreOptions } from './adapters/in-memory-dynamics.js';
export type { InMemoryDynamicsStepperOptions } from './adapters/in-memory-dynamics.js';
export type { InMemoryTimeMachineOptions } from './adapters/in-memory-time-machine.js';

export { createInMemoryCorpusStore } from './adapters/in-memory-corpus-store.js';
export { createStaticFeatureComputationPort } from './adapters/static-feature-computation.js';
export { createInMemoryFeatureBundleRegistry } from './adapters/in-memory-feature-bundle-registry.js';
export { createInMemoryIdeaGraph } from './adapters/in-memory-idea-graph.js';
export { createInMemorySocialWorldModelStore } from './adapters/in-memory-social-simulator.js';
export { createInMemorySimulatorEngine } from './adapters/in-memory-social-simulator.js';
export { createInMemoryDynamicsModelStore } from './adapters/in-memory-dynamics.js';
export { createInMemoryDynamicsStepper } from './adapters/in-memory-dynamics.js';
export { createInMemoryTimeMachine } from './adapters/in-memory-time-machine.js';
