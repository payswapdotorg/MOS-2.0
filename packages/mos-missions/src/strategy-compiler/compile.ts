/**
 * PROD-003 — the StrategyCompiler flow.
 *
 * Order of gates (deterministic, test-pinned):
 *   1. tenant-id grammar (§31)        5. experiment refs verified (BRIDGE-003)
 *   2. rights gate BEFORE anything (§27) 6. model assignment (never fabricated)
 *   3. REAL versioned plan resolution  7. phases + organization (§23)
 *   4. plan validation + intelligence  8. §18 EVD + reordering
 *      citations (§25) + health check  9. AGT-003 registry validation (verbatim rejections)
 *                                     10. §23 declared comparators
 *                                     11. AutomationRunSpec + artifact assembly
 */
import type { CompiledStrategy, CompileOptions, CompileRequest, ExpectedValueOfDelay, ProductIntelligenceCitation, Result, MarketingPlanView } from './types.js';
import type { CompilerRejection } from './rejections.js';
import { ok, err } from './types.js';
import type { RightsAuthorityPort, PlanAuthorityPort, IntelligenceCitationsPort, ExperimentsReadPort, AgentsAuthorityPort, ClockPort } from './ports.js';
import { describeExperimentsUnresolved } from './ports.js';
import { isValidTenantId, sameTenant } from './tenant.js';
import { tenantIdInvalid, compileRightsDenied, planRefUnresolved, planTenantMismatch, planShapeInvalid, intelligenceCitationUnresolved, intelligenceAuthorityUnavailable, platformHealthNotConfirmed, experimentRefUnresolved, organizationValidationRejected, compileAuthorityFault, describeFault } from './rejections.js';
import { validatePlanView } from './plan-validation.js';
import { deriveExecutionPhases, buildAutomationRunSpec } from './phases.js';
import { resolveModelAssignments, compileOrganization, withExecutionOrdering, DEFAULT_REVIEW_PHASE_DAYS } from './organization.js';
import { buildDeclaredComparators } from './comparators.js';
import { computeExpectedValueOfDelay } from './evd.js';

export interface StrategyCompilerDeps {
  readonly rights: RightsAuthorityPort;
  readonly plans: PlanAuthorityPort;
  readonly intelligence: IntelligenceCitationsPort;
  readonly experiments: ExperimentsReadPort;
  readonly agents: AgentsAuthorityPort;
  readonly clock: ClockPort;
}

export function strategyIdFor(planId: string, version: number): string {
  return `prod003-strategy:${planId}@v${version}`;
}

export class StrategyCompiler {
  constructor(private readonly deps: StrategyCompilerDeps) {}

  public async compile(request: CompileRequest, options: CompileOptions = {}): Promise<Result<CompiledStrategy, CompilerRejection>> {
    try {
      return await this.compileInner(request, options);
    } catch (fault) {
      return err(compileAuthorityFault(describeFault(fault)));
    }
  }

  private async compileInner(request: CompileRequest, options: CompileOptions): Promise<Result<CompiledStrategy, CompilerRejection>> {
    if (!isValidTenantId(request.tenantId)) return err(tenantIdInvalid(request.tenantId, 'compile request tenant id'));
    // 1 — rights gate precedes everything else (§27).
    const verdict = await this.deps.rights.checkCompileRight({ tenantId: request.tenantId, principal: request.principal, planRef: request.planRef });
    if (verdict.kind === 'deny') return err(compileRightsDenied(verdict.reason, verdict.attribution, verdict.authority));
    // 2 — resolve the REAL versioned plan (criterion 2: never fabrication).
    const resolved = await this.deps.plans.resolveMarketingPlan(request.planRef, request.tenantId);
    if (resolved.kind === 'plan-not-found') return err(planRefUnresolved(resolved.planId, resolved.version));
    if (resolved.kind === 'plan-tenant-mismatch') return err(planTenantMismatch(resolved.planTenantId, resolved.requestedTenantId));
    if (resolved.kind === 'plan-shape-invalid') return err(planShapeInvalid(resolved.issue));
    const plan: MarketingPlanView = resolved;
    // 3 — structural validation (labels, budgets, deadlines vs clock).
    const validated = validatePlanView(plan, this.deps.clock);
    if (!validated.ok) return err(validated.rejection);
    // 4 — consume product-intelligence via the established citation discipline (§25).
    const citations = collectCitations(plan);
    const resolution = await this.deps.intelligence.resolveProductIntelligenceCitations(citations, plan.tenantId);
    if (resolution.kind === 'unresolved') return err(intelligenceCitationUnresolved(resolution.recordId, resolution.issue));
    if (resolution.kind === 'authority-unavailable') return err(intelligenceAuthorityUnavailable(resolution.issue));
    const records = resolution.records;
    const byRecord = new Map(records.map((r) => [`${r.recordId}@v${r.recordVersion}`, r] as const));
    for (const choice of plan.platformChoices) {
      const record = byRecord.get(`${choice.citation.recordId}@v${choice.citation.recordVersion}`);
      if (record === undefined) return err(intelligenceCitationUnresolved(choice.citation.recordId, `platform ${choice.platformId} citation did not resolve to a record`));
      if (record.healthStatus !== 'provider-CONFIRMED') return err(platformHealthNotConfirmed(choice.platformId, record.healthStatus));
    }
    // 5 — verify experiment refs against the experiments authority (criterion 6).
    for (const ref of plan.experimentRefs) {
      const binding = await this.deps.experiments.resolveExperimentBinding(ref, plan.tenantId);
      if (binding.kind !== 'real-experiment-binding') return err(experimentRefUnresolved(ref.experimentId, describeExperimentsUnresolved(binding)));
      if (binding.tenantId !== '' && !sameTenant(binding.tenantId, plan.tenantId)) return err(experimentRefUnresolved(ref.experimentId, `binding tenant ${binding.tenantId} does not match plan tenant ${plan.tenantId}`));
    }
    // 6 — model assignment: plan-declared or caller default, never fabricated.
    const models = resolveModelAssignments(plan, options);
    if (!models.ok) return err(models.rejection);
    // 7 — phases + organization (§23, all eleven dimensions).
    const reviewDays = options.phaseDurations?.reviewDays ?? DEFAULT_REVIEW_PHASE_DAYS;
    const phases = deriveExecutionPhases(plan, reviewDays);
    const organization = compileOrganization(plan, phases, models.value, options, 'controller-star');
    if (!organization.ok) return err(organization.rejection);
    let candidate = organization.value;
    // 8 — §18 EVD where the plan declares deadlines / delay policies.
    let evd: ExpectedValueOfDelay | undefined;
    if (plan.deadlines.length > 0) {
      const computation = computeExpectedValueOfDelay(plan, phases, this.deps.clock.now());
      if (computation !== undefined) {
        candidate = withExecutionOrdering(candidate, computation.orderedPhases, 'evd-weighted', computation.evd.rationale);
        evd = computation.evd;
      }
    }
    // 9 — AGT-003 registry validation; rejection names carried verbatim.
    const validation = await this.deps.agents.validateOrganization(candidate);
    if (!validation.accepted) return err(organizationValidationRejected(validation.rejectionName, validation.detail, validation.authorityRecord));
    // 10 — §23 always-compare comparators, declared only.
    const comparators = buildDeclaredComparators(plan, phases, models.value, options);
    if (!comparators.ok) return err(comparators.rejection);
    // 11 — automation run spec + artifact assembly (exact source-plan citation).
    const runSpec = buildAutomationRunSpec(plan, candidate.executionOrdering.phases);
    const strategy: CompiledStrategy = {
      strategyId: strategyIdFor(plan.planId, plan.version),
      kind: 'compiled-strategy',
      tenantId: plan.tenantId,
      sourcePlan: { kind: 'marketing-plan', planId: plan.planId, version: plan.version },
      missionSummary: plan.missionSummary,
      organization: candidate,
      organizationValidation: { accepted: true, authorityRecord: validation.authorityRecord },
      comparators: comparators.value,
      ...(evd !== undefined ? { expectedValueOfDelay: evd } : {}),
      forecasts: plan.counterfactualForecasts,
      intelligenceProvenance: records,
      experimentRefs: plan.experimentRefs,
      metrics: plan.metrics,
      automationRunSpec: runSpec,
      lifecycle: 'compiled',
      compiledAt: this.deps.clock.now().toISOString(),
    };
    return ok(strategy);
  }
}

function collectCitations(plan: MarketingPlanView): readonly ProductIntelligenceCitation[] {
  const seen = new Set<string>();
  const out: ProductIntelligenceCitation[] = [];
  const push = (citation: ProductIntelligenceCitation): void => {
    const key = `${citation.recordId}@v${citation.recordVersion}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(citation);
  };
  for (const choice of plan.platformChoices) push(choice.citation);
  for (const forecast of plan.counterfactualForecasts) push(forecast.basis);
  return out;
}
