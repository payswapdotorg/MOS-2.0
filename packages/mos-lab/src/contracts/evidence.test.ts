import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  HistoricalObservation,
  ObservedMetric,
  PredictedMetric,
  SimulationPrediction,
} from './evidence.js';
import type {
  LabScenarioId,
  StrategyRef,
  TenantId,
  Timestamp,
  UncertaintySummary,
  Version,
} from '@mos/contracts';

const tenantId = (value: string): TenantId => value as TenantId;
const timestamp = (value: string): Timestamp => value as Timestamp;
const labScenarioId = (value: string): LabScenarioId => value as LabScenarioId;
const strategyRef = (value: string): StrategyRef => value as StrategyRef;
const observationId = (value: string) => value as import('./evidence.js').HistoricalObservationId;
const predictionId = (value: string) => value as import('./evidence.js').SimulationPredictionId;

test('HistoricalObservation is constructible with EXACTLY the evidence fields (counterfactual: false)', () => {
  const metrics: readonly ObservedMetric[] = [
    { metric: 'qualified-reach', value: 41_200, unit: 'people' },
    { metric: 'engagement-rate', value: 0.062, unit: 'ratio' },
  ];
  const observation: HistoricalObservation = {
    id: observationId('obs-1'),
    version: 1 as Version,
    tenantId: tenantId('tenant-a'),
    niche: 'sourdough-baking',
    platform: 'short-video',
    metrics,
    observedAt: timestamp('2026-06-10T00:00:00.000Z'),
    sourceRefs: ['src://platform/analytics/export-a'],
    regime: 'baseline',
    counterfactual: false,
  };

  assert.deepEqual(Object.keys(observation).sort(), [
    'counterfactual',
    'id',
    'metrics',
    'niche',
    'observedAt',
    'platform',
    'regime',
    'sourceRefs',
    'tenantId',
    'version',
  ]);
  // LOCK RULE 29 (runtime label pin): historical evidence is never counterfactual.
  assert.equal(observation.counterfactual, false);
});

test('SimulationPrediction is constructible with EXACTLY the prediction fields (counterfactual: true + disclosure)', () => {
  const metrics: readonly PredictedMetric[] = [
    {
      metric: 'qualified-reach',
      expectedValue: 1_204.4,
      interval: { lower: 1_059.9, upper: 1_348.9 },
      unit: 'people',
    },
  ];
  const uncertainty: UncertaintySummary = { level: 'moderate', note: 'synthetic response function output' };
  const prediction: SimulationPrediction = {
    id: predictionId('sim:world-1:1:strategy-alpha:42:0'),
    version: 1 as Version,
    tenantId: tenantId('tenant-a'),
    scenarioRef: labScenarioId('scenario-1'),
    worldModelVersion: 3 as Version,
    simulatorVersion: 1 as Version,
    strategyRef: strategyRef('strategy-alpha'),
    seed: 42,
    step: 0,
    metrics,
    predictedAt: timestamp('2026-06-15T00:00:00.000Z'),
    uncertainty,
    counterfactual: true,
    disclosure: 'synthetic-response-function',
  };

  assert.deepEqual(Object.keys(prediction).sort(), [
    'counterfactual',
    'disclosure',
    'id',
    'metrics',
    'predictedAt',
    'scenarioRef',
    'seed',
    'simulatorVersion',
    'step',
    'strategyRef',
    'tenantId',
    'uncertainty',
    'version',
    'worldModelVersion',
  ]);
  // LOCK RULE 29 (runtime label pin): simulator output is always counterfactual…
  assert.equal(prediction.counterfactual, true);
  // …and always carries the synthetic-response-function disclosure (never
  // claimed to be a real platform model).
  assert.equal(prediction.disclosure, 'synthetic-response-function');
});

test('PredictionInterval bounds the expected value (spec §22 envelope)', () => {
  const metric: PredictedMetric = {
    metric: 'engagements',
    expectedValue: 500,
    interval: { lower: 440, upper: 560 },
    unit: 'events',
  };
  assert.ok(metric.interval.lower < metric.expectedValue);
  assert.ok(metric.expectedValue < metric.interval.upper);
});
