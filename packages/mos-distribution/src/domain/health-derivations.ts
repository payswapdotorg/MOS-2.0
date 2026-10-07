/**
 * Declared health derivations (HEALTH-001) — the PURE functions that
 * compute SUSPECTED distribution anomalies from real observation logs.
 *
 * These implement exactly the DECLARED, DOCUMENTED derivation rules of
 * `HEALTH_DERIVATION_RULES` (contracts/health-record.ts): a suspected
 * anomaly is DERIVED from platform-reported observations — never invented.
 * Each function returns the derivation input (for
 * `HealthSurfacePort.recordSuspectedAnomaly`) or `null` when the rule's
 * condition does not hold (no suspicion — the honest negative).
 */

import type { ProviderId, Timestamp } from "@mos/contracts";

import type {
  MetricDeclineDerivationInputs,
  ObservationAbsenceDerivationInputs,
} from "../contracts/health-record.js";
import type { SocialObservationRecord } from "../contracts/social-record.js";
import type { SocialChannelId } from "../contracts/ids.js";

/** Parses an ISO stamp to epoch milliseconds (NaN-safe). */
function epochMs(stamp: string): number {
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * The `observation-absence` derivation: TRUE suspicion when NO platform
 * observations exist for the channel inside the look-back window ending at
 * `evaluatedAt`. Returns the derivation input, or `null` when at least one
 * in-window observation exists (no suspicion — never invented).
 */
export function deriveObservationAbsence(input: {
  readonly channelRef: SocialChannelId;
  readonly observations: readonly SocialObservationRecord[];
  readonly windowMs: number;
  readonly evaluatedAt: Timestamp;
}): ObservationAbsenceDerivationInputs | null {
  if (!Number.isFinite(input.windowMs) || input.windowMs <= 0) {
    throw new Error("deriveObservationAbsence requires windowMs > 0 (declared rule input)");
  }
  const evaluated = epochMs(String(input.evaluatedAt));
  const windowStart = evaluated - input.windowMs;
  const inWindow = input.observations.filter((observation) => {
    if (String(observation.channelRef) !== String(input.channelRef)) return false;
    const observed = epochMs(String(observation.observedAt));
    if (!Number.isFinite(observed) || !Number.isFinite(windowStart)) return false;
    return observed >= windowStart && observed <= evaluated;
  });
  if (inWindow.length > 0) {
    return null;
  }
  return {
    ruleId: "observation-absence",
    channelRef: input.channelRef,
    windowMs: input.windowMs,
    evaluatedAt: input.evaluatedAt,
    examinedObservationIds: inWindow.map((observation) => observation.id),
  };
}

/**
 * The `metric-decline-window` derivation: TRUE suspicion when the
 * platform-reported metric declines monotonically across ≥ 2 consecutive
 * observations of the channel (ascending `observedAt` order). Returns the
 * derivation input, or `null` when no such decline exists.
 */
export function deriveMetricDecline(input: {
  readonly channelRef: SocialChannelId;
  readonly metricKey: string;
  readonly observations: readonly SocialObservationRecord[];
  readonly evaluatedAt: Timestamp;
}): MetricDeclineDerivationInputs | null {
  const ordered = input.observations
    .filter((observation) => String(observation.channelRef) === String(input.channelRef))
    .slice()
    .sort((a, b) => epochMs(String(a.observedAt)) - epochMs(String(b.observedAt)));
  const withMetric = ordered.filter(
    (observation) =>
      typeof (observation.reported as Record<string, unknown> | null)?.[input.metricKey] ===
      "number",
  );
  if (withMetric.length < 2) {
    return null;
  }
  let declined = true;
  for (let index = 1; index < withMetric.length; index += 1) {
    const previousObservation = withMetric[index - 1];
    const currentObservation = withMetric[index];
    if (previousObservation === undefined || currentObservation === undefined) {
      declined = false;
      break;
    }
    const previous = (previousObservation.reported as Record<string, unknown>)[
      input.metricKey
    ] as number;
    const current = (currentObservation.reported as Record<string, unknown>)[input.metricKey] as number;
    if (!(current < previous)) {
      declined = false;
      break;
    }
  }
  if (!declined) {
    return null;
  }
  return {
    ruleId: "metric-decline-window",
    channelRef: input.channelRef,
    metricKey: input.metricKey,
    observationIds: withMetric.map((observation) => observation.id),
    evaluatedAt: input.evaluatedAt,
  };
}

/** The provider id of the observations examined (helper for callers). */
export function providerIdOf(observations: readonly SocialObservationRecord[]): ProviderId | null {
  const providerIds = new Set(observations.map((observation) => String(observation.providerId)));
  if (providerIds.size !== 1) {
    return null;
  }
  return observations[0]?.providerId ?? null;
}
