/**
 * PROD-003 — structural/semantic validation of the resolved plan view.
 *
 * This is the port-boundary guard: runtime data is not trusted to match the types.
 * Unlabeled forecasts are REJECTED here (never labeled by the compiler — §25),
 * budgets and deadlines are checked against the clock, and every failure is a
 * named typed rejection.
 */
import type { MarketingPlanView } from './types.js';
import { ok, err } from './types.js';
import type { Result } from './types.js';
import type { CompilerRejection } from './rejections.js';
import { planShapeInvalid, planBudgetInvalid, planDeadlineInvalid, counterfactualLabelMissing } from './rejections.js';
import type { ClockPort } from './ports.js';
import { parseIso } from './dates.js';

export function validatePlanView(plan: MarketingPlanView, clock: ClockPort): Result<MarketingPlanView, CompilerRejection> {
  if (plan.planId === '') return err(planShapeInvalid('planId is empty'));
  if (!Number.isInteger(plan.version) || plan.version < 1) return err(planShapeInvalid('plan version must be a positive integer'));
  if (!Array.isArray(plan.platformChoices)) return err(planShapeInvalid('platformChoices is not an array'));
  if (!Array.isArray(plan.metrics)) return err(planShapeInvalid('metrics is not an array'));
  if (!Array.isArray(plan.deadlines)) return err(planShapeInvalid('deadlines is not an array'));
  if (!Array.isArray(plan.experimentRefs)) return err(planShapeInvalid('experimentRefs is not an array'));
  if (plan.missionSummary.trim() === '') return err(planShapeInvalid('missionSummary is empty'));
  if (plan.platformChoices.length === 0) return err(planShapeInvalid('plan declares no platform choices'));
  const platformIds = new Set<string>();
  for (const choice of plan.platformChoices) {
    if (choice.platformId === '' || platformIds.has(choice.platformId)) {
      return err(planShapeInvalid(`platform id empty or duplicated: ${choice.platformId}`));
    }
    platformIds.add(choice.platformId);
    if (!Array.isArray(choice.channels) || choice.channels.length === 0) return err(planShapeInvalid(`platform ${choice.platformId} declares no channels`));
    if (!Number.isFinite(choice.declaredProductionDays) || choice.declaredProductionDays < 0) return err(planShapeInvalid(`platform ${choice.platformId} declares invalid production days`));
    if (!Number.isFinite(choice.declaredCostPerAction) || choice.declaredCostPerAction < 0) return err(planShapeInvalid(`platform ${choice.platformId} declares invalid cost per action`));
    if (choice.citation.recordId === '') return err(planShapeInvalid(`platform ${choice.platformId} cites an empty intelligence record`));
  }
  if (plan.metrics.length === 0) return err(planShapeInvalid('plan declares no metrics'));
  for (const metric of plan.metrics) {
    if (!platformIds.has(metric.platformId)) return err(planShapeInvalid(`metric ${metric.metricId} references unknown platform ${metric.platformId}`));
    const opens = parseIso(metric.window.opensAt);
    const closes = parseIso(metric.window.closesAt);
    if (opens === undefined || closes === undefined || closes.getTime() <= opens.getTime()) {
      return err(planShapeInvalid(`metric ${metric.metricId} declares an invalid measurement window`));
    }
  }
  if (plan.experimentRefs.length === 0) return err(planShapeInvalid('plan cites no experiments — evidence linkage requires at least one'));
  const experimentIds = new Set<string>();
  for (const ref of plan.experimentRefs) {
    if (ref.experimentId === '' || experimentIds.has(ref.experimentId)) return err(planShapeInvalid(`experiment ref empty or duplicated: ${ref.experimentId}`));
    experimentIds.add(ref.experimentId);
  }
  if (plan.budget === null || typeof plan.budget !== 'object') return err(planBudgetInvalid('budget is missing'));
  if (!Number.isFinite(plan.budget.totalCeiling) || plan.budget.totalCeiling <= 0) return err(planBudgetInvalid('budget total ceiling must be a positive finite number'));
  if (plan.budget.currency === '') return err(planBudgetInvalid('budget currency is empty'));
  if (plan.delayPolicy !== undefined) {
    if (!Number.isFinite(plan.delayPolicy.perDayDelayCost) || plan.delayPolicy.perDayDelayCost < 0) return err(planBudgetInvalid('delay policy per-day cost must be a non-negative finite number'));
    if (plan.delayPolicy.currency !== plan.budget.currency) return err(planBudgetInvalid(`delay policy currency ${plan.delayPolicy.currency} does not match budget currency ${plan.budget.currency}`));
  }
  const now = clock.now().getTime();
  for (const deadline of plan.deadlines) {
    const due = parseIso(deadline.dueAt);
    if (due === undefined) return err(planDeadlineInvalid(`deadline ${deadline.deadlineId} dueAt is not a valid ISO-8601 date`));
    if (due.getTime() <= now) return err(planDeadlineInvalid(`deadline ${deadline.deadlineId} is not in the future relative to compile time`));
    if (deadline.scope === 'platform' && (deadline.platformId === undefined || !platformIds.has(deadline.platformId))) return err(planDeadlineInvalid(`platform deadline ${deadline.deadlineId} references an unknown platform`));
    if (deadline.scope === 'metric' && (deadline.metricId === undefined || !plan.metrics.some((m) => m.metricId === deadline.metricId))) return err(planDeadlineInvalid(`metric deadline ${deadline.deadlineId} references an unknown metric`));
  }
  for (const forecast of plan.counterfactualForecasts) {
    // The type brands the label, but runtime port data is untrusted: an unlabeled
    // forecast is REJECTED, never labeled here (§25 honesty law).
    if ((forecast as { label?: string }).label !== 'counterfactual') return err(counterfactualLabelMissing(forecast.forecastId));
    if (forecast.basis.recordId === '') return err(planShapeInvalid(`forecast ${forecast.forecastId} cites an empty intelligence record`));
  }
  return ok(plan);
}
