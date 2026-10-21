import type { LabOverviewView, LabRecentRunView } from '../ports/lab-overview.js';
import {
  LAB_COUNTERFACTUAL_LABEL,
  LAB_MEASURED_LABEL,
  LAB_LOOP_STAGE_LABELS,
  formatLabLagMs,
  labNextStageLabel,
} from './lab-presentation.js';
import {
  LabCounterfactualBadge,
  LabFact,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSectionUnavailablePanel,
} from './lab-workspace-shared.js';

/**
 * The Lab workspace's Overview section view (UX-003 wave 2, over the
 * LAB-001..018 aggregate): the research-loop stage standings, the §20-SPLIT
 * evidence counts (measured observations and counterfactual records NEVER
 * summed), the active scenario with its Time Machine lag + version pins,
 * recent runs and the corpus acquisition window. Counts only — never
 * content, never a recomputation.
 */

const RUN_SURFACE_LABELS: Readonly<Record<LabRecentRunView['surface'], string>> = Object.freeze({
  'robust-benchmark': 'Robust benchmark (LAB-017)',
  'strategy-learning': 'Strategy learning (LAB-009)',
  'organization-search': 'Organization search (LAB-010)',
  simulator: 'Simulator (LAB-004)',
});

function LabStageStandingRow({
  stageId,
  recordCount,
  started,
}: {
  readonly stageId: keyof typeof LAB_LOOP_STAGE_LABELS;
  readonly recordCount: number;
  readonly started: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${started ? 'bg-emerald-400' : 'bg-slate-600'}`}
          aria-hidden="true"
        />
        <span className="truncate text-sm text-slate-200">{LAB_LOOP_STAGE_LABELS[stageId]}</span>
      </span>
      <span className="shrink-0 text-xs text-slate-400">
        {recordCount} record{recordCount === 1 ? '' : 's'}
        {started ? '' : ' · not started'}
      </span>
    </li>
  );
}

function LabRecentRunRow({ run }: { readonly run: LabRecentRunView }) {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
      data-testid={`lab-recent-run-${run.runId}`}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-300">{run.runId}</span>
        <LabCounterfactualBadge testId={`lab-recent-run-counterfactual-${run.runId}`} />
      </span>
      <span className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>{RUN_SURFACE_LABELS[run.surface]}</span>
        <span className="font-mono text-slate-500">{run.recordedAt}</span>
      </span>
    </li>
  );
}

function LabActiveScenarioPanel({ scenario }: { readonly scenario: LabOverviewView['activeScenario'] }) {
  if (scenario === null) {
    return (
      <p
        className="rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-500"
        data-testid="lab-overview-no-active-scenario"
      >
        No active scenario is pinned in this tenant scope — the overview renders exactly that,
        never a guessed scenario.
      </p>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      data-testid="lab-overview-active-scenario"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">{scenario.scenarioRef}</span>
        <span className="text-xs text-slate-400">
          {scenario.niche} · {scenario.platform}
        </span>
      </div>
      <p className="text-xs text-slate-300">{scenario.objective}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1" data-testid="lab-overview-scenario-pins">
        <LabFact label="Time Machine information lag">
          {formatLabLagMs(scenario.informationLag)} (at T the agent sees only information by T−L)
        </LabFact>
        <LabFact label="corpus pin">v{scenario.pins.corpusVersion}</LabFact>
        <LabFact label="simulator pin">v{scenario.pins.simulatorVersion}</LabFact>
        <LabFact label="reward spec pin">v{scenario.pins.rewardVersion}</LabFact>
      </div>
    </div>
  );
}

/** The Overview section view over the loaded page model fields. */
export function LabOverviewSectionView({
  overview,
  overviewError,
}: {
  readonly overview: LabOverviewView | null;
  readonly overviewError: 'load-failed' | null;
}) {
  if (overviewError !== null) {
    return <LabSectionUnavailablePanel section="overview" />;
  }
  if (overview === null) {
    return <LabSectionLoadingPanel section="overview" />;
  }

  const nextStage = labNextStageLabel(overview.stages);
  const hasAnyRecord = overview.stages.some((stage) => stage.started);

  return (
    <div className="flex flex-col gap-6" data-testid="lab-overview-section">
      <section aria-labelledby="lab-overview-stages-title">
        <h3 id="lab-overview-stages-title" className="text-sm font-semibold text-slate-100">
          Research-loop standings
        </h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          The §2 research loop's stages in declaration order — record counts the lab authorities
          actually hold in this tenant scope.
          {nextStage !== null
            ? ` Next stage: ${nextStage} (the first stage with zero records).`
            : ' Every stage holds records — the loop stands complete through calibration.'}
        </p>
        {hasAnyRecord ? (
          <ul className="flex flex-col gap-2" data-testid="lab-overview-stages">
            {overview.stages.map((stage) => (
              <LabStageStandingRow key={stage.stageId} {...stage} />
            ))}
          </ul>
        ) : (
          <LabSectionEmptyPanel section="overview" what="research-loop records" />
        )}
      </section>

      <section aria-labelledby="lab-overview-evidence-title">
        <h3 id="lab-overview-evidence-title" className="text-sm font-semibold text-slate-100">
          Evidence split (§20 — never summed)
        </h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Measured historical observations and counterfactual simulation records are DISTINCT
          kinds of data (lock rule 29); the overview keeps them in distinct counts, always.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className="flex flex-col gap-1 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4"
            data-testid="lab-overview-measured-count"
            title={LAB_MEASURED_LABEL}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">
              Measured — {LAB_MEASURED_LABEL}
            </span>
            <span className="text-2xl font-bold text-emerald-200">
              {overview.evidence.historicalObservationCount}
            </span>
            <span className="text-xs text-slate-400">
              boundary-chain observations
              {overview.evidence.regimes.length > 0
                ? ` · regimes: ${overview.evidence.regimes.join(', ')}`
                : ' · no regimes recorded'}
            </span>
          </div>
          <div
            className="flex flex-col gap-1 rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/20 p-4"
            data-testid="lab-overview-counterfactual-count"
            title={LAB_COUNTERFACTUAL_LABEL}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-fuchsia-300/80">
              Counterfactual — {LAB_COUNTERFACTUAL_LABEL}
            </span>
            <span className="text-2xl font-bold text-fuchsia-200">
              {overview.evidence.counterfactualRecordCount}
            </span>
            <span className="text-xs text-slate-400">
              simulation-derived records (runs, benchmarks, searches, learning)
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="lab-overview-scenario-title">
        <h3 id="lab-overview-scenario-title" className="text-sm font-semibold text-slate-100">
          Active scenario
        </h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          The scenario the tenant's lab work is pinned against — with the Time Machine
          information lag and the exact version pins (reproducibility).
        </p>
        <LabActiveScenarioPanel scenario={overview.activeScenario} />
      </section>

      <section aria-labelledby="lab-overview-runs-title">
        <h3 id="lab-overview-runs-title" className="text-sm font-semibold text-slate-100">
          Recent runs
        </h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Most-recent-first lab runs in this tenant scope — every output counterfactual-labeled.
        </p>
        {overview.recentRuns.length === 0 ? (
          <LabSectionEmptyPanel section="overview-runs" what="recent lab runs" />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="lab-overview-recent-runs">
            {overview.recentRuns.map((run) => (
              <LabRecentRunRow key={run.runId} run={run} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lab-overview-corpus-window-title">
        <h3 id="lab-overview-corpus-window-title" className="text-sm font-semibold text-slate-100">
          Corpus acquisition window
        </h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          The earliest/latest acquisition boundary of the corpus evidence in this scope.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <LabFact label="earliest acquired">
            {overview.corpusTimeBoundaries.earliestAcquiredAt ?? '— no corpus evidence yet'}
          </LabFact>
          <LabFact label="latest acquired">
            {overview.corpusTimeBoundaries.latestAcquiredAt ?? '— no corpus evidence yet'}
          </LabFact>
        </div>
      </section>
    </div>
  );
}
