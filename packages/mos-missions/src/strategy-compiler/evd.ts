/**
 * PROD-003 — §18 Expected Value of Delay.
 *
 * Where the plan declares deadlines (and optionally a delay policy), EVD is
 * computed as a first-class strategy variable from DECLARED inputs only:
 * scheduled finish times come from plan-declared durations along the dependency
 * chain; delay cost is the plan-declared per-day cost. Produce/publish chains
 * are ordered earliest-deadline-first (duration then id as deterministic
 * tie-breaks). No estimated numbers are invented anywhere in this module.
 */
import type { MarketingPlanView, ExecutionPhase, ExpectedValueOfDelay, PhaseDeadlinePressure, PlanDeadline } from './types.js';
import { parseIso, daysBetween } from './dates.js';

export interface EvdComputation {
  readonly evd: ExpectedValueOfDelay;
  readonly orderedPhases: readonly ExecutionPhase[];
}

export function computeExpectedValueOfDelay(plan: MarketingPlanView, phases: readonly ExecutionPhase[], anchor: Date): EvdComputation | undefined {
  if (plan.deadlines.length === 0) return undefined;
  const perDayDelayCost = plan.delayPolicy?.perDayDelayCost ?? 0;
  const currency = plan.delayPolicy?.currency ?? plan.budget.currency;
  const deadlineById = new Map(plan.deadlines.map((d) => [d.deadlineId, d] as const));
  const priority = phasePriorityMs(phases, deadlineById);
  const ordered = orderPhases(phases, priority);
  const finishDay = new Map<string, number>();
  for (const phase of ordered) {
    const depFinish = phase.dependsOn.reduce((max, dep) => Math.max(max, finishDay.get(dep) ?? 0), 0);
    finishDay.set(phase.phaseId, depFinish + phase.declaredDurationDays);
  }
  const pressure: PhaseDeadlinePressure[] = [];
  let totalExpectedDelayCost = 0;
  for (const phase of ordered) {
    if (phase.deadlineId === undefined) continue;
    const deadline = deadlineById.get(phase.deadlineId);
    if (deadline === undefined) continue;
    const due = parseIso(deadline.dueAt);
    if (due === undefined) continue;
    const dueDay = daysBetween(anchor, due);
    const scheduledFinishDay = finishDay.get(phase.phaseId) ?? 0;
    const expectedDelayDays = Math.max(0, scheduledFinishDay - dueDay);
    const expectedDelayCost = expectedDelayDays * perDayDelayCost;
    totalExpectedDelayCost += expectedDelayCost;
    pressure.push({ phaseId: phase.phaseId, deadlineId: phase.deadlineId, dueAt: deadline.dueAt, declaredDurationDays: phase.declaredDurationDays, scheduledFinishDay, expectedDelayDays, expectedDelayCost });
  }
  const delayPolicyNote = plan.delayPolicy === undefined
    ? '(plan declared deadlines but no delay policy — cost defaults to 0 and currency follows the budget)'
    : '(plan-declared delay policy)';
  const rationale = `§18 Expected Value of Delay: produce/publish chains ordered earliest-deadline-first (declared duration, then phase id, as deterministic tie-breaks); delay cost ${perDayDelayCost} ${currency}/day ${delayPolicyNote}; every scheduled finish time is computed from plan-declared durations only — no estimated numbers are invented`;
  return { evd: { currency, perDayDelayCost, totalExpectedDelayCost, pressure, orderingBasis: 'evd-weighted', rationale }, orderedPhases: ordered };
}

/**
 * Scheduling priority per phase: its own deadline's due-time; and for produce
 * phases (which carry no completion deadline of their own) the platform's
 * publish deadline — the deadline of the chain the produce phase opens.
 */
function phasePriorityMs(phases: readonly ExecutionPhase[], deadlineById: ReadonlyMap<string, PlanDeadline>): Map<string, number> {
  const publishDueByPlatform = new Map<string, number>();
  for (const phase of phases) {
    if (phase.kind !== 'publish' || phase.deadlineId === undefined || phase.platformId === undefined) continue;
    const deadline = deadlineById.get(phase.deadlineId);
    const due = deadline === undefined ? undefined : parseIso(deadline.dueAt);
    if (due !== undefined) publishDueByPlatform.set(phase.platformId, due.getTime());
  }
  const out = new Map<string, number>();
  for (const phase of phases) {
    if (phase.deadlineId !== undefined) {
      const deadline = deadlineById.get(phase.deadlineId);
      const due = deadline === undefined ? undefined : parseIso(deadline.dueAt);
      if (due !== undefined) {
        out.set(phase.phaseId, due.getTime());
        continue;
      }
    }
    if (phase.kind === 'produce' && phase.platformId !== undefined) {
      const due = publishDueByPlatform.get(phase.platformId);
      if (due !== undefined) out.set(phase.phaseId, due);
    }
  }
  return out;
}

function orderPhases(phases: readonly ExecutionPhase[], priority: ReadonlyMap<string, number>): readonly ExecutionPhase[] {
  const byId = new Map(phases.map((p) => [p.phaseId, p] as const));
  const remaining = new Set(phases.map((p) => p.phaseId));
  const indegree = new Map<string, number>(phases.map((p) => [p.phaseId, p.dependsOn.length] as const));
  const ordered: ExecutionPhase[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .map((id) => byId.get(id))
      .filter((p): p is ExecutionPhase => p !== undefined)
      .sort((a, b) =>
        (priority.get(a.phaseId) ?? Number.POSITIVE_INFINITY) - (priority.get(b.phaseId) ?? Number.POSITIVE_INFINITY) ||
        a.declaredDurationDays - b.declaredDurationDays ||
        a.phaseId.localeCompare(b.phaseId));
    const pick = ready[0];
    if (pick === undefined) throw new Error('prod003 evd: cycle detected in execution phases');
    ordered.push(pick);
    remaining.delete(pick.phaseId);
    for (const id of remaining) {
      const phase = byId.get(id);
      if (phase !== undefined && phase.dependsOn.includes(pick.phaseId)) {
        indegree.set(id, (indegree.get(id) ?? 0) - 1);
      }
    }
  }
  return ordered;
}
