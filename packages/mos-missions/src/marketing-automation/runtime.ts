/**
 * PROD-003 — the durable host driver (§26): feeds durable events through the
 * AutomationEngine reducer and executes the emitted effects against the host
 * ports. The engine performs NO transport; THIS layer is where enqueue /
 * dispatch / record side-effects happen, against the REAL ports in
 * production (the @mos/jobs JobQueuePort enqueue, the PROD-001 distribution
 * binding surface, the experiments write path) or against host doubles in
 * tests. Denials produce ZERO transport calls — the host surface honors the
 * rights-before-transport law by construction.
 */
import type {
  AutomationEffect,
  AutomationEvent,
  AutomationRunState,
  DurableJobSpec,
  DistributionRequest,
  DistributionOutcome,
  ExperimentEvidenceSubmission,
} from './types.js';
import type { AutomationRejection } from './rejections.js';
import type { Result } from '../strategy-compiler/types.js';
import { AutomationEngine } from './engine.js';

/** The host-side executor. In production these are the real authority ports. */
export interface AutomationHost {
  /** The @mos/jobs durable enqueue (§26). */
  readonly enqueueJob: (job: DurableJobSpec) => void;
  /** The PROD-001 distribution binding surface — rights/policy gates precede transport. */
  readonly dispatchDistribution: (request: DistributionRequest) => DistributionOutcome;
  /** The experiments authority write path (§24). */
  readonly recordEvidence: (submission: ExperimentEvidenceSubmission) => { readonly evidenceId: string; readonly recordedAt: string };
  /** ISO timestamp source for host-synthesized events. */
  readonly nowIso: () => string;
}

export interface DriveOutcome {
  readonly run: AutomationRunState;
  /** Enqueued durable jobs, in order (the §26 audit trail). */
  readonly jobs: readonly DurableJobSpec[];
  /** Evidence submissions executed against the experiments authority. */
  readonly submissions: readonly ExperimentEvidenceSubmission[];
  /** Transport calls actually made (denied actions never reach transport — assertable). */
  readonly transportCalls: number;
  /** Rejections collected while driving (the fold never throws). */
  readonly rejections: readonly AutomationRejection[];
  /** Trail events appended across the drive (mirrors run.trail). */
  readonly trailLength: number;
}

/**
 * Drives a run through a sequence of durable events, executing the engine's
 * emitted effects through the host between steps. Distribution outcomes and
 * evidence receipts come back as synthesized durable events on the next
 * iteration, closing the §2 loop end-to-end.
 */
export function driveAutomation(
  engine: AutomationEngine,
  host: AutomationHost,
  initial: AutomationRunState,
  events: readonly AutomationEvent[],
): Result<DriveOutcome, AutomationRejection> {
  let run = initial;
  const jobs: DurableJobSpec[] = [];
  const submissions: ExperimentEvidenceSubmission[] = [];
  const rejections: AutomationRejection[] = [];
  let transportCalls = 0;
  const queue: AutomationEvent[] = [...events];
  let guard = 0;
  while (queue.length > 0) {
    if (guard++ > 512) break; // defensive: never loop forever on a chatty host
    const event = queue.shift();
    if (event === undefined) break;
    const step = engine.reduce(run, event);
    if (!step.ok) {
      rejections.push(step.rejection);
      continue;
    }
    run = step.value.state;
    for (const effect of step.value.effects) {
      const synthesized = executeEffect(effect, host, jobs, submissions, () => { transportCalls += 1; });
      queue.push(...synthesized);
    }
  }
  return {
    ok: true as const,
    value: { run, jobs, submissions, transportCalls, rejections, trailLength: run.trail.length },
  };
}

function executeEffect(
  effect: AutomationEffect,
  host: AutomationHost,
  jobs: DurableJobSpec[],
  submissions: ExperimentEvidenceSubmission[],
  countTransport: () => void,
): readonly AutomationEvent[] {
  switch (effect.kind) {
    case 'enqueue-job':
      host.enqueueJob(effect.job);
      jobs.push(effect.job);
      return [{
        kind: 'job-enqueued',
        runId: effect.job.runId,
        jobId: effect.job.phaseId,
        phaseId: effect.job.phaseId,
      }];
    case 'dispatch-distribution': {
      countTransport();
      const outcome = host.dispatchDistribution(effect.request);
      if (outcome.kind === 'accepted') {
        return [{
          kind: 'distribution-accepted',
          runId: effect.request.runId,
          actionId: effect.request.actionId,
          bindingReceipt: outcome.bindingReceipt,
          transportReceipt: outcome.transportReceipt,
        }];
      }
      return [{
        kind: 'distribution-denied',
        runId: effect.request.runId,
        actionId: effect.request.actionId,
        reason: outcome.reason,
        attribution: outcome.attribution,
      }];
    }
    case 'record-evidence': {
      submissions.push(effect.submission);
      const receipt = host.recordEvidence(effect.submission);
      return [{
        kind: 'evidence-recorded',
        runId: effect.submission.runId,
        evidenceId: receipt.evidenceId,
        recordedAt: receipt.recordedAt,
      }];
    }
  }
}

/** Convenience: a pure in-memory host double for tests and fixtures. */
export function memoryHost(overrides: Partial<AutomationHost> = {}): AutomationHost & { readonly dispatched: readonly DistributionRequest[] } {
  const dispatched: DistributionRequest[] = [];
  const base: AutomationHost = {
    enqueueJob: () => undefined,
    dispatchDistribution: (request) => {
      dispatched.push(request);
      return { kind: 'accepted', actionId: request.actionId, bindingReceipt: `binding:${request.actionId}`, transportReceipt: `transport:${request.actionId}` };
    },
    recordEvidence: (submission) => ({ evidenceId: `evidence:${submission.runId}`, recordedAt: '2026-01-01T00:00:00.000Z' }),
    nowIso: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  return Object.assign(base, { dispatched });
}
