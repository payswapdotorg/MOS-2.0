/**
 * PROD-003 compat battery — the REAL upstream authorities via workspace
 * devDep links (the established compat pattern): @mos/agents (AGT-003 — the
 * compile target registry), @mos/jobs (JOBS-001 — the durable path the
 * automation runs ride), @mos/experiments (BRIDGE-003 — the evidence chain
 * the runs cite). Structural floor: each authority must resolve and expose a
 * non-empty runtime surface; precise name reconciliation happens through the
 * TL battery loop.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as agentsAuthority from '@mos/agents';
import * as jobsAuthority from '@mos/jobs';
import * as missionsBase from '../index.js';

// BRIDGE-003 edge, loaded through a NON-LITERAL specifier on purpose: a
// literal import would pull @mos/experiments' emitted declarations into this
// package's compilation, and those declarations (through their own relative
// dist imports) re-import THIS package's dist — a self-collision the
// composite build rejects as TS5055 ("would overwrite input file") whenever
// the missions ↔ experiments reference pair is rebuilt together. The
// non-literal specifier keeps the compile-time declaration graph acyclic
// while the runtime assertion below still exercises the REAL built dist
// artifact of the experiments authority (node resolves the same path).
const experimentsAuthoritySpecifier = '../../../mos-experiments/dist/index.js';
const experimentsAuthority = (await import(experimentsAuthoritySpecifier)) as Record<
  string,
  unknown
>;

function runtimeSurface(ns: object): string[] {
  return Object.keys(ns)
    .filter((key) => {
      const value = (ns as Record<string, unknown>)[key];
      return typeof value === 'function' || (typeof value === 'object' && value !== null) || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    })
    .sort();
}

test('@mos/agents resolves as the AGT-003 organization registry authority', () => {
  assert.ok(typeof agentsAuthority === 'object' && agentsAuthority !== null);
  const surface = runtimeSurface(agentsAuthority);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('@mos/jobs resolves as the JOBS-001 durable-path authority', () => {
  assert.ok(typeof jobsAuthority === 'object' && jobsAuthority !== null);
  const surface = runtimeSurface(jobsAuthority);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('@mos/experiments resolves as the BRIDGE-003 experiments authority', () => {
  assert.ok(typeof experimentsAuthority === 'object' && experimentsAuthority !== null);
  const surface = runtimeSurface(experimentsAuthority);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('the @mos/missions base surface still exports the MARKETING-001 planner API', () => {
  assert.ok(typeof missionsBase === 'object' && missionsBase !== null);
  const surface = runtimeSurface(missionsBase);
  assert.ok(surface.length >= 1, `expected a non-empty runtime surface, found: ${surface.join(',') || '(none)'}`);
});

test('the PROD-003 surface exports its engine and compiler entry points from the package root', () => {
  const surface = runtimeSurface(missionsBase);
  assert.ok(surface.includes('AutomationEngine'), 'AutomationEngine re-exported at the root');
  assert.ok(surface.includes('StrategyCompiler'), 'StrategyCompiler re-exported at the root');
  assert.ok(surface.includes('driveAutomation'), 'the durable host driver re-exported at the root');
});
