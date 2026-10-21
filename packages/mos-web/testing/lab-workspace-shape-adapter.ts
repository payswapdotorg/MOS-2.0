import type {
  LabActiveScenarioView,
  LabLoopStageStandingView,
  LabOverviewView,
  LabRecentRunView,
} from '../dist/src/ports/lab-overview.js';
import type {
  LabCorpusDetailView,
  LabCorpusSummaryView,
} from '../dist/src/ports/lab-corpus.js';
import type {
  LabDerivationStepView,
  LabIdeaDetailView,
  LabIdeaEdgeView,
  LabIdeaGraphView,
  LabIdeaNodeView,
} from '../dist/src/ports/lab-idea-graph.js';
import type {
  LabBridgeCandidateView,
  LabBridgeStepView,
  LabCandidateHandoffView,
} from '../dist/src/ports/lab-bridge.js';
import type {
  LabBranchRecordView,
  LabBranchView,
  LabDynamicsModelView,
  LabHistoricalObservationView,
  LabSimulatorOverviewView,
  LabSimulationRunDetailView,
  LabSimulationRunSummaryView,
  LabWorldModelView,
} from '../dist/src/ports/lab-simulator.js';
import type {
  LabOrganizationSearchResultView,
  LabRankedOrganizationView,
  LabRewardObjectiveView,
  LabStrategyCandidateView,
} from '../dist/src/ports/lab-strategy.js';
import type {
  LabTransformCandidateDetailView,
  LabTransformDefinitionView,
  LabTransformGraphView,
  LabTransformGateStandingView,
} from '../dist/src/ports/lab-transforms.js';
import type { LabScenario, TenantScope, Timestamp } from '@mos/contracts';
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
} from './lab-fixture-benchmarks.js';
import type {
  CounterfactualBranchFixture,
  CounterfactualBranchRecordFixture,
  CorpusVersionFixture,
  HistoricalObservationFixture,
  IdeaEdgeFixture,
  IdeaNodeFixture,
  ReferenceDocumentFixture,
  SocialSimulationResultFixture,
  SocialWorldModelFixture,
} from './lab-fixture-workspace-shapes.js';
import type {
  LearnedStrategyCandidateFixture,
  OrganizationSearchResultFixture,
  RankedOrganizationCandidateFixture,
  TransformCandidateFixture,
  TransformDefinitionFixture,
  TransformGraphFixture,
  TransformPromotionAttemptFixture,
} from './lab-fixture-strategy-shapes.js';
import type { RobustBenchmarkRecordFixture } from './lab-fixture-shapes.js';

/**
 * The Lab WORKSPACE shape adapter (UX-003 wave 2, composition seam OUTSIDE
 * `src/`): pure projection functions from the REAL-shaped fixture records
 * into the web package's presentation-shaped view models. Mirrors the
 * `lab-shape-adapter.ts` discipline: no invention, no recomputation —
 * fields are relayed, counts are counted, flags are carried verbatim
 * (counterfactual literal pins included).
 */

/** Minimal bundle facts the corpus summary needs (kept structural). */
export interface FeatureBundleCount {
  readonly documentId: string;
  readonly attached: boolean;
}

// ——— LAB-001/002/003: corpus + idea graph projections ———

export function corpusSummaryViewOf(
  versions: readonly CorpusVersionFixture[],
  documents: readonly ReferenceDocumentFixture[],
  bundles: readonly FeatureBundleCount[],
): LabCorpusSummaryView | null {
  const latest = [...versions].sort((a, b) => b.version - a.version)[0];
  if (latest === undefined) {
    return null;
  }
  const memberDocs = documents.filter((document) =>
    (latest.documentRefs as readonly string[]).includes(document.id as string),
  );
  const docTenant = latest.tenantId;
  const niche = memberDocs[0]?.niche ?? '';
  const platform = memberDocs[0]?.platform ?? '';
  const acquired = memberDocs.map((document) => String(document.acquiredAt)).sort();
  void docTenant;
  return {
    corpusId: String(latest.corpusId),
    tenantId: latest.tenantId,
    latestVersion: Number(latest.version),
    versionCount: versions.length,
    documentCount: memberDocs.length,
    niche,
    platform,
    modalities: [...new Set(memberDocs.map((document) => document.modality))],
    latestSnapshotAt: String(latest.createdAt) as Timestamp,
    acquiredFrom: (acquired[0] ?? String(latest.createdAt)) as Timestamp,
    acquiredTo: (acquired[acquired.length - 1] ?? String(latest.createdAt)) as Timestamp,
    attachedBundleCount: bundles.filter(
      (bundle) =>
        bundle.attached && (latest.documentRefs as readonly string[]).includes(bundle.documentId),
    ).length,
  };
}

export function corpusDetailViewOf(
  versions: readonly CorpusVersionFixture[],
  documents: readonly ReferenceDocumentFixture[],
  bundles: readonly import('./lab-fixture-workspace-shapes.js').FeatureBundleFixture[],
  requirements: readonly import('./lab-fixture-workspace-shapes.js').FeatureKindRequirementFixture[],
): LabCorpusDetailView {
  const summary = corpusSummaryViewOf(
    versions,
    documents,
    bundles.map((bundle) => ({
      documentId: String(bundle.documentId),
      attached: bundle.detachedAt === null,
    })),
  );
  if (summary === null) {
    throw new Error('corpusDetailViewOf requires a non-empty version chain');
  }
  const latestRefs = ([...versions].sort((a, b) => b.version - a.version)[0] as CorpusVersionFixture)
    .documentRefs as readonly string[];
  const memberDocs = documents.filter((document) => latestRefs.includes(document.id as string));
  const memberBundles = bundles.filter((bundle) =>
    latestRefs.includes(String(bundle.documentId)),
  );
  return {
    summary,
    versions: [...versions]
      .sort((a, b) => Number(a.version) - Number(b.version))
      .map((version) => ({
        version: Number(version.version),
        documentCount: version.documentRefs.length,
        createdAt: String(version.createdAt) as Timestamp,
        notes: version.notes,
      })),
    documents: memberDocs.map((document) => ({
      documentId: String(document.id),
      version: Number(document.version),
      artifact: document.artifact,
      sourceRefs: [...document.sourceRefs],
      acquiredAt: document.acquiredAt,
      modality: document.modality,
      rightsRef: String(document.rightsRef),
      provenanceRef: String(document.provenanceRef),
    })),
    featureBundles: memberBundles.map((bundle) => ({
      bundleId: String(bundle.id),
      version: Number(bundle.version),
      documentId: String(bundle.documentId),
      features: bundle.features.map((feature) => ({
        kind: feature.kind,
        artifact: feature.artifact,
        metadata: { ...feature.metadata },
      })),
      provenanceRef: String(bundle.provenanceRef),
      createdAt: bundle.createdAt,
      detachedAt: bundle.detachedAt,
    })),
    featureRequirements: requirements.map((requirement) => ({
      kind: requirement.kind,
      capabilityId: String(requirement.capability.capabilityId),
      capabilityVersion: Number(requirement.capability.version),
    })),
  };
}

export function ideaNodeViewOf(node: IdeaNodeFixture): LabIdeaNodeView {
  return {
    nodeId: String(node.id),
    version: Number(node.version),
    tenantId: node.tenantId,
    statement: node.statement,
    embeddingRef: node.embeddingRef,
    derivation: {
      documentCount: node.derivation.documents.length,
      featureBundleCount: node.derivation.featureBundles.length,
    },
    provenanceRef: String(node.provenanceRef),
    createdAt: node.createdAt,
  };
}

export function ideaEdgeViewOf(edge: IdeaEdgeFixture): LabIdeaEdgeView {
  return {
    edgeId: String(edge.id),
    version: Number(edge.version),
    fromNodeId: String(edge.fromNodeId),
    toNodeId: String(edge.toNodeId),
    kind: edge.kind,
    weight: edge.weight,
    createdAt: edge.createdAt,
  };
}

export function ideaGraphViewOf(
  tenantId: string,
  nodes: readonly IdeaNodeFixture[],
  edges: readonly IdeaEdgeFixture[],
): LabIdeaGraphView {
  return {
    tenantId: tenantId as never,
    nodes: [...nodes]
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
      .map(ideaNodeViewOf),
    edges: [...edges]
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
      .map(ideaEdgeViewOf),
  };
}

/** The LAB-003 derivation trace: idea → refs → upstream ideas (transitive). */
export function derivationChainOf(
  rootId: string,
  nodes: readonly IdeaNodeFixture[],
  edges: readonly IdeaEdgeFixture[],
  documents: readonly ReferenceDocumentFixture[],
  bundles: readonly import('./lab-fixture-workspace-shapes.js').FeatureBundleFixture[],
): readonly LabDerivationStepView[] {
  const steps: LabDerivationStepView[] = [];
  const visited = new Set<string>();
  const documentById = new Map(documents.map((document) => [String(document.id), document]));
  const bundleById = new Map(bundles.map((bundle) => [String(bundle.id), bundle]));

  const trace = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    const node = nodes.find((candidate) => String(candidate.id) === nodeId);
    if (node === undefined) {
      return;
    }
    steps.push({ kind: 'idea', nodeId });
    for (const bundleId of node.derivation.featureBundles as readonly string[]) {
      const bundle = bundleById.get(bundleId);
      steps.push({
        kind: 'feature-bundle',
        bundleId,
        documentId: bundle === undefined ? '' : String(bundle.documentId),
      });
    }
    for (const documentId of node.derivation.documents as readonly string[]) {
      const document = documentById.get(documentId);
      steps.push({
        kind: 'corpus-document',
        documentId,
        artifact:
          document?.artifact ??
          ({
            artifactId: documentId as never,
            version: 1 as never,
            tenantId: 'tenant-unknown' as never,
            digest: 'unknown' as never,
            type: 'unknown' as never,
            storageRef: 'unknown' as never,
            rightsRef: 'unknown' as never,
            provenanceRef: 'unknown' as never,
          }),
      });
    }
    // Upstream ideas over OUTGOING derives-from edges (from → derived FROM to).
    const upstream = edges
      .filter((edge) => String(edge.fromNodeId) === nodeId && edge.kind === 'derives-from')
      .map((edge) => String(edge.toNodeId))
      .sort();
    for (const parentId of upstream) {
      trace(parentId);
    }
  };

  trace(rootId);
  return steps;
}

/** The LAB-003 neighborhood query: root + every node within `radius` hops. */
export function ideaDetailViewOf(
  nodeId: string,
  nodes: readonly IdeaNodeFixture[],
  edges: readonly IdeaEdgeFixture[],
  documents: readonly ReferenceDocumentFixture[],
  bundles: readonly import('./lab-fixture-workspace-shapes.js').FeatureBundleFixture[],
): LabIdeaDetailView | null {
  const root = nodes.find((candidate) => String(candidate.id) === nodeId);
  if (root === undefined) {
    return null;
  }
  const radius = 2;
  const reached = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  for (let hop = 0; hop < radius; hop += 1) {
    const next = new Set<string>();
    for (const current of frontier) {
      for (const edge of edges) {
        const from = String(edge.fromNodeId);
        const to = String(edge.toNodeId);
        if (from === current && !reached.has(to)) {
          reached.add(to);
          next.add(to);
        }
        if (to === current && !reached.has(from)) {
          reached.add(from);
          next.add(from);
        }
      }
    }
    frontier = next;
  }
  const neighborhoodNodes = nodes
    .filter((node) => reached.has(String(node.id)))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  const neighborhoodEdges = edges
    .filter((edge) => reached.has(String(edge.fromNodeId)) && reached.has(String(edge.toNodeId)))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  return {
    node: ideaNodeViewOf(root),
    neighborhood: {
      radius,
      nodes: neighborhoodNodes.map(ideaNodeViewOf),
      edges: neighborhoodEdges.map(ideaEdgeViewOf),
    },
    derivationChain: derivationChainOf(nodeId, nodes, edges, documents, bundles),
  };
}

// ——— LAB-004/005/006: simulator + Time Machine projections ———

export function worldModelViewOf(world: SocialWorldModelFixture): LabWorldModelView {
  return {
    worldModelId: String(world.id),
    worldModelVersion: Number(world.worldModelVersion),
    tenantId: world.tenantId,
    niche: world.niche,
    platform: world.platform,
    state: { ...world.state },
    createdAt: world.createdAt,
    notes: world.notes,
    disclosure: world.disclosure,
    counterfactual: true,
  };
}

export function dynamicsModelViewOf(
  model: import('./lab-fixture-workspace-shapes.js').DynamicsModelFixture,
): LabDynamicsModelView {
  return {
    dynamicsModelId: String(model.id),
    version: Number(model.version),
    tenantId: model.tenantId,
    niche: model.niche,
    platform: model.platform,
    populations: model.populations.map((segment) => ({
      ...segment,
      segmentId: String(segment.id),
    })),
    createdAt: model.createdAt,
    notes: model.notes,
    disclosure: model.disclosure,
    counterfactual: true,
  };
}

export function runSummaryViewOf(run: SocialSimulationResultFixture): LabSimulationRunSummaryView {
  return {
    runId: String(run.id),
    tenantId: run.tenantId,
    scenarioRef: String(run.scenarioRef),
    seed: run.seed,
    step: run.step,
    predictedAt: run.predictedAt,
    worldModelVersion: Number(run.worldModelVersion),
    simulatorVersion: Number(run.simulatorVersion),
    counterfactual: true,
  };
}

export function runDetailViewOf(run: SocialSimulationResultFixture): LabSimulationRunDetailView {
  return {
    summary: runSummaryViewOf(run),
    metrics: run.metrics.map((metric) => ({
      metric: metric.metric,
      expectedValue: metric.expectedValue,
      interval: { ...metric.interval },
      unit: metric.unit,
    })),
    deltas: run.deltas.map((delta) => ({
      metric: delta.metric,
      expectedDelta: delta.expectedDelta,
      interval: { ...delta.interval },
      unit: delta.unit,
    })),
    nextWorldState: { ...run.nextWorldState },
    /** The strategy the run stepped — the record carries its ref (§20 provenance). */
    strategyRef: String(run.strategyRef),
    uncertainty: { level: run.uncertainty.level, note: run.uncertainty.note ?? null },
    counterfactual: true,
    disclosure: run.disclosure,
  };
}

export function historicalObservationViewOf(
  observation: HistoricalObservationFixture,
): LabHistoricalObservationView {
  return {
    observationId: String(observation.id),
    tenantId: observation.tenantId,
    niche: observation.niche,
    platform: observation.platform,
    metrics: observation.metrics.map((metric) => ({ ...metric })),
    observedAt: observation.observedAt,
    sourceRefs: [...observation.sourceRefs],
    regime: observation.regime ?? '',
    counterfactual: false,
  };
}

export function branchViewOf(
  branch: CounterfactualBranchFixture,
  records: readonly CounterfactualBranchRecordFixture[],
): LabBranchView {
  return {
    branchId: String(branch.id),
    version: Number(branch.version),
    tenantId: branch.tenantId,
    parentBranchId: branch.parentBranchId === null ? null : String(branch.parentBranchId),
    forkPoint: branch.forkPoint,
    intervention: {
      description: branch.intervention.description,
      changedParameters: { ...branch.intervention.changedParameters },
    },
    label: branch.label,
    createdAt: branch.createdAt,
    recordCount: records.filter((record) => String(record.branchId) === String(branch.id)).length,
    counterfactual: true,
  };
}

export function branchRecordViewOf(
  record: CounterfactualBranchRecordFixture,
): LabBranchRecordView {
  return {
    recordId: String(record.id),
    branchId: String(record.branchId),
    prediction: {
      scenarioRef: String(record.prediction.scenarioRef),
      worldModelVersion: Number(record.prediction.worldModelVersion),
      simulatorVersion: Number(record.prediction.simulatorVersion),
      seed: record.prediction.seed,
      step: record.prediction.step,
      metrics: record.prediction.metrics.map((metric) => ({
        metric: metric.metric,
        expectedValue: metric.expectedValue,
        interval: { ...metric.interval },
        unit: metric.unit,
      })),
      predictedAt: record.prediction.predictedAt,
    },
    recordedAt: record.recordedAt,
    counterfactual: true,
  };
}

/**
 * The Time Machine aggregate: mode 1 (historical ≤ T), mode 2 (delayed ≤
 * T−L with the LEAKAGE PIN — records inside the forbidden window are
 * counted and named, never served), mode 3 (branches).
 */
export function simulatorOverviewViewOf(input: {
  readonly tenantId: string;
  readonly worldModels: readonly SocialWorldModelFixture[];
  readonly dynamicsModels: readonly import('./lab-fixture-workspace-shapes.js').DynamicsModelFixture[];
  readonly runs: readonly SocialSimulationResultFixture[];
  readonly observations: readonly HistoricalObservationFixture[];
  readonly branches: readonly CounterfactualBranchFixture[];
  readonly branchRecords: readonly CounterfactualBranchRecordFixture[];
}): LabSimulatorOverviewView {
  const asOf = FIXTURE_TIME_MACHINE_DECLARATION.asOf;
  const lagMs = FIXTURE_TIME_MACHINE_DECLARATION.lagMs;
  const cutoff = new Date(new Date(asOf).getTime() - lagMs).toISOString();
  const historical = input.observations
    .filter((observation) => String(observation.observedAt) <= asOf)
    .sort((a, b) => (String(a.observedAt) < String(b.observedAt) ? -1 : 1));
  const visible = historical.filter((observation) => String(observation.observedAt) <= cutoff);
  const withheld = historical.filter((observation) => String(observation.observedAt) > cutoff);
  return {
    tenantId: input.tenantId as never,
    worldModels: [...input.worldModels]
      .sort((a, b) =>
        String(a.id) === String(b.id)
          ? Number(a.worldModelVersion) - Number(b.worldModelVersion)
          : String(a.id) < String(b.id)
            ? -1
            : 1,
      )
      .map(worldModelViewOf),
    dynamicsModels: input.dynamicsModels.map(dynamicsModelViewOf),
    runs: [...input.runs]
      .sort((a, b) => (String(a.predictedAt) < String(b.predictedAt) ? 1 : -1))
      .map(runSummaryViewOf),
    timeMachine: {
      historical: {
        asOf: asOf as never,
        observations: historical.map(historicalObservationViewOf),
      },
      delayed: {
        asOf: asOf as never,
        lagMs,
        visibleThrough: cutoff as never,
        visibleObservations: visible.map(historicalObservationViewOf),
        withheldInWindow: {
          count: withheld.length,
          observationIds: withheld.map((observation) => String(observation.id)),
        },
      },
      branches: input.branches.map((branch) => branchViewOf(branch, input.branchRecords)),
    },
  };
}

// ——— LAB-007..010: strategy projections ———

export function learnedCandidateViewOf(
  learned: LearnedStrategyCandidateFixture,
  ensemble: { readonly id: string; readonly version: number } | null,
): LabStrategyCandidateView {
  return {
    candidateId: String(learned.id),
    tenantId: learned.tenantId,
    label: null,
    origin: 'learned-strategy',
    action: {
      strategyRef: String(learned.candidate.strategyRef),
      kind: learned.candidate.kind,
      cadencePerWeek: learned.candidate.cadencePerWeek,
      novelty: learned.candidate.novelty,
      engagementEffort: learned.candidate.engagementEffort,
    },
    horizonSteps: learned.horizonSteps,
    expectedReward: learned.trace.finalEstimate?.reward ?? 0,
    interval: {
      lower: learned.trace.finalEstimate?.interval.lower ?? 0,
      upper: learned.trace.finalEstimate?.interval.upper ?? 0,
    },
    provenance: {
      ensembleId: ensemble?.id ?? String(learned.provenance.ensembleId),
      ensembleVersion: ensemble?.version ?? learned.provenance.ensembleVersion,
      memberWorldModelVersions: [...learned.provenance.memberWorldModelVersions],
      simulatorVersion: learned.provenance.simulatorVersion,
      rewardSpecVersion: learned.provenance.rewardSpecVersion,
      seeds: [learned.provenance.seed],
    },
    learning: {
      iterationCount: learned.trace.iterations.length,
      stoppingReason: learned.trace.stoppingReason,
      stoppingDetail: learned.trace.stoppingDetail,
      finalEstimate:
        learned.trace.finalEstimate === null
          ? null
          : {
              reward: learned.trace.finalEstimate.reward,
              interval: { ...learned.trace.finalEstimate.interval },
            },
    },
    counterfactual: true,
  };
}

export function benchmarkCandidateViewOf(
  record: RobustBenchmarkRecordFixture,
  ranked: {
    readonly key: string;
    readonly label: string | null;
    readonly origin: string;
    readonly action: {
      readonly strategyRef: string;
      readonly kind: string;
      readonly cadencePerWeek: number;
      readonly novelty: number;
      readonly engagementEffort: number;
    };
    readonly horizonSteps: number;
    readonly evaluation: {
      readonly expectedReward: number;
      readonly interval: { readonly lower: number; readonly upper: number };
    };
  },
  label: string | null,
): LabStrategyCandidateView {
  const world = record.provenance.worldModels[0];
  return {
    candidateId: `${String(record.id)}:${ranked.key}`,
    tenantId: record.tenantId,
    label,
    origin: ranked.origin as LabStrategyCandidateView['origin'],
    action: {
      strategyRef: String(ranked.action.strategyRef),
      kind: ranked.action.kind as 'content' | 'repost' | 'no-op',
      cadencePerWeek: ranked.action.cadencePerWeek,
      novelty: ranked.action.novelty,
      engagementEffort: ranked.action.engagementEffort,
    },
    horizonSteps: ranked.horizonSteps,
    expectedReward: ranked.evaluation.expectedReward,
    interval: { ...ranked.evaluation.interval },
    provenance: {
      ensembleId: world === undefined ? '' : String(world.ensembleId),
      ensembleVersion: world === undefined ? 0 : world.ensembleVersion,
      memberWorldModelVersions: world === undefined ? [] : [...world.memberWorldModelVersions],
      simulatorVersion: record.provenance.simulatorVersion,
      rewardSpecVersion: record.provenance.rewardSpecVersion,
      seeds: [...record.seeds],
    },
    learning: null,
    counterfactual: true,
  };
}

export function rankedOrganizationViewOf(
  ranked: RankedOrganizationCandidateFixture,
): LabRankedOrganizationView {
  return {
    rank: ranked.rank,
    origin: ranked.candidate.origin,
    organization: {
      organizationId: ranked.candidate.organization.id,
      version: Number(ranked.candidate.organization.version),
    },
    features: {
      fingerprint: { ...ranked.provenance.fingerprint },
      critics: [...ranked.candidate.features.criticNodeIds],
      toolAllocation: ranked.candidate.features.toolAllocation.perNode.map((entry) => ({
        nodeId: entry.nodeId,
        toolRefs: [...entry.toolRefs],
      })),
      executionOrdering: ranked.candidate.features.executionOrdering,
      agentCount: ranked.candidate.organization.nodes.length,
      roles: ranked.candidate.organization.nodes.map((node) => node.role),
    },
    expectedReward: ranked.evaluation.expectedReward,
    interval: { ...ranked.evaluation.interval },
    disagreementHalfWidth: ranked.evaluation.disagreementHalfWidth,
    seedRobustness: {
      seeds: [...ranked.evaluation.seedRobustness.seeds],
      perSeedExpected: [...ranked.evaluation.seedRobustness.perSeedExpected],
      spread: ranked.evaluation.seedRobustness.spread,
    },
    ood: { ...ranked.evaluation.ood },
    variedDimensions: [...ranked.provenance.variedDimensions],
    generationIndex: ranked.provenance.generationIndex,
    intervalOverlapWithLeader:
      ranked.intervalOverlapWithLeader === null
        ? null
        : { overlaps: ranked.intervalOverlapWithLeader.overlaps },
    counterfactual: true,
  };
}

export function organizationSearchResultViewOf(
  result: OrganizationSearchResultFixture,
  scenarioRef: string,
): LabOrganizationSearchResultView {
  return {
    searchId: String(result.id),
    tenantId: result.tenantId,
    ranked: result.ranked.map(rankedOrganizationViewOf),
    comparison: {
      baseline: rankedOrganizationViewOf(result.comparison.baseline),
      handDesigned: rankedOrganizationViewOf(result.comparison.handDesigned),
      generated: result.comparison.generated.map(rankedOrganizationViewOf),
    },
    budget: { ...result.budget },
    stopping: { ...result.stopping },
    scenarioRef: scenarioRef as never,
    ensembleId: String(result.ranked[0]?.provenance.ensembleId ?? ''),
    ensembleVersion: result.ranked[0]?.provenance.ensembleVersion ?? 0,
    searchedAt: result.ranked[0]?.provenance.searchedAt ?? ('1970-01-01T00:00:00.000Z' as never),
    counterfactual: true,
  };
}

export function rewardObjectiveViewOf(
  scenario: LabScenario,
  rewardSpec: { readonly version: number; readonly terms: readonly {
    readonly metric: string;
    readonly weight: number;
    readonly direction: 'maximize' | 'minimize';
    readonly definition: string;
    readonly metricSource: string;
  }[] },
  tenantId: string,
): LabRewardObjectiveView {
  return {
    scenarioRef: scenario.id,
    tenantId: tenantId as never,
    rewardSpecVersion: rewardSpec.version,
    terms: rewardSpec.terms.map((term) => ({ ...term })),
    constraints: {
      objective: scenario.objective,
      maxCost: { ...scenario.budget.maxCost },
      maxDurationMs: scenario.budget.maxDurationMs,
    },
  };
}

// ——— LAB-011/012: transform projections ———

export function transformDefinitionViewOf(
  definition: TransformDefinitionFixture,
): LabTransformDefinitionView {
  return {
    definitionId: String(definition.id),
    version: Number(definition.version),
    tenantId: definition.tenantId,
    kind: definition.kind,
    inputConstraint: {
      name: definition.inputConstraint.name,
      acceptedTypes: [...definition.inputConstraint.acceptedTypes],
      acceptedModalities: [...definition.inputConstraint.acceptedModalities],
      minInputs: definition.inputConstraint.minInputs,
      maxInputs: definition.inputConstraint.maxInputs,
      requiresRights: definition.inputConstraint.requiresRights,
    },
    outputContract: {
      outputTypes: [...definition.outputContract.outputTypes],
      outputCount: definition.outputContract.outputCount,
    },
    capabilityRequirements: definition.capabilityRequirements.map((requirement) => ({
      capabilityId: String(requirement.capabilityId),
      capabilityVersion: Number(requirement.version),
    })),
    humanParticipation: definition.humanParticipation,
    evaluatorRef: String(definition.evaluator),
    rightsRequirements: definition.rightsRequirements.map((ref) => String(ref)),
    policyRequirements: definition.policyRequirements.map((ref) => String(ref)),
    createdAt: definition.createdAt,
  };
}

export function transformGraphViewOf(graph: TransformGraphFixture): LabTransformGraphView {
  return {
    graphId: String(graph.id),
    version: Number(graph.version),
    tenantId: graph.tenantId,
    nodes: graph.nodes.map((node) => ({
      nodeId: node.nodeId,
      definitionId: String(node.definitionId),
      definitionVersion: Number(node.definitionVersion),
      inputs: [...node.inputs],
      parameterization: { ...node.parameterization },
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    createdAt: graph.createdAt,
  };
}

const gateSummaryOf = (
  evidence: import('./lab-fixture-strategy-shapes.js').TransformGateEvidenceFixture,
): string => {
  switch (evidence.gate) {
    case 'contract-validation':
      return `validated ${evidence.validated.kind} · constraint ${evidence.validated.inputConstraintName} · outputs ${evidence.validated.outputTypes.join(', ')}`;
    case 'capability-feasibility':
      return `${evidence.resolvedRequirements.length} capability requirement(s) resolved at exact versions`;
    case 'rights-policy-feasibility':
      return `structural declaration only — ${evidence.rightsRequirements.length} rights + ${evidence.policyRequirements.length} policy refs`;
    case 'evaluator':
      return `evaluator ${String(evidence.evaluatorRef)} bound with input/output schemas`;
    case 'bounded-benchmark-evidence':
      return `engine benchmark ${String(evidence.benchmark.id)} — result ${String(evidence.benchmark.result)}`;
    case 'immutable-version':
      return `freezes candidate v${evidence.candidateVersion} via ${evidence.promotionPath}`;
    case 'provenance':
      return 'derivation chain validated (origin + citations re-resolved)';
  }
};

export function transformCandidateDetailViewOf(
  candidate: TransformCandidateFixture,
  evidenceLog: readonly import('./lab-fixture-strategy-shapes.js').TransformGateEvidenceEntryFixture[],
  attempts: readonly TransformPromotionAttemptFixture[],
): LabTransformCandidateDetailView {
  const gates: readonly LabTransformGateStandingView[] = (
    [
      'contract-validation',
      'capability-feasibility',
      'rights-policy-feasibility',
      'evaluator',
      'bounded-benchmark-evidence',
      'immutable-version',
      'provenance',
    ] as const
  ).map((gate) => {
    const entries = evidenceLog
      .filter((entry) => String(entry.candidateId) === String(candidate.id) && entry.evidence.gate === gate)
      .sort((a, b) => (String(a.entryId) < String(b.entryId) ? -1 : 1));
    const latest = entries[entries.length - 1];
    if (latest === undefined) {
      return { gate, status: 'evidence-missing', entryId: null, evidenceCandidateVersion: null, summary: null };
    }
    return {
      gate,
      status: latest.candidateVersion === candidate.version ? 'evidence-recorded' : 'evidence-stale',
      entryId: latest.entryId,
      evidenceCandidateVersion: latest.candidateVersion,
      summary: gateSummaryOf(latest.evidence),
    };
  });
  const candidateAttempts = attempts
    .filter((attempt) => String(attempt.candidateId) === String(candidate.id))
    .sort((a, b) => a.attempt - b.attempt);
  return {
    candidateId: String(candidate.id),
    version: candidate.version,
    tenantId: candidate.tenantId,
    origin: candidate.origin,
    citation:
      candidate.citation === null
        ? null
        : candidate.citation.kind === 'known'
          ? {
              kind: 'known',
              definitionId: String(candidate.citation.definitionId),
              definitionVersion: candidate.citation.definitionVersion,
              graphId: null,
              graphVersion: null,
              memberCount: null,
            }
          : {
              kind: 'composed',
              definitionId: null,
              definitionVersion: null,
              graphId: String(candidate.citation.graphId),
              graphVersion: candidate.citation.graphVersion,
              memberCount: candidate.citation.members.length,
            },
    derivation: {
      ideaNodeCount: candidate.derivation.ideaNodeIds.length,
      featureBundleCount: candidate.derivation.featureBundleIds.length,
      corpusId: candidate.derivation.corpusId === null ? null : String(candidate.derivation.corpusId),
      corpusVersion: candidate.derivation.corpusVersion,
      learnedStrategyCandidateCount: candidate.derivation.learnedStrategyCandidateIds.length,
      organizationSearchResultCount: candidate.derivation.organizationSearchResultIds.length,
    },
    proposedKind: candidate.proposedContract.kind,
    proposedInputConstraintName: candidate.proposedContract.inputConstraint.name,
    proposedOutputTypes: [...candidate.proposedContract.outputContract.outputTypes],
    proposedHumanParticipation: candidate.proposedContract.humanParticipation,
    proposedCapabilityRequirementCount: candidate.proposedContract.capabilityRequirements.length,
    targetDefinitionId: String(candidate.targetDefinitionId),
    gates,
    promotionAttempts: candidateAttempts.map((attempt) => ({
      attempt: attempt.attempt,
      outcome: attempt.outcome,
      failedGate:
        attempt.failedGate === null
          ? null
          : (attempt.failedGate as LabTransformCandidateDetailView['promotionAttempts'][number]['failedGate']),
      reason: attempt.reason,
      definitionVersion: attempt.definitionVersion,
      attemptedAt: attempt.attemptedAt,
    })),
    promoted:
      candidateAttempts.some(
        (attempt) => attempt.outcome === 'promoted' && attempt.candidateVersion === candidate.version,
      ),
    createdAt: candidate.createdAt,
  };
}

// ——— the overview + bridge projections ———

export function overviewViewOf(input: {
  readonly tenantId: string;
  readonly corpusVersions: readonly CorpusVersionFixture[];
  readonly attachedBundles: number;
  readonly ideaCount: number;
  readonly runCount: number;
  readonly learnedCount: number;
  readonly orgSearchCount: number;
  readonly transformDefinitionCount: number;
  readonly transformCandidateCount: number;
  readonly benchmarkChainCount: number;
  readonly calibrationChainCount: number;
  readonly historicalObservationCount: number;
  readonly counterfactualRecordCount: number;
  readonly regimes: readonly string[];
  readonly activeScenario: LabScenario | null;
  readonly recentRuns: readonly LabRecentRunView[];
  readonly earliestAcquiredAt: string | null;
  readonly latestAcquiredAt: string | null;
}): LabOverviewView {
  const stageOf = (
    stageId: LabLoopStageStandingView['stageId'],
    recordCount: number,
  ): LabLoopStageStandingView => ({ stageId, recordCount, started: recordCount > 0 });
  return {
    tenantId: input.tenantId as never,
    stages: [
      stageOf('corpus', input.corpusVersions.length),
      stageOf('features', input.attachedBundles),
      stageOf('ideas', input.ideaCount),
      stageOf('simulator', input.runCount),
      stageOf('strategy', input.learnedCount + input.orgSearchCount),
      stageOf('transforms', input.transformDefinitionCount + input.transformCandidateCount),
      stageOf('benchmarks', input.benchmarkChainCount),
      stageOf('calibration', input.calibrationChainCount),
    ],
    evidence: {
      historicalObservationCount: input.historicalObservationCount,
      counterfactualRecordCount: input.counterfactualRecordCount,
      regimes: [...input.regimes],
    },
    activeScenario:
      input.activeScenario === null
        ? null
        : {
            scenarioRef: input.activeScenario.id,
            niche: input.activeScenario.niche,
            platform: input.activeScenario.platform,
            objective: input.activeScenario.objective,
            informationLag: input.activeScenario.informationLag,
            pins: {
              corpusVersion: Number(input.activeScenario.corpusVersion),
              simulatorVersion: Number(input.activeScenario.simulatorVersion),
              rewardVersion: Number(input.activeScenario.rewardVersion),
            },
          },
    recentRuns: [...input.recentRuns],
    corpusTimeBoundaries: {
      earliestAcquiredAt: (input.earliestAcquiredAt ?? null) as never,
      latestAcquiredAt: (input.latestAcquiredAt ?? null) as never,
    },
  };
}

export function activeScenarioViewOf(scenario: LabScenario): LabActiveScenarioView {
  return {
    scenarioRef: scenario.id,
    niche: scenario.niche,
    platform: scenario.platform,
    objective: scenario.objective,
    informationLag: scenario.informationLag,
    pins: {
      corpusVersion: Number(scenario.corpusVersion),
      simulatorVersion: Number(scenario.simulatorVersion),
      rewardVersion: Number(scenario.rewardVersion),
    },
  };
}

/** The frozen §24 authorized path (declaration order, gatekeepers named). */
export function bridgePathView(): readonly LabBridgeStepView[] {
  return [
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
        'The real experiment with its evidence records — the only source of measured reality for the selected candidate.',
      surfaceRoute: null,
    },
    {
      position: 9,
      stageId: 'learning-calibration',
      label: 'Learning / Calibration',
      gatingAuthority: 'The Learning and Lab calibration authorities (@mos/learning, @mos/lab LAB-018)',
      requires:
        'The measured outcome folded back as simulation-to-reality prediction error — the closed loop the Lab overview narrates.',
      surfaceRoute: '/lab?section=calibration',
    },
  ];
}

export function bridgeCandidateViewOf(
  kind: LabBridgeCandidateView['kind'],
  candidateRef: string,
  label: string,
  producedBy: string,
): LabBridgeCandidateView {
  return {
    handoffId: `${kind}:${candidateRef}`,
    kind,
    candidateRef,
    label,
    producedBy,
    counterfactual: true,
  };
}

export function candidateHandoffViewOf(
  candidate: LabBridgeCandidateView,
  path: readonly LabBridgeStepView[],
): LabCandidateHandoffView {
  return {
    candidate,
    path,
    binding: null,
    labOnly:
      'lab output informs selection only — a real experiment crosses the §24 boundary through the MOS authorities above; no real-experiment binding exists for this candidate yet',
  };
}

/** Deterministic tenant filter the ports share (§31). */
export function inScope<T extends { readonly tenantId: unknown }>(
  scope: TenantScope,
  record: T,
): boolean {
  return String(record.tenantId) === String(scope.tenantId);
}
