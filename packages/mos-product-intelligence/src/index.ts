/**
 * Public surface of `@mos/product-intelligence` (MOS v2.0 W11-A — the
 * product-source-intelligence authority, deferred from W10-A).
 *
 * Exports the contracts/port types plus exactly THREE runtime exports: the
 * disclosed in-memory adapter factory and the two frozen vocabulary
 * constants. No helper constructors, error classes, or internals are
 * exposed.
 *
 * §25 BOUNDARY (architecture): product intelligence can inform marketing
 * planning but remains a separate authority — this package carries NO
 * mission/plan/decision surface; commerce truth remains external — records
 * CITE external commerce observations with provenance and NEVER author
 * orders/inventory/listing state; forecast records are explicitly
 * counterfactual-labeled (type-level literal pins, re-validated at
 * runtime). The read/search/resolve surfaces are the declared seams a
 * MARKETING-001 mission planner consumes through versioned citations.
 *
 * Cross-package usage note (the @mos/rights/@mos/policy precedent):
 * sibling MOS packages import this package TYPE-ONLY (type imports against
 * this entry point) and receive runtime implementations through injection
 * (hexagonal ports); runtime cross-import of workspace packages whose
 * exports default to source entry points does not resolve under plain Node
 * ESM, so the composition root wires adapters at TL integration time.
 *
 * Registry-exact dependency set: [@mos/contracts, @mos/identity,
 * @mos/rights] (spec/mos-module-registry-v2.0.yaml) — pinned by the
 * authority-discipline battery in this package.
 */

// ---- Contracts: identifiers ----
export type {
  ProductIntelligenceId,
  ProductIntelligenceVersionRef,
  ProductSubjectRef,
} from './contracts/ids.js';

// ---- Contracts: records ----
export type {
  CitedEvidenceBasis,
  CommerceObservationCitation,
  ForecastBasis,
  ProductFactContent,
  ProductIntelligenceBasis,
  ProductIntelligenceContent,
  ProductIntelligenceKind,
  ProductIntelligenceRecord,
  ProductIntelligenceSource,
  ProductIntelligenceSourceKind,
  ProductMetricContent,
  ProductObservationContent,
} from './contracts/records.js';

// ---- Contracts: search ----
export type { ProductIntelligenceSearchQuery } from './contracts/search.js';

// ---- Port ----
export type {
  ProductIntelligenceErrorCode,
  ProductIntelligenceError,
  ProductIntelligenceIntegrityReport,
  ProductIntelligencePort,
  ProductIntelligenceRightsSource,
  RecordProductIntelligenceInput,
} from './ports/product-intelligence-port.js';

// ---- Adapter (disclosed in-memory double) ----
export type { InMemoryProductIntelligenceOptions } from './adapters/in-memory-product-intelligence.js';

// ---- Runtime exports (exactly three) ----
export { PRODUCT_INTELLIGENCE_KINDS, PRODUCT_INTELLIGENCE_SOURCE_KINDS } from './contracts/records.js';
export { createInMemoryProductIntelligence } from './adapters/in-memory-product-intelligence.js';
