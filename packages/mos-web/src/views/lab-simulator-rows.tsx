import type {
  LabBranchView,
  LabHistoricalObservationView,
  LabSimulatorOverviewView,
  LabSimulationRunDetailView,
  LabSimulationRunSummaryView,
} from '../ports/lab-simulator.js';
import {
  formatLabExpectedWithInterval,
  formatLabLagMs,
  LAB_TIME_MACHINE_MODE_LABELS,
} from './lab-presentation.js';
import {
  LabCounterfactualBadge,
  LabDisclosureNote,
  LabFact,
  LabMeasuredBadge,
} from './lab-workspace-shared.js';

/**
 * The Simulator & Time Machine section's ROW atoms + run-detail panel
 * (UX-003 wave 2, over LAB-004/005/006): world/dynamics model rows,
 * simulation-run rows (seed + horizon + cutoff pins), historical
 * observation rows (MEASURED), branch rows (counterfactual, intervention
 * summary) and the run detail panel (metrics WITH intervals, deltas,
 * next world state, strategy ref). Split from `lab-simulator-view.tsx`
 * to respect the 400-line managed-file budget.
 */

export function LabWorldModelRow({
  world,
}: {
  readonly world: LabSimulatorOverviewView['worldModels'][number];
}) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
      data-testid={`lab-world-model-${world.worldModelId}-v${world.worldModelVersion}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs text-slate-200">{world.worldModelId}</span>
        <span className="text-xs text-slate-500">v{world.worldModelVersion}</span>
        <LabCounterfactualBadge />
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-400">
        <span>audience {world.state.baseAudience.toLocaleString()}</span>
        <span>fatigue {world.state.fatigue.toFixed(2)}</span>
        <span>competitor share {world.state.competitorShare.toFixed(2)}</span>
        <span>seasonal {world.state.seasonalFactor.toFixed(2)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
        <LabDisclosureNote disclosure={world.disclosure} />
        <span>{world.niche} · {world.platform}</span>
      </span>
      {world.notes === null ? null : <span className="text-[11px] text-slate-500">{world.notes}</span>}
    </li>
  );
}

export function LabDynamicsModelRow({
  model,
}: {
  readonly model: LabSimulatorOverviewView['dynamicsModels'][number];
}) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
      data-testid={`lab-dynamics-model-${model.dynamicsModelId}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs text-slate-200">{model.dynamicsModelId}</span>
        <span className="text-xs text-slate-500">v{model.version}</span>
        <LabCounterfactualBadge />
      </span>
      <ul className="flex flex-col gap-0.5">
        {model.populations.map((segment) => (
          <li
            key={segment.segmentId}
            className="flex flex-wrap gap-x-3 text-[11px] text-slate-400"
            data-testid={`lab-dynamics-segment-${segment.segmentId}`}
          >
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
              {segment.kind}
            </span>
            <span className="text-slate-300">{segment.label}</span>
            <span>share {(segment.share * 100).toFixed(0)}%</span>
            <span>fatigue-sens {segment.fatigueSensitivity.toFixed(2)}</span>
            <span>novelty {segment.noveltySeeking.toFixed(2)}</span>
            <span>engagement {segment.engagementPropensity.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <LabDisclosureNote disclosure={model.disclosure} />
    </li>
  );
}

export function LabSimulationRunRow({
  run,
  selected,
}: {
  readonly run: LabSimulationRunSummaryView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=simulator&run=${encodeURIComponent(run.runId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`lab-run-row-${run.runId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-100">{run.runId}</span>
            <LabCounterfactualBadge testId={`lab-run-counterfactual-${run.runId}`} />
          </span>
          <span className="text-xs text-slate-400">
            scenario {run.scenarioRef} · seed {run.seed} (determinism) · step {run.step}
          </span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>
            world model v{run.worldModelVersion} · simulator v{run.simulatorVersion}
          </span>
          <span className="font-mono">predicted {run.predictedAt}</span>
          <span className="font-mono">{run.tenantId}</span>
        </span>
      </a>
    </li>
  );
}

export function LabObservationRow({
  observation,
}: {
  readonly observation: LabHistoricalObservationView;
}) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-emerald-900/40 bg-emerald-950/10 px-3 py-2"
      data-testid={`lab-observation-${observation.observationId}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs text-slate-200">{observation.observationId}</span>
        <LabMeasuredBadge testId={`lab-observation-measured-${observation.observationId}`} />
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-400">
        {observation.metrics.map((metric) => (
          <span key={metric.metric}>
            {metric.metric} <span className="font-mono text-slate-300">{metric.value}</span>{' '}
            {metric.unit}
          </span>
        ))}
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span className="font-mono">observed {observation.observedAt}</span>
        <span>regime {observation.regime}</span>
        <span>{observation.niche} · {observation.platform}</span>
      </span>
      <span className="text-[11px] text-slate-500">
        sources: {observation.sourceRefs.join(' · ')}
      </span>
    </li>
  );
}

export function LabBranchRow({
  branch,
  selected,
}: {
  readonly branch: LabBranchView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=simulator&branch=${encodeURIComponent(branch.branchId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`lab-branch-row-${branch.branchId}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-100">{branch.branchId}</span>
          <span className="text-xs text-slate-500">v{branch.version}</span>
          <LabCounterfactualBadge testId={`lab-branch-counterfactual-${branch.branchId}`} />
        </span>
        <span className="text-xs text-slate-300">{branch.intervention.description}</span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span className="font-mono">forked at {branch.forkPoint}</span>
          <span>
            parent {branch.parentBranchId ?? 'the historical timeline'}
          </span>
          <span>
            {branch.recordCount} recorded prediction{branch.recordCount === 1 ? '' : 's'}
          </span>
          {branch.label === null ? null : <span>label {branch.label}</span>}
        </span>
        <span className="text-[11px] text-slate-500">
          changed parameters:{' '}
          {Object.keys(branch.intervention.changedParameters).join(', ') || '—'}
        </span>
      </a>
    </li>
  );
}

export function LabRunDetailPanel({ detail }: { readonly detail: LabSimulationRunDetailView }) {
  const { summary, metrics, deltas, nextWorldState, strategyRef, uncertainty } = detail;
  return (
    <div className="flex flex-col gap-4" data-testid="lab-run-detail">
      <div
        className="flex flex-col gap-1 rounded-lg border border-sky-800/60 bg-sky-950/20 p-4"
        data-testid="lab-run-detail-header"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-100">{summary.runId}</span>
          <LabCounterfactualBadge testId="lab-run-detail-counterfactual" />
        </span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span>scenario {summary.scenarioRef}</span>
          <span>seed {summary.seed}</span>
          <span>step {summary.step} (time horizon)</span>
          <span className="font-mono">predicted {summary.predictedAt}</span>
        </span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span>world model v{summary.worldModelVersion}</span>
          <span>simulator v{summary.simulatorVersion}</span>
          <span>strategy {strategyRef}</span>
        </span>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Predicted metrics — every value WITH its §22 interval
        </h4>
        <ul className="flex flex-col gap-1" data-testid="lab-run-metrics">
          {metrics.map((metric) => (
            <li
              key={metric.metric}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs"
              data-testid={`lab-run-metric-${metric.metric}`}
            >
              <span className="text-slate-200">{metric.metric}</span>
              <span className="font-mono text-slate-300">
                {formatLabExpectedWithInterval(metric.expectedValue, metric.interval)}{' '}
                {metric.unit}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Simulated platform-state deltas (synthetic, disclosed)
        </h4>
        <ul className="flex flex-col gap-1" data-testid="lab-run-deltas">
          {deltas.length === 0 ? (
            <li className="text-[11px] text-slate-500">— no deltas recorded for this step</li>
          ) : (
            deltas.map((delta) => (
              <li
                key={delta.metric}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs"
              >
                <span className="text-slate-200">Δ {delta.metric}</span>
                <span className="font-mono text-slate-300">
                  expected Δ {delta.expectedDelta.toFixed(2)} · interval [
                  {delta.interval.lower.toFixed(2)}, {delta.interval.upper.toFixed(2)}]{' '}
                  {delta.unit}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Next world state (synthetic)
        </span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-400">
          <span>audience {nextWorldState.baseAudience.toLocaleString()}</span>
          <span>fatigue {nextWorldState.fatigue.toFixed(2)}</span>
          <span>competitor share {nextWorldState.competitorShare.toFixed(2)}</span>
          <span>seasonal {nextWorldState.seasonalFactor.toFixed(2)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
          <LabDisclosureNote disclosure={detail.disclosure} />
          <span>
            uncertainty {uncertainty.level}
            {uncertainty.note === null ? '' : ` — ${uncertainty.note}`}
          </span>
        </span>
      </div>
    </div>
  );
}

