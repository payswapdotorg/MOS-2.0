import { describe, it, expect } from 'vitest';
import { reject, isRejection, REJECTION_KINDS } from '../../src/marketing-automation/rejections.js';

describe('rejections', () => {
  it('builds a rejection with kind, message, and timestamp', () => {
    const r = reject('run-not-found', 'no such run');
    expect(r.kind).toBe('run-not-found');
    expect(isRejection(r)).toBe(true);
  });

  it('registers all rejection kinds in the canonical set', () => {
    expect(REJECTION_KINDS).toContain('run-not-found');
    expect(REJECTION_KINDS).toContain('invalid-lifecycle-transition');
    expect(REJECTION_KINDS).toContain('budget-exhausted');
  });
});
