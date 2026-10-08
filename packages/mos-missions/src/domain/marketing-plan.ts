/**
 * Marketing-plan domain types (MARKETING-001, W12-A).
 *
 * A marketing plan is an EVIDENCE-LINKED planning artifact COMPOSED THROUGH
 * the mission authority: its mission linkage is a VERSIONED citation
 * (`MissionCitation` — exact `(missionId, recordVersion)` pair), never a
 * copy of mission state and never a parallel mission record. The planner
 * that produces these records (see ../ports/marketing-planner.port.ts) is
 * NOT a second Mission authority: it owns no mission lifecycle verb, it
 * reads missions through an injected read view, and every plan element
 * cites its evidence through the product-intelligence authority's
 * versioned citations (§25: product intelligence INFORMS planning — the
 * plan is where the informing lands, in the missions lane the registry
 * assigns this planner to).
 *
 * Health-respect (HEALTH-001 consumption): a plan element whose platform
 * is under a provider-CONFIRMED restriction either acknowledges that
 * restriction (a snapshot of the ACTUAL health observation, carried by
 * value) or the composition fails closed with the typed reason; SUSPECTED
 * distribution anomalies are snapshotted as advisory data and are NEVER
 * treated as confirmed (the typed distinction is preserved through the
 * literal pins below).
 *
 * Records are versioned, tenant-scoped, append-only, digest-sealed
 * snapshots: every mutation (a revision) appends a NEW record version;
 * prior versions stay retrievable and are never rewritten.
 */

import type {
  Branded,
  IdentityRef,
  ProviderId,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type { ProductIntelligenceVersionRef } from '@mos/product-intelligence';
import type { MissionId, MissionStatus, RewardMetricId } from './mission.js';

/**
 * Identifier of one marketing-plan record chain — the plan's STABLE
 * identity across its append-only version chain (unique within its
 * tenant; caller-chosen, like `MissionId`).
 */
export type MarketingPlanId = Branded<string, 'MarketingPlanId'>;

/** Identifier of one §30 composition-attempt record (adapter-allocated). */
export type MarketingCompositionId = Branded<string, 'MarketingCompositionId'>;

/**
 * THE mission linkage: a VERSIONED citation of the exact mission record
 * the plan serves. Never "whatever is latest" — the plan stays resolvable
 * against the mission authority's immutable version history, and the
 * mission authority (CORE-005) stays THE only authority over missions.
 */
export interface MissionCitation {
  readonly missionId: MissionId;
  /** The exact mission RECORD version cited (integer ≥ 1). */
  readonly recordVersion: number;
}

// ---------------------------------------------------------------------------
// Expectation basis — cited evidence vs counterfactual forecast (§25/§22)
// ---------------------------------------------------------------------------

/**
 * BASIS = cited evidence: the expectation is grounded in evidence observed
 * outside this plan. The literal `counterfactual: false` pin is part of the
 * contract (compile-time; re-validated at runtime for untyped callers).
 */
export interface CitedExpectationBasis {
  readonly basis: 'cited-evidence';
  readonly counterfactual: false;
  /** When the cited evidence was observed (ISO-8601, non-blank). */
  readonly observedAt: Timestamp;
}

/**
 * BASIS = counterfactual forecast: the expectation is a simulated or
 * forecast value. The literal `counterfactual: true` pin is REQUIRED —
 * §25: forecasts are explicitly counterfactual-labeled, never presented as
 * observed reality.
 */
export interface CounterfactualForecastBasis {
  readonly basis: 'counterfactual-forecast';
  readonly counterfactual: true;
  /** How the forecast was produced (non-blank method note — names the method, nothing more). */
  readonly methodNote: string;
}

/** The discriminated expectation-basis union. */
export type ExpectationBasis = CitedExpectationBasis | CounterfactualForecastBasis;

// ---------------------------------------------------------------------------
// Health snapshots (carried BY VALUE from the ACTUAL health observations)
// ---------------------------------------------------------------------------

/**
 * A snapshot of one provider-CONFIRMED restriction this plan element
 * acknowledges and stays compliant with — carried BY VALUE from the actual
 * `HealthObservation` the distribution health surface recorded (verbatim
 * data; the plan never authors a restriction). Distribution-local ref
 * brands are carried as plain strings, the `CommerceObservationCitation`
 * precedent for external data carried by value.
 */
export interface ConfirmedRestrictionSnapshot {
  /** The health observation's id (by value). */
  readonly observationId: string;
  readonly providerId: ProviderId;
  /** The channel the restriction was observed through (by value). */
  readonly channelRef: string;
  /** The exact restriction record cited (by value). */
  readonly restrictionRef: string;
  /** When the platform says the restriction was observed. */
  readonly observedAt: Timestamp;
  /** What the platform says the restriction is (verbatim description). */
  readonly description: string;
  /** Honest source label of the underlying observation. */
  readonly source: string;
  /** Literal pin: this plan element acknowledges and respects it. */
  readonly acknowledged: true;
}

/**
 * A snapshot of one SUSPECTED distribution anomaly observable on the
 * platform at composition time — advisory data ONLY: suspected anomalies
 * NEVER gate a plan and are NEVER treated as confirmed (HEALTH-001's typed
 * distinction, preserved through the literal pin).
 */
export interface SuspectedAnomalySnapshot {
  readonly observationId: string;
  readonly providerId: ProviderId;
  readonly channelRef: string;
  /** The DECLARED derivation rule id the suspicion was computed from (by value). */
  readonly derivationRuleId: string;
  /** When the suspicion was evaluated. */
  readonly suspectedAt: Timestamp;
  readonly source: string;
  /** Literal pin: suspected, never confirmed — never a compliance gate. */
  readonly suspectedNeverConfirmed: true;
}

// ---------------------------------------------------------------------------
// Plan elements (the evidence-linked platform/metric/experiment triad)
// ---------------------------------------------------------------------------

/** One platform choice as stored on the plan (post-validation shape). */
export interface PlannedPlatform {
  /** The platform (provider identity, data). */
  readonly platform: ProviderId;
  /** Why this platform serves the mission objective (non-blank). */
  readonly rationale: string;
  /** The product-intelligence versioned citations backing the choice. */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
  /** Confirmed restrictions acknowledged by this plan element (≥ 0). */
  readonly acknowledgedConfirmedRestrictions: readonly ConfirmedRestrictionSnapshot[];
  /** Suspected anomalies observable at composition time (advisory, ≥ 0). */
  readonly suspectedAnomaliesAtComposition: readonly SuspectedAnomalySnapshot[];
}

/** One metric expectation as stored on the plan (post-validation shape). */
export interface PlannedMetricExpectation {
  /** The mission reward vocabulary metric the expectation is expressed in. */
  readonly metric: RewardMetricId;
  /** The expected value as a string (preserves precision and units semantics). */
  readonly expectation: string;
  /** Unit of the expectation (e.g. `count`, `ratio`, `EUR`). */
  readonly unit: string;
  /** Cited evidence vs counterfactual forecast (§25 discipline). */
  readonly basis: ExpectationBasis;
  /** The product-intelligence versioned citations backing the expectation. */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
}

/** One experiment expectation as stored on the plan (post-validation shape). */
export interface PlannedExperimentExpectation {
  /** The question the experiment is expected to decide (non-blank). */
  readonly question: string;
  /** The declared success criterion (non-blank). */
  readonly successCriterion: string;
  /** The product-intelligence versioned citations backing the expectation. */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
}

// ---------------------------------------------------------------------------
// The stored record
// ---------------------------------------------------------------------------

/**
 * THE MARKETING-PLAN RECORD: versioned, tenant-scoped, append-only,
 * evidence-linked, health-respecting, mission-CITED (never mission-OWNED).
 *
 * APPEND-ONLY BY CONSTRUCTION: records chain per `(tenant, plan id)` and
 * the only write paths are compose (version 1) and revise (version
 * `supersedes.version + 1`); there is no update-or-delete surface. Stored
 * records are clone-then-deep-frozen snapshots, digest-sealed for
 * bit-for-bit verification through the planner port's integrity read.
 */
export interface MarketingPlanRecord {
  /** The plan chain's stable identity. */
  readonly id: MarketingPlanId;
  /** Monotonic chain version; starts at 1. */
  readonly version: Version;
  /** Owning tenant (§31 — the visibility boundary; exact-equality reads). */
  readonly tenantId: TenantId;
  /**
   * The record's OWN frozen copy of the caller's scope (W9-B D4: a
   * post-hoc mutation of the caller's scope cannot move the stored
   * record's tenant identity).
   */
  readonly scope: Readonly<TenantScope>;
  /** THE mission linkage — a versioned citation, never a mission copy. */
  readonly mission: MissionCitation;
  /** The cited mission version's status, honestly recorded at composition. */
  readonly missionStatusAtComposition: MissionStatus;
  /** How this plan serves the mission's declared objective (non-blank). */
  readonly objectiveAlignment: string;
  /** The evidence-linked platform choices (≥ 1, unique per platform). */
  readonly platforms: readonly PlannedPlatform[];
  /** The evidence-linked metric expectations (≥ 1, unique per metric). */
  readonly metricExpectations: readonly PlannedMetricExpectation[];
  /** The evidence-linked experiment expectations (≥ 1). */
  readonly experimentExpectations: readonly PlannedExperimentExpectation[];
  /** §30 actor — the identity principal that composed this version. */
  readonly composedBy: IdentityRef;
  /** ISO-8601 composition timestamp (injectable clock on the adapter). */
  readonly composedAt: Timestamp;
  /** The prior version this revision supersedes, or `null` on version 1. */
  readonly supersedes: { readonly planId: MarketingPlanId; readonly version: number } | null;
  /** Free-form composer note, or `null`. */
  readonly note: string | null;
  /**
   * Deterministic digest of the full record payload (canonical JSON +
   * FNV-1a — the LAB-017 bit-for-bit change detector, never a security
   * claim). Verified through the planner port's integrity read.
   */
  readonly recordDigest: string;
  /** Every record names itself a planning artifact (kind pin). */
  readonly planKind: 'marketing-mission-plan';
  /** The disclosure label (pinned vocabulary, pinned by tests). */
  readonly disclosure: 'evidence-linked-mission-cited-marketing-plan';
  /**
   * THE no-second-authority boundary statement — pinned verbatim on every
   * record (the authority-discipline battery asserts this exact text).
   */
  readonly boundaryStatement:
    | 'this plan cites its mission through the mission authority and creates no parallel mission record; platform and expectation evidence resolves through product-intelligence versioned citations; provider-confirmed restrictions are acknowledged from observable health records while suspected anomalies stay advisory, never confirmed (MARKETING-001; §25/§31)';
}

// ---------------------------------------------------------------------------
// The §30 composition-attempt record (observability on every attempt)
// ---------------------------------------------------------------------------

/** The typed failure carried on a rejected composition attempt. */
export interface MarketingPlanCompositionFailure {
  readonly error: string;
  readonly message: string;
}

/**
 * The immutable §30 record of ONE planner attempt (compose or revise —
 * success OR typed rejection; there is no unrecorded path). Operative §30
 * fields for a planning action: the attempt id, the actor, the artifact
 * refs (plan id + result version), the failure when rejected, the
 * provenance (adapter source label — a disclosed in-memory planner can
 * never masquerade as a production planner) and the tenant scope.
 */
export interface MarketingPlanCompositionRecord {
  readonly id: MarketingCompositionId;
  /** The record's OWN frozen copy of the caller's scope. */
  readonly scope: Readonly<TenantScope>;
  readonly planId: MarketingPlanId;
  readonly attempt: 'compose' | 'revise';
  readonly outcome: 'recorded' | 'rejected';
  /** The plan version produced, or `null` on rejection. */
  readonly resultVersion: number | null;
  /** The typed rejection, or `null` on success. */
  readonly failure: MarketingPlanCompositionFailure | null;
  /** The mission citation the attempt carried, or `null` when structurally absent. */
  readonly mission: MissionCitation | null;
  /** §30 actor. */
  readonly actor: IdentityRef;
  /** ISO-8601 attempt timestamp (injectable clock). */
  readonly at: Timestamp;
  /** Honest adapter self-label (provenance — never a production claim). */
  readonly adapterSource: string;
}
