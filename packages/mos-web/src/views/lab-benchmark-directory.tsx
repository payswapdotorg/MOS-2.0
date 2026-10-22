import type { LabBenchmarkSummaryView } from "../ports/lab-benchmark.js";
import { LAB_CALIBRATION_PENDING_LABEL } from "./lab-presentation.js";
import type { LabIntentDeclaration } from "../ports/lab-intents.js";
import {
  LAB_INTENT_FORM_FIELDS,
  runBenchmarkDeclarationFromFormData,
} from "./lab-intent-form-data.js";
import { LabIntentForm } from "./lab-intent-form.js";

/**
 * The Lab benchmark directory listing (UX-003): one row per benchmark record
 * chain visible in the tenant scope — scenario context, the DECLARED
 * robustness policy snapshot, candidate count (the no-op baseline always in
 * addition), the LAB-018 calibration-citation state, the counterfactual pin
 * and the explicit tenant context (§31). Rows are real links to the record
 * digest (`?benchmark=<id>`); every number on a row carries the
 * counterfactual flag the authority recorded — never presented as measured.
 *
 * UX-003 wave 3: the directory also carries the section's write path — the
 * run-benchmark intent form (LAB-017). The shell DECLARES the run; the
 * benchmark authority alone executes it multi-seed under the declared
 * robustness policy and versions the record; the verdict returns on the
 * next load. The form renders beside an EMPTY listing too: a declared id
 * with no chain behind it is the authority's to reject by name.
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
        aria-current={selected ? "page" : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? "border-mos-navy bg-mos-navy/5"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
        data-testid={`lab-benchmark-row-${benchmark.benchmarkId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{benchmark.benchmarkId}</span>
            <span
              className="rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700"
              data-testid={`lab-benchmark-counterfactual-${benchmark.benchmarkId}`}
            >
              Counterfactual
            </span>
          </span>
          <span className="text-xs text-slate-500">
            {benchmark.scenarioNiche} · {benchmark.scenarioPlatform} · scenario{" "}
            {benchmark.scenarioRef}
          </span>
          <span className="text-xs text-slate-500">
            policy {benchmark.policyId} v{benchmark.policyVersion} · reward spec v
            {benchmark.rewardSpecVersion} · {benchmark.declaredCandidateCount} declared candidate
            {benchmark.declaredCandidateCount === 1 ? "" : "s"} + no-op baseline
          </span>
          <span className="font-mono text-xs text-slate-500" data-testid="lab-benchmark-tenant">
            {benchmark.tenantId}
          </span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>
            chain v{benchmark.latestVersion} · {benchmark.versionCount} record
            {benchmark.versionCount === 1 ? "" : "s"} · {benchmark.benchmarkedAt}
          </span>
          <span data-testid={`lab-benchmark-calibration-${benchmark.benchmarkId}`}>
            {benchmark.citedCalibrationContextVersion === null ? (
              LAB_CALIBRATION_PENDING_LABEL
            ) : (
              <span className="text-emerald-700">
                cites calibration context v{benchmark.citedCalibrationContextVersion} (provenance
                only)
              </span>
            )}
          </span>
        </span>
      </a>
    </li>
  );
}

/** The benchmark directory list + the section's write-intent form. Empty state is explicit, never placeholder rows. */
export function LabBenchmarkDirectoryView({
  benchmarks,
  selectedBenchmarkId,
  onDeclareLabIntent,
}: {
  readonly benchmarks: readonly LabBenchmarkSummaryView[];
  readonly selectedBenchmarkId: string | null;
  /** Shell callback routing write-intent declarations to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="lab-benchmark-directory">
      {benchmarks.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          data-testid="lab-benchmarks-empty"
        >
          No benchmark record chains are visible in this tenant scope. Either none exist yet, or the
          scope genuinely sees none — the shell does not fabricate examples.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="lab-benchmarks-list">
          {benchmarks.map((benchmark) => (
            <LabBenchmarkRow
              key={benchmark.benchmarkId}
              benchmark={benchmark}
              selected={benchmark.benchmarkId === selectedBenchmarkId}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Declared lab-authority actions (write-intent declarations)
        </h4>
        <p className="text-[11px] text-slate-500">
          Executing a robust benchmark run is an EXECUTABLE declaration through the lab-intents port
          — the run is COUNTERFACTUAL evidence under the declared robustness policy, never a
          measured outcome, and the no-op baseline is always part of the run. The authority's
          verdict (receipt or named rejection) returns here after the declaration.
        </p>
        <LabIntentForm
          testId="lab-benchmarks-intent-run"
          summaryLabel="Run a robust benchmark (LAB-017 — multi-seed, no-op baseline included)"
          routedTo="lab-benchmark-authority"
          disclosureNote="The benchmark authority evaluates the declared candidate set over the declared seeds under the declared robustness policy and versions the record append-only; every number it records is counterfactual-labeled, never measured."
          onDeclareLabIntent={onDeclareLabIntent}
          parse={runBenchmarkDeclarationFromFormData}
          fields={[
            {
              name: LAB_INTENT_FORM_FIELDS.benchmarkId,
              label: "Benchmark id",
              kind: "text",
              required: true,
              placeholder: "e.g. bench-reach-v1",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.seedsText,
              label: "Seeds (comma-separated determinism pins)",
              kind: "text",
              required: true,
              placeholder: "e.g. 1, 2, 3",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.scenarioJson,
              label: "Scenario (declared JSON)",
              kind: "json",
              required: true,
              placeholder: "the full LabScenario JSON — version pins + objective + budget",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.candidatesJson,
              label: "Candidate set (declared JSON)",
              kind: "json",
              required: true,
              placeholder: "[] is valid — the no-op baseline still runs",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.rewardSpecJson,
              label: "Reward spec (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.policyJson,
              label: "Robustness policy (declared JSON)",
              kind: "json",
              required: true,
            },
          ]}
        />
      </div>
    </div>
  );
}
