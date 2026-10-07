/**
 * Platform health observation contracts (HEALTH-001) — OBSERVABLE-ONLY
 * health.
 *
 * Acceptance (spec/mos-effective-backlog-v2.0.md): "observable-only health;
 * provider-confirmed restriction distinguished from
 * suspected_distribution_anomaly; compliant maneuvers only."
 *
 * Two TYPED observation kinds, never conflated (test-pinned):
 * - `provider-confirmed-restriction`: what a platform CONFIRMED through the
 *   social adapters' restriction observations (the W6-C `listRestrictions`
 *   surface) — recorded here as a health observation citing the exact
 *   restriction record;
 * - `suspected-distribution-anomaly`: a DERIVED suspicion — never invented.
 *   Every suspected anomaly cites one of the DECLARED, DOCUMENTED
 *   derivation rules (see HEALTH_DERIVATION_RULES) and carries the inputs
 *   the rule was computed from. The derivations are documented data, and a
 *   record whose derivation is not one of the declared rules is a typed
 *   rejection — there is no free-form anomaly surface.
 *
 * §3 authority discipline (observable-only): health records INFORM — they
 * carry NO maneuver authority. The `HealthSurfacePort` (see
 * ../ports/health-surface.port.ts) records and queries observations only;
 * any compliant maneuver (pause/switch/throttle of distribution) is decided
 * and executed by the OWNING authorities (policy, production, missions),
 * never by this surface. Test-pinned structurally.
 *
 * Tenant discipline (§31): observations are tenant-scoped; cross-tenant
 * reads are indistinguishable from unknown (no existence leaks).
 */

import type {
  AccountRef,
  PlatformHealthObservation,
  PlatformHealthObservationId,
  ProviderId,
  TenantScope,
  Timestamp,
} from "@mos/contracts";

import type { SocialChannelId, SocialObservationId, SocialRestrictionId } from "./ids.js";

/** Identifier of one recorded health observation. */
export type HealthObservationId = import("./ids.js").HealthObservationId;

// ---------------------------------------------------------------------------
// The typed distinction (never conflated)
// ---------------------------------------------------------------------------

/** The closed vocabulary of health observation kinds (HEALTH-001). */
export type HealthObservationKind =
  | "provider-confirmed-restriction"
  | "suspected-distribution-anomaly";

/** The closed vocabulary in declaration order (frozen). */
export const HEALTH_OBSERVATION_KINDS: readonly HealthObservationKind[] = Object.freeze([
  "provider-confirmed-restriction",
  "suspected-distribution-anomaly",
] as const);

// ---------------------------------------------------------------------------
// Provider-confirmed restrictions (from the W6-C list-restrictions surface)
// ---------------------------------------------------------------------------

/**
 * One provider-CONFIRMED restriction as a health observation: the platform
 * said it restricts something on the channel (the verbatim description),
 * and the observation cites the exact `SocialRestrictionRecord` the social
 * adapter recorded. An OBSERVATION of what the platform SAID — never a
 * rights grant, never a maneuver.
 */
export interface ProviderConfirmedRestrictionObservation {
  readonly kind: "provider-confirmed-restriction";
  readonly id: HealthObservationId;
  readonly scope: TenantScope;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** The channel the restriction was observed through. */
  readonly channelRef: SocialChannelId;
  /** The exact restriction observation record this cites (provenance). */
  readonly restrictionRef: SocialRestrictionId;
  /** When the platform says the restriction was observed (platform-reported). */
  readonly observedAt: Timestamp;
  /** What the platform says the restriction is (verbatim description, data). */
  readonly description: string;
  /** When MOS recorded this health observation (§30-observable). */
  readonly recordedAt: Timestamp;
  /** Honest source label (who reported the restriction). */
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Suspected anomalies (DERIVED records — declared documented derivations)
// ---------------------------------------------------------------------------

/** The closed vocabulary of DECLARED derivation rules for suspected anomalies. */
export type HealthDerivationRuleId = "observation-absence" | "metric-decline-window";

/**
 * The DECLARED, DOCUMENTED derivations (data): how a suspected
 * distribution_anomaly may be derived — never invented. Each rule states
 * its required inputs; a derivation citing anything else is a typed
 * rejection. The rule TEXT is the documentation carried on every derived
 * record (auditable, versioned by id).
 */
export const HEALTH_DERIVATION_RULES: Readonly<
  Record<HealthDerivationRuleId, { readonly documented: string }>
> = Object.freeze({
  "observation-absence": {
    documented:
      "No platform observations were recorded for the channel within the declared look-back window ending at the evaluation instant. Absence of platform-reported observations is a SUSPECTED distribution anomaly (the channel may be silently failing); it is never a provider-confirmed fact. Inputs: channelRef, windowMs (> 0), evaluatedAt, examinedObservationIds (the tenant's observation ids examined, possibly empty).",
  },
  "metric-decline-window": {
    documented:
      "A platform-reported metric declined monotonically across the declared number of consecutive observations within the window. A decline PATTERN is a SUSPECTED distribution anomaly inferred from platform-reported numbers; it is never a provider-confirmed fact. Inputs: channelRef, metricKey, observationIds (≥ 2 consecutive platform observations carrying the metric), evaluatedAt.",
  },
});

/** Inputs of the `observation-absence` derivation rule. */
export interface ObservationAbsenceDerivationInputs {
  readonly ruleId: "observation-absence";
  readonly channelRef: SocialChannelId;
  /** Declared look-back window in milliseconds (> 0). */
  readonly windowMs: number;
  /** The evaluation instant (window ends here). */
  readonly evaluatedAt: Timestamp;
  /** The tenant's observation ids examined inside the window (may be empty). */
  readonly examinedObservationIds: readonly SocialObservationId[];
}

/** Inputs of the `metric-decline-window` derivation rule. */
export interface MetricDeclineDerivationInputs {
  readonly ruleId: "metric-decline-window";
  readonly channelRef: SocialChannelId;
  /** The platform-reported metric key that declined (data). */
  readonly metricKey: string;
  /** The consecutive observation ids carrying the declining metric (≥ 2). */
  readonly observationIds: readonly SocialObservationId[];
  /** The evaluation instant. */
  readonly evaluatedAt: Timestamp;
}

/** One declared derivation with its rule-specific inputs. */
export type SuspectedAnomalyDerivation =
  | ObservationAbsenceDerivationInputs
  | MetricDeclineDerivationInputs;

/**
 * One SUSPECTED distribution anomaly — a DERIVED record: the declared
 * derivation rule (with its documented text carried verbatim) plus the
 * inputs the suspicion was computed from. Suspected, never confirmed; the
 * distinction from `provider-confirmed-restriction` is the TYPED kind.
 */
export interface SuspectedDistributionAnomalyObservation {
  readonly kind: "suspected-distribution-anomaly";
  readonly id: HealthObservationId;
  readonly scope: TenantScope;
  readonly providerId: ProviderId;
  readonly channelRef: SocialChannelId;
  /** The declared derivation (rule id + inputs + documented text). */
  readonly derivation: SuspectedAnomalyDerivation & { readonly documented: string };
  /** When the suspicion was evaluated (the derivation's evaluatedAt). */
  readonly suspectedAt: Timestamp;
  readonly recordedAt: Timestamp;
  /** Honest source label (who ran the derivation). */
  readonly source: string;
}

/** One health observation — the typed union (confirmed ≠ suspected, always). */
export type HealthObservation =
  | ProviderConfirmedRestrictionObservation
  | SuspectedDistributionAnomalyObservation;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Filter for the tenant-scoped health observation log (all fields optional). */
export interface HealthObservationFilter {
  readonly providerId?: ProviderId;
  readonly channelRef?: SocialChannelId;
  /** Only observations of this typed kind (the distinction is queryable). */
  readonly kind?: HealthObservationKind;
}

/**
 * The per-provider health summary: confirmed restrictions and suspected
 * anomalies counted SEPARATELY per provider (the typed distinction is
 * never conflated into one "health score").
 */
export interface ProviderHealthSummary {
  readonly providerId: ProviderId;
  readonly confirmedRestrictionCount: number;
  readonly suspectedAnomalyCount: number;
}

// ---------------------------------------------------------------------------
// The canonical PlatformHealthObservation projection
// ---------------------------------------------------------------------------

/**
 * Projects one provider-CONFIRMED restriction observation onto the canonical
 * `PlatformHealthObservation` core contract (W0 frozen required-field index —
 * pinned by test with `assertRequiredFields`).
 *
 * ONLY the confirmed restriction projects. A SUSPECTED distribution anomaly
 * is a DERIVED suspicion about MOS-side distribution, NOT an observed
 * platform health state — projecting it onto the canonical observed-health
 * record would conflate suspicion with observation (exactly what the
 * HEALTH-001 acceptance forbids). The distinction therefore holds through
 * the canonical surface too (compile-time: the parameter type accepts only
 * `ProviderConfirmedRestrictionObservation`).
 *
 * The projection is honest by construction:
 * - `healthState: "restricted"` — the platform CONFIRMED a restriction;
 * - `confidence: 1` — a first-party platform statement, not an inference;
 * - `uncertainty: { level: "low" }` — the restriction statement is directly
 *   observed (the platform said it; the W6-C record cites it verbatim);
 * - `maneuvers: []` — the health surface applies/declares NO maneuver
 *   (observable-only, §3): compliant maneuvers are decided and executed by
 *   the OWNING authorities consuming these records;
 * - `accountRef` is CALLER-SUPPLIED (the channel's declared external
 *   account boundary — never invented by this projection).
 */
export function platformHealthProjectionOf(input: {
  readonly observation: ProviderConfirmedRestrictionObservation;
  /** The channel's declared account boundary at the platform (caller-supplied). */
  readonly accountRef: AccountRef;
}): PlatformHealthObservation {
  return Object.freeze({
    // The documented brand-bridge cast point (the W2-C precedent): the
    // studio/distribution-local observation id is the canonical
    // PlatformHealthObservationId of the projected record.
    id: input.observation.id as unknown as PlatformHealthObservationId,
    accountRef: input.accountRef,
    provider: input.observation.providerId,
    observedAt: input.observation.observedAt,
    observableSignals: Object.freeze(["provider-confirmed-restriction"]),
    healthState: "restricted" as const,
    confidence: 1,
    uncertainty: Object.freeze({
      level: "low" as const,
      note: "provider-confirmed restriction statement (W6-C list-restrictions)",
    }),
    maneuvers: Object.freeze([]),
  });
}
