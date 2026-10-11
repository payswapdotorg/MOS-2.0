/**
 * PROD-003 — §23 always-compare discipline: the compiled strategy ALWAYS carries
 * a generalist single-agent baseline plus a hand-designed comparison, as DECLARED
 * comparators. They are metadata: never scored, never validated-as-claims, and
 * evaluation belongs to the experiments authority (§25).
 */
import type { MarketingPlanView, ExecutionPhase, CompiledOrganizationCandidate, DeclaredComparator, CompileOptions, AgentRoleSpec, ToolGrant, TerminationPolicy } from './types.js';
import { ok, err } from './types.js';
import type { Result } from './types.js';
import type { CompilerRejection } from './rejections.js';
import { compileOrganization, validateCandidateSelfConsistency, DEFAULT_MAX_STEPS, type ResolvedModels } from './organization.js';

export function buildGeneralistBaseline(plan: MarketingPlanView, phases: readonly ExecutionPhase[], models: ResolvedModels, options: CompileOptions): Result<CompiledOrganizationCandidate, CompilerRejection> {
  const role: AgentRoleSpec = {
    roleId: 'generalist',
    title: 'Generalist Single Agent (§23 baseline)',
    responsibilities: ['performs every mission task alone: production, review, publish, measurement, evidence'],
    modelId: models.generalist,
    memoryScopes: ['generalist-working-memory'],
  };
  const toolAllocation: ToolGrant[] = [];
  for (const choice of plan.platformChoices) {
    toolAllocation.push({ toolId: `distribution-binding:${choice.platformId}`, grantedToRoleId: 'generalist', scope: choice.platformId, kind: 'distribution-binding' });
  }
  toolAllocation.push({ toolId: 'durable-job-scheduler', grantedToRoleId: 'generalist', scope: 'automation', kind: 'scheduler' });
  toolAllocation.push({ toolId: 'measurement-collector', grantedToRoleId: 'generalist', scope: 'metrics', kind: 'measurement' });
  toolAllocation.push({ toolId: 'experiment-evidence-recorder', grantedToRoleId: 'generalist', scope: 'experiments', kind: 'evidence-recorder' });
  const termination: TerminationPolicy = {
    maxSteps: options.maxStepsDefault ?? DEFAULT_MAX_STEPS,
    haltConditions: [
      { kind: 'budget-exhausted', currency: plan.budget.currency },
      { kind: 'distribution-denied', attribution: 'production-binding-surface' },
    ],
    closeConditions: [{ kind: 'objective-met', signal: 'all-metrics-measured-and-evidence-recorded' }],
  };
  const candidate: CompiledOrganizationCandidate = {
    name: `generalist-baseline:${plan.planId}@v${plan.version}`,
    tenantId: plan.tenantId,
    topology: 'single-agent',
    roles: [role],
    delegationEdges: [],
    memorySharing: {
      sharedScopes: [{ scopeId: 'generalist-working-memory', kind: 'shared', description: 'one shared memory, no isolation — the weakness the §23 baseline exists to expose' }],
      isolationRule: 'per-role-scratch-isolated',
    },
    budgets: { currency: plan.budget.currency, orgCeiling: plan.budget.totalCeiling, perRole: { generalist: plan.budget.totalCeiling } },
    termination,
    toolAllocation,
    communication: { channel: 'mission-trail', messageDiscipline: 'typed-events-only', description: 'the baseline rides the same trail discipline' },
    critics: [],
    executionOrdering: {
      orderingBasis: 'plan-declared',
      phases: phases.map((p) => ({ ...p, roleId: 'generalist' })),
      rationale: 'generalist sequential — no specialization, no critics (§23 always-compare baseline)',
    },
    sourcePlan: { kind: 'marketing-plan', planId: plan.planId, version: plan.version },
  };
  return validateCandidateSelfConsistency(candidate);
}

export function buildDeclaredComparators(plan: MarketingPlanView, phases: readonly ExecutionPhase[], models: ResolvedModels, options: CompileOptions): Result<readonly DeclaredComparator[], CompilerRejection> {
  const baseline = buildGeneralistBaseline(plan, phases, models, options);
  if (!baseline.ok) return err(baseline.rejection);
  const alternative = compileOrganization(plan, phases, models, options, 'no-critics-pipeline');
  if (!alternative.ok) return err(alternative.rejection);
  const declared: DeclaredComparator[] = [
    {
      comparatorId: `comparator:generalist-baseline:${plan.planId}@v${plan.version}`,
      kind: 'generalist-single-agent-baseline',
      description: '§23 always-compare generalist single-agent baseline — declared comparator; evaluation belongs to the experiments authority (§25)',
      organization: baseline.value,
      evdNote: 'EVD variables are carried on the compiled strategy; the baseline is never scored here',
      status: 'declared',
      validationStatus: 'declared-unvalidated',
    },
    {
      comparatorId: `comparator:house-no-critics:${plan.planId}@v${plan.version}`,
      kind: 'hand-designed',
      description: 'hand-designed comparison: the same controller/producer/analyst topology without the critic role — declared comparator',
      organization: alternative.value,
      status: 'declared',
      validationStatus: 'declared-unvalidated',
    },
  ];
  for (const extra of options.handDesignedComparators ?? []) {
    declared.push({
      comparatorId: `comparator:declared:${extra.name}`,
      kind: 'hand-designed',
      description: 'caller-declared hand-designed comparison',
      organization: extra,
      status: 'declared',
      validationStatus: 'declared-unvalidated',
    });
  }
  return ok(declared);
}
