import type { LabIntentDeclaration } from '../ports/lab-intents.js';
import type { LabIntentFormParse } from './lab-intent-form-data.js';

/**
 * The Lab write-intent form primitive (UX-003 wave 3) — INTENT
 * DECLARATION ONLY, mirroring the accepted mission intent form pattern:
 * uncontrolled inputs (the browser owns state), native `required`
 * attributes carry the minimal presentation validation, and the submit
 * hands the PARSED declaration to the shell callback. The form neither
 * executes nor validates the intent's business shape — the lab authority
 * does that through the composition seam and its verdict comes back on
 * the next full load (the outcome panel).
 *
 * Field configs drive every per-action form (see the section views):
 * scalar text/number inputs and declared-JSON textareas (the contract-
 * structured objects the operator declares verbatim — parse failures are
 * NAMED ledger verdicts at the seam, never client-side guesses).
 */

/** One rendered form field. */
export interface LabIntentFormField {
  /** Stable field name (LAB_INTENT_FORM_FIELDS entry). */
  readonly name: string;
  /** Visible label. */
  readonly label: string;
  /** Rendered control kind. */
  readonly kind: 'text' | 'number' | 'json' | 'long-text';
  /** Whether the field is required for the declaration. */
  readonly required: boolean;
  /** Placeholder hint (never a defaulted value). */
  readonly placeholder?: string;
}

export interface LabIntentFormProps {
  /** Collapsed summary label (the action the operator declares). */
  readonly summaryLabel: string;
  /** Where the intent routes (shown above the fields, verbatim port vocabulary). */
  readonly routedTo: string;
  /** One-line disclosure of what the authority will do with the declaration. */
  readonly disclosureNote: string;
  /** The rendered fields, in order. */
  readonly fields: readonly LabIntentFormField[];
  /** Stable test id for the form container. */
  readonly testId: string;
  /** Parses the submitted FormData into the typed declaration. */
  readonly parse: (form: FormData) => LabIntentFormParse;
  /** Shell callback that routes the declaration to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}

const INPUT_CLASS =
  'rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400';

function FieldControl({ field }: { readonly field: LabIntentFormField }) {
  const id = `lab-intent-field-${field.name}`;
  if (field.kind === 'json' || field.kind === 'long-text') {
    const isJson = field.kind === 'json';
    return (
      <label htmlFor={id} className="flex flex-col gap-1 text-xs">
        {field.label}
        {isJson ? ' (declared JSON — parsed by the lab authority seam)' : ''}
        <textarea
          id={id}
          name={field.name}
          required={field.required}
          rows={field.kind === 'json' ? 4 : 2}
          placeholder={field.placeholder}
          spellCheck={false}
          className={`font-mono leading-relaxed ${INPUT_CLASS}`}
          data-testid={`lab-intent-field-${field.name}`}
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
        required={field.required}
        placeholder={field.placeholder}
        className={INPUT_CLASS}
        data-testid={`lab-intent-field-${field.name}`}
      />
    </label>
  );
}

/** One Lab write-intent declaration form (collapsible, uncontrolled). */
export function LabIntentForm({
  summaryLabel,
  routedTo,
  disclosureNote,
  fields,
  testId,
  parse,
  onDeclareLabIntent,
}: LabIntentFormProps) {
  const handleSubmit = (event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }): void => {
    event.preventDefault();
    const parsed = parse(new FormData(event.currentTarget));
    if (!parsed.ok) {
      // Native `required` validation should have caught this before
      // submission; if it did not, the shell refuses to declare a
      // malformed intent rather than guessing one (the mission form's
      // discipline, verbatim).
      return;
    }
    onDeclareLabIntent(parsed.declaration);
  };

  return (
    <details
      className="rounded-lg border border-slate-800 bg-slate-900/40"
      data-testid={testId}
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
        {summaryLabel}
      </summary>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-slate-800 px-4 py-4">
        <p className="text-xs text-slate-500">
          Declaring this intent routes the fields below to the {routedTo} through the lab-intents
          port. The shell records nothing and decides nothing — the authority validates, executes
          and versions the record, and the verdict (receipt or named rejection) returns on the
          next load. {disclosureNote}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.name}
              className={field.kind === 'json' || field.kind === 'long-text' ? 'sm:col-span-2' : ''}
            >
              <FieldControl field={field} />
            </div>
          ))}
        </div>
        <button
          type="submit"
          className="self-start rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          data-testid={`${testId}-submit`}
        >
          Declare intent
        </button>
      </form>
    </details>
  );
}
