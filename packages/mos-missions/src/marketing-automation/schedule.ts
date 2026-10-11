/** PROD-003 — durable job spec construction (§26 long-running windows). */
import type { AutomationRunState, DurableJobSpec } from './types.js';
import type { MetricSpec } from '../strategy-compiler/types.js';
import type { ClockPort } from '../strategy-compiler/ports.js';
import { addDays } from '../strategy-compiler/dates.js';

export const PUBLISH_PHASE_PREFIX = 'publish:';
export const MEASURE_PHASE_PREFIX = 'measure:';

/** Publish windows open after the platform's declared produce+review chain. */
export function buildPublishJobSpecs(run: AutomationRunState, clock: ClockPort): readonly DurableJobSpec[] {
  return run.spec.publishWindows.map((w): DurableJobSpec => ({
    kind: 'automation-publish-window',
    runId: run.runId,
    tenantId: run.tenantId,
    phaseId: `${PUBLISH_PHASE_PREFIX}${w.platformId}`,
    scheduledFor: addDays(clock.now(), w.opensInDays).toISOString(),
    payload: {
      platformId: w.platformId,
      strategyId: run.strategyId,
      sourcePlan: `${run.strategySourcePlan.planId}@v${run.strategySourcePlan.version}`,
    },
  }));
}

/** Measure windows open at the plan-declared measurement window opensAt. */
export function buildMeasureJobSpec(run: AutomationRunState, metric: MetricSpec, clock: ClockPort): DurableJobSpec {
  const window = run.spec.metricWindows[metric.metricId];
  return {
    kind: 'automation-measure-window',
    runId: run.runId,
    tenantId: run.tenantId,
    phaseId: `${MEASURE_PHASE_PREFIX}${metric.metricId}`,
    scheduledFor: window?.opensAt ?? clock.now().toISOString(),
    payload: { metricId: metric.metricId, platformId: metric.platformId },
  };
}
