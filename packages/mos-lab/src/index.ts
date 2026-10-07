/**
 * Public surface of `@mos/lab` (MOS v2.0 LAB-001 full + LAB-002 + LAB-003).
 *
 * Exports the corpus / feature-bundle / idea-graph contract types plus four
 * runtime factories (in-memory corpus store, static feature computation
 * declaration carrier, in-memory feature bundle registry, in-memory idea
 * graph). No helper constructors, error classes, or internals are exposed.
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

// ---- Runtime factories (in-memory scaffolds, disclosed) ----
export type { InMemoryCorpusStoreOptions } from './adapters/in-memory-corpus-store.js';
export type { InMemoryFeatureBundleRegistryOptions } from './adapters/in-memory-feature-bundle-registry.js';
export type { InMemoryIdeaGraphOptions } from './adapters/in-memory-idea-graph.js';

export { createInMemoryCorpusStore } from './adapters/in-memory-corpus-store.js';
export { createStaticFeatureComputationPort } from './adapters/static-feature-computation.js';
export { createInMemoryFeatureBundleRegistry } from './adapters/in-memory-feature-bundle-registry.js';
export { createInMemoryIdeaGraph } from './adapters/in-memory-idea-graph.js';
