/**
 * Public surface of `@mos/commerce` (MOS v2.0 COMMERCE-001 — the
 * commerce-discovery authority).
 *
 * Type exports (records, port, errors) + THREE runtime exports: the
 * CommerceDiscoveryService, the disclosed in-memory demand-experiment
 * double, and the frozen error-code vocabulary. No helper constructors or
 * internals are exposed.
 *
 * §BOUNDARY: discovery candidates INFORM planning — this package carries
 * NO listing/order/inventory vocabulary or state (source-scan pinned);
 * commerce truth stays external (provenance CITES product-intelligence
 * records); demand tests ride the declared DemandExperimentPort seam whose
 * REAL binding is composed over @mos/experiments at the integration root
 * (the compat battery proves it against the REAL authority over dist).
 *
 * Registry-exact runtime dependency set: [@mos/contracts, @mos/missions,
 * @mos/product-intelligence] (spec/mos-module-registry-v2.0.yaml) — pinned
 * by the authority-discipline battery. @mos/experiments is a devDependency
 * (type + compat surfaces only; the missions-package precedent).
 */
export type {
  CommerceDiscoveryId,
  ProvenanceSource,
  DemandTestDeclaration,
  CorrectionRecord,
  CommerceDiscoveryRecord,
  CommerceDiscoveryError,
  CommerceDiscoveryErrorCode,
  DemandExperimentPort,
  DemandExperimentBindingOutcome,
} from "./types.js";

export type {
  CommerceDiscoveryServiceOptions,
  CreateCommerceDiscoveryInput,
  CommerceDiscoveryResult,
} from "./ops.js";

export type {
  CommerceDiscoveryClock,
  CommerceDiscoveryIdFactory,
} from "./helpers.js";

export type { InMemoryDemandExperimentDoubleOptions } from "./adapters/in-memory-demand-experiment.js";

export { COMMERCE_DISCOVERY_ERROR_CODES } from "./types.js";
export { CommerceDiscoveryService } from "./ops.js";
export {
  commerceDiscoveryNowDefault,
  commerceDiscoveryIdDefault,
} from "./helpers.js";
export { createInMemoryDemandExperimentPort } from "./adapters/in-memory-demand-experiment.js";

export type {
  SocialObservationRef,
  AttributionId,
  AttributionBasis,
  AttributionBasisKind,
  AttributionCorrection,
  AttributionRecord,
  AttributionError,
  AttributionErrorCode,
} from "./attribution/types.js";

export type {
  AttributionServiceOptions,
  CreateAttributionInput,
  AttributionResult,
} from "./attribution/ops.js";

export { ATTRIBUTION_BASIS_KINDS, ATTRIBUTION_ERROR_CODES } from "./attribution/types.js";
export { AttributionService } from "./attribution/ops.js";
export {
  CAUSALITY_VOCABULARY_PATTERNS,
  validateNoCausalityVocabulary,
} from "./attribution/validation.js";
