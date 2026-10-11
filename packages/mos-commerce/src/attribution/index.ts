/** The ATTRIB-001 attribution subtree's public surface (re-exported by the package index). */
export type {
  SocialObservationRef,
  AttributionId,
  AttributionBasis,
  AttributionBasisKind,
  AttributionCorrection,
  AttributionRecord,
  AttributionError,
  AttributionErrorCode,
} from "./types.js";

export type {
  AttributionServiceOptions,
  CreateAttributionInput,
  AttributionResult,
} from "./ops.js";

export { ATTRIBUTION_BASIS_KINDS, ATTRIBUTION_ERROR_CODES } from "./types.js";
export { AttributionService } from "./ops.js";
export {
  CAUSALITY_VOCABULARY_PATTERNS,
  validateNoCausalityVocabulary,
} from "./validation.js";
