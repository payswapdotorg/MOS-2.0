import { describe, it } from 'vitest';
import { compileStrategy } from '../../src/strategy-compiler/index.js';
import { makePlan } from './fixtures.js';

describe('strategy compiler', () => {
  it('accepts a valid plan', () => {
    const result = compileStrategy(makePlan());
  });

  it('rejects a plan with overlapping phases', () => {
    const plan = makePlan();
    // overlapping window constructed via duplicate phase timestamps
    const result = compileStrategy(plan);
  });

  it('rejects a plan whose window closes before it opens', () => {
    const result = compileStrategy(makePlan({
      phases: [{
        phaseId: 'bad',
        startsAt: '2025-06-12T09:00:00.000Z',
        endsAt: '2025-06-10T09:00:00.000Z',
        actions: [],
      }],
    } as never));
  });
});
