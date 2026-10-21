import type { MosWebComposition } from '../ports/composition.js';
import type { MosRoute } from './route.js';
import type { AppShellView } from '../ports/app-shell.js';
import type { LabPageData } from './lab-page-model.js';
import { LabScope } from './route-scope.js';
import type { TenantScope } from '@mos/contracts';
import type { LabSectionId } from './route.js';
import type { LabOverviewView } from '../ports/lab-overview.js';

/**
 * The Lab WORKSPACE page model + loader (UX-003 wave 2), split from
 * `route-loading.ts` to respect the 400-line managed-file budget: one
 * section per load, typed selection failures, the persistent overview
 * read, and the accepted UX-003 benchmark/calibration surfaces as
 * workspace sections. The loader code is moved verbatim from the
 * accepted working-tree version (recovered from the vite sourcemap
 * after an accidental `git checkout` reverted it).
 */


/**
 * Load the Lab WORKSPACE page model (UX-003 wave 2): one section per load.
 *
 * EVERY section load starts with the persistent research-context read —
 * the overview (the active scenario's Time Machine lag + version pins and
 * the §20-split evidence counts). Its failure is SECONDARY everywhere: the
 * header renders without the pins and the section still loads, with the
 * explicit overviewError marker.
 *
 * The loaded section's PRIMARY read then decides the page: its failure is a
 * route error (the section's own unavailable vocabulary as the code — never
 * a guessed surface). Co-presented listings inside a section (calibration
 * beside benchmarks; graphs and candidates beside definitions) degrade to
 * named markers. Selections resolve through the same tenant scope and
 * degrade to named markers, never placeholders.
 */
export async function loadLabPage(
  composition: MosWebComposition,
  route: MosRoute & { readonly kind: 'lab' },
  shellView: AppShellView,
  retryHref: string,
): Promise<
  | { readonly kind: 'lab'; readonly data: LabPageData }
  | { readonly kind: 'route-error'; readonly code: string; readonly message: string; readonly retryHref: string }
> {
  const scope = LabScope.fromTenantContext(shellView.tenant);

  if (!scope) {
    return { kind: 'lab', data: emptyLabPageData(route.section) };
  }

  // ——— the persistent research-context read (secondary on every section) ———
  let overview: LabOverviewView | null = null;
  let overviewError: LabPageData['overviewError'] = null;
  const overviewResult = await composition.labOverview.loadLabOverview(scope);
  if ('error' in overviewResult) {
    overviewError = 'load-failed';
  } else {
    overview = overviewResult;
  }

  // A mutable staging copy of the neutral page model (the interface is
  // readonly for consumers; this loader is its single producer).
  const data: { -readonly [K in keyof LabPageData]: LabPageData[K] } = {
    ...emptyLabPageData(route.section),
    scope,
    overview,
    overviewError,
  };

  // ——— the write-intent outcome read (UX-003 wave 3, every section) ———
  // The `?receipt=<intentId>` marker resolves through the lab-intents
  // ledger, tenant-scoped. Its failure is SECONDARY (the same discipline
  // as the overview read): a named marker on the section, never a route
  // error — the section's primary read below still decides the route.
  if (route.intentReceiptId !== null) {
    const outcomeRecord = await composition.labIntents.loadLabIntentLedgerRecord(
      route.intentReceiptId,
      scope,
    );
    if (outcomeRecord === null) {
      data.intentOutcomeError = 'lab-intent-not-found';
    } else {
      data.intentOutcome = outcomeRecord;
    }
  }

  switch (route.section) {
    case 'overview': {
      // The overview IS the section: its failure is the route error (it is
      // this section's primary read, already attempted above).
      if ('error' in overviewResult) {
        return {
          kind: 'route-error',
          code: overviewResult.error,
          message: overviewResult.message,
          retryHref,
        };
      }
      return { kind: 'lab', data };
    }

    case 'corpus': {
      const summaries = await composition.labCorpus.listCorpusSummaries(scope);
      if ('error' in summaries) {
        return {
          kind: 'route-error',
          code: summaries.error,
          message: summaries.message,
          retryHref,
        };
      }
      data.corpusSummaries = summaries;
      if (route.corpusId !== null) {
        const detail = await composition.labCorpus.loadCorpusDetail(
          LabScope.corpusRef(route.corpusId),
          scope,
        );
        if ('error' in detail) {
          data.corpusSelectionError =
            detail.error === 'lab-corpus-not-found' ? 'lab-corpus-not-found' : 'load-failed';
        } else {
          data.selectedCorpus = detail;
        }
      }
      return { kind: 'lab', data };
    }

    case 'idea-graph': {
      const graph = await composition.labIdeaGraph.listIdeaGraph(scope);
      if ('error' in graph) {
        return {
          kind: 'route-error',
          code: graph.error,
          message: graph.message,
          retryHref,
        };
      }
      data.ideaGraph = graph;
      if (route.ideaNodeId !== null) {
        const detail = await composition.labIdeaGraph.loadIdeaDetail(
          LabScope.ideaRef(route.ideaNodeId),
          scope,
        );
        if ('error' in detail) {
          data.ideaSelectionError =
            detail.error === 'lab-idea-not-found' ? 'lab-idea-not-found' : 'load-failed';
        } else {
          data.selectedIdea = detail;
        }
      }
      return { kind: 'lab', data };
    }

    case 'simulator': {
      const simulatorResult = await composition.labSimulator.loadSimulatorOverview(scope);
      if ('error' in simulatorResult) {
        return {
          kind: 'route-error',
          code: simulatorResult.error,
          message: simulatorResult.message,
          retryHref,
        };
      }
      data.simulator = simulatorResult;
      if (route.simulationRunId !== null) {
        const run = await composition.labSimulator.loadSimulationRunDetail(
          LabScope.runRef(route.simulationRunId),
          scope,
        );
        if ('error' in run) {
          data.runSelectionError =
            run.error === 'lab-run-not-found' ? 'lab-run-not-found' : 'load-failed';
        } else {
          data.selectedRun = run;
        }
      }
      if (route.branchId !== null) {
        const records = await composition.labSimulator.loadBranchRecords(route.branchId, scope);
        if ('error' in records) {
          data.branchSelectionError =
            records.error === 'lab-branch-not-found' ? 'lab-branch-not-found' : 'load-failed';
        } else {
          data.selectedBranchRecords = records;
        }
      }
      return { kind: 'lab', data };
    }

    case 'strategy': {
      const candidates = await composition.labStrategy.listStrategyCandidates(scope);
      if ('error' in candidates) {
        return {
          kind: 'route-error',
          code: candidates.error,
          message: candidates.message,
          retryHref,
        };
      }
      data.strategyCandidates = candidates;
      const searches = await composition.labStrategy.listOrganizationSearchResults(scope);
      if ('error' in searches) {
        // Co-presented listing: degrades to the named marker — the
        // candidates still render, the §23 comparison shows as unavailable.
        data.strategyError = 'load-failed';
      } else {
        data.organizationSearches = searches;
      }
      // The DECLARED reward objective of the ACTIVE scenario (the overview
      // read above is the honest source of the scenario ref; no scenario —
      // no objective, never a guessed one).
      if (overview?.activeScenario != null) {
        const objective = await composition.labStrategy.loadRewardObjective(
          overview.activeScenario.scenarioRef,
          scope,
        );
        if (!('error' in objective)) {
          data.rewardObjective = objective;
        }
      }
      if (route.strategyCandidateId !== null) {
        data.selectedCandidate =
          candidates.find(
            (candidate) => candidate.candidateId === route.strategyCandidateId,
          ) ?? null;
        if (data.selectedCandidate === null) {
          data.candidateSelectionError = 'lab-candidate-not-found';
        }
      }
      return { kind: 'lab', data };
    }

    case 'transforms': {
      const definitions = await composition.labTransforms.listTransformDefinitions(scope);
      if ('error' in definitions) {
        return {
          kind: 'route-error',
          code: definitions.error,
          message: definitions.message,
          retryHref,
        };
      }
      data.transformDefinitions = definitions;
      const graphs = await composition.labTransforms.listTransformGraphs(scope);
      const candidates = await composition.labTransforms.listDiscoveryCandidates(scope);
      if ('error' in graphs || 'error' in candidates) {
        // Co-presented listings: the definitions still render.
        data.transformsError = 'load-failed';
      } else {
        data.transformGraphs = graphs;
        data.transformCandidates = candidates;
      }
      if (route.transformCandidateId !== null) {
        const candidate = await composition.labTransforms.loadDiscoveryCandidate(
          LabScope.transformRef(route.transformCandidateId),
          scope,
        );
        if ('error' in candidate) {
          data.transformSelectionError =
            candidate.error === 'lab-candidate-not-found' ? 'lab-candidate-not-found' : 'load-failed';
        } else {
          data.selectedTransformCandidate = candidate;
        }
      }
      return { kind: 'lab', data };
    }

    case 'benchmarks': {
      const benchmarksResult = await composition.labBenchmark.listBenchmarkSummaries(scope);
      if ('error' in benchmarksResult) {
        return {
          kind: 'route-error',
          code: benchmarksResult.error,
          message: benchmarksResult.message,
          retryHref,
        };
      }
      data.benchmarks = benchmarksResult;
      if (route.benchmarkId !== null) {
        const digestResult = await composition.labBenchmark.loadBenchmarkDigest(
          LabScope.benchmarkRef(route.benchmarkId),
          route.benchmarkVersion,
          scope,
        );
        if ('error' in digestResult) {
          data.benchmarkSelectionError =
            digestResult.error === 'lab-benchmark-not-found'
              ? 'lab-benchmark-not-found'
              : 'load-failed';
        } else {
          data.selectedDigest = digestResult;
        }
      }
      return { kind: 'lab', data };
    }

    case 'calibration': {
      const calibrationResult = await composition.labCalibration.listCalibrationChains(scope);
      if ('error' in calibrationResult) {
        return {
          kind: 'route-error',
          code: calibrationResult.error,
          message: calibrationResult.message,
          retryHref,
        };
      }
      data.calibrationChains = calibrationResult;
      if (route.calibrationId !== null) {
        const recordsResult = await composition.labCalibration.loadCalibrationRecords(
          LabScope.calibrationRef(route.calibrationId),
          scope,
        );
        if ('error' in recordsResult) {
          data.calibrationSelectionError =
            recordsResult.error === 'lab-calibration-not-found'
              ? 'lab-calibration-not-found'
              : 'load-failed';
        } else {
          data.selectedCalibrationRecords = recordsResult;
        }
      }
      return { kind: 'lab', data };
    }

    case 'bridge': {
      const directory = await composition.labBridge.loadLabBridgeDirectory(scope);
      if ('error' in directory) {
        return {
          kind: 'route-error',
          code: directory.error,
          message: directory.message,
          retryHref,
        };
      }
      data.bridgeDirectory = {
        path: directory.path,
        candidates: directory.candidates,
      };
      if (route.handoffId !== null) {
        const handoff = await composition.labBridge.loadCandidateHandoff(
          LabScope.handoffRef(route.handoffId),
          scope,
        );
        if ('error' in handoff) {
          data.handoffSelectionError =
            handoff.error === 'lab-handoff-not-found' ? 'lab-handoff-not-found' : 'load-failed';
        } else {
          data.selectedHandoff = handoff;
        }
      }
      return { kind: 'lab', data };
    }
  }
}

/** The neutral Lab workspace page model (no section data loaded). */
function emptyLabPageData(section: LabSectionId): LabPageData {
  return {
    scope: null,
    section,
    intentOutcome: null,
    intentOutcomeError: null,
    overview: null,
    overviewError: null,
    corpusSummaries: null,
    selectedCorpus: null,
    corpusSelectionError: null,
    ideaGraph: null,
    selectedIdea: null,
    ideaSelectionError: null,
    simulator: null,
    selectedRun: null,
    runSelectionError: null,
    selectedBranchRecords: null,
    branchSelectionError: null,
    strategyCandidates: null,
    organizationSearches: null,
    rewardObjective: null,
    strategyError: null,
    selectedCandidate: null,
    candidateSelectionError: null,
    transformDefinitions: null,
    transformGraphs: null,
    transformCandidates: null,
    transformsError: null,
    selectedTransformCandidate: null,
    transformSelectionError: null,
    benchmarks: null,
    selectedDigest: null,
    benchmarkSelectionError: null,
    calibrationChains: null,
    calibrationError: null,
    selectedCalibrationRecords: null,
    calibrationSelectionError: null,
    bridgeDirectory: null,
    bridgeError: null,
    selectedHandoff: null,
    handoffSelectionError: null,
  };
}

