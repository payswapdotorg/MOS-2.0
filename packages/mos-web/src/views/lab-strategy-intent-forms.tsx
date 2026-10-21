import type { LabIntentDeclaration } from "../ports/lab-intents.js";
import {
  LAB_INTENT_FORM_FIELDS,
  learnStrategyDeclarationFromFormData,
  searchOrganizationsDeclarationFromFormData,
} from "./lab-intent-form-data.js";
import { LabIntentForm } from "./lab-intent-form.js";

/**
 * The Strategy & Organizations section's write-intent declaration forms
 * (UX-003 wave 3) — split from `lab-strategy-view.tsx` to respect the
 * 400-line managed-file budget (the established split pattern; pure
 * presentation, no logic moved, only the two declaration forms).
 *
 * Both paths run over a FROZEN ENSEMBLE: the organization search (LAB-009)
 * evaluates the declared candidate set under the declared search policy, and
 * strategy learning (LAB-010) runs from the declared initial program under
 * the declared stopping policy. With NO frozen ensemble registered under the
 * declared id+version, the owning authority rejects the declaration by name
 * (`unknown-ensemble`) — the forms say so up front, and the verdict (receipt
 * or named rejection) returns on the next load through the outcome panel.
 */

/** The strategy section's two write-intent declaration forms. */
export function LabStrategyIntentForms({
  onDeclareLabIntent,
}: {
  /** Shell callback routing write-intent declarations to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-800 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Declared lab-authority actions (write-intent declarations)
      </h4>
      <p className="text-[11px] text-slate-500">
        The section's two write paths are EXECUTABLE through the lab-intents port — every evaluation
        is COUNTERFACTUAL over the frozen ensemble, never a measured outcome. The authority's
        verdict (receipt or named rejection) returns here after the declaration.
      </p>
      <div className="flex flex-col gap-3">
        <LabIntentForm
          testId="lab-strategy-intent-search"
          summaryLabel="Run an organization search (LAB-009 — §23 three-way comparison)"
          routedTo="lab-organization-search-authority"
          disclosureNote="The search requires a FROZEN ensemble under the declared id+version; with none registered the authority rejects with unknown-ensemble. The §23 comparison (generalist baseline + hand-designed + generated) is recorded by the authority, never composed here."
          onDeclareLabIntent={onDeclareLabIntent}
          parse={searchOrganizationsDeclarationFromFormData}
          fields={[
            {
              name: LAB_INTENT_FORM_FIELDS.ensembleId,
              label: "Ensemble id (frozen)",
              kind: "text",
              required: true,
              placeholder: "e.g. ensemble-reach-primary",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.ensembleVersion,
              label: "Ensemble version (frozen pin)",
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
              name: LAB_INTENT_FORM_FIELDS.scenarioJson,
              label: "Scenario (declared JSON)",
              kind: "json",
              required: true,
              placeholder: "the full LabScenario JSON — version pins + objective + budget",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.rewardSpecJson,
              label: "Reward spec (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.candidatesJson,
              label: "Candidate set (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.policyJson,
              label: "Search policy (declared JSON)",
              kind: "json",
              required: true,
            },
          ]}
        />
        <LabIntentForm
          testId="lab-strategy-intent-learn"
          summaryLabel="Learn a strategy candidate (LAB-010 — from the declared initial program)"
          routedTo="lab-strategy-learning-authority"
          disclosureNote="Learning iterates under the declared stopping policy and records its full trace; the resulting candidate is counterfactual-labeled with its evaluation provenance — never presented as a measured outcome."
          onDeclareLabIntent={onDeclareLabIntent}
          parse={learnStrategyDeclarationFromFormData}
          fields={[
            {
              name: LAB_INTENT_FORM_FIELDS.ensembleId,
              label: "Ensemble id (frozen)",
              kind: "text",
              required: true,
              placeholder: "e.g. ensemble-reach-primary",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.ensembleVersion,
              label: "Ensemble version (frozen pin)",
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
              name: LAB_INTENT_FORM_FIELDS.scenarioJson,
              label: "Scenario (declared JSON)",
              kind: "json",
              required: true,
              placeholder: "the full LabScenario JSON — version pins + objective + budget",
            },
            {
              name: LAB_INTENT_FORM_FIELDS.rewardSpecJson,
              label: "Reward spec (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.initialProgramJson,
              label: "Initial program (declared JSON)",
              kind: "json",
              required: true,
            },
            {
              name: LAB_INTENT_FORM_FIELDS.stoppingPolicyJson,
              label: "Stopping policy (declared JSON)",
              kind: "json",
              required: true,
            },
          ]}
        />
      </div>
    </div>
  );
}
