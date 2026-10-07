import type { MissionDetailView, RewardTermView } from '../ports/mission-catalog.js';

/**
 * The mission detail view (UX-001): the objective statement with its target
 * metrics and constraints, the lifecycle transition history reconstructed
 * from the append-only record versions, and the full list of reward-spec
 * versions with their terms. Everything is read-only presentation of what
 * the Missions authority recorded — transitions are history, not controls.
 */

function RewardTermRow({ term }: { readonly term: RewardTermView }) {
  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-slate-800 pl-3">
      <span className="text-xs font-semibold text-slate-200">
        {term.metric}
        <span className="ml-2 font-mono text-[10px] font-normal text-slate-500">
          {term.direction} · weight {term.weight}
        </span>
      </span>
      <span className="text-xs text-slate-400">{term.definition}</span>
    </li>
  );
}

function RewardSpecVersions({
  versions,
}: {
  readonly versions: readonly MissionDetailView['rewardSpecVersions'][number][];
}) {
  return (
    <section aria-labelledby="mission-reward-versions-title" className="mt-6">
      <h3 id="mission-reward-versions-title" className="text-sm font-semibold text-slate-100">
        Reward spec versions
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        The reward spec is mission-specific and versioned independently (spec §21) — reward
        changes are explicit and traceable, never silent.
      </p>
      <ol className="mt-3 flex flex-col gap-3" data-testid="mission-reward-versions">
        {versions.map((version) => (
          <li key={version.specVersion} className="rounded-lg border border-slate-800 p-3">
            <p className="text-xs font-semibold text-slate-300">Spec v{version.specVersion}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {version.terms.map((term) => (
                <RewardTermRow key={`${version.specVersion}-${term.metric}`} term={term} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TransitionHistory({
  transitions,
}: {
  readonly transitions: readonly MissionDetailView['transitions'][number][];
}) {
  return (
    <section aria-labelledby="mission-transitions-title" className="mt-6">
      <h3 id="mission-transitions-title" className="text-sm font-semibold text-slate-100">
        Lifecycle transitions
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Reconstructed from the append-only record versions — the strict forward chain
        draft → active → completed → archived with no back-transitions.
      </p>
      <ol className="mt-3 flex flex-col gap-2" data-testid="mission-transitions">
        {transitions.map((transition) => (
          <li
            key={`${transition.recordVersion}-${transition.to}`}
            className="flex items-center gap-2 text-xs text-slate-300"
          >
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              v{transition.recordVersion}
            </span>
            <span>
              {transition.fromState === 'created' ? 'created' : transition.fromState} →{' '}
              <span className="font-semibold">{transition.to}</span>
            </span>
            <span className="text-slate-500">{transition.at}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The full mission detail presentation panel. */
export function MissionDetailPanel({ detail }: { readonly detail: MissionDetailView }) {
  const { summary, objectiveStatement, targetMetrics, constraints, strategyRefs } = detail;
  return (
    <article
      aria-labelledby="mission-detail-title"
      className="rounded-lg border border-slate-800 bg-slate-900/40 p-5"
      data-testid="mission-detail"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="mission-detail-title" className="text-base font-semibold text-slate-100">
          {summary.title}
        </h2>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          {summary.lifecycleState}
        </span>
        <a
          href="/missions"
          className="ml-auto text-xs text-sky-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          Back to the list
        </a>
      </header>
      <p className="mt-1 font-mono text-xs text-slate-500">
        {summary.missionId} · record v{summary.recordVersion} · tenant {summary.tenantId}
        {summary.workspaceId === null ? '' : ` / ${summary.workspaceId}`}
      </p>

      <section aria-labelledby="mission-objective-title" className="mt-4">
        <h3 id="mission-objective-title" className="text-sm font-semibold text-slate-100">
          Objective
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{objectiveStatement}</p>
        {targetMetrics.length > 0 ? (
          <table className="mt-3 w-full text-left text-xs" data-testid="mission-target-metrics">
            <thead>
              <tr className="text-slate-500">
                <th scope="col" className="py-1 pr-4 font-medium">Metric</th>
                <th scope="col" className="py-1 pr-4 font-medium">Target</th>
                <th scope="col" className="py-1 pr-4 font-medium">Unit</th>
                <th scope="col" className="py-1 font-medium">Horizon</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {targetMetrics.map((metric) => (
                <tr key={`${metric.metric}-${metric.target}`} className="border-t border-slate-800">
                  <td className="py-1.5 pr-4">{metric.metric}</td>
                  <td className="py-1.5 pr-4 font-mono">{metric.target}</td>
                  <td className="py-1.5 pr-4">{metric.unit}</td>
                  <td className="py-1.5">{metric.horizon ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {constraints.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1" data-testid="mission-constraints">
            {constraints.map((constraint) => (
              <li key={`${constraint.kind}-${constraint.description}`} className="text-xs text-slate-400">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  {constraint.kind}
                </span>{' '}
                {constraint.description}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <TransitionHistory transitions={detail.transitions} />
      <RewardSpecVersions versions={detail.rewardSpecVersions} />

      {strategyRefs.length > 0 ? (
        <section aria-labelledby="mission-strategies-title" className="mt-6">
          <h3 id="mission-strategies-title" className="text-sm font-semibold text-slate-100">
            Associated strategies
          </h3>
          <ul className="mt-2 flex flex-col gap-1" data-testid="mission-strategy-refs">
            {strategyRefs.map((ref) => (
              <li key={ref} className="font-mono text-xs text-slate-400">
                {ref}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
