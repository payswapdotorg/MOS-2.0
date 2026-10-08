/**
 * In-memory health surface (HEALTH-001) — the DISCLOSED DOUBLE of the
 * `HealthSurfacePort` adapter.
 *
 * What is REAL: the typed record vocabulary (the confirmed-vs-suspected
 * distinction), the fail-closed validation of restriction records and
 * derived anomalies (only DECLARED derivation rules with their required
 * inputs record — never invented), the append-only immutable log, and the
 * tenant-scoped read discipline (cross-tenant reads are indistinguishable
 * from unknown).
 *
 * What is doubled: the process-local log storage (durable health storage is
 * composition-root work behind the same port).
 *
 * OBSERVABLE-ONLY (§3): this adapter records and queries health
 * observations — it has NO maneuver surface. Pinned structurally by
 * health-surface.test.ts (vocabulary scan + type pins).
 */

import type { TenantScope, Timestamp } from "@mos/contracts";

import type {
  HealthObservation,
  HealthObservationFilter,
  HealthObservationId,
  MetricDeclineDerivationInputs,
  ObservationAbsenceDerivationInputs,
  ProviderHealthSummary,
  SuspectedAnomalyDerivation,
} from "../contracts/health-record.js";
import { HEALTH_DERIVATION_RULES } from "../contracts/health-record.js";
import type { SocialChannelId } from "../contracts/ids.js";
import type { SocialRestrictionRecord } from "../contracts/social-record.js";
import type {
  HealthRecordOutcome,
  HealthSurfacePort,
  RecordConfirmedRestrictionInput,
  RecordSuspectedAnomalyInput,
} from "../ports/health-surface.port.js";

/** Options for the in-memory health surface. */
export interface InMemoryHealthSurfaceOptions {
  /** Injectable clock for §30 `recordedAt` stamps (deterministic tests). */
  readonly now?: () => Timestamp;
  /** Injectable observation-id factory. */
  readonly idFactory?: () => HealthObservationId;
}

/** Creates the in-memory {@link HealthSurfacePort} double. */
export function createInMemoryHealthSurface(
  options: InMemoryHealthSurfaceOptions = {},
): HealthSurfacePort {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  let nextId = 0;
  const idFactory =
    options.idFactory ?? (() => `health-observation-${++nextId}` as HealthObservationId);
  /** tenantId → append-only health observation log. */
  const logs = new Map<string, HealthObservation[]>();

  function logOf(scope: TenantScope): readonly HealthObservation[] {
    return logs.get(String(scope.tenantId)) ?? [];
  }

  function append(scope: TenantScope, observation: HealthObservation): void {
    const key = String(scope.tenantId);
    const log = logs.get(key) ?? [];
    log.push(observation);
    logs.set(key, log);
  }

  /** Structural issues of a restriction record offered for confirmation. */
  function restrictionIssues(restriction: SocialRestrictionRecord): string[] {
    const reasons: string[] = [];
    if (typeof restriction?.id !== "string" || String(restriction.id).trim().length === 0) {
      reasons.push("restriction.id must be a non-blank string");
    }
    if (typeof restriction?.providerId !== "string" || String(restriction.providerId).trim().length === 0) {
      reasons.push("restriction.providerId must be a non-blank string");
    }
    if (typeof restriction?.channelRef !== "string" || String(restriction.channelRef).trim().length === 0) {
      reasons.push("restriction.channelRef must be a non-blank string");
    }
    if (typeof restriction?.description !== "string" || restriction.description.trim().length === 0) {
      reasons.push("restriction.description must be a non-blank string");
    }
    if (restriction?.observedAt === undefined) {
      reasons.push("restriction.observedAt must be present");
    }
    if (restriction?.scope?.tenantId === undefined) {
      reasons.push("restriction.scope must carry the tenant scope");
    }
    return reasons;
  }

  /** Structural issues of a derived-anomaly input, per the DECLARED rules. */
  function derivationIssues(input: RecordSuspectedAnomalyInput): string[] {
    const reasons: string[] = [];
    // The cast is the documented input-validation pattern: an untyped caller
    // value is read through the DECLARED shape; the rule-id discriminator is
    // additionally read through a LOOSE alias so the undeclared-rule branch
    // (a runtime value outside the two declared rule ids) never narrows away
    // the discriminator (the union exhausts over the declared ids only).
    const derivation = input?.derivation as SuspectedAnomalyDerivation | undefined;
    if (derivation === null || typeof derivation !== "object") {
      return ["derivation must be an object citing a declared rule"];
    }
    if (typeof input.providerId !== "string" || String(input.providerId).trim().length === 0) {
      reasons.push("providerId must be a non-blank string");
    }
    const looseRuleId = (derivation as { readonly ruleId?: unknown }).ruleId;
    const ruleIdText = typeof looseRuleId === "string" ? looseRuleId : "absent";
    if (ruleIdText === "observation-absence") {
      if (typeof (derivation as ObservationAbsenceDerivationInputs).channelRef !== "string" || String((derivation as ObservationAbsenceDerivationInputs).channelRef).trim().length === 0) {
        reasons.push("observation-absence requires a non-blank channelRef");
      }
      const windowMs = (derivation as ObservationAbsenceDerivationInputs).windowMs;
      if (typeof windowMs !== "number" || !Number.isFinite(windowMs) || windowMs <= 0) {
        reasons.push("observation-absence requires windowMs > 0");
      }
      if ((derivation as ObservationAbsenceDerivationInputs).evaluatedAt === undefined) {
        reasons.push("observation-absence requires evaluatedAt");
      }
      if (!Array.isArray((derivation as ObservationAbsenceDerivationInputs).examinedObservationIds)) {
        reasons.push("observation-absence requires an examinedObservationIds array");
      }
    } else if (ruleIdText === "metric-decline-window") {
      if (typeof (derivation as MetricDeclineDerivationInputs).channelRef !== "string" || String((derivation as MetricDeclineDerivationInputs).channelRef).trim().length === 0) {
        reasons.push("metric-decline-window requires a non-blank channelRef");
      }
      const metricKey = (derivation as MetricDeclineDerivationInputs).metricKey;
      if (typeof metricKey !== "string" || String(metricKey).trim().length === 0) {
        reasons.push("metric-decline-window requires a non-blank metricKey");
      }
      if (!Array.isArray((derivation as MetricDeclineDerivationInputs).observationIds) || (derivation as MetricDeclineDerivationInputs).observationIds.length < 2) {
        reasons.push("metric-decline-window requires ≥ 2 observationIds");
      }
      if ((derivation as MetricDeclineDerivationInputs).evaluatedAt === undefined) {
        reasons.push("metric-decline-window requires evaluatedAt");
      }
    } else {
      reasons.push(`derivation rule '${ruleIdText}' is not declared`);
    }
    return reasons;
  }

  return {
    recordConfirmedRestriction(scope, input: RecordConfirmedRestrictionInput): HealthRecordOutcome {
      const restriction = input?.restriction;
      const issues = restrictionIssues(restriction);
      if (issues.length > 0) {
        return { ok: false, failure: { kind: "restriction-malformed", reasons: issues } };
      }
      if (String(restriction?.scope?.tenantId) !== String(scope.tenantId)) {
        return {
          ok: false,
          failure: {
            kind: "health-scope-mismatch",
            reason: "the restriction observation belongs to another tenant scope (§31)",
          },
        };
      }
      const observation: HealthObservation = Object.freeze({
        kind: "provider-confirmed-restriction",
        id: idFactory(),
        // W9-B: the observation owns a frozen COPY of the caller's scope
        // (the caller's live object must not be able to rewrite the
        // stored record's tenant identity after the fact).
        scope: Object.freeze({ ...scope }),
        providerId: restriction?.providerId,
        channelRef: restriction?.channelRef,
        restrictionRef: restriction?.id,
        observedAt: restriction?.observedAt,
        description: restriction?.description,
        recordedAt: now(),
        source: restriction?.source ?? "social-adapter:list-restrictions",
      });
      append(scope, observation);
      return { ok: true, observation };
    },

    recordSuspectedAnomaly(scope, input: RecordSuspectedAnomalyInput): HealthRecordOutcome {
      const derivation = input?.derivation as
        | (SuspectedAnomalyDerivation & { readonly ruleId?: unknown })
        | undefined;
      const declaredRuleIds = Object.keys(HEALTH_DERIVATION_RULES);
      if (
        derivation === null ||
        typeof derivation !== "object" ||
        typeof derivation.ruleId !== "string" ||
        !(derivation.ruleId in HEALTH_DERIVATION_RULES)
      ) {
        return {
          ok: false,
          failure: {
            kind: "undeclared-derivation-rule",
            ruleId: String(derivation?.ruleId ?? "absent"),
            declaredRuleIds,
          },
        };
      }
      const issues = derivationIssues(input);
      if (issues.length > 0) {
        return { ok: false, failure: { kind: "derivation-inputs-invalid", ruleId: String(derivation.ruleId), reasons: issues } };
      }
      const documented = HEALTH_DERIVATION_RULES[derivation.ruleId as keyof typeof HEALTH_DERIVATION_RULES].documented;
      const derivationRecord = derivation as { readonly evaluatedAt?: Timestamp; readonly channelRef?: unknown };
      const suspectedAt = derivationRecord.evaluatedAt ?? now();
      const observation: HealthObservation = Object.freeze({
        kind: "suspected-distribution-anomaly",
        id: idFactory(),
        scope: Object.freeze({ ...scope }),
        providerId: input.providerId,
        channelRef: derivationRecord.channelRef as SocialChannelId,
        derivation: Object.freeze({
          ...(structuredClone(derivation as object)),
          documented: Object.freeze(documented),
        }) as SuspectedAnomalyDerivation & { readonly documented: string },
        suspectedAt,
        recordedAt: now(),
        source: input.source,
      });
      append(scope, observation);
      return { ok: true, observation };
    },

    getHealthObservation(scope, id) {
      return logOf(scope).find((observation) => String(observation.id) === String(id));
    },

    listHealthObservations(scope: TenantScope, filter?: HealthObservationFilter) {
      return logOf(scope).filter(
        (observation) =>
          (filter?.providerId === undefined || String(observation.providerId) === String(filter.providerId)) &&
          (filter?.channelRef === undefined || String(observation.channelRef) === String(filter.channelRef)) &&
          (filter?.kind === undefined || observation.kind === filter.kind),
      );
    },

    summarizeHealth(scope, filter) {
      const log = logOf(scope).filter(
        (observation) =>
          filter?.channelRef === undefined || String(observation.channelRef) === String(filter.channelRef),
      );
      const byProvider = new Map<string, {
        providerId: ProviderHealthSummary["providerId"];
        confirmedRestrictionCount: number;
        suspectedAnomalyCount: number;
      }>();
      for (const observation of log) {
        const key = String(observation.providerId);
        const current =
          byProvider.get(key) ?? { providerId: observation.providerId, confirmedRestrictionCount: 0, suspectedAnomalyCount: 0 };
        if (observation.kind === "provider-confirmed-restriction") {
          current.confirmedRestrictionCount += 1;
        } else {
          current.suspectedAnomalyCount += 1;
        }
        byProvider.set(key, current);
      }
      return [...byProvider.values()].map((summary) => Object.freeze(summary));
    },
  };
}
