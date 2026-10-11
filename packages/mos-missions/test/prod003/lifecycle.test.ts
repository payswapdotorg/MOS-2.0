import { describe, it, expect } from 'vitest';
import { canTransition, nextLifecycleStates } from '../../src/marketing-automation/lifecycle.js';

describe('lifecycle', () => {
  it('allows armed -> running', () => {
    expect(canTransition('armed', 'running')).toBe(true);
  });

  it('forbids completed -> running', () => {
    expect(canTransition('completed', 'running')).toBe(false);
  });

  it('lists legal successors for armed', () => {
    expect(nextLifecycleStates('armed')).toContain('running');
    expect(nextLifecycleStates('armed')).toContain('cancelled');
  });
});
