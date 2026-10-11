/**
 * PROD-002 compat battery — the REAL upstream authorities via workspace
 * devDep links (the established compat pattern). Structural floor only:
 * each authority must resolve and expose a non-empty runtime surface.
 * TYPE-level pins (JobQueuePort on '@mos/jobs', RealExperimentBinding on this
 * package's root) are enforced at compile time by src/prod002/compat-pins.ts.
 * Precise runtime-name assertions are tightened at TL iteration against the
 * live export lists (see the completion report's reconciliation points).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as jobsAuthority from '@mos/jobs';
import * as distributionAuthority from '@mos/distribution';
import * as missionsAuthority from '../../../mos-missions/dist/index.js';
import * as experimentsBase from '../index.js';

function runtimeSurface(ns: object): string[] {
  return Object.keys(ns)
    .filter((key) => {
      const value = (ns as Record<string, unknown>)[key];
      return typeof value === 'function' || typeof value === 'object' || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    })
    .sort();
}

test('@mos/jobs resolves as the real durable-path authority (JOBS-001)', () => {
  assert.ok(typeof jobsAuthority === 'object' && jobsAuthority !== null);
  const surface = runtimeSurface(jobsAuthority);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('@mos/distribution resolves as the real binding authority (PROD-001)', () => {
  assert.ok(typeof distributionAuthority === 'object' && distributionAuthority !== null);
  const surface = runtimeSurface(distributionAuthority);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('@mos/missions resolves as the real mission authority (MARKETING-001)', () => {
  assert.ok(typeof missionsAuthority === 'object' && missionsAuthority !== null);
  const surface = runtimeSurface(missionsAuthority);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('the package base surface (BRIDGE-003 RealExperimentBinding root) remains present', () => {
  assert.ok(typeof experimentsBase === 'object' && experimentsBase !== null);
  const surface = runtimeSurface(experimentsBase);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});
