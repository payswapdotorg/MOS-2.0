import type { TenantScope } from '@mos/contracts';
import type { LabOverviewPort } from '../dist/src/ports/lab-overview.js';
import type { LabCorpusViewPort } from '../dist/src/ports/lab-corpus.js';
import type { LabIdeaGraphViewPort } from '../dist/src/ports/lab-idea-graph.js';
import type { LabSimulatorViewPort } from '../dist/src/ports/lab-simulator.js';
import type { LabStrategyViewPort } from '../dist/src/ports/lab-strategy.js';
import type { LabTransformsViewPort } from '../dist/src/ports/lab-transforms.js';
import type { LabBridgeViewPort } from '../dist/src/ports/lab-bridge.js';
import type { LabOverviewView, LabRecentRunView } from '../dist/src/ports/lab-overview.js';
import type { LabSimulatorOverviewView } from '../dist/src/ports/lab-simulator.js';
import { FIXTURE_CALIBRATION_RECORDS } from './lab-fixture-calibrations.js';
import {
  FIXTURE_CORPUS_VERSIONS,
  FIXTURE_FEATURE_BUNDLES,
  FIXTURE_FEATURE_REQUIREMENTS,
  FIXTURE_IDEA_EDGES,
  FIXTURE_IDEA_NODES,
  FIXTURE_REFERENCE_DOCUMENTS,
} from './lab-fixture-corpus.js';
import {
  FIXTURE_BRANCHES,
  FIXTURE_BRANCH_RECORDS,
  FIXTURE_DYNAMICS_MODELS,
  FIXTURE_HISTORICAL_OBSERVATIONS,
  FIXTURE_SIMULATION_RUNS,
  FIXTURE_TIME_MACHINE_DECLARATION,
  FIXTURE_WORLD_MODELS,
} from './lab-fixture-simulator.js';
import {
  FIXTURE_ENSEMBLES,
  FIXTURE_LEARNED_CANDIDATES,
  FIXTURE_REWARD_SPECS,
  STRATEGY_SCENARIO_PIN,
} from './lab-fixture-strategy.js';
import { FIXTURE_ORGANIZATION_SEARCH_RESULTS } from './lab-fixture-organizations.js';
import {
  FIXTURE_TRANSFORM_CANDIDATES,
  FIXTURE_TRANSFORM_DEFINITIONS,
  FIXTURE_TRANSFORM_GATE_EVIDENCE,
  FIXTURE_TRANSFORM_GRAPHS,
  FIXTURE_TRANSFORM_PROMOTION_ATTEMPTS,
} from './lab-fixture-transforms.js';
import {
  FIXTURE_BENCHMARK_RECORDS,
  FIXTURE_LAB_SCENARIOS,
} from './lab-fixture-benchmarks.js';
import { REACH_SCENARIO } from './lab-fixture-support.js';
import {
  benchmarkCandidateViewOf,
  branchRecordViewOf,
  bridgeCandidateViewOf,
  bridgePathView,
  candidateHandoffViewOf,
  corpusDetailViewOf,
  corpusSummaryViewOf,
  derivationChainOf,
  ideaDetailViewOf,
  ideaGraphViewOf,
  inScope,
  learnedCandidateViewOf,
  organizationSearchResultViewOf,
  overviewViewOf,
  rewardObjectiveViewOf,
  runDetailViewOf,
  simulatorOverviewViewOf,
  transformCandidateDetailViewOf,
  transformDefinitionViewOf,
  transformGraphViewOf,
} from './lab-workspace-shape-adapter.js';

/**
 * DISCLOSED in-memory double for the Lab WORKSPACE view ports (UX-003 wave
 * 2, over the LAB-001..016 + §24-bridge record mirrors).
 *
 * Composition seam (OUTSIDE `src/`), mirroring `in-memory-lab-surface.ts`:
 * implements the web package's seven workspace view ports by adapting the
 * REAL-shaped fixture records (lab-fixture-corpus/simulator/strategy/
 * organizations/transforms + the accepted LAB-017/018 benchmark fixtures)
 * through the shared workspace shape adapter. The real lab runtime is
 * node-side; Worker C's production composition binds the same ports over
 * the real records without touching the ports or any view component.
 *
 * Read guards mirror the authority's own discipline: exact-tenant listing,
 * no existence leaks across tenants (§31 — unknown and cross-tenant ids are
 * the SAME explicit miss), append-only chain reads, explicit typed failures
 * — never guessed data. There is NO write path on any port: acquiring
 * documents, running simulations, learning strategies, promoting transform
 * candidates and handing off to missions are lab-authority actions this
 * double never fakes.
 *
 * COHERENCE (the fixtures cross-reference): the demo tenant's corpus chain
 * `corpus-sourdough-eu` reaches version 6 — exactly the `corpusVersion`
 * `scenario-reach-sourdough` pins; idea nodes derive from those documents;
 * simulation runs step under the pinned world-model/simulator versions; the
 * learned candidate and organization search evaluate under
 * `ensemble-reach-primary` v3; the benchmark records sweep the same
 * ensemble pair; calibration joins the benchmark predictions with measured
 * observations — one tenant, one scenario, one consistent record chain.
 */

/** Options for {@link createInMemoryLabWorkspace}. */
export interface InMemoryLabWorkspaceOptions {
  /**
   * Failure injection for the honest-unavailable states (route-level
   * tests): when set, every LISTING/overview method fails explicitly with
   * its `*-unavailable` vocabulary.
   */
  readonly failListings?: boolean;
}

/** The workspace double: the seven ports plus disclosed test observability. */
export interface InMemoryLabWorkspace {
  readonly labOverview: LabOverviewPort;
  readonly labCorpus: LabCorpusViewPort;
  readonly labIdeaGraph: LabIdeaGraphViewPort;
  readonly labSimulator: LabSimulatorViewPort;
  readonly labStrategy: LabStrategyViewPort;
  readonly labTransforms: LabTransformsViewPort;
  readonly labBridge: LabBridgeViewPort;
  /** Fixture access for tests (counts only — the records stay frozen data). */
  readonly fixtureCounts: {
    readonly corpusChains: () => number;
    readonly ideaNodes: () => number;
    readonly simulationRuns: () => number;
    readonly learnedCandidates: () => number;
    readonly organizationSearches: () => number;
    readonly transformCandidates: () => number;
    readonly bridgeCandidates: () => number;
  };
}

const overviewFailure = (message: string) =>
  ({ error: 'lab-overview-unavailable', message }) as const;
const corpusFailure = (
  error: 'lab-corpus-unavailable' | 'lab-corpus-not-found',
  message: string,
) => ({ error, message }) as const;
const ideaFailure = (
  error: 'lab-idea-graph-unavailable' | 'lab-idea-not-found',
  message: string,
) => ({ error, message }) as const;
const simulatorFailure = (
  error: 'lab-simulator-unavailable' | 'lab-run-not-found' | 'lab-branch-not-found',
  message: string,
) => ({ error, message }) as const;
const strategyFailure = (
  error: 'lab-strategy-unavailable' | 'lab-search-not-found' | 'lab-reward-objective-not-found',
  message: string,
) => ({ error, message }) as const;
const transformsFailure = (
  error: 'lab-transforms-unavailable' | 'lab-candidate-not-found',
  message: string,
) => ({ error, message }) as const;
const bridgeFailure = (
  error: 'lab-bridge-unavailable' | 'lab-handoff-not-found',
  message: string,
) => ({ error, message }) as const;

/** Branch records carry no tenant of their own — scope resolves through their
 * branch's tenant (the authority's §31 discipline: the branch owns the scope). */
const branchTenantById = new Map<string, string>(
  FIXTURE_BRANCHES.map((branch) => [String(branch.id), String(branch.tenantId)]),
);
function branchRecordInScope(scope: TenantScope, record: {
  readonly branchId: unknown;
}): boolean {
  return branchTenantById.get(String(record.branchId)) === String(scope.tenantId);
}

/** The latest record version of each append-only chain (tenant-scoped). */
function latestOf<T extends { readonly id: string; readonly version: number; readonly tenantId: unknown }>(
  records: readonly T[],
  scope: TenantScope,
): T[] {
  const byId = new Map<string, T>();
  for (const record of records) {
    if (!inScope(scope, record)) {
      continue;
    }
    const current = byId.get(String(record.id));
    if (current === undefined || Number(record.version) > Number(current.version)) {
      byId.set(String(record.id), record);
    }
  }
  return [...byId.values()].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
}

/**
 * Build the in-memory Lab workspace over the REAL-shaped fixtures. Every
 * listing is tenant-scoped (§31) and deterministically ordered; every
 * selection resolves through the SAME scope guard so unknown and
 * cross-tenant ids are the SAME explicit miss.
 */
export function createInMemoryLabWorkspace(
  options: InMemoryLabWorkspaceOptions = {},
): InMemoryLabWorkspace {
  const fail = options.failListings === true;

  // ——— shared tenant-scoped fixture projections ———

  const corpusChainsOf = (scope: TenantScope) => {
    const byId = new Map<string, typeof FIXTURE_CORPUS_VERSIONS[number][]>();
    for (const version of FIXTURE_CORPUS_VERSIONS) {
      if (!inScope(scope, version)) {
        continue;
      }
      const key = String(version.corpusId);
      const chain = byId.get(key) ?? [];
      chain.push(version);
      byId.set(key, chain);
    }
    return [...byId.entries()]
      .map(([corpusId, versions]) => ({
        corpusId,
        versions: [...versions].sort((a, b) => Number(a.version) - Number(b.version)),
      }))
      .sort((a, b) => (a.corpusId < b.corpusId ? -1 : 1));
  };

  const corpusSummariesOf = (scope: TenantScope) => {
    const summaries = [];
    for (const { versions } of corpusChainsOf(scope)) {
      const summary = corpusSummaryViewOf(
        versions,
        FIXTURE_REFERENCE_DOCUMENTS.filter((document) => inScope(scope, document)),
        FIXTURE_FEATURE_BUNDLES.filter((bundle) => inScope(scope, bundle)).map((bundle) => ({
          documentId: String(bundle.documentId),
          attached: bundle.detachedAt === null,
        })),
      );
      if (summary !== null) {
        summaries.push(summary);
      }
    }
    return summaries;
  };

  const strategyCandidatesOf = (scope: TenantScope) => {
    const candidates = FIXTURE_LEARNED_CANDIDATES.filter((learned) => inScope(scope, learned)).map(
      (learned) =>
        learnedCandidateViewOf(
          learned,
          FIXTURE_ENSEMBLES.find(
            (ensemble) =>
              inScope(scope, ensemble) &&
              String(ensemble.id) === String(learned.provenance.ensembleId) &&
              Number(ensemble.version) === learned.provenance.ensembleVersion,
          ) ?? null,
        ),
    );
    for (const record of latestOf(FIXTURE_BENCHMARK_RECORDS, scope)) {
      const declared = [
        ...record.ranked.filter((ranked) => ranked.origin !== 'no-op-baseline'),
        record.comparison.noopBaseline,
      ];
      for (const ranked of declared) {
        candidates.push(
          benchmarkCandidateViewOf(
            record,
            {
              key: ranked.key,
              label: ranked.label ?? null,
              origin: ranked.origin,
              action: {
                strategyRef: String(ranked.candidate.action.strategyRef),
                kind: ranked.candidate.action.kind,
                cadencePerWeek: ranked.candidate.action.cadencePerWeek,
                novelty: ranked.candidate.action.novelty,
                engagementEffort: ranked.candidate.action.engagementEffort,
              },
              horizonSteps: ranked.provenance.horizonSteps,
              evaluation: {
                expectedReward: ranked.evaluation.expectedReward,
                interval: { ...ranked.evaluation.interval },
              },
            },
            ranked.label ?? null,
          ),
        );
      }
    }
    return candidates.sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
  };

  const organizationSearchesOf = (scope: TenantScope) =>
    FIXTURE_ORGANIZATION_SEARCH_RESULTS.filter((result) => inScope(scope, result))
      .map((result) => organizationSearchResultViewOf(result, STRATEGY_SCENARIO_PIN.scenarioRef))
      .sort((a, b) => (a.searchId < b.searchId ? -1 : 1));

  const transformCandidatesOf = (scope: TenantScope) =>
    latestOf(FIXTURE_TRANSFORM_CANDIDATES, scope)
      .map((candidate) =>
        transformCandidateDetailViewOf(
          candidate,
          FIXTURE_TRANSFORM_GATE_EVIDENCE,
          FIXTURE_TRANSFORM_PROMOTION_ATTEMPTS,
        ),
      )
      .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));

  const overviewOf = (scope: TenantScope): LabOverviewView => {
    const documents = FIXTURE_REFERENCE_DOCUMENTS.filter((document) => inScope(scope, document));
    const bundles = FIXTURE_FEATURE_BUNDLES.filter((bundle) => inScope(scope, bundle));
    const observations = FIXTURE_HISTORICAL_OBSERVATIONS.filter((observation) =>
      inScope(scope, observation),
    );
    const runs = FIXTURE_SIMULATION_RUNS.filter((run) => inScope(scope, run));
    const branchRecords = FIXTURE_BRANCH_RECORDS.filter((record) => branchRecordInScope(scope, record));
    const benchmarkRecords = FIXTURE_BENCHMARK_RECORDS.filter((record) => inScope(scope, record));
    const learned = FIXTURE_LEARNED_CANDIDATES.filter((candidate) => inScope(scope, candidate));
    const searches = FIXTURE_ORGANIZATION_SEARCH_RESULTS.filter((result) => inScope(scope, result));
    const ideas = FIXTURE_IDEA_NODES.filter((node) => inScope(scope, node));

    const recentRuns: LabRecentRunView[] = [
      ...benchmarkRecords.map((record) => ({
        runId: `${String(record.id)}@v${Number(record.version)}`,
        surface: 'robust-benchmark' as const,
        recordedAt: record.recordedAt,
        counterfactual: true as const,
      })),
      ...runs.map((run) => ({
        runId: String(run.id),
        surface: 'simulator' as const,
        recordedAt: run.predictedAt,
        counterfactual: true as const,
      })),
      ...searches.map((result) => ({
        runId: String(result.id),
        surface: 'organization-search' as const,
        recordedAt: result.ranked[0]?.provenance.searchedAt ?? ('1970-01-01T00:00:00.000Z' as never),
        counterfactual: true as const,
      })),
      ...learned.map((candidate) => ({
        runId: String(candidate.id),
        surface: 'strategy-learning' as const,
        recordedAt: candidate.provenance.learnedAt,
        counterfactual: true as const,
      })),
    ]
      .sort((a, b) => (String(a.recordedAt) < String(b.recordedAt) ? 1 : -1))
      .slice(0, 8);

    const acquired = documents.map((document) => String(document.acquiredAt)).sort();

    return overviewViewOf({
      tenantId: String(scope.tenantId),
      corpusVersions: FIXTURE_CORPUS_VERSIONS.filter((version) => inScope(scope, version)),
      attachedBundles: bundles.filter((bundle) => bundle.detachedAt === null).length,
      ideaCount: ideas.length,
      runCount: runs.length,
      learnedCount: learned.length,
      orgSearchCount: searches.length,
      transformDefinitionCount: latestOf(FIXTURE_TRANSFORM_DEFINITIONS, scope).length,
      transformCandidateCount: latestOf(FIXTURE_TRANSFORM_CANDIDATES, scope).length,
      benchmarkChainCount: latestOf(FIXTURE_BENCHMARK_RECORDS, scope).length,
      calibrationChainCount: latestOf(FIXTURE_CALIBRATION_RECORDS, scope).length,
      historicalObservationCount: observations.length,
      counterfactualRecordCount:
        runs.length +
        branchRecords.length +
        benchmarkRecords.length +
        learned.length +
        searches.reduce((total, result) => total + result.ranked.length, 0),
      regimes: [...new Set(observations.map((observation) => String(observation.regime ?? '')))].filter(
        (regime) => regime.length > 0,
      ),
      // The demo tenant pins the reach scenario as its ACTIVE scenario (the
      // fixture chain every cross-referenced record cites); tenant-other's
      // scope has no active scenario — the honest null, never a guess.
      activeScenario: String(scope.tenantId) === 'tenant-demo' ? REACH_SCENARIO : null,
      recentRuns,
      earliestAcquiredAt: acquired[0] ?? null,
      latestAcquiredAt: acquired[acquired.length - 1] ?? null,
    });
  };

  const simulatorOverviewOf = (scope: TenantScope): LabSimulatorOverviewView =>
    simulatorOverviewViewOf({
      tenantId: String(scope.tenantId),
      worldModels: FIXTURE_WORLD_MODELS.filter((world) => inScope(scope, world)),
      dynamicsModels: FIXTURE_DYNAMICS_MODELS.filter((model) => inScope(scope, model)),
      runs: FIXTURE_SIMULATION_RUNS.filter((run) => inScope(scope, run)),
      observations: FIXTURE_HISTORICAL_OBSERVATIONS.filter((observation) =>
        inScope(scope, observation),
      ),
      branches: FIXTURE_BRANCHES.filter((branch) => inScope(scope, branch)),
      branchRecords: FIXTURE_BRANCH_RECORDS.filter((record) => branchRecordInScope(scope, record)),
    });

  // ——— the seven view ports ———

  const labOverview: LabOverviewPort = {
    async loadLabOverview(scope) {
      if (fail) {
        return overviewFailure('the lab overview service failed explicitly (injected)');
      }
      return overviewOf(scope);
    },
  };

  const labCorpus: LabCorpusViewPort = {
    async listCorpusSummaries(scope) {
      if (fail) {
        return corpusFailure(
          'lab-corpus-unavailable',
          'the lab corpus service failed explicitly (injected)',
        );
      }
      return corpusSummariesOf(scope);
    },
    async loadCorpusDetail(corpusId, scope) {
      const chain = corpusChainsOf(scope).find((candidate) => candidate.corpusId === corpusId);
      if (chain === undefined) {
        // Unknown OR cross-tenant: the same explicit miss (§31).
        return corpusFailure(
          'lab-corpus-not-found',
          `no corpus chain ${corpusId} is visible in this tenant scope`,
        );
      }
      return corpusDetailViewOf(
        chain.versions,
        FIXTURE_REFERENCE_DOCUMENTS.filter((document) => inScope(scope, document)),
        FIXTURE_FEATURE_BUNDLES.filter((bundle) => inScope(scope, bundle)),
        FIXTURE_FEATURE_REQUIREMENTS,
      );
    },
  };

  const labIdeaGraph: LabIdeaGraphViewPort = {
    async listIdeaGraph(scope) {
      if (fail) {
        return ideaFailure(
          'lab-idea-graph-unavailable',
          'the lab idea-graph service failed explicitly (injected)',
        );
      }
      return ideaGraphViewOf(
        String(scope.tenantId),
        FIXTURE_IDEA_NODES.filter((node) => inScope(scope, node)),
        FIXTURE_IDEA_EDGES,
      );
    },
    async loadIdeaDetail(nodeId, scope) {
      const node = FIXTURE_IDEA_NODES.find(
        (candidate) => String(candidate.id) === nodeId && inScope(scope, candidate),
      );
      if (node === undefined) {
        return ideaFailure(
          'lab-idea-not-found',
          `no idea node ${nodeId} is visible in this tenant scope`,
        );
      }
      const detail = ideaDetailViewOf(
        nodeId,
        FIXTURE_IDEA_NODES.filter((candidate) => inScope(scope, candidate)),
        FIXTURE_IDEA_EDGES,
        FIXTURE_REFERENCE_DOCUMENTS.filter((document) => inScope(scope, document)),
        FIXTURE_FEATURE_BUNDLES.filter((bundle) => inScope(scope, bundle)),
      );
      if (detail === null) {
        return ideaFailure('lab-idea-not-found', `idea node ${nodeId} could not be projected`);
      }
      return detail;
    },
    async loadIdeaDerivation(nodeId, scope) {
      const node = FIXTURE_IDEA_NODES.find(
        (candidate) => String(candidate.id) === nodeId && inScope(scope, candidate),
      );
      if (node === undefined) {
        return ideaFailure(
          'lab-idea-not-found',
          `no idea node ${nodeId} is visible in this tenant scope`,
        );
      }
      return derivationChainOf(
        nodeId,
        FIXTURE_IDEA_NODES.filter((candidate) => inScope(scope, candidate)),
        FIXTURE_IDEA_EDGES,
        FIXTURE_REFERENCE_DOCUMENTS.filter((document) => inScope(scope, document)),
        FIXTURE_FEATURE_BUNDLES.filter((bundle) => inScope(scope, bundle)),
      );
    },
  };

  const labSimulator: LabSimulatorViewPort = {
    async loadSimulatorOverview(scope) {
      if (fail) {
        return simulatorFailure(
          'lab-simulator-unavailable',
          'the lab simulator service failed explicitly (injected)',
        );
      }
      return simulatorOverviewOf(scope);
    },
    async loadSimulationRunDetail(runId, scope) {
      const run = FIXTURE_SIMULATION_RUNS.find(
        (candidate) => String(candidate.id) === runId && inScope(scope, candidate),
      );
      if (run === undefined) {
        return simulatorFailure(
          'lab-run-not-found',
          `no simulation run ${runId} is visible in this tenant scope`,
        );
      }
      return runDetailViewOf(run);
    },
    async loadBranchRecords(branchId, scope) {
      const branch = FIXTURE_BRANCHES.find(
        (candidate) => String(candidate.id) === branchId && inScope(scope, candidate),
      );
      if (branch === undefined) {
        return simulatorFailure(
          'lab-branch-not-found',
          `no counterfactual branch ${branchId} is visible in this tenant scope`,
        );
      }
      return FIXTURE_BRANCH_RECORDS.filter(
        (record) => String(record.branchId) === branchId && branchRecordInScope(scope, record),
      )
        .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
        .map((record) => branchRecordViewOf(record));
    },
  };

  const labStrategy: LabStrategyViewPort = {
    async listStrategyCandidates(scope) {
      if (fail) {
        return strategyFailure(
          'lab-strategy-unavailable',
          'the lab strategy service failed explicitly (injected)',
        );
      }
      return strategyCandidatesOf(scope);
    },
    async listOrganizationSearchResults(scope) {
      if (fail) {
        return strategyFailure(
          'lab-strategy-unavailable',
          'the lab strategy service failed explicitly (injected)',
        );
      }
      return organizationSearchesOf(scope);
    },
    async loadRewardObjective(scenarioRef, scope) {
      const scenario = Object.values(FIXTURE_LAB_SCENARIOS).find(
        (candidate) => String(candidate.id) === String(scenarioRef),
      );
      if (scenario === undefined) {
        return strategyFailure(
          'lab-reward-objective-not-found',
          `no scenario ${String(scenarioRef)} is visible to this composition`,
        );
      }
      const rewardSpec = FIXTURE_REWARD_SPECS.find(
        (spec) => spec.version === Number(scenario.rewardVersion),
      );
      if (rewardSpec === undefined) {
        return strategyFailure(
          'lab-reward-objective-not-found',
          `scenario ${String(scenarioRef)} pins reward version ${Number(
            scenario.rewardVersion,
          )} but no such spec is visible in this composition`,
        );
      }
      return rewardObjectiveViewOf(scenario, rewardSpec, String(scope.tenantId));
    },
  };

  const labTransforms: LabTransformsViewPort = {
    async listTransformDefinitions(scope) {
      if (fail) {
        return transformsFailure(
          'lab-transforms-unavailable',
          'the lab transforms service failed explicitly (injected)',
        );
      }
      return latestOf(FIXTURE_TRANSFORM_DEFINITIONS, scope).map(transformDefinitionViewOf);
    },
    async listTransformGraphs(scope) {
      if (fail) {
        return transformsFailure(
          'lab-transforms-unavailable',
          'the lab transforms service failed explicitly (injected)',
        );
      }
      return latestOf(FIXTURE_TRANSFORM_GRAPHS, scope).map(transformGraphViewOf);
    },
    async listDiscoveryCandidates(scope) {
      if (fail) {
        return transformsFailure(
          'lab-transforms-unavailable',
          'the lab transforms service failed explicitly (injected)',
        );
      }
      return transformCandidatesOf(scope);
    },
    async loadDiscoveryCandidate(candidateId, scope) {
      const candidate = latestOf(FIXTURE_TRANSFORM_CANDIDATES, scope).find(
        (current) => String(current.id) === candidateId,
      );
      if (candidate === undefined) {
        return transformsFailure(
          'lab-candidate-not-found',
          `no transform candidate ${candidateId} is visible in this tenant scope`,
        );
      }
      return transformCandidateDetailViewOf(
        candidate,
        FIXTURE_TRANSFORM_GATE_EVIDENCE,
        FIXTURE_TRANSFORM_PROMOTION_ATTEMPTS,
      );
    },
  };

  const bridgeCandidatesOf = (scope: TenantScope) => {
    const candidates = [];
    for (const record of latestOf(FIXTURE_BENCHMARK_RECORDS, scope)) {
      for (const ranked of record.ranked.filter((entry) => entry.origin !== 'no-op-baseline')) {
        candidates.push(
          bridgeCandidateViewOf(
            'benchmark-candidate',
            `${String(record.id)}:${ranked.key}`,
            ranked.label ?? `${String(record.id)}:${ranked.key}`,
            'the LAB-017 robust-benchmark authority',
          ),
        );
      }
    }
    for (const learned of FIXTURE_LEARNED_CANDIDATES.filter((candidate) =>
      inScope(scope, candidate),
    )) {
      candidates.push(
        bridgeCandidateViewOf(
          'learned-strategy',
          String(learned.id),
          String(learned.id),
          'the LAB-009 strategy learner',
        ),
      );
    }
    for (const result of organizationSearchesOf(scope)) {
      const leader = result.ranked[0];
      if (leader !== undefined) {
        candidates.push(
          bridgeCandidateViewOf(
            'organization-candidate',
            leader.organization.organizationId,
            leader.organization.organizationId,
            'the LAB-010 agent-organization search (§23)',
          ),
        );
      }
    }
    for (const candidate of transformCandidatesOf(scope)) {
      if (candidate.promoted) {
        candidates.push(
          bridgeCandidateViewOf(
            'promoted-transform',
            candidate.candidateId,
            candidate.candidateId,
            'the LAB-012 §8 promotion gates',
          ),
        );
      }
    }
    return candidates.sort((a, b) => (a.handoffId < b.handoffId ? -1 : 1));
  };

  const labBridge: LabBridgeViewPort = {
    async loadLabBridgeDirectory(scope) {
      if (fail) {
        return bridgeFailure(
          'lab-bridge-unavailable',
          'the lab bridge service failed explicitly (injected)',
        );
      }
      return {
        tenantId: scope.tenantId,
        path: bridgePathView(),
        candidates: bridgeCandidatesOf(scope),
      };
    },
    async loadCandidateHandoff(handoffId, scope) {
      const candidate = bridgeCandidatesOf(scope).find(
        (entry) => entry.handoffId === handoffId,
      );
      if (candidate === undefined) {
        return bridgeFailure(
          'lab-handoff-not-found',
          `no lab candidate handoff ${handoffId} is visible in this tenant scope`,
        );
      }
      return candidateHandoffViewOf(candidate, bridgePathView());
    },
  };

  const demoScope: TenantScope = { tenantId: 'tenant-demo' as never };

  return {
    labOverview,
    labCorpus,
    labIdeaGraph,
    labSimulator,
    labStrategy,
    labTransforms,
    labBridge,
    fixtureCounts: {
      corpusChains: () => corpusSummariesOf(demoScope).length,
      ideaNodes: () =>
        FIXTURE_IDEA_NODES.filter((node) => inScope(demoScope, node)).length,
      simulationRuns: () =>
        FIXTURE_SIMULATION_RUNS.filter((run) => inScope(demoScope, run)).length,
      learnedCandidates: () =>
        FIXTURE_LEARNED_CANDIDATES.filter((candidate) => inScope(demoScope, candidate)).length,
      organizationSearches: () =>
        FIXTURE_ORGANIZATION_SEARCH_RESULTS.filter((result) => inScope(demoScope, result)).length,
      transformCandidates: () => transformCandidatesOf(demoScope).length,
      bridgeCandidates: () => bridgeCandidatesOf(demoScope).length,
    },
  };
}
