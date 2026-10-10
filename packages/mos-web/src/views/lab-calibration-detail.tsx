import type { LabCalibrationRecordView } from '../ports/lab-calibration.js';
import {
  LAB_CALIBRATION_PENDING_LABEL,
  LAB_COUNTERFACTUAL_LABEL,
  LAB_MEASURED_LABEL,
  formatLabDigestShort,
  formatLabExpectedWithInterval,
  formatLabNumber,
  labIntegrityLabel,
} from './lab-presentation.js';

/**
 * The Lab calibration record panel (UX-003, over LAB-018): one chain's
 * append-only prediction-error records, oldest first. Each record renders
 * the PREDICTION side as counterfactual-labeled (a frozen LAB-017 benchmark
 * statement — simulated, never measured) and the OBSERVED side as measured
 * boundary-chain reality — the two are VISIBLY DISTINCT (§20, lock rule 29)
 * and never conflated. The frozen v1 error functional, the error
 * decomposition, the §22 interval containment and the §24 boundary
 * statement render with every record. Records are immutable history: the
 * panel renders them and never edits them.
 */

function RecordPanel({ record }: { readonly record: LabCalibrationRecordView }) {
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      data-testid={`lab-calibration-record-${record.calibrationId}-v${record.version}`}
      aria-label={`Calibration record ${record.calibrationId} version ${record.version}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">
          v{record.version}
        </span>
        <span className="font-mono text-xs text-slate-500">{record.recordedAt}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            record.integrity.status === 'intact'
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-red-500/15 text-red-300'
          }`}
          data-testid={`lab-calibration-record-integrity-${record.calibrationId}-v${record.version}`}
        >
          {labIntegrityLabel(record.integrity.status)}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
          regime {record.regime}
        </span>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div
          className="rounded border border-fuchsia-900/50 bg-fuchsia-950/20 p-3"
          data-testid={`lab-calibration-prediction-${record.calibrationId}-v${record.version}`}
        >
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">
              Prediction (cited benchmark statement)
            </span>
            <span
              className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
              title={LAB_COUNTERFACTUAL_LABEL}
              data-testid={`lab-calibration-prediction-counterfactual-${record.calibrationId}-v${record.version}`}
            >
              Counterfactual — simulated
            </span>
          </p>
          <p className="mt-2 font-mono text-sm text-slate-200">
            {formatLabExpectedWithInterval(
              record.predicted.expectedReward,
              record.predicted.interval,
            )}
          </p>
          <p className="mt-1 text-slate-400">
            uncertainty {record.predicted.uncertaintyLevel} · benchmark{' '}
            {record.benchmarkRef.benchmarkId} v{record.benchmarkRef.benchmarkVersion} · candidate{' '}
            {record.benchmarkRef.candidateKey}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{record.predicted.disclosure}</p>
        </div>

        <div
          className="rounded border border-emerald-900/50 bg-emerald-950/20 p-3"
          data-testid={`lab-calibration-observed-${record.calibrationId}-v${record.version}`}
        >
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
              Observed (reality)
            </span>
            <span
              className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
              title={LAB_MEASURED_LABEL}
              data-testid={`lab-calibration-observed-measured-${record.calibrationId}-v${record.version}`}
            >
              Measured — boundary chain
            </span>
          </p>
          <p className="mt-2 font-mono text-sm text-slate-200">
            observed outcome {formatLabNumber(record.observed.outcome)}
          </p>
          <p className="mt-1 text-slate-400" data-testid="lab-calibration-observations">
            {record.observed.observations.length} historical observation
            {record.observed.observations.length === 1 ? '' : 's'} (§24 boundary chain):
            {record.observed.observations
              .map(
                (observation) =>
                  ` ${observation.observationId} @ ${observation.observedAt} (${observation.regime}, ${observation.sourceRefCount} source${
                    observation.sourceRefCount === 1 ? '' : 's'
                  })`,
              )
              .join(' ·')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Historical observations are real-world evidence — never lab-simulated data (§20).
          </p>
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Error functional:</dt>
          <dd data-testid={`lab-calibration-functional-${record.calibrationId}-v${record.version}`}>
            {record.functional.id} v{record.functional.version} — {record.functional.note}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Reward spec both sides valued under:</dt>
          <dd>v{record.rewardSpecVersion}</dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Signed error (reality − prediction):</dt>
          <dd data-testid={`lab-calibration-signed-error-${record.calibrationId}-v${record.version}`}>
            {formatLabNumber(record.errors.signedError)} (
            {record.errors.signedError > 0
              ? 'simulation under-estimated reality'
              : record.errors.signedError < 0
                ? 'simulation over-estimated reality'
                : 'exact'})
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Absolute / relative error:</dt>
          <dd>
            {formatLabNumber(record.errors.absoluteError)} ·{' '}
            {formatLabNumber(record.errors.relativeError)}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">§22 interval containment:</dt>
          <dd data-testid={`lab-calibration-containment-${record.calibrationId}-v${record.version}`}>
            {record.errors.intervalContainment
              ? 'reality fell INSIDE the predicted interval'
              : 'reality fell OUTSIDE the predicted interval'}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Digest:</dt>
          <dd className="font-mono">{formatLabDigestShort(record.integrity.digest)}</dd>
        </div>
      </dl>

      <p className="text-[11px] text-amber-200/70" data-testid="lab-calibration-labonly">
        {record.labOnly}
      </p>
    </li>
  );
}

/** One calibration chain's append-only error records, oldest first. */
export function LabCalibrationDetailPanel({
  records,
}: {
  readonly records: readonly LabCalibrationRecordView[];
}) {
  return (
    <section
      aria-labelledby="lab-calibration-detail-title"
      className="flex flex-col gap-3"
      data-testid="lab-calibration-detail"
    >
      <h3 id="lab-calibration-detail-title" className="text-base font-semibold text-slate-100">
        Calibration records — {records[0]?.calibrationId} ({records.length} append-only version
        {records.length === 1 ? '' : 's'}, oldest first — history is never rewritten)
      </h3>
      <p className="text-xs text-slate-500">
        Each record joins a counterfactual prediction with measured reality under the frozen v1
        error functional. {LAB_CALIBRATION_PENDING_LABEL} applies to the cited benchmark record —
        calibration appends analysis; it never rewrites the prediction.
      </p>
      <ul className="flex flex-col gap-3">
        {records.map((record) => (
          <RecordPanel key={`${record.calibrationId}-v${record.version}`} record={record} />
        ))}
      </ul>
    </section>
  );
}
