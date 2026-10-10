/**
 * BRIDGE-003 evidence/measurement contracts — the versioned, tenant-scoped,
 * append-only EVIDENCE record family (§24 Evidence/Measurement segment).
 *
 * Evidence records are tied to REAL `@mos/distribution` observation
 * surfaces BY REFERENCE (the SOCIAL-001 platform-said observation log) plus
 * the DECLARED measurement window. v1 (`declared`) is the window
 * declaration minted with the experiment record; v2+ (`measured`) fold the
 * platform-said observations observed within the window, carrying the
 * platform's own reported payloads VERBATIM (MOS never invents, adjusts,
 * rounds or infers a single number — the SOCIAL-001 observation purity
 * discipline) with source attribution on every record.
 *
 * §20/§29 TYPE-LEVEL SEPARATION (the historical-fact discipline):
 * - `MeasuredExperimentEvidence.counterfactual` is the LITERAL `false` —
 *   measured evidence is real, never simulated;
 * - the lab candidate's counterfactual expectations (literal `true`) are
 *   structurally ineligible for every evidence slot (compile-pinned in
 *   type-pins.ts; the folding path re-validates at runtime);
 * - counterfactual/simulated values are NEVER stored as evidence — there
 *   is no field through which one could be expressed (the SOCIAL-001
 *   structural-purity precedent, pinned by exact-keyset tests).
 *
 * Uncertainty is carried per §22 on every measured record (plainly
 * derived, documented — no invented sophistication).
 */

import type { JsonObject, TenantId, Timestamp, UncertaintyLevel, Version } from "@mos/contracts";

import type { REAL_EXPERIMENT_BOUNDARY_STATEMENT } from "./experiment-boundary.js";
import type { ExperimentId } from "./ids.js";

// ---------------------------------------------------------------------------
// The platform-said observation citation (folded VERBATIM)
// ---------------------------------------------------------------------------

/**
 * ONE platform-said observation citation, carried VERBATIM from the REAL
 * `@mos/distribution` observation record: the metrics the platform
 * reported (`reported` — the platform's own payload, never adjusted), the
 * platform's own references, and the honest transport source label.
 */
export interface ExperimentObservationCitation {
  /** The REAL `SocialObservationRecord` id (the platform-said log record). */
  readonly observationId: string;
  /** The channel the observation was read through (REAL echo). */
  readonly channelRef: string;
  /** The platform identity (REAL echo). */
  readonly providerId: string;
  /** The platform post/account subject the observation reports on. */
  readonly subjectRef: string;
  /** The metrics THE PLATFORM REPORTED — verbatim payload, never invented. */
  readonly reported: JsonObject;
  /** When the platform says the data was observed (platform-reported timestamp). */
  readonly observedAt: Timestamp;
  /** When MOS recorded the observation (the distribution authority's stamp). */
  readonly recordedAt: Timestamp;
  /** The platform's own references for the reported data (platform-said). */
  readonly providerRefs: readonly string[];
  /** Honest transport source label (who reported the numbers). */
  readonly source: string;
}

// ---------------------------------------------------------------------------
// The §22 uncertainty declaration (plainly derived, documented)
// ---------------------------------------------------------------------------

/**
 * The §22 uncertainty declaration of one measured evidence record. The
 * level derivation (DECLARED v1 heuristic, documented, deterministic):
 * `high` when fewer than two observations folded; `moderate` when two to
 * four; `low` when five or more. No invented sophistication — the counts
 * ride alongside so every consumer can re-derive the level.
 */
export interface ExperimentEvidenceUncertainty {
  readonly level: UncertaintyLevel;
  /** How many platform-said observations were folded. */
  readonly observationCount: number;
  /** How many distinct platform providers the folded observations came from. */
  readonly distinctProviders: number;
  /** The frozen derivation statement (verbatim on every record). */
  readonly note: string;
}

/** The frozen §22 derivation statement carried on every measured record. */
export const EXPERIMENT_EVIDENCE_UNCERTAINTY_NOTE =
  "declared v1 heuristic: high when fewer than two platform-said observations folded, moderate when two to four, low when five or more — counts carried alongside for re-derivation (§22, no invented sophistication)" as const;

// ---------------------------------------------------------------------------
// The evidence record family (append-only version chain)
// ---------------------------------------------------------------------------

/**
 * v1 — the DECLARED measurement window record: the window, the platform
 * post subject measured, and the platform-confirmed publication citation
 * the measurement is tied to. A declaration carries NO metric values (the
 * experiments authority never fabricates measurements); measured values
 * arrive only with {@link MeasuredExperimentEvidence} successors.
 */
export interface DeclaredMeasurementWindowRecord {
  readonly id: ExperimentId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly kind: "declared-window";
  /** The declared measurement window (verbatim from the binding). */
  readonly window: { readonly windowStart: Timestamp; readonly windowEnd: Timestamp };
  /** The platform post subject the observations report on (REAL echo). */
  readonly subjectRef: string;
  /** The platform-confirmed publication the window measures (REAL citation). */
  readonly publicationRef: { readonly publicationId: string; readonly providerId: string };
  readonly declaredAt: Timestamp;
  /** The §24 boundary statement (verbatim, every record). */
  readonly boundaryStatement: typeof REAL_EXPERIMENT_BOUNDARY_STATEMENT;
  /** Deterministic digest of the frozen record payload. */
  readonly evidenceDigest: string;
}

/**
 * v2+ — the MEASURED evidence record: the platform-said observations whose
 * platform-reported `observedAt` fell within the declared window, folded
 * VERBATIM, with §22 uncertainty. LOCK RULE 29 PIN: measured evidence is
 * REAL (`counterfactual: false` literal) — the type is structurally
 * ineligible for any counterfactual/prediction slot.
 */
export interface MeasuredExperimentEvidence {
  readonly id: ExperimentId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly kind: "measured-evidence";
  readonly window: { readonly windowStart: Timestamp; readonly windowEnd: Timestamp };
  readonly subjectRef: string;
  readonly publicationRef: { readonly publicationId: string; readonly providerId: string };
  /** The folded platform-said observations (verbatim citations, in observedAt order). */
  readonly observations: readonly ExperimentObservationCitation[];
  /** The §22 uncertainty declaration (plainly derived). */
  readonly uncertainty: ExperimentEvidenceUncertainty;
  /** §22 carried: the platform-said uncertainty summary label of the folded set. */
  readonly measuredAt: Timestamp;
  /** LOCK RULE 29 PIN: measured platform-said evidence — never simulated. */
  readonly counterfactual: false;
  /** Honest evidence class label (the SOCIAL-001 platform-said discipline). */
  readonly evidenceKind: "platform-said-observation";
  readonly boundaryStatement: typeof REAL_EXPERIMENT_BOUNDARY_STATEMENT;
  readonly evidenceDigest: string;
}

/** ONE evidence record version — the append-only chain's member. */
export type ExperimentEvidenceRecord =
  | DeclaredMeasurementWindowRecord
  | MeasuredExperimentEvidence;

/** The citation of one evidence record version. */
export interface ExperimentEvidenceCitation {
  readonly evidenceId: ExperimentId;
  readonly version: number;
}
