import type {
  LabSimulatorOverviewView,
  LabSimulationRunDetailView,
} from "../ports/lab-simulator.js";
import {
  formatLabExpectedWithInterval,
  formatLabLagMs,
  LAB_NO_SIMULATION_NOTE,
  LAB_TIME_MACHINE_MODE_LABELS,
} from "./lab-presentation.js";
import type { LabIntentDeclaration } from "../ports/lab-intents.js";
import {
  LAB_INTENT_FORM_FIELDS,
  registerWorldModelDeclarationFromFormData,
  simulateStepDeclarationFromFormData,
} from "./lab-intent-form-data.js";
import { LabIntentForm } from "./lab-intent-form.js";
import {
  LabCounterfactualBadge,
  LabDeclaredAffordance,
  LabDisclosureNote,
  LabFact,
  LabMeasuredBadge,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSelectionErrorPanel,
} from "./lab-workspace-shared.js";
import { LabBranchRecordsPanel } from "./lab-branch-records.js";
import type { LabBranchRecordView } from "../ports/lab-simulator.js";
import {
  LabBranchRow,
  LabDynamicsModelRow,
  LabObservationRow,
  LabRunDetailPanel,
  LabSimulationRunRow,
  LabWorldModelRow,
} from "./lab-simulator-rows.js";

/**
 * The Lab workspace's Simulator & Time Machine section view (UX-003 wave 2,
 * over LAB-004/005/006): world models + dynamics models (synthetic,
 * disclosed), simulation runs (seed-required, counterfactual, time horizon +
 * information cutoff always visible), and the Time Machine's three §20
 * modes — historical replay (MEASURED), delayed-information replay (with the
 * LEAKAGE PIN naming what was withheld) and counterfactual branches. Every
 * predicted value renders WITH its §22 interval — never a bare point.
 *
 * UX-003 wave 3: the section's two write paths (world-model registration +
 * one simulation step) are now DECLARED through the lab-intents port — the
 * forms below hand declarations to the shell callback; the simulator
 * authority alone executes and versions the record, and its verdict returns
 * on the next load. Forking counterfactual branches stays a DECLARED
 * affordance (disabled-with-reason): it is not part of this transport's
 * named scope.
 */

/** The Simulator & Time Machine section view over the loaded page model. */
export function LabSimulatorSectionView({
  simulator,
  selectedRun,
  runSelectionError,
  selectedBranchRecords,
  branchSelectionError,
  onDeclareLabIntent,
}: {
  readonly simulator: LabSimulatorOverviewView | null;
  readonly selectedRun: LabSimulationRunDetailView | null;
  readonly runSelectionError: "lab-run-not-found" | "load-failed" | null;
  readonly selectedBranchRecords: readonly LabBranchRecordView[] | null;
  readonly branchSelectionError: "lab-branch-not-found" | "load-failed" | null;
  /** Shell callback routing write-intent declarations to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  if (simulator === null) {
    return <LabSectionLoadingPanel section="simulator" />;
  }
  const { timeMachine } = simulator;
  return (
    <div className="flex flex-col gap-6" data-testid="lab-simulator-section">
      <section aria-labelledby="lab-world-models-title">
        <h3 id="lab-world-models-title" className="text-sm font-semibold text-slate-100">
          Social world models (LAB-004 — synthetic, disclosed)
        </h3>
        <ul className="mt-2 flex flex-col gap-2" data-testid="lab-world-models">
          {simulator.worldModels.map((world) => (
            <LabWorldModelRow
              key={`${world.worldModelId}-v${world.worldModelVersion}`}
              world={world}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="lab-dynamics-title">
        <h3 id="lab-dynamics-title" className="text-sm font-semibold text-slate-100">
          Population-resolved dynamics models (LAB-005)
        </h3>
        <ul className="mt-2 flex flex-col gap-2" data-testid="lab-dynamics-models">
          {simulator.dynamicsModels.map((model) => (
            <LabDynamicsModelRow key={model.dynamicsModelId} model={model} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="lab-runs-title">
        <h3 id="lab-runs-title" className="text-sm font-semibold text-slate-100">
          Simulation runs (seed-required, counterfactual)
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">
          Most recent first; every row carries the time horizon (step) and the information cutoff
          (predictedAt).
        </p>
        {simulator.runs.length === 0 ? (
          <LabSectionEmptyPanel section="simulator-runs" what="simulation runs" />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="lab-run-list">
            {simulator.runs.map((run) => (
              <LabSimulationRunRow
                key={run.runId}
                run={run}
                selected={selectedRun?.summary.runId === run.runId}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lab-time-machine-title">
        <h3 id="lab-time-machine-title" className="text-sm font-semibold text-slate-100">
          The Time Machine (LAB-006 — the three §20 modes)
        </h3>
        <div className="mt-2 flex flex-col gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h4
              className="text-xs font-semibold text-slate-300"
              data-testid="lab-tm-historical-title"
            >
              {LAB_TIME_MACHINE_MODE_LABELS.historical}
            </h4>
            <p className="mb-2 text-[11px] text-slate-500">
              as of <span className="font-mono">{timeMachine.historical.asOf}</span> — measured
              reality, never rewritten.
            </p>
            <ul className="flex flex-col gap-2" data-testid="lab-tm-historical">
              {timeMachine.historical.observations.map((observation) => (
                <LabObservationRow key={observation.observationId} observation={observation} />
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-amber-900/50 bg-amber-950/10 p-4">
            <h4
              className="text-xs font-semibold text-amber-200/90"
              data-testid="lab-tm-delayed-title"
            >
              {LAB_TIME_MACHINE_MODE_LABELS.delayed}
            </h4>
            <p className="mb-2 text-[11px] text-slate-500">
              at <span className="font-mono">{timeMachine.delayed.asOf}</span> under lag{" "}
              {formatLabLagMs(timeMachine.delayed.lagMs)} — the cutoff actually applied is{" "}
              <span className="font-mono" data-testid="lab-tm-cutoff">
                {timeMachine.delayed.visibleThrough}
              </span>
              .
            </p>
            <ul className="flex flex-col gap-2" data-testid="lab-tm-delayed-visible">
              {timeMachine.delayed.visibleObservations.map((observation) => (
                <LabObservationRow key={observation.observationId} observation={observation} />
              ))}
            </ul>
            <p
              className="mt-2 rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200/80"
              data-testid="lab-tm-leakage-pin"
            >
              LEAKAGE PIN — {timeMachine.delayed.withheldInWindow.count} appended observation
              {timeMachine.delayed.withheldInWindow.count === 1 ? "" : "s"} inside the forbidden
              window ({timeMachine.delayed.withheldInWindow.observationIds.join(", ") || "none"}){" "}
              exist in the timeline but are NEVER served by the delayed mode (lock rule 30).
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h4
              className="mb-2 text-xs font-semibold text-slate-300"
              data-testid="lab-tm-branches-title"
            >
              {LAB_TIME_MACHINE_MODE_LABELS.branches}
            </h4>
            {timeMachine.branches.length === 0 ? (
              <LabSectionEmptyPanel section="branches" what="counterfactual branches" />
            ) : (
              <ul className="flex flex-col gap-3" data-testid="lab-tm-branches">
                {timeMachine.branches.map((branch) => (
                  <LabBranchRow
                    key={branch.branchId}
                    branch={branch}
                    selected={
                      selectedBranchRecords !== null &&
                      selectedBranchRecords.some((record) => record.branchId === branch.branchId)
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {runSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="run"
          error={runSelectionError === "lab-run-not-found" ? "not-found" : "load-failed"}
          vocabulary={runSelectionError}
        />
      ) : null}
      {selectedRun !== null ? <LabRunDetailPanel detail={selectedRun} /> : null}

      {branchSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="branch"
          error={branchSelectionError === "lab-branch-not-found" ? "not-found" : "load-failed"}
          vocabulary={branchSelectionError}
        />
      ) : null}
      {selectedBranchRecords !== null ? (
        <LabBranchRecordsPanel records={selectedBranchRecords} />
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-800 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Declared lab-authority actions (write-intent declarations)
        </h4>
        <p className="text-[11px] text-slate-500">
          Registering world models and stepping the simulator are EXECUTABLE through the lab-intents
          port — every step is seed-required and recorded as COUNTERFACTUAL evidence, never
          measured. The authority's verdict (receipt or named rejection) returns here after the
          declaration.
        </p>
        <div className="flex flex-col gap-3">
          <LabIntentForm
            testId="lab-simulator-intent-step"
            summaryLabel="Step the simulation once (LAB-005 — seed-required, counterfactual)"
            routedTo="lab-simulator-authority"
            disclosureNote="The step runs against the exact declared world-model version; the recorded run is counterfactual-labeled evidence over the pinned model — never presented as a measured outcome."
            onDeclareLabIntent={onDeclareLabIntent}
            parse={simulateStepDeclarationFromFormData}
            fields={[
              {
                name: LAB_INTENT_FORM_FIELDS.worldModelId,
                label: "World model id",
                kind: "text",
                required: true,
                placeholder: "e.g. wm-social-reach",
              },
              {
                name: LAB_INTENT_FORM_FIELDS.worldModelVersion,
                label: "World model version (exact pin)",
                kind: "number",
                required: true,
              },
              {
                name: LAB_INTENT_FORM_FIELDS.seed,
                label: "Seed (determinism pin)",
                kind: "number",
                required: true,
              },
              {
                name: LAB_INTENT_FORM_FIELDS.step,
                label: "Step (time horizon)",
                kind: "number",
                required: true,
              },
              {
                name: LAB_INTENT_FORM_FIELDS.scenarioJson,
                label: "Scenario (declared JSON)",
                kind: "json",
                required: true,
                placeholder: "the full LabScenario JSON — version pins + objective + budget",
              },
              {
                name: LAB_INTENT_FORM_FIELDS.candidateJson,
                label: "Candidate action (declared JSON)",
                kind: "json",
                required: true,
              },
            ]}
          />
          <LabIntentForm
            testId="lab-simulator-intent-register"
            summaryLabel="Register a world-model version (LAB-004 — append-only chain)"
            routedTo="lab-simulator-authority"
            disclosureNote="Registration appends to the model's append-only chain; the declared state becomes the new version and prior versions stay citable. A repeated id with a changed shape is the authority's to reject by name."
            onDeclareLabIntent={onDeclareLabIntent}
            parse={registerWorldModelDeclarationFromFormData}
            fields={[
              {
                name: LAB_INTENT_FORM_FIELDS.worldModelId,
                label: "World model id",
                kind: "text",
                required: true,
                placeholder: "e.g. wm-social-reach",
              },
              {
                name: LAB_INTENT_FORM_FIELDS.niche,
                label: "Niche",
                kind: "text",
                required: true,
                placeholder: "e.g. developer-marketing",
              },
              {
                name: LAB_INTENT_FORM_FIELDS.platform,
                label: "Platform",
                kind: "text",
                required: true,
                placeholder: "e.g. mastodon",
              },
              {
                name: LAB_INTENT_FORM_FIELDS.notesText,
                label: "Notes (optional)",
                kind: "long-text",
                required: false,
              },
              {
                name: LAB_INTENT_FORM_FIELDS.stateJson,
                label: "World-model state (declared JSON)",
                kind: "json",
                required: true,
              },
            ]}
          />
          <LabDeclaredAffordance
            action="Fork counterfactual branch…"
            reason={LAB_NO_SIMULATION_NOTE}
            testId="lab-simulator-affordance-fork"
          />
        </div>
      </div>
    </div>
  );
}
