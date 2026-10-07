/**
 * HealthSurfacePort (HEALTH-001) — the platform-health observation surface.
 *
 * OBSERVABLE-ONLY health (§3 authority discipline): the port RECORDS and
 * QUERIES health observations. It carries NO maneuver authority — no pause,
 * switch, throttle or remediation surface of any kind; compliant maneuvers
 * are decided and executed by the OWNING authorities (policy, production,
 * missions) consuming these records. Pinned structurally by
 * adapters/health-surface.test.ts.
 *
 * The confirmed-vs-suspected distinction is TYPED on the records
 * (`provider-confirmed-restriction` ≠ `suspected-distribution-anomaly`,
 * never conflated — test-pinned) and queryable through the `kind` filter
 * and the per-provider summary.
 *
 * Suspected anomalies are DERIVED records: `recordSuspectedAnomaly` accepts
 * ONLY derivations citing one of the DECLARED, DOCUMENTED rules
 * (HEALTH_DERIVATION_RULES) with the rule's required inputs — never
 * invented.
 *
 * 5 public methods (architecture policy budget: 12).
 */

import type { TenantScope } from "@mos/contracts";

import type {
  HealthObservation,
  HealthObservationFilter,
  HealthObservationId,
  ProviderHealthSummary,
  SuspectedAnomalyDerivation,
} from "../contracts/health-record.js";
import type { SocialRestrictionRecord } from "../contracts/social-record.js";
import type { ProviderId } from "@mos/contracts";

/** Input of {@link HealthSurfacePort.recordConfirmedRestriction}. */
export interface RecordConfirmedRestrictionInput {
  /**
   * The restriction observation the social adapter recorded through the
   * W6-C `listRestrictions` surface (provider-CONFIRMED input — this port
   * never fabricates a restriction).
   */
  readonly restriction: SocialRestrictionRecord;
}

/** Input of {@link HealthSurfacePort.recordSuspectedAnomaly}. */
export interface RecordSuspectedAnomalyInput {
  /** The DECLARED derivation the suspicion was computed from (never invented). */
  readonly derivation: SuspectedAnomalyDerivation;
  /** The provider the suspicion concerns. */
  readonly providerId: ProviderId;
  /** Honest source label (who ran the derivation). */
  readonly source: string;
}

/** Typed recording failures (enumerated; no silent partial records). */
export type HealthRecordFailure =
  | { readonly kind: "restriction-malformed"; readonly reasons: readonly string[] }
  | {
      readonly kind: "undeclared-derivation-rule";
      readonly ruleId: string;
      readonly declaredRuleIds: readonly string[];
    }
  | { readonly kind: "derivation-inputs-invalid"; readonly ruleId: string; readonly reasons: readonly string[] }
  | { readonly kind: "health-scope-mismatch"; readonly reason: string };

/** The outcome of one recording. */
export type HealthRecordOutcome =
  | { readonly ok: true; readonly observation: HealthObservation }
  | { readonly ok: false; readonly failure: HealthRecordFailure };

/** The platform-health observation surface. 5 public methods. */
export interface HealthSurfacePort {
  /**
   * Records one provider-CONFIRMED restriction as a health observation —
   * derived from the social adapter's restriction observation (what the
   * platform SAID, verbatim, with the record citation).
   */
  recordConfirmedRestriction(
    scope: TenantScope,
    input: RecordConfirmedRestrictionInput,
  ): HealthRecordOutcome;

  /**
   * Records one SUSPECTED distribution anomaly — a DERIVED record citing a
   * DECLARED documented derivation rule with its required inputs. Never
   * invented: an undeclared rule or malformed inputs are typed rejections.
   */
  recordSuspectedAnomaly(
    scope: TenantScope,
    input: RecordSuspectedAnomalyInput,
  ): HealthRecordOutcome;

  /** One health observation by exact id, or `undefined` when unknown/foreign-tenant. */
  getHealthObservation(scope: TenantScope, id: HealthObservationId): HealthObservation | undefined;

  /**
   * The tenant-scoped append-only health observation log (ascending record
   * order), filterable by provider, channel and the TYPED kind.
   */
  listHealthObservations(
    scope: TenantScope,
    filter?: HealthObservationFilter,
  ): readonly HealthObservation[];

  /**
   * The per-provider health summary: confirmed restrictions and suspected
   * anomalies counted SEPARATELY per provider (the typed distinction is
   * never conflated into a single score).
   */
  summarizeHealth(
    scope: TenantScope,
    filter?: { readonly channelRef?: HealthObservationFilter["channelRef"] },
  ): readonly ProviderHealthSummary[];
}
