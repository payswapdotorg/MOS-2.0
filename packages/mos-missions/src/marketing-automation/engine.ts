/**
 * PROD-003 — the AutomationEngine: a pure, synchronous reducer over durable
 * events (§26), plus the async arm() gate sequence (§27 rights → §criterion-6
 * experiment binding). The engine performs NO transport and NO queue I/O: it
 * emits effects and the durable host executes them against the real ports.
 */
import type { AutomationRunState, AutomationEvent, AutomationEffect, ArmOutcome, StepOutcome, TrailEvent, TrailEventKind, TypedHalt, EvidenceReceiptView, PublishAction } from './types.js';
import type { Result, ExperimentRef, CompiledStrategy } from '../strategy-compiler/types.js';
import { ok, err } from '../strategy-compiler/types.js';
import type { RightsAuthorityPort, ExperimentsReadPort, ClockPort } from '../strategy-compiler/ports.js';
import { describeExperimentsUnresolved } from '../strategy-compiler/ports.js';
import { isValidTenantId, sameTenant } from '../strategy-compiler/tenant.js';
import { parseIso } from '../strategy-compiler/dates.js';
import { describeFault } from '../strategy-compiler/rejections.js';
import { tenantIdInvalid } from '../strategy-compiler/rejections.js';
import type { AutomationRejection, HaltIntent } from './rejections.js';
import { armRightsDenied, runTenantMismatch, experimentBindingFailed, illegalTransition, jobPayloadInvalid, eventRunMismatch, eventUnknownTarget, armAuthorityFault } from './rejections.js';
import { assertTransition } from './lifecycle.js';
import { openLedger, recordSpend, wouldExceed } from './budget.js';
import { buildPublishJobSpecs, PUBLISH_PHASE_PREFIX, MEASURE_PHASE_PREFIX } from './schedule.js';
import { buildEvidenceSubmission } from './evidence.js';

export interface AutomationEngineDeps {
  readonly rights: RightsAuthorityPort;
  readonly experimentsRead: ExperimentsReadPort;
  readonly clock: ClockPort;
}

export class AutomationEngine {
  constructor(private readonly deps: AutomationEngineDeps) {}

  /** Creates the run in the 'compiled' state (pure; rights are checked at arm). */
  public createRun(strategy: CompiledStrategy, input: { readonly runId: string; readonly tenantId: string }): Result<AutomationRunState, AutomationRejection> {
    if (!isValidTenantId(input.tenantId)) return err(tenantIdInvalid(input.tenantId, 'run tenant id'));
    if (!isValidTenantId(strategy.tenantId)) return err(tenantIdInvalid(strategy.tenantId, 'strategy tenant id'));
    if (!sameTenant(strategy.tenantId, input.tenantId)) return err(runTenantMismatch(strategy.tenantId, input.tenantId));
    const spec = strategy.automationRunSpec;
    const actions: PublishAction[] = [];
    for (const platformId of Object.keys(spec.platformChannels)) {
      for (const channel of spec.platformChannels[platformId] ?? []) {
        actions.push({ actionId: `${input.runId}:publish:${platformId}:${channel}`, platformId, channel, status: 'pending' });
      }
    }
    const base: AutomationRunState = {
      runId: input.runId,
      strategyId: strategy.strategyId,
      tenantId: input.tenantId,
      strategySourcePlan: strategy.sourcePlan,
      missionSummary: strategy.missionSummary,
      spec,
      metrics: strategy.metrics,
      forecasts: strategy.forecasts,
      experimentRefs: strategy.experimentRefs,
      experimentBinding: undefined,
      lifecycle: 'compiled',
      ledger: openLedger(spec.budget.currency, spec.budget.totalCeiling),
      actions,
      contentRefs: {},
      collectedMetrics: [],
      completedMeasureWindows: [],
      trail: [],
      halt: undefined,
      evidenceReceipt: undefined,
      deadline: spec.missionDeadline === undefined ? undefined : { dueAt: spec.missionDeadline.dueAt, haltOnPassed: spec.haltOnDeadlinePassed },
      maxSteps: strategy.organization.termination.maxSteps,
      stepCount: 0,
    };
    return ok(this.appendTrail(base, [{
      kind: 'run-created',
      detail: `run created for strategy ${strategy.strategyId} compiled from plan ${strategy.sourcePlan.planId}@v${strategy.sourcePlan.version}`,
    }]));
  }

  /** Gates (rights → experiment binding) then transitions compiled → armed and emits publish-window enqueue effects. */
  public async arm(run: AutomationRunState, input: { readonly principal: string; readonly experimentRef?: ExperimentRef }): Promise<Result<ArmOutcome, AutomationRejection>> {
    try {
      if (run.lifecycle !== 'compiled') return err(illegalTransition(run.lifecycle, 'armed', 'arm() is only legal from the compiled state'));
      const verdict = await this.deps.rights.checkRunRight({ tenantId: run.tenantId, principal: input.principal, strategyId: run.strategyId });
      if (verdict.kind === 'deny') return err(armRightsDenied(verdict.reason, verdict.attribution, verdict.authority));
      const ref = input.experimentRef ?? run.experimentRefs[0];
      if (ref === undefined) return err(experimentBindingFailed('(none)', 'strategy carries no experiment references to bind'));
      const binding = await this.deps.experimentsRead.resolveExperimentBinding(ref, run.tenantId);
      if (binding.kind !== 'real-experiment-binding') return err(experimentBindingFailed(ref.experimentId, describeExperimentsUnresolved(binding)));
      if (binding.tenantId !== '' && !sameTenant(binding.tenantId, run.tenantId)) return err(experimentBindingFailed(ref.experimentId, `binding tenant ${binding.tenantId} does not match run tenant ${run.tenantId}`));
      const effects: AutomationEffect[] = buildPublishJobSpecs(run, this.deps.clock).map((job): AutomationEffect => ({ kind: 'enqueue-job', job }));
      const armed = this.appendTrail({ ...run, lifecycle: 'armed', experimentBinding: binding }, [{
        kind: 'armed',
        detail: `armed against experiment ${binding.experimentId} via binding ${binding.bindingId}`,
        provenance: { authority: 'experiments-authority' },
      }]);
      return ok({ state: armed, effects });
    } catch (fault) {
      return err(armAuthorityFault(describeFault(fault)));
    }
  }

  /** The reducer: one durable event in, one state + effects out. */
  public reduce(run: AutomationRunState, event: AutomationEvent): Result<StepOutcome, AutomationRejection> {
    if (event.runId !== run.runId) return err(eventRunMismatch(event.runId, run.runId));
    if (run.lifecycle === 'closed' || run.lifecycle === 'halted') return err(illegalTransition(run.lifecycle, run.lifecycle, `terminal run rejected a '${event.kind}' event`));
    if (run.stepCount + 1 > run.maxSteps) {
      return this.haltFor(run, { reason: 'MAX_STEPS_EXCEEDED', attribution: 'prod003-automation-engine', detail: `step budget of ${run.maxSteps} exhausted before a '${event.kind}' event` });
    }
    const deadlineHalt = this.checkDeadlineHalt(run);
    if (deadlineHalt !== undefined) return this.haltFor(run, deadlineHalt);
    const stepped: AutomationRunState = { ...run, stepCount: run.stepCount + 1 };
    switch (event.kind) {
      case 'job-enqueued': return this.onJobEnqueued(stepped, event);
      case 'job-completed': return this.onJobCompleted(stepped, event);
      case 'job-failed':
        return this.haltFor(stepped, { reason: 'JOB_FAILURE', attribution: event.attribution, detail: `durable job ${event.jobId} (phase ${event.phaseId}) failed: ${event.reason}` });
      case 'distribution-accepted': return this.onDistributionAccepted(stepped, event);
      case 'distribution-denied': return this.onDistributionDenied(stepped, event);
      case 'measurement-collected': return this.onMeasurementCollected(stepped, event);
      case 'evidence-recorded': return this.onEvidenceRecorded(stepped, event);
      case 'evidence-recording-failed':
        return this.haltFor(stepped, { reason: 'EVIDENCE_RECORDING_FAILED', attribution: event.attribution, detail: event.reason });
    }
  }

  private onJobEnqueued(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'job-enqueued' }): Result<StepOutcome, AutomationRejection> {
    const state = this.appendTrail(run, [{ kind: 'job-enqueued', detail: `job ${event.jobId} enqueued for phase ${event.phaseId}`, provenance: { jobId: event.jobId } }]);
    return ok({ state, effects: [] });
  }

  private onJobCompleted(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'job-completed' }): Result<StepOutcome, AutomationRejection> {
    if (event.phaseId.startsWith(PUBLISH_PHASE_PREFIX)) return this.onPublishWindow(run, event);
    if (event.phaseId.startsWith(MEASURE_PHASE_PREFIX)) return this.onMeasureWindow(run, event);
    return err(eventUnknownTarget(event.phaseId, 'unknown durable job phase'));
  }

  private onPublishWindow(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'job-completed' }): Result<StepOutcome, AutomationRejection> {
    if (run.lifecycle !== 'armed' && run.lifecycle !== 'running') return err(illegalTransition(run.lifecycle, 'running', 'publish window completed outside armed/running'));
    const platformId = event.phaseId.slice(PUBLISH_PHASE_PREFIX.length);
    const contentRef = event.payload?.['contentRef'];
    if (typeof contentRef !== 'string' || contentRef === '') {
      return err(jobPayloadInvalid(event.phaseId, 'publish-window completion requires payload.contentRef (the production-chain output reference); refusing to fabricate one'));
    }
    const pending = run.actions.filter((a) => a.platformId === platformId && a.status === 'pending');
    const batchCost = (run.spec.perActionCosts[platformId] ?? 0) * pending.length;
    if (wouldExceed(run.ledger, batchCost)) {
      return this.haltFor(run, {
        reason: 'BUDGET_EXHAUSTED',
        attribution: 'prod003-budget-policy (AGT-003 budget policy enforcement)',
        detail: `projected spend ${run.ledger.spent + batchCost} ${run.ledger.currency} exceeds ceiling ${run.ledger.ceiling}; dispatching [${pending.map((a) => a.actionId).join(', ')}] blocked — halting instead of silently truncating`,
      });
    }
    if (run.lifecycle === 'armed') {
      const transition = assertTransition('armed', 'running');
      if (!transition.ok) return err(transition.rejection);
    }
    const dispatches = pending.map((action) => ({
      kind: 'dispatch-distribution' as const,
      request: {
        runId: run.runId,
        tenantId: run.tenantId,
        platformId,
        channel: action.channel,
        actionId: action.actionId,
        contentRef,
        policyContext: { strategyId: run.strategyId, sourcePlan: `${run.strategySourcePlan.planId}@v${run.strategySourcePlan.version}` },
      },
    }));
    const actions = run.actions.map((a) => (a.platformId === platformId && a.status === 'pending' ? { ...a, status: 'dispatched' as const } : a));
    const trailSpecs: { kind: TrailEventKind; detail: string; provenance?: TrailEvent['provenance'] }[] = [
      { kind: 'job-completed', detail: `publish window opened for ${platformId} (content ${contentRef})`, provenance: { jobId: event.jobId } },
    ];
    for (const effect of dispatches) {
      trailSpecs.push({ kind: 'distribution-dispatched', detail: `dispatched ${effect.request.actionId} to ${effect.request.channel} for platform ${effect.request.platformId} (job ${event.jobId})`, provenance: { jobId: event.jobId } });
    }
    const state = this.appendTrail({ ...run, lifecycle: 'running', actions }, trailSpecs);
    return ok({ state, effects: dispatches });
  }

  private onMeasureWindow(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'job-completed' }): Result<StepOutcome, AutomationRejection> {
    if (run.lifecycle !== 'armed' && run.lifecycle !== 'running') return err(illegalTransition(run.lifecycle, 'measured', 'measure window completed outside armed/running'));
    const metricId = event.phaseId.slice(MEASURE_PHASE_PREFIX.length);
    if (run.completedMeasureWindows.includes(event.phaseId)) return err(jobPayloadInvalid(event.phaseId, `duplicate completion for the measure window of metric ${metricId}`));
    const withWindow: AutomationRunState = { ...run, completedMeasureWindows: [...run.completedMeasureWindows, event.phaseId] };
    const state = this.appendTrail(withWindow, [{ kind: 'job-completed', detail: `measure window opened for metric ${metricId}`, provenance: { jobId: event.jobId } }]);
    return this.checkMeasured(state);
  }

  private checkMeasured(run: AutomationRunState): Result<StepOutcome, AutomationRejection> {
    if (run.lifecycle !== 'armed' && run.lifecycle !== 'running') return ok({ state: run, effects: [] });
    const expected = run.metrics.map((m) => `${MEASURE_PHASE_PREFIX}${m.metricId}`);
    const windowsDone = expected.every((w) => run.completedMeasureWindows.includes(w));
    const valuesDone = run.metrics.every((m) => run.collectedMetrics.some((c) => c.metricId === m.metricId));
    if (!windowsDone || !valuesDone) return ok({ state: run, effects: [] });
    const transition = assertTransition(run.lifecycle, 'measured');
    if (!transition.ok) return err(transition.rejection);
    const measuredBase = this.appendTrail({ ...run, lifecycle: 'measured' }, [{ kind: 'measured', detail: `all ${run.metrics.length} metric window(s) collected; evidence submission prepared (comparators stay declared — results belong to the experiments authority)` }]);
    const submission = buildEvidenceSubmission(measuredBase);
    if (!submission.ok) return err(submission.rejection);
    return ok({ state: measuredBase, effects: [{ kind: 'record-evidence', submission: submission.value }] });
  }

  private onDistributionAccepted(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'distribution-accepted' }): Result<StepOutcome, AutomationRejection> {
    const target = run.actions.find((a) => a.actionId === event.actionId);
    if (!target) return err(eventUnknownTarget(event.actionId, 'distribution outcome cites an unknown action'));
    if (target.status !== 'dispatched') return err(illegalTransition(run.lifecycle, run.lifecycle, `action ${event.actionId} is '${target.status}', expected 'dispatched'`));
    const receipt = `${event.bindingReceipt}|${event.transportReceipt}`;
    const actions = run.actions.map((a) => (a.actionId === event.actionId ? { ...a, status: 'accepted' as const, receipt } : a));
    const perActionCost = run.spec.perActionCosts[target.platformId] ?? 0;
    const at = this.deps.clock.now().toISOString();
    const spend = recordSpend(run.ledger, perActionCost, `action ${event.actionId} accepted on ${target.channel}`, at, `${PUBLISH_PHASE_PREFIX}${target.platformId}`);
    const spent2 = this.appendTrail({ ...run, actions, ledger: spend.ledger }, [
      { kind: 'distribution-accepted', detail: `action ${event.actionId} accepted (binding ${event.bindingReceipt}; transport ${event.transportReceipt})`, provenance: { actionId: event.actionId } },
      { kind: 'budget-spent', detail: `recorded ${perActionCost} ${spend.ledger.currency} spend for action ${event.actionId} (ledger ${spend.ledger.spent}/${spend.ledger.ceiling})` },
    ]);
    if (spend.exceeded) {
      return this.haltFor(spent2, {
        reason: 'BUDGET_EXHAUSTED',
        attribution: 'prod003-budget-policy (AGT-003 budget policy enforcement)',
        detail: `real spend ${spend.ledger.spent} ${spend.ledger.currency} exceeded the ceiling ${spend.ledger.ceiling} after accepting action ${event.actionId} — halting with the ledger snapshot instead of truncating`,
      });
    }
    return ok({ state: spent2, effects: [] });
  }

  private onDistributionDenied(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'distribution-denied' }): Result<StepOutcome, AutomationRejection> {
    const target = run.actions.find((a) => a.actionId === event.actionId);
    if (!target) return err(eventUnknownTarget(event.actionId, 'distribution outcome cites an unknown action'));
    if (target.status !== 'dispatched') return err(illegalTransition(run.lifecycle, run.lifecycle, `action ${event.actionId} is '${target.status}', expected 'dispatched'`));
    const actions = run.actions.map((a) => (a.actionId === event.actionId ? { ...a, status: 'denied' as const, denial: { reason: event.reason, attribution: event.attribution } } : a));
    const denied = this.appendTrail({ ...run, actions }, [{ kind: 'distribution-denied', detail: `action ${event.actionId} denied: ${event.reason}`, provenance: { actionId: event.actionId } }]);
    return this.haltFor(denied, {
      reason: 'DISTRIBUTION_DENIED',
      attribution: event.attribution,
      detail: `the distribution authority denied action ${event.actionId}: ${event.reason} — halting with the verbatim attribution; zero transport calls were made for the denied action`,
    });
  }

  private onMeasurementCollected(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'measurement-collected' }): Result<StepOutcome, AutomationRejection> {
    if (run.lifecycle !== 'armed' && run.lifecycle !== 'running' && run.lifecycle !== 'measured') return err(illegalTransition(run.lifecycle, run.lifecycle, `metric ${event.metricId} collected outside armed/running/measured`));
    if (!run.metrics.some((m) => m.metricId === event.metricId)) return err(eventUnknownTarget(event.metricId, 'collected value for a metric outside the strategy spec'));
    const collected: AutomationRunState = { ...run, collectedMetrics: [...run.collectedMetrics, { metricId: event.metricId, value: event.value, collectedAt: event.collectedAt }] };
    const state = this.appendTrail(collected, [{ kind: 'measurement-collected', detail: `metric ${event.metricId} = ${event.value} (collected ${event.collectedAt})` }]);
    return this.checkMeasured(state);
  }

  private onEvidenceRecorded(run: AutomationRunState, event: AutomationEvent & { readonly kind: 'evidence-recorded' }): Result<StepOutcome, AutomationRejection> {
    if (run.lifecycle !== 'measured') return err(illegalTransition(run.lifecycle, 'closed', 'evidence recorded outside the measured state'));
    const experimentId = run.experimentBinding?.experimentId ?? '(unbound)';
    const receipt: EvidenceReceiptView = { evidenceId: event.evidenceId, experimentId, recordedAt: event.recordedAt };
    const transition = assertTransition('measured', 'closed');
    if (!transition.ok) return err(transition.rejection);
    const closed = this.appendTrail({ ...run, lifecycle: 'closed', evidenceReceipt: receipt }, [
      { kind: 'evidence-recorded', detail: `evidence ${event.evidenceId} recorded against experiment ${experimentId}`, provenance: { authority: 'experiments-authority' } },
      { kind: 'closed', detail: `run closed with evidence receipt ${event.evidenceId} (comparators stay declared)` },
    ]);
    return ok({ state: closed, effects: [] });
  }

  private checkDeadlineHalt(run: AutomationRunState): HaltIntent | undefined {
    if (run.deadline === undefined || !run.deadline.haltOnPassed) return undefined;
    const dueAt = parseIso(run.deadline.dueAt);
    if (dueAt === undefined || dueAt.getTime() > this.deps.clock.now().getTime()) return undefined;
    return {
      reason: 'DEADLINE_PASSED',
      attribution: 'prod003-deadline-policy (mission deadline)',
      detail: `mission deadline ${run.deadline.dueAt} passed before the run reached a terminal state`,
    };
  }

  private haltFor(run: AutomationRunState, intent: HaltIntent): Result<StepOutcome, AutomationRejection> {
    const haltedAt = this.deps.clock.now().toISOString();
    const halt: TypedHalt = {
      reason: intent.reason,
      attribution: intent.attribution,
      detail: intent.detail,
      ledgerSnapshot: { spent: run.ledger.spent, ceiling: run.ledger.ceiling, currency: run.ledger.currency },
      haltedAt,
    };
    const state = this.appendTrail({ ...run, lifecycle: 'halted', halt }, [{
      kind: 'halted',
      detail: `run halted (${intent.reason}): ${intent.detail}`,
    }]);
    return ok({ state, effects: [] });
  }

  private appendTrail(run: AutomationRunState, specs: readonly { kind: TrailEventKind; detail: string; provenance?: TrailEvent['provenance'] }[]): AutomationRunState {
    if (specs.length === 0) return run;
    const at = this.deps.clock.now().toISOString();
    const base = run.trail.length;
    const events: TrailEvent[] = specs.map((spec, i): TrailEvent => ({
      eventId: `${run.runId}:t:${base + i}`,
      at,
      tenantId: run.tenantId,
      runId: run.runId,
      kind: spec.kind,
      detail: spec.detail,
      provenance: spec.provenance,
    }));
    return { ...run, trail: [...run.trail, ...events] };
  }
}
