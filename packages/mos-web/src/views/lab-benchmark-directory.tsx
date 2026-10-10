import type { LabBenchmarkSummaryView } from '../ports/lab-benchmark.js';
import { LAB_CALIBRATION_PENDING_LABEL } from './lab-presentation.js';

/**
 * The Lab benchmark directory listing (UX-003): one row per benchmark record
 * chain visible in the tenant scope — scenario context, the DECLARED
 * robustness policy snapshot, candidate count (the no-op baseline always in
 * addition), the LAB-018 calibration-citation state, the counterfactual pin
 * and the explicit tenant context (§31). Rows are real links to the record
 * digest (`?benchmark=<id>`); every number on a row carries the
 * counterfactual flag the authority recorded — never presented as measured.
 */

function LabBenchmarkRow({
  benchmark,
  selected,
}: {
  readonly benchmark: LabBenchmarkSummaryView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?benchmark=${encodeURIComponent(benchmark.benchmarkId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`lab-benchmark-row-${benchmark.benchmarkId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{benchmark.benchmarkId}</span>
            <span
              className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
              data-testid={`lab-benchmark-counterfactual-${benchmark.benchmarkId}`}
            >
              Counterfactual
            </span>
          </span>
          <span className="text-xs text-slate-400">
            {benchmark.scenarioNiche} · {benchmark.scenarioPlatform} · scenario{' '}
            {benchmark.scenarioRef}
          </span>
          <span className="text-xs text-slate-400">
            policy {benchmark.policyId} v{benchmark.policyVersion} · reward spec v
            {benchmark.rewardSpecVersion} · {benchmark.declaredCandidateCount} declared candidate
            {benchmark.declaredCandidateCount === 1 ? '' : 's'} + no-op baseline
          </span>
          <span className="font-mono text-xs text-slate-500" data-testid="lab-benchmark-tenant">
            {benchmark.tenantId}
          </span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>
            chain v{benchmark.latestVersion} · {benchmark.versionCount} record
            {benchmark.versionCount === 1 ? '' : 's'} · {benchmark.benchmarkedAt}
          </span>
          <span data-testid={`lab-benchmark-calibration-${benchmark.benchmarkId}`}>
            {benchmark.citedCalibrationContextVersion === null ? (
              LAB_CALIBRATION_PENDING_LABEL
            ) : (
              <span className="text-emerald-300/80">
                cites calibration context v
                {benchmark.citedCalibrationContextVersion} (provenance only)
              </span>
            )}
          </span>
        </span>
      </a>
    </li>
  );
}

/** The benchmark directory list. Empty state is explicit, never placeholder rows. */
export function LabBenchmarkDirectoryView({
  benchmarks,
  selectedBenchmarkId,
}: {
  readonly benchmarks: readonly LabBenchmarkSummaryView[];
  readonly selectedBenchmarkId: string | null;
}) {
  if (benchmarks.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500"
        data-testid="lab-benchmarks-empty"
      >
        No benchmark record chains are visible in this tenant scope. Either none exist yet, or the
        scope genuinely sees none — the shell does not fabricate examples.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="lab-benchmarks-list">
      {benchmarks.map((benchmark) => (
        <LabBenchmarkRow
          key={benchmark.benchmarkId}
          benchmark={benchmark}
          selected={benchmark.benchmarkId === selectedBenchmarkId}
        />
      ))}
    </ul>
  );
}
