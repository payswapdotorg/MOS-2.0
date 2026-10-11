/**
 * PROD-003 — the durable host driver: the §2 loop closed end-to-end with the
 * engine, effects executed against host doubles, denials producing ZERO
 * transport calls (the rights-before-transport law).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArmedRun, RUN_ID } from './fixtures.js';
import { driveAutomation, memoryHost } from '../marketing-automation/runtime.js';
import type { AutomationHost } from '../marketing-automation/runtime.js';
import type { AutomationEvent, DistributionRequest, DistributionOutcome } from '../marketing-automation/types.js';

function happyEvents(): AutomationEvent[] {
  return [
    { kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'content://teaser/v2' } },
    { kind: 'job-completed', runId: RUN_ID, jobId: 'job-2', phaseId: 'publish:platform-newsletter', payload: { contentRef: 'content://digest/v1' } },
    { kind: 'job-completed', runId: RUN_ID, jobId: 'job-3', phaseId: 'measure:video-views' },
    { kind: 'measurement-collected', runId: RUN_ID, metricId: 'video-views', value: 12_345, collectedAt: '2026-01-21T00:00:00.000Z' },
    { kind: 'job-completed', runId: RUN_ID, jobId: 'job-4', phaseId: 'measure:newsletter-ctr' },
    { kind: 'measurement-collected', runId: RUN_ID, metricId: 'newsletter-ctr', value: 510, collectedAt: '2026-01-21T00:00:00.000Z' },
  ];
}

test('driveAutomation closes the loop: every action accepted, evidence recorded, run closed', async () => {
  const { engine, run } = await makeArmedRun();
  const host = memoryHost();
  const outcome = driveAutomation(engine, host, run, happyEvents());
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const { value } = outcome;
  assert.equal(value.run.lifecycle, 'closed');
  assert.equal(value.run.evidenceReceipt?.evidenceId, `evidence:${RUN_ID}`);
  assert.equal(value.submissions.length, 1);
  assert.equal(value.submissions[0]?.outcomes.length, 2, 'every metric carries an outcome');
  assert.equal(value.submissions[0]?.comparatorStatus, 'declared');
  assert.equal(value.transportCalls, 3, 'video main + newsletter digest + newsletter promo');
  assert.equal(value.jobs.length, 0, 'the publish-window enqueues happened at arm() — outside this drive');
  assert.equal(value.rejections.length, 0);
  assert.ok(value.run.ledger.spent === 110, '60 + 25 + 25 recorded as real spend');
});

test('a denial halts the run with verbatim attribution and ZERO transport for the denied batch', async () => {
  const { engine, run } = await makeArmedRun();
  let transportCalls = 0;
  const denyingHost: AutomationHost = {
    enqueueJob: () => undefined,
    dispatchDistribution: (request: DistributionRequest): DistributionOutcome => {
      // The PROD-001 binding surface: rights/policy gates PRECEDE transport —
      // a denial means the transport call never happens.
      if (request.platformId === 'platform-video') {
        return { kind: 'denied', actionId: request.actionId, reason: 'policy: content banned', attribution: 'rights-authority#rule-7' };
      }
      transportCalls += 1;
      return { kind: 'accepted', actionId: request.actionId, bindingReceipt: 'b', transportReceipt: 't' };
    },
    recordEvidence: (submission) => ({ evidenceId: `evidence:${submission.runId}`, recordedAt: '2026-01-22T00:00:00.000Z' }),
    nowIso: () => '2026-01-01T00:00:00.000Z',
  };
  const outcome = driveAutomation(engine, denyingHost, run, [
    { kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'content://teaser/v2' } },
  ]);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.run.lifecycle, 'halted');
  assert.equal(outcome.value.run.halt?.reason, 'DISTRIBUTION_DENIED');
  if (outcome.value.run.halt?.reason === 'DISTRIBUTION_DENIED') {
    assert.equal(outcome.value.run.halt.attribution, 'rights-authority#rule-7');
  }
  assert.equal(transportCalls, 0, 'the denied platform never reached transport');
  assert.equal(outcome.value.transportCalls, 1, 'the host surface itself was invoked once (the gate)');
});

test('the driver collects rejections as values and keeps driving', async () => {
  const { engine, run } = await makeArmedRun();
  const host = memoryHost();
  const outcome = driveAutomation(engine, host, run, [
    { kind: 'job-completed', runId: 'wrong-run', jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'x' } },
    { kind: 'job-completed', runId: RUN_ID, jobId: 'job-2', phaseId: 'publish:platform-video', payload: { contentRef: 'content://teaser/v2' } },
  ]);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.rejections.length, 1);
  assert.equal(outcome.value.rejections[0]?.name, 'EVENT_RUN_MISMATCH');
  assert.equal(outcome.value.run.lifecycle, 'running');
});

test('memoryHost records dispatched requests for audit', async () => {
  const { engine, run } = await makeArmedRun();
  const host = memoryHost();
  driveAutomation(engine, host, run, happyEvents());
  assert.equal(host.dispatched.length, 3);
  assert.ok(host.dispatched.every((r) => r.runId === RUN_ID));
  assert.ok(host.dispatched.every((r) => r.policyContext['strategyId'] !== undefined));
});
