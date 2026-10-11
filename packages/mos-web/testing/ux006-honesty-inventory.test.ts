import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

/**
 * UX-006 honesty-inventory pins — the whole-shell acceptance suite's
 * inventory literals tied to the SOURCE label constants (the completeness
 * pin: no honesty law exists only in tests). Source scans read from the
 * package root (the out/ tests run with CWD there).
 */
const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const readSrc = (rel: string): string =>
  readFileSync(join(pkgRoot, rel), 'utf8');

test('ux006: orientation strip exports the five LOOP_STAGES in §2 loop order', () => {
  const src = readSrc('src/views/disclosure/loop-orientation.ts');
  const order = ['Intent', 'Creation', 'Verification', 'Connection', 'Evidence'];
  let cursor = -1;
  for (const stage of order) {
    const idx = src.indexOf(`'${stage}'`) >= 0 ? src.indexOf(`'${stage}'`) : src.indexOf(`"${stage}"`);
    assert.ok(idx !== -1, `stage "${stage}" missing from loop-orientation.ts`);
    assert.ok(idx > cursor, `stage "${stage}" out of loop order in loop-orientation.ts`);
    cursor = idx;
  }
});

test('ux006: loop stages map to the surfaces the acceptance pass visits', () => {
  const src = readSrc('src/views/disclosure/loop-orientation.ts');
  const targets: Record<string, string> = {
    Intent: 'missions',
    Creation: 'studio',
    Verification: 'lab',
    Connection: 'connections',
    Evidence: 'lab',
  };
  for (const [stage, target] of Object.entries(targets)) {
    const stageIdx = src.indexOf(stage);
    const targetIdx = src.indexOf(target, stageIdx === -1 ? 0 : stageIdx);
    assert.ok(targetIdx !== -1, `stage "${stage}" does not reference "/${target}"`);
  }
});

test('ux006: Lab label constants exist and carry the honesty vocabulary', () => {
  const src = readSrc('src/views/lab-presentation.ts');
  for (const name of ['LAB_COUNTERFACTUAL_LABEL', 'LAB_MEASURED_LABEL', 'LAB_BOUNDARY_NOTE']) {
    assert.ok(src.includes(name), `${name} missing from lab-presentation.ts`);
  }
  assert.ok(/counterfactual/i.test(src), 'counterfactual vocabulary missing');
  assert.ok(/measured/i.test(src), 'measured vocabulary missing');
});

test('ux006: Studio §14 vocabulary present in studio-presentation.ts', () => {
  const src = readSrc('src/views/studio-presentation.ts');
  assert.ok(/synthetic/i.test(src), '§14 synthetic provenance vocabulary missing');
  assert.ok(/consent/i.test(src), '§15 consent vocabulary missing');
});

test('ux006: Connections honesty sets present in surface-summaries.ts', () => {
  const src = readSrc('src/views/disclosure/surface-summaries.ts');
  assert.ok(/UNKNOWN/.test(src), 'UNKNOWN preservation missing from surface-summaries.ts');
  assert.ok(/platform-said|platform said/i.test(src), 'platform-said typing missing');
});

test('ux006: the smoke suite inventory matches the source label constants (completeness pin)', () => {
  const suite = readFileSync(resolve(pkgRoot, 'scripts/smoke-ux006-suite.cjs'), 'utf8');
  const lab = readSrc('src/views/lab-presentation.ts');
  // The suite's LAB inventory literals must appear in the source vocabulary.
  for (const lit of ['counterfactual', 'measured', 'boundary']) {
    assert.ok(new RegExp(lit, 'i').test(lab), `source Lab vocabulary lacks "${lit}"`);
    assert.ok(suite.includes(lit), `suite Lab inventory lacks "${lit}"`);
  }
  assert.ok(suite.includes('UNKNOWN'), 'suite Connections inventory lacks "UNKNOWN"');
});
