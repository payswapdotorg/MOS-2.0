/**
 * ProviderImplementation — layer 2 of the connector provider contract
 * (INTEG-001): a CONCRETE versioned implementation of a definition.
 *
 * Carries the implementation status and the evidence backing it, plus the
 * observed posture fields of the canonical `ConnectorProvider` contract
 * (`evidenceModel`, `errorModel`, `rateLimitObservation` — the split is
 * documented in provider-definition.ts).
 *
 * STATUS DISCIPLINE (test-pinned): the status vocabulary is
 * available | unavailable | degraded | unknown and **UNKNOWN is a preserved
 * first-class state** — it is NEVER coerced to unavailable (or to anything
 * else) by any query, summary or audit record: records carry the exact
 * status string they observed, verbatim. Status evolution happens ONLY
 * through append-only version corrections: a correction appends a new
 * immutable record version with the new status; prior versions stay
 * resolvable with their original status (history is never rewritten).
 *
 * EVIDENCE DISCIPLINE: `available` and `degraded` are POSITIVE observation
 * claims, so registering or correcting into those statuses requires at
 * least one evidence ref (fail-closed, AGENTS.md "A green claim requires
 * repository-backed evidence"). `unknown` and `unavailable` may be
 * evidence-free (the absence of a claim needs no proof).
 */

import type {
  EvidenceRef,
  JsonSchemaObject,
  ProviderId,
  RateLimitObservation,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import type { ProviderDefinitionId, ProviderImplementationId } from "./ids.js";

// ---------------------------------------------------------------------------
// Status vocabulary (UNKNOWN preserved first-class)
// ---------------------------------------------------------------------------

/**
 * Implementation status vocabulary. `unknown` is a FIRST-CLASS state: it
 * means "no evidenced observation of this implementation's status exists
 * yet" and must survive every query and every §30 record unchanged —
 * never rewritten to `unavailable` (or anything else).
 */
export const PROVIDER_IMPLEMENTATION_STATUSES = Object.freeze([
  "available",
  "unavailable",
  "degraded",
  "unknown",
] as const);

/** One of the {@link PROVIDER_IMPLEMENTATION_STATUSES} entries. */
export type ProviderImplementationStatus = (typeof PROVIDER_IMPLEMENTATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// ProviderImplementation (layer 2)
// ---------------------------------------------------------------------------

/**
 * Layer 2 — a concrete versioned implementation of a
 * {@link ProviderDefinition}.
 *
 * The implementation identity (`id`) is stable across record versions: a
 * status correction appends `version + 1` to the SAME id. Implementations
 * pin the exact definition version they implement (`definitionId` +
 * `definitionVersion` — no silent substitution).
 */
export interface ProviderImplementation {
  /** Registry record identity (stable across versions). */
  readonly id: ProviderImplementationId;
  /** Monotonic record version (append-only corrections). */
  readonly version: Version;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** Echo of the provider identity of the implemented definition (data). */
  readonly providerId: ProviderId;
  /** WHICH definition this implementation implements. */
  readonly definitionId: ProviderDefinitionId;
  /** The EXACT definition version implemented (explicit, no drift). */
  readonly definitionVersion: Version;
  /** Implementation label (tenant data, e.g. "primary" / "fallback"). */
  readonly label: string;
  /**
   * Implementation status — `unknown` is preserved first-class and never
   * coerced (see module docblock). Recorded VERBATIM on every §30
   * interaction record issued against this implementation version.
   */
  readonly status: ProviderImplementationStatus;
  /** When this status was observed. */
  readonly statusObservedAt: Timestamp;
  /**
   * Evidence backing the status claim. REQUIRED non-empty when registering
   * or correcting into `available` or `degraded` (positive claims need
   * evidence); `unknown`/`unavailable` may be evidence-free.
   */
  readonly evidenceRefs: readonly EvidenceRef[];
  /**
   * Canonical `ConnectorProvider.evidenceModel`: how real-world evidence
   * from this implementation is shaped (observed posture, data).
   */
  readonly evidenceModel: JsonSchemaObject;
  /**
   * Canonical `ConnectorProvider.errorModel`: the provider's error
   * vocabulary as observed (data).
   */
  readonly errorModel: JsonSchemaObject;
  /**
   * Canonical `ConnectorProvider.rateLimitObservation`: observed rate-limit
   * posture of this implementation.
   */
  readonly rateLimitObservation: RateLimitObservation;
}

/**
 * Input for registering an implementation record (layer 2). Record versions
 * are registry-assigned (append-only): registering with an id that already
 * exists IN THE SAME TENANT appends the next version; a fresh id starts at
 * version 1. A cross-tenant id collision is an independent record (tenant
 * ids are not globally unique — no existence leaks).
 */
export interface RegisterProviderImplementationInput {
  /** Optional record id (minted when omitted). */
  readonly id?: ProviderImplementationId;
  readonly scope: TenantScope;
  readonly definitionId: ProviderDefinitionId;
  readonly definitionVersion: Version;
  readonly label: string;
  readonly status: ProviderImplementationStatus;
  readonly statusObservedAt?: Timestamp;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly evidenceModel: JsonSchemaObject;
  readonly errorModel: JsonSchemaObject;
  readonly rateLimitObservation: RateLimitObservation;
}

/**
 * An append-only status correction: appends a new version of the
 * implementation record carrying the new status and evidence. The prior
 * version (with its prior status — possibly `unknown`) stays resolvable.
 */
export interface ProviderStatusCorrectionInput {
  readonly scope: TenantScope;
  readonly implementationId: ProviderImplementationId;
  readonly status: ProviderImplementationStatus;
  readonly statusObservedAt?: Timestamp;
  /** Evidence for the NEW status (validated by the same evidence rule). */
  readonly evidenceRefs: readonly EvidenceRef[];
}
