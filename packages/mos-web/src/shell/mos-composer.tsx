import type { ComposerAction, ComposerActionField } from './composer-actions.js';
import { COMPOSER_ACTIONS, COMPOSER_ACTIONS_BY_ID, COMPOSER_ACTION_CATEGORIES } from './composer-actions.js';
import type { ComposerUiEvent, ComposerUiState } from './composer-state.js';
import {
  ComposerConfirmSummary,
  ComposerResultCard,
  ComposerWaiting,
} from './composer-receipt.js';

/**
 * The Ask MOS composer overlay (the §6 P0 universal-composer wave — UXR-WC):
 * the shell-owned, fixed bottom-right DOCK (never a full-surface modal — it
 * must not obscure the route surface). HOOK-FREE by construction like every
 * view in this package: the whole flow renders from the {@link ComposerUiState}
 * value the shell entry owns, and every interaction leaves as a
 * {@link ComposerUiEvent} through the single `onEvent` prop — the composer
 * itself holds no state, executes nothing and fabricates nothing.
 *
 * Steps (the target SVG's action-aware three-step flow): STEP 1 pick the
 * declared action (when not preloaded) → STEP 2 clarify ONE field at a time
 * (with the compact "Show all fields" <details> allowance) → STEP 3 confirm
 * the structured intent ("No consequential side effect occurs on this step")
 * → the receipt/task card (see composer-receipt.tsx). Voice input renders
 * its honest unavailable row — never a fake mic control.
 */

const INPUT_CLASS =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mos-navy';

const PRIMARY_BUTTON_CLASS =
  'self-start rounded-md bg-mos-navy px-4 py-2 text-sm font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy disabled:cursor-not-allowed disabled:opacity-50';

const SECONDARY_BUTTON_CLASS =
  'self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy';

/** The session-scoped disclosure the composer carries on its context line. */
export const COMPOSER_SESSION_DISCLOSURE =
  'Session-scoped workspace state — durable persistence arrives with the MOS service transport';

/** The voice-input honest unavailable row (never a fake mic button). */
export const COMPOSER_VOICE_UNAVAILABLE_NOTE =
  'Voice input — not available in this build (nothing inherited the substrate voice path; text is fully supported)';

/** One composer field control (the intent forms' kinds, verbatim). */
export function ComposerFieldControl({
  field,
  value,
  onFieldValueChange,
}: {
  readonly field: ComposerActionField;
  readonly value: string;
  readonly onFieldValueChange: (name: string, value: string) => void;
}) {
  const onChange = (event: { readonly currentTarget: { readonly value: string } }): void => {
    onFieldValueChange(field.name, event.currentTarget.value);
  };
  const id = `composer-field-${field.name}`;
  if (field.kind === 'select') {
    return (
      <label htmlFor={id} className="flex flex-col gap-1 text-xs">
        {field.label}
        <select
          id={id}
          name={field.name}
          value={value}
          onChange={onChange}
          className={INPUT_CLASS}
          data-testid={`composer-field-${field.name}`}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === 'json' || field.kind === 'long-text') {
    const isJson = field.kind === 'json';
    return (
      <label htmlFor={id} className="flex flex-col gap-1 text-xs">
        {field.label}
        {isJson ? ' (declared JSON — parsed by the authority seam)' : ''}
        <textarea
          id={id}
          name={field.name}
          rows={isJson ? 4 : 2}
          value={value}
          placeholder={field.placeholder}
          spellCheck={false}
          onChange={onChange}
          className={`font-mono leading-relaxed ${INPUT_CLASS}`}
          data-testid={`composer-field-${field.name}`}
        />
      </label>
    );
  }
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs">
      {field.label}
      <input
        id={id}
        name={field.name}
        type={field.kind === 'number' ? 'number' : 'text'}
        step={field.kind === 'number' ? 'any' : undefined}
        value={value}
        placeholder={field.placeholder}
        onChange={onChange}
        className={INPUT_CLASS}
        data-testid={`composer-field-${field.name}`}
      />
    </label>
  );
}

/** STEP 1: the grouped action picker over the static catalog. */
function ComposerActionPicker({
  onEvent,
}: {
  readonly onEvent: (event: ComposerUiEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="composer-action-picker">
      <p className="text-xs text-slate-500">
        Start from the action. Every entry is a DECLARED write intent the product authorities
        already expose — pick one and MOS asks only what is missing. (No Pay action exists: no
        payment authority is bound in MOS-2.0.)
      </p>
      {COMPOSER_ACTION_CATEGORIES.map((category) => (
        <div key={category} className="flex flex-col gap-1" data-testid={`composer-category-${category}`}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {category}
          </p>
          <ul className="flex flex-col gap-1">
            {COMPOSER_ACTIONS.filter((action) => action.category === category).map((action) => (
              <li key={action.actionId}>
                <button
                  type="button"
                  onClick={() => onEvent({ kind: 'pick-action', actionId: action.actionId })}
                  className="flex w-full flex-col gap-0.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:border-mos-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
                  data-testid={`composer-action-${action.actionId}`}
                >
                  <span className="text-sm font-semibold text-slate-900">{action.label}</span>
                  <span className="text-[11px] leading-snug text-slate-500">{action.oneLinePurpose}</span>
                  <span className="font-mono text-[10px] text-slate-400">{action.routedTo}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** STEP 2: progressive clarification — ONE field at a time. */
function ComposerClarify({
  action,
  stepIndex,
  values,
  onEvent,
  onFieldValueChange,
}: {
  readonly action: ComposerAction;
  readonly stepIndex: number;
  readonly values: Readonly<Record<string, string>>;
  readonly onEvent: (event: ComposerUiEvent) => void;
  readonly onFieldValueChange: (name: string, value: string) => void;
}) {
  const field = action.fields[stepIndex];
  if (field === undefined) {
    return null;
  }
  const nextDisabled = field.required && (values[field.name] ?? '').trim() === '';
  const isLast = stepIndex === action.fields.length - 1;
  return (
    <div className="flex flex-col gap-3" data-testid="composer-clarify">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Clarify by text or voice · field {stepIndex + 1} of {action.fields.length}
      </p>
      <p className="text-xs text-slate-500">{action.oneLinePurpose}</p>
      <ComposerFieldControl field={field} value={values[field.name] ?? ''} onFieldValueChange={onFieldValueChange} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onEvent({ kind: 'back' })} className={SECONDARY_BUTTON_CLASS} data-testid="composer-clarify-back">
          Back
        </button>
        <button
          type="button"
          onClick={() => onEvent({ kind: 'advance' })}
          disabled={nextDisabled}
          className={PRIMARY_BUTTON_CLASS}
          data-testid="composer-clarify-next"
          title={nextDisabled ? 'This field is required before the next step' : undefined}
        >
          {isLast ? 'Review the intent' : 'Next'}
        </button>
      </div>
      <details className="rounded-md border border-slate-200 px-3 py-2" data-testid="composer-show-all-fields">
        <summary className="cursor-pointer select-none text-xs font-semibold text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy">
          Show all fields
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {action.fields.map((each) => (
            <ComposerFieldControl
              key={each.name}
              field={each}
              value={values[each.name] ?? ''}
              onFieldValueChange={onFieldValueChange}
            />
          ))}
        </div>
      </details>
      <p className="text-[11px] leading-snug text-slate-400" data-testid="composer-voice-unavailable">
        {COMPOSER_VOICE_UNAVAILABLE_NOTE}
      </p>
    </div>
  );
}

/** The overlay's context line (route + mission + source action). */
function ComposerContextLine({
  routeLabel,
  activeMissionTitle,
  entryContextLabel,
}: {
  readonly routeLabel: string;
  readonly activeMissionTitle: string | null;
  readonly entryContextLabel: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-200 pb-2" data-testid="composer-context-line">
      <p className="text-xs text-slate-500">
        Context: {routeLabel} · {activeMissionTitle ?? 'No active mission'}
        {entryContextLabel === null ? null : (
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500" data-testid="composer-context-entry-label">
            from {entryContextLabel}
          </span>
        )}
      </p>
      <p className="text-[10px] text-slate-400">{COMPOSER_SESSION_DISCLOSURE}</p>
    </div>
  );
}

/** The Ask MOS composer overlay (renders nothing while closed). */
export function MosComposerOverlay({
  state,
  routeLabel,
  activeMissionTitle,
  onEvent,
}: {
  readonly state: ComposerUiState;
  readonly routeLabel: string;
  readonly activeMissionTitle: string | null;
  readonly onEvent: (event: ComposerUiEvent) => void;
}) {
  if (!state.open) {
    return null;
  }
  const action =
    state.actionId === null ? null : COMPOSER_ACTIONS_BY_ID[state.actionId] ?? null;
  const onKeyDown = (event: { readonly key: string }): void => {
    if (event.key === 'Escape') {
      onEvent({ kind: 'dismiss' });
    }
  };
  const onFieldValueChange = (name: string, value: string): void => {
    onEvent({ kind: 'field-change', name, value });
  };
  return (
    <div
      role="dialog"
      aria-label="Ask MOS"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed bottom-4 right-4 z-50 flex max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-xl border border-slate-300 bg-white p-4 shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
      data-testid="mos-composer-overlay"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">Ask MOS</p>
          <p className="text-[11px] text-slate-500">
            Start from the action. Finish with a task.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEvent({ kind: 'dismiss' })}
          aria-label="Close the Ask MOS composer"
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
          data-testid="composer-dismiss"
        >
          Close
        </button>
      </div>
      <ComposerContextLine
        routeLabel={routeLabel}
        activeMissionTitle={activeMissionTitle}
        entryContextLabel={state.entry === null ? null : state.entry.contextLabel ?? null}
      />
      {state.phase.kind === 'pick' ? <ComposerActionPicker onEvent={onEvent} /> : null}
      {state.phase.kind === 'clarify' && action !== null ? (
        <ComposerClarify
          action={action}
          stepIndex={state.phase.stepIndex}
          values={state.values}
          onEvent={onEvent}
          onFieldValueChange={onFieldValueChange}
        />
      ) : null}
      {state.phase.kind === 'summary' && action !== null ? (
        <ComposerConfirmSummary action={action} values={state.values} onEvent={onEvent} />
      ) : null}
      {state.phase.kind === 'waiting' && action !== null ? (
        <ComposerWaiting action={action} />
      ) : null}
      {state.phase.kind === 'result' && action !== null ? (
        <ComposerResultCard action={action} outcome={state.phase.outcome} onEvent={onEvent} />
      ) : null}
    </div>
  );
}
