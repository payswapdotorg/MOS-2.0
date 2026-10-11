import { describe, it, expect } from 'vitest';
import { groupActionsByPhase, groupActionsByPlatform } from '../../src/strategy-compiler/organization.js';
import { makePlan } from './fixtures.js';

describe('organization', () => {
  it('groups actions by phase id', () => {
    const plan = makePlan();
    const grouped = groupActionsByPhase(plan);
    expect(Object.keys(grouped)).toContain('phase-teaser');
  });

  it('groups actions by platform id', () => {
    const grouped = groupActionsByPlatform(makePlan());
    expect(grouped['platform-x'].length).toBe(1);
  });
});
