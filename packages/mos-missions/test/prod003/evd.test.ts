import { describe, it, expect } from 'vitest';
import { evidenceForPlan, evidenceForRun } from '../../src/marketing-automation/evidence.js';
import { makePlan, makeRun } from './fixtures.js';

describe('evidence (EVD)', () => {
  it('derives evidence from a plan with content refs', () => {
    const evd = evidenceForPlan(makePlan());
    expect(evd.length).toBeGreaterThan(0);
  });

  it('derives evidence from a run lifecycle', () => {
    const evd = evidenceForRun(makeRun());
    expect(Array.isArray(evd)).toBe(true);
  });
});
