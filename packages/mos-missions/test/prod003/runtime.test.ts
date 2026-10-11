import { describe, it, expect } from 'vitest';
import { seedRuntime, fold } from '../../src/marketing-automation/runtime.js';
import { marketingEngine } from '../../src/marketing-automation/engine.js';
import { makeRun } from './fixtures.js';

describe('runtime fold', () => {
  it('seeds with runs and empty trail', () => {
    const state = seedRuntime([makeRun()]);
    expect(state.trail).toEqual([]);
    expect(state.runs.length).toBe(1);
  });

  it('folds a window-open transition into state with effects collected', () => {
    const initial = seedRuntime([makeRun()]);
    const outcome = fold(initial, [
      (state) => {
        const r = marketingEngine.onPublishWindow(state as never, {
          jobId: 'job-1',
          runId: 'run-0001',
          platformId: 'platform-x',
          contentRef: 'content://teaser/v2',
        });
        if (!r.ok) throw new Error(r.rejection.message);
        return r.value;
      },
    ]);
    expect(outcome.effects.length).toBe(1);
    expect(outcome.state.runs[0].lifecycle).toBe('running');
    expect(outcome.state.trail.length).toBeGreaterThan(0);
  });
});
