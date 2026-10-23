import type { TenantScope } from '@mos/contracts';
import type {
  CreateMissionIntentDeclaration,
  RewardMetricOptionView,
} from '../ports/mission-catalog.js';
import type { SocialPlatformView } from '../ports/social-workspace.js';
import {
  SOCIAL_CONTINUE_LABEL,
  SOCIAL_SETUP_DETAILS_NOTE,
  SOCIAL_SETUP_DETAILS_TITLE,
  SOCIAL_SETUP_PERSISTENCE_NOTES,
} from './social-presentation.js';
import {
  SOCIAL_SETUP_FORM_FIELDS,
  socialSetupMissionDeclarationFromFormData,
} from './social-setup-form-data.js';

/**
 * The Social workspace's setup-details form (the UXR social wave) — the
 * target design's inspector pane. INTENT DECLARATION ONLY: "Continue setup"
 * declares a create-mission intent through the EXISTING
 * `onDeclareMissionIntent` shell callback (the Missions authority owns the
 * record); the form itself records nothing, decides nothing and creates no
 * authority of its own. The declaration's OUTCOME renders through the
 * existing mission outcome panel idiom — the receipt (or the named
 * refusal) on the Missions surface after the shell navigates there, which
 * is where every other create-mission declaration on this shell lands.
 *
 * Uncontrolled by design (the browser owns input state); required fields
 * carry the native `required` attribute; the reward metric vocabulary is
 * SERVED by the Missions authority through the existing port — the form
 * invents no metric, and with an empty vocabulary it honestly refuses to
 * declare instead of guessing.
 */

const INPUT_CLASS =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mos-navy';

function FieldLabel({
  htmlFor,
  children,
}: {
  readonly htmlFor: string;
  readonly children: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
    >
      {children}
    </label>
  );
}

/** Props of {@link SocialSetupForm}. */
export interface SocialSetupFormProps {
  readonly platform: SocialPlatformView;
  /** Scope the declaration is made under (spec §31 — never ambient). */
  readonly scope: TenantScope | null;
  /** Reward metric vocabulary served by the Missions authority (may be empty). */
  readonly metricVocabulary: readonly RewardMetricOptionView[];
  /** Shell callback that routes the declaration to the missions catalog port. */
  readonly onDeclareMissionIntent: (declaration: CreateMissionIntentDeclaration) => void;
}

/** The setup-details inspector form (target copy; declares a mission intent). */
export function SocialSetupForm({
  platform,
  scope,
  metricVocabulary,
  onDeclareMissionIntent,
}: SocialSetupFormProps) {
  const handleSubmit = (event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }): void => {
    event.preventDefault();
    if (scope === null) {
      // No tenant context: the shell refuses to declare rather than
      // guessing a scope (the missions form's discipline, verbatim).
      return;
    }
    const parsed = socialSetupMissionDeclarationFromFormData(
      new FormData(event.currentTarget),
      scope,
      platform.displayName,
    );
    if ('error' in parsed) {
      // Native `required` validation should have caught this before
      // submission; if it did not, the shell refuses to declare a
      // malformed intent rather than guessing one.
      return;
    }
    onDeclareMissionIntent(parsed);
  };

  return (
    <section
      aria-labelledby="social-setup-details-title"
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="social-setup-details"
    >
      <h3 id="social-setup-details-title" className="text-base font-semibold text-slate-900">
        {SOCIAL_SETUP_DETAILS_TITLE}
      </h3>
      <p className="mt-1 text-xs text-slate-500">{SOCIAL_SETUP_DETAILS_NOTE}</p>
      {scope === null ? (
        <p
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="social-setup-no-scope"
        >
          No tenant context is resolved, so this form cannot declare a mission intent — the
          declaration needs a real scope (spec §31), never an ambient guess.
        </p>
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex flex-col gap-3"
        data-testid="social-setup-form"
      >
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="social-field-business">Business / product</FieldLabel>
          <input
            id="social-field-business"
            name={SOCIAL_SETUP_FORM_FIELDS.business}
            type="text"
            required
            placeholder="Enter product or offer…"
            className={INPUT_CLASS}
            data-testid="social-setup-field-business-product"
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="social-field-goal">Success goal</FieldLabel>
          <input
            id="social-field-goal"
            name={SOCIAL_SETUP_FORM_FIELDS.goal}
            type="text"
            required
            placeholder="Qualified leads / views / sales…"
            className={INPUT_CLASS}
            data-testid="social-setup-field-success-goal"
          />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Success metric (served by the Missions authority)
          </legend>
          {metricVocabulary.length === 0 ? (
            <p
              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
              data-testid="social-setup-vocabulary-unavailable"
            >
              The reward-metric vocabulary is unavailable on this load — the form honestly refuses
              to declare an intent rather than inventing a metric.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                id="social-field-metric"
                name={SOCIAL_SETUP_FORM_FIELDS.metric}
                required
                defaultValue=""
                className={INPUT_CLASS}
                data-testid="social-setup-field-success-metric"
                aria-label="Success metric"
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
              <select
                id="social-field-direction"
                name={SOCIAL_SETUP_FORM_FIELDS.direction}
                defaultValue="maximize"
                className={INPUT_CLASS}
                data-testid="social-setup-field-term-direction"
                aria-label="Reward term direction"
              >
                <option value="maximize">maximize (value term)</option>
                <option value="minimize">minimize (cost/risk term)</option>
              </select>
            </div>
          )}
        </fieldset>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="social-field-audience">Target audience &amp; region</FieldLabel>
          <input
            id="social-field-audience"
            name={SOCIAL_SETUP_FORM_FIELDS.audience}
            type="text"
            required
            placeholder="Audience · country · language…"
            className={INPUT_CLASS}
            data-testid="social-setup-field-target-audience"
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="social-field-horizon">Time horizon / budget</FieldLabel>
          <input
            id="social-field-horizon"
            name={SOCIAL_SETUP_FORM_FIELDS.horizon}
            type="text"
            placeholder="Timeframe · resource limits…"
            className={INPUT_CLASS}
            data-testid="social-setup-field-time-horizon"
          />
          <p className="text-[11px] text-slate-400">
            Optional — blank stays out of the declared objective.
          </p>
        </div>
        <button
          type="submit"
          disabled={scope === null || metricVocabulary.length === 0}
          className="rounded-md bg-mos-navy px-4 py-2 text-sm font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="social-setup-continue"
        >
          {SOCIAL_CONTINUE_LABEL}
        </button>
        <p className="text-[11px] leading-snug text-slate-400">
          Declares a create-mission intent routed to the Missions authority through the existing
          mission-catalog port — single reward term at weight 1, objective statement folding the
          fields above. The receipt (or the named refusal) renders on the Missions surface, the
          existing outcome panel for every create-mission declaration on this shell.
        </p>
      </form>
      <ul className="mt-3 flex flex-col gap-1 border-t border-slate-200 pt-3">
        {SOCIAL_SETUP_PERSISTENCE_NOTES.map((note) => (
          <li key={note} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
