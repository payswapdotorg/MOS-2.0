import type { LabCalibrationChainView } from "../ports/lab-calibration.js";
import { formatLabNumber, labIntegrityLabel } from "./lab-presentation.js";
import type { LabIntentDeclaration } from "../ports/lab-intents.js";
import {
  LAB_INTENT_FORM_FIELDS,
  recordCalibrationErrorDeclarationFromFormData,
} from "./lab-intent-form-data.js";
import { LabIntentForm } from "./lab-intent-form.js";

/**
 * The Lab online-calibration status listing (UX-003, over LAB-018): one row
 * per calibration error-record chain visible in the tenant scope — record
 * counts, the digest-integrity state of the latest record, the regimes
 * folded, and the DECLARED versioned feedback context when one has been
 * derived. A chain with NO derived context renders the FIRST-CLASS honest
 * "calibration pending" state — never a fabricated context, never hidden.
 * Rows are real links to the chain's records (`?calibration=<id>`).
 *
 * UX-003 wave 3: the listing also carries the section's write path — the
 * record-calibration-error intent form (LAB-018). Recording resolves the
 * DECLARED prediction against a FROZEN LAB-017 benchmark record and joins
 * it with MEASURED boundary-chain observations; with no benchmark record
 * behind the declared citation the authority rejects by name. The verdict
 * (receipt or named rejection) returns on the next load; the form renders
 * beside an EMPTY listing too — with no chain behind the declared id, the
 * authority's rejection is the honest outcome.
 */

function ContextState({
  context,
  calibrationId,
}: {
  readonly context: LabCalibrationChainView["context"];
  readonly calibrationId: string;
}) {
  if (context === null) {
    return (
      <span className="text-amber-700" data-testid={`lab-calibration-pending-${calibrationId}`}>
        Calibration pending — no context derived yet (the benchmark’s calibration surface is
        declared pending reality)
      </span>
    );
  }
  return (
    <span className="text-emerald-700" data-testid={`lab-calibration-context-${calibrationId}`}>
      Context v{context.version} derived over {context.summary.errorRecordCount} error record
      {context.summary.errorRecordCount === 1 ? "" : "s"} · bias{" "}
      {formatLabNumber(context.summary.meanSignedError)} · MAE{" "}
      {formatLabNumber(context.summary.meanAbsoluteError)} · worst{" "}
      {formatLabNumber(context.summary.worstAbsoluteError)} · interval coverage{" "}
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
        aria-current={selected ? "page" : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? "border-mos-navy bg-mos-navy/5"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
        data-testid={`lab-calibration-row-${chain.calibrationId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{chain.calibrationId}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                chain.latestIntegrity === "intact"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
              data-testid={`lab-calibration-integrity-${chain.calibrationId}`}
            >
              {labIntegrityLabel(chain.latestIntegrity)}
            </span>
          </span>
          <span className="text-xs text-slate-500">
            calibrates benchmark {chain.benchmarkId} · {chain.errorRecordCount} error record
            {chain.errorRecordCount === 1 ? "" : "s"} (latest v{chain.latestErrorVersion} at{" "}
            {chain.latestErrorAt})
            {chain.regimes.length === 0 ? "" : ` · regimes ${chain.regimes.join(", ")}`}
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

/** The calibration status list + the section's write-intent form. Empty state is explicit, never placeholder rows. */
export function LabCalibrationStatusView({
  chains,
  selectedCalibrationId,
  onDeclareLabIntent,
}: {
  readonly chains: readonly LabCalibrationChainView[];
  readonly selectedCalibrationId: string | null;
  /** Shell callback routing write-intent declarations to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="lab-calibration-status">
      {chains.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          data-testid="lab-calibrations-empty"
        >
          No online-calibration chains are visible in this tenant scope. Calibration records appear
          here once simulation-to-reality prediction errors are recorded (LAB-018) — the shell does
          not fabricate them.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="lab-calibrations-list">
          {chains.map((chain) => (
            <LabCalibrationRow
              key={chain.calibrationId}
              chain={chain}
              selected={chain.calibrationId === selectedCalibrationId}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Declared lab-authority actions (write-intent declarations)
        </h4>
        <p className="text-[11px] text-slate-500">
          Recording a calibration error is an EXECUTABLE declaration through the lab-intents port —
          the prediction side stays COUNTERFACTUAL and the observation side stays MEASURED, and the
          authority's verdict (receipt or named rejection) returns here after the declaration.
        </p>
        <LabIntentForm
          testId="lab-calibration-intent-record"
          summaryLabel="Record a calibration error (LAB-018 — prediction vs measured reality)"
          routedTo="lab-calibration-authority"
          disclosureNote="Recording resolves the DECLARED prediction against a frozen LAB-017 benchmark record; with no benchmark record behind the citation the authority rejects by name. The joined observations are measured boundary-chain reality — never lab-simulated data."
          onDeclareLabIntent={onDeclareLabIntent}
          parse={recordCalibrationErrorDeclarationFromFormData}
          fields={[
            {
              name: LAB_INTENT_FORM_FIELDS.calibrationId,
              label: "Calibration id",
              kind: "text",
              required: true,
              placeholder: "e.g. calib-reach-1",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.predictionJson,
              label: "Prediction (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.observationRefsJson,
              label: "Observation refs (declared JSON)",
              kind: "json",
              required: true,
              placeholder: "JSON array of observation refs — at least one, distinct",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.rewardSpecJson,
              label: "Reward spec (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.functionalJson,
              label: "Error functional (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.noteText,
              label: "Note (optional)",
              kind: "long-text",
              required: false,
            },
          ]}
        />
      </div>
    </div>
  );
}
