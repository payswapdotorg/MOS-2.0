/**
 * §4.2 targeted tests — the MOS desktop shell SCROLL contract pinned in
 * mos-desktop-shell.css. The substrate pins html/body/#root to the viewport
 * (`height:100%` / `#root { height:100dvh; overflow:hidden }`), which clipped
 * every route taller than one screen; the rescue un-pins the document chain
 * so the document scrollbar carries the overflow. These tests pin that
 * contract textually (CSS has no runtime to assert under plain node --test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../../mos-desktop/mos-desktop-shell.css'), 'utf8');

test('the body scrolls (the document scrollbar carries overflow)', () => {
  assert.ok(/html\.mos-desktop-shell body\s*\{[^}]*overflow:\s*auto/.test(css), 'body must be overflow:auto');
});

test('html/body are un-pinned from the viewport (height:auto + min-height)', () => {
  const m = css.match(/html\.mos-desktop-shell,\s*\nhtml\.mos-desktop-shell body\s*\{[^}]*\}/s);
  assert.ok(m, 'the combined html+body block must exist');
  assert.ok(/height:\s*auto/.test(m[0]), 'height must be auto');
  assert.ok(/min-height:\s*100%/.test(m[0]), 'min-height must preserve the short-page shell');
});

test('#root never clips the shell column (the §4.2 root cause)', () => {
  const m = css.match(/html\.mos-desktop-shell #root\s*\{[^}]*\}/s);
  assert.ok(m, 'the #root block must exist');
  assert.ok(/height:\s*auto/.test(m[0]), '#root height must be auto (substrate pins 100dvh)');
  assert.ok(/overflow:\s*visible/.test(m[0]), '#root overflow must be visible (substrate sets hidden)');
  assert.ok(/min-height:\s*100dvh/.test(m[0]), '#root min-height keeps the short-page footer contract');
});

test('the pre-paint background is the opaque light shell token (no transparency flash)', () => {
  assert.ok(/background:\s*#f8fafc !important/.test(css), 'the opaque light bg must be pinned');
});
