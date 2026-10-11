/**
 * PROD-003 boundary pins — the module-graph discipline of the new subtree.
 * The compiler/engine/adapter modules import ONLY from their own package
 * subtree (plus @mos/contracts where the planner already established the
 * seam): no direct cross-package runtime imports inside src (the authorities
 * arrive through ports), and no imports from outside the package root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const SUBTREE = [
  join(SRC, 'strategy-compiler'),
  join(SRC, 'marketing-automation'),
  join(SRC, 'authority-adapters'),
];

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g;

test('the PROD-003 subtree imports only in-package modules (ports, never direct cross-package runtime imports)', () => {
  const offenders: string[] = [];
  for (const subtree of SUBTREE) {
    for (const file of collectTsFiles(subtree)) {
      if (file.endsWith('.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(IMPORT_RE)) {
        const spec = match[1] ?? '';
        if (!spec.startsWith('.')) {
          // bare specifier: only the already-established contracts seam allowed
          if (spec !== '@mos/contracts') offenders.push(`${relative(SRC, file)} -> ${spec}`);
          continue;
        }
        const target = resolve(dirname(file), spec);
        const rel = relative(SRC, target);
        if (rel.startsWith('..')) offenders.push(`${relative(SRC, file)} -> ${spec} (escapes src/)`);
      }
    }
  }
  assert.deepEqual(offenders, [], `every import stays inside the package (offenders: ${offenders.join('; ')})`);
});

test('the engine performs no transport: no fetch/timers/process usage in src', () => {
  const banned = /\b(fetch\s*\(|setTimeout\s*\(|setInterval\s*\(|process\.env\b)/;
  for (const subtree of SUBTREE) {
    for (const file of collectTsFiles(subtree)) {
      if (file.endsWith('.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      assert.equal(banned.test(text), false, `${relative(SRC, file)} contains a banned runtime side-effect`);
    }
  }
});

test('the adapters gate never passes an action it cannot vouch for', async () => {
  const { gateDispatches } = await import('../authority-adapters/bind.js');
  const { bindLate } = await import('../authority-adapters/late-binding.js');
  const unknown = gateDispatches({ bindings: [], pendingActionIds: ['act-unknown'] });
  assert.deepEqual(unknown.allowed, []);
  assert.deepEqual(unknown.deferred, []);
  assert.deepEqual(unknown.blocked, ['act-unknown'], 'unknown actions are blocked, never silently passed');
  // a granted verdict on a known action is allowed
  const request = { runId: 'r', actionId: 'act-1', platformId: 'p', externalVerdicts: [] };
  const granted = bindLate(request);
  assert.equal(granted.verdict, 'granted');
  const gated = gateDispatches({ bindings: [request], pendingActionIds: ['act-1'] });
  assert.deepEqual(gated.allowed, ['act-1']);
  assert.equal(gated.decisions[0]?.verdict, 'granted');
});
