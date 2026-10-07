import type { TenantScope } from '@mos/contracts';
import type {
  CreateMissionIntentDeclaration,
  RewardMetricOptionView,
} from '../ports/mission-catalog.js';
import {
  MISSION_INTENT_FORM_FIELDS,
  missionIntentDeclarationFromFormData,
} from '../views/mission-intent-form-data.js';

/**
 * The create-mission intent form (UX-001) — INTENT DECLARATION ONLY.
 *
 * The form declares the intention to create a mission and hands the
 * declaration to the owning domain through the shell's callback; it does NOT
 * create a mission, validate mission shape beyond native presentation
 * affordances, or compute anything. Validation, lifecycle and reward-spec
 * rules live in the Missions authority (CORE-005) when the intent is
 * executed there.
 *
 * Uncontrolled by design: the browser owns input state (the shell keeps no
 * client state — one route per load, real links), required fields carry the
 * native `required` attribute so the browser validates before submission,
 * and three static reward-term rows share field names — the parser folds
 * them in order and drops blank rows, so a single filled row is a valid
 * declaration and extra rows arrive with progressive form polish (UX-005).
 */

export interface MissionIntentFormProps {
  /** Scope the declaration is made under (spec §31 — never ambient). */
  readonly scope: TenantScope;
  /** Reward metric vocabulary served by the domain through the port. */
  readonly metricVocabulary: readonly RewardMetricOptionView[];
  /** Shell callback that routes the declaration to the owning domain. */
  readonly onDeclareMissionIntent: (declaration: CreateMissionIntentDeclaration) => void;
}

const TERM_ROW_COUNT = 3;

function termRowId(row: number, field: string): string {
  return `intent-term-${row}-${field}`;
}

function MissionIntentTermRow({
  row,
  metricVocabulary,
  required,
}: {
  readonly row: number;
  readonly metricVocabulary: readonly RewardMetricOptionView[];
  readonly required: boolean;
}) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-semibold text-slate-400">
        Reward term {row + 1}
        {required ? ' (at least the first term is required)' : ' (optional — blank rows are dropped)'}
      </legend>
      <label htmlFor={termRowId(row, 'metric')} className="flex flex-col gap-1 text-xs">
        Metric
        <select
          id={termRowId(row, 'metric')}
          name={MISSION_INTENT_FORM_FIELDS.termMetric}
          required={required}
          defaultValue=""
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
        >
          <option value="" disabled>
            Select a metric…
          </option>
          {metricVocabulary.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={termRowId(row, 'direction')} className="flex flex-col gap-1 text-xs">
        Direction
        <select
          id={termRowId(row, 'direction')}
          name={MISSION_INTENT_FORM_FIELDS.termDirection}
          required={required}
          defaultValue="maximize"
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
        >
          <option value="maximize">maximize (value term)</option>
          <option value="minimize">minimize (cost/risk term)</option>
        </select>
      </label>
      <label htmlFor={termRowId(row, 'weight')} className="flex flex-col gap-1 text-xs">
        Weight
        <input
          id={termRowId(row, 'weight')}
          name={MISSION_INTENT_FORM_FIELDS.termWeight}
          type="number"
          step="any"
          required={required}
          defaultValue={required ? '1' : ''}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
        />
      </label>
      <label htmlFor={termRowId(row, 'definition')} className="flex flex-col gap-1 text-xs sm:col-span-2">
        What counts (precise definition — never defaulted)
        <textarea
          id={termRowId(row, 'definition')}
          name={MISSION_INTENT_FORM_FIELDS.termDefinition}
          required={required}
          rows={2}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
        />
      </label>
    </fieldset>
  );
}

/** The create-mission intent declaration form. */
export function MissionIntentForm({
  scope,
  metricVocabulary,
  onDeclareMissionIntent,
}: MissionIntentFormProps) {
  const handleSubmit = (event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }): void => {
    event.preventDefault();
    const declaration = missionIntentDeclarationFromFormData(
      new FormData(event.currentTarget),
      scope,
    );
    if ('error' in declaration) {
      // Native `required` validation should have caught this before
      // submission; if it did not (e.g. a browser quirk), the shell refuses
      // to declare a malformed intent rather than guessing one.
      return;
    }
    onDeclareMissionIntent(declaration);
  };

  return (
    <details className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40" data-testid="mission-intent-form">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
        Declare the intent to create a mission
      </summary>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 border-t border-slate-800 px-4 py-4"
      >
        <p className="text-xs text-slate-500">
          Declaring intent routes the objective and reward terms to the Missions authority
          (<span className="font-mono">missions-authority</span>) through a service port. The
          shell records nothing and decides nothing — the authority validates, creates and
          versions the mission when it executes the intent.
        </p>
        <label htmlFor="intent-objective" className="flex flex-col gap-1 text-xs">
          Objective statement
          <textarea
            id="intent-objective"
            name={MISSION_INTENT_FORM_FIELDS.objectiveStatement}
            required
            rows={2}
            placeholder="e.g. Grow qualified reach of the developer audience in Q3 without fatigue or rights risk"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
          />
        </label>
        {Array.from({ length: TERM_ROW_COUNT }, (_, row) => (
          <MissionIntentTermRow
            key={row}
            row={row}
            metricVocabulary={metricVocabulary}
            required={row === 0}
          />
        ))}
        <button
          type="submit"
          className="self-start rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          data-testid="mission-intent-submit"
        >
          Declare intent
        </button>
      </form>
    </details>
  );
}
