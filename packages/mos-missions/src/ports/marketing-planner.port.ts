/**
 * THE MARKETING-PLANNER PORT (MARKETING-001, W12-A) — the mission-lane
 * planner that composes evidence-linked marketing plans THROUGH the
 * mission authority.
 *
 * NO SECOND MISSION AUTHORITY (backlog acceptance, pinned structurally +
 * by the authority battery): the port owns NO mission lifecycle verb — no
 * create/activate/complete/archive mission, no reward-spec surface. The
 * planner reads missions through an injected READ view
 * (`MarketingPlannerMissionSource` = `Pick<MissionRepository,
 * 'getMission'>`) and records its linkage as a VERSIONED citation on the
 * plan record. The mission authority (@mos/missions CORE-005) stays THE
 * authority over missions.
 *
 * CROSS-AUTHORITY SEAMS (hexagonal — the `Pick<Repository>` injection
 * pattern the repo already uses): `@mos/product-intelligence` and
 * `@mos/distribution` are imported TYPE-ONLY; runtime views are injected
 * by the composition root. The planner cites product-intelligence records
 * through the authority's fail-closed versioned-citation resolution, and
 * consumes distribution health observations (provider-CONFIRMED
 * restrictions vs SUSPECTED anomalies — the typed distinction) through
 * the health surface's tenant-scoped listing. No new module, registry
 * entry or registry dependency is introduced: the planner lives in the
 * missions module the registry assigns it to, and its sibling imports are
 * compile-time-only (disclosed devDependencies; zero runtime coupling).
 *
 * EIGHT methods ≤ the 12-method architecture policy budget. Write paths:
 * `composeMarketingPlan` (a new chain, version 1) and `reviseMarketingPlan`
 * (the next version of an existing chain — append-only, never a rewrite).
 *
 * Failure model: the result-union convention (`'error' in result`
 * discriminates; typed kebab-case codes, no thrown subclasses — the
 * `@mos/identity`/`@mos/missions` precedent). Reads use `null` /
 * empty-array misses so cross-tenant existence never leaks (§31).
 */

import type { IdentityRef, ProviderId, TenantScope, Version } from '@mos/contracts';
import type { HealthObservationId, HealthSurfacePort } from '@mos/distribution';
import type {
  ProductIntelligencePort,
  ProductIntelligenceVersionRef,
} from '@mos/product-intelligence';
import type {
  ExpectationBasis,
  MarketingPlanCompositionRecord,
  MarketingPlanId,
  MarketingPlanRecord,
  MissionCitation,
} from '../domain/marketing-plan.js';
import type { MissionRepository } from './mission-repository.js';
import type { RewardMetricId } from '../domain/mission.js';

// ---------------------------------------------------------------------------
// Injected cross-authority views (TYPE-ONLY imports; hexagonal seams)
// ---------------------------------------------------------------------------

/**
 * The mission READ view the planner consumes — exactly one method. The
 * planner cannot create, transition or re-spec a mission through this
 * view; the authority battery pins that a view with ONLY `getMission`
 * suffices and that no other mission method is ever called.
 */
export type MarketingPlannerMissionSource = Pick<MissionRepository, 'getMission'>;

/**
 * The product-intelligence view the planner consumes — the authority's
 * fail-closed versioned-citation resolution (§25: product intelligence
 * informs planning; an unresolvable citation is a typed error, never a
 * fabricated basis).
 */
export type MarketingPlannerIntelligenceSource = Pick<
  ProductIntelligencePort,
  'resolveProductIntelligenceCitations'
>;

/**
 * The distribution health view the planner consumes — the tenant-scoped
 * observation listing with its TYPED kind filter (provider-CONFIRMED
 * restrictions are listed apart from SUSPECTED anomalies; the planner
 * never conflates them).
 */
export type MarketingPlannerHealthSource = Pick<HealthSurfacePort, 'listHealthObservations'>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One platform choice proposed for the plan. */
export interface PlatformChoiceInput {
  /** The platform (provider identity, data — aligned with health observations). */
  readonly platform: ProviderId;
  /** Why this platform serves the mission objective (non-blank). */
  readonly rationale: string;
  /** Evidence citations backing the choice (≥ 1 — an evidence-less choice is an assertion). */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
  /**
   * The provider-CONFIRMED restriction observations this plan element
   * acknowledges and stays compliant with (health observation ids). Each
   * must resolve to an ACTUAL confirmed restriction of this provider in
   * this tenant scope — never fabricated compliance. EVERY confirmed
   * restriction currently observable on the platform must be acknowledged
   * here, or the composition fails closed with the typed reason
   * (the compliant-maneuver discipline: exclude the platform, or
   * acknowledge everything confirmed on it).
   */
  readonly acknowledgedRestrictions?: readonly HealthObservationId[];
}

/** One metric expectation proposed for the plan. */
export interface MetricExpectationInput {
  /** The mission reward vocabulary metric the expectation is expressed in. */
  readonly metric: RewardMetricId;
  /** The expected value as a string (non-blank; preserves precision). */
  readonly expectation: string;
  /** Unit of the expectation (non-blank). */
  readonly unit: string;
  /** Cited evidence vs counterfactual forecast — the §25 discipline. */
  readonly basis: ExpectationBasis;
  /** Evidence citations backing the expectation (≥ 1). */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
}

/** One experiment expectation proposed for the plan. */
export interface ExperimentExpectationInput {
  /** The question the experiment is expected to decide (non-blank). */
  readonly question: string;
  /** The declared success criterion (non-blank). */
  readonly successCriterion: string;
  /** Evidence citations backing the expectation (≥ 1). */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
}

/** Input of {@link MarketingPlannerPort.composeMarketingPlan}. */
export interface ComposeMarketingPlanInput {
  /** The tenant scope the plan is composed under (§31). */
  readonly scope: TenantScope;
  /** The plan chain id (caller-driven identifier allocation). */
  readonly id: MarketingPlanId;
  /** THE mission linkage — a versioned citation of the mission this plan serves. */
  readonly mission: MissionCitation;
  /** How this plan serves the mission's declared objective (non-blank). */
  readonly objectiveAlignment: string;
  /** The platform choices (≥ 1, unique per platform). */
  readonly platforms: readonly PlatformChoiceInput[];
  /** The metric expectations (≥ 1, unique per metric). */
  readonly metricExpectations: readonly MetricExpectationInput[];
  /** The experiment expectations (≥ 1). */
  readonly experimentExpectations: readonly ExperimentExpectationInput[];
  /** §30 actor — the identity principal composing the plan. */
  readonly composedBy: IdentityRef;
  /** Free-form composer note. */
  readonly note?: string | null;
}

/** Input of {@link MarketingPlannerPort.reviseMarketingPlan}. */
export interface ReviseMarketingPlanInput {
  /** The tenant scope the revision is composed under (§31). */
  readonly scope: TenantScope;
  /** The chain and exact record version this revision supersedes (must be the chain's latest). */
  readonly supersedes: { readonly planId: MarketingPlanId; readonly version: number };
  /** The mission linkage of the revised plan (versioned citation, re-validated). */
  readonly mission: MissionCitation;
  /** How the revised plan serves the mission's declared objective (non-blank). */
  readonly objectiveAlignment: string;
  /** The platform choices of the revised plan (≥ 1, unique per platform). */
  readonly platforms: readonly PlatformChoiceInput[];
  /** The metric expectations of the revised plan (≥ 1, unique per metric). */
  readonly metricExpectations: readonly MetricExpectationInput[];
  /** The experiment expectations of the revised plan (≥ 1). */
  readonly experimentExpectations: readonly ExperimentExpectationInput[];
  /** §30 actor — the identity principal revising the plan. */
  readonly revisedBy: IdentityRef;
  /** Free-form composer note. */
  readonly note?: string | null;
}

// ---------------------------------------------------------------------------
// Failures + integrity
// ---------------------------------------------------------------------------

/** Machine-readable failure codes (typed result union — never thrown). */
export type MarketingPlannerErrorCode =
  /** Structural faults: blank fields, missing element sets, duplicate platforms/metrics, malformed basis, non-finite numbers. */
  | 'invalid-input'
  /** Compose: a plan chain already exists under this id in this tenant scope. */
  | 'duplicate-marketing-plan'
  /** The mission citation does not resolve in this tenant scope (cross-tenant ≡ unknown — no existence leak). */
  | 'mission-citation-unresolvable'
  /** The cited mission version exists but its status is not plannable (completed/archived). */
  | 'mission-not-plannable'
  /** A product-intelligence evidence citation failed to resolve (the authority's typed cause is carried). */
  | 'evidence-citation-unresolvable'
  /** A cited-evidence metric expectation is backed only by counterfactual-forecast records — a fabricated evidence basis. */
  | 'basis-evidence-mismatch'
  /** An acknowledged restriction is not a provider-CONFIRMED restriction observation of this provider in this tenant. */
  | 'acknowledged-restriction-not-confirmed'
  /** A provider-CONFIRMED restriction on a chosen platform was not acknowledged — exclude the platform or acknowledge it (compliant maneuvers only). */
  | 'platform-under-confirmed-restriction'
  /** Revise: the plan chain does not exist in this tenant scope (cross-tenant ≡ unknown). */
  | 'marketing-plan-not-found'
  /** Revise: `supersedes.version` is not the chain's latest version (optimistic concurrency — never a silent overwrite). */
  | 'marketing-plan-version-conflict';

/** The underlying authority failure a propagated error carries, when applicable. */
export interface MarketingPlannerErrorCause {
  readonly error: string;
  readonly message: string;
}

/** Typed failure value (`'error' in result` discriminates). */
export interface MarketingPlannerError {
  readonly error: MarketingPlannerErrorCode;
  readonly message: string;
  /** The underlying authority's typed failure (citation resolution failures), when applicable. */
  readonly cause?: MarketingPlannerErrorCause;
}

/** The bit-for-bit integrity report of one stored plan version. */
export interface MarketingPlanIntegrityReport {
  readonly planId: MarketingPlanId;
  readonly version: Version;
  readonly status: 'intact' | 'tampered';
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

/** Filter for the §30 composition log (all fields optional). */
export interface MarketingCompositionFilter {
  /** Only attempts on this plan chain. */
  readonly planId?: MarketingPlanId;
  /** Only this attempt kind. */
  readonly attempt?: 'compose' | 'revise';
}

// ---------------------------------------------------------------------------
// THE PORT
// ---------------------------------------------------------------------------

/**
 * THE MARKETING-PLANNER PORT. Compose + revise (append-only writes through
 * the full fail-closed validation battery) + the reads (get / version
 * history / per-mission listing / tenant listing / integrity / the §30
 * composition log). Eight methods.
 */
export interface MarketingPlannerPort {
  /**
   * Compose a NEW marketing plan (chain version 1). Fail-closed battery:
   * structural validation → mission-citation resolution through the
   * injected mission read view (unknown version, or a non-plannable
   * status, rejects) → evidence-citation resolution through the injected
   * product-intelligence view (every citation must resolve — never a
   * fabricated basis) → basis coherence (a cited-evidence expectation
   * backed only by counterfactual-forecast records rejects) → the health
   * battery per platform (every acknowledged restriction must be an
   * ACTUAL confirmed restriction of that provider; every confirmed
   * restriction on that provider must be acknowledged). Nothing is
   * recorded on any failure except the §30 attempt record.
   */
  composeMarketingPlan(
    input: ComposeMarketingPlanInput,
  ): Promise<MarketingPlanRecord | MarketingPlannerError>;

  /**
   * Revise an existing plan — append the NEXT record version
   * (`supersedes.version + 1`) after the same fail-closed battery re-runs
   * against CURRENT evidence and health. The prior version stays
   * retrievable and bit-for-bit immutable (append-only; never a rewrite).
   * Fails with `marketing-plan-not-found` or `marketing-plan-version-conflict`
   * before any content validation when the chain/version does not line up.
   */
  reviseMarketingPlan(
    input: ReviseMarketingPlanInput,
  ): Promise<MarketingPlanRecord | MarketingPlannerError>;

  /**
   * Fetch one plan by chain id — the exact version when given, else the
   * chain's latest — or `null` when unknown in this tenant scope
   * (cross-tenant reads never leak existence).
   */
  getMarketingPlan(
    scope: TenantScope,
    id: MarketingPlanId,
    version?: number,
  ): Promise<MarketingPlanRecord | null>;

  /**
   * The full immutable version history of one plan chain, oldest first.
   * Empty array for an unknown chain in this tenant scope.
   */
  listMarketingPlanVersions(
    scope: TenantScope,
    id: MarketingPlanId,
  ): Promise<readonly MarketingPlanRecord[]>;

  /**
   * The LATEST version of every plan chain citing the given mission
   * (exact-tenant equality; deterministic `(planId)` order) — the
   * mission-linked view downstream surfaces (COMMERCE-001 discovery)
   * extend from.
   */
  listMarketingPlansForMission(
    scope: TenantScope,
    missionId: MissionCitation['missionId'],
  ): Promise<readonly MarketingPlanRecord[]>;

  /**
   * The LATEST version of every plan chain visible in a tenant scope
   * (exact-tenant equality; deterministic `planId` order).
   */
  listMarketingPlans(scope: TenantScope): Promise<readonly MarketingPlanRecord[]>;

  /**
   * Verify one plan version's bit-for-bit integrity (recomputed digest vs
   * the sealed digest): `intact` or `tampered` — or `null` when the plan
   * is unknown in this tenant scope.
   */
  verifyMarketingPlanIntegrity(
    scope: TenantScope,
    id: MarketingPlanId,
    version?: number,
  ): Promise<MarketingPlanIntegrityReport | null>;

  /**
   * The tenant-scoped append-only §30 composition log (ascending append
   * order): one record for EVERY attributable compose/revise attempt —
   * successes AND typed rejections (there is no unrecorded path).
   */
  listMarketingPlanCompositionRecords(
    scope: TenantScope,
    filter?: MarketingCompositionFilter,
  ): readonly MarketingPlanCompositionRecord[];
}

/** Convenience: the typed failure value builder (internal convention). */
export const marketingPlannerFailure = (
  error: MarketingPlannerError['error'],
  message: string,
  cause?: MarketingPlannerErrorCause,
): MarketingPlannerError => ({ error, message, ...(cause === undefined ? {} : { cause }) });
