import type {
  LabBenchmarkDigestView,
  LabBenchmarkSummaryView,
} from '../ports/lab-benchmark.js';
import type {
  LabCalibrationChainView,
  LabCalibrationRecordView,
} from '../ports/lab-calibration.js';
import type { LabOverviewView } from '../ports/lab-overview.js';
import type {
  LabCorpusDetailView,
  LabCorpusSummaryView,
} from '../ports/lab-corpus.js';
import type {
  LabIdeaDetailView,
  LabIdeaGraphView,
} from '../ports/lab-idea-graph.js';
import type {
  LabBranchRecordView,
  LabSimulatorOverviewView,
  LabSimulationRunDetailView,
} from '../ports/lab-simulator.js';
import type {
  LabOrganizationSearchResultView,
  LabRewardObjectiveView,
  LabStrategyCandidateView,
} from '../ports/lab-strategy.js';
import type {
  LabTransformCandidateDetailView,
  LabTransformDefinitionView,
  LabTransformGraphView,
} from '../ports/lab-transforms.js';
import type {
  LabBridgeCandidateView,
  LabBridgeStepView,
  LabCandidateHandoffView,
} from '../ports/lab-bridge.js';
import type { LabSectionId } from './route.js';
import type { TenantScope } from '@mos/contracts';

/**
 * The Lab WORKSPACE page model types (UX-003 wave 2), split from the
 * loader module to respect the 400-line managed-file budget: the view-model
 * interfaces the loader produces and `lab-view.tsx` renders. Types only —
 * no runtime code.
 */

/** The Lab workspace's bridge directory read (the §24 path + candidates). */
export interface LabBridgeDirectoryData {
  readonly path: readonly LabBridgeStepView[];
  readonly candidates: readonly LabBridgeCandidateView[];
}

/**
 * Fully loaded Lab WORKSPACE page model (UX-003 wave 2): one section per
 * load, plus the persistent research-context read (the overview — the
 * active scenario's Time Machine pins). ONLY the loaded section's fields
 * are populated; the others stay at their neutral defaults (null / empty)
 * because the workspace renders one section at a time — a section whose
 * data is null WITHOUT an error marker is the explicit not-loaded-on-this-
 * pass state, never a fabricated empty. Selection failures degrade to
 * NAMED markers, never placeholders; a failed PRIMARY section read is a
 * route error.
 */
export interface LabPageData {
  /** Tenant scope for lab reads, or `null` when no tenant context resolved. */
  readonly scope: TenantScope | null;
  /** The workspace section this page model serves. */
  readonly section: LabSectionId;

  // ——— persistent research-context read (every section) ———
  /** The research overview (active scenario pins + evidence counts). */
  readonly overview: LabOverviewView | null;
  /** Honest-unavailable marker for the overview read (secondary everywhere). */
  readonly overviewError: 'load-failed' | null;

  // ——— Corpus & Evidence section (LAB-001/002) ———
  /** null = not loaded on this pass (the explicit loading state). */
  readonly corpusSummaries: readonly LabCorpusSummaryView[] | null;
  readonly selectedCorpus: LabCorpusDetailView | null;
  readonly corpusSelectionError: 'lab-corpus-not-found' | 'load-failed' | null;

  // ——— Idea Graph section (LAB-003) ———
  readonly ideaGraph: LabIdeaGraphView | null;
  readonly selectedIdea: LabIdeaDetailView | null;
  readonly ideaSelectionError: 'lab-idea-not-found' | 'load-failed' | null;

  // ——— Simulator & Time Machine section (LAB-004/005/006) ———
  readonly simulator: LabSimulatorOverviewView | null;
  readonly selectedRun: LabSimulationRunDetailView | null;
  readonly runSelectionError: 'lab-run-not-found' | 'load-failed' | null;
  readonly selectedBranchRecords: readonly LabBranchRecordView[] | null;
  readonly branchSelectionError: 'lab-branch-not-found' | 'load-failed' | null;

  // ——— Strategy & Organizations section (LAB-007..010) ———
  /** null = not loaded on this pass (the explicit loading state). */
  readonly strategyCandidates: readonly LabStrategyCandidateView[] | null;
  /** null = not loaded, or the co-presented listing failed (strategyError). */
  readonly organizationSearches: readonly LabOrganizationSearchResultView[] | null;
  /** The DECLARED reward objective of the ACTIVE scenario, when one is pinned. */
  readonly rewardObjective: LabRewardObjectiveView | null;
  readonly strategyError: 'load-failed' | null;
  /** Selected candidate (`?candidate=<id>`), resolved from the listing. */
  readonly selectedCandidate: LabStrategyCandidateView | null;
  readonly candidateSelectionError: 'lab-candidate-not-found' | null;

  // ——— Transforms section (LAB-011/012) ———
  /** null = not loaded on this pass (the explicit loading state). */
  readonly transformDefinitions: readonly LabTransformDefinitionView[] | null;
  /** null = not loaded, or the co-presented listing failed (transformsError). */
  readonly transformGraphs: readonly LabTransformGraphView[] | null;
  readonly transformCandidates: readonly LabTransformCandidateDetailView[] | null;
  readonly transformsError: 'load-failed' | null;
  readonly selectedTransformCandidate: LabTransformCandidateDetailView | null;
  readonly transformSelectionError: 'lab-candidate-not-found' | 'load-failed' | null;

  // ——— Benchmarks section (LAB-017 — the accepted UX-003 surface) ———
  /** null = not loaded on this pass (the explicit loading state). */
  readonly benchmarks: readonly LabBenchmarkSummaryView[] | null;
  /** Benchmark digest for `?benchmark=<id>` (exact `?version=` or latest). */
  readonly selectedDigest: LabBenchmarkDigestView | null;
  readonly benchmarkSelectionError: 'lab-benchmark-not-found' | 'load-failed' | null;

  // ——— Calibration section (LAB-018 — the accepted UX-003 surface) ———
  /** null = not loaded on this pass (the explicit loading state). */
  readonly calibrationChains: readonly LabCalibrationChainView[] | null;
  /** Honest-unavailable marker for the calibration listing. */
  readonly calibrationError: 'load-failed' | null;
  /** Calibration records for `?calibration=<id>`. */
  readonly selectedCalibrationRecords: readonly LabCalibrationRecordView[] | null;
  readonly calibrationSelectionError: 'lab-calibration-not-found' | 'load-failed' | null;

  // ——— Next Steps bridge section (the §24 authorized path) ———
  readonly bridgeDirectory: LabBridgeDirectoryData | null;
  readonly bridgeError: 'load-failed' | null;
  /** The DECLARED handoff description for `?handoff=<id>`. */
  readonly selectedHandoff: LabCandidateHandoffView | null;
  readonly handoffSelectionError: 'lab-handoff-not-found' | 'load-failed' | null;
}
