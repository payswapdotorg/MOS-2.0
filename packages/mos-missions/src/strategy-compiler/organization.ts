/**
 * PROD-003 — organization compilation (§23): plan → AgentOrganization candidate.
 *
 * Covers all eleven §23 dimensions: roles, topology, delegation (typed edges),
 * communication, memory sharing, critics, tool allocation, model assignment,
 * budget, execution ordering, stopping conditions.
 *
 * Allocation shares and the review-phase default are documented house POLICY
 * constants (deterministic, overridable) — they are not evidence and are never
 * presented as measurements. Model ids are never invented: they come from
 * plan-declared preferences or caller-supplied defaults, else a typed rejection.
 */
import type { MarketingPlanView, ExecutionPhase, CompiledOrganizationCandidate, OrgBudgets, TerminationPolicy, ToolGrant, DelegationEdge, AgentRoleSpec, CompileOptions, PlatformRole, Result } from './types.js';
import type { CompilerRejection } from './rejections.js';
import { ok, err } from './types.js';
import { modelAssignmentMissing, organizationSelfInvalid } from './rejections.js';

export type OrganizationStyle = 'controller-star' | 'no-critics-pipeline';

export interface ResolvedModels {
  readonly controller: string;
  readonly critic: string;
  readonly analyst: string;
  readonly producerDefault: string;
  readonly generalist: string;
  readonly perPlatform: Readonly<Record<string, string>>;
}

/** House policy constants (deterministic, disclosed, overridable via CompileOptions). */
export const DEFAULT_MAX_STEPS = 200;
export const DEFAULT_REVIEW_PHASE_DAYS = 1;
export const ROLE_BUDGET_SHARES = { controller: 0.1, critic: 0.15, analyst: 0.15 } as const;
export const PLATFORM_ROLE_WEIGHTS: Readonly<Record<PlatformRole, number>> = { primary: 3, secondary: 2, amplify: 1 };

export function resolveModelAssignments(plan: MarketingPlanView, options: CompileOptions): Result<ResolvedModels, CompilerRejection> {
  const prefs = plan.modelPreferences ?? {};
  const defaults = options.modelDefaults;
  const controller = prefs['controller'] ?? defaults?.controller;
  if (controller === undefined || controller === '') return err(modelAssignmentMissing('controller', 'plan.modelPreferences.controller or CompileOptions.modelDefaults.controller'));
  const critic = prefs['critic'] ?? defaults?.critic;
  if (critic === undefined || critic === '') return err(modelAssignmentMissing('critic', 'plan.modelPreferences.critic or CompileOptions.modelDefaults.critic'));
  const analyst = prefs['analyst'] ?? defaults?.analyst;
  if (analyst === undefined || analyst === '') return err(modelAssignmentMissing('analyst', 'plan.modelPreferences.analyst or CompileOptions.modelDefaults.analyst'));
  const producerDefault = prefs['producer'] ?? defaults?.producer;
  if (producerDefault === undefined || producerDefault === '') return err(modelAssignmentMissing('producer (default)', 'plan.modelPreferences.producer or CompileOptions.modelDefaults.producer'));
  const perPlatform: Record<string, string> = {};
  for (const choice of plan.platformChoices) {
    const model = choice.modelPreference ?? prefs['producer'] ?? defaults?.producer;
    if (model === undefined || model === '') return err(modelAssignmentMissing(`producer:${choice.platformId}`, 'PlatformChoice.modelPreference, plan.modelPreferences.producer, or CompileOptions.modelDefaults.producer'));
    perPlatform[choice.platformId] = model;
  }
  // Declared baseline construction policy: the generalist baseline reuses the
  // controller model when nothing more specific is declared.
  const generalist = prefs['generalist'] ?? defaults?.generalist ?? controller;
  return ok({ controller, critic, analyst, producerDefault, generalist, perPlatform });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function allocateBudgets(plan: MarketingPlanView, style: OrganizationStyle): OrgBudgets {
  const ceiling = plan.budget.totalCeiling;
  const includeCritic = style === 'controller-star';
  const controllerShare = ROLE_BUDGET_SHARES.controller;
  const criticShare = includeCritic ? ROLE_BUDGET_SHARES.critic : 0;
  const analystShare = ROLE_BUDGET_SHARES.analyst;
  const producerPool = 1 - controllerShare - criticShare - analystShare;
  const perRole: Record<string, number> = { controller: round2(ceiling * controllerShare) };
  if (includeCritic) perRole['critic'] = round2(ceiling * criticShare);
  perRole['analyst'] = round2(ceiling * analystShare);
  const weights = plan.platformChoices.map((c) => PLATFORM_ROLE_WEIGHTS[c.role]);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let allocated = Object.values(perRole).reduce((a, b) => a + b, 0);
  plan.platformChoices.forEach((choice, index) => {
    const share = totalWeight === 0 ? 0 : (weights[index] ?? 0) / totalWeight;
    const amount = round2(ceiling * producerPool * share);
    perRole[`producer:${choice.platformId}`] = amount;
    allocated += amount;
  });
  // Absorb rounding residual into the last producer so role budgets sum EXACTLY to the ceiling.
  const last = plan.platformChoices[plan.platformChoices.length - 1];
  if (last !== undefined) {
    const key = `producer:${last.platformId}`;
    perRole[key] = round2((perRole[key] ?? 0) + (ceiling - allocated));
  }
  return { currency: plan.budget.currency, orgCeiling: ceiling, perRole };
}

export function compileOrganization(plan: MarketingPlanView, phases: readonly ExecutionPhase[], models: ResolvedModels, options: CompileOptions, style: OrganizationStyle): Result<CompiledOrganizationCandidate, CompilerRejection> {
  const includeCritics = style === 'controller-star';
  // Pipeline style has no critic role: review work folds into the platform
  // producer's own responsibilities (self-review), keeping the phase set
  // identical for honest §23 comparison while every phase roleId resolves.
  const effectivePhases: readonly ExecutionPhase[] = includeCritics
    ? phases
    : phases.map((p) => (p.roleId === 'critic' && p.platformId !== undefined ? { ...p, roleId: `producer:${p.platformId}` } : p));
  const roles: AgentRoleSpec[] = [
    {
      roleId: 'controller',
      title: 'Mission Controller',
      responsibilities: ['owns execution ordering', 'halts on typed stopping conditions', 'delegates platform production and measurement'],
      modelId: models.controller,
      memoryScopes: ['mission-facts', 'budget-ledger'],
    },
  ];
  for (const choice of plan.platformChoices) {
    roles.push({
      roleId: `producer:${choice.platformId}`,
      title: `Platform Producer (${choice.platformId})`,
      responsibilities: [`produces content for ${choice.platformId} (${choice.role})`, 'dispatches through the production binding surface only (§24)'],
      modelId: models.perPlatform[choice.platformId] ?? models.producerDefault,
      memoryScopes: ['mission-facts', `scratch:producer:${choice.platformId}`],
    });
  }
  if (includeCritics) {
    roles.push({ roleId: 'critic', title: 'Publication Critic', responsibilities: ['reviews produced content before publish (§23 critics)'], modelId: models.critic, memoryScopes: ['mission-facts'] });
  }
  roles.push({ roleId: 'analyst', title: 'Measurement Analyst', responsibilities: ['owns measurement windows', 'records experiment evidence through the experiments authority'], modelId: models.analyst, memoryScopes: ['mission-facts', 'budget-ledger'] });

  const delegationEdges: DelegationEdge[] = [];
  for (const choice of plan.platformChoices) {
    delegationEdges.push({ edgeId: `edge:${choice.platformId}:task`, fromRoleId: 'controller', toRoleId: `producer:${choice.platformId}`, type: 'task-delegation', purpose: `produce and publish for ${choice.platformId}` });
    delegationEdges.push({ edgeId: `edge:${choice.platformId}:escalation`, fromRoleId: `producer:${choice.platformId}`, toRoleId: 'controller', type: 'escalation', purpose: `escalate binding denials and faults for ${choice.platformId}` });
    if (includeCritics) {
      delegationEdges.push({ edgeId: `edge:${choice.platformId}:review-request`, fromRoleId: `producer:${choice.platformId}`, toRoleId: 'critic', type: 'review-request', purpose: `review content for ${choice.platformId}` });
      delegationEdges.push({ edgeId: `edge:${choice.platformId}:review-verdict`, fromRoleId: 'critic', toRoleId: 'controller', type: 'review-verdict', purpose: `verdict on ${choice.platformId} content` });
    }
  }
  delegationEdges.push({ edgeId: 'edge:measurement', fromRoleId: 'controller', toRoleId: 'analyst', type: 'measurement-delegation', purpose: 'own measurement windows and evidence' });
  delegationEdges.push({ edgeId: 'edge:evidence', fromRoleId: 'analyst', toRoleId: 'controller', type: 'evidence-report', purpose: 'report evidence receipts' });

  const missionDeadline = plan.deadlines.find((d) => d.scope === 'mission');
  const haltConditions: TerminationPolicy['haltConditions'] = [
    { kind: 'budget-exhausted', currency: plan.budget.currency },
    { kind: 'distribution-denied', attribution: 'production-binding-surface' },
    ...(plan.delayPolicy?.haltOnDeadlinePassed === true && missionDeadline !== undefined
      ? [{ kind: 'deadline-passed' as const, deadlineId: missionDeadline.deadlineId }]
      : []),
  ];

  const toolAllocation: ToolGrant[] = [];
  for (const choice of plan.platformChoices) {
    toolAllocation.push({ toolId: `distribution-binding:${choice.platformId}`, grantedToRoleId: `producer:${choice.platformId}`, scope: choice.platformId, kind: 'distribution-binding' });
  }
  toolAllocation.push({ toolId: 'durable-job-scheduler', grantedToRoleId: 'controller', scope: 'automation', kind: 'scheduler' });
  toolAllocation.push({ toolId: 'measurement-collector', grantedToRoleId: 'analyst', scope: 'metrics', kind: 'measurement' });
  toolAllocation.push({ toolId: 'experiment-evidence-recorder', grantedToRoleId: 'analyst', scope: 'experiments', kind: 'evidence-recorder' });

  const candidate: CompiledOrganizationCandidate = {
    name: `compiled-automation:${plan.planId}@v${plan.version}${style === 'no-critics-pipeline' ? ':no-critics' : ''}`,
    tenantId: plan.tenantId,
    topology: style === 'controller-star' ? 'star-controller' : 'pipeline',
    roles,
    delegationEdges,
    memorySharing: {
      sharedScopes: [
        { scopeId: 'mission-facts', kind: 'shared', description: 'plan facts, platform choices, mission summary' },
        { scopeId: 'budget-ledger', kind: 'shared', description: 'append-only budget ledger (AGT-003 budget policy)' },
      ],
      isolationRule: 'per-role-scratch-isolated',
    },
    budgets: allocateBudgets(plan, style),
    termination: {
      maxSteps: options.maxStepsDefault ?? DEFAULT_MAX_STEPS,
      haltConditions,
      closeConditions: [{ kind: 'objective-met', signal: 'all-metrics-measured-and-evidence-recorded' }],
    },
    toolAllocation,
    communication: { channel: 'mission-trail', messageDiscipline: 'typed-events-only', description: 'all inter-agent communication rides the §30 mission trail as typed events; no side channels' },
    critics: includeCritics ? [{ roleId: 'critic', reviewsPhaseKinds: ['produce'], vetoOn: 'policy-violation' }] : [],
    executionOrdering: { orderingBasis: 'plan-declared', phases: effectivePhases, rationale: 'plan-declared ordering: MARKETING-001 platform-choice order, then measurement, then evidence' },
    sourcePlan: { kind: 'marketing-plan', planId: plan.planId, version: plan.version },
  };
  return validateCandidateSelfConsistency(candidate);
}

export function withExecutionOrdering(candidate: CompiledOrganizationCandidate, phases: readonly ExecutionPhase[], basis: CompiledOrganizationCandidate['executionOrdering']['orderingBasis'], rationale: string): CompiledOrganizationCandidate {
  return { ...candidate, executionOrdering: { orderingBasis: basis, phases, rationale } };
}

export function validateCandidateSelfConsistency(candidate: CompiledOrganizationCandidate): Result<CompiledOrganizationCandidate, CompilerRejection> {
  const roleIds = new Set(candidate.roles.map((r) => r.roleId));
  if (roleIds.size !== candidate.roles.length) return err(organizationSelfInvalid('duplicate role ids'));
  for (const role of candidate.roles) {
    if (role.modelId === '') return err(organizationSelfInvalid(`role ${role.roleId} has an empty model assignment`));
  }
  const edgeIds = new Set<string>();
  for (const edge of candidate.delegationEdges) {
    if (edgeIds.has(edge.edgeId)) return err(organizationSelfInvalid(`duplicate edge id ${edge.edgeId}`));
    edgeIds.add(edge.edgeId);
    if (!roleIds.has(edge.fromRoleId) || !roleIds.has(edge.toRoleId)) return err(organizationSelfInvalid(`edge ${edge.edgeId} references an unknown role`));
  }
  const roleBudgetTotal = Object.values(candidate.budgets.perRole).reduce((a, b) => a + b, 0);
  if (Math.abs(roleBudgetTotal - candidate.budgets.orgCeiling) > 0.005) {
    return err(organizationSelfInvalid(`role budgets ${roleBudgetTotal} do not sum to the org ceiling ${candidate.budgets.orgCeiling}`));
  }
  for (const grant of candidate.toolAllocation) {
    if (!roleIds.has(grant.grantedToRoleId)) return err(organizationSelfInvalid(`tool grant ${grant.toolId} references unknown role ${grant.grantedToRoleId}`));
  }
  for (const critic of candidate.critics) {
    if (!roleIds.has(critic.roleId)) return err(organizationSelfInvalid(`critic references unknown role ${critic.roleId}`));
  }
  const phaseIds = new Set(candidate.executionOrdering.phases.map((p) => p.phaseId));
  for (const phase of candidate.executionOrdering.phases) {
    if (!roleIds.has(phase.roleId)) return err(organizationSelfInvalid(`phase ${phase.phaseId} references unknown role ${phase.roleId}`));
    for (const dep of phase.dependsOn) {
      if (!phaseIds.has(dep)) return err(organizationSelfInvalid(`phase ${phase.phaseId} depends on unknown phase ${dep}`));
    }
  }
  if (candidate.termination.maxSteps < 1) return err(organizationSelfInvalid('termination maxSteps must be >= 1'));
  return ok(candidate);
}
