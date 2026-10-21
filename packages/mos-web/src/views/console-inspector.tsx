import type { ConsolePageData } from '../routes/console-page-loading.js';
import { PlanChainDetailView, RunDetailView, StrategyDetailView } from './console-detail-views.js';

/**
 * The right contextual inspector (the CONSOLE wave, Worker B — the FINAL TL
 * HANDOFF §4.1 right region): a collapsible panel whose content follows the
 * active working mode. On wide windows it is the workspace's right region
 * (lg:w-80); on narrower windows the workspace stacks it below the center
 * region — always rendered, always honest (a `<details open>` the operator
 * can collapse; native summary, keyboard operable).
 *
 * "Selected" record = the first record the mode's read model carries (the
 * route's plan/strategy/run selection params are not resolved by the page
 * model yet — the honest deterministic choice, never a fabricated one).
 */

const META = 'text-[10px] text-slate-500';

function InspectorHeading({ children }: { readonly children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>;
}

function DirectInspector({ page }: { readonly page: Extract<ConsolePageData, { readonly mode: 'direct' }> }) {
  const { mission, standings } = page.data;
  return (
    <div className="flex flex-col gap-3" data-testid="console-inspector-direct">
      <InspectorHeading>Mission objective</InspectorHeading>
      <p className="text-xs text-slate-300" data-testid="console-inspector-mission-objective">
        {mission.objective === '' ? 'No mission selected.' : mission.objective}
      </p>
      {mission.successCriteria.length === 0 ? (
        <p className={META} data-testid="console-inspector-criteria-empty">
          No success criteria declared on this mission record.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <InspectorHeading>Success criteria</InspectorHeading>
          {mission.successCriteria.map((criterion) => (
            <p key={criterion.metric} className="text-xs" data-testid={`console-inspector-criterion-${criterion.metric}`}>
              <span className="font-mono text-slate-200">{criterion.metric}</span>
              <span className="text-slate-500"> · {criterion.direction}</span>
            </p>
          ))}
        </div>
      )}
      {mission.constraints.length === 0 ? (
        <p className={META} data-testid="console-inspector-constraints-empty">
          No constraints declared on this mission record.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <InspectorHeading>Constraints</InspectorHeading>
          {mission.constraints.map((constraint) => (
            <p key={constraint.kind} className="text-xs" data-testid={`console-inspector-constraint-${constraint.kind}`}>
              <span className="text-slate-300">{constraint.kind}</span>
              <span className="text-slate-500"> · {constraint.value}</span>
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <InspectorHeading>Workflow standings</InspectorHeading>
        <p className="text-xs text-slate-400" data-testid="console-inspector-standings">
          {standings.plansCount} plans · {standings.strategiesCount} strategies ·{' '}
          {standings.runsCount} runs ({standings.runsAwaitingAuthorization} awaiting authorization ·{' '}
          {standings.runsArmed} armed)
        </p>
      </div>
    </div>
  );
}

function PlanInspector({ page }: { readonly page: Extract<ConsolePageData, { readonly mode: 'plan' }> }) {
  const selectedPlan = page.data.planChains[0] ?? null;
  const selectedStrategy = page.data.strategies[0] ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="console-inspector-plan">
      <InspectorHeading>Selected plan</InspectorHeading>
      {selectedPlan === null ? (
        <p className={META} data-testid="console-inspector-plan-none">
          No plan composed for this mission yet — the inspector will show the composed plan's
          platforms, expectations and boundary statement here.
        </p>
      ) : (
        <PlanChainDetailView chain={selectedPlan} />
      )}
      <InspectorHeading>Selected strategy</InspectorHeading>
      {selectedStrategy === null ? (
        <p className={META} data-testid="console-inspector-strategy-none">
          No compiled strategy yet — the inspector will show the organization, phases, budgets and
          validation receipt here.
        </p>
      ) : (
        <StrategyDetailView strategy={selectedStrategy} />
      )}
    </div>
  );
}

function ResearchInspector({ page }: { readonly page: Extract<ConsolePageData, { readonly mode: 'research' }> }) {
  const { intelligenceRecords } = page.data;
  const cited = intelligenceRecords.filter((record) => record.basis === 'cited-evidence').length;
  const counterfactual = intelligenceRecords.filter(
    (record) => record.basis === 'counterfactual-forecast',
  ).length;
  const granted = intelligenceRecords.filter((record) => record.rightsStatus === 'granted').length;
  return (
    <div className="flex flex-col gap-3" data-testid="console-inspector-research">
      <InspectorHeading>Citation basis</InspectorHeading>
      <p className="text-xs text-slate-400" data-testid="console-inspector-citation-basis">
        {intelligenceRecords.length} intelligence records ·{' '}
        <span className="text-emerald-300">{cited} cited-evidence</span> ·{' '}
        <span className="text-amber-300">{counterfactual} counterfactual-forecast</span>
      </p>
      {intelligenceRecords.length === 0 ? (
        <p className={META} data-testid="console-inspector-research-empty">
          No citation basis yet — record intelligence through the declaration below once the rights
          grant exists.
        </p>
      ) : null}
      <InspectorHeading>Rights status</InspectorHeading>
      <p className="text-xs text-slate-400" data-testid="console-inspector-rights-status">
        {granted} of {intelligenceRecords.length} records recorded under a granted right
        {granted < intelligenceRecords.length
          ? ' — the rest carry their authority-reported status verbatim below'
          : ''}
        .
      </p>
      <ul className="flex flex-col gap-1" data-testid="console-inspector-rights-records">
        {intelligenceRecords.map((record) => (
          <li key={`${record.recordId}-${record.version}`} className="text-xs">
            <span className="font-mono text-slate-200">{record.recordId}@v{record.version}</span>
            <span className="text-slate-500"> · {record.rightsStatus}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultsInspector({ page }: { readonly page: Extract<ConsolePageData, { readonly mode: 'results' }> }) {
  const selectedRun = page.data.runs[0] ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="console-inspector-results">
      <InspectorHeading>Selected run</InspectorHeading>
      {selectedRun === null ? (
        <p className={META} data-testid="console-inspector-run-none">
          No runs yet — the inspector will show the selected run's trail, budget ledger, actions and
          evidence here.
        </p>
      ) : (
        <RunDetailView run={selectedRun} />
      )}
    </div>
  );
}

function ControlInspector({ page }: { readonly page: Extract<ConsolePageData, { readonly mode: 'control' }> }) {
  const { awaitingAuthorization, rightsGrants } = page.data;
  const pending = awaitingAuthorization[0] ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="console-inspector-control">
      <InspectorHeading>Pending authorization</InspectorHeading>
      {pending === null ? (
        <p className={META} data-testid="console-inspector-pending-none">
          The approval queue is empty — a compiled run's detail will appear here for the arm
          decision.
        </p>
      ) : (
        <div className="flex flex-col gap-1" data-testid="console-inspector-pending">
          <p className="text-xs">
            <span className="font-mono text-slate-200">{pending.runId}</span>
            <span className="text-slate-500"> · strategy </span>
            <span className="font-mono">{pending.strategyId}</span>
          </p>
          <p className={META}>compiled {pending.declaredAt}</p>
          <p className="text-xs text-slate-400">{pending.missionSummary}</p>
        </div>
      )}
      <InspectorHeading>Grants</InspectorHeading>
      {rightsGrants.length === 0 ? (
        <p className={META} data-testid="console-inspector-grants-none">
          No rights grants — the recording gate stays closed until one is granted.
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="console-inspector-grants">
          {rightsGrants.map((grant) => (
            <li key={grant.grantId} className="text-xs">
              <span className="font-mono text-slate-200">{grant.grantId}</span>
              <span className="text-slate-500">
                {' '}
                · {grant.action} · {grant.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The right contextual inspector — content follows the active working mode. */
export function ConsoleInspector({ page }: { readonly page: ConsolePageData }) {
  return (
    <details
      open
      className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
      data-testid="console-inspector"
    >
      <summary className="cursor-pointer select-none text-xs font-semibold text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
        Contextual inspector — {page.mode} mode
      </summary>
      <div className="mt-2 border-t border-slate-800 pt-2">
        {page.mode === 'direct' ? (
          <DirectInspector page={page} />
        ) : page.mode === 'plan' ? (
          <PlanInspector page={page} />
        ) : page.mode === 'research' ? (
          <ResearchInspector page={page} />
        ) : page.mode === 'results' ? (
          <ResultsInspector page={page} />
        ) : (
          <ControlInspector page={page} />
        )}
      </div>
    </details>
  );
}
