/**
 * PROD-003 — execution phase derivation (§23 execution ordering) and the
 * AutomationRunSpec distilled from plan + phases for the durable surface.
 *
 * All durations are plan-declared (or the documented house review default);
 * measurement durations are the declared window lengths. Nothing is invented.
 */
import type { MarketingPlanView, ExecutionPhase, AutomationRunSpec, PlanDeadline } from './types.js';
import { daysBetween, parseIso } from './dates.js';

export function deriveExecutionPhases(plan: MarketingPlanView, reviewDays: number): readonly ExecutionPhase[] {
  const platformDeadline = (platformId: string): PlanDeadline | undefined =>
    plan.deadlines.find((d) => d.scope === 'platform' && d.platformId === platformId);
  const metricDeadline = (metricId: string): PlanDeadline | undefined =>
    plan.deadlines.find((d) => d.scope === 'metric' && d.metricId === metricId);
  const missionDeadline: PlanDeadline | undefined = plan.deadlines.find((d) => d.scope === 'mission');

  const phases: ExecutionPhase[] = [];
  for (const choice of plan.platformChoices) {
    const publishDeadline = platformDeadline(choice.platformId);
    const deadlineId = publishDeadline === undefined ? undefined : publishDeadline.deadlineId;
    phases.push({
      phaseId: `produce:${choice.platformId}`,
      kind: 'produce',
      roleId: `producer:${choice.platformId}`,
      platformId: choice.platformId,
      dependsOn: [],
      declaredDurationDays: choice.declaredProductionDays,
      deadlineId,
    });
    phases.push({
      phaseId: `review:${choice.platformId}`,
      kind: 'review',
      roleId: 'critic',
      platformId: choice.platformId,
      dependsOn: [`produce:${choice.platformId}`],
      declaredDurationDays: reviewDays,
    });
    phases.push({
      phaseId: `publish:${choice.platformId}`,
      kind: 'publish',
      roleId: `producer:${choice.platformId}`,
      platformId: choice.platformId,
      dependsOn: [`review:${choice.platformId}`],
      declaredDurationDays: 0,
      deadlineId,
    });
  }
  for (const metric of plan.metrics) {
    const opens = parseIso(metric.window.opensAt);
    const closes = parseIso(metric.window.closesAt);
    const windowDays = opens !== undefined && closes !== undefined ? Math.max(0, Math.ceil(daysBetween(opens, closes))) : 0;
    const metricDeadlineEntry = metricDeadline(metric.metricId);
    phases.push({
      phaseId: `measure:${metric.metricId}`,
      kind: 'measure',
      roleId: 'analyst',
      platformId: metric.platformId,
      metricId: metric.metricId,
      dependsOn: [`publish:${metric.platformId}`],
      declaredDurationDays: windowDays,
      deadlineId: metricDeadlineEntry === undefined ? undefined : metricDeadlineEntry.deadlineId,
    });
  }
  phases.push({
    phaseId: 'record-evidence',
    kind: 'record-evidence',
    roleId: 'analyst',
    dependsOn: plan.metrics.map((m) => `measure:${m.metricId}`),
    declaredDurationDays: 0,
    deadlineId: missionDeadline === undefined ? undefined : missionDeadline.deadlineId,
  });
  return phases;
}

export function buildAutomationRunSpec(plan: MarketingPlanView, phases: readonly ExecutionPhase[]): AutomationRunSpec {
  const perActionCosts: Record<string, number> = {};
  const platformChannels: Record<string, readonly string[]> = {};
  const publishWindows: { platformId: string; opensInDays: number }[] = [];
  for (const choice of plan.platformChoices) {
    perActionCosts[choice.platformId] = choice.declaredCostPerAction;
    platformChannels[choice.platformId] = [...choice.channels];
    const produce = phases.find((p) => p.phaseId === `produce:${choice.platformId}`);
    const review = phases.find((p) => p.phaseId === `review:${choice.platformId}`);
    publishWindows.push({
      platformId: choice.platformId,
      opensInDays: (produce?.declaredDurationDays ?? 0) + (review?.declaredDurationDays ?? 0),
    });
  }
  const metricWindows: Record<string, MarketingPlanView['metrics'][number]['window']> = {};
  for (const metric of plan.metrics) metricWindows[metric.metricId] = metric.window;
  return {
    budget: plan.budget,
    perActionCosts,
    platformChannels,
    metricWindows,
    missionDeadline: plan.deadlines.find((d) => d.scope === 'mission'),
    haltOnDeadlinePassed: plan.delayPolicy?.haltOnDeadlinePassed ?? false,
    publishWindows,
  };
}
