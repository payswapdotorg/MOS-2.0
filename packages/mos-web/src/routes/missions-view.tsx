import type { MissionsPageData } from '../routes/route-loading.js';
import type { CreateMissionIntentDeclaration } from '../ports/mission-catalog.js';
import { MissionsListView } from './missions-list.js';
import { MissionDetailPanel } from './mission-detail.js';
import { MissionIntentForm } from './mission-intent-form.js';
import { MosNoTenantContextView } from '../shell/route-fallbacks.js';

/**
 * The Missions surface (UX-001): the missions-first working view of the
 * shell. It presents the mission catalog read models (list + detail), the
 * receipt of a declared create-mission intent, and the intent declaration
 * form — every mutation-shaped action is an INTENT DECLARATION routed to the
 * Missions authority through the port; the surface itself never mutates,
 * computes or validates mission state.
 */

function IntentReceiptPanel({
  receipt,
}: {
  readonly receipt: NonNullable<MissionsPageData['intentReceipt']>;
}) {
  return (
    <aside
      aria-labelledby="intent-receipt-title"
      className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4"
      data-testid="intent-receipt"
    >
      <h2 id="intent-receipt-title" className="text-sm font-semibold text-emerald-300">
        Create-mission intent recorded
      </h2>
      <p className="mt-1 text-xs text-emerald-200/80">
        The declaration was routed to <span className="font-mono">{receipt.routedTo}</span> at{' '}
        {receipt.declaredAt}. {receipt.note}
      </p>
      <p className="mt-1 font-mono text-xs text-emerald-200/70">intent {receipt.intentId}</p>
    </aside>
  );
}

function IntentErrorPanel({ code }: { readonly code: string }) {
  return (
    <aside
      role="alert"
      aria-labelledby="intent-error-title"
      className="rounded-lg border border-red-900/60 bg-red-950/20 p-4"
      data-testid="intent-error"
    >
      <h2 id="intent-error-title" className="text-sm font-semibold text-red-300">
        The intent could not be declared
      </h2>
      <p className="mt-1 text-xs text-red-200/80">
        The Missions authority refused the declaration
        (<span className="font-mono">{code}</span>). Nothing was created — the failure is
        explicit, not papered over.
      </p>
      <a
        href="/missions"
        className="mt-2 inline-flex text-xs text-red-200 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        Back to the mission list
      </a>
    </aside>
  );
}

/**
 * A receipt id that did not resolve is NOT a refused declaration: the
 * declaration was accepted when it was made — what is missing is the receipt
 * READ-BACK on this load (the UX-001 build runs the disclosed per-load
 * in-memory composition, so state recorded on a previous load is not visible
 * to this one; the production server-backed composition resolves the receipt
 * here). The panel says exactly that instead of guessing a receipt.
 */
function ReceiptUnavailablePanel() {
  return (
    <aside
      role="status"
      aria-labelledby="intent-receipt-unavailable-title"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4"
      data-testid="intent-receipt-unavailable"
    >
      <h2 id="intent-receipt-unavailable-title" className="text-sm font-semibold text-amber-300">
        The intent receipt is not available on this load
      </h2>
      <p className="mt-1 text-xs text-amber-200/80">
        The catalog has no receipt for this intent id. The declaration itself was accepted when it
        was made — what is missing is the receipt read-back: this shell build runs the disclosed
        per-load in-memory composition, so state recorded on a previous load is not visible to
        this one. The shell shows the miss explicitly instead of guessing a receipt.
      </p>
      <a
        href="/missions"
        className="mt-2 inline-flex text-xs text-amber-200 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        Back to the mission list
      </a>
    </aside>
  );
}

function SelectionErrorPanel({ error }: { readonly error: 'mission-not-found' | 'load-failed' }) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="mission-selection-error"
    >
      {error === 'mission-not-found'
        ? 'The selected mission does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess).'
        : 'The selected mission could not be loaded — the catalog service failed explicitly.'}
    </aside>
  );
}

/** The Missions page view over the loaded page model. */
export function MissionsView({
  data,
  onDeclareMissionIntent,
}: {
  readonly data: MissionsPageData;
  readonly onDeclareMissionIntent: (declaration: CreateMissionIntentDeclaration) => void;
}) {
  if (data.scope === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Missions</h1>
        <MosNoTenantContextView />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">Missions</h1>
        <p className="mt-1 text-sm text-slate-400">
          Declared objectives with versioned, mission-specific reward specs — the front door of
          the complete loop. List reads and intent declarations only; lifecycle and reward rules
          live in the Missions authority.
        </p>
      </header>

      {data.intentReceipt !== null ? <IntentReceiptPanel receipt={data.intentReceipt} /> : null}
      {data.intentError !== null ? (
        data.intentError === 'intent-receipt-not-found' ? (
          <ReceiptUnavailablePanel />
        ) : (
          <IntentErrorPanel code={data.intentError} />
        )
      ) : null}

      <section aria-labelledby="missions-list-title">
        <h2 id="missions-list-title" className="sr-only">
          Mission list
        </h2>
        <MissionsListView
          summaries={data.summaries}
          selectedMissionId={data.selected === null ? null : data.selected.summary.missionId}
        />
      </section>

      {data.selectionError !== null ? <SelectionErrorPanel error={data.selectionError} /> : null}
      {data.selected !== null ? <MissionDetailPanel detail={data.selected} /> : null}

      <MissionIntentForm
        scope={data.scope}
        metricVocabulary={data.metricVocabulary}
        onDeclareMissionIntent={onDeclareMissionIntent}
      />
    </div>
  );
}
