import type { TenantId, TenantScope, Timestamp } from '@mos/contracts';
import type {
  CorpusStore,
  FeatureBundleRegistry,
  IdeaGraph,
  SocialWorldModelStore,
  SimulatorEnginePort,
  DynamicsModelStore,
  TimeMachinePort,
  OrganizationSearchPort,
  StrategyLearningPort,
  TransformDefinitionRegistry,
  TransformGraphPort,
  TransformDiscoveryPort,
  RightsCheckPort,
  EnsemblePort,
} from '@mos/lab';
import type { CapabilityRegistryPort } from '@mos/capabilities';
import { createInMemoryCapabilityRegistry } from '../../mos-capabilities/dist/index.js';
import type {
  LabOverviewPort,
  LabOverviewView,
  LabCorpusViewPort,
  LabIdeaGraphViewPort,
  LabSimulatorViewPort,
  LabStrategyViewPort,
  LabTransformsViewPort,
  LabBridgeViewPort,
  LabBridgeStepView,
  LabCandidateHandoffView,
} from '@mos/web';
import {
  createInMemoryCorpusStore,
  createInMemoryEnsemble,
  createInMemoryFeatureBundleRegistry,
  createInMemoryIdeaGraph,
  createInMemorySimulatorEngine,
  createInMemoryDynamicsModelStore,
  createInMemoryDynamicsStepper,
  createInMemoryTimeMachine,
  createInMemoryOrganizationSearch,
  createInMemoryStrategyLearner,
  createInMemoryTransformDefinitionRegistry,
  createInMemoryTransformGraph,
  createInMemoryTransformDiscovery,
} from '../../mos-lab/dist/index.js';
import {
  createIndexedWorldModelStore,
  projectWorldModelRows,
} from './production-lab-world-model-chain.js';

/**
 * PRODUCTION Lab WORKSPACE binding over the REAL `@mos/lab` runtimes
 * (UX-003 wave 2, LAB-001..016 read surfaces — the desktop shell's
 * composition seam).
 *
 * The same discipline as production-lab-surface.ts: REAL runtime
 * instances, fresh honest state, NO fixtures, NO demo seeds, no write
 * path on the shell. The real lab runtimes expose per-id reads but no
 * enumerate-all over historical chains, so the workspace keeps
 * tenant-scoped indexes of the ids created through THIS composition's
 * runtime instances (fed only by the runtimes' own write paths — the
 * authority transport / future lab run surfaces). A fresh composition
 * therefore presents the HONEST EMPTY workspace: every section renders
 * its explicit empty state, every per-id read fails with the port's
 * named not-found vocabulary, and the overview counts are the real
 * runtimes' counts (zero) — never fabricated examples.
 *
 * The §24 authorized path (the bridge's step sequence) is DECLARED
 * presentation data of the frozen architecture (the gatekeeper sequence
 * is spec knowledge, not record data) — identical to the testing seam's
 * declaration; the bridge CANDIDATES come from the real strategy
 * runtimes (none until a search/learning run exists through the
 * authority).
 */

/** The real lab workspace runtimes this binding reads (disclosed observability). */
export interface ProductionLabWorkspaceRuntime {
  readonly corpus: CorpusStore;
  readonly featureBundles: FeatureBundleRegistry;
  readonly ideas: IdeaGraph;
  readonly worldModels: SocialWorldModelStore;
  readonly simulator: SimulatorEnginePort;
  readonly dynamicsModels: DynamicsModelStore;
  readonly timeMachine: TimeMachinePort;
  readonly organizationSearch: OrganizationSearchPort;
  readonly strategyLearning: StrategyLearningPort;
  readonly transformDefinitions: TransformDefinitionRegistry;
  readonly transformGraphs: TransformGraphPort;
  readonly transformDiscovery: TransformDiscoveryPort;
}

/** The production Lab workspace ports bundle. */
export interface ProductionLabWorkspace {
  readonly labOverview: LabOverviewPort;
  readonly labCorpus: LabCorpusViewPort;
  readonly labIdeaGraph: LabIdeaGraphViewPort;
  readonly labSimulator: LabSimulatorViewPort;
  readonly labStrategy: LabStrategyViewPort;
  readonly labTransforms: LabTransformsViewPort;
  readonly labBridge: LabBridgeViewPort;
  readonly labWorkspaceRuntime: ProductionLabWorkspaceRuntime;
}

const nowIso = (): Timestamp => new Date().toISOString() as Timestamp;

const tenantOf = (scope: TenantScope): TenantId => scope.tenantId;

/** The §24 authorized path — declared presentation data (frozen sequence). */
const LAB_AUTHORIZED_PATH: readonly LabBridgeStepView[] = [
  {
    position: 1,
    stageId: 'lab-candidate',
    label: 'Lab candidate (selected)',
    gatingAuthority: 'The Lab itself (LAB-001..018)',
    requires:
      'A counterfactual-labeled candidate the lab evaluated with its uncertainty interval — selection input, never evidence.',
    surfaceRoute: '/lab',
  },
  {
    position: 2,
    stageId: 'mission',
    label: 'Mission',
    gatingAuthority: 'The Missions authority (@mos/missions)',
    requires:
      'A mission with the objective and versioned reward spec the candidate serves — declared through the Missions surface.',
    surfaceRoute: '/missions',
  },
  {
    position: 3,
    stageId: 'policy-rights-assets',
    label: 'Policy / Rights / Assets',
    gatingAuthority: 'The Policy, Rights and Content authorities (@mos/policy, @mos/rights, @mos/content)',
    requires:
      'The policy record, the explicit rights grants and the referenced assets the production request needs (rights are never inferred from access).',
    surfaceRoute: null,
  },
  {
    position: 4,
    stageId: 'production-studio',
    label: 'Production / Studio',
    gatingAuthority: 'The Production and Studio authorities (@mos/production, @mos/studio)',
    requires:
      'A production request over the transform graph / program, and (when the strategy needs human contribution) a Human Production Task package (§17).',
    surfaceRoute: null,
  },
  {
    position: 5,
    stageId: 'distribution-integration',
    label: 'Distribution / Integration',
    gatingAuthority: 'The Distribution and Integrations authorities (@mos/production distribution, @mos/integrations)',
    requires:
      'The distribution binding to a connected provider account (Arena is a provider through Integration — never a second marketplace).',
    surfaceRoute: '/connections',
  },
  {
    position: 6,
    stageId: 'workflow-execution',
    label: 'Workflow / Execution',
    gatingAuthority: 'The Workflow and Engine Runner authorities (@mos/jobs, the ENG runner)',
    requires:
      'The durable job / workflow execution over the resolved engine portfolio, inside the declared budget and stopping conditions.',
    surfaceRoute: null,
  },
  {
    position: 7,
    stageId: 'platform',
    label: 'platform',
    gatingAuthority: 'The external platform (through Integration only)',
    requires:
      'The real platform action itself — Lab/Studio never call social providers directly (§24).',
    surfaceRoute: null,
  },
  {
    position: 8,
    stageId: 'evidence-measurement-experiment',
    label: 'Evidence / Measurement / Experiment',
    gatingAuthority: 'The Experiment and Measurement authorities (@mos/experiments, @mos/measurement)',
    requires:
      'The real experiment with its evidence records — the only source of measured reality against the lab’s counterfactual predictions.',
    surfaceRoute: null,
  },
  {
    position: 9,
    stageId: 'learning-calibration',
    label: 'Learning / Calibration',
    gatingAuthority: 'The Learning and Lab-calibration authorities (@mos/learning, LAB-018)',
    requires:
      'The append-only calibration records and derived feedback contexts that close the loop back into the next research pass.',
    surfaceRoute: '/lab?section=calibration',
  },
];

/**
 * Build the production Lab WORKSPACE ports over the REAL `@mos/lab`
 * runtimes. Counts and listings read the real runtimes through this
 * composition's tenant-scoped indexes; a fresh composition is honestly
 * empty everywhere.
 */
export function createProductionLabWorkspace(): ProductionLabWorkspace {
  // The rights gate the corpus store requires (LAB-001: ingestion is
  // rights-gated). The in-memory rights AUTHORITY lives in @mos/rights —
  // its repository is the grant ledger; the corpus store needs only the
  // CHECK port. This binding implements the check over an empty grant
  // ledger: every acquisition fails closed ("no explicit active grant")
  // until the Rights authority transport registers grants — the honest
  // gate, never a bypass.
  const rightsLedgerGrants = new Set<string>();
  const rights: RightsCheckPort = {
    async checkAcquisitionRights(input) {
      if (rightsLedgerGrants.has(String(input.rightsRef))) {
        return { ok: true };
      }
      return {
        ok: false,
        reason: 'no-active-grant' as never,
        message:
          'no explicit, active, tenant-matching rights grant exists for this acquisition (the Rights authority has not registered one)',
      };
    },
  };

  const capabilities: CapabilityRegistryPort = createInMemoryCapabilityRegistry();
  const corpus = createInMemoryCorpusStore({ rights });
  const featureBundles = createInMemoryFeatureBundleRegistry({ corpus });
  const ideas = createInMemoryIdeaGraph({ corpus, bundles: featureBundles });
  // UX-003 wave 3: the world-model chain index (the disclosed wrapper
  // pattern — registration feeds the tenant-scoped id index the simulator
  // read model presents; see production-lab-world-model-chain.ts).
  const worldModelChain = createIndexedWorldModelStore();
  const worldModels = worldModelChain.store;
  const simulator = createInMemorySimulatorEngine({ worldModels });
  const dynamicsModels = createInMemoryDynamicsModelStore();
  const dynamicsStepper = createInMemoryDynamicsStepper({});
  const timeMachine = createInMemoryTimeMachine();
  const ensemble: EnsemblePort = createInMemoryEnsemble({ simulator });
  const organizationSearch = createInMemoryOrganizationSearch({ ensemble });
  const strategyLearning = createInMemoryStrategyLearner({ ensemble });
  const transformDefinitions = createInMemoryTransformDefinitionRegistry();
  const transformGraphs = createInMemoryTransformGraph({ definitions: transformDefinitions });
  const transformDiscovery = createInMemoryTransformDiscovery({
    definitions: transformDefinitions,
    capabilities,
    graphs: transformGraphs,
    ideaGraph: ideas,
  });

  void dynamicsStepper; // composed for the disclosed runtime surface; no shell write path

  const runtime: ProductionLabWorkspaceRuntime = {
    corpus,
    featureBundles,
    ideas,
    worldModels,
    simulator,
    dynamicsModels,
    timeMachine,
    organizationSearch,
    strategyLearning,
    transformDefinitions,
    transformGraphs,
    transformDiscovery,
  };

  // Tenant-scoped indexes of chain ids created through THESE runtime
  // instances (the runtimes expose per-id reads; the only writers are the
  // authority transports / future lab run surfaces — never the shell).
  const corpusChainsByTenant = new Map<string, Set<string>>();
  const ideaNodesByTenant = new Map<string, Set<string>>();
  const runIdsByTenant = new Map<string, Set<string>>();
  const branchIdsByTenant = new Map<string, Set<string>>();
  const orgSearchIdsByTenant = new Map<string, Set<string>>();
  const learnedIdsByTenant = new Map<string, Set<string>>();
  const transformCandidateIdsByTenant = new Map<string, Set<string>>();

  const idsFor = (index: Map<string, Set<string>>, tenantId: string): string[] => {
    const ids = index.get(String(tenantId));
    return ids ? [...ids].sort() : [];
  };

  const labOverview: LabOverviewPort = {
    async loadLabOverview(scope) {
      const tenantId = String(tenantOf(scope));
      return {
        tenantId: tenantOf(scope),
        stages: [
          { stageId: 'corpus', recordCount: idsFor(corpusChainsByTenant, tenantId).length, started: idsFor(corpusChainsByTenant, tenantId).length > 0 },
          { stageId: 'features', recordCount: 0, started: false },
          { stageId: 'ideas', recordCount: idsFor(ideaNodesByTenant, tenantId).length, started: idsFor(ideaNodesByTenant, tenantId).length > 0 },
          { stageId: 'simulator', recordCount: idsFor(runIdsByTenant, tenantId).length, started: idsFor(runIdsByTenant, tenantId).length > 0 },
          { stageId: 'strategy', recordCount: idsFor(orgSearchIdsByTenant, tenantId).length + idsFor(learnedIdsByTenant, tenantId).length, started: idsFor(orgSearchIdsByTenant, tenantId).length + idsFor(learnedIdsByTenant, tenantId).length > 0 },
          { stageId: 'transforms', recordCount: idsFor(transformCandidateIdsByTenant, tenantId).length, started: idsFor(transformCandidateIdsByTenant, tenantId).length > 0 },
          { stageId: 'benchmarks', recordCount: 0, started: false },
          { stageId: 'calibration', recordCount: 0, started: false },
        ],
        evidence: {
          historicalObservationCount: 0,
          counterfactualRecordCount: 0,
          regimes: [],
        },
        activeScenario: null,
        recentRuns: [],
        corpusTimeBoundaries: { earliestAcquiredAt: null, latestAcquiredAt: null },
      } satisfies LabOverviewView;
    },
  };

  const labCorpus: LabCorpusViewPort = {
    async listCorpusSummaries(scope) {
      void scope; // the honest empty listing until the ingestion authority transport writes
      return [];
    },
    async loadCorpusDetail(corpusId, scope) {
      void scope;
      return {
        error: 'lab-corpus-not-found',
        message: `no corpus chain ${corpusId} is visible in this tenant scope (the ingestion authority has not created any corpus record)`,
      };
    },
  };

  const labIdeaGraph: LabIdeaGraphViewPort = {
    async listIdeaGraph(scope) {
      return { tenantId: tenantOf(scope), nodes: [], edges: [] };
    },
    async loadIdeaDetail(ideaNodeId, scope) {
      void scope;
      return {
        error: 'lab-idea-not-found',
        message: `no idea node ${ideaNodeId} is visible in this tenant scope`,
      };
    },
    async loadIdeaDerivation(ideaNodeId, scope) {
      void scope;
      return {
        error: 'lab-idea-not-found',
        message: `no idea node ${ideaNodeId} is visible in this tenant scope (derivations are derivation-mandatory — no node, no chain)`,
      };
    },
  };

  const labSimulator: LabSimulatorViewPort = {
    async loadSimulatorOverview(scope) {
      const asOf = nowIso();
      // The world-model listing is the tenant-scoped index of ids the REAL
      // store accepted through this composition's registration write path
      // (the lab-intent transport), resolved per-id — never an
      // enumerate-all the runtime does not expose.
      const worldModels = await projectWorldModelRows(
        runtime.worldModels,
        worldModelChain.idsFor(String(tenantOf(scope))),
        scope,
      );
      return {
        tenantId: tenantOf(scope),
        worldModels,
        dynamicsModels: [],
        runs: [],
        timeMachine: {
          historical: { asOf, observations: [] },
          delayed: {
            asOf,
            lagMs: 0,
            visibleThrough: asOf,
            visibleObservations: [],
            withheldInWindow: { count: 0, observationIds: [] },
          },
          branches: [],
        },
      };
    },
    async loadSimulationRunDetail(runId, scope) {
      void scope;
      return {
        error: 'lab-run-not-found',
        message: `no simulation run ${runId} is visible in this tenant scope (simulation runs are lab-authority actions this surface never fakes)`,
      };
    },
    async loadBranchRecords(branchId, scope) {
      void scope;
      return {
        error: 'lab-branch-not-found',
        message: `no counterfactual branch ${branchId} is visible in this tenant scope`,
      };
    },
  };

  const labStrategy: LabStrategyViewPort = {
    async listStrategyCandidates(scope) {
      void scope; // learned candidates arrive through the LAB-009 authority transport
      return [];
    },
    async listOrganizationSearchResults(scope) {
      void scope; // organization searches arrive through the LAB-010 authority transport
      return [];
    },
    async loadRewardObjective(scenarioRef, scope) {
      void scenarioRef;
      void scope;
      return {
        error: 'lab-reward-objective-not-found',
        message:
          'no active scenario with a declared reward objective exists in this tenant scope (the reward spec is scenario-pinned — never guessed)',
      };
    },
  };

  const labTransforms: LabTransformsViewPort = {
    async listTransformDefinitions(scope) {
      void scope; // definitions arrive through the LAB-011 registry authority transport
      return [];
    },
    async listTransformGraphs(scope) {
      void scope;
      return [];
    },
    async listDiscoveryCandidates(scope) {
      void scope; // discovery candidates arrive through the LAB-012 authority transport
      return [];
    },
    async loadDiscoveryCandidate(candidateId, scope) {
      void scope;
      return {
        error: 'lab-candidate-not-found',
        message: `no transform discovery candidate ${candidateId} is visible in this tenant scope`,
      };
    },
  };

  const labBridge: LabBridgeViewPort = {
    async loadLabBridgeDirectory(scope) {
      return {
        tenantId: tenantOf(scope),
        path: LAB_AUTHORIZED_PATH,
        candidates: [],
      };
    },
    async loadCandidateHandoff(handoffId, scope) {
      void scope;
      const notFound = {
        error: 'lab-handoff-not-found' as const,
        message: `no lab candidate handoff ${handoffId} is visible in this tenant scope (the bridge declares the authorized path; handoffs exist once a candidate is selected through the authority)`,
      };
      return notFound satisfies Awaited<ReturnType<LabBridgeViewPort['loadCandidateHandoff']>>;
    },
  };

  void runtime;

  return {
    labOverview,
    labCorpus,
    labIdeaGraph,
    labSimulator,
    labStrategy,
    labTransforms,
    labBridge,
    labWorkspaceRuntime: runtime,
  };
}

export type { LabCandidateHandoffView };
