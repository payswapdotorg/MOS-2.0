/**
 * Theme-seed tests (WEB-001) — the pre-paint theme resolution pattern
 * ported from the audited web shell, with MOS tokens.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_DEFAULT_THEME,
  MOS_THEME_STORAGE_KEY,
  applyMosThemeToDocument,
  probePrefersDark,
  readStoredMosTheme,
  resolveMosInitialTheme,
} from '../dist/src/platform/theme-seed.js';

test('stored preference wins over default and probe', () => {
  assert.equal(resolveMosInitialTheme({ storedTheme: 'light', prefersDark: true }), 'light');
  assert.equal(resolveMosInitialTheme({ storedTheme: 'dark', prefersDark: false }), 'dark');
});

test("'system' resolves through the dark-mode probe", () => {
  assert.equal(resolveMosInitialTheme({ storedTheme: 'system', prefersDark: true }), 'dark');
  assert.equal(resolveMosInitialTheme({ storedTheme: 'system', prefersDark: false }), 'light');
  // Probe default (unavailable) resolves dark, matching the MOS default.
  assert.equal(resolveMosInitialTheme({ storedTheme: 'system' }), 'dark');
});

test('missing, corrupt or foreign stored values fall back to the default', () => {
  assert.equal(resolveMosInitialTheme({ storedTheme: null }), MOS_DEFAULT_THEME);
  assert.equal(resolveMosInitialTheme({ storedTheme: 'zai-dark' }), MOS_DEFAULT_THEME);
  assert.equal(resolveMosInitialTheme({ storedTheme: '' }), MOS_DEFAULT_THEME);
  assert.equal(resolveMosInitialTheme({ storedTheme: 'garbage', prefersDark: false }), MOS_DEFAULT_THEME);
});

test('the MOS theme tokens are the MOS naming, not the Zcode ones', () => {
  assert.equal(MOS_THEME_STORAGE_KEY, 'mos-theme');
  assert.equal(MOS_DEFAULT_THEME, 'dark');
});

test('readStoredMosTheme tolerates missing storage and storage failures', () => {
  assert.equal(readStoredMosTheme(null), null);
  assert.equal(readStoredMosTheme({ getItem: () => 'dark' }), 'dark');
  assert.equal(
    readStoredMosTheme({
      getItem: () => {
        throw new Error('privacy mode');
      },
    }),
    null,
  );
});

test('probePrefersDark defaults to dark when the probe is unavailable', () => {
  assert.equal(probePrefersDark(null), true);
  assert.equal(probePrefersDark({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(probePrefersDark({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(
    probePrefersDark({
      matchMedia: () => {
        throw new Error('no matchMedia');
      },
    }),
    true,
  );
});

test('applyMosThemeToDocument sets the MOS theme surface and tolerates no document', () => {
  const calls: string[] = [];
  const doc = {
    documentElement: {
      setAttribute: (name: string, value: string) => calls.push(`attr:${name}=${value}`),
      style: { setProperty: (name: string, value: string) => calls.push(`style:${name}=${value}`) },
      classList: {
        add: (cls: string) => calls.push(`add:${cls}`),
        remove: (cls: string) => calls.push(`remove:${cls}`),
      },
    },
  };
  applyMosThemeToDocument('dark', doc);
  assert.deepEqual(calls, ['attr:data-mos-theme=dark', 'style:color-scheme=dark', 'add:dark']);

  calls.length = 0;
  applyMosThemeToDocument('light', doc);
  assert.deepEqual(calls, ['attr:data-mos-theme=light', 'style:color-scheme=light', 'remove:dark']);

  // No document (tests / non-browser mounting): a no-op, never a throw.
  applyMosThemeToDocument('dark', null);
});
