import type { LabBranchRecordView } from '../ports/lab-simulator.js';
import {
  LabCounterfactualBadge,
  LabDisclosureNote,
  LabFact,
  LabSectionEmptyPanel,
} from './lab-workspace-shared.js';
import { formatLabExpectedWithInterval } from './lab-presentation.js';

/**
 * The Time Machine's counterfactual BRANCH RECORDS panel (UX-003 wave 2,
 * over LAB-006): one branch's append-only record chain — every prediction
 * counterfactual-labeled, intervals never flattened. Split from
 * `lab-simulator-view.tsx` to respect the 400-line managed-file budget.
 */

export function LabBranchRecordsPanel({ records }: { readonly records: readonly LabBranchRecordView[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid="lab-branch-records">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Counterfactual predictions recorded into the branch ({records.length})
      </h4>
      {records.length === 0 ? (
        <LabSectionEmptyPanel section="branch-records" what="recorded branch predictions" />
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map((record) => (
            <li
              key={record.recordId}
              className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2"
              data-testid={`lab-branch-record-${record.recordId}`}
            >
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-xs text-slate-800">{record.recordId}</span>
                <LabCounterfactualBadge />
              </span>
              <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
                <span>scenario {record.prediction.scenarioRef}</span>
                <span>seed {record.prediction.seed}</span>
                <span>step {record.prediction.step}</span>
                <span>world model v{record.prediction.worldModelVersion}</span>
                <span>simulator v{record.prediction.simulatorVersion}</span>
                <span className="font-mono">recorded {record.recordedAt}</span>
              </span>
              <ul className="flex flex-col gap-0.5">
                {record.prediction.metrics.map((metric) => (
                  <li
                    key={metric.metric}
                    className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500"
                  >
                    <span>{metric.metric}</span>
                    <span className="font-mono text-slate-700">
                      {formatLabExpectedWithInterval(metric.expectedValue, metric.interval)}{' '}
                      {metric.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

