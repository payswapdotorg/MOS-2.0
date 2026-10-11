import { describe, it, expect } from 'vitest';
import { boundaryPinFor } from '../../src/marketing-automation/schedule.js';
import { makePlan } from './fixtures.js';

describe('boundary pinning', () => {
  it('pins a run window to the earliest phase boundary', () => {
    const pin = boundaryPinFor(makePlan());
    expect(pin.opensAt).toBe('2025-06-10T09:00:00.000Z');
    expect(pin.closesAt).toBe('2025-06-12T09:00:00.000Z');
  });

  it('produces deterministic pins for identical plans', () => {
    expect(boundaryPinFor(makePlan())).toEqual(boundaryPinFor(makePlan()));
  });
});
