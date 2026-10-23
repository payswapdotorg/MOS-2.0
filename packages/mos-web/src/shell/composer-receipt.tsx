import type { ComposerAction } from './composer-actions.js';
import {
  composerActionSurfaceHref,
  composerActionSurfaceLabel,
} from './composer-actions.js';
import type { ComposerOutcomeView, ComposerUiEvent } from './composer-state.js';

/**
 * The composer's STEP 3 + receipt surfaces (the §6 P0 universal-composer
 * wave — UXR-WC): the structured-intent summary ("No consequential side
 * effect occurs on this step", per the target SVG), the honest waiting
 * card, and the receipt/task card that renders ONLY what the owning
 * authority actually reported — an executed receipt's echo (ids, versions,
 * lifecycle states) or the authority's named rejection VERBATIM. Nothing
 * here executes, retries or paraphrases: the declaration left through the
 * shell callbacks in the entry; the outcome came back through them.
 */

const PRIMARY_BUTTON_CLASS =
  'self-start rounded-md bg-mos-navy px-4 py-2 text-sm font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy';

const SECONDARY_BUTTON_CLASS =
  'self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy';

/** The "Open in <owning surface>" link (the post-declaration destination). */
function ComposerSurfaceLink({ action }: { readonly action: ComposerAction }) {
  return (
    <a
      href={composerActionSurfaceHref(action.actionId)}
      className="inline-flex self-start rounded-md bg-mos-navy px-4 py-2 text-sm font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
      data-testid="composer-open-surface"
    >
      Open in {composerActionSurfaceLabel(action.actionId)}
    </a>
  );
}

/** STEP 3: the structured-intent summary — plain language, no side effect. */
export function ComposerConfirmSummary({
  action,
  values,
  onEvent,
}: {
  readonly action: ComposerAction;
  readonly values: Readonly<Record<string, string>>;
  readonly onEvent: (event: ComposerUiEvent) => void;
}) {
  const portName =
    action.declareRoute === 'mission'
      ? 'the mission-catalog port'
      : action.declareRoute === 'console'
        ? 'the console-intents port'
        : 'the lab-intents port';
  return (
    <div className="flex flex-col gap-3" data-testid="composer-summary">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Confirm the structured intent
      </p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
        <p>
          You are declaring <span className="font-semibold">{action.label}</span> —{' '}
          {action.oneLinePurpose}
        </p>
        <dl className="mt-2 flex flex-col gap-1">
          {action.fields.map((field) => (
            <div key={field.name} className="flex flex-col">
              <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                {field.label}
                {field.required ? ' (required)' : ' (optional)'}
              </dt>
              <dd
                className="break-words font-mono text-xs text-slate-700"
                data-testid={`composer-summary-value-${field.name}`}
              >
                {values[field.name] === '' || values[field.name] === undefined
                  ? '—'
                  : values[field.name]}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-xs text-slate-500">
        Routes to <span className="font-mono">{action.routedTo}</span> through {portName}. The
        shell records nothing and decides nothing — the authority validates, executes and versions
        the record.
      </p>
      <p className="text-xs font-medium text-slate-700" data-testid="composer-no-side-effect">
        No consequential side effect occurs on this step.
      </p>
      <p className="text-xs text-slate-500">
        Exact next action: declaring routes this intent to {action.routedTo}; the verdict (receipt
        or named rejection) renders here and on the owning{' '}
        {composerActionSurfaceLabel(action.actionId)} surface.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEvent({ kind: 'back' })}
          className={SECONDARY_BUTTON_CLASS}
          data-testid="composer-summary-back"
        >
          Back — edit the answers
        </button>
        <button
          type="button"
          onClick={() => onEvent({ kind: 'confirm' })}
          className={PRIMARY_BUTTON_CLASS}
          data-testid="composer-confirm"
        >
          Declare intent
        </button>
      </div>
    </div>
  );
}

/** The honest waiting card (what it waits on, named). */
export function ComposerWaiting({ action }: { readonly action: ComposerAction }) {
  return (
    <div className="flex flex-col gap-3" data-testid="composer-waiting" role="status">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Declaration in flight
      </p>
      <p className="text-sm text-slate-700">
        The declaration was handed to <span className="font-mono">{action.routedTo}</span> through
        the shell callback — awaiting the authority&apos;s verdict. When the owning surface opens,
        it carries the same verdict (receipt or named rejection).
      </p>
      <p className="text-xs text-slate-500">
        Nothing is retried and nothing is fabricated while waiting; a full page load
        (create-mission) shows the verdict on the Missions surface instead.
      </p>
      <ComposerSurfaceLink action={action} />
    </div>
  );
}

/** One echo row of the receipt card (ids/versions/lifecycle, verbatim). */
function EchoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="text-xs text-slate-600">
      <span className="text-slate-400">{label} </span>
      <span className="font-mono">{value}</span>
    </p>
  );
}

/** The verdict block of the receipt card (echo or rejection, verbatim). */
function ComposerVerdict({ outcome }: { readonly outcome: ComposerOutcomeView }) {
  if (outcome.kind === 'refused') {
    return (
      <div className="flex flex-col gap-1" data-testid="composer-receipt-refused">
        <p className="text-sm font-semibold text-red-700">
          The declaration was not sent — <span className="font-mono">{outcome.code}</span>
        </p>
        <p className="text-xs text-red-700">{outcome.message}</p>
      </div>
    );
  }
  if (outcome.kind === 'mission') {
    if (outcome.outcome.kind === 'receipt') {
      return (
        <div className="flex flex-col gap-1" data-testid="composer-receipt-executed">
          <p className="text-sm font-semibold text-emerald-700">
            Intent recorded — executed by{' '}
            <span className="font-mono">{outcome.outcome.receipt.routedTo}</span>
          </p>
          <EchoRow label="intent" value={outcome.outcome.receipt.intentId} />
          <EchoRow label="declared at" value={outcome.outcome.receipt.declaredAt} />
          <p className="text-xs text-slate-600">{outcome.outcome.receipt.note}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1" data-testid="composer-receipt-rejected">
        <p className="text-sm font-semibold text-red-700">
          Rejected — <span className="font-mono">{outcome.outcome.code}</span>
        </p>
        <p className="text-xs text-red-700">{outcome.outcome.message}</p>
      </div>
    );
  }
  const record = outcome.record;
  if ('authorityEcho' in record.outcome) {
    const echo = record.outcome.authorityEcho;
    return (
      <div className="flex flex-col gap-1" data-testid="composer-receipt-executed">
        <p className="text-sm font-semibold text-emerald-700">
          Executed by <span className="font-mono">{record.routedTo}</span>
        </p>
        <EchoRow label="intent" value={record.intentId} />
        <EchoRow label="record" value={echo.recordId} />
        <EchoRow label="record version" value={String(echo.recordVersion)} />
        {echo.lifecycleState === null ? null : (
          <EchoRow label="lifecycle state" value={echo.lifecycleState} />
        )}
        <p className="text-xs text-slate-600">{echo.summary}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="composer-receipt-rejected">
      <p className="text-sm font-semibold text-red-700">
        Rejected by <span className="font-mono">{record.routedTo}</span> —{' '}
        <span className="font-mono">{record.outcome.error}</span>
      </p>
      <p className="text-xs text-red-700">{record.outcome.message}</p>
    </div>
  );
}

/** The receipt/task card: the authority's verdict, verbatim, plus the link. */
export function ComposerResultCard({
  action,
  outcome,
  onEvent,
}: {
  readonly action: ComposerAction;
  readonly outcome: ComposerOutcomeView;
  readonly onEvent: (event: ComposerUiEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="composer-result">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Intent outcome
      </p>
      <ComposerVerdict outcome={outcome} />
      <p className="text-xs text-slate-500">
        Rendered from what {action.routedTo} actually reported — session-scoped until the MOS
        service transport lands; nothing here is a fabricated progress state.
      </p>
      <ComposerSurfaceLink action={action} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEvent({ kind: 'restart' })}
          className={SECONDARY_BUTTON_CLASS}
          data-testid="composer-restart"
        >
          Start another action
        </button>
        <button
          type="button"
          onClick={() => onEvent({ kind: 'dismiss' })}
          className={SECONDARY_BUTTON_CLASS}
          data-testid="composer-result-close"
        >
          Close
        </button>
      </div>
    </div>
  );
}
