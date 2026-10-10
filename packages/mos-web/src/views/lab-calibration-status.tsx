import type { LabCalibrationChainView } from '../ports/lab-calibration.js';
import {
  formatLabNumber,
  labIntegrityLabel,
} from './lab-presentation.js';

/**
 * The Lab online-calibration status listing (UX-003, over LAB-018): one row
 * per calibration error-record chain visible in the tenant scope — record
 * counts, the digest-integrity state of the latest record, the regimes
 * folded, and the DECLARED versioned feedback context when one has been
 * derived. A chain with NO derived context renders the FIRST-CLASS honest
 * "calibration pending" state — never a fabricated context, never hidden.
 * Rows are real links to the chain's records (`?calibration=<id>`).
 */

function ContextState({
  context,
  calibrationId,
}: {
  readonly context: LabCalibrationChainView['context'];
  readonly calibrationId: string;
}) {
  if (context === null) {
    return (
      <span className="text-amber-300/80" data-testid={`lab-calibration-pending-${calibrationId}`}>
        Calibration pending — no context derived yet (the benchmark’s calibration surface is
        declared pending reality)
      </span>
    );
  }
  return (
    <span className="text-emerald-300/80" data-testid={`lab-calibration-context-${calibrationId}`}>
      Context v{context.version} derived over {context.summary.errorRecordCount} error record
      {context.summary.errorRecordCount === 1 ? '' : 's'} · bias{' '}
      {formatLabNumber(context.summary.meanSignedError)} · MAE{' '}
      {formatLabNumber(context.summary.meanAbsoluteError)} · worst{' '}
      {formatLabNumber(context.summary.worstAbsoluteError)} · interval coverage{' '}
      {formatLabNumber(context.summary.intervalCoverage)} (§22)
    </span>
  );
}

function LabCalibrationRow({
  chain,
  selected,
}: {
  readonly chain: LabCalibrationChainView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?calibration=${encodeURIComponent(chain.calibrationId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`lab-calibration-row-${chain.calibrationId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{chain.calibrationId}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                chain.latestIntegrity === 'intact'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-red-500/15 text-red-300'
              }`}
              data-testid={`lab-calibration-integrity-${chain.calibrationId}`}
            >
              {labIntegrityLabel(chain.latestIntegrity)}
            </span>
          </span>
          <span className="text-xs text-slate-400">
            calibrates benchmark {chain.benchmarkId} · {chain.errorRecordCount} error record
            {chain.errorRecordCount === 1 ? '' : 's'} (latest v{chain.latestErrorVersion} at{' '}
            {chain.latestErrorAt})
            {chain.regimes.length === 0
              ? ''
              : ` · regimes ${chain.regimes.join(', ')}`}
          </span>
          <span className="font-mono text-xs text-slate-500" data-testid="lab-calibration-tenant">
            {chain.tenantId}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs">
          <ContextState context={chain.context} calibrationId={chain.calibrationId} />
        </span>
      </a>
    </li>
  );
}

/** The calibration status list. Empty state is explicit, never placeholder rows. */
export function LabCalibrationStatusView({
  chains,
  selectedCalibrationId,
}: {
  readonly chains: readonly LabCalibrationChainView[];
  readonly selectedCalibrationId: string | null;
}) {
  if (chains.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500"
        data-testid="lab-calibrations-empty"
      >
        No online-calibration chains are visible in this tenant scope. Calibration records appear
        here once simulation-to-reality prediction errors are recorded (LAB-018) — the shell does
        not fabricate them.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="lab-calibrations-list">
      {chains.map((chain) => (
        <LabCalibrationRow
          key={chain.calibrationId}
          chain={chain}
          selected={chain.calibrationId === selectedCalibrationId}
        />
      ))}
    </ul>
  );
}
