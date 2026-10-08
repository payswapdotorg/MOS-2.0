/**
 * Branded identifier types for the product-intelligence module
 * (the W11-A product-source-intelligence authority).
 *
 * The cross-authority vocabulary (TenantId, WorkspaceId, Version,
 * Timestamp, RightsRef, TenantScope, Branded, ...) is imported from
 * `@mos/contracts` — the canonical CORE-001 authority — and the identity
 * principal type from `@mos/identity` (the registry-exact dependency set
 * [contracts, identity, rights]; see spec/mos-module-registry-v2.0.yaml).
 *
 * The product-intelligence-owned identifiers below follow the documented
 * W2-A/rights/policy reconciliation pattern: locally branded where no
 * canonical core-contract form exists yet; when the core-contract
 * vocabulary grows one, sibling packages reconcile by importing from there
 * (the documented W2 pattern — never a second authority).
 *
 * All brands are compile-time only: at runtime every identifier is the
 * plain underlying string.
 */

import type { Branded } from '@mos/contracts';

/**
 * Identifier of ONE product-intelligence record chain — the record's STABLE
 * identity across its append-only version chain (unique within its tenant;
 * a chain carries the evidence-linked facts/metrics/observations recorded
 * under one caller-chosen id).
 */
export type ProductIntelligenceId = Branded<string, 'ProductIntelligenceId'>;

/**
 * Opaque product-side subject reference — the product (or product surface)
 * an intelligence record is about (e.g. a product id, a listing ref, a
 * product's landing-page artifact ref). Opaque by design: product
 * inventory/listing AUTHORITY is external (§25); this package only records
 * intelligence ABOUT subjects, it never registers the subjects themselves.
 */
export type ProductSubjectRef = Branded<string, 'ProductSubjectRef'>;

/**
 * A VERSIONED citation of one product-intelligence record — the ONLY shape
 * mission planning (MARKETING-001) consumes: the planner cites exact
 * (recordId, version) pairs, never "whatever is latest", so an evidence-
 * linked plan stays resolvable against the immutable history.
 */
export interface ProductIntelligenceVersionRef {
  readonly recordId: ProductIntelligenceId;
  readonly version: number;
}
