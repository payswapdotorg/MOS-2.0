import type { MarketingRun, StrategyPlan } from '../../src/marketing-automation/types.js';

export const tenantId = 'tenant-001';
export const strategyId = 'strat-summer-launch';
export const runId = 'run-0001';

export function makePlan(overrides: Partial<StrategyPlan> = {}): StrategyPlan {
  return {
    planId: 'plan-summer',
    version: 3,
    strategyId,
    tenantId,
    compiledAt: '2025-06-01T00:00:00.000Z',
    phases: [
      {
        phaseId: 'phase-teaser',
        startsAt: '2025-06-10T09:00:00.000Z',
        endsAt: '2025-06-12T09:00:00.000Z',
        actions: [
          {
            actionId: 'act-teaser-x',
            platformId: 'platform-x',
            channel: 'social-post',
            audience: { segment: 'opted-in-beta' },
            contentRef: 'content://teaser/v2',
          },
        ],
      },
    ],
    ...overrides,
  } as StrategyPlan;
}

export function makeRun(overrides: Partial<MarketingRun> = {}): MarketingRun {
  return {
    runId,
    tenantId,
    strategyId,
    strategySourcePlan: { planId: 'plan-summer', version: 3 },
    lifecycle: 'armed',
    budgetLedgerId: 'ledger-001',
    budget: { allocatedMinor: 500_00, committedMinor: 0, currency: 'USD' },
    window: { opensAt: '2025-06-10T09:00:00.000Z', closesAt: '2025-06-12T09:00:00.000Z' },
    actions: [
      {
        actionId: 'act-teaser-x',
        platformId: 'platform-x',
        channel: 'social-post',
        status: 'pending',
      },
    ],
    trail: [],
    ...overrides,
  } as MarketingRun;
}
