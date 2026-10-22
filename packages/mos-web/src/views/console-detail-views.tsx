import type {
  ConsolePlanChainView,
  ConsoleRunView,
  ConsoleStrategyView,
} from '../ports/agent-console.js';

/**
 * The Agent Console's shared DEEP detail renderers (the CONSOLE wave,
 * Worker B): the full structured presentation of one plan chain, one
 * compiled strategy and one automation run — used BOTH by the center
 * region's per-record progressive disclosure (details/summary) and by the
 * right contextual inspector's selected-record sections.
 *
 * Every value renders from the port's view model VERBATIM: lifecycle
 * states, basis labels (cited-evidence | counterfactual-forecast), the
 * boundary statement, rejection/halt vocabulary, budgets and digests. No
 * fabricated numbers, no invented states — absent values render as honest
 * explicit states, never as zeros-that-look-like-data.
 */

const META = 'text-[10px] text-slate-500';

/** Renders one plan chain's full detail (platforms, expectations, boundary). */
export function PlanChainDetailView({
  chain,
}: {
  readonly chain: ConsolePlanChainView;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={`console-plan-detail-${chain.planId}`}>
      <p className="text-xs text-slate-700" data-testid={`console-plan-alignment-${chain.planId}`}>
        {chain.objectiveAlignment}
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-slate-500">Platform choices (rationale + citations)</p>
        {chain.platforms.map((platform) => (
          <p key={platform.platform} className="text-xs" data-testid={`console-plan-platform-${chain.planId}-${platform.platform}`}>
            <span className="font-mono text-slate-800">{platform.platform}</span>
            <span className="text-slate-500"> — {platform.rationale}</span>
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-slate-500">Metric expectations (basis verbatim)</p>
        {chain.metricExpectations.map((expectation) => (
          <p
            key={expectation.metric}
            className="text-xs"
            data-testid={`console-plan-expectation-${chain.planId}-${expectation.metric}`}
          >
            <span className="font-mono text-slate-800">{expectation.metric}</span>
            <span className="text-slate-500">
              {' '}
              · {expectation.expectation} {expectation.unit} · basis{' '}
            </span>
            <span
              className={
                expectation.basis === 'counterfactual-forecast'
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }
            >
              {expectation.basis}
            </span>
            {expectation.basis === 'counterfactual-forecast' ? (
              <span className="text-amber-700">
                {' '}
                (a declared forecast — counterfactual, never measured)
              </span>
            ) : null}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-slate-500">Experiment expectations</p>
        {chain.experimentExpectations.map((expectation, index) => (
          <p
            key={`${expectation.question}-${index}`}
            className="text-xs"
            data-testid={`console-plan-experiment-expectation-${chain.planId}-${index}`}
          >
            <span className="text-slate-700">{expectation.question}</span>
            <span className="text-slate-500"> — success: {expectation.successCriterion}</span>
          </p>
        ))}
      </div>
      <p className={META} data-testid={`console-plan-boundary-${chain.planId}`}>
        Boundary statement (verbatim): {chain.boundaryStatement}
      </p>
      <p className={META} data-testid={`console-plan-digest-${chain.planId}`}>
        record digest <span className="font-mono">{chain.recordDigest}</span> · composed{' '}
        {chain.composedAt} by <span className="font-mono">{chain.composedBy}</span>
      </p>
    </div>
  );
}

/** Renders one compiled strategy's full detail (organization, gates, comparators, EVD). */
export function StrategyDetailView({
  strategy,
}: {
  readonly strategy: ConsoleStrategyView;
}) {
  const { organization } = strategy;
  return (
    <div className="flex flex-col gap-3" data-testid={`console-strategy-detail-${strategy.strategyId}`}>
      <p className="text-xs text-slate-700" data-testid={`console-strategy-source-${strategy.strategyId}`}>
        compiled from plan{' '}
        <span className="font-mono text-slate-800">
          {strategy.sourcePlan.planId}@v{strategy.sourcePlan.version}
        </span>{' '}
        — {strategy.missionSummary}
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-slate-500">
          Organization (§23) —{' '}
          <span className="font-mono text-slate-800">{organization.name}</span>{' '}
          <span className="text-slate-500">· topology {organization.topology}</span>
        </p>
        {organization.roles.map((role) => (
          <p
            key={role.roleId}
            className="text-xs"
            data-testid={`console-strategy-role-${strategy.strategyId}-${role.roleId}`}
          >
            <span className="font-mono text-slate-800">{role.roleId}</span>
            <span className="text-slate-500">
              {' '}
              · {role.title} · {role.responsibilitiesCount} responsibilities · model{' '}
              <span className="font-mono">{role.modelId}</span>
            </span>
          </p>
        ))}
        {organization.delegationEdges.map((edge) => (
          <p
            key={edge.edgeId}
            className="text-xs"
            data-testid={`console-strategy-edge-${strategy.strategyId}-${edge.edgeId}`}
          >
            <span className="font-mono text-slate-800">
              {edge.fromRoleId} → {edge.toRoleId}
            </span>
            <span className="text-slate-500">
              {' '}
              · {edge.type} · {edge.purpose}
            </span>
          </p>
        ))}
        {organization.phases.map((phase) => (
          <p
            key={phase.phaseId}
            className="text-xs"
            data-testid={`console-strategy-phase-${strategy.strategyId}-${phase.phaseId}`}
          >
            <span className="font-mono text-slate-800">{phase.phaseId}</span>
            <span className="text-slate-500">
              {' '}
              · {phase.kind} · role <span className="font-mono">{phase.roleId}</span>
              {phase.platformId === null ? '' : ` · platform ${phase.platformId}`}
              {phase.metricId === null ? '' : ` · metric ${phase.metricId}`}
              {` · ${phase.dependsOnCount} dependencies · ${phase.declaredDurationDays} declared days`}
            </span>
          </p>
        ))}
        <p className={META} data-testid={`console-strategy-organization-${strategy.strategyId}`}>
          budgets: {organization.budgets.totalCeiling} {organization.budgets.currency} ceiling ·
          termination {organization.termination} · {organization.toolGrantsCount} tool grants ·
          communication {organization.communication} · memory sharing {organization.memorySharing}
        </p>
      </div>
      <p className={META} data-testid={`console-strategy-validation-${strategy.strategyId}`}>
        AGT-003 validation receipt (verbatim):{' '}
        <span className="font-mono">{strategy.organizationValidation.authorityRecord}</span>
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-slate-500">Declared comparators</p>
        {strategy.comparators.map((comparator) => (
          <p
            key={comparator.name}
            className="text-xs"
            data-testid={`console-strategy-comparator-${strategy.strategyId}-${comparator.name}`}
          >
            <span className="font-mono text-slate-800">{comparator.name}</span>
            <span className="text-slate-500"> · {comparator.kind}</span>
          </p>
        ))}
      </div>
      {strategy.expectedValueOfDelay === null ? (
        <p className={META} data-testid={`console-strategy-evd-none-${strategy.strategyId}`}>
          Expected value of delay: not computed by the compiler for this strategy (an honest
          absence — never a fabricated number).
        </p>
      ) : (
        <p className="text-xs" data-testid={`console-strategy-evd-${strategy.strategyId}`}>
          <span className="font-semibold text-slate-500">Expected value of delay</span>
          <span className="text-slate-500">
            {' '}
            · value {strategy.expectedValueOfDelay.value} · per-day delay cost{' '}
            {strategy.expectedValueOfDelay.perDayDelayCost} · deadline pressure{' '}
            {strategy.expectedValueOfDelay.deadlinePressure}
          </span>
        </p>
      )}
      <p className={META} data-testid={`console-strategy-forecasts-${strategy.strategyId}`}>
        {strategy.forecastsCount} forecasts ride this strategy — every one a{' '}
        <span className="text-amber-700">counterfactual</span> forecast (§22), never measured
        evidence.
      </p>
    </div>
  );
}

/** Renders one run's full detail (ledger, actions, metrics, trail, gates). */
export function RunDetailView({ run }: { readonly run: ConsoleRunView }) {
  return (
    <div className="flex flex-col gap-3" data-testid={`console-run-detail-${run.runId}`}>
      <p className="text-xs text-slate-700" data-testid={`console-run-mission-${run.runId}`}>
        {run.missionSummary}
      </p>
      <p className={META} data-testid={`console-run-ledger-${run.runId}`}>
        lifecycle <span className="font-mono text-slate-700">{run.lifecycle}</span> · budget ledger{' '}
        {run.ledger.spent}/{run.ledger.ceiling} {run.ledger.currency} · steps {run.stepCount}/
        {run.maxSteps}
      </p>
      {run.actions.length === 0 ? (
        <p className={META} data-testid={`console-run-actions-none-${run.runId}`}>
          No publish actions recorded yet — the engine records actions when the durable transport
          executes them.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-slate-500">Publish actions</p>
          {run.actions.map((action) => (
            <p
              key={action.actionId}
              className="text-xs"
              data-testid={`console-run-action-${run.runId}-${action.actionId}`}
            >
              <span className="font-mono text-slate-800">{action.actionId}</span>
              <span className="text-slate-500">
                {' '}
                · {action.platformId} · {action.channel} · {action.status}
              </span>
            </p>
          ))}
        </div>
      )}
      {run.collectedMetrics.length === 0 ? (
        <p className={META} data-testid={`console-run-metrics-none-${run.runId}`}>
          No collected metrics yet — metrics arrive measured from the execution transport, never
          forecast.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-slate-500">Collected metrics (measured)</p>
          {run.collectedMetrics.map((metric) => (
            <p
              key={metric.metricId}
              className="text-xs"
              data-testid={`console-run-metric-${run.runId}-${metric.metricId}`}
            >
              <span className="font-mono text-slate-800">{metric.metricId}</span>
              <span className="text-slate-500"> = {metric.value}</span>
              <span className="text-emerald-700"> (measured)</span>
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-slate-500">Audit trail (§30, verbatim)</p>
        {run.trail.map((event) => (
          <p
            key={event.eventId}
            className="text-xs"
            data-testid={`console-run-trail-${run.runId}-${event.eventId}`}
          >
            <span className="text-slate-500">{event.at}</span>{' '}
            <span className="font-mono text-slate-700">{event.kind}</span>
            <span className="text-slate-500"> — {event.detail}</span>
            {event.provenance !== null ? (
              <span className="text-slate-500">
                {' '}
                [provenance: {event.provenance.authority ?? ''}
                {event.provenance.jobId ? ` job ${event.provenance.jobId}` : ''}
                {event.provenance.actionId ? ` action ${event.provenance.actionId}` : ''}]
              </span>
            ) : null}
          </p>
        ))}
      </div>
      {run.experimentBinding !== null ? (
        <p className={META} data-testid={`console-run-binding-${run.runId}`}>
          experiment binding:{' '}
          <span className="font-mono">{run.experimentBinding.experimentId}</span> via{' '}
          <span className="font-mono">{run.experimentBinding.bindingId}</span>
        </p>
      ) : null}
      {run.evidenceReceipt !== null ? (
        <p className={META} data-testid={`console-run-evidence-${run.runId}`}>
          evidence receipt: <span className="font-mono">{run.evidenceReceipt.evidenceId}</span> for
          experiment <span className="font-mono">{run.evidenceReceipt.experimentId}</span>
        </p>
      ) : null}
      {run.halt !== null ? (
        <p className="text-xs text-amber-800" data-testid={`console-run-halt-${run.runId}`}>
          Halted — <span className="font-mono">{run.halt.reason}</span>: {run.halt.detail}
        </p>
      ) : null}
    </div>
  );
}
