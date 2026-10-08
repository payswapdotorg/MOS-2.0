/**
 * The product-intelligence SEARCH contract — the planner-facing query
 * vocabulary (W11-A).
 *
 * Search/list are READ surfaces for mission planning (MARKETING-001
 * consumes them to gather the evidence-linked source material a plan
 * cites); they answer with the LATEST version of every matching record
 * chain, deterministically ordered, so a planner can only ever cite exact
 * versions it then resolves through the citation-resolution port. This is
 * the planning-INFORMS side of §25 — no plan is produced here.
 */

import type { ProductSubjectRef } from './ids.js';
import type {
  ProductIntelligenceKind,
  ProductIntelligenceSourceKind,
} from './records.js';

/**
 * The search query over product-intelligence records. Every filter is an
 * EXACT-equality filter (never a prefix/substring scan — the W9-B D2
 * discipline); unset filters match everything.
 */
export interface ProductIntelligenceSearchQuery {
  /** Exact subject filter. */
  readonly subject?: ProductSubjectRef;
  /** Kind filter (record kind ∈ the given set; empty set matches nothing). */
  readonly kinds?: readonly ProductIntelligenceKind[];
  /**
   * Basis filter: `'cited-external-evidence'` | `'counterfactual-forecast'`
   * (a planner can ask for observed-only material, or explicitly for the
   * counterfactual-labeled side — never confuse them silently).
   */
  readonly basis?: 'cited-external-evidence' | 'counterfactual-forecast';
  /** Source-kind filter (source kind ∈ the given set; empty set matches nothing). */
  readonly sourceKinds?: readonly ProductIntelligenceSourceKind[];
  /**
   * Maximum number of records returned (integer 1..10000 — a finite
   * resource guard; non-integer/out-of-range fails closed as
   * `invalid-input`).
   */
  readonly limit?: number;
}

/**
 * Deterministic search/list ordering: `(subject, recordId)` ascending —
 * stable regardless of chain insertion order (the W10-A deterministic-
 * ordering precedent).
 */
export const PRODUCT_INTELLIGENCE_SEARCH_LIMIT_MAX = 10_000;
