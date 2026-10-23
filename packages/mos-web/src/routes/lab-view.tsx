import type { LabPageData } from "./route-loading.js";
import type { LabSectionId } from "./route.js";
import type { LabIntentDeclaration } from "../ports/lab-intents.js";
import { LabOverviewSectionView } from "../views/lab-overview-view.js";
import { LabCorpusSectionView } from "../views/lab-corpus-view.js";
import { LabIdeaGraphSectionView } from "../views/lab-idea-graph-view.js";
import { LabSimulatorSectionView } from "../views/lab-simulator-view.js";
import { LabStrategySectionView } from "../views/lab-strategy-view.js";
import { LabTransformsSectionView } from "../views/lab-transforms-view.js";
import { LabBridgeSectionView } from "../views/lab-bridge-view.js";
import { LabBenchmarkDirectoryView } from "../views/lab-benchmark-directory.js";
import { LabBenchmarkDigestPanel } from "../views/lab-benchmark-digest.js";
import { LabCalibrationDetailPanel } from "../views/lab-calibration-detail.js";
import { LabCalibrationStatusView } from "../views/lab-calibration-status.js";
import {
  LAB_BOUNDARY_NOTE,
  LAB_LOOP_NARRATION,
  LAB_SECTION_IDS,
  LAB_SECTION_LABELS,
} from "../views/lab-presentation.js";
import { MosNoTenantContextView } from "../shell/route-fallbacks.js";
import { openMosComposer } from "../shell/composer-bridge.js";
import type { ComposerActionId } from "../shell/composer-actions.js";
import { COMPOSER_ACTIONS_BY_ID } from "../shell/composer-actions.js";
import { DisclosureItem, SummaryLayer } from "../views/disclosure/disclosure-primitive.js";
import { buildLabSummary } from "../views/disclosure/surface-summaries.js";
import {
  LabSectionLoadingPanel,
  LabSectionUnavailablePanel,
} from "../views/lab-workspace-shared.js";
import { LabIntentOutcomePanel } from "../views/lab-intent-outcome-panel.js";

/**
 * The Lab WORKSPACE (UX-003 wave 2): a first-class MOS research surface —
 * section navigation over the full research loop (overview → corpus &
 * evidence → ideas → simulation & Time Machine → strategy &
 * organizations → transforms → robust benchmarks → calibration → the
 * authorized next-step bridge), one section per load, with the persistent
 * research context (the active scenario's Time Machine horizon and
 * information cutoff pins) in the workspace header.
 *
 * Every section view keeps the accepted UX-003 discipline: counterfactual
 * values labeled simulated, measured observations labeled measured, the
 * §24 boundary note at the top, uncertainty intervals never flattened, the
 * no-op baseline always visible in comparisons, and NO lab action
 * performed or faked on this surface (declared affordances render
 * disabled-with-reason until the authority is bound).
 */

function BenchmarkSelectionErrorPanel({
  error,
}: {
  readonly error: "lab-benchmark-not-found" | "load-failed";
}) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
      data-testid="lab-benchmark-selection-error"
    >
      {error === "lab-benchmark-not-found"
        ? "The selected benchmark record chain does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess)."
        : "The selected benchmark digest could not be loaded — the lab benchmark service failed explicitly."}
    </aside>
  );
}

function CalibrationSelectionErrorPanel({
  error,
}: {
  readonly error: "lab-calibration-not-found" | "load-failed";
}) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
      data-testid="lab-calibration-selection-error"
    >
      {error === "lab-calibration-not-found"
        ? "The selected calibration chain does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess)."
        : "The selected calibration records could not be loaded — the lab calibration service failed explicitly."}
    </aside>
  );
}

function CalibrationUnavailablePanel() {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
      data-testid="lab-calibration-unavailable"
    >
      The online-calibration status could not be loaded on this pass — the lab calibration service
      failed explicitly. The benchmark surface above is unaffected; calibration is shown as
      explicitly unavailable rather than as a fabricated empty list.
    </aside>
  );
}

/**
 * The per-section Ask MOS affordance (UXR-WC §6.1 action-aware composer): one
 * owning action per Lab section — preloaded into the composer when the
 * operator asks from that section. Sections whose write paths are declared
 * affordances (no matching catalog action) render NO button.
 */
const LAB_SECTION_ASK_MOS: Readonly<Partial<Record<LabSectionId, ComposerActionId>>> = {
  corpus: "ingest-reference-document",
  simulator: "simulate-step",
  strategy: "search-organizations",
  benchmarks: "run-benchmark",
  calibration: "record-calibration-error",
};

/** The workspace's persistent research-context strip (every section). */
function LabResearchContextStrip({ data }: { readonly data: LabPageData }) {
  if (data.overviewError !== null || data.overview === null) {
    return null;
  }
  const scenario = data.overview.activeScenario;
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500"
      data-testid="lab-research-context"
    >
      <span className="font-semibold text-slate-700">Research context</span>
      {scenario === null ? (
        <span data-testid="lab-research-context-no-scenario">
          No active scenario — the corpus/overview sections hold the standing evidence.
        </span>
      ) : (
        <>
          <span data-testid="lab-research-context-scenario">
            <span className="font-semibold text-slate-700">{scenario.scenarioRef}</span>
            {" — "}
            {scenario.niche} / {scenario.platform}
          </span>
          <span
            data-testid="lab-research-context-lag"
            title="Time Machine information lag L (§20): at T the agent sees only information available by T−L."
          >
            information cutoff T−{Math.round(scenario.informationLag / 86_400_000)}d
          </span>
          <span data-testid="lab-research-context-pins">
            pins: corpus v{scenario.pins.corpusVersion} · simulator v
            {scenario.pins.simulatorVersion} · reward v{scenario.pins.rewardVersion}
          </span>
        </>
      )}
    </div>
  );
}

/** The workspace section rail — full-load navigation (one section per load). */
function LabWorkspaceNav({ current }: { readonly current: LabSectionId }) {
  return (
    <nav
      aria-label="Research Lab sections"
      className="flex flex-wrap gap-2"
      data-testid="lab-workspace-nav"
    >
      {LAB_SECTION_IDS.map((section) => {
        const active = section === current;
        return (
          <a
            key={section}
            href={section === "overview" ? "/lab" : `/lab?section=${section}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }
            data-testid={`lab-nav-${section}`}
          >
            {LAB_SECTION_LABELS[section]}
          </a>
        );
      })}
    </nav>
  );
}

function LabBenchmarksSection({
  data,
  onDeclareLabIntent,
}: {
  readonly data: LabPageData;
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  if (data.benchmarks === null) {
    return <LabSectionLoadingPanel section="benchmarks" />;
  }
  if (data.benchmarkSelectionError === "load-failed") {
    return <LabSectionUnavailablePanel section="benchmarks" />;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="lab-benchmarks-section">
      <section aria-labelledby="lab-benchmarks-title">
        <h2 id="lab-benchmarks-title" className="text-base font-semibold text-slate-900">
          Benchmark record chains
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Robust marketing benchmarks (LAB-017) — multi-seed, multi-world-model evaluation of
          declared candidate sets under versioned robustness policies, with the no-op baseline
          always present. Every number is a counterfactual simulation estimate; open a chain to
          browse one frozen record version.
        </p>
        <LabBenchmarkDirectoryView
          benchmarks={data.benchmarks}
          selectedBenchmarkId={
            data.selectedDigest === null ? null : data.selectedDigest.summary.benchmarkId
          }
          onDeclareLabIntent={onDeclareLabIntent}
        />
      </section>

      {data.benchmarkSelectionError !== null ? (
        <BenchmarkSelectionErrorPanel error={data.benchmarkSelectionError} />
      ) : null}
      {data.selectedDigest !== null ? (
        <DisclosureItem
          id="ux005-lab-digest"
          defaultOpen
          summary={
            <span className="text-sm font-semibold text-slate-800">
              Benchmark digest — {data.selectedDigest.summary.benchmarkId} (the counterfactual badge
              stays visible here; expand for the full digest)
            </span>
          }
        >
          <LabBenchmarkDigestPanel digest={data.selectedDigest} />
        </DisclosureItem>
      ) : null}
    </div>
  );
}

function LabCalibrationSection({
  data,
  onDeclareLabIntent,
}: {
  readonly data: LabPageData;
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  if (data.calibrationChains === null && data.calibrationError === null) {
    return <LabSectionLoadingPanel section="calibration" />;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="lab-calibration-section">
      {data.calibrationError !== null ? <CalibrationUnavailablePanel /> : null}
      {data.calibrationChains !== null ? (
        <section aria-labelledby="lab-calibration-title">
          <h2 id="lab-calibration-title" className="text-base font-semibold text-slate-900">
            Online calibration
          </h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Simulation-to-reality prediction error (LAB-018) — append-only analysis records joining
            counterfactual benchmark predictions with measured boundary-chain observations, and the
            versioned feedback contexts derived from them.
          </p>
          <LabCalibrationStatusView
            chains={data.calibrationChains}
            selectedCalibrationId={
              data.selectedCalibrationRecords === null
                ? null
                : data.selectedCalibrationRecords.length > 0
                  ? (data.selectedCalibrationRecords[0]?.calibrationId ?? null)
                  : null
            }
            onDeclareLabIntent={onDeclareLabIntent}
          />
        </section>
      ) : null}

      {data.calibrationSelectionError !== null ? (
        <CalibrationSelectionErrorPanel error={data.calibrationSelectionError} />
      ) : null}
      {data.selectedCalibrationRecords !== null && data.selectedCalibrationRecords.length > 0 ? (
        <DisclosureItem
          id="ux005-lab-calibration-records"
          defaultOpen
          summary={
            <span className="text-sm font-semibold text-slate-800">
              Calibration records — {data.selectedCalibrationRecords[0]?.calibrationId} (append-only
              chain; expand for the full record list)
            </span>
          }
        >
          <LabCalibrationDetailPanel records={data.selectedCalibrationRecords} />
        </DisclosureItem>
      ) : null}
    </div>
  );
}

function LabSectionContent({
  data,
  onDeclareLabIntent,
}: {
  readonly data: LabPageData;
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  switch (data.section) {
    case "overview":
      return <LabOverviewSectionView overview={data.overview} overviewError={data.overviewError} />;
    case "corpus":
      return (
        <LabCorpusSectionView
          summaries={data.corpusSummaries}
          selectedCorpus={data.selectedCorpus}
          corpusSelectionError={data.corpusSelectionError}
          onDeclareLabIntent={onDeclareLabIntent}
        />
      );
    case "idea-graph":
      return (
        <LabIdeaGraphSectionView
          ideaGraph={data.ideaGraph}
          selectedIdea={data.selectedIdea}
          ideaSelectionError={data.ideaSelectionError}
        />
      );
    case "simulator":
      return (
        <LabSimulatorSectionView
          simulator={data.simulator}
          selectedRun={data.selectedRun}
          runSelectionError={data.runSelectionError}
          selectedBranchRecords={data.selectedBranchRecords}
          branchSelectionError={data.branchSelectionError}
          onDeclareLabIntent={onDeclareLabIntent}
        />
      );
    case "strategy":
      return (
        <LabStrategySectionView
          strategyCandidates={data.strategyCandidates}
          organizationSearches={data.organizationSearches}
          rewardObjective={data.rewardObjective}
          strategyError={data.strategyError}
          selectedCandidate={data.selectedCandidate}
          candidateSelectionError={data.candidateSelectionError}
          onDeclareLabIntent={onDeclareLabIntent}
        />
      );
    case "transforms":
      return (
        <LabTransformsSectionView
          transformDefinitions={data.transformDefinitions}
          transformGraphs={data.transformGraphs}
          transformCandidates={data.transformCandidates}
          transformsError={data.transformsError}
          selectedTransformCandidate={data.selectedTransformCandidate}
          transformSelectionError={data.transformSelectionError}
        />
      );
    case "benchmarks":
      return <LabBenchmarksSection data={data} onDeclareLabIntent={onDeclareLabIntent} />;
    case "calibration":
      return <LabCalibrationSection data={data} onDeclareLabIntent={onDeclareLabIntent} />;
    case "bridge":
      return (
        <LabBridgeSectionView
          path={data.bridgeDirectory === null ? null : data.bridgeDirectory.path}
          candidates={data.bridgeDirectory === null ? null : data.bridgeDirectory.candidates}
          selectedHandoff={data.selectedHandoff}
          handoffSelectionError={data.handoffSelectionError}
        />
      );
  }
}

/** The Lab workspace page view over the loaded section's page model. */
export function LabView({
  data,
  onDeclareLabIntent,
}: {
  readonly data: LabPageData;
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  if (data.scope === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Research Lab</h1>
        <MosNoTenantContextView />
      </div>
    );
  }

  const counterfactualCount = data.benchmarks === null ? 0 : data.benchmarks.length;
  const measuredCount = data.calibrationChains === null ? 0 : data.calibrationChains.length;
  const labSummary = buildLabSummary({ measuredCount, counterfactualCount });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">Research Lab</h1>
        <p className="mt-1 text-sm text-slate-500">
          {LAB_LOOP_NARRATION.position} — {LAB_LOOP_NARRATION.summary}
        </p>
        <p className="mt-1 text-xs text-amber-700" data-testid="lab-boundary-note">
          {LAB_BOUNDARY_NOTE}
        </p>
        {LAB_SECTION_ASK_MOS[data.section] !== undefined ? (
          <button
            type="button"
            onClick={() =>
              openMosComposer({
                actionId: LAB_SECTION_ASK_MOS[data.section] as ComposerActionId,
                contextLabel: `Research Lab · ${LAB_SECTION_LABELS[data.section]}`,
              })
            }
            className="self-start rounded-md bg-mos-navy px-4 py-2 text-sm font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
            title="Opens the Ask MOS composer preloaded with this section's owning action (also Ctrl+J anywhere)"
            data-testid={`lab-ask-mos-${data.section}`}
          >
            Ask MOS — {COMPOSER_ACTIONS_BY_ID[LAB_SECTION_ASK_MOS[data.section] as ComposerActionId].label}
          </button>
        ) : null}
      </header>

      <SummaryLayer
        surface="lab"
        headline={labSummary.headline}
        stats={labSummary.stats}
        honestyLabels={labSummary.honestyLabels}
      />

      <LabResearchContextStrip data={data} />
      <LabWorkspaceNav current={data.section} />

      <LabIntentOutcomePanel outcome={data.intentOutcome} outcomeError={data.intentOutcomeError} />

      <div className="border-t border-slate-200 pt-4">
        <LabSectionContent data={data} onDeclareLabIntent={onDeclareLabIntent} />
      </div>
    </div>
  );
}
