/**
 * PROD-003 — experiment evidence submission (criterion 6, PROD-002 discipline):
 * run outcomes become experiment evidence, only from the measured state, with
 * comparators still declared and counterfactual labels intact.
 */
import type { AutomationRunState, ExperimentEvidenceSubmission, RunOutcome } from './types.js';
import type { Result } from '../strategy-compiler/types.js';
import { ok, err } from '../strategy-compiler/types.js';
import type { AutomationRejection } from './rejections.js';
import { illegalTransition, experimentBindingFailed, eventUnknownTarget } from './rejections.js';

export function buildEvidenceSubmission(run: AutomationRunState): Result<ExperimentEvidenceSubmission, AutomationRejection> {
  if (run.lifecycle !== 'measured') return err(illegalTransition(run.lifecycle, 'measured', 'evidence submission requires the measured state'));
  const binding = run.experimentBinding;
  if (binding === undefined) return err(experimentBindingFailed('(none)', 'no experiment binding on the run — refusing to fabricate one'));
  const outcomes: RunOutcome[] = [];
  for (const collected of run.collectedMetrics) {
    const metric = run.metrics.find((m) => m.metricId === collected.metricId);
    if (metric === undefined) return err(eventUnknownTarget(collected.metricId, 'collected metric absent from run metrics (invariant violation)'));
    const window = run.spec.metricWindows[collected.metricId];
    if (window === undefined) return err(eventUnknownTarget(collected.metricId, 'collected metric has no measurement window (invariant violation)'));
    outcomes.push({ metricId: collected.metricId, value: collected.value, target: metric.target, window, collectedAt: collected.collectedAt });
  }
  return ok({
    kind: 'automation-run-evidence',
    experimentId: binding.experimentId,
    bindingId: binding.bindingId,
    tenantId: run.tenantId,
    runId: run.runId,
    strategyId: run.strategyId,
    sourcePlan: run.strategySourcePlan,
    lifecycleAtSubmission: 'measured',
    comparatorStatus: 'declared',
    outcomes,
    counterfactualForecasts: run.forecasts,
  });
}
