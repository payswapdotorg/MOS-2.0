/**
 * PROD-003 — the AutomationEngine reducer battery: the full §2 loop from
 * createRun through closed, and every typed halt (never silent truncation).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCompilerDoubles, makeArmedRun, makePlan, RUN_ID, TENANT } from './fixtures.js';
import type { AutomationEvent } from '../marketing-automation/types.js';

const ev = (e: AutomationEvent): AutomationEvent => e;

test('createRun builds one action per platform×channel with an opened ledger', async () => {
  const { engine, strategy } = await makeArmedRun();
  const created = engine.createRun(strategy, { runId: 'run-x', tenantId: TENANT });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const run = created.value;
  assert.equal(run.lifecycle, 'compiled');
  assert.equal(run.actions.length, 3, 'video:1 channel + newsletter:2 channels');
  assert.equal(run.ledger.spent, 0);
  assert.equal(run.ledger.ceiling, 1000);
  assert.equal(run.trail.length, 1);
  assert.equal(run.trail[0]?.kind, 'run-created');
  assert.equal(run.experimentRefs.length, 1);
});

test('arm gates rights then experiment binding and emits publish enqueue effects', async () => {
  const { doubles, engine, strategy } = await makeArmedRun();
  // (the fixture already armed — re-arm a fresh run to inspect the effects)
  const created = engine.createRun(strategy, { runId: RUN_ID, tenantId: TENANT });
  if (!created.ok) throw new Error('createRun failed');
  const armed = await engine.arm(created.value, { principal: 'principal-alice' });
  assert.equal(armed.ok, true);
  if (!armed.ok) return;
  assert.equal(armed.value.state.lifecycle, 'armed');
  assert.equal(armed.value.state.experimentBinding?.experimentId, 'exp-41');
  assert.equal(armed.value.effects.length, 2, 'one publish window per platform');
  for (const effect of armed.value.effects) {
    assert.equal(effect.kind, 'enqueue-job');
    if (effect.kind === 'enqueue-job') {
      assert.equal(effect.job.kind, 'automation-publish-window');
      assert.ok(effect.job.phaseId.startsWith('publish:'));
    }
  }
  assert.deepEqual(doubles.rights.calls.includes('checkRunRight:acme-co'), true);
});

test('arm rights denial carries the verbatim attribution', async () => {
  const doubles = makeCompilerDoubles();
  const { engine, strategy } = await makeArmedRun(doubles);
  const created = engine.createRun(strategy, { runId: RUN_ID, tenantId: TENANT });
  if (!created.ok) throw new Error('createRun failed');
  const rights = doubles.rights as { verdict: unknown };
  rights.verdict = { kind: 'deny', reason: 'principal suspended', attribution: 'rights-authority#rule-2', authority: 'rights-authority' };
  const armed = await engine.arm(created.value, { principal: 'principal-bob' });
  assert.equal(armed.ok, false);
  if (armed.ok) return;
  assert.equal(armed.rejection.name, 'ARM_RIGHTS_DENIED');
  if (armed.rejection.name === 'ARM_RIGHTS_DENIED') {
    assert.equal(armed.rejection.attribution, 'rights-authority#rule-2');
  }
});

test('the full loop: publish window → dispatch → accept → measure → evidence → closed', async () => {
  const { engine, run } = await makeArmedRun();
  let state = run;
  // publish window for platform-video
  const publish = engine.reduce(state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'content://teaser/v2' } }));
  assert.equal(publish.ok, true);
  if (!publish.ok) return;
  state = publish.value.state;
  assert.equal(state.lifecycle, 'running');
  assert.equal(publish.value.effects.length, 1);
  assert.equal(publish.value.effects[0]?.kind, 'dispatch-distribution');
  const action = state.actions.find((a) => a.platformId === 'platform-video');
  assert.equal(action?.status, 'dispatched');
  // distribution accepted
  const accepted = engine.reduce(state, ev({ kind: 'distribution-accepted', runId: RUN_ID, actionId: action?.actionId ?? '', bindingReceipt: 'bind-1', transportReceipt: 'tr-1' }));
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  state = accepted.value.state;
  assert.equal(state.actions.find((a) => a.platformId === 'platform-video')?.status, 'accepted');
  assert.equal(state.ledger.spent, 60);
  // measure window + collection for the video metric
  const measured = engine.reduce(state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-2', phaseId: 'measure:video-views' }));
  assert.equal(measured.ok, true);
  if (!measured.ok) return;
  state = measured.value.state;
  const collected = engine.reduce(state, ev({ kind: 'measurement-collected', runId: RUN_ID, metricId: 'video-views', value: 12_345, collectedAt: '2026-01-21T00:00:00.000Z' }));
  assert.equal(collected.ok, true);
  if (!collected.ok) return;
  state = collected.value.state;
  // remaining platform's publish + accepts + measurement
  const publish2 = engine.reduce(state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-3', phaseId: 'publish:platform-newsletter', payload: { contentRef: 'content://digest/v1' } }));
  assert.equal(publish2.ok, true);
  if (!publish2.ok) return;
  state = publish2.value.state;
  for (const a of state.actions.filter((x) => x.status === 'dispatched')) {
    const acc = engine.reduce(state, ev({ kind: 'distribution-accepted', runId: RUN_ID, actionId: a.actionId, bindingReceipt: 'bind-n', transportReceipt: 'tr-n' }));
    if (!acc.ok) throw new Error(JSON.stringify(acc.rejection));
    state = acc.value.state;
  }
  const measure2 = engine.reduce(state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-4', phaseId: 'measure:newsletter-ctr' }));
  assert.equal(measure2.ok, true);
  if (!measure2.ok) return;
  state = measure2.value.state;
  const collected2 = engine.reduce(state, ev({ kind: 'measurement-collected', runId: RUN_ID, metricId: 'newsletter-ctr', value: 510, collectedAt: '2026-01-21T00:00:00.000Z' }));
  assert.equal(collected2.ok, true);
  if (!collected2.ok) return;
  state = collected2.value.state;
  // all metrics collected + windows complete → measured + evidence effect
  assert.equal(state.lifecycle, 'measured');
  assert.equal(collected2.value.effects.length, 1);
  assert.equal(collected2.value.effects[0]?.kind, 'record-evidence');
  const recorded = engine.reduce(state, ev({ kind: 'evidence-recorded', runId: RUN_ID, evidenceId: 'ev-77', recordedAt: '2026-01-22T00:00:00.000Z' }));
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.equal(recorded.value.state.lifecycle, 'closed');
  assert.equal(recorded.value.state.evidenceReceipt?.evidenceId, 'ev-77');
  // the §30 trail records the whole sequence
  const kinds = recorded.value.state.trail.map((t) => t.kind);
  assert.ok(kinds.includes('armed'));
  assert.ok(kinds.includes('distribution-dispatched'));
  assert.ok(kinds.includes('distribution-accepted'));
  assert.ok(kinds.includes('budget-spent'));
  assert.ok(kinds.includes('measured'));
  assert.ok(kinds.includes('evidence-recorded'));
  assert.ok(kinds.includes('closed'));
});

test('projected budget exhaustion halts BEFORE dispatching (preventive)', async () => {
  const doubles = makeCompilerDoubles();
  doubles.plans.plan = makePlan({ budget: { currency: 'USD', totalCeiling: 50 } });
  const { engine, run } = await makeArmedRun(doubles);
  const publish = engine.reduce(run, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'content://t/v2' } }));
  assert.equal(publish.ok, true);
  if (!publish.ok) return;
  assert.equal(publish.value.state.lifecycle, 'halted');
  assert.equal(publish.value.state.halt?.reason, 'BUDGET_EXHAUSTED');
  assert.deepEqual(publish.value.effects, [], 'nothing dispatched when the batch would exceed the ceiling');
  assert.ok(publish.value.state.halt?.detail.includes('halting instead of silently truncating'));
});

test('reactive budget exhaustion halts after acceptance with a ledger snapshot', async () => {
  const doubles = makeCompilerDoubles();
  doubles.plans.plan = makePlan({ budget: { currency: 'USD', totalCeiling: 100 } });
  const { engine, run } = await makeArmedRun(doubles);
  let state = run;
  const publish = engine.reduce(state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'content://t/v2' } }));
  if (!publish.ok) throw new Error(JSON.stringify(publish.rejection));
  state = publish.value.state;
  const action = state.actions.find((a) => a.platformId === 'platform-video');
  const accepted = engine.reduce(state, ev({ kind: 'distribution-accepted', runId: RUN_ID, actionId: action?.actionId ?? '', bindingReceipt: 'b', transportReceipt: 't' }));
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.rejection));
  state = accepted.value.state;
  assert.equal(state.actions.find((a) => a.platformId === 'platform-video')?.status, 'accepted');
  // newsletter publish would cost 50 more (2 × 25) — 60 + 50 = 110 > 100 → projected halt
  const publish2 = engine.reduce(state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-3', phaseId: 'publish:platform-newsletter', payload: { contentRef: 'content://d/v1' } }));
  if (publish2.ok) {
    assert.equal(publish2.value.state.lifecycle, 'halted');
    assert.equal(publish2.value.state.halt?.reason, 'BUDGET_EXHAUSTED');
    assert.deepEqual(publish2.value.state.halt?.ledgerSnapshot, { spent: 60, ceiling: 100, currency: 'USD' });
    assert.deepEqual(publish2.value.effects, []);
  } else {
    assert.equal(publish2.rejection.name, 'ILLEGAL_TRANSITION');
    assert.ok(publish2.rejection.message.includes('halted'));
  }
});

test('distribution denial halts with the verbatim attribution and zero dispatch effects', async () => {
  const { engine, run } = await makeArmedRun();
  const publish = engine.reduce(run, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', payload: { contentRef: 'content://t/v2' } }));
  if (!publish.ok) throw new Error(JSON.stringify(publish.rejection));
  const action = publish.value.state.actions.find((a) => a.platformId === 'platform-video');
  const denied = engine.reduce(publish.value.state, ev({ kind: 'distribution-denied', runId: RUN_ID, actionId: action?.actionId ?? '', reason: 'policy: content banned', attribution: 'rights-authority#rule-7' }));
  assert.equal(denied.ok, true);
  if (!denied.ok) return;
  assert.equal(denied.value.state.lifecycle, 'halted');
  assert.equal(denied.value.state.halt?.reason, 'DISTRIBUTION_DENIED');
  if (denied.value.state.halt?.reason === 'DISTRIBUTION_DENIED') {
    assert.equal(denied.value.state.halt.attribution, 'rights-authority#rule-7');
  }
  assert.equal(denied.value.state.actions.find((a) => a.platformId === 'platform-video')?.status, 'denied');
  assert.deepEqual(denied.value.effects, []);
  // terminal: further events are refused
  const after = engine.reduce(denied.value.state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-9', phaseId: 'publish:platform-video', payload: { contentRef: 'x' } }));
  assert.equal(after.ok, false);
  if (!after.ok) assert.equal(after.rejection.name, 'ILLEGAL_TRANSITION');
});

test('max-steps exhaustion is a typed halt', async () => {
  const doubles = makeCompilerDoubles();
  const { engine, strategy } = await makeArmedRun(doubles);
  const created = engine.createRun(strategy, { runId: RUN_ID, tenantId: TENANT });
  if (!created.ok) throw new Error('createRun failed');
  const tiny: typeof created.value = { ...created.value, maxSteps: 1 };
  const armed = await engine.arm(tiny, { principal: 'p' });
  if (!armed.ok) throw new Error('arm failed');
  const first = engine.reduce(armed.value.state, ev({ kind: 'job-enqueued', runId: RUN_ID, jobId: 'j', phaseId: 'publish:platform-video' }));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = engine.reduce(first.value.state, ev({ kind: 'job-enqueued', runId: RUN_ID, jobId: 'j2', phaseId: 'publish:platform-video' }));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.state.lifecycle, 'halted');
  assert.equal(second.value.state.halt?.reason, 'MAX_STEPS_EXCEEDED');
});

test('job failure halts with the job attribution', async () => {
  const { engine, run } = await makeArmedRun();
  const failed = engine.reduce(run, ev({ kind: 'job-failed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video', reason: 'queue worker crashed', attribution: 'jobs-authority#worker-3' }));
  assert.equal(failed.ok, true);
  if (!failed.ok) return;
  assert.equal(failed.value.state.lifecycle, 'halted');
  assert.equal(failed.value.state.halt?.reason, 'JOB_FAILURE');
  if (failed.value.state.halt?.reason === 'JOB_FAILURE') {
    assert.equal(failed.value.state.halt.attribution, 'jobs-authority#worker-3');
  }
});

test('event run-id mismatch is a typed rejection', async () => {
  const { engine, run } = await makeArmedRun();
  const mismatch = engine.reduce(run, ev({ kind: 'job-enqueued', runId: 'other-run', jobId: 'j', phaseId: 'publish:platform-video' }));
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.rejection.name, 'EVENT_RUN_MISMATCH');
});

test('publish window without payload.contentRef refuses to fabricate one', async () => {
  const { engine, run } = await makeArmedRun();
  const noPayload = engine.reduce(run, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'publish:platform-video' }));
  assert.equal(noPayload.ok, false);
  if (!noPayload.ok) {
    assert.equal(noPayload.rejection.name, 'JOB_PAYLOAD_INVALID');
    assert.ok(noPayload.rejection.message.includes('contentRef'));
  }
});

test('unknown durable phase is refused', async () => {
  const { engine, run } = await makeArmedRun();
  const unknown = engine.reduce(run, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-1', phaseId: 'mystery:phase' }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.rejection.name, 'EVENT_UNKNOWN_TARGET');
});

test('duplicate measure-window completion is refused', async () => {
  const { engine, run } = await makeArmedRun();
  const once = engine.reduce(run, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-2', phaseId: 'measure:video-views' }));
  assert.equal(once.ok, true);
  if (!once.ok) return;
  const twice = engine.reduce(once.value.state, ev({ kind: 'job-completed', runId: RUN_ID, jobId: 'job-2b', phaseId: 'measure:video-views' }));
  assert.equal(twice.ok, false);
  if (!twice.ok) {
    assert.equal(twice.rejection.name, 'JOB_PAYLOAD_INVALID');
    assert.ok(twice.rejection.message.includes('duplicate'));
  }
});

test('deadline passed halts before the event applies', async () => {
  const doubles = makeCompilerDoubles();
  const { engine, strategy } = await makeArmedRun(doubles);
  const created = engine.createRun(strategy, { runId: RUN_ID, tenantId: TENANT });
  if (!created.ok) throw new Error('createRun failed');
  // deadline far in the past + haltOnPassed → the next reduce halts on entry
  const pastDeadline: typeof created.value = {
    ...created.value,
    deadline: { dueAt: '2020-01-01T00:00:00.000Z', haltOnPassed: true },
  };
  const armed = await engine.arm(pastDeadline, { principal: 'p' });
  if (!armed.ok) throw new Error('arm failed');
  const halted = engine.reduce(armed.value.state, ev({ kind: 'job-enqueued', runId: RUN_ID, jobId: 'j', phaseId: 'publish:platform-video' }));
  assert.equal(halted.ok, true);
  if (!halted.ok) return;
  assert.equal(halted.value.state.lifecycle, 'halted');
  assert.equal(halted.value.state.halt?.reason, 'DEADLINE_PASSED');
});
