/**
 * PROD-002 — measurement (§22). Every metric estimate carries a declared
 * formula reference and an uncertainty interval — never a bare point; sample
 * sizes and observation windows are recorded; degradation/OOD flags ride
 * through from the underlying platform-said observations.
 */
import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';
import type { TenantId } from './ids.js';
import type { IntervalEstimate } from './metrics.js';
import { findFormula, normalMeanInterval, wilsonInterval } from './metrics.js';
import type { HealthRestriction, MeasureObservationPayload, ObservationSet, PlatformHealthObservationPayload, PlatformSaidObservation, SocialObservationPayload } from './observation-set.js';

declare const measuredOutcomeBrand: unique symbol;

/**
 * A measured outcome — constructible ONLY by this module. The channel is
 * 'measured' at the type level; the learning stage re-checks it at runtime
 * (§20/§24: simulated values never enter the measured channel).
 */
export interface MeasuredOutcome {
  readonly [measuredOutcomeBrand]: true;
  readonly channel: 'measured';
  readonly metricKey: string;
  readonly stratum?: HealthRestriction;
  readonly formulaRef: string;
  readonly estimate: IntervalEstimate;
  readonly sampleSize: number;
  readonly window: { readonly startsAt: string; readonly endsAt: string };
  readonly degradationFlag: boolean;
  readonly outOfDistributionFlag: boolean;
}

declare const measuredEvidenceBrand: unique symbol;

export interface MeasuredEvidence {
  readonly [measuredEvidenceBrand]: true;
  readonly evidenceId: string;
  readonly experimentId: string;
  readonly tenantId: TenantId;
  readonly computedAt: string;
  readonly observationSetDigest: string;
  readonly window: { readonly startsAt: string; readonly endsAt: string };
  readonly totalObservations: number;
  readonly outcomes: readonly MeasuredOutcome[];
}

export type MetricFamily = 'social' | 'measure' | 'platform-health';

/**
 * HEALTH-001 restriction spec for health metrics. 'pooled' is REPRESENTABLE
 * but always rejected at computation time — provider-CONFIRMED and SUSPECTED
 * are never conflated.
 */
export type HealthRestrictionSpec = 'provider-CONFIRMED' | 'SUSPECTED' | 'both-stratified' | 'pooled';

export interface MetricSpec {
  readonly metricKey: string;
  readonly formulaRef: string;
  readonly confidenceLevel: number;
  readonly family: MetricFamily;
  /** social/measure: match observations carrying this payload metric key. Absent: all of the family. */
  readonly metricKeyFilter?: string;
  /** platform-health: match observations carrying this provider. Absent: all providers. */
  readonly provider?: string;
  /** platform-health only. Default 'both-stratified'. */
  readonly restrictions?: HealthRestrictionSpec;
}

export interface ComputeEvidenceInput {
  readonly observationSet: ObservationSet;
  readonly specs: readonly MetricSpec[];
  readonly evidenceId: string;
  readonly computedAt: string;
}

export function computeEvidence(input: ComputeEvidenceInput): Result<MeasuredEvidence, Failure> {
  const set = input.observationSet;
  const outcomes: MeasuredOutcome[] = [];
  for (const spec of input.specs) {
    const formula = findFormula(spec.formulaRef);
    if (formula === null) {
      return err(failure('E_UNKNOWN_FORMULA', `metric '${spec.metricKey}' cites unknown formula '${spec.formulaRef}' — formulas are declared, never guessed`, { metricKey: spec.metricKey, formulaRef: spec.formulaRef }));
    }
    if (formula.family === 'health-incidence') {
      const metricOutcomes = computeHealthMetric(set, spec);
      if (!metricOutcomes.ok) {
        return metricOutcomes;
      }
      outcomes.push(...metricOutcomes.value);
    } else if (formula.family === 'proportion') {
      if (spec.family !== 'social') {
        return err(failure('E_METRIC_DATA_MISMATCH', `formula '${spec.formulaRef}' (proportion) requires family 'social' (spec declares '${spec.family}')`, { metricKey: spec.metricKey, formulaFamily: 'proportion', specFamily: spec.family }));
      }
      const matched = set.observations.filter(
        (observation) => observation.payload.family === 'social' && (spec.metricKeyFilter === undefined || observation.payload.metricKey === spec.metricKeyFilter),
      );
      if (matched.length === 0) {
        return err(failure('E_INSUFFICIENT_SAMPLE', `metric '${spec.metricKey}': zero platform-said social observations matched`, { metricKey: spec.metricKey, sampleSize: 0 }));
      }
      let trials = 0;
      let successes = 0;
      for (const observation of matched) {
        const payload = observation.payload as SocialObservationPayload;
        trials += payload.trials;
        successes += payload.successes;
      }
      const interval = wilsonInterval(successes, trials, spec.confidenceLevel);
      if (!interval.ok) {
        return interval;
      }
      outcomes.push(makeOutcome(spec, undefined, interval.value, trials, matched, set));
    } else {
      if (spec.family !== 'measure') {
        return err(failure('E_METRIC_DATA_MISMATCH', `formula '${spec.formulaRef}' (mean) requires family 'measure' (spec declares '${spec.family}')`, { metricKey: spec.metricKey, formulaFamily: 'mean', specFamily: spec.family }));
      }
      const matched = set.observations.filter(
        (observation) => observation.payload.family === 'measure' && (spec.metricKeyFilter === undefined || observation.payload.metricKey === spec.metricKeyFilter),
      );
      if (matched.length === 0) {
        return err(failure('E_INSUFFICIENT_SAMPLE', `metric '${spec.metricKey}': zero platform-said measure observations matched`, { metricKey: spec.metricKey, sampleSize: 0 }));
      }
      const values: number[] = [];
      for (const observation of matched) {
        values.push(...(observation.payload as MeasureObservationPayload).values);
      }
      const interval = normalMeanInterval(values, spec.confidenceLevel);
      if (!interval.ok) {
        return interval;
      }
      outcomes.push(makeOutcome(spec, undefined, interval.value, values.length, matched, set));
    }
  }
  if (outcomes.length === 0) {
    return err(failure('E_EVIDENCE_EMPTY', 'no measured outcomes could be computed from the observation set', { totalObservations: set.observations.length }));
  }
  const evidence: MeasuredEvidence = {
    evidenceId: input.evidenceId,
    experimentId: set.experimentId,
    tenantId: set.tenantId,
    computedAt: input.computedAt,
    observationSetDigest: set.digest,
    window: { startsAt: set.window.startsAt, endsAt: set.window.endsAt },
    totalObservations: set.observations.length,
    outcomes,
  } as unknown as MeasuredEvidence;
  return ok(evidence);
}

function computeHealthMetric(set: ObservationSet, spec: MetricSpec): Result<MeasuredOutcome[], Failure> {
  if (spec.family !== 'platform-health') {
    return err(failure('E_METRIC_DATA_MISMATCH', `formula '${spec.formulaRef}' (health-incidence) requires family 'platform-health' (spec declares '${spec.family}')`, { metricKey: spec.metricKey, formulaFamily: 'health-incidence', specFamily: spec.family }));
  }
  const restrictionSpec = spec.restrictions ?? 'both-stratified';
  if (restrictionSpec === 'pooled') {
    return err(failure(
      'E_RESTRICTION_CONFLATION_FORBIDDEN',
      `metric '${spec.metricKey}' requests POOLED health incidence — provider-CONFIRMED and SUSPECTED are never conflated (HEALTH-001); stratify instead`,
      { metricKey: spec.metricKey, requested: 'pooled' },
    ));
  }
  const strata: HealthRestriction[] = restrictionSpec === 'both-stratified' ? ['provider-CONFIRMED', 'SUSPECTED'] : [restrictionSpec];
  const out: MeasuredOutcome[] = [];
  for (const stratum of strata) {
    const matched = set.observations.filter(
      (observation) => observation.payload.family === 'platform-health' && observation.payload.restriction === stratum && (spec.provider === undefined || observation.payload.provider === spec.provider),
    );
    if (matched.length === 0) {
      return err(failure('E_INSUFFICIENT_SAMPLE', `metric '${spec.metricKey}': stratum '${stratum}' has zero platform-said health observations`, { metricKey: spec.metricKey, stratum, sampleSize: 0 }));
    }
    let nonHealthy = 0;
    for (const observation of matched) {
      if ((observation.payload as PlatformHealthObservationPayload).status !== 'healthy') {
        nonHealthy += 1;
      }
    }
    const interval = wilsonInterval(nonHealthy, matched.length, spec.confidenceLevel);
    if (!interval.ok) {
      return interval;
    }
    out.push(makeOutcome(spec, stratum, interval.value, matched.length, matched, set));
  }
  return ok(out);
}

function makeOutcome(
  spec: MetricSpec,
  stratum: HealthRestriction | undefined,
  estimate: IntervalEstimate,
  sampleSize: number,
  matched: readonly PlatformSaidObservation[],
  set: ObservationSet,
): MeasuredOutcome {
  const outcome = {
    channel: 'measured' as const,
    metricKey: spec.metricKey,
    formulaRef: spec.formulaRef,
    estimate,
    sampleSize,
    window: { startsAt: set.window.startsAt, endsAt: set.window.endsAt },
    degradationFlag: matched.some((observation) => observation.degradationFlag),
    outOfDistributionFlag: matched.some((observation) => observation.outOfDistributionFlag),
    ...(stratum !== undefined ? { stratum } : {}),
  };
  return outcome as MeasuredOutcome;
}
