/**
 * Product-intelligence RECORD contracts (the product-source-intelligence
 * authority's stored shapes — W11-A).
 *
 * §25 BOUNDARY (pinned on EVERY record, verbatim):
 * - product intelligence INFORMS marketing planning but remains a SEPARATE
 *   authority — records carry no plan/mission/decision surface;
 * - COMMERCE TRUTH stays external: records CITE external commerce
 *   observations with provenance (source-labeled citations), they never
 *   author orders/inventory/listing state;
 * - simulated/forecast values are EXPLICITLY counterfactual-labeled (the
 *   type-level literal pin below — a forecast record cannot even be
 *   constructed without `counterfactual: true`).
 *
 * §24-STYLE boundary statement: every record names itself an ANALYSIS
 * artifact (`recordKind` + the pinned `intelligenceOnly` statement) —
 * product intelligence is analysis material for planning, NEVER reality
 * authority.
 *
 * Rights-respect: every record names the explicit `RightsRef` of the grant
 * under which the analysis was recorded (the rights gate re-resolves it at
 * record time — an ACTIVE tenant-matching grant carrying the `analyze`
 * action and covering every cited ref; `attribution` is mandatory whenever
 * the grant's terms require attribution).
 */

import type {
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type { IdentityId } from '@mos/identity';
import type { ProductIntelligenceId, ProductSubjectRef } from './ids.js';

// ---------------------------------------------------------------------------
// Kinds + content (the evidence-linked product-side intelligence payloads)
// ---------------------------------------------------------------------------

/** The three record kinds of product-side intelligence. */
export type ProductIntelligenceKind =
  | 'product-fact'
  | 'product-metric'
  | 'product-observation';

/**
 * A product FACT: a single evidence-linked statement about the subject
 * (e.g. "the landing-page headline is X", "the product ships in three
 * formats"). Facts are observations-with-evidence, never authoritative
 * product state — the product's own systems own that.
 */
export interface ProductFactContent {
  readonly kind: 'product-fact';
  /** The fact statement (non-blank). */
  readonly statement: string;
  /**
   * Evidence refs backing the fact (>= 1 required — an evidence-linked
   * record with no evidence is a fabrication, not intelligence).
   */
  readonly evidenceRefs: readonly string[];
}

/**
 * A product METRIC: one measured value about the subject. `value` passes a
 * finite-number guard before storage (the W9-B D5 discipline — no
 * NaN/Infinity can ever enter a stored record, whatever produced it
 * upstream).
 */
export interface ProductMetricContent {
  readonly kind: 'product-metric';
  /** Metric name (non-blank, e.g. "qualified-reach"). */
  readonly metric: string;
  /** The observed value — a FINITE number (guard: non-finite fails closed). */
  readonly value: number;
  /** Unit of the value (non-blank, e.g. "people"). */
  readonly unit: string;
  /** The observation window the value covers (e.g. "2026-05-01..2026-05-31"), or `null`. */
  readonly window: string | null;
  /** Evidence refs backing the metric (>= 1 required). */
  readonly evidenceRefs: readonly string[];
}

/**
 * A product OBSERVATION: a qualitative, evidence-linked observation about
 * the subject (e.g. an audience reaction summary grounded in cited
 * transcripts).
 */
export interface ProductObservationContent {
  readonly kind: 'product-observation';
  /** The observation narrative (non-blank). */
  readonly narrative: string;
  /** Evidence refs backing the observation (>= 1 required). */
  readonly evidenceRefs: readonly string[];
}

/** The discriminated content union. */
export type ProductIntelligenceContent =
  | ProductFactContent
  | ProductMetricContent
  | ProductObservationContent;

// ---------------------------------------------------------------------------
// Explicit source attribution
// ---------------------------------------------------------------------------

/**
 * Where the intelligence CAME from. Every record carries exactly one
 * declared source kind plus >= 1 source refs — intelligence without
 * explicit source attribution is unverifiable and fails closed at record
 * time.
 */
export type ProductIntelligenceSourceKind =
  | 'platform-analytics'
  | 'external-commerce-system'
  | 'human-report'
  | 'derived-analysis'
  | 'forecast-model';

/** The record's explicit source attribution (source kind + source refs). */
export interface ProductIntelligenceSource {
  readonly sourceKind: ProductIntelligenceSourceKind;
  /**
   * Refs naming the sources this intelligence came from (>= 1 required —
   * explicit attribution, never "somewhere"). The rights gate requires the
   * backing grant to COVER these refs.
   */
  readonly sourceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// Basis: cited external evidence vs counterfactual forecast (§25, typed)
// ---------------------------------------------------------------------------

/**
 * BASIS = cited external evidence: the record cites evidence observed
 * OUTSIDE this authority. The literal `counterfactual: false` pin is part
 * of the contract (compile-time — the same discipline as the LAB-004
 * evidence separation): a cited-evidence record cannot be constructed with
 * the counterfactual label, and the adapter re-validates the literal at
 * runtime (the double-cast guard).
 */
export interface CitedEvidenceBasis {
  readonly basis: 'cited-external-evidence';
  readonly counterfactual: false;
  /** When the cited evidence was observed (ISO-8601, non-blank). */
  readonly observedAt: Timestamp;
}

/**
 * BASIS = counterfactual forecast: the record's values are simulated or
 * forecast (a model output, a projected scenario). The literal
 * `counterfactual: true` pin is REQUIRED — §25: "forecasts explicitly
 * counterfactual-labeled" — enforced at the type level AND re-validated at
 * runtime.
 */
export interface ForecastBasis {
  readonly basis: 'counterfactual-forecast';
  readonly counterfactual: true;
  /**
   * How the forecast was produced (non-blank method note — no invented
   * precision: the note names the method/model, nothing more).
   */
  readonly methodNote: string;
}

/** The discriminated basis union. */
export type ProductIntelligenceBasis = CitedEvidenceBasis | ForecastBasis;

// ---------------------------------------------------------------------------
// External commerce observation citations (§25 — CITED, never authored)
// ---------------------------------------------------------------------------

/**
 * A CITATION of one externally-observed commerce data point (e.g. an
 * observed listing price, an observed availability state, an observed
 * order-volume figure on an external commerce system).
 *
 * §25 COMMERCE DISCIPLINE (verbatim): commerce truth remains external
 * authority through the existing commerce domain. This citation is a
 * provenance-carrying POINTER to something observed outside — it is never
 * an order, never inventory, never authoritative listing state, and this
 * package provides NO surface that could turn citations into either.
 */
export interface CommerceObservationCitation {
  /** Opaque ref of the observed commerce data point at the external system. */
  readonly observationRef: string;
  /** What was observed (e.g. "listing-price", "inventory-availability"). */
  readonly observedAspect: string;
  /** The external commerce system the observation came from (named source). */
  readonly sourceSystem: string;
  /** When the observation was taken (ISO-8601, non-blank). */
  readonly observedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The stored record
// ---------------------------------------------------------------------------

/**
 * THE PRODUCT-INTELLIGENCE RECORD: versioned, tenant-scoped, append-only,
 * evidence-linked, rights-respecting, source-attributed product-side
 * intelligence — the source material a MARKETING-001 mission planner reads
 * through versioned citations.
 *
 * APPEND-ONLY BY CONSTRUCTION: records chain per (tenant, record id) and
 * the ONLY write path is `recordProductIntelligence` (a new record is
 * ALWAYS a new version; there is no update or delete surface anywhere in
 * the port). Stored records are clone-then-deep-frozen snapshots,
 * digest-sealed for bit-for-bit verification.
 */
export interface ProductIntelligenceRecord {
  /** The record chain's stable identity. */
  readonly id: ProductIntelligenceId;
  /** Monotonic chain version; starts at 1. */
  readonly version: Version;
  /** Owning tenant (§31 — the visibility boundary; exact-equality reads). */
  readonly tenantId: TenantId;
  /**
   * The record's OWN frozen copy of the caller's scope (W9-B D4: the record
   * never aliases the caller's live scope object — a post-hoc mutation of
   * the caller's scope cannot move the stored record's tenant identity).
   */
  readonly scope: Readonly<TenantScope>;
  /** The product-side subject this record is about. */
  readonly subject: ProductSubjectRef;
  /** The record kind (mirrors the content union's discriminant). */
  readonly kind: ProductIntelligenceKind;
  /** The evidence-linked content (fact | metric | observation). */
  readonly content: ProductIntelligenceContent;
  /** The explicit source attribution. */
  readonly source: ProductIntelligenceSource;
  /** The basis (cited external evidence vs counterfactual forecast). */
  readonly basis: ProductIntelligenceBasis;
  /**
   * External commerce observations this record CITES (§25 — citations with
   * provenance, never authored commerce state). Required non-empty when the
   * source kind is `external-commerce-system`.
   */
  readonly citedCommerceObservations: readonly CommerceObservationCitation[];
  /**
   * The explicit rights grant this analysis was recorded under (the rights
   * gate resolved it to an ACTIVE tenant-matching grant carrying the
   * `analyze` action and covering every cited ref).
   */
  readonly rightsRef: RightsRef;
  /**
   * The source/rights-holder attribution carried on the record — REQUIRED
   * (non-null, non-blank) whenever the backing grant's terms demand
   * attribution; `null` only when the terms do not.
   */
  readonly attribution: string | null;
  /** The identity principal that recorded this intelligence. */
  readonly recordedBy: IdentityId;
  /** ISO-8601 record timestamp (injectable clock on the adapter). */
  readonly recordedAt: Timestamp;
  /** Free-form recorder note, or `null`. */
  readonly note: string | null;
  /**
   * Deterministic digest of the full record payload (canonical JSON +
   * FNV-1a — the LAB-017 bit-for-bit change detector, never a security
   * claim). Verified through `verifyProductIntelligenceIntegrity`.
   */
  readonly recordDigest: string;
  /** Every record names itself an ANALYSIS artifact (§24-style statement). */
  readonly recordKind: 'product-intelligence-analysis';
  /** The disclosure label (pinned vocabulary, pinned by tests). */
  readonly disclosure: 'evidence-linked-product-intelligence-with-explicit-source-attribution';
  /**
   * THE §25 BOUNDARY STATEMENT — pinned verbatim on every record (the
   * authority-discipline battery asserts this exact text):
   */
  readonly intelligenceOnly:
    | 'product intelligence informs marketing planning only — it carries no mission authority, never authors commerce truth (external commerce observations are cited with provenance and never become orders, inventory or listing state), and counterfactual-forecast records are explicitly labeled simulated, never reality (§25)';
}

// ---------------------------------------------------------------------------
// Frozen vocabularies (runtime constants — exported from the package index)
// ---------------------------------------------------------------------------

/** The frozen record-kind vocabulary. */
export const PRODUCT_INTELLIGENCE_KINDS: readonly ProductIntelligenceKind[] =
  Object.freeze(['product-fact', 'product-metric', 'product-observation']);

/** The frozen source-kind vocabulary. */
export const PRODUCT_INTELLIGENCE_SOURCE_KINDS: readonly ProductIntelligenceSourceKind[] =
  Object.freeze([
    'platform-analytics',
    'external-commerce-system',
    'human-report',
    'derived-analysis',
    'forecast-model',
  ]);
