/**
 * PROD-002 — learning (§2 loop closure). Measured outcomes publish learning
 * records carrying prediction errors — LAB-018's online-calibration inputs
 * enriched by real outcomes. The measured channel is guarded at the type
 * level AND re-checked at runtime: counterfactual/simulated values are
 * rejected with typed failures, never silently admitted (§20/§24).
 */
import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';
import type { TenantId } from './ids.js';
import type { HealthRestriction } from './observation-set.js';
import { computeFingerprint } from './util.js';
import type { IdGenerator } from './util.js';
import type { MeasuredEvidence, MeasuredOutcome } from './evidence.js';
import type { ResolvedChain } from './engine.js';
import type { CitedPrediction, PredictedPoint } from './upstream.js';

export interface PredictionErrorRecord {
  readonly metricKey: string;
  readonly stratum?: HealthRestriction;
  readonly predictedPoint: number;
  readonly predictedInterval: { readonly lower: number; readonly upper: number } | null;
  readonly measuredPoint: number;
  readonly measuredLower: number;
  readonly measuredUpper: number;
  readonly errorPoint: number;
  readonly absError: number;
  readonly formulaRef: string;
  readonly sampleSize: number;
}

export interface LearningRecord {
  readonly learningRecordId: string;
  readonly experimentId: string;
  readonly tenantId: TenantId;
  readonly channel: 'measured';
  readonly publishedAt: string;
  /** Verbatim — the Lab's prediction as cited (never reshaped). */
  readonly citedPrediction: CitedPrediction;
  /** Verbatim — the resolved §24 chain (end-to-end auditability). */
  readonly chain: ResolvedChain;
  readonly predictionErrors: readonly PredictionErrorRecord[];
  /** Verbatim measured outcomes — the Lab's calibration input. */
  readonly outcomes: readonly MeasuredOutcome[];
  readonly evidenceDigest: string;
  readonly degradationFlag: boolean;
  readonly outOfDistributionFlag: boolean;
}

export interface BuildLearningRecordInput {
  readonly experimentId: string;
  readonly tenantId: TenantId;
  readonly citedPrediction: CitedPrediction;
  readonly evidence: MeasuredEvidence;
  readonly chain: ResolvedChain;
  readonly publishedAt: string;
  readonly ids: IdGenerator;
}

export function buildLearningRecord(input: BuildLearningRecordInput): Result<LearningRecord, Failure> {
  // Measured-channel guard (§20/§24): the calibration loop consumes ONLY
  // measured outcomes. Branded types keep honest callers out; this runtime
  // guard catches deliberate casts (the pin tests prove it).
  for (const outcome of input.evidence.outcomes) {
    const channel = (outcome as { channel?: unknown }).channel;
    if (channel !== 'measured') {
      return err(failure(
        'E_LEARNING_COUNTERFACTUAL_REJECTED',
        `outcome '${outcome.metricKey}' carries channel ${JSON.stringify(channel)} — the learning channel consumes ONLY measured outcomes; simulated/counterfactual values never enter it (§20/§24)`,
        { metricKey: outcome.metricKey, channel: typeof channel === 'string' ? channel : null },
      ));
    }
  }
  const errors: PredictionErrorRecord[] = [];
  for (const outcome of input.evidence.outcomes) {
    const predicted = findPredictedPoint(input.citedPrediction, outcome.metricKey, outcome.stratum);
    if (predicted === null) {
      return err(failure(
        'E_LEARNING_MISSING_PREDICTION',
        `measured outcome '${outcome.metricKey}'${outcome.stratum !== undefined ? ` (stratum '${outcome.stratum}')` : ''} has no matching predicted point in the cited Lab candidate`,
        { metricKey: outcome.metricKey, stratum: outcome.stratum ?? null },
      ));
    }
    const predictedInterval =
      predicted.lower !== undefined && predicted.upper !== undefined ? { lower: predicted.lower, upper: predicted.upper } : null;
    const errorPoint = outcome.estimate.point - predicted.point;
    errors.push({
      metricKey: outcome.metricKey,
      ...(outcome.stratum !== undefined ? { stratum: outcome.stratum } : {}),
      predictedPoint: predicted.point,
      predictedInterval,
      measuredPoint: outcome.estimate.point,
      measuredLower: outcome.estimate.lower,
      measuredUpper: outcome.estimate.upper,
      errorPoint,
      absError: Math.abs(errorPoint),
      formulaRef: outcome.formulaRef,
      sampleSize: outcome.sampleSize,
    });
  }
  const evidenceDigest = computeFingerprint(input.evidence.outcomes);
  const record: LearningRecord = {
    learningRecordId: input.ids.nextId('learn'),
    experimentId: input.experimentId,
    tenantId: input.tenantId,
    channel: 'measured',
    publishedAt: input.publishedAt,
    citedPrediction: input.citedPrediction,
    chain: input.chain,
    predictionErrors: errors,
    outcomes: input.evidence.outcomes,
    evidenceDigest,
    degradationFlag: input.evidence.outcomes.some((outcome) => outcome.degradationFlag),
    outOfDistributionFlag: input.evidence.outcomes.some((outcome) => outcome.outOfDistributionFlag),
  };
  return ok(record);
}

function findPredictedPoint(prediction: CitedPrediction, metricKey: string, stratum: HealthRestriction | undefined): PredictedPoint | null {
  for (const point of prediction.points) {
    if (point.metricKey !== metricKey) continue;
    if ((point.stratum ?? undefined) !== (stratum ?? undefined)) continue;
    return point;
  }
  return null;
}
