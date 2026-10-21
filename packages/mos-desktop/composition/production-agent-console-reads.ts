import type {
  AgentConsolePort,
  ConsoleAgentsData,
  ConsoleControlData,
  ConsoleDirectData,
  ConsoleIntelligenceRecordView,
  ConsolePlanData,
  ConsoleResearchData,
  ConsoleResultsData,
} from '@mos/web';
import type { TenantScope } from '@mos/contracts';
import type { CompiledStrategy, MissionRepository } from '@mos/missions';
import type { ConsoleBindingState } from './production-agent-console-core.js';

/**
 * The Agent Console READ models over the REAL runtimes (the CONSOLE wave):
 * every load projects what the authorities actually hold — the mission
 * banner from the REAL missions repository, the plan chains from the REAL
 * MARKETING-001 planner, the compiled strategies + runs the composition's
 * REAL compiler/engine produced, the intelligence records from the REAL §25
 * authority, the experiments from the REAL BRIDGE-003 authority, and the
 * rights grants from the REAL rights repository. Counts + ids + verbatim
 * vocabulary; §31 tenant scoping through the composition's scope; empty
 * states are REAL states, never errors.
 *
 * PERSISTENCE DISCLOSURE: the compiled strategies and runs live in the
 * composition's in-process records (per-load state, the wave-21 disclosed
 * limitation class) — the plan chains / intelligence / experiments / grants
 * live in their REAL in-memory adapters (same class). Durable persistence
 * is the P2 service transport.
 */

function missionBannerOf(
  missionRepository: MissionRepository,
  scope: TenantScope,
  missionId: string | null,
): ConsoleDirectData['mission'] {
  if (missionId === null) {
    return {
      missionId: '',
      title: 'No mission selected',
      objective: '',
      status: 'draft',
      recordVersion: 0,
      successCriteria: [],
      constraints: [],
    };
  }
  const mission = missionRepository
    .listMissions(scope)
    .find((candidate) => String(candidate.id) === missionId);
  if (mission === undefined) {
    return {
      missionId,
      title: `Unknown mission ${missionId}`,
      objective: 'The mission id does not resolve in this tenant scope.',
      status: 'draft',
      recordVersion: 0,
      successCriteria: [],
      constraints: [],
    };
  }
  return {
    missionId: String(mission.id),
    title: mission.objective.statement,
    objective: mission.objective.statement,
    status: mission.status,
    recordVersion: mission.version,
    successCriteria: mission.objective.targetMetrics.map((metric) => ({
      metric: String(metric.metric),
      direction: 'target',
    })),
    constraints: mission.objective.constraints.map((constraint) => ({
      kind: constraint.kind,
      value: constraint.description,
    })),
  };
}

const LAB_LINKS: readonly { readonly label: string; readonly href: string }[] = [
  { label: 'Research overview', href: '/lab?section=overview' },
  { label: 'Corpus & evidence', href: '/lab?section=corpus' },
  { label: 'Simulator & Time Machine', href: '/lab?section=simulator' },
  { label: 'Strategy comparison', href: '/lab?section=strategy' },
  { label: 'Benchmarks', href: '/lab?section=benchmarks' },
  { label: 'Calibration & learning', href: '/lab?section=calibration' },
];

/** Build the Agent Console read port over the REAL runtimes. */
export function createProductionAgentConsoleReads(
  state: ConsoleBindingState,
  catalogBodyIds: readonly string[],
): AgentConsolePort {
  const plansOfMission = async (missionId: string | null) => {
    if (missionId === null) {
      return await state.marketingPlanner.listMarketingPlans(state.scope);
    }
    return await state.marketingPlanner.listMarketingPlansForMission(
      state.scope,
      missionId as never,
    );
  };

  const strategiesOfPlans = (planIds: readonly string[]): readonly CompiledStrategy[] =>
    [...state.strategies.values()].filter((strategy) =>
      planIds.includes(String(strategy.sourcePlan.planId)),
    );

  const runsOfStrategies = (strategyIds: readonly string[]) =>
    [...state.runs.values()].filter((run) => strategyIds.includes(run.strategyId));

  const intelligenceListing = async (): Promise<readonly ConsoleIntelligenceRecordView[]> => {
    const search = await state.productIntelligence.searchProductIntelligence(state.scope, {
      limit: 10000,
    });
    if ('error' in search) {
      return [];
    }
    return search.map((record) => ({
      recordId: String(record.id),
      version: record.version,
      contentKind: String(record.kind),
      basis: record.basis.basis,
      rightsStatus: `granted (${String(record.rightsRef)})`,
      recordedAt: String(record.recordedAt),
    }));
  };

  return {
    async loadConsoleDirect(missionId) {
      const plans = await plansOfMission(missionId);
      const planIds = plans.map((plan) => String(plan.id));
      const strategies = strategiesOfPlans(planIds);
      const runs = runsOfStrategies(strategies.map((strategy) => strategy.strategyId));
      const intelligence = await intelligenceListing();
      const experiments = state.experimentsRuntime.authority.listExperiments(state.scope);
      const grants = state.rightsRepository.listRightsGrants(state.scope);
      return {
        mission: missionBannerOf(state.missionRepository, state.scope, missionId),
        standings: {
          plansCount: plans.length,
          strategiesCount: strategies.length,
          runsCount: runs.length,
          runsAwaitingAuthorization: runs.filter((run) => run.lifecycle === 'compiled').length,
          runsArmed: runs.filter((run) => run.lifecycle === 'armed').length,
          runsOther: runs.filter(
            (run) => run.lifecycle !== 'compiled' && run.lifecycle !== 'armed',
          ).length,
        },
        readiness: {
          intelligenceRecords: intelligence.length,
          rightsGrants: grants.length,
          experiments: experiments.length,
          plans: plans.length,
        },
      };
    },

    async loadConsolePlan(missionId) {
      const plans = await plansOfMission(missionId);
      const planIds = plans.map((plan) => String(plan.id));
      const strategies = strategiesOfPlans(planIds);
      return {
        mission: missionBannerOf(state.missionRepository, state.scope, missionId),
        planChains: plans.map((plan) => ({
          planId: String(plan.id),
          latestVersion: plan.version,
          missionId: String(plan.mission.missionId),
          objectiveAlignment: plan.objectiveAlignment,
          platforms: plan.platforms.map((platform) => ({
            platform: String(platform.platform),
            rationale: platform.rationale,
          })),
          metricExpectations: plan.metricExpectations.map((expectation) => ({
            metric: String(expectation.metric),
            expectation: expectation.expectation,
            unit: expectation.unit,
            basis: expectation.basis.basis,
          })),
          experimentExpectations: plan.experimentExpectations.map((expectation) => ({
            question: expectation.question,
            successCriterion: expectation.successCriterion,
          })),
          recordDigest: plan.recordDigest,
          composedAt: String(plan.composedAt),
          composedBy: String(plan.composedBy),
          boundaryStatement: plan.boundaryStatement,
        })),
        strategies: strategies.map((strategy) => ({
          strategyId: strategy.strategyId,
          sourcePlan: {
            planId: String(strategy.sourcePlan.planId),
            version: strategy.sourcePlan.version,
          },
          missionSummary: strategy.missionSummary,
          organization: {
            name: strategy.organization.name,
            topology: String(strategy.organization.topology),
            roles: strategy.organization.roles.map((role) => ({
              roleId: role.roleId,
              title: role.title,
              responsibilitiesCount: role.responsibilities.length,
              modelId: role.modelId,
            })),
            delegationEdges: strategy.organization.delegationEdges.map((edge) => ({
              edgeId: edge.edgeId,
              fromRoleId: edge.fromRoleId,
              toRoleId: edge.toRoleId,
              type: String(edge.type),
              purpose: edge.purpose,
            })),
            phases: strategy.organization.executionOrdering.phases.map((phase) => ({
              phaseId: phase.phaseId,
              kind: String(phase.kind),
              roleId: phase.roleId,
              platformId: phase.platformId ?? null,
              metricId: phase.metricId ?? null,
              dependsOnCount: phase.dependsOn.length,
              declaredDurationDays: phase.declaredDurationDays,
            })),
            budgets: {
              currency: strategy.organization.budgets.currency,
              totalCeiling: strategy.organization.budgets.orgCeiling,
            },
            termination: `max-steps ${strategy.organization.termination.maxSteps} · ${strategy.organization.termination.haltConditions.length} halt / ${strategy.organization.termination.closeConditions.length} close conditions`,
            toolGrantsCount: strategy.organization.toolAllocation.length,
            communication: `${strategy.organization.communication.channel} · ${strategy.organization.communication.messageDiscipline}`,
            memorySharing: `${strategy.organization.memorySharing.sharedScopes.length} shared scope(s) · ${strategy.organization.memorySharing.isolationRule}`,
          },
          organizationValidation: {
            authorityRecord: strategy.organizationValidation.authorityRecord,
          },
          comparators: strategy.comparators.map((comparator) => ({
            name: comparator.comparatorId,
            kind: String(comparator.kind),
          })),
          expectedValueOfDelay:
            strategy.expectedValueOfDelay === undefined
              ? null
              : {
                  value: String(strategy.expectedValueOfDelay.totalExpectedDelayCost),
                  perDayDelayCost: String(strategy.expectedValueOfDelay.perDayDelayCost),
                  deadlinePressure: `${strategy.expectedValueOfDelay.pressure.length} phase(s) under pressure · ${strategy.expectedValueOfDelay.orderingBasis}`,
                },
          forecastsCount: strategy.forecasts.length,
        })),
      } satisfies ConsolePlanData;
    },

    async loadConsoleResearch(missionId) {
      const intelligence = await intelligenceListing();
      const experiments = state.experimentsRuntime.authority.listExperiments(state.scope);
      return {
        mission: missionBannerOf(state.missionRepository, state.scope, missionId),
        intelligenceRecords: intelligence,
        experiments: experiments.map((experiment) => {
          const annotation = state.experimentAnnotations.get(String(experiment.id));
          return {
            experimentId: String(experiment.id),
            question: annotation === undefined ? '' : annotation.question,
            status: String(experiment.status),
          };
        }),
        labLinks: LAB_LINKS,
      } satisfies ConsoleResearchData;
    },

    async loadConsoleResults(missionId) {
      const plans = await plansOfMission(missionId);
      const planIds = plans.map((plan) => String(plan.id));
      const strategies = strategiesOfPlans(planIds);
      const strategyIds = strategies.map((strategy) => strategy.strategyId);
      const runs = runsOfStrategies(strategyIds);
      return {
        mission: missionBannerOf(state.missionRepository, state.scope, missionId),
        runs: runs.map((run) => ({
          runId: run.runId,
          strategyId: run.strategyId,
          lifecycle: run.lifecycle,
          missionSummary: run.missionSummary,
          ledger: {
            currency: run.ledger.currency,
            spent: run.ledger.spent,
            ceiling: run.ledger.ceiling,
          },
          actions: run.actions.map((action) => ({
            actionId: action.actionId,
            platformId: action.platformId,
            channel: action.channel,
            status: action.status,
          })),
          collectedMetrics: run.collectedMetrics.map((metric) => ({
            metricId: metric.metricId,
            value: String(metric.value),
          })),
          trail: run.trail.map((event) => ({
            eventId: event.eventId,
            at: event.at,
            kind: event.kind,
            detail: event.detail,
            provenance: event.provenance ?? null,
          })),
          experimentBinding:
            run.experimentBinding === undefined
              ? null
              : {
                  experimentId: run.experimentBinding.experimentId,
                  bindingId: run.experimentBinding.bindingId,
                },
          evidenceReceipt:
            run.evidenceReceipt === undefined
              ? null
              : {
                  evidenceId: run.evidenceReceipt.evidenceId,
                  experimentId: run.evidenceReceipt.experimentId,
                },
          halt: run.halt === undefined ? null : { reason: run.halt.reason, detail: run.halt.detail },
          stepCount: run.stepCount,
          maxSteps: run.maxSteps,
          waitingOn:
            run.lifecycle === 'compiled'
              ? 'authorization'
              : run.lifecycle === 'armed'
                ? 'job-execution-transport'
                : null,
        })),
        artifacts: [
          ...plans.map((plan) => ({
            kind: 'marketing-plan',
            id: String(plan.id),
            version: plan.version,
          })),
          ...strategies.map((strategy) => ({
            kind: 'compiled-strategy',
            id: strategy.strategyId,
            version: 1,
          })),
        ],
      } satisfies ConsoleResultsData;
    },

    async loadConsoleControl(missionId) {
      const plans = await plansOfMission(missionId);
      const planIds = plans.map((plan) => String(plan.id));
      const strategies = strategiesOfPlans(planIds);
      const strategyIds = strategies.map((strategy) => strategy.strategyId);
      const runs = runsOfStrategies(strategyIds);
      const grants = state.rightsRepository.listRightsGrants(state.scope);
      return {
        mission: missionBannerOf(state.missionRepository, state.scope, missionId),
        awaitingAuthorization: runs
          .filter((run) => run.lifecycle === 'compiled')
          .map((run) => ({
            runId: run.runId,
            strategyId: run.strategyId,
            missionSummary: run.missionSummary,
            declaredAt: run.trail.find((event) => event.kind === 'run-created')?.at ?? '',
          })),
        authorized: runs
          .filter((run) => run.lifecycle === 'armed')
          .map((run) => {
            const armedEvent = run.trail.find((event) => event.kind === 'armed');
            return {
              runId: run.runId,
              strategyId: run.strategyId,
              experimentId:
                run.experimentBinding === undefined ? '' : run.experimentBinding.experimentId,
              authorizedAt: armedEvent?.at ?? '',
            };
          }),
        rightsGrants: grants.map((grant) => ({
          grantId: String(grant.id),
          rightsHolderId: String(grant.grantee),
          action: grant.scope.actions.join(', '),
          status:
            grant.revokedAt !== null
              ? 'revoked'
              : grant.expiresAt !== null && grant.expiresAt <= state.now()
                ? 'expired'
                : 'granted',
        })),
      } satisfies ConsoleControlData;
    },

    async loadConsoleAgents(): Promise<ConsoleAgentsData> {
      const bodies = catalogBodyIds
        .map((bodyId) => state.agentBodyRegistry.getLatest(bodyId as never))
        .filter((body) => body !== undefined);
      const organizationIds = state.organizationRegistry.listOrganizationIds(state.scope);
      const organizations = organizationIds
        .map((organizationId) =>
          state.organizationRegistry.getOrganization(state.scope, organizationId),
        )
        .filter((organization) => organization !== undefined);
      return {
        agentBodies: bodies.map((body) => ({
          bodyId: String(body.id),
          version: body.version,
          role: body.roleContract.summary,
          capabilitiesCount: body.capabilities.length,
        })),
        organizations: organizations.map((organization) => ({
          organizationId: String(organization.id),
          version: organization.version,
          name: String(organization.id),
          topology: String(organization.memoryPolicy),
          nodesCount: organization.nodes.length,
          edgesCount: organization.edges.length,
        })),
        bodiesNote:
          'The composition registers this standard body catalog through the REAL AGT-001 registration API (a disclosed composition decision — capability contracts, not business data); compiled organizations validate through the REAL AGT-003 registry.',
      };
    },
  };
}
