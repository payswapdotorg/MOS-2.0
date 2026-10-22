import type {
  ConsoleIntentLedgerRecord,
  ConsoleIntentReceipt,
} from '../ports/console-intents.js';

/**
 * The Console write-intent OUTCOME panel (the CONSOLE wave): what the
 * owning mode presents after a declared intent soft-navigates back with
 * the `?receipt=<intentId>` marker — the ledger record's verdict,
 * VERBATIM.
 *
 * An EXECUTED receipt shows the authority echo (record id, version,
 * lifecycle state, summary). An AUTHORITY REJECTION shows the authority's
 * own error code and message with the same prominence — never paraphrased
 * into success, never hidden. The panel renders NOTHING when no marker
 * was carried (the ordinary mode load) and a named degradation marker
 * when the marker resolves to no visible record (the honest not-found
 * case, including cross-tenant ids).
 */

export interface ConsoleIntentOutcomePanelProps {
  /** The ledger record the page model resolved (null when no marker). */
  readonly outcome: ConsoleIntentLedgerRecord | null;
  /** The honest degradation marker for the outcome read. */
  readonly outcomeError: 'console-intent-not-found' | 'load-failed' | null;
}

function ExecutedReceiptView({ receipt }: { readonly receipt: ConsoleIntentReceipt }) {
  return (
    <div className="flex flex-col gap-1" data-testid="console-intent-outcome-receipt">
      <p className="text-sm font-semibold text-emerald-700">
        Executed by {receipt.routedTo}
      </p>
      <p className="text-xs text-slate-500">
        Intent <span className="font-mono">{receipt.intentId}</span> declared at{' '}
        <span className="font-mono">{receipt.declaredAt}</span>
      </p>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
        <dt className="text-slate-500">Record</dt>
        <dd className="font-mono text-slate-800">{receipt.authorityEcho.recordId}</dd>
        <dt className="text-slate-500">Version</dt>
        <dd className="font-mono text-slate-800">{receipt.authorityEcho.recordVersion}</dd>
        {receipt.authorityEcho.lifecycleState !== null ? (
          <>
            <dt className="text-slate-500">Lifecycle</dt>
            <dd className="font-mono text-slate-800">{receipt.authorityEcho.lifecycleState}</dd>
          </>
        ) : null}
        <dt className="text-slate-500">Authority summary</dt>
        <dd className="text-slate-700">{receipt.authorityEcho.summary}</dd>
      </dl>
    </div>
  );
}

function RejectionView({
  record,
}: {
  readonly record: ConsoleIntentLedgerRecord;
}) {
  if (!('error' in record.outcome)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1" data-testid="console-intent-outcome-rejection">
      <p className="text-sm font-semibold text-amber-700">
        Rejected by {record.routedTo} — <span className="font-mono">{record.outcome.error}</span>
      </p>
      <p className="text-xs text-slate-500">
        Intent <span className="font-mono">{record.intentId}</span> declared at{' '}
        <span className="font-mono">{record.declaredAt}</span>
      </p>
      <p className="text-xs text-amber-800">
        The authority's message, verbatim:{' '}
        <span className="font-mono">{record.outcome.message}</span>
      </p>
      <p className="text-xs text-slate-500">
        Nothing was written. The declared attempt and this verdict stay in the intent ledger.
      </p>
    </div>
  );
}

/** The outcome panel — rendered by the Console workspace above the mode content. */
export function ConsoleIntentOutcomePanel({
  outcome,
  outcomeError,
}: ConsoleIntentOutcomePanelProps) {
  if (outcome === null && outcomeError === null) {
    return null;
  }
  if (outcome === null) {
    return (
      <aside
        role="status"
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
        data-testid="console-intent-outcome-unresolved"
      >
        {outcomeError === 'console-intent-not-found'
          ? 'The referenced console intent does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess).'
          : 'The referenced console intent ledger record could not be loaded — the console-intents service failed explicitly.'}
      </aside>
    );
  }
  return (
    <aside
      role="status"
      aria-label="Console write-intent outcome"
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="console-intent-outcome"
    >
      {'error' in outcome.outcome ? (
        <RejectionView record={outcome} />
      ) : (
        <ExecutedReceiptView receipt={outcome.outcome} />
      )}
    </aside>
  );
}
