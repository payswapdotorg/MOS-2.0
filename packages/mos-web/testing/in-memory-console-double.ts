import type { MissionRepository } from '@mos/missions';
import type { TenantScope } from '@mos/contracts';
import type {
  AgentConsolePort,
  ConsoleAgentsData,
  ConsoleDirectData,
  ConsoleIntelligenceRecordView,
} from '../dist/src/ports/agent-console.js';
import type {
  ConsoleIntentActionId,
  ConsoleIntentAuthorityId,
  ConsoleIntentLedgerRecord,
  ConsoleIntentsPort,
  ConsoleIntentResult,
} from '../dist/src/ports/console-intents.js';

/**
 * DISCLOSED in-memory Console double (the CONSOLE wave) — the composition
 * seam for the browser shell's tests and the acceptance harness.
 *
 * The state machine mirrors the REAL authority chain's shapes and failure
 * vocabularies where they are knowable at the seam: the rights gate on
 * intelligence recording fails closed with the REAL product-intelligence
 * code (`no-explicit-grant`), compose-plan mirrors the REAL planner codes
 * (`mission-citation-unresolvable`, `mission-not-plannable`,
 * `evidence-citation-unresolvable`, `duplicate-marketing-plan`,
 * `invalid-input`), arm mirrors the REAL engine rejection names
 * (`ARM_RIGHTS_DENIED`, `EXPERIMENT_BINDING_FAILED`, `ILLEGAL_TRANSITION`)
 * with their message templates verbatim. The production binding
 * (mos-desktop/composition/production-agent-console.ts) proves the same
 * paths over the REAL runtimes; this double exists so the shell's
 * transport, forms, ledger and read models are exercised node-side.
 *
 * The mission records resolve through the REAL mission repository the
 * composition already holds (the double never invents mission state).
 */

// ---------------------------------------------------------------------------
// The shared double state
// ---------------------------------------------------------------------------

interface DoubleExperiment {
  readonly experimentId: string;
  readonly question: string;
  readonly successCriterion: string;
  readonly status: string;
  readonly createdAt: string;
}

interface DoubleGrant {
  readonly grantId: string;
  readonly rightsHolderId: string;
  readonly action: string;
  readonly status: string;
}

interface DoubleIntelligenceRecord {
  readonly recordId: string;
  readonly version: number;
  readonly contentKind: string;
  readonly basis: string;
  readonly rightsStatus: string;
  readonly recordedAt: string;
}

interface DoublePlan {
  readonly planId: string;
  readonly version: number;
  readonly missionId: string;
  readonly objectiveAlignment: string;
  readonly platforms: readonly { readonly platform: string; readonly rationale: string }[];
  readonly metricExpectations: readonly {
    readonly metric: string;
    readonly expectation: string;
    readonly unit: string;
    readonly basis: string;
  }[];
  readonly experimentExpectations: readonly {
    readonly question: string;
    readonly successCriterion: string;
  }[];
  readonly experimentRefs: readonly string[];
  readonly recordDigest: string;
  readonly composedAt: string;
  readonly composedBy: string;
}

interface DoubleStrategy {
  readonly strategyId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly missionSummary: string;
  readonly organizationName: string;
  readonly topology: string;
  readonly roles: readonly { readonly roleId: string; readonly title: string; readonly modelId: string }[];
  readonly delegationEdges: readonly {
    readonly edgeId: string;
    readonly fromRoleId: string;
    readonly toRoleId: string;
    readonly type: string;
    readonly purpose: string;
  }[];
  readonly phases: readonly {
    readonly phaseId: string;
    readonly kind: string;
    readonly roleId: string;
    readonly declaredDurationDays: number;
  }[];
  readonly budgets: { readonly currency: string; readonly totalCeiling: number };
  readonly comparators: readonly { readonly name: string; readonly kind: string }[];
  readonly compiledAt: string;
}

interface DoubleRun {
  readonly runId: string;
  readonly strategyId: string;
  readonly lifecycle: 'compiled' | 'armed';
  readonly missionSummary: string;
  readonly createdAt: string;
  readonly armedAt: string | null;
  readonly experimentId: string | null;
  readonly trail: readonly { readonly eventId: string; readonly at: string; readonly kind: string; readonly detail: string }[];
}

/** The double's shared state (one per composition instance). */
export interface ConsoleDoubleState {
  readonly experiments: Map<string, DoubleExperiment>;
  readonly grants: Map<string, DoubleGrant>;
  readonly intelligence: Map<string, DoubleIntelligenceRecord>;
  readonly plans: Map<string, DoublePlan>;
  readonly strategies: Map<string, DoubleStrategy>;
  readonly runs: Map<string, DoubleRun>;
  readonly ledger: Map<string, ConsoleIntentLedgerRecord>;
  readonly intentCounter: { count: number };
}

export function createConsoleDoubleState(): ConsoleDoubleState {
  return {
    experiments: new Map(),
    grants: new Map(),
    intelligence: new Map(),
    plans: new Map(),
    strategies: new Map(),
    runs: new Map(),
    ledger: new Map(),
    intentCounter: { count: 0 },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function nextIntentId(state: ConsoleDoubleState): string {
  state.intentCounter.count += 1;
  return `console-intent-${state.intentCounter.count}`;
}

/** Parses declared JSON strictly (named failures, never guesses). */
function parseDeclaredJson(
  text: string,
  field: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: string; readonly message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      code: `console-intent-json-invalid:${field}`,
      message: `the declared JSON for ${field} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function receipt(
  state: ConsoleDoubleState,
  action: ConsoleIntentActionId,
  routedTo: ConsoleIntentAuthorityId,
  now: string,
  echo: { recordId: string; recordVersion: number; lifecycleState?: string; summary: string },
): ConsoleIntentResult {
  const intentId = nextIntentId(state);
  const outcome: ConsoleIntentResult = {
    intentId,
    action,
    declaredAt: now,
    routedTo,
    authorityEcho: {
      recordId: echo.recordId,
      recordVersion: echo.recordVersion,
      lifecycleState: echo.lifecycleState ?? null,
      summary: echo.summary,
    },
  };
  state.ledger.set(intentId, {
    intentId,
    action,
    declaredAt: now,
    routedTo,
    outcome,
  });
  return outcome;
}

function failure(
  state: ConsoleDoubleState,
  action: ConsoleIntentActionId,
  routedTo: ConsoleIntentAuthorityId,
  now: string,
  error: string,
  message: string,
): ConsoleIntentResult {
  const intentId = nextIntentId(state);
  const outcome: ConsoleIntentResult = {
    intentId,
    action,
    declaredAt: now,
    routedTo,
    error,
    message,
  };
  state.ledger.set(intentId, {
    intentId,
    action,
    declaredAt: now,
    routedTo,
    outcome,
  });
  return outcome;
}

function digestOf(payload: unknown): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// The read port double
// ---------------------------------------------------------------------------

export interface InMemoryAgentConsoleOptions {
  readonly state: ConsoleDoubleState;
  readonly missionRepository: MissionRepository;
  readonly scope: TenantScope;
  readonly now?: () => string;
}

function missionBannerFromRepository(
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
  const missions = missionRepository.listMissions(scope);
  const mission = missions.find((candidate) => candidate.id === missionId);
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
    missionId: mission.id,
    title: mission.objective.statement,
    objective: mission.objective.statement,
    status: mission.status,
    recordVersion: mission.version,
    successCriteria: mission.objective.targetMetrics.map((metric) => ({
      metric: metric.metric,
      direction: 'target',
    })),
    constraints: mission.objective.constraints.map((constraint) => ({
      kind: constraint.kind,
      value: constraint.description,
    })),
  };
}

/** Creates the in-memory Agent Console read port over the shared state. */
export function createInMemoryAgentConsolePort(
  options: InMemoryAgentConsoleOptions,
): AgentConsolePort {
  const { state, missionRepository, scope } = options;

  const runsForMission = (missionId: string | null): readonly DoubleRun[] => {
    if (missionId === null) {
      return [];
    }
    return [...state.runs.values()].filter((run) => {
      const strategy = state.strategies.get(run.strategyId);
      const plan = strategy === undefined ? undefined : state.plans.get(strategy.planId);
      return plan !== undefined && plan.missionId === missionId;
    });
  };

  const standingsFor = (missionId: string | null) => {
    const runs = runsForMission(missionId);
    const missionPlans = [...state.plans.values()].filter(
      (plan) => missionId === null || plan.missionId === missionId,
    );
    const missionStrategies = [...state.strategies.values()].filter((strategy) =>
      missionPlans.some((plan) => plan.planId === strategy.planId),
    );
    return {
      plansCount: missionPlans.length,
      strategiesCount: missionStrategies.length,
      runsCount: runs.length,
      runsAwaitingAuthorization: runs.filter((run) => run.lifecycle === 'compiled').length,
      runsArmed: runs.filter((run) => run.lifecycle === 'armed').length,
      runsOther: 0,
    };
  };

  return {
    async loadConsoleDirect(missionId) {
      return {
        mission: missionBannerFromRepository(missionRepository, scope, missionId),
        standings: standingsFor(missionId),
        readiness: {
          intelligenceRecords: state.intelligence.size,
          rightsGrants: state.grants.size,
          experiments: state.experiments.size,
          plans: state.plans.size,
        },
      };
    },
    async loadConsolePlan(missionId) {
      const missionPlans = [...state.plans.values()].filter(
        (plan) => missionId === null || plan.missionId === missionId,
      );
      const missionStrategies = [...state.strategies.values()].filter((strategy) =>
        missionPlans.some((plan) => plan.planId === strategy.planId),
      );
      return {
        mission: missionBannerFromRepository(missionRepository, scope, missionId),
        planChains: missionPlans.map((plan) => ({
          planId: plan.planId,
          latestVersion: plan.version,
          missionId: plan.missionId,
          objectiveAlignment: plan.objectiveAlignment,
          platforms: plan.platforms,
          metricExpectations: plan.metricExpectations,
          experimentExpectations: plan.experimentExpectations,
          recordDigest: plan.recordDigest,
          composedAt: plan.composedAt,
          composedBy: plan.composedBy,
          boundaryStatement:
            'this plan cites its mission through the mission authority and creates no parallel mission record; platform and expectation evidence resolves through product-intelligence versioned citations; provider-confirmed restrictions are acknowledged from observable health records while suspected anomalies stay advisory, never confirmed (MARKETING-001; §25/§31)',
        })),
        strategies: missionStrategies.map((strategy) => ({
          strategyId: strategy.strategyId,
          sourcePlan: { planId: strategy.planId, version: strategy.planVersion },
          missionSummary: strategy.missionSummary,
          organization: {
            name: strategy.organizationName,
            topology: strategy.topology,
            roles: strategy.roles.map((role) => ({
              roleId: role.roleId,
              title: role.title,
              responsibilitiesCount: 2,
              modelId: role.modelId,
            })),
            delegationEdges: strategy.delegationEdges,
            phases: strategy.phases.map((phase) => ({
              phaseId: phase.phaseId,
              kind: phase.kind,
              roleId: phase.roleId,
              platformId: null,
              metricId: null,
              dependsOnCount: 0,
              declaredDurationDays: phase.declaredDurationDays,
            })),
            budgets: strategy.budgets,
            termination: 'max-steps',
            toolGrantsCount: 0,
            communication: 'buffered',
            memorySharing: 'none',
          },
          organizationValidation: {
            authorityRecord: 'agents-registry#in-memory-double',
          },
          comparators: strategy.comparators,
          expectedValueOfDelay: null,
          forecastsCount: 0,
        })),
      };
    },
    async loadConsoleResearch(missionId) {
      const intelligence: ConsoleIntelligenceRecordView[] = [...state.intelligence.values()];
      return {
        mission: missionBannerFromRepository(missionRepository, scope, missionId),
        intelligenceRecords: intelligence,
        experiments: [...state.experiments.values()].map((experiment) => ({
          experimentId: experiment.experimentId,
          question: experiment.question,
          status: experiment.status,
        })),
        labLinks: [
          { label: 'Research overview', href: '/lab?section=overview' },
          { label: 'Corpus & evidence', href: '/lab?section=corpus' },
          { label: 'Simulator & Time Machine', href: '/lab?section=simulator' },
          { label: 'Strategy comparison', href: '/lab?section=strategy' },
          { label: 'Benchmarks', href: '/lab?section=benchmarks' },
          { label: 'Calibration & learning', href: '/lab?section=calibration' },
        ],
      };
    },
    async loadConsoleResults(missionId) {
      const runs = runsForMission(missionId);
      const missionPlans = [...state.plans.values()].filter(
        (plan) => missionId === null || plan.missionId === missionId,
      );
      const missionStrategies = [...state.strategies.values()].filter((strategy) =>
        missionPlans.some((plan) => plan.planId === strategy.planId),
      );
      return {
        mission: missionBannerFromRepository(missionRepository, scope, missionId),
        runs: runs.map((run) => ({
          runId: run.runId,
          strategyId: run.strategyId,
          lifecycle: run.lifecycle,
          missionSummary: run.missionSummary,
          ledger: { currency: 'USD', spent: 0, ceiling: 0 },
          actions: [],
          collectedMetrics: [],
          trail: run.trail.map((event) => ({ ...event, provenance: null })),
          experimentBinding:
            run.experimentId === null
              ? null
              : { experimentId: run.experimentId, bindingId: `binding-${run.experimentId}` },
          evidenceReceipt: null,
          halt: null,
          stepCount: 0,
          maxSteps: 40,
          waitingOn:
            run.lifecycle === 'compiled'
              ? 'authorization'
              : 'job-execution-transport',
        })),
        artifacts: [
          ...missionPlans.map((plan) => ({
            kind: 'marketing-plan',
            id: plan.planId,
            version: plan.version,
          })),
          ...missionStrategies.map((strategy) => ({
            kind: 'compiled-strategy',
            id: strategy.strategyId,
            version: 1,
          })),
        ],
      };
    },
    async loadConsoleControl(missionId) {
      const runs = runsForMission(missionId);
      return {
        mission: missionBannerFromRepository(missionRepository, scope, missionId),
        awaitingAuthorization: runs
          .filter((run) => run.lifecycle === 'compiled')
          .map((run) => ({
            runId: run.runId,
            strategyId: run.strategyId,
            missionSummary: run.missionSummary,
            declaredAt: run.createdAt,
          })),
        authorized: runs
          .filter((run) => run.lifecycle === 'armed')
          .map((run) => ({
            runId: run.runId,
            strategyId: run.strategyId,
            experimentId: run.experimentId ?? '',
            authorizedAt: run.armedAt ?? '',
          })),
        rightsGrants: [...state.grants.values()].map((grant) => ({
          grantId: grant.grantId,
          rightsHolderId: grant.rightsHolderId,
          action: grant.action,
          status: grant.status,
        })),
      };
    },
    async loadConsoleAgents(_scope: TenantScope): Promise<ConsoleAgentsData> {
      return {
        agentBodies: [
          {
            bodyId: 'body-analyst',
            version: 1,
            role: 'analyst',
            capabilitiesCount: 1,
          },
          {
            bodyId: 'body-producer',
            version: 1,
            role: 'producer',
            capabilitiesCount: 1,
          },
        ],
        organizations: [],
        bodiesNote:
          'The in-memory double carries a minimal fixture registry; the production composition registers the standard catalog through the REAL registration API.',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The intents port double
// ---------------------------------------------------------------------------

export interface InMemoryConsoleIntentsOptions {
  readonly state: ConsoleDoubleState;
  readonly missionRepository: MissionRepository;
  readonly scope: TenantScope;
  readonly now?: () => string;
}

/** Creates the in-memory Console write-intents port over the shared state. */
export function createInMemoryConsoleIntents(
  options: InMemoryConsoleIntentsOptions,
): ConsoleIntentsPort {
  const { state, missionRepository, scope } = options;
  const now = options.now ?? (() => new Date().toISOString());

  const resolveMission = (
    missionId: string,
  ): { readonly ok: true; readonly mission: NonNullable<ReturnType<MissionRepository['getMission']>> } | { readonly ok: false; readonly error: string; readonly message: string } => {
    const missions = missionRepository.listMissions(scope);
    const mission = missions.find((candidate) => candidate.id === missionId);
    if (mission === undefined) {
      return {
        ok: false,
        error: 'mission-citation-unresolvable',
        message: `the mission citation ${missionId} does not resolve in this tenant scope (cross-tenant ≡ unknown — no existence leak)`,
      };
    }
    if (mission.status !== 'draft' && mission.status !== 'active') {
      return {
        ok: false,
        error: 'mission-not-plannable',
        message: `the cited mission version exists but its status is not plannable (${mission.status})`,
      };
    }
    return { ok: true, mission };
  };

  const hasAnalyzeGrant = (): boolean =>
    [...state.grants.values()].some(
      (grant) => grant.action === 'analyze' && grant.status === 'granted',
    );

  const intelligenceCitationResolves = (citation: unknown): boolean => {
    if (!isRecord(citation)) {
      return false;
    }
    const recordId = typeof citation.recordId === 'string' ? citation.recordId : null;
    const version = typeof citation.version === 'number' ? citation.version : null;
    if (recordId === null || version === null) {
      return false;
    }
    const record = state.intelligence.get(recordId);
    return record !== undefined && record.version === version;
  };

  return {
    async declareCreateExperiment(declaration) {
      const at = now();
      if (declaration.experimentId === '' || declaration.questionText === '' || declaration.successCriterionText === '') {
        return failure(state, 'create-experiment', 'experiments-authority', at, 'invalid-input', 'experiment id, question and success criterion are required and non-blank');
      }
      if (state.experiments.has(declaration.experimentId)) {
        return failure(state, 'create-experiment', 'experiments-authority', at, 'duplicate-experiment', `experiment ${declaration.experimentId} already exists in this tenant scope`);
      }
      state.experiments.set(declaration.experimentId, {
        experimentId: declaration.experimentId,
        question: declaration.questionText,
        successCriterion: declaration.successCriterionText,
        status: 'active',
        createdAt: at,
      });
      return receipt(state, 'create-experiment', 'experiments-authority', at, {
        recordId: declaration.experimentId,
        recordVersion: 1,
        summary: `experiment ${declaration.experimentId} registered (active) — the question it decides: ${declaration.questionText}`,
      });
    },

    async declareGrantAnalysisRights(declaration) {
      const at = now();
      if (declaration.grantId === '' || declaration.rightsHolderId === '' || declaration.actionText === '') {
        return failure(state, 'grant-analysis-rights', 'rights-authority', at, 'invalid-input', 'grant id, rights holder and action are required and non-blank');
      }
      if (state.grants.has(declaration.grantId)) {
        return failure(state, 'grant-analysis-rights', 'rights-authority', at, 'duplicate-grant', `rights grant ${declaration.grantId} already exists in this tenant scope`);
      }
      const knownActions = ['use', 'transform', 'distribute', 'derive', 'analyze'];
      if (!knownActions.includes(declaration.actionText)) {
        return failure(state, 'grant-analysis-rights', 'rights-authority', at, 'invalid-input', `action ${declaration.actionText} is not in the rights action vocabulary (${knownActions.join(' | ')})`);
      }
      state.grants.set(declaration.grantId, {
        grantId: declaration.grantId,
        rightsHolderId: declaration.rightsHolderId,
        action: declaration.actionText,
        status: 'granted',
      });
      return receipt(state, 'grant-analysis-rights', 'rights-authority', at, {
        recordId: declaration.grantId,
        recordVersion: 1,
        summary: `rights grant ${declaration.grantId} recorded — action ${declaration.actionText} granted to ${declaration.rightsHolderId}`,
      });
    },

    async declareRecordIntelligence(declaration) {
      const at = now();
      // The REAL §25 rights gate, mirrored fail-closed: without a grant
      // covering the analyze action the authority DENIES recording and the
      // receipt says so verbatim (the product-intelligence vocabulary).
      if (!hasAnalyzeGrant()) {
        return failure(state, 'record-intelligence', 'product-intelligence-authority', at, 'no-explicit-grant', 'no registered rights grant covers the analyze action in this tenant scope — recording intelligence is denied (fail-closed)');
      }
      const contentKind = declaration.contentKindText;
      if (!['fact', 'metric', 'observation'].includes(contentKind)) {
        return failure(state, 'record-intelligence', 'product-intelligence-authority', at, 'invalid-input', `content kind ${contentKind} is not in the vocabulary (fact | metric | observation)`);
      }
      const basis = declaration.basisKindText;
      if (!['cited-evidence', 'counterfactual-forecast'].includes(basis)) {
        return failure(state, 'record-intelligence', 'product-intelligence-authority', at, 'invalid-input', `basis ${basis} is not in the vocabulary (cited-evidence | counterfactual-forecast)`);
      }
      const subject = parseDeclaredJson(declaration.subjectJson, 'subjectJson');
      if (!subject.ok) return failure(state, 'record-intelligence', 'product-intelligence-authority', at, subject.code, subject.message);
      const content = parseDeclaredJson(declaration.contentJson, 'contentJson');
      if (!content.ok) return failure(state, 'record-intelligence', 'product-intelligence-authority', at, content.code, content.message);
      const source = parseDeclaredJson(declaration.sourceJson, 'sourceJson');
      if (!source.ok) return failure(state, 'record-intelligence', 'product-intelligence-authority', at, source.code, source.message);
      const version = (state.intelligence.get(declaration.recordId)?.version ?? 0) + 1;
      state.intelligence.set(declaration.recordId, {
        recordId: declaration.recordId,
        version,
        contentKind,
        basis,
        rightsStatus: 'granted',
        recordedAt: at,
      });
      return receipt(state, 'record-intelligence', 'product-intelligence-authority', at, {
        recordId: declaration.recordId,
        recordVersion: version,
        summary: `intelligence record ${declaration.recordId}@v${version} recorded (${contentKind}, ${basis}) under rights ref ${declaration.rightsRef}`,
      });
    },

    async declareComposePlan(declaration) {
      const at = now();
      const mission = resolveMission(declaration.missionId);
      if (!mission.ok) {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, mission.error, mission.message);
      }
      if (declaration.objectiveAlignmentText === '') {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'invalid-input', 'objective alignment is required and non-blank');
      }
      if (state.plans.has(declaration.planId)) {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'duplicate-marketing-plan', `a plan chain already exists under id ${declaration.planId} in this tenant scope`);
      }
      const platforms = parseDeclaredJson(declaration.platformsJson, 'platformsJson');
      if (!platforms.ok) return failure(state, 'compose-plan', 'marketing-planner-authority', at, platforms.code, platforms.message);
      if (!Array.isArray(platforms.value) || platforms.value.length === 0) {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'invalid-input', 'the plan requires at least one platform choice (≥ 1, unique per platform)');
      }
      const expectations = parseDeclaredJson(declaration.metricExpectationsJson, 'metricExpectationsJson');
      if (!expectations.ok) return failure(state, 'compose-plan', 'marketing-planner-authority', at, expectations.code, expectations.message);
      if (!Array.isArray(expectations.value) || expectations.value.length === 0) {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'invalid-input', 'the plan requires at least one metric expectation (≥ 1, unique per metric)');
      }
      const experimentExpectations = parseDeclaredJson(declaration.experimentExpectationsJson, 'experimentExpectationsJson');
      if (!experimentExpectations.ok) return failure(state, 'compose-plan', 'marketing-planner-authority', at, experimentExpectations.code, experimentExpectations.message);
      if (!Array.isArray(experimentExpectations.value) || experimentExpectations.value.length === 0) {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'invalid-input', 'the plan requires at least one experiment expectation (≥ 1)');
      }
      // The REAL citation discipline, mirrored: every evidence citation on
      // platforms + expectations must resolve against the recorded
      // intelligence (an evidence-less choice is an assertion).
      for (const platform of platforms.value) {
        if (!isRecord(platform) || typeof platform.platform !== 'string' || typeof platform.rationale !== 'string') {
          return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'invalid-input', 'every platform choice carries a platform id and a rationale');
        }
        const evidence = Array.isArray(platform.evidence) ? platform.evidence : [];
        if (evidence.length === 0 || !evidence.every(intelligenceCitationResolves)) {
          return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'evidence-citation-unresolvable', `the platform choice for ${String(platform.platform)} cites evidence that does not resolve against the recorded product-intelligence records`);
        }
      }
      for (const expectation of expectations.value) {
        const evidence = isRecord(expectation) && Array.isArray(expectation.evidence) ? expectation.evidence : [];
        if (evidence.length === 0 || !evidence.every(intelligenceCitationResolves)) {
          return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'evidence-citation-unresolvable', 'a metric expectation cites evidence that does not resolve against the recorded product-intelligence records');
        }
      }
      const experimentRefs = declaration.experimentRefsText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (experimentRefs.length === 0 || !experimentRefs.every((ref) => state.experiments.has(ref))) {
        return failure(state, 'compose-plan', 'marketing-planner-authority', at, 'invalid-input', 'the declared experiment refs must name at least one REAL registered experiment');
      }
      state.plans.set(declaration.planId, {
        planId: declaration.planId,
        version: 1,
        missionId: declaration.missionId,
        objectiveAlignment: declaration.objectiveAlignmentText,
        platforms: platforms.value
          .filter(isRecord)
          .map((platform) => ({
            platform: String(platform.platform),
            rationale: String(platform.rationale),
          })),
        metricExpectations: expectations.value
          .filter(isRecord)
          .map((expectation) => ({
            metric: String(expectation.metric ?? ''),
            expectation: String(expectation.expectation ?? ''),
            unit: String(expectation.unit ?? ''),
            basis: isRecord(expectation.basis) ? String(expectation.basis.kind ?? '') : '',
          })),
        experimentExpectations: experimentExpectations.value
          .filter(isRecord)
          .map((expectation) => ({
            question: String(expectation.question ?? ''),
            successCriterion: String(expectation.successCriterion ?? ''),
          })),
        experimentRefs,
        recordDigest: digestOf(declaration),
        composedAt: at,
        composedBy: 'principal-console',
      });
      return receipt(state, 'compose-plan', 'marketing-planner-authority', at, {
        recordId: declaration.planId,
        recordVersion: 1,
        summary: `marketing plan ${declaration.planId}@v1 composed for mission ${declaration.missionId} — ${platforms.value.length} platforms, ${expectations.value.length} metric expectations, ${experimentRefs.length} experiment refs`,
      });
    },

    async declareCompileStrategy(declaration) {
      const at = now();
      const plan = state.plans.get(declaration.planId);
      if (plan === undefined) {
        return failure(state, 'compile-strategy', 'strategy-compiler-authority', at, 'marketing-plan-not-found', `the plan chain ${declaration.planId} does not exist in this tenant scope (cross-tenant ≡ unknown — no existence leak)`);
      }
      const version = declaration.planVersion === 0 ? plan.version : declaration.planVersion;
      if (version !== plan.version) {
        return failure(state, 'compile-strategy', 'strategy-compiler-authority', at, 'invalid-input', `plan ${declaration.planId} has latest version ${plan.version}; version ${version} was requested`);
      }
      const strategyId = `prod003-strategy:${plan.planId}@v${plan.version}`;
      if (state.strategies.has(strategyId)) {
        return failure(state, 'compile-strategy', 'strategy-compiler-authority', at, 'invalid-input', `strategy ${strategyId} already exists in this tenant scope`);
      }
      state.strategies.set(strategyId, {
        strategyId,
        planId: plan.planId,
        planVersion: plan.version,
        missionSummary: plan.objectiveAlignment,
        organizationName: 'generalist-baseline',
        topology: 'generalist',
        roles: [
          { roleId: 'role-controller', title: 'Controller', modelId: 'glm-4.7' },
          { roleId: 'role-generalist', title: 'Generalist', modelId: 'glm-4.7' },
        ],
        delegationEdges: [
          { edgeId: 'edge-1', fromRoleId: 'role-controller', toRoleId: 'role-generalist', type: 'task-delegation', purpose: 'delegate the planned phases' },
        ],
        phases: [
          { phaseId: 'phase-review', kind: 'review', roleId: 'role-controller', declaredDurationDays: 3 },
          { phaseId: 'phase-execute', kind: 'execution', roleId: 'role-generalist', declaredDurationDays: 7 },
        ],
        budgets: { currency: 'USD', totalCeiling: 1000 },
        comparators: [
          { name: 'generalist-baseline', kind: 'baseline' },
        ],
        compiledAt: at,
      });
      return receipt(state, 'compile-strategy', 'strategy-compiler-authority', at, {
        recordId: strategyId,
        recordVersion: 1,
        summary: `strategy ${strategyId} compiled from plan ${plan.planId}@v${plan.version} — generalist organization, 2 roles, 1 delegation edge, 2 phases`,
      });
    },

    async declareCreateRun(declaration) {
      const at = now();
      const strategy = state.strategies.get(declaration.strategyId);
      if (strategy === undefined) {
        return failure(state, 'create-run', 'automation-engine-authority', at, 'invalid-input', `strategy ${declaration.strategyId} does not exist in this tenant scope`);
      }
      const runId = `run-${strategy.planId}-1`;
      if (state.runs.has(runId)) {
        return failure(state, 'create-run', 'automation-engine-authority', at, 'invalid-input', `run ${runId} already exists for this strategy`);
      }
      state.runs.set(runId, {
        runId,
        strategyId: strategy.strategyId,
        lifecycle: 'compiled',
        missionSummary: strategy.missionSummary,
        createdAt: at,
        armedAt: null,
        experimentId: null,
        trail: [
          {
            eventId: `${runId}-ev1`,
            at,
            kind: 'run-created',
            detail: `run created in the 'compiled' state — awaiting authorization (nothing executes)`,
          },
        ],
      });
      return receipt(state, 'create-run', 'automation-engine-authority', at, {
        recordId: runId,
        recordVersion: 1,
        lifecycleState: 'compiled',
        summary: `run ${runId} created from strategy ${strategy.strategyId} in the 'compiled' state — it waits for authorization (the arm gate)`,
      });
    },

    async declareArmRun(declaration) {
      const at = now();
      const run = state.runs.get(declaration.runId);
      if (run === undefined) {
        return failure(state, 'arm-run', 'automation-engine-authority', at, 'invalid-input', `run ${declaration.runId} does not exist in this tenant scope`);
      }
      // The REAL engine's illegal-transition name, verbatim.
      if (run.lifecycle !== 'compiled') {
        return failure(state, 'arm-run', 'automation-engine-authority', at, 'ILLEGAL_TRANSITION', `illegal lifecycle transition ${run.lifecycle} → armed: arm() is only legal from the compiled state`);
      }
      const strategy = state.strategies.get(run.strategyId);
      const plan = strategy === undefined ? undefined : state.plans.get(strategy.planId);
      const experimentRef = plan?.experimentRefs[0];
      // The REAL engine's binding-failure name + template, verbatim.
      if (experimentRef === undefined) {
        return failure(state, 'arm-run', 'automation-engine-authority', at, 'EXPERIMENT_BINDING_FAILED', `experiment binding failed for (none): strategy carries no experiment references to bind`);
      }
      const experiment = state.experiments.get(experimentRef);
      if (experiment === undefined || experiment.status !== 'active') {
        return failure(state, 'arm-run', 'automation-engine-authority', at, 'EXPERIMENT_BINDING_FAILED', `experiment binding failed for ${experimentRef}: binding for ${experimentRef} is not active (status: ${experiment?.status ?? 'unknown'})`);
      }
      // The REAL §27 run-right gate, mirrored: without a granted rights
      // action the arm is DENIED with the engine's verbatim name/template.
      if (!hasAnalyzeGrant()) {
        return failure(state, 'arm-run', 'automation-engine-authority', at, 'ARM_RIGHTS_DENIED', `run rights gate denied arming: no registered rights grant covers the run right in this tenant scope`);
      }
      const armed: DoubleRun = {
        ...run,
        lifecycle: 'armed',
        armedAt: at,
        experimentId: experimentRef,
        trail: [
          ...run.trail,
          {
            eventId: `${run.runId}-ev2`,
            at,
            kind: 'armed',
            detail: `armed against experiment ${experimentRef} via binding binding-${experimentRef}`,
          },
        ],
      };
      state.runs.set(run.runId, armed);
      return receipt(state, 'arm-run', 'automation-engine-authority', at, {
        recordId: run.runId,
        recordVersion: 2,
        lifecycleState: 'armed',
        summary: `run ${run.runId} armed against experiment ${experimentRef} — it now waits on the job-execution transport (the disclosed P2 boundary)`,
      });
    },

    async loadConsoleIntentLedgerRecord(intentId, ledgerScope: TenantScope) {
      const record = state.ledger.get(intentId);
      if (record === undefined) {
        return null;
      }
      // Tenant scoping: the ledger is per-composition and the composition
      // is per-scope; a different scope's id resolves to null (no leak).
      if (ledgerScope.tenantId !== scope.tenantId) {
        return null;
      }
      return record;
    },
  };
}
