import { describe, it, expect } from 'vitest';
import { compareTimestamps, windowsOverlap } from '../../src/strategy-compiler/comparators.js';

describe('comparators', () => {
  it('orders timestamps lexicographically-safe for ISO-8601 UTC', () => {
    expect(compareTimestamps('2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z')).toBeLessThan(0);
  });

  it('detects overlapping windows', () => {
    expect(windowsOverlap(
      { opensAt: '2025-01-01T00:00:00.000Z', closesAt: '2025-01-02T00:00:00.000Z' },
      { opensAt: '2025-01-01T12:00:00.000Z', closesAt: '2025-01-03T00:00:00.000Z' },
    )).toBe(true);
  });

  it('does not flag adjacent windows as overlapping', () => {
    expect(windowsOverlap(
      { opensAt: '2025-01-01T00:00:00.000Z', closesAt: '2025-01-02T00:00:00.000Z' },
      { opensAt: '2025-01-02T00:00:00.000Z', closesAt: '2025-01-03T00:00:00.000Z' },
    )).toBe(false);
  });
});
