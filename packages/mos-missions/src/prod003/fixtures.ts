/**
 * PROD-003 test fixtures — a fully valid MarketingPlanView, port doubles for
 * every authority, and compiled-strategy/engine helpers. The doubles carry
 * the REAL port shapes (ports.ts); failures are values, never throws, except
 * where a test explicitly exercises the authority-fault path.
 */
import type {
  MarketingPlanView,
  CompileRequest,
  CompileOptions,
  CompiledStrategy,
  ProductIntelligenceCitation,
  ResolvedProductIntelligenceRecord,
  ExperimentRef,
  AgentsValidationReceipt,
} from '../strategy-compiler/types.js';
import type {
  RightsAuthorityPort,
  PlanAuthorityPort,
  IntelligenceCitationsPort,
  ExperimentsReadPort,
  AgentsAuthorityPort,
  ClockPort,
  RightsVerdict,
  PlanUnresolved,
  CitationsResolution,
  ExperimentsUnresolved,
  RealExperimentBindingView,
  AgentsRejection,
} from '../strategy-compiler/ports.js';
import { StrategyCompiler } from '../strategy-compiler/compile.js';
import { AutomationEngine } from '../marketing-automation/engine.js';
import type { AutomationRunState } from '../marketing-automation/types.js';

export const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
export const TENANT = 'acme-co';
export const PLAN_ID = 'plan-summer-launch';
export const PLAN_VERSION = 3;
export const RUN_ID = 'run-0001';
export const STRATEGY_ID = `prod003-strategy:${PLAN_ID}@v${PLAN_VERSION}`;

const fixedClock: ClockPort = { now: () => FIXED_NOW };

export function citation(recordId: string, recordVersion: number): ProductIntelligenceCitation {
  return { kind: 'product-intelligence-citation', recordId, recordVersion };
}

export function record(recordId: string, recordVersion: number, healthStatus: ResolvedProductIntelligenceRecord['healthStatus'] = 'provider-CONFIRMED'): ResolvedProductIntelligenceRecord {
  return { kind: 'product-intelligence-record', recordId, recordVersion, summary: `record ${recordId}@v${recordVersion}`, healthStatus };
}

export function makePlan(overrides: Partial<MarketingPlanView> = {}): MarketingPlanView {
  const base: MarketingPlanView = {
    kind: 'marketing-plan',
    planId: PLAN_ID,
    version: PLAN_VERSION,
    tenantId: TENANT,
    missionSummary: 'Summer launch: two-platform push with measured evidence',
    platformChoices: [
      {
        platformId: 'platform-video',
        role: 'primary',
        citation: citation('rec-1', 2),
        channels: ['main'],
        declaredProductionDays: 3,
        declaredCostPerAction: 60,
        modelPreference: 'glm-4.7',
      },
      {
        platformId: 'platform-newsletter',
        role: 'secondary',
        citation: citation('rec-2', 1),
        channels: ['digest', 'promo'],
        declaredProductionDays: 1,
        declaredCostPerAction: 25,
      },
    ],
    metrics: [
      { metricId: 'video-views', platformId: 'platform-video', target: 10_000, window: { opensAt: '2026-01-20T00:00:00.000Z', closesAt: '2026-01-27T00:00:00.000Z' } },
      { metricId: 'newsletter-ctr', platformId: 'platform-newsletter', target: 500, window: { opensAt: '2026-01-20T00:00:00.000Z', closesAt: '2026-01-27T00:00:00.000Z' } },
    ],
    experimentRefs: [{ kind: 'experiment-ref', experimentId: 'exp-41' }],
    counterfactualForecasts: [
      { label: 'counterfactual', forecastId: 'fc-1', metricId: 'video-views', scenario: 'no-launch', value: 0, basis: citation('rec-1', 2) },
    ],
    budget: { currency: 'USD', totalCeiling: 1000 },
    deadlines: [
      { deadlineId: 'mission-due', dueAt: '2030-01-15T00:00:00.000Z', scope: 'mission' },
      { deadlineId: 'video-due', dueAt: '2030-02-01T00:00:00.000Z', scope: 'platform', platformId: 'platform-video' },
    ],
    delayPolicy: { currency: 'USD', perDayDelayCost: 40, haltOnDeadlinePassed: true },
    modelPreferences: {
      controller: 'glm-4.7',
      critic: 'glm-4.7',
      analyst: 'glm-4.7',
      producer: 'glm-4.7',
      generalist: 'glm-4.7',
    },
  };
  return { ...base, ...overrides };
}

export interface CompilerDoubles {
  readonly rights: MutableRightsDouble;
  readonly plans: MutablePlansDouble;
  readonly intelligence: MutableIntelligenceDouble;
  readonly experiments: MutableExperimentsDouble;
  readonly agents: MutableAgentsDouble;
  readonly clock: ClockPort;
}

export class MutableRightsDouble implements RightsAuthorityPort {
  public verdict: RightsVerdict = { kind: 'allow' };
  public calls: string[] = [];
  async checkCompileRight(input: { tenantId: string; principal: string; planRef: unknown }): Promise<RightsVerdict> {
    this.calls.push(`checkCompileRight:${input.tenantId}`);
    return this.verdict;
  }
  async checkRunRight(input: { tenantId: string; principal: string; strategyId: string }): Promise<RightsVerdict> {
    this.calls.push(`checkRunRight:${input.tenantId}`);
    return this.verdict;
  }
}

export class MutablePlansDouble implements PlanAuthorityPort {
  public plan: MarketingPlanView | PlanUnresolved = makePlan();
  async resolveMarketingPlan(ref: { planId: string; version: number }, _tenantId: string): Promise<MarketingPlanView | PlanUnresolved> {
    if ('kind' in this.plan && this.plan.kind === 'marketing-plan') {
      if (this.plan.planId !== ref.planId || this.plan.version !== ref.version) {
        return { kind: 'plan-not-found', planId: ref.planId, version: ref.version };
      }
      return this.plan;
    }
    return this.plan;
  }
}

export class MutableIntelligenceDouble implements IntelligenceCitationsPort {
  public resolution: CitationsResolution = {
    kind: 'resolved',
    records: [record('rec-1', 2), record('rec-2', 1)],
  };
  async resolveProductIntelligenceCitations(_citations: readonly ProductIntelligenceCitation[], _tenantId: string): Promise<CitationsResolution> {
    return this.resolution;
  }
}

export class MutableExperimentsDouble implements ExperimentsReadPort {
  public outcomes: Readonly<Record<string, RealExperimentBindingView | ExperimentsUnresolved>> = {
    'exp-41': { kind: 'real-experiment-binding', experimentId: 'exp-41', bindingId: 'binding-41', tenantId: TENANT, status: 'active' },
  };
  async resolveExperimentBinding(ref: ExperimentRef, _tenantId: string): Promise<RealExperimentBindingView | ExperimentsUnresolved> {
    return this.outcomes[ref.experimentId] ?? { kind: 'experiment-not-found', experimentId: ref.experimentId };
  }
}

export class MutableAgentsDouble implements AgentsAuthorityPort {
  public receipt: AgentsValidationReceipt | AgentsRejection = { accepted: true, authorityRecord: 'agents-registry#validation-77' };
  async validateOrganization(_candidate: unknown): Promise<AgentsValidationReceipt | AgentsRejection> {
    return this.receipt;
  }
}

export function makeCompilerDoubles(): CompilerDoubles {
  return {
    rights: new MutableRightsDouble(),
    plans: new MutablePlansDouble(),
    intelligence: new MutableIntelligenceDouble(),
    experiments: new MutableExperimentsDouble(),
    agents: new MutableAgentsDouble(),
    clock: fixedClock,
  };
}

export function makeCompiler(doubles: CompilerDoubles = makeCompilerDoubles()): StrategyCompiler {
  return new StrategyCompiler({
    rights: doubles.rights,
    plans: doubles.plans,
    intelligence: doubles.intelligence,
    experiments: doubles.experiments,
    agents: doubles.agents,
    clock: doubles.clock,
  });
}

export function makeCompileRequest(overrides: Partial<CompileRequest> = {}): CompileRequest {
  return {
    planRef: { kind: 'marketing-plan', planId: PLAN_ID, version: PLAN_VERSION },
    tenantId: TENANT,
    principal: 'principal-alice',
    ...overrides,
  };
}

export async function compileSamplePlan(doubles: CompilerDoubles = makeCompilerDoubles(), options: CompileOptions = {}): Promise<{ doubles: CompilerDoubles; strategy: CompiledStrategy }> {
  const compiler = makeCompiler(doubles);
  const result = await compiler.compile(makeCompileRequest(), options);
  if (!result.ok) throw new Error(`fixture compile failed: ${JSON.stringify(result.rejection)}`);
  return { doubles, strategy: result.value };
}

export function makeEngine(doubles: CompilerDoubles = makeCompilerDoubles()): AutomationEngine {
  return new AutomationEngine({ rights: doubles.rights, experimentsRead: doubles.experiments, clock: doubles.clock });
}

export async function makeArmedRun(doubles: CompilerDoubles = makeCompilerDoubles()): Promise<{ doubles: CompilerDoubles; engine: AutomationEngine; strategy: CompiledStrategy; run: AutomationRunState }> {
  const { doubles: d, strategy } = await compileSamplePlan(doubles);
  const engine = makeEngine(d);
  const created = engine.createRun(strategy, { runId: RUN_ID, tenantId: TENANT });
  if (!created.ok) throw new Error(`fixture createRun failed: ${JSON.stringify(created.rejection)}`);
  const armed = await engine.arm(created.value, { principal: 'principal-alice' });
  if (!armed.ok) throw new Error(`fixture arm failed: ${JSON.stringify(armed.rejection)}`);
  return { doubles: d, engine, strategy, run: armed.value.state };
}

export { fixedClock };
