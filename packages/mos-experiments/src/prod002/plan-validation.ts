/**
 * PROD-002 — experiment-plan validation (split from engine.ts; pure code
 * motion). Formula EXISTENCE is deliberately deferred to evidence time.
 */
import { err, failure, ok } from './errors.js';
import type { Failure, Result } from './errors.js';
import { isIsoTimestamp, isPlainRecord } from './util.js';
import type { MetricSpec } from './evidence.js';
import { extractCitedPrediction } from './upstream.js';
import type { CitedPrediction } from './upstream.js';
import type { ExperimentPlan } from './engine-types.js';

/**
 * Validate an experiment plan (criterion 2): every §24 citation field present,
 * the collection window well-formed, the Lab candidate extraction performed
 * upstream-side. All breaches are E_PLAN_INVALID with precise field paths.
 * Formula EXISTENCE is deliberately deferred to evidence time (E_UNKNOWN_FORMULA).
 */
export function validateExperimentPlan(plan: unknown): Result<ExperimentPlan, Failure> {
  if (!isPlainRecord(plan)) {
    return err(failure('E_PLAN_INVALID', 'plan must be a record', { field: 'plan' }));
  }
  const hypothesis = plan['hypothesis'];
  if (typeof hypothesis !== 'string' || hypothesis.length === 0) {
    return err(failure('E_PLAN_INVALID', 'plan.hypothesis must be a non-empty string', { field: 'hypothesis' }));
  }
  const missionRefRaw = plan['missionRef'];
  if (!isPlainRecord(missionRefRaw)) {
    return err(failure('E_PLAN_INVALID', 'plan.missionRef must be a record', { field: 'missionRef' }));
  }
  const missionId = missionRefRaw['missionId'];
  if (typeof missionId !== 'string' || missionId.length === 0) {
    return err(failure('E_PLAN_INVALID', 'plan.missionRef.missionId must be a non-empty string', { field: 'missionRef.missionId' }));
  }
  const productionRefRaw = plan['productionRequestRef'];
  if (!isPlainRecord(productionRefRaw)) {
    return err(failure('E_PLAN_INVALID', 'plan.productionRequestRef must be a record', { field: 'productionRequestRef' }));
  }
  const requestId = productionRefRaw['requestId'];
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return err(failure('E_PLAN_INVALID', 'plan.productionRequestRef.requestId must be a non-empty string', { field: 'productionRequestRef.requestId' }));
  }
  const distributionRefRaw = plan['distributionRef'];
  if (!isPlainRecord(distributionRefRaw)) {
    return err(failure('E_PLAN_INVALID', 'plan.distributionRef must be a record', { field: 'distributionRef' }));
  }
  const bindingId = distributionRefRaw['bindingId'];
  if (typeof bindingId !== 'string' || bindingId.length === 0) {
    return err(failure('E_PLAN_INVALID', 'plan.distributionRef.bindingId must be a non-empty string', { field: 'distributionRef.bindingId' }));
  }
  const metricsRaw = plan['metrics'];
  if (!Array.isArray(metricsRaw) || metricsRaw.length === 0) {
    return err(failure('E_PLAN_INVALID', 'plan.metrics must be a non-empty array', { field: 'metrics' }));
  }
  const metrics: MetricSpec[] = [];
  for (const entry of metricsRaw) {
    const metricOk = validateMetricSpec(entry);
    if (!metricOk.ok) {
      return metricOk;
    }
    metrics.push(metricOk.value);
  }
  const windowRaw = plan['collectionWindow'];
  if (!isPlainRecord(windowRaw)) {
    return err(failure('E_PLAN_INVALID', 'plan.collectionWindow must be a record', { field: 'collectionWindow' }));
  }
  const startsAt = windowRaw['startsAt'];
  if (!isIsoTimestamp(startsAt)) {
    return err(failure('E_PLAN_INVALID', 'plan.collectionWindow.startsAt must be an ISO-8601 timestamp', { field: 'collectionWindow.startsAt' }));
  }
  const endsAt = windowRaw['endsAt'];
  if (!isIsoTimestamp(endsAt)) {
    return err(failure('E_PLAN_INVALID', 'plan.collectionWindow.endsAt must be an ISO-8601 timestamp', { field: 'collectionWindow.endsAt' }));
  }
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    return err(failure('E_PLAN_INVALID', 'collectionWindow must open before it closes', { field: 'collectionWindow', startsAt, endsAt }));
  }
  const capRaw = windowRaw['maxObservations'];
  let maxObservations: number | null = null;
  if (capRaw !== undefined && capRaw !== null) {
    if (typeof capRaw !== 'number' || !Number.isInteger(capRaw) || capRaw < 1) {
      return err(failure('E_PLAN_INVALID', 'collectionWindow.maxObservations must be null or an integer >= 1', { field: 'collectionWindow.maxObservations' }));
    }
    maxObservations = capRaw;
  }
  const labCandidate = plan['labCandidate'];
  let prediction: CitedPrediction | null = null;
  if (labCandidate !== undefined && labCandidate !== null) {
    const extracted = extractCitedPrediction(labCandidate);
    if (!extracted.ok) {
      return extracted;
    }
    prediction = extracted.value;
  }
  return ok({
    hypothesis,
    missionRef: { missionId },
    productionRequestRef: { requestId },
    distributionRef: { bindingId },
    metrics,
    collectionWindow: { startsAt, endsAt, maxObservations },
    prediction,
  });
}

function validateMetricSpec(raw: unknown): Result<MetricSpec, Failure> {
  if (!isPlainRecord(raw)) {
    return err(failure('E_PLAN_INVALID', 'each metric must be a record', { field: 'metrics[]' }));
  }
  const metricKey = raw['metricKey'];
  if (typeof metricKey !== 'string' || metricKey.length === 0) {
    return err(failure('E_PLAN_INVALID', 'metrics[].metricKey must be a non-empty string', { field: 'metrics[].metricKey' }));
  }
  const formulaRef = raw['formulaRef'];
  if (typeof formulaRef !== 'string' || formulaRef.length === 0) {
    return err(failure('E_PLAN_INVALID', 'metrics[].formulaRef must be a non-empty string (existence is checked at evidence time)', { field: 'metrics[].formulaRef' }));
  }
  const confidenceLevel = raw['confidenceLevel'];
  if (typeof confidenceLevel !== 'number' || !Number.isFinite(confidenceLevel)) {
    return err(failure('E_PLAN_INVALID', 'metrics[].confidenceLevel must be a finite number', { field: 'metrics[].confidenceLevel' }));
  }
  const family = raw['family'];
  if (family !== 'social' && family !== 'measure' && family !== 'platform-health') {
    return err(failure('E_PLAN_INVALID', "metrics[].family must be 'social' | 'measure' | 'platform-health'", { field: 'metrics[].family' }));
  }
  const metricKeyFilter = raw['metricKeyFilter'];
  if (metricKeyFilter !== undefined && (typeof metricKeyFilter !== 'string' || metricKeyFilter.length === 0)) {
    return err(failure('E_PLAN_INVALID', 'metrics[].metricKeyFilter must be a non-empty string when present', { field: 'metrics[].metricKeyFilter' }));
  }
  const provider = raw['provider'];
  if (provider !== undefined && (typeof provider !== 'string' || provider.length === 0)) {
    return err(failure('E_PLAN_INVALID', 'metrics[].provider must be a non-empty string when present', { field: 'metrics[].provider' }));
  }
  const restrictions = raw['restrictions'];
  if (
    restrictions !== undefined &&
    restrictions !== 'provider-CONFIRMED' &&
    restrictions !== 'SUSPECTED' &&
    restrictions !== 'both-stratified' &&
    restrictions !== 'pooled'
  ) {
    return err(failure('E_PLAN_INVALID', "metrics[].restrictions must be one of 'provider-CONFIRMED' | 'SUSPECTED' | 'both-stratified' | 'pooled' ('pooled' is representable and always rejected at evidence time — HEALTH-001)", { field: 'metrics[].restrictions' }));
  }
  return ok({
    metricKey,
    formulaRef,
    confidenceLevel,
    family,
    ...(metricKeyFilter !== undefined ? { metricKeyFilter } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(restrictions !== undefined ? { restrictions } : {}),
  });
}
