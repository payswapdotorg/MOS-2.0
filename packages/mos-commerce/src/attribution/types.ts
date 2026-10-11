/**
 * ATTRIB-001 — the social-to-commerce attribution contracts.
 *
 * THE HARD LAW (acceptance, verbatim): "attribution remains distinct from
 * causality and references authoritative observations."
 *
 * Distinct from causality: an AttributionRecord says a social observation is
 * ASSOCIATED with a commerce discovery candidate (a declared, §30-attributable
 * linking basis from the frozen vocabulary) — NEVER that the observation
 * caused an outcome. The basis note passes the causality-vocabulary guard
 * (fail-closed); the record type structurally carries no effect/impact
 * fields.
 *
 * References authoritative observations: BOTH ends are opaque typed
 * references to authority-minted records — the social side cites the
 * @mos/distribution SocialObservationRecord's own id (as an opaque branded
 * ref — the REAL observation is never re-authored, never copied: no
 * `reported` payload travels into the attribution), the commerce side cites
 * an EXACT version of a @mos/commerce discovery record. The compat battery
 * pins that the REAL observation record shape satisfies the opaque ref
 * source over dist.
 */
import type {
  IdentityRef,
  TenantId,
  TenantScope,
  Timestamp,
} from "@mos/contracts";
import type { CommerceDiscoveryId } from "../types.js";

/**
 * Opaque reference to a @mos/distribution SocialObservationRecord — the
 * authority's own id, cited by reference (never re-authored here).
 */
export type SocialObservationRef = `${string}`;

/** Opaque reference to an attribution record (this module owns it). */
export type AttributionId = `${string}`;

/**
 * The frozen linking-basis vocabulary. "platform-reported-association" is
 * the only declared kind: the attribution reports that the platform-said
 * observation and the discovery candidate's subject are associated — an
 * association is NOT an effect claim.
 */
export const ATTRIBUTION_BASIS_KINDS = Object.freeze([
  "platform-reported-association",
] as const);

export type AttributionBasisKind = (typeof ATTRIBUTION_BASIS_KINDS)[number];

/** The declared linking basis (§30-attributable, causality-guarded). */
export interface AttributionBasis {
  readonly kind: AttributionBasisKind;
  /**
   * The association note (non-blank). The causality-vocabulary guard scans
   * it fail-closed — effect language is a typed rejection, never silently
   * accepted.
   */
  readonly note: string;
}

/** One append-only correction entry. */
export interface AttributionCorrection {
  readonly version: number;
  readonly at: Timestamp;
  /** §30 actor who corrected. */
  readonly correctedBy: IdentityRef;
  /** §30-attributable reason (non-blank). */
  readonly reason: string;
  readonly changed: ReadonlyArray<string>;
}

/** THE attribution record: versioned, tenant-scoped, append-only. */
export interface AttributionRecord {
  readonly id: AttributionId;
  readonly tenantId: TenantId;
  readonly tenantScope: TenantScope;
  readonly version: number;
  /** The cited social observation (the authority's own id, by reference). */
  readonly socialObservationRef: SocialObservationRef;
  /** The cited commerce discovery candidate at an EXACT version. */
  readonly commerceCandidate: {
    readonly discoveryId: CommerceDiscoveryId;
    readonly version: number;
  };
  readonly basis: AttributionBasis;
  /** §30 actor who declared the attribution. */
  readonly declaredBy: IdentityRef;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly corrections: readonly AttributionCorrection[];
}

/** Closed failure vocabulary (frozen below). */
export const ATTRIBUTION_ERROR_CODES = Object.freeze([
  "INVALID_TENANT",
  "INVALID_SOCIAL_REF",
  "INVALID_CANDIDATE_REF",
  "INVALID_BASIS",
  "CAUSALITY_VOCABULARY_DETECTED",
  "DUPLICATE_ID",
  "NOT_FOUND",
] as const);

export type AttributionErrorCode = (typeof ATTRIBUTION_ERROR_CODES)[number];

/** Fail-closed typed error. */
export interface AttributionError {
  readonly code: AttributionErrorCode;
  readonly message: string;
}
