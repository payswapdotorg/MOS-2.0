/**
 * §4.1 structural policy tests for desktopWindowChrome.ts — the file imports
 * electron at top level and cannot load under plain `node --test`, so these
 * tests pin the SOURCE CONTRACT textually (the same discipline the frozen
 * harness uses): the window-management guarantees the rescue requires.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chromeSource = readFileSync(join(here, '../src/main/desktopWindowChrome.ts'), 'utf8');

test('the visual options are DELEGATED to the pure policy module (no re-inlined platform blocks)', () => {
  assert.ok(
    chromeSource.includes('resolveDesktopWindowVisualOptions(process.platform)'),
    'buildDesktopWindowVisualOptions must delegate to desktopWindowVisualOptions.ts',
  );
  // The rescue-forbidden literals must NOT be re-inlined in the chrome module:
  assert.ok(
    !/frame:\s*false/.test(chromeSource),
    'the chrome module must not re-inline frame:false (win32 WCO lives in the pure policy)',
  );
  assert.ok(
    !/transparent:\s*true/.test(chromeSource),
    'the chrome module must not re-inline transparent:true',
  );
  assert.ok(
    !/hasShadow:\s*false/.test(chromeSource),
    'the chrome module must not re-inline hasShadow:false',
  );
  assert.ok(!/backgroundMaterial:\s*"acrylic"/.test(chromeSource), 'acrylic must live in the policy module only');
});

test('the window creation path never disables the native window-management booleans', () => {
  assert.ok(!/minimizable:\s*false/.test(chromeSource), 'minimizable must stay at the Electron default');
  assert.ok(!/maximizable:\s*false/.test(chromeSource), 'maximizable must stay at the Electron default');
  assert.ok(!/closable:\s*false/.test(chromeSource), 'closable must stay at the Electron default');
  assert.ok(!/resizable:\s*false/.test(chromeSource), 'resizable must stay at the Electron default');
});

test('no kiosk / fullscreen / alwaysOnTop launch posture in the chrome module', () => {
  assert.ok(!/kiosk:\s*true/.test(chromeSource), 'the app must not launch in kiosk mode');
  assert.ok(!/fullscreen:\s*true/.test(chromeSource), 'the app must not launch fullscreen');
  assert.ok(!/alwaysOnTop:\s*true/.test(chromeSource), 'the app must not launch always-on-top');
});

test('autoHideMenuBar is delegated to the Linux-scoped pure policy', () => {
  assert.ok(
    chromeSource.includes('resolveAutoHideMenuBar(process.platform)'),
    'autoHideMenuBar must be resolved through the pure policy (Linux-only)',
  );
});

test('win32 keeps its deliberate custom-controls registration (the WCO guard)', () => {
  assert.ok(
    /process\.platform === "win32"\) registerCustomWindowsControls\(win\)/.test(chromeSource),
    'the win32 custom window-controls overlay must still be registered',
  );
});
