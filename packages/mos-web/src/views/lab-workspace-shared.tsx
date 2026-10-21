import { LAB_COUNTERFACTUAL_LABEL, LAB_MEASURED_LABEL } from './lab-presentation.js';

/**
 * Shared presentation primitives for the Lab WORKSPACE section views
 * (UX-003 wave 2): the §20/§24 badges, the explicit section state panels
 * (loading / unavailable / empty / selection-miss) and the declared
 * read-only affordance (a disabled control WITH its reason — never a dead
 * control, never a fake success).
 *
 * Presentation-only: every panel renders states the page model already
 * carries; nothing here decides, fetches or computes lab state.
 */

/** The VISIBLE §20/§24 counterfactual badge (every simulated value). */
export function LabCounterfactualBadge({ testId }: { readonly testId?: string }) {
  return (
    <span
      className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
      data-testid={testId}
      title={LAB_COUNTERFACTUAL_LABEL}
    >
      Counterfactual
    </span>
  );
}

/** The VISIBLE §24 measured badge (boundary-chain observations). */
export function LabMeasuredBadge({ testId }: { readonly testId?: string }) {
  return (
    <span
      className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
      data-testid={testId}
      title={LAB_MEASURED_LABEL}
    >
      Measured
    </span>
  );
}

/** The synthetic-disclosure line (the authority's verbatim disclosure kind). */
export function LabDisclosureNote({ disclosure }: { readonly disclosure: string }) {
  return (
    <span className="font-mono text-[10px] text-slate-500" data-testid="lab-disclosure-kind">
      {disclosure}
    </span>
  );
}

/**
 * The explicit not-loaded-on-this-pass panel: the section's data is null and
 * no error is recorded — the honest pre-load state, never a fabricated
 * empty. Mirrors the boot shell's loading semantics.
 */
export function LabSectionLoadingPanel({ section }: { readonly section: string }) {
  return (
    <p
      className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-slate-400"
      data-testid={`lab-${section}-loading`}
    >
      The {section} data is still loading on this pass — the workspace renders it the moment the
      lab authority answers, and never before.
    </p>
  );
}

/** The explicit honest-unavailable panel (a secondary read failed). */
export function LabSectionUnavailablePanel({ section }: { readonly section: string }) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid={`lab-${section}-unavailable`}
    >
      The {section} listing could not be loaded on this pass — the lab service failed explicitly.
      It is shown as explicitly unavailable rather than as a fabricated empty list.
    </aside>
  );
}

/** The explicit empty-state panel (a listing genuinely holds no records). */
export function LabSectionEmptyPanel({
  section,
  what,
}: {
  readonly section: string;
  readonly what: string;
}) {
  return (
    <p
      className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500"
      data-testid={`lab-${section}-empty`}
    >
      No {what} are visible in this tenant scope. Either none exist yet, or the scope genuinely
      sees none — the workspace does not fabricate examples.
    </p>
  );
}

/** The named selection-miss panel (not-found vs load-failed, §31 no leak). */
export function LabSelectionErrorPanel({
  section,
  error,
  vocabulary,
}: {
  readonly section: string;
  readonly error: 'not-found' | 'load-failed';
  /** The section's own not-found vocabulary code (rendered verbatim). */
  readonly vocabulary: string;
}) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid={`lab-${section}-selection-error`}
    >
      {error === 'not-found'
        ? `The selected ${section} record does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess). [${vocabulary}]`
        : `The selected ${section} record could not be loaded — the lab service failed explicitly. [${vocabulary}]`}
    </aside>
  );
}

/**
 * A DECLARED read-only affordance: the action the lab authority owns,
 * rendered as a disabled control with its reason (title + visible text) —
 * never enabled, never a fake success. The reason is the presentation note
 * the section's discipline declares.
 */
export function LabDeclaredAffordance({
  action,
  reason,
  testId,
}: {
  readonly action: string;
  readonly reason: string;
  readonly testId?: string;
}) {
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={reason}
        data-testid={testId ?? 'lab-declared-affordance'}
        className="w-fit cursor-not-allowed rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-left text-xs font-medium text-slate-500"
      >
        {action}
      </button>
      <span className="max-w-2xl text-[11px] leading-relaxed text-slate-500">{reason}</span>
    </span>
  );
}

/** A one-line key/value fact (the section views' shared row atom). Children
 * are typed structurally (`unknown` — the disclosure-primitive ViewNode
 * discipline; rendered through the same `as never` seam): no react import
 * in any form (the pin law: the JSX runtime is compiler-emitted). */
export function LabFact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: unknown;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-400">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="text-slate-300">{children as never}</span>
    </span>
  );
}
