/**
 * Agent Console read port (the CONSOLE wave) — the mission-first
 * orchestration workspace's view models, one load per working mode.
 *
 * The Console is the operational center of MOS (FINAL TL HANDOFF §4): a
 * selected mission + a unified work stream. Every view model here is a
 * PROJECTION of what the real authorities hold — counts + ids + verbatim
 * vocabulary, §31 tenant context, counterfactual/measured labels where the
 * domain carries them. No fabricated progress, no invented states: runs
 * show the lifecycle the engine recorded, plans show the citations the
 * planner required, approvals show the gates the rights authority owns.
 *
 * Presentation-only discipline: this port returns view models, never
 * domain records; the web module's registry dependencies stay
 * `[contracts]`. Implemented at the composition seam OUTSIDE `src/` (the
 * testing double + the production binding over the REAL @mos/missions,
 * @mos/agents, @mos/rights, @mos/product-intelligence and
 * @mos/experiments runtimes).
 */

import type { TenantScope } from '@mos/contracts';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** Typed failure for every console load (kebab-case codes, never thrown). */
export interface ConsoleLoadFailure {
  readonly error: 'console-unavailable' | 'console-load-failed';
  readonly message: string;
}

/** The mission banner every mode carries (the selected mission context). */
export interface ConsoleMissionBannerView {
  readonly missionId: string;
  readonly title: string;
  readonly objective: string;
  /** The mission status vocabulary, verbatim. */
  readonly status: string;
  /** The cited record version. */
  readonly recordVersion: number;
  /** Success criteria as declared (metric + direction, verbatim). */
  readonly successCriteria: readonly { readonly metric: string; readonly direction: string }[];
  /** Constraints summary (budget/deadline where the mission declares them). */
  readonly constraints: readonly { readonly kind: string; readonly value: string }[];
}

/** Where the console workflow stands for one mission (honest counts). */
export interface ConsoleWorkflowStandingsView {
  readonly plansCount: number;
  readonly strategiesCount: number;
  readonly runsCount: number;
  /** Runs in 'compiled' — awaiting authorization (the approval queue). */
  readonly runsAwaitingAuthorization: number;
  /** Runs in 'armed' — authorized, waiting on the disclosed P2 transport. */
  readonly runsArmed: number;
  /** Runs in any other lifecycle state (running/measured/closed/halted). */
  readonly runsOther: number;
}

// ---------------------------------------------------------------------------
// Direct mode
// ---------------------------------------------------------------------------

/** The Direct mode: the mission's standing directive + plan readiness. */
export interface ConsoleDirectData {
  readonly mission: ConsoleMissionBannerView;
  /** Where this mission's workflow stands (honest counts of real records). */
  readonly standings: ConsoleWorkflowStandingsView;
  /**
   * What the evidence path currently resolves (honest counts of REAL
   * records the authorities hold): intelligence records, rights grants,
   * experiments, plans.
   */
  readonly readiness: {
    readonly intelligenceRecords: number;
    readonly rightsGrants: number;
    readonly experiments: number;
    readonly plans: number;
  };
}

// ---------------------------------------------------------------------------
// Plan mode
// ---------------------------------------------------------------------------

/** One marketing plan chain as the console presents it. */
export interface ConsolePlanChainView {
  readonly planId: string;
  readonly latestVersion: number;
  readonly missionId: string;
  readonly objectiveAlignment: string;
  /** Platform choices: ids + rationale counts (the citation counts the planner recorded). */
  readonly platforms: readonly { readonly platform: string; readonly rationale: string }[];
  /** Metric expectations: metric + expectation + unit + basis label (verbatim §25 vocabulary). */
  readonly metricExpectations: readonly {
    readonly metric: string;
    readonly expectation: string;
    readonly unit: string;
    readonly basis: string;
  }[];
  /** Experiment expectations: question + success criterion (verbatim). */
  readonly experimentExpectations: readonly {
    readonly question: string;
    readonly successCriterion: string;
  }[];
  /** The record digest (the authority's own integrity value, verbatim). */
  readonly recordDigest: string;
  readonly composedAt: string;
  readonly composedBy: string;
  /** The boundary statement, pinned verbatim on every record. */
  readonly boundaryStatement: string;
}

/** One compiled strategy's phase row. */
export interface ConsoleStrategyPhaseView {
  readonly phaseId: string;
  readonly kind: string;
  readonly roleId: string;
  readonly platformId: string | null;
  readonly metricId: string | null;
  readonly dependsOnCount: number;
  readonly declaredDurationDays: number;
}

/** One compiled strategy's delegation edge row. */
export interface ConsoleDelegationEdgeView {
  readonly edgeId: string;
  readonly fromRoleId: string;
  readonly toRoleId: string;
  readonly type: string;
  readonly purpose: string;
}

/** One compiled strategy's agent role row. */
export interface ConsoleAgentRoleView {
  readonly roleId: string;
  readonly title: string;
  readonly responsibilitiesCount: number;
  readonly modelId: string;
}

/** One compiled strategy as the console presents it. */
export interface ConsoleStrategyView {
  readonly strategyId: string;
  readonly sourcePlan: { readonly planId: string; readonly version: number };
  readonly missionSummary: string;
  /** The organization candidate summary (§23 dimensions, verbatim kinds). */
  readonly organization: {
    readonly name: string;
    readonly topology: string;
    readonly roles: readonly ConsoleAgentRoleView[];
    readonly delegationEdges: readonly ConsoleDelegationEdgeView[];
    readonly phases: readonly ConsoleStrategyPhaseView[];
    readonly budgets: { readonly currency: string; readonly totalCeiling: number };
    readonly termination: string;
    readonly toolGrantsCount: number;
    readonly communication: string;
    readonly memorySharing: string;
  };
  /** The AGT-003 validation receipt the compiler recorded (verbatim). */
  readonly organizationValidation: { readonly authorityRecord: string };
  /** Declared comparators (name + kind, verbatim). */
  readonly comparators: readonly { readonly name: string; readonly kind: string }[];
  /** The expected-value-of-delay computation summary, when the compiler produced one. */
  readonly expectedValueOfDelay: {
    readonly value: string;
    readonly perDayDelayCost: string;
    readonly deadlinePressure: string;
  } | null;
  /** Counterfactual forecasts riding the strategy (§22 labels verbatim). */
  readonly forecastsCount: number;
}

/** The Plan mode: plan chains + compiled strategies for the mission. */
export interface ConsolePlanData {
  readonly mission: ConsoleMissionBannerView;
  readonly planChains: readonly ConsolePlanChainView[];
  readonly strategies: readonly ConsoleStrategyView[];
}

// ---------------------------------------------------------------------------
// Research mode
// ---------------------------------------------------------------------------

/** One product-intelligence record row (the §25 evidence the plans cite). */
export interface ConsoleIntelligenceRecordView {
  readonly recordId: string;
  readonly version: number;
  readonly contentKind: string;
  /** The basis label, verbatim (cited-evidence | counterfactual-forecast). */
  readonly basis: string;
  /** Rights status as the authority's gate holds it (granted | denied reason). */
  readonly rightsStatus: string;
  readonly recordedAt: string;
}

/** One experiment row (the REAL experiments the mission's runs arm against). */
export interface ConsoleExperimentView {
  readonly experimentId: string;
  readonly question: string;
  /** The binding status the experiments authority reports (verbatim). */
  readonly status: string;
}

/**
 * The Research mode: the mission's evidence base + the Lab links. The Lab
 * itself stays at `/lab` (its own workspace); this view links into it and
 * shows what the plan citations resolve against.
 */
export interface ConsoleResearchData {
  readonly mission: ConsoleMissionBannerView;
  readonly intelligenceRecords: readonly ConsoleIntelligenceRecordView[];
  readonly experiments: readonly ConsoleExperimentView[];
  /** Links into the Lab workspace sections (route paths, honest labels). */
  readonly labLinks: readonly { readonly label: string; readonly href: string }[];
}

// ---------------------------------------------------------------------------
// Results mode
// ---------------------------------------------------------------------------

/** One trail event row (the run's §30 audit trail, verbatim kinds + details). */
export interface ConsoleRunTrailEventView {
  readonly eventId: string;
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
  /** Job/distribution provenance enrichment, when the event carried it. */
  readonly provenance: { readonly jobId?: string; readonly actionId?: string; readonly authority?: string } | null;
}

/** One publish action row on a run. */
export interface ConsoleRunActionView {
  readonly actionId: string;
  readonly platformId: string;
  readonly channel: string;
  readonly status: string;
}

/** One automation run as the console presents it. */
export interface ConsoleRunView {
  readonly runId: string;
  readonly strategyId: string;
  /** The lifecycle the engine recorded (verbatim vocabulary). */
  readonly lifecycle: string;
  readonly missionSummary: string;
  /** The budget ledger (currency + spent + ceiling, verbatim numbers). */
  readonly ledger: { readonly currency: string; readonly spent: number; readonly ceiling: number };
  readonly actions: readonly ConsoleRunActionView[];
  /** The collected metrics (metric + value, measured — never forecast). */
  readonly collectedMetrics: readonly { readonly metricId: string; readonly value: string }[];
  readonly trail: readonly ConsoleRunTrailEventView[];
  /** The experiment binding the run armed against, when armed. */
  readonly experimentBinding: { readonly experimentId: string; readonly bindingId: string } | null;
  /** The evidence receipt the measured run produced, when recorded. */
  readonly evidenceReceipt: { readonly evidenceId: string; readonly experimentId: string } | null;
  /** The typed halt, when the run halted (reason verbatim). */
  readonly halt: { readonly reason: string; readonly detail: string } | null;
  readonly stepCount: number;
  readonly maxSteps: number;
  /**
   * What this run waits for, honestly: 'authorization' (compiled),
   * 'job-execution-transport' (armed — the disclosed P2 boundary), or null.
   */
  readonly waitingOn: string | null;
}

/** The Results mode: the mission's runs + artifact references. */
export interface ConsoleResultsData {
  readonly mission: ConsoleMissionBannerView;
  readonly runs: readonly ConsoleRunView[];
  /** The durable artifact references (plans + strategies, ids + versions). */
  readonly artifacts: readonly { readonly kind: string; readonly id: string; readonly version: number }[];
}

// ---------------------------------------------------------------------------
// Control mode
// ---------------------------------------------------------------------------

/** One rights grant row (the permissions the tenant holds, verbatim states). */
export interface ConsoleRightsGrantView {
  readonly grantId: string;
  readonly rightsHolderId: string;
  readonly action: string;
  /** The grant's state as the rights authority holds it (verbatim). */
  readonly status: string;
}

/** The Control mode: the authorization queue + granted permissions. */
export interface ConsoleControlData {
  readonly mission: ConsoleMissionBannerView;
  /** Runs in 'compiled' — the approval queue (arm is the approving action). */
  readonly awaitingAuthorization: readonly {
    readonly runId: string;
    readonly strategyId: string;
    readonly missionSummary: string;
    readonly declaredAt: string;
  }[];
  /** Runs in 'armed' — authorized, waiting on the disclosed P2 transport. */
  readonly authorized: readonly {
    readonly runId: string;
    readonly strategyId: string;
    readonly experimentId: string;
    readonly authorizedAt: string;
  }[];
  /** The tenant's rights grants (the permissions the evidence path needs). */
  readonly rightsGrants: readonly ConsoleRightsGrantView[];
}

// ---------------------------------------------------------------------------
// Agents view
// ---------------------------------------------------------------------------

/** One agent body row (AGT-001 — the runtime's capability contracts). */
export interface ConsoleAgentBodyView {
  readonly bodyId: string;
  readonly version: number;
  /** The role contract label, verbatim. */
  readonly role: string;
  readonly capabilitiesCount: number;
}

/** One registered organization row (AGT-003, tenant-scoped). */
export interface ConsoleOrganizationView {
  readonly organizationId: string;
  readonly version: number;
  readonly name: string;
  /** The topology shape label, verbatim. */
  readonly topology: string;
  readonly nodesCount: number;
  readonly edgesCount: number;
}

/** The Agents view: the real registries the compiler validates against. */
export interface ConsoleAgentsData {
  readonly agentBodies: readonly ConsoleAgentBodyView[];
  readonly organizations: readonly ConsoleOrganizationView[];
  /**
   * Honest disclosure when the registries are empty: compilation's
   * organization validation needs registered bodies — the composition
   * registers the standard catalog through the REAL registration API.
   */
  readonly bodiesNote: string | null;
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The Agent Console read port — one load per working mode, all
 * mission-scoped except the agents registry view. Failures degrade to the
 * typed failure; empty states are REAL states, never errors.
 */
export interface AgentConsolePort {
  /** The Direct mode: standing directive + plan readiness. */
  loadConsoleDirect(
    missionId: string | null,
    scope: TenantScope,
  ): Promise<ConsoleDirectData | ConsoleLoadFailure>;
  /** The Plan mode: plan chains + compiled strategies. */
  loadConsolePlan(
    missionId: string | null,
    scope: TenantScope,
  ): Promise<ConsolePlanData | ConsoleLoadFailure>;
  /** The Research mode: evidence base + Lab links. */
  loadConsoleResearch(
    missionId: string | null,
    scope: TenantScope,
  ): Promise<ConsoleResearchData | ConsoleLoadFailure>;
  /** The Results mode: runs + artifacts. */
  loadConsoleResults(
    missionId: string | null,
    scope: TenantScope,
  ): Promise<ConsoleResultsData | ConsoleLoadFailure>;
  /** The Control mode: authorization queue + granted permissions. */
  loadConsoleControl(
    missionId: string | null,
    scope: TenantScope,
  ): Promise<ConsoleControlData | ConsoleLoadFailure>;
  /** The Agents view: the real registries. */
  loadConsoleAgents(scope: TenantScope): Promise<ConsoleAgentsData | ConsoleLoadFailure>;
}
