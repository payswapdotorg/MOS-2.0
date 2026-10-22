import type { ConsolePageData } from '../routes/console-page-loading.js';
import { RunDetailView } from './console-detail-views.js';

/**
 * The Results mode (the CONSOLE wave, Worker B): the mission's automation
 * runs and durable artifacts — summary-first run rows (lifecycle verbatim,
 * the honest waiting state) with the full §30 trail, budget ledger, publish
 * actions and collected (measured) metrics behind details/summary.
 */

export function ResultsModeContent({
  page,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'results' }>;
}) {
  const { runs, artifacts } = page.data;
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-results">
      <section aria-labelledby="console-runs-title" className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="console-runs-title" className="text-base font-semibold text-slate-900">
          Automation runs (PROD-004)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Every run renders the lifecycle the engine recorded and what it honestly waits for —
          'authorization' while compiled, the disclosed job-execution transport once armed. Open a
          run for its full audit trail, ledger and evidence.
        </p>
        {runs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-runs-empty">
            No runs yet — a compiled strategy instantiates a run that waits for authorization in
            the Control mode.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-runs">
            {runs.map((run) => (
              <li key={run.runId}>
                <details
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  data-testid={`console-run-${run.runId}`}
                >
                  <summary className="cursor-pointer select-none text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy">
                    <span className="font-mono text-slate-800">{run.runId}</span>
                    <span className="text-slate-500">
                      {' '}
                      · lifecycle <span className="font-mono">{run.lifecycle}</span> · budget{' '}
                      {run.ledger.spent}/{run.ledger.ceiling} {run.ledger.currency} · steps{' '}
                      {run.stepCount}/{run.maxSteps} · {run.trail.length} trail events
                    </span>
                  </summary>
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <RunDetailView run={run} />
                  </div>
                </details>
                {run.waitingOn !== null ? (
                  <p
                    className="mt-1 text-[10px] text-amber-700"
                    data-testid={`console-run-waiting-${run.runId}`}
                  >
                    Waiting on {run.waitingOn}
                    {run.waitingOn === 'job-execution-transport'
                      ? ' (the disclosed P2 boundary — nothing simulates execution here)'
                      : ' (the arm gate in the Control mode)'}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="console-artifacts-title">
        <h2 id="console-artifacts-title" className="text-base font-semibold text-slate-900">
          Durable artifacts
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          The plans and strategies this mission holds as inspectable, versioned records.
        </p>
        {artifacts.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-artifacts-empty">
            No durable artifacts yet — plans and strategies appear here as inspectable records.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-xs" data-testid="console-artifacts">
            {artifacts.map((artifact) => (
              <li
                key={`${artifact.kind}-${artifact.id}-${artifact.version}`}
                className="text-slate-500"
                data-testid={`console-artifact-${artifact.id}`}
              >
                <span className="font-mono text-slate-800">
                  {artifact.id}@v{artifact.version}
                </span>{' '}
                · {artifact.kind}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
