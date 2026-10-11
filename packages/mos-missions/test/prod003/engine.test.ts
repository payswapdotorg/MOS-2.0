import { describe, it, expect } from 'vitest';
import { marketingEngine } from '../../src/marketing-automation/engine.js';
import { makeRun } from './fixtures.js';

const baseState = { runs: [makeRun()] } as never;

describe('engine', () => {
  it('opens a publish window and dispatches pending actions', () => {
    const result = marketingEngine.onPublishWindow(baseState, {
      jobId: 'job-1',
      runId: 'run-0001',
      platformId: 'platform-x',
      contentRef: 'content://teaser/v2',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.effects.length).toBe(1);
    expect(result.value.effects[0].kind).toBe('dispatch-distribution');
    expect(result.value.run.lifecycle).toBe('running');
  });

  it('rejects a second window-open for the same platform', () => {
    const opened = makeRun({
      actions: [{ actionId: 'act-teaser-x', platformId: 'platform-x', channel: 'social-post', status: 'dispatched' }],
    });
    const result = marketingEngine.onPublishWindow({ runs: [opened] } as never, {
      jobId: 'job-2',
      runId: 'run-0001',
      platformId: 'platform-x',
      contentRef: 'content://teaser/v2',
    });
    expect(result.ok).toBe(false);
  });

  it('completes a run when all dispatched actions are delivered', () => {
    const running = makeRun({
      lifecycle: 'running',
      actions: [{ actionId: 'act-teaser-x', platformId: 'platform-x', channel: 'social-post', status: 'dispatched' }],
    });
    const result = marketingEngine.onDispatchOutcome({ runs: [running] } as never, {
      runId: 'run-0001',
      actionId: 'act-teaser-x',
      platformId: 'platform-x',
      outcome: 'delivered',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.run.lifecycle).toBe('completed');
  });
});
