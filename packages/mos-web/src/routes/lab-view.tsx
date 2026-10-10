import type { LabPageData } from './route-loading.js';
import { LabBenchmarkDirectoryView } from '../views/lab-benchmark-directory.js';
import { LabBenchmarkDigestPanel } from '../views/lab-benchmark-digest.js';
import { LabCalibrationDetailPanel } from '../views/lab-calibration-detail.js';
import { LabCalibrationStatusView } from '../views/lab-calibration-status.js';
import { LAB_BOUNDARY_NOTE, LAB_LOOP_NARRATION } from '../views/lab-presentation.js';
import { MosNoTenantContextView } from '../shell/route-fallbacks.js';

/**
 * The Lab surface (UX-003): the read-side view over the Lab's
 * benchmark/calibration/uncertainty authorities (LAB-017 + LAB-018). It
 * presents the benchmark record chains with their digests — every expected
 * value WITH its uncertainty interval, model disagreement, OOD flags, the
 * always-present no-op baseline, calibration shown honestly as pending
 * reality — and the online-calibration chains with their prediction-error
 * records and derived feedback contexts. Counterfactual discipline is
 * VISIBLE everywhere (§20/§24): simulated values are labeled simulated,
 * measured observations are labeled measured, and the §24 boundary note
 * stands at the top of the surface. NO lab actions exist here: running
 * benchmarks, recording calibration errors and deriving contexts are
 * lab-authority actions this surface never performs or fakes.
 */

function BenchmarkSelectionErrorPanel({
  error,
}: {
  readonly error: 'lab-benchmark-not-found' | 'load-failed';
}) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="lab-benchmark-selection-error"
    >
      {error === 'lab-benchmark-not-found'
        ? 'The selected benchmark record chain does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess).'
        : 'The selected benchmark digest could not be loaded — the lab benchmark service failed explicitly.'}
    </aside>
  );
}

function CalibrationSelectionErrorPanel({
  error,
}: {
  readonly error: 'lab-calibration-not-found' | 'load-failed';
}) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="lab-calibration-selection-error"
    >
      {error === 'lab-calibration-not-found'
        ? 'The selected calibration chain does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess).'
        : 'The selected calibration records could not be loaded — the lab calibration service failed explicitly.'}
    </aside>
  );
}

function CalibrationUnavailablePanel() {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="lab-calibration-unavailable"
    >
      The online-calibration status could not be loaded on this pass — the lab calibration service
      failed explicitly. The benchmark surface above is unaffected; calibration is shown as
      explicitly unavailable rather than as a fabricated empty list.
    </aside>
  );
}

/** The Lab page view over the loaded page model. */
export function LabView({ data }: { readonly data: LabPageData }) {
  if (data.scope === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Lab</h1>
        <MosNoTenantContextView />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">Lab</h1>
        <p className="mt-1 text-sm text-slate-400">
          {LAB_LOOP_NARRATION.position} — {LAB_LOOP_NARRATION.summary}
        </p>
        <p className="mt-1 text-xs text-amber-200/80" data-testid="lab-boundary-note">
          {LAB_BOUNDARY_NOTE}
        </p>
      </header>

      <section aria-labelledby="lab-benchmarks-title">
        <h2 id="lab-benchmarks-title" className="text-base font-semibold text-slate-100">
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
          selectedBenchmarkId={data.selectedDigest === null
            ? null
            : data.selectedDigest.summary.benchmarkId}
        />
      </section>

      {data.benchmarkSelectionError !== null ? (
        <BenchmarkSelectionErrorPanel error={data.benchmarkSelectionError} />
      ) : null}
      {data.selectedDigest !== null ? <LabBenchmarkDigestPanel digest={data.selectedDigest} /> : null}

      <section aria-labelledby="lab-calibration-title">
        <h2 id="lab-calibration-title" className="text-base font-semibold text-slate-100">
          Online calibration
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Simulation-to-reality prediction error (LAB-018) — append-only analysis records joining
          counterfactual benchmark predictions with measured boundary-chain observations, and the
          versioned feedback contexts derived from them.
        </p>
        {data.calibrationError !== null ? (
          <CalibrationUnavailablePanel />
        ) : (
          <LabCalibrationStatusView
            chains={data.calibrationChains}
            selectedCalibrationId={data.selectedCalibrationRecords === null
              ? null
              : data.selectedCalibrationRecords.length > 0
                ? (data.selectedCalibrationRecords[0]?.calibrationId ?? null)
                : null}
          />
        )}
      </section>

      {data.calibrationSelectionError !== null ? (
        <CalibrationSelectionErrorPanel error={data.calibrationSelectionError} />
      ) : null}
      {data.selectedCalibrationRecords !== null && data.selectedCalibrationRecords.length > 0 ? (
        <LabCalibrationDetailPanel records={data.selectedCalibrationRecords} />
      ) : null}
      {data.selectedCalibrationRecords !== null && data.selectedCalibrationRecords.length === 0 ? (
        <aside
          className="rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-500"
          data-testid="lab-calibration-empty-chain"
        >
          This calibration chain exists but holds no error records yet — rendered as exactly that,
          never as fabricated calibration.
        </aside>
      ) : null}
    </div>
  );
}
